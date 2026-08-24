'use strict';

/*
 * ioBroker.miele-local
 * Verbindet moderne Miele@Home-Geräte lokal ohne Internet (MieleH256/DOP2).
 */

const utils = require('@iobroker/adapter-core');
const { MieleCrypto } = require('./lib/crypto');
const { MieleDeviceApi } = require('./lib/api');
const { discover } = require('./lib/discovery');
const cloud = require('./lib/cloud');
const objdef = require('./lib/objects');
const namen = require('./lib/names');
const { MielePushListener } = require('./lib/push');
const enroll = require('./lib/enroll');
const dop2 = require('./lib/dop2');
const stats = require('./lib/stats');

// EcoFeedback: DOP2-Leaf 2/6195 (bislang nur Waschmaschinen liefern ihn).
// Feldindizes (1-based) empirisch gegen den Cloud-Adapter verifiziert (WCR860):
//   #25 = Energie in Wh (1991 ≈ Cloud 1,9 kWh), #40 = Wasser in 0,1 l (953 ≈ Cloud 96 l).
// Kann je Modell abweichen.
const ECO_LEAF = { unit: 2, attr: 6195 };
const ECO_ENERGY_IDX = 25; // Wh
const ECO_WATER_IDX = 40; // 0,1 l

// Sekundengenaue Zeiten aus DOP2-Leaf 2/256 (verifiziert: #7 Restzeit s, #8 Laufzeit s).
const SEC_LEAF = { unit: 2, attr: 256 };
/** Wartezeit, bevor ein Programm als beendet gilt - gegen kurzzeitige Statusaussetzer. */
const CYCLE_END_GRACE_MS = 3 * 60000;
const SEC_REMAINING_IDX = 7;
const SEC_ELAPSED_IDX = 8;

// DOP2 GLOBAL_USER_REQ (Steuerbefehle), Leaf 2/1583
const USER_REQ_PREFIX = Buffer.from('00100001062f00000000000100010700', 'hex');
const USER_REQ_UNIT = 2;
const USER_REQ_LEAF = 1583;
// Status-Werte, bei denen ein Gerät „aktiv" ist → schnelleres Polling
const ACTIVE_STATUSES = new Set([3, 4, 5, 6, 7, 9, 13, 14, 15]);

function buildUserRequest(opcode) {
    return Buffer.concat([USER_REQ_PREFIX, Buffer.from([opcode & 0xff]), Buffer.alloc(15, 0x20)]);
}

class MieleLocal extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'miele-local' });
        /** @type {Object.<string, {ip:string, route:string, deviceType:number, api:MieleDeviceApi, active:boolean}>} */
        this.devices = {};
        this.pollTimer = null;
        this.push = null;
        this.oauth = {}; // messageId → challenge
        this.stopping = false;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Namen der Instanzobjekte nachziehen.
     *
     * instanceObjects aus der io-package.json legt der Installer nur beim ERSTEN Mal an. Bei
     * einem Update bleiben sie unveraendert - eine bestehende Installation behielte also die
     * alten, einsprachigen Namen von info, info.connection und info.discoveredDevices, und der
     * Objektexport zeigte sie weiterhin. Deshalb werden sie hier bei jedem Start abgeglichen.
     */
    async aktualisiereInstanzObjekte() {
        const t = (de, en) => namen.text(de, en, true);
        const soll = {
            'info': t('Information', 'Information'),
            'info.connection': t('Gerät oder Dienst verbunden', 'Device or service connected'),
            'info.discoveredDevices': t('Gefundene Geräte (mDNS)', 'Discovered devices (mDNS)'),
        };
        for (const id of Object.keys(soll)) {
            try {
                await this.extendObjectAsync(id, { common: { name: soll[id] } });
            } catch (e) {
                this.log.debug(`Instance object ${id} not updated: ${e.message}`);
            }
        }
    }

    /**
     * Namen vorhandener EcoFeedback-Objekte abgleichen.
     *
     * Die eco-Punkte legt ensureEcoObjects an - aber nur, wenn ein Abruf Werte liefert.
     * Antwortet ein Geraet nicht mehr (alle drei hier melden inzwischen HTTP 500 bzw. 404),
     * bleiben vorhandene Punkte aus frueheren Versionen unberuehrt und behalten ihre alten
     * Namen. Gelöscht werden sie bewusst nicht, weil ihre Historie erhalten bleiben soll -
     * also werden sie hier wenigstens im Namen nachgezogen.
     */
    async aktualisiereEcoNamen(deviceId) {
        const german = this.config.germanNames !== false;
        const soll = {
            'eco': namen.SPRACHEN.reduce((o, sp) => (o[sp] = 'EcoFeedback', o), {}),
            'eco.energy': namen.text('Energieverbrauch', 'Energy consumption', german),
            'eco.energyWh': namen.text('Energieverbrauch (Rohwert Wh)', 'Energy consumption (raw Wh)', german),
            'eco.water': namen.text('Wasserverbrauch', 'Water consumption', german),
        };
        for (const sub of Object.keys(soll)) {
            const id = `${deviceId}.${sub}`;
            try {
                if (!(await this.getObjectAsync(id))) continue;
                await this.extendObjectAsync(id, { common: { name: soll[sub] } });
            } catch (e) {
                this.log.debug(`Eco object ${id} not updated: ${e.message}`);
            }
        }
    }

    async onReady() {
        await this.aktualisiereInstanzObjekte();
        await this.setStateAsync('info.connection', { val: false, ack: true });

        const groupId = this.config.groupId;
        const groupKey = this.config.groupKey;
        if (!groupId || !groupKey) {
            this.log.warn('No credentials found. Please sign in via the instance configuration to obtain a GroupKey.');
            return;
        }
        try {
            this.mc = new MieleCrypto(groupId, groupKey);
        } catch (e) {
            this.log.error(`Invalid GroupKey: ${e.message}`);
            return;
        }

        // Geräte ermitteln: Auto-Discovery und/oder manuelle IP-Liste
        await this.discoverDevices();

        if (!Object.keys(this.devices).length) {
            this.log.warn('No Miele devices found (neither via mDNS nor manually configured).');
        } else {
            await this.setStateAsync('info.connection', { val: true, ack: true });
        }

        // Periodisches Re-Discovery im Hintergrund (z. B. für Geräte, die aus dem Standby aufwachen)
        if (this.config.autoDiscover !== false) {
            const discInterval = Math.max(1, this.config.autoDiscoverInterval || 10) * 60 * 1000;
            this.discoveryTimer = this.setInterval(() => this.discoverDevices(), discInterval);
        }

        await this.subscribeStatesAsync('*.control.*');

        // Push-Listener + Enrollment
        if (this.config.usePush) {
            this.startPush();
            if (this.push) {
                await this.enrollAll();
                // Subscriptions laufen ab → periodisch erneuern
                this.enrollTimer = this.setInterval(() => this.enrollAll(), 4 * 60 * 1000);
            }
        }

        // Polling starten
        this.schedulePoll(true);

        // EcoFeedback (Energie/Wasser) per DOP2 – langsameres, separates Intervall
        if (this.config.ecoFeedback !== false) {
            this.pollEco();
            this.ecoTimer = this.setInterval(() => this.pollEco(), (this.config.ecoInterval || 60) * 1000);
        }

        // Sekundengenaue Rest-/Laufzeit per DOP2 2/256 – schneller 10s-Poll
        if (this.config.secondsTime !== false) {
            this.pollSeconds();
            this.secTimer = this.setInterval(() => this.pollSeconds(), (this.config.secondsInterval || 30) * 1000);
        }
    }

    async discoverDevices() {
        const groupId = this.config.groupId;
        if (!groupId || !this.mc) return;
        const found = [];
        const seenIp = new Set();
        if (this.config.autoDiscover !== false) {
            try {
                const list = await discover(6000, m => this.log.debug(m), this);
                for (const d of list) {
                    if (d.txt.group && d.txt.group.toUpperCase() !== groupId.toUpperCase()) continue;
                    found.push({ ip: d.ip, techType: d.techType, deviceType: Number(d.txt.devicetype) });
                    seenIp.add(d.ip);
                }
            } catch (e) {
                this.log.debug(`mDNS background discovery failed: ${e.message}`);
            }
        }
        for (const entry of this.config.devices || []) {
            const ip = typeof entry === 'string' ? entry : entry && entry.ip;
            if (ip && !seenIp.has(ip)) {
                found.push({ ip, techType: '', deviceType: null });
                seenIp.add(ip);
            }
        }

        if (found.length) {
            await this.setStateAsync('info.discoveredDevices', { val: JSON.stringify(found), ack: true });
        }

        for (const f of found) {
            const alreadyKnown = Object.values(this.devices).some(d => d.ip === f.ip);
            if (!alreadyKnown) {
                try {
                    await this.initDevice(f);
                    if (this.config.usePush && this.push) {
                        await this.enrollAll();
                    }
                } catch (e) {
                    this.log.debug(`Device at ${f.ip} could not be initialized: ${e.message}`);
                }
            }
        }
    }

    /** Gerät initialisieren: Route (Seriennr.) ermitteln, Objektbaum anlegen, Ident lesen. */
    async initDevice(f) {
        // 20 s statt 8: die Module antworten meist in 25 ms, waehrend eines laufenden Programms
        // aber auch mal erst nach 5-7 s. Mit dem knappen Zeitfenster fiel jede zehnte Abfrage aus,
        // obwohl das Geraet erreichbar war. Anfragen laufen ohnehin nacheinander (siehe api.js),
        // eine langsame Antwort blockiert also nichts ausser der eigenen Warteschlange.
        const api = new MieleDeviceApi(f.ip, this.mc, { timeout: 20000 });
        // Seriennummer(n) über signiertes /Devices/ ermitteln. Mehrere Versuche, weil ein
        // beschaeftigtes Geraet die erste Anfrage schon mal verfallen laesst - ohne
        // Wiederholung fiele es bis zur naechsten Hintergrundsuche komplett aus der Abfrage.
        let list = null;
        let letzterFehler = null;
        for (let versuch = 1; versuch <= 3; versuch++) {
            try {
                list = await api.get('Devices/');
                break;
            } catch (e) {
                letzterFehler = e;
                this.log.debug(`Device at ${f.ip}: attempt ${versuch}/3 failed (${e.message})`);
                if (versuch < 3) await new Promise(r => this.setTimeout(r, 2000));
            }
        }
        if (!list) throw letzterFehler || new Error('no answer');
        const routes = Object.keys(list || {});
        if (!routes.length) throw new Error('no device route found');

        for (const route of routes) {
            const deviceId = route.replace(/[^a-zA-Z0-9_-]/g, '_'); // Objekt-ID = sanitierte Seriennummer
            let ident = null;
            try {
                ident = await api.getIdent(route);
            } catch (e) {
                this.log.debug(`Could not read Ident for ${route}: ${e.message}`);
            }
            const deviceType = ident ? Number(ident.DeviceType) : f.deviceType;
            const techType = ident ? objdef.pathGet(ident, ['DeviceIdentLabel', 'TechType']) : f.techType;

            await this.createDeviceTree(deviceId, techType, deviceType);

            this.devices[deviceId] = { ip: f.ip, route, deviceType, api, active: false };
            await this.setStateAsync(`${deviceId}.info.connected`, { val: true, ack: true });
            if (ident) await this.applyIdent(deviceId, ident);
            const cat = objdef.deviceCategory(deviceType);
            this.log.info(`Device detected: ${cat ? cat + ' - ' : ''}${techType || 'unknown'} (${deviceId}) @ ${f.ip}`);
        }
    }

    async createDeviceTree(deviceId, techType, deviceType) {
        const cat = objdef.deviceCategory(deviceType);
        // Kategorie uebersetzt, Modell und Seriennummer unveraendert - siehe names.geraeteName.
        const label = namen.geraeteName(cat, techType, deviceId);
        await this.extendObjectAsync(deviceId, {
            type: 'device',
            common: { name: label },
            native: { serial: deviceId },
        });
        // Vorhandene EcoFeedback-Punkte im Namen nachziehen, auch wenn das Geraet sie nicht
        // mehr liefert - sonst bleiben sie fuer immer einsprachig.
        await this.aktualisiereEcoNamen(deviceId);
        // Kanäle
        for (const ch of ['info', 'state']) {
            // extendObject statt setObjectNotExists: Bestehende Installationen behalten sonst
            // ihre alten, einsprachigen Kanalnamen - genau die, die der Repository-Check
            // beanstandet hat.
            await this.extendObjectAsync(`${deviceId}.${ch}`, {
                type: 'channel',
                common: {
                    name: ch === 'info'
                        ? namen.text('Information', 'Information', true)
                        : namen.text('Zustand', 'State', true),
                },
                native: {},
            });
        }
        const german = this.config.germanNames !== false;
        // Ident-States (extendObject → Namen aktualisieren sich beim Umschalten der Sprache)
        for (const f of objdef.IDENT_FIELDS) {
            await this.extendObjectAsync(`${deviceId}.info.${f.sub}`, {
                type: 'state',
                common: {
                    name: objdef.nameFor('info', f.sub, f.name, german),
                    role: f.role,
                    type: f.type,
                    read: true,
                    write: false,
                    def: f.def !== undefined ? f.def : (f.type === 'number' ? 0 : f.type === 'boolean' ? false : ''),
                },
                native: {},
            });
        }
        // State-States (gerätespezifische Felder nur beim passenden Gerätetyp, siehe fieldAllowed)
        for (const key of Object.keys(objdef.STATE_FIELDS)) {
            if (!objdef.fieldAllowed(key, deviceType)) continue;
            for (const s of objdef.STATE_FIELDS[key].states) {
                await this.extendObjectAsync(`${deviceId}.state.${s.sub}`, {
                    type: 'state',
                    common: {
                        name: objdef.nameFor('state', s.sub, s.name, german),
                        role: s.role,
                        type: s.type,
                        unit: s.unit,
                        read: true,
                        write: false,
                        def: s.def !== undefined ? s.def : (s.type === 'number' ? 0 : s.type === 'boolean' ? false : ''),
                    },
                    native: {},
                });
            }
        }
        // Steuer-States (nur wenn erlaubt)
        if (this.config.allowControl) {
            await this.extendObjectAsync(`${deviceId}.control`, {
                type: 'channel',
                common: { name: namen.text('Steuerung', 'Control', true) },
                native: {},
            });
            for (const c of objdef.CONTROL_STATES) {
                await this.extendObjectAsync(`${deviceId}.control.${c.sub}`, {
                    type: 'state',
                    common: {
                        name: objdef.nameFor('control', c.sub, c.name, german),
                        role: c.role,
                        type: 'boolean',
                        read: false,
                        write: true,
                        def: c.def !== undefined ? c.def : false,
                    },
                    native: { opcode: c.opcode },
                });
            }
        }
    }

    async applyIdent(deviceId, ident) {
        for (const f of objdef.IDENT_FIELDS) {
            // "connected" steht in derselben Liste, damit das Objekt angelegt wird, stammt aber
            // nicht aus dem Ident-Datensatz und hat deshalb keinen Pfad. Ohne diese Zeile wirft
            // pathGet "path is not iterable" - und weil das die erste Runde ist, blieben ALLE
            // Gerätedaten leer: Modell, Seriennummer, Firmware.
            if (!f.path) continue;
            const val = objdef.pathGet(ident, f.path);
            if (val !== undefined) {
                await this.setStateAsync(`${deviceId}.info.${f.sub}`, { val: f.type === 'number' ? Number(val) : String(val), ack: true });
            }
        }
    }

    /** /State-Objekt in ioBroker-States übernehmen. */
    /**
     * Zustaende, aus denen ein Geraet nicht von einer Abfrage zur naechsten in "Aus" springt:
     * in Betrieb, Pause, Programm unterbrochen. Dazwischen liegt immer "Programm beendet" (7).
     */
    static get LAEUFT() { return [5, 6, 9]; }

    /**
     * Faengt den unmoeglichen Sprung "laeuft" -> "Aus" ab.
     *
     * Beobachtet am 23.08.2026 an der laufenden Waschmaschine: Nach einem Verbindungsabriss
     * ("read ECONNRESET") liefert das XKM-Modul im naechsten Versuch eine formal gueltige
     * Antwort mit Status 1 (Aus) und elapsedTime 0 - die Maschine wusch dabei weiter, und die
     * naechste Abfrage 30 s spaeter meldete wieder Status 5. Der Aussetzer ist nicht harmlos:
     * nachgeschaltete Skripte werten ihn als Programmende und setzen ihre Zykluszaehlung
     * zurueck (der Stromzaehler-Startwert sprang dadurch mitten im Waschgang auf den aktuellen
     * Stand, aus rund 100 Wh wurden 10).
     *
     * Deshalb: Ein solcher Sprung wird beim ersten Mal verworfen. Bestaetigt ihn die naechste
     * Abfrage, wird er uebernommen - ein echtes Abschalten kommt damit hoechstens einen
     * Abfragetakt spaeter an.
     */
    /**
     * So lange wird ein "Aus" hoechstens verworfen. Danach gilt es, auch wenn noch Restzeit
     * gemeldet war - sonst haenge die Anzeige fest, wenn jemand das Geraet mitten im Programm
     * am Schalter ausmacht.
     */
    static get AUS_VERDACHT_MAX_MS() { return 5 * 60 * 1000; }

    async statusPlausibel(deviceId, neu) {
        this._statusVerdacht = this._statusVerdacht || {};
        if (neu !== 1) {
            delete this._statusVerdacht[deviceId];
            return true;
        }
        const vorher = ((await this.getStateAsync(`${deviceId}.state.status`)) || {}).val;
        if (!MieleLocal.LAEUFT.includes(vorher)) return true;

        // Ein echtes Programmende laeuft ueber Status 7 und eine abgelaufene Restzeit. Meldet das
        // Geraet mitten im Programm "Aus", waehrend noch Zeit uebrig ist, glaubt der Adapter das
        // nicht sofort - am 23.08.2026 kam das an der laufenden Waschmaschine mehrfach je Stunde
        // vor, teils auch zweimal hintereinander (Shelly mass dabei 2200 W Heizleistung).
        // remainingMinutes, NICHT remainingSeconds: letzteres ist nur die Sekundenkomponente der
        // Anzeige (bei "2:01" steht dort 0), nicht die Gesamtrestzeit.
        const restMin = ((await this.getStateAsync(`${deviceId}.state.remainingMinutes`)) || {}).val || 0;
        const seit = this._statusVerdacht[deviceId] || Date.now();
        this._statusVerdacht[deviceId] = seit;
        const verstrichen = Date.now() - seit;
        if (restMin > 2 && verstrichen < MieleLocal.AUS_VERDACHT_MAX_MS) {
            this.log.info(`${deviceId}: Status ${vorher} (laeuft) -> 1 (Aus) bei ${restMin} min `
                + `Restzeit - verworfen (seit ${Math.round(verstrichen / 1000)} s)`);
            return false;
        }
        delete this._statusVerdacht[deviceId];
        if (restMin > 2) {
            this.log.warn(`${deviceId}: meldet seit ${Math.round(verstrichen / 1000)} s "Aus", obwohl noch `
                + `${restMin} min Restzeit gemeldet waren - wird jetzt uebernommen`);
        }
        return true;
    }

    async applyState(deviceId, state) {
        const dev = this.devices[deviceId];
        const ctx = { deviceType: dev ? dev.deviceType : null };
        // Unmoegliche Sprünge nach "Aus" gar nicht erst in die Datenpunkte lassen - sonst
        // schreiben Status, Restzeit und Laufzeit gemeinsam Unsinn (siehe statusPlausibel).
        if ('Status' in state && !(await this.statusPlausibel(deviceId, state.Status))) return;
        let statusVal = null;
        for (const [key, def] of Object.entries(objdef.STATE_FIELDS)) {
            if (!(key in state)) continue;
            if (!objdef.fieldAllowed(key, ctx.deviceType)) continue;
            const pairs = def.decode(state[key], ctx);
            for (const p of pairs) {
                // Liefert das Gerät nichts (Temperatur-Sentinel, abgeschaltete Zone), wird der
                // Datenpunkt NICHT beschrieben. Frueher stand dann null drin - der
                // Objektstruktur-Pruefer des ioBroker-Repos beanstandet das (E3005: val muss zu
                // common.type passen), und eine 0 waere schlimmer: 0 Grad ist ein plausibler
                // Messwert, "kein Wert" ist keiner. So bleibt der Vorgabewert bzw. der zuletzt
                // echte Stand erhalten.
                if (p.val === undefined || p.val === null) continue;
                await this.setStateAsync(`${deviceId}.state.${p.sub}`, { val: p.val, ack: true });
            }
            if (key === 'Status') statusVal = state.Status;
        }
        // Zeitvorwahl: das Geraet meldet nur die Restdauer bis zum Start ([7,20] = in 7:20).
        // Sie wird vor dem Programmende ausgewertet, denn wartet das Geraet noch, faengt die
        // Restzeit erst beim Start an zu laufen - das Ende liegt dann um die Vorwahl spaeter.
        //
        // Nur im Wartezustand: das Feld bleibt auch im laufenden Programm gefuellt (die
        // Waschmaschine meldete "in 0:17", waehrend sie spuelte). Ungeprueft uebernommen ergaebe
        // das eine Startzeit fuer ein laengst gestartetes Programm und ein um die Vorwahl zu
        // spaetes Ende. WARTEND = 3 (programmiert) und 4 (warten auf Start).
        let startMin = 0;
        if ('StartTime' in state) {
            const status = statusVal != null ? statusVal
                : ((await this.getStateAsync(`${deviceId}.state.status`)) || {}).val;
            const wartend = status === 3 || status === 4;
            startMin = wartend ? (objdef.timeToMinutes(state.StartTime) || 0) : 0;
            await this.ensureStartObjects(deviceId);
            if (startMin > 0) {
                const start = new Date(Date.now() + startMin * 60000);
                const hh = String(start.getHours()).padStart(2, '0');
                const mm = String(start.getMinutes()).padStart(2, '0');
                await this.setStateAsync(`${deviceId}.state.startTime`, { val: start.getTime(), ack: true });
                await this.setStateAsync(`${deviceId}.state.startTimeText`, { val: `${hh}:${mm}`, ack: true });
            } else {
                await this.setStateAsync(`${deviceId}.state.startTime`, { val: 0, ack: true });
                await this.setStateAsync(`${deviceId}.state.startTimeText`, { val: '', ack: true });
            }
        }
        // Voraussichtliches Programmende (wie mielecloudservice.estimatedEndTime): jetzt + Vorwahl
        // + Restzeit. Nur wenn eine Restzeit > 0 vorliegt; sonst leeren (kein laufendes Programm).
        // Rohantwort kennt keine Uhrzeit, daher hier berechnet. Minutengenau, das genuegt fuers Ende.
        if ('RemainingTime' in state) {
            const remMin = objdef.timeToMinutes(state.RemainingTime);
            if (remMin && remMin > 0) {
                const end = new Date(Date.now() + (startMin + remMin) * 60000);
                await this.setStateAsync(`${deviceId}.state.estimatedEndTime`, { val: end.getTime(), ack: true });
                const hh = String(end.getHours()).padStart(2, '0');
                const mm = String(end.getMinutes()).padStart(2, '0');
                await this.setStateAsync(`${deviceId}.state.estimatedEndTimeText`, { val: `${hh}:${mm}`, ack: true });
            } else {
                // 0 statt null: der Datenpunkt ist als number deklariert, und "kein laufendes
                // Programm" muss hier ausdrueckbar bleiben - anders als bei den Temperaturen
                // waere ein stehengebliebenes altes Programmende irrefuehrend.
                await this.setStateAsync(`${deviceId}.state.estimatedEndTime`, { val: 0, ack: true });
                await this.setStateAsync(`${deviceId}.state.estimatedEndTimeText`, { val: '', ack: true });
            }
        }

        if (dev && statusVal != null) {
            await this.trackCycle(deviceId, statusVal);
            dev.active = ACTIVE_STATUSES.has(statusVal);
        }
    }

    /**
     * Zyklushistorie fuehren.
     *
     * Das Geraet selbst hebt abgeschlossene Programme nicht auf - der Zyklenzaehler in DOP2
     * 2/138 liefert bei den hier geprueften XKM-Modulen durchgaengig 0, und 2/119 laesst sich
     * keiner Einheit zuordnen (Waschmaschine 6688, Spuelmaschine 434006). Der Adapter zaehlt
     * deshalb selbst: ab dem Start eines Programms wird gemerkt, was laeuft, und beim Uebergang
     * in einen Endzustand ein Eintrag geschrieben. Genau dann stehen auch die Eco-Werte final
     * da - waehrend des Programms meldet die Waschmaschine dort 0.
     */
    async trackCycle(deviceId, statusVal) {
        if (this.config.cycleHistory === false) return;
        if (!this._cycles) this._cycles = {};
        const laeuft = statusVal === 5 || statusVal === 6;
        let offen = this._cycles[deviceId];

        // Nach einem Neustart ist der offene Zyklus weg, das Programm laeuft aber weiter. Ohne
        // Wiederaufnahme begann die Zaehlung von vorn: am 22.08.2026 stand im Verlauf
        // "1 Minute, 1,854 kWh" - erfasst war nur die letzte Minute eines mehrstuendigen
        // Waschgangs, weil der Adapter zwischendurch neu gestartet war.
        //
        // Der Startzeitpunkt kommt aus zwei Quellen: bevorzugt aus der Laufzeit, die das Geraet
        // selbst meldet (die stimmt auch, wenn der Adapter waehrend des Programms erst gestartet
        // wurde), ersatzweise aus dem gemerkten Datenpunkt.
        if (laeuft && !offen) {
            let start = null;
            const gelaufen = await this.getStateAsync(`${deviceId}.state.elapsedMinutes`);
            if (gelaufen && typeof gelaufen.val === 'number' && gelaufen.val > 0) {
                start = Date.now() - gelaufen.val * 60000;
            } else {
                const gemerkt = await this.getStateAsync(`${deviceId}.history.laufendSeit`);
                if (gemerkt && typeof gemerkt.val === 'number' && gemerkt.val > 0) start = gemerkt.val;
            }
            if (start) {
                this._cycles[deviceId] = { start };
                offen = this._cycles[deviceId];
                await this.ensureHistoryObjects(deviceId);
                await this.setStateAsync(`${deviceId}.history.laufendSeit`, { val: start, ack: true });
                this.log.debug(`Zyklus von ${deviceId} fortgesetzt `
                    + `(laeuft seit ${new Date(start).toLocaleString()})`);
            }
        }

        if (laeuft) {
            if (!offen) {
                // Den Eco-Stand beim Start festhalten: Nur wenn er sich bis zum Ende aendert,
                // ist er eine Messung dieses Zyklus und keine Altlast (siehe finishCycle).
                const stand = async id => {
                    const v = await this.getStateAsync(id);
                    return v && typeof v.val === 'number' ? v.val : null;
                };
                this._cycles[deviceId] = {
                    start: Date.now(),
                    ecoEnergieStart: await stand(`${deviceId}.eco.energy`),
                    ecoWasserStart: await stand(`${deviceId}.eco.water`),
                };
                await this.ensureHistoryObjects(deviceId);
                await this.setStateAsync(`${deviceId}.history.laufendSeit`,
                    { val: this._cycles[deviceId].start, ack: true });
            } else if (offen.endeSeit) {
                // War nur ein Aussetzer - das Geraet meldete kurz "Aus" und laeuft weiter.
                delete offen.endeSeit;
            }
            // Programmtext erst merken, wenn er vorliegt - beim Start ist er oft noch leer.
            const p = await this.getStateAsync(`${deviceId}.state.programText`);
            const t = await this.getStateAsync(`${deviceId}.state.programTypeText`);
            if (p && p.val) this._cycles[deviceId].program = p.val;
            if (t && t.val) this._cycles[deviceId].programType = t.val;
            return;
        }

        if (!offen) return;                       // war schon vorher aus

        // Nicht beim ersten "nicht mehr in Betrieb" buchen: die Waschmaschine meldete am
        // 21.08.2026 mitten im Schleudern eine Minute lang "Aus" und lief danach weiter. Ohne
        // Karenzzeit waere daraus ein abgeschlossener plus ein neuer Zyklus geworden.
        if (!offen.endeSeit) {
            offen.endeSeit = Date.now();
            return;
        }
        if (Date.now() - offen.endeSeit < CYCLE_END_GRACE_MS) return;

        delete this._cycles[deviceId];
        await this.setStateAsync(`${deviceId}.history.laufendSeit`, { val: 0, ack: true });
        // Als Ende gilt der Zeitpunkt, an dem das Geraet zuerst nicht mehr lief - nicht das
        // Ende der Karenzzeit.
        const ende = offen.endeSeit;
        // Sehr kurze "Zyklen" sind meist ein Fehlstart oder ein Statusflackern beim Einschalten.
        const dauerS = Math.round((ende - offen.start) / 1000);
        if (dauerS < 60) return;

        // EcoFeedback nur uebernehmen, wenn es sich seit dem letzten Zyklus geaendert hat.
        //
        // Nicht jedes Geraet fuehrt die Werte waehrend des Programms nach: Die Waschmaschine
        // WCR860 beantwortet den Eco-Leaf mal mit HTTP 404, mal mit 500, und der zuletzt
        // gelesene Wert bleibt dann einfach stehen. Am 24.08.2026 standen deshalb zwei
        // voellig verschiedene Programme (Baumwolle 214 min, Pflegeleicht 162 min) mit
        // identischen 95,3 l in der Historie - der Wert stammte in Wahrheit aus einem
        // Waschgang funf Tage zuvor. Ein unveraenderter Wert ist keine Messung, sondern ein
        // Ueberbleibsel; er gehoert nicht in die Zyklusbilanz.
        const zahl = async id => { const v = await this.getStateAsync(id); return v && typeof v.val === 'number' ? v.val : null; };
        const frisch = async (id, vorher) => {
            const wert = await zahl(id);
            if (wert == null) return null;
            if (vorher != null && wert === vorher) {
                this.log.debug(`${deviceId}: ${id.split('.').pop()} steht unveraendert auf ${wert} `
                    + '- nicht als Zyklusverbrauch uebernommen');
                return null;
            }
            return wert;
        };
        const eintrag = {
            start: offen.start,
            ende,
            dauerS,
            program: offen.program || null,
            programType: offen.programType || null,
            energyKwh: await frisch(`${deviceId}.eco.energy`, offen.ecoEnergieStart),
            waterL: await frisch(`${deviceId}.eco.water`, offen.ecoWasserStart),
        };
        await this.appendCycle(deviceId, eintrag);
    }

    /** Haengt einen Zyklus an Ringpuffer und Summen an und schreibt ihn in die Historie. */
    async appendCycle(deviceId, eintrag) {
        await this.ensureHistoryObjects(deviceId);

        const ring = Math.max(1, this.config.cycleRingSize || 50);
        const tage = Math.max(1, this.config.historyDays || 730);
        const grenze = Date.now() - tage * 86400000;

        let liste = [];
        const alt = await this.getStateAsync(`${deviceId}.history.cyclesJson`);
        try { liste = JSON.parse(alt && alt.val) || []; } catch (e) { liste = []; }
        liste.unshift(eintrag);
        liste = liste.filter(e => e && e.ende >= grenze).slice(0, ring);
        await this.setStateAsync(`${deviceId}.history.cyclesJson`, { val: JSON.stringify(liste), ack: true });

        // Summen laufen unabhaengig vom Ringpuffer weiter - sie sollen nicht schrumpfen,
        // wenn alte Eintraege herausfallen.
        for (const [sub, wert] of [['cycleCount', 1], ['energyTotal', eintrag.energyKwh || 0],
            ['waterTotal', eintrag.waterL || 0], ['runtimeHours', eintrag.dauerS / 3600]]) {
            const v = await this.getStateAsync(`${deviceId}.history.${sub}`);
            const bisher = v && typeof v.val === 'number' ? v.val : 0;
            const neu = sub === 'cycleCount' ? bisher + 1 : Math.round((bisher + wert) * 1000) / 1000;
            await this.setStateAsync(`${deviceId}.history.${sub}`, { val: neu, ack: true });
        }

        // Zusaetzlich in history.0, damit sich spaeter Diagramme ueber beliebige Zeitraeume
        // bauen lassen, ohne dass der Ringpuffer alles tragen muss. Zeitstempel ist das
        // Zyklusende, nicht der Schreibzeitpunkt.
        const instanz = this.config.historyInstance || 'history.0';
        if (this.config.historyWrite !== false) {
            for (const [sub, wert] of [['energyKwh', eintrag.energyKwh], ['waterL', eintrag.waterL],
                ['durationMin', Math.round(eintrag.dauerS / 60)]]) {
                if (wert == null) continue;
                this.sendTo(instanz, 'storeState', {
                    id: `${this.namespace}.${deviceId}.history.${sub}`,
                    state: { val: wert, ts: eintrag.ende, ack: true },
                });
            }
        }
        await this.updateStats(deviceId, eintrag);
        this.log.info(`Cycle recorded (${deviceId}): ${eintrag.program || 'unknown program'}, `
            + `${Math.round(eintrag.dauerS / 60)} min, ${eintrag.energyKwh ?? '-'} kWh, ${eintrag.waterL ?? '-'} l`);
    }

    /**
     * Kennzahlen je Zeitraum und Programm fortschreiben - dasselbe, was die Hersteller-App
     * zeigt: Verbrauch pro Programm, Programmnutzung und der Vergleich mit dem Vorzeitraum.
     * Der Zustand liegt im Geraeteobjekt, damit er einen Neustart uebersteht.
     */
    async updateStats(deviceId, eintrag) {
        const obj = await this.getObjectAsync(deviceId);
        const vorher = obj && obj.native && obj.native.stats;
        const stand = stats.verbuchen(vorher, eintrag);
        await this.extendObjectAsync(deviceId, { native: { stats: stand } });

        const a = stats.ausgabe(stand);
        await this.ensureStatsObjects(deviceId);
        for (const zeitraum of ['week', 'month', 'year']) {
            const z = a[zeitraum];
            for (const [sub, wert] of Object.entries({
                cycles: z.cycles, energy: z.energy, water: z.water, runtimeHours: z.runtimeHours,
                avgEnergy: z.avgEnergy, avgWater: z.avgWater,
                prevCycles: z.prevCycles, prevEnergy: z.prevEnergy, prevWater: z.prevWater,
                prevAvgEnergy: z.prevAvgEnergy, prevAvgWater: z.prevAvgWater,
            })) {
                // null nur bei Mittelwerten ohne Grundlage - dann den Datenpunkt auslassen,
                // damit keine 0 als gemessener Wert erscheint.
                if (wert === null) continue;
                await this.setStateAsync(`${deviceId}.stats.${zeitraum}.${sub}`, { val: wert, ack: true });
            }
            if (z.key) await this.setStateAsync(`${deviceId}.stats.${zeitraum}.period`, { val: z.key, ack: true });
            if (z.prevKey) await this.setStateAsync(`${deviceId}.stats.${zeitraum}.prevPeriod`, { val: z.prevKey, ack: true });
            // Je Zeitraum eine eigene Programmliste - sonst liesse sich in der Anzeige nicht
            // zwischen Monat und Jahr umschalten, ohne alles neu zu rechnen.
            await this.setStateAsync(`${deviceId}.stats.${zeitraum}.programsJson`,
                { val: JSON.stringify(z.programs || []), ack: true });
        }
        await this.setStateAsync(`${deviceId}.stats.programsJson`, { val: JSON.stringify(a.programs), ack: true });
        // Alle Monate und Jahre einzeln - damit sich in der Anzeige ein bestimmter Zeitraum
        // waehlen laesst, nicht nur der laufende und der davor.
        await this.setStateAsync(`${deviceId}.stats.monthsJson`, { val: JSON.stringify(a.months), ack: true });
        await this.setStateAsync(`${deviceId}.stats.yearsJson`, { val: JSON.stringify(a.years), ack: true });
        for (const [sub, wert] of Object.entries(a.total)) {
            if (wert === null) continue;
            await this.setStateAsync(`${deviceId}.stats.total.${sub}`, { val: wert, ack: true });
        }
    }

    async ensureStartObjects(deviceId) {
        if (!this._startCreated) this._startCreated = {};
        if (this._startCreated[deviceId]) return;
        const de = this.config.germanNames !== false;
        await this.extendObjectAsync(`${deviceId}.state.startTime`, {
            type: 'state',
            common: { name: namen.text('Startzeit (Zeitstempel)', 'Start time (timestamp)', de),
                type: 'number', role: 'date', def: 0, read: true, write: false },
            native: {},
        });
        await this.extendObjectAsync(`${deviceId}.state.startTimeText`, {
            type: 'state',
            common: { name: namen.text('Startzeit', 'Start time', de), type: 'string', role: 'text',
                def: '', read: true, write: false },
            native: {},
        });
        this._startCreated[deviceId] = true;
    }

    /**
     * Datenpunkte fuer die Abfragestatistik.
     *
     * Die Poll-Fehler landeten bisher nur in log.debug - im Normalbetrieb also nirgends. Dass
     * die Waschmaschine zeitweise jede zweite Abfrage verwarf, liess sich deshalb nur mit einer
     * eigens laufenden Messung zeigen. Die Quote steht jetzt dauerhaft am Geraet.
     */
    async ensureDiagObjects(deviceId) {
        if (!this._diagCreated) this._diagCreated = {};
        if (this._diagCreated[deviceId]) return;
        const de = this.config.germanNames !== false;
        const felder = [
            ['pollErrorRate', namen.text('Fehlerquote der Abfragen', 'Polling error rate', de), 'number', 'value', '%', 0],
            ['pollErrors', namen.text('Fehlerhafte Abfragen (1 h)', 'Failed polls (1 h)', de), 'number', 'value', '', 0],
            ['pollTotal', namen.text('Abfragen (1 h)', 'Polls (1 h)', de), 'number', 'value', '', 0],
            ['pollRetries', namen.text('Erst im zweiten Versuch geglückt (1 h)',
                'Succeeded on retry (1 h)', de), 'number', 'value', '', 0],
            ['lastError', namen.text('Letzter Abfragefehler', 'Last polling error', de), 'string', 'text', '', ''],
        ];
        for (const [sub, name, type, role, unit, def] of felder) {
            await this.extendObjectAsync(`${deviceId}.info.${sub}`, {
                type: 'state',
                common: { name, type, role, unit: unit || undefined, def, read: true, write: false },
                native: {},
            });
        }
        this._diagCreated[deviceId] = true;
    }

    /**
     * Eine Abfrage verbuchen und die Quote fortschreiben.
     *
     * Gezaehlt wird ueber ein gleitendes Fenster von einer Stunde: eine Gesamtquote seit
     * Adapterstart wuerde eine laengst behobene Stoerung noch tagelang mitschleppen.
     */
    /**
     * Haelt fest, wie der Statusabruf ausgegangen ist - gleitendes Fenster ueber eine Stunde.
     *
     * [erholt] = erst der zweite Versuch hat geklappt. Das zaehlt bewusst NICHT als Fehler (die
     * Daten sind ja da), wird aber getrennt ausgewiesen: Nur so bleibt sichtbar, wie oft ein
     * Geraet zickt, ohne dass die Fehlerquote Alarm schlaegt, obwohl nichts fehlt.
     */
    async verbucheAbfrage(deviceId, fehler, erholt = false) {
        if (!this._diag) this._diag = {};
        const d = (this._diag[deviceId] = this._diag[deviceId] || { versuche: [] });
        const jetzt = Date.now();
        d.versuche.push({ ts: jetzt, fehler: fehler ? fehler.message : null, erholt });
        const grenze = jetzt - 3600000;
        while (d.versuche.length && d.versuche[0].ts < grenze) d.versuche.shift();

        const gesamt = d.versuche.length;
        const schlecht = d.versuche.filter(v => v.fehler).length;
        const erholte = d.versuche.filter(v => v.erholt).length;
        await this.ensureDiagObjects(deviceId);
        await this.setStateAsync(`${deviceId}.info.pollTotal`, { val: gesamt, ack: true });
        await this.setStateAsync(`${deviceId}.info.pollErrors`, { val: schlecht, ack: true });
        await this.setStateAsync(`${deviceId}.info.pollRetries`, { val: erholte, ack: true });
        await this.setStateAsync(`${deviceId}.info.pollErrorRate`, {
            val: gesamt ? Math.round((schlecht / gesamt) * 1000) / 10 : 0, ack: true,
        });
        if (fehler) {
            const t = new Date(jetzt);
            const hh = String(t.getHours()).padStart(2, '0');
            const mm = String(t.getMinutes()).padStart(2, '0');
            const ss = String(t.getSeconds()).padStart(2, '0');
            await this.setStateAsync(`${deviceId}.info.lastError`,
                { val: `${hh}:${mm}:${ss} ${fehler.message}`, ack: true });
        }
    }

    async ensureStatsObjects(deviceId) {
        if (!this._statsCreated) this._statsCreated = {};
        if (this._statsCreated[deviceId]) return;
        const de = this.config.germanNames !== false;
        const NAME = {
            week: namen.text('Woche', 'Week', de), month: namen.text('Monat', 'Month', de), year: namen.text('Jahr', 'Year', de),
            total: namen.text('Gesamt', 'Total', de),
        };
        const FELD = {
            cycles: [namen.text('Programme', 'Cycles', de), '', 'value'],
            energy: [namen.text('Energie', 'Energy', de), 'kWh', 'value.power.consumption'],
            water: [namen.text('Wasser', 'Water', de), 'l', 'value.volume'],
            runtimeHours: [namen.text('Laufzeit', 'Runtime', de), 'h', 'value.interval'],
            avgEnergy: [namen.text('Energie je Programm', 'Energy per cycle', de), 'kWh', 'value.power.consumption'],
            avgWater: [namen.text('Wasser je Programm', 'Water per cycle', de), 'l', 'value.volume'],
            prevCycles: [namen.text('Programme (Vorzeitraum)', 'Cycles (previous)', de), '', 'value'],
            prevEnergy: [namen.text('Energie (Vorzeitraum)', 'Energy (previous)', de), 'kWh', 'value.power.consumption'],
            prevWater: [namen.text('Wasser (Vorzeitraum)', 'Water (previous)', de), 'l', 'value.volume'],
            prevAvgEnergy: [namen.text('Energie je Programm (Vorzeitraum)', 'Energy per cycle (previous)', de), 'kWh', 'value.power.consumption'],
            prevAvgWater: [namen.text('Wasser je Programm (Vorzeitraum)', 'Water per cycle (previous)', de), 'l', 'value.volume'],
        };
        await this.extendObjectAsync(`${deviceId}.stats`, {
            type: 'channel', common: { name: namen.text('Auswertung', 'Statistics', de) }, native: {},
        });
        for (const zeitraum of ['week', 'month', 'year', 'total']) {
            await this.extendObjectAsync(`${deviceId}.stats.${zeitraum}`, {
                type: 'channel', common: { name: NAME[zeitraum] }, native: {},
            });
            const felder = zeitraum === 'total'
                ? ['cycles', 'energy', 'water', 'runtimeHours', 'avgEnergy', 'avgWater']
                : Object.keys(FELD);
            for (const sub of felder) {
                const [name, einheit, rolle] = FELD[sub];
                await this.extendObjectAsync(`${deviceId}.stats.${zeitraum}.${sub}`, {
                    type: 'state',
                    common: { name, type: 'number', role: rolle, unit: einheit || undefined,
                        def: 0, read: true, write: false },
                    native: {},
                });
            }
            if (zeitraum !== 'total') {
                await this.extendObjectAsync(`${deviceId}.stats.${zeitraum}.programsJson`, {
                    type: 'state',
                    common: { name: namen.text('Verbrauch je Programm (JSON)', 'Consumption per program (JSON)', de),
                        type: 'string', role: 'json', def: '[]', read: true, write: false },
                    native: {},
                });
                for (const [sub, name] of [['period', namen.text('Zeitraum', 'Period', de)],
                    ['prevPeriod', namen.text('Vorzeitraum', 'Previous period', de)]]) {
                    await this.extendObjectAsync(`${deviceId}.stats.${zeitraum}.${sub}`, {
                        type: 'state',
                        common: { name, type: 'string', role: 'text', def: '', read: true, write: false },
                        native: {},
                    });
                }
            }
        }
        await this.extendObjectAsync(`${deviceId}.stats.programsJson`, {
            type: 'state',
            common: { name: namen.text('Verbrauch je Programm (JSON)', 'Consumption per program (JSON)', de),
                type: 'string', role: 'json', def: '[]', read: true, write: false },
            native: {},
        });
        for (const [sub, name] of [
            ['monthsJson', namen.text('Monate einzeln (JSON)', 'Individual months (JSON)', de)],
            ['yearsJson', namen.text('Jahre einzeln (JSON)', 'Individual years (JSON)', de)],
        ]) {
            await this.extendObjectAsync(`${deviceId}.stats.${sub}`, {
                type: 'state',
                common: { name, type: 'string', role: 'json', def: '[]', read: true, write: false },
                native: {},
            });
        }
        this._statsCreated[deviceId] = true;
    }

    async ensureHistoryObjects(deviceId) {
        if (!this._histCreated) this._histCreated = {};
        if (this._histCreated[deviceId]) return;
        const de = this.config.germanNames !== false;
        await this.extendObjectAsync(`${deviceId}.history`, {
            type: 'channel', common: { name: namen.text('Verlauf', 'History', de) }, native: {},
        });
        const defs = [
            ['cyclesJson', namen.text('Letzte Programme (JSON)', 'Recent cycles (JSON)', de), 'string', 'json', '', '[]'],
            ['cycleCount', namen.text('Programme gesamt', 'Cycles total', de), 'number', 'value', '', 0],
            ['runtimeHours', namen.text('Laufzeit gesamt', 'Runtime total', de), 'number', 'value.interval', 'h', 0],
            ['energyTotal', namen.text('Energie gesamt', 'Energy total', de), 'number', 'value.power.consumption', 'kWh', 0],
            ['waterTotal', namen.text('Wasser gesamt', 'Water total', de), 'number', 'value.volume', 'l', 0],
            ['energyKwh', namen.text('Energie je Programm', 'Energy per cycle', de), 'number', 'value.power.consumption', 'kWh', 0],
            ['waterL', namen.text('Wasser je Programm', 'Water per cycle', de), 'number', 'value.volume', 'l', 0],
            ['durationMin', namen.text('Dauer je Programm', 'Duration per cycle', de), 'number', 'value.interval', 'min', 0],
            // Startzeitpunkt des laufenden Programms - er ueberlebt einen Neustart des Adapters,
            // damit die Zyklusdauer danach nicht von vorn zaehlt (siehe trackCycle).
            ['laufendSeit', namen.text('Laufendes Programm seit', 'Current cycle started', de), 'number', 'date', '', 0],
        ];
        for (const [sub, name, typ, rolle, einheit, def] of defs) {
            await this.extendObjectAsync(`${deviceId}.history.${sub}`, {
                type: 'state',
                common: { name, type: typ, role: rolle, unit: einheit || undefined, def, read: true, write: false },
                native: {},
            });
        }
        this._histCreated[deviceId] = true;
    }

    schedulePoll(immediate = false) {
        if (this.pollTimer) this.clearTimeout(this.pollTimer);
        const anyActive = Object.values(this.devices).some(d => d.active);
        const interval = (anyActive ? this.config.activePollInterval || 5 : this.config.pollInterval || 15) * 1000;
        const run = async () => {
            if (this.stopping) return;
            await this.pollAll();
            this.schedulePoll(false);
        };
        const nextDelayMs = immediate ? 100 : interval;
        // Nach einem Schreibbefehl kurz pausieren (Gerät bearbeitet nur eine Anfrage,
        // und der neue Zustand steht erst nach kurzer Zeit im /State).
        const effective = Math.max(nextDelayMs, (this.pausePollUntil || 0) - Date.now());
        this.pollTimer = this.setTimeout(run, effective);
    }

    /**
     * Wie oft ein Gerät den Eco-Leaf verneinen muss, bevor der Adapter aufhört zu fragen.
     *
     * Vorher fragte er unbeirrt weiter: an einem Vormittag 651 Absagen vom Backofen (HTTP 404)
     * und 651 von der Spülmaschine (HTTP 500) - für Werte, die diese Modelle gar nicht führen.
     * Jede Anfrage belegt das XKM-Modul, das ohnehin nur eine gleichzeitig beantwortet.
     *
     * Mehrfach und nicht sofort, weil ein einzelner Fehlschlag auch am Zeitpunkt liegen kann.
     */
    static get ECO_ABSAGEN_MAX() { return 3; }

    /**
     * Sagt das Gerät "diesen Datenpunkt gibt es hier nicht"?
     *
     * Nur 404 (Leaf unbekannt) und 501 (nicht unterstützt) sind eine Aussage über das Modell.
     * 500 dagegen heißt "beim Lesen ist etwas schiefgegangen" - die Spülmaschine liefert das
     * im Aus-Zustand, im laufenden Betrieb kann derselbe Leaf antworten. Und Zeitüberschreitungen
     * oder Verbindungsfehler sagen über die Fähigkeiten des Geräts gar nichts.
     */
    static kenntLeafNicht(status) {
        return status === 404 || status === 501;
    }

    /** EcoFeedback (Energie/Wasser) aus DOP2-Leaf 2/6195 lesen – nur wo verfügbar. */
    async pollEco() {
        if (!this._ecoAbsagen) this._ecoAbsagen = {};
        for (const [deviceId, dev] of Object.entries(this.devices)) {
            // Geräte ohne Eco-Leaf nicht endlos fragen. Der Zähler lebt nur im Arbeitsspeicher:
            // nach einem Neustart wird erneut geprüft, falls ein Gerät inzwischen mehr kann.
            if ((this._ecoAbsagen[deviceId] || 0) >= MieleLocal.ECO_ABSAGEN_MAX) continue;
            // Ein 500er sagt nichts über das Modell aus - die Spülmaschine antwortet so im
            // Aus-Zustand. Solche Geräte werden weiter gefragt, nur eben seltener.
            if (this._ecoSelten && this._ecoSelten[deviceId] && Date.now() < this._ecoSelten[deviceId]) continue;
            let plain;
            try {
                const res = await dev.api.readDop2(dev.route, ECO_LEAF.unit, ECO_LEAF.attr);
                if (res.status !== 200 || !res.headers['x-signature']) {
                    // Nur eine echte Absage des Geräts zählt mit; ein Lesefehler bleibt ein
                    // Lesefehler und darf die Abfrage nicht dauerhaft beenden.
                    let schluss = '';
                    if (MieleLocal.kenntLeafNicht(res.status)) {
                        this._ecoAbsagen[deviceId] = (this._ecoAbsagen[deviceId] || 0) + 1;
                        if (this._ecoAbsagen[deviceId] >= MieleLocal.ECO_ABSAGEN_MAX) {
                            schluss = ' - dieses Modell führt kein EcoFeedback, wird nicht mehr abgefragt';
                            await this.removeEcoObjects(deviceId);
                        }
                    }
                    // Ohne diese Meldung bricht die Eco-Abfrage lautlos ab, und man sucht die
                    // Ursache im Adapter statt beim Gerät. Nicht jedes Modell hat den Leaf.
                    if (!MieleLocal.kenntLeafNicht(res.status)) {
                        // Nicht ganz aufgeben, aber die nächsten fünf Minuten in Ruhe lassen.
                        if (!this._ecoSelten) this._ecoSelten = {};
                        this._ecoSelten[deviceId] = Date.now() + 5 * 60 * 1000;
                    }
                    this.log.debug(`Eco ${deviceId}: no eco leaf (HTTP ${res.status})${schluss}`);
                    continue;
                }
                plain = this.mc.decryptResponse(res.headers['x-signature'], res.body);
            } catch (e) {
                this.log.debug(`Eco ${deviceId}: ${e.message}`);
                continue;
            }
            let fields;
            try {
                ({ fields } = dop2.parseLeaf(plain));
            } catch (e) {
                this.log.debug(`Eco ${deviceId}: parse error ${e.message}`);
                continue;
            }
            // Antwortet das Gerät wieder, zählt die Absagenreihe von vorn.
            this._ecoAbsagen[deviceId] = 0;
            if (this._ecoSelten) delete this._ecoSelten[deviceId];
            const eco = dop2.ecoValues(fields, ECO_ENERGY_IDX, ECO_WATER_IDX);
            if (eco.energyWh == null && eco.waterL == null) continue;

            await this.ensureEcoObjects(deviceId);
            if (eco.energyWh != null) {
                await this.setStateAsync(`${deviceId}.eco.energyWh`, { val: eco.energyWh, ack: true });
                await this.setStateAsync(`${deviceId}.eco.energy`, { val: eco.energyKwh, ack: true });
            }
            if (eco.waterL != null) {
                await this.setStateAsync(`${deviceId}.eco.water`, { val: eco.waterL, ack: true });
            }
        }
    }

    /**
     * Eco-Datenpunkte eines Geräts entfernen, das den Leaf nachweislich nicht kennt.
     *
     * Sie entstehen sonst einmalig und bleiben für immer auf 0 stehen - in der Anzeige nicht von
     * einem gemessenen "nichts verbraucht" zu unterscheiden. Entfernt wird nur, was der Adapter
     * selbst angelegt hat und was leer geblieben ist: hat ein Gerät je einen Wert geliefert,
     * bleiben die Punkte samt Historie erhalten.
     */
    async removeEcoObjects(deviceId) {
        if (!this._ecoRemoved) this._ecoRemoved = {};
        if (this._ecoRemoved[deviceId] || (this._ecoCreated && this._ecoCreated[deviceId])) return;
        this._ecoRemoved[deviceId] = true;
        for (const sub of ['energy', 'energyWh', 'water']) {
            const id = `${deviceId}.eco.${sub}`;
            try {
                const obj = await this.getObjectAsync(id);
                if (!obj) continue;
                const state = await this.getStateAsync(id);
                // Ein Wert ungleich 0 heißt: das Gerät konnte es doch einmal. Dann nichts löschen.
                if (state && state.val) {
                    this.log.debug(`Eco ${deviceId}: ${sub} hat Werte, bleibt erhalten`);
                    continue;
                }
                await this.delObjectAsync(id);
                this.log.debug(`Eco ${deviceId}: leeren Datenpunkt ${sub} entfernt`);
            } catch (e) {
                this.log.debug(`Eco ${deviceId}: ${sub} nicht entfernt (${e.message})`);
            }
        }
        try {
            const rest = await this.getAdapterObjectsAsync();
            const kinder = Object.keys(rest).filter(id => id.includes(`${deviceId}.eco.`));
            if (!kinder.length) await this.delObjectAsync(`${deviceId}.eco`);
        } catch (e) {
            this.log.debug(`Eco ${deviceId}: Kanal nicht entfernt (${e.message})`);
        }
    }

    async ensureEcoObjects(deviceId) {
        if (!this._ecoCreated) this._ecoCreated = {};
        if (this._ecoCreated[deviceId]) return;
        const german = this.config.germanNames !== false;
        await this.extendObjectAsync(`${deviceId}.eco`, {
            // "EcoFeedback" ist Mieles eigener Begriff und bleibt in jeder Sprache gleich -
            // das i18n-Objekt macht ihn trotzdem vollstaendig, damit die Pruefung nicht warnt.
            type: 'channel',
            common: { name: namen.SPRACHEN.reduce((o, sp) => (o[sp] = 'EcoFeedback', o), {}) },
            native: {},
        });
        const defs = [
            { sub: 'energy', name: namen.text('Energieverbrauch', 'Energy consumption', german), role: 'value.power.consumption', type: 'number', unit: 'kWh', def: 0 },
            { sub: 'energyWh', name: namen.text('Energieverbrauch (Rohwert Wh)', 'Energy consumption (raw Wh)', german), role: 'value.power.consumption', type: 'number', unit: 'Wh', def: 0 },
            { sub: 'water', name: namen.text('Wasserverbrauch', 'Water consumption', german), role: 'value.volume', type: 'number', unit: 'l', def: 0 },
        ];
        for (const d of defs) {
            await this.extendObjectAsync(`${deviceId}.eco.${d.sub}`, {
                type: 'state',
                common: { name: d.name, role: d.role, type: d.type, unit: d.unit, read: true, write: false, def: d.def },
                native: {},
            });
        }
        this._ecoCreated[deviceId] = true;
    }

    /** Sekundengenaue Rest-/Laufzeit aus DOP2 2/256 (#7 Rest s, #8 Lauf s) – nur wo verfügbar. */
    async pollSeconds() {
        for (const [deviceId, dev] of Object.entries(this.devices)) {
            // Läuft kein Programm (Status ≠ In Betrieb/Pause), die Sekundenwerte auf 0 zurücksetzen -
            // sonst blieben nach Programmende die letzten Rest-/Laufzeiten stehen (z. B. 5100 s
            // „Restzeit" bei fertiger Maschine). Spart zugleich den DOP2-Call im Ruhezustand.
            const st = await this.getStateAsync(`${deviceId}.state.status`);
            const running = st && (st.val === 5 || st.val === 6);
            if (!running) {
                await this.ensureSecondsObjects(deviceId);
                await this.setStateAsync(`${deviceId}.state.remainingSeconds`, { val: 0, ack: true });
                await this.setStateAsync(`${deviceId}.state.elapsedSeconds`, { val: 0, ack: true });
                continue;
            }
            let fields;
            try {
                const res = await dev.api.readDop2(dev.route, SEC_LEAF.unit, SEC_LEAF.attr);
                if (res.status !== 200 || !res.headers['x-signature']) continue;
                ({ fields } = dop2.parseLeaf(this.mc.decryptResponse(res.headers['x-signature'], res.body)));
            } catch (e) {
                continue; // Gerät ohne 2/256 oder gerade beschäftigt
            }
            const rem = fields[SEC_REMAINING_IDX] && typeof fields[SEC_REMAINING_IDX].value === 'number' ? fields[SEC_REMAINING_IDX].value : null;
            const ela = fields[SEC_ELAPSED_IDX] && typeof fields[SEC_ELAPSED_IDX].value === 'number' ? fields[SEC_ELAPSED_IDX].value : null;
            if (rem == null && ela == null) continue;
            await this.ensureSecondsObjects(deviceId);
            // Nur echte Werte uebernehmen. Bei laufendem Programm liefert nicht jedes Geraet die
            // Sekunden: die Waschmaschine (WCR860) meldet in 2/256 durchgaengig 0, waehrend
            // /State parallel 11 Minuten Restzeit ausweist - die Spuelmaschine liefert dort
            // korrekte Werte. Eine 0 als "Rest" zu schreiben laesst die Anzeige auf 0:00:00
            // stehen, obwohl das Programm laeuft. Auf 0 zurueckgesetzt wird oben, wenn das
            // Programm wirklich endet.
            if (rem) await this.setStateAsync(`${deviceId}.state.remainingSeconds`, { val: rem, ack: true });
            if (ela) await this.setStateAsync(`${deviceId}.state.elapsedSeconds`, { val: ela, ack: true });
        }
    }

    async ensureSecondsObjects(deviceId) {
        if (!this._secCreated) this._secCreated = {};
        if (this._secCreated[deviceId]) return;
        const german = this.config.germanNames !== false;
        await this.extendObjectAsync(`${deviceId}.state.remainingSeconds`, {
            type: 'state',
            common: { name: namen.text('Restzeit (Sekunden)', 'Remaining time (seconds)', german), role: 'value.interval', type: 'number', unit: 's', def: 0, read: true, write: false },
            native: {},
        });
        await this.extendObjectAsync(`${deviceId}.state.elapsedSeconds`, {
            type: 'state',
            common: { name: namen.text('Laufzeit (Sekunden)', 'Elapsed time (seconds)', german), role: 'value.interval', type: 'number', unit: 's', def: 0, read: true, write: false },
            native: {},
        });
        this._secCreated[deviceId] = true;
    }

    /** SuperVision-Enrollment für alle Geräte (Push aktivieren). */
    async enrollAll() {
        if (!this.push) return;
        for (const [deviceId, dev] of Object.entries(this.devices)) {
            try {
                const r = await enroll.enrollDevice(dev.api, {
                    route: dev.route,
                    ourFab: this.push.ourFab,
                    hostIp: this.push.hostIp,
                    port: this.config.pushPort || 18082,
                    log: this.log,
                });
                this.log.info(
                    `Enrollment ${deviceId}: SuperVision=${r.supervisionOk}, Subscriptions=[${r.subscriptions.join(' ')}]`,
                );
            } catch (e) {
                this.log.warn(`Enrollment for ${deviceId} failed: ${e.message}`);
            }
        }
    }

    /**
     * Wie lange nach einem gescheiterten Statusabruf gewartet wird, bevor es der zweite Versuch
     * probiert. Kurz genug, um vor dem naechsten regulaeren Durchlauf fertig zu sein.
     */
    static get RETRY_PAUSE_MS() { return 1500; }

    async pollAll() {
        let ok = false;
        for (const [deviceId, dev] of Object.entries(this.devices)) {
            // Zweiter Anlauf, bevor ein Abruf als Fehler gilt. Das XKM-Modul der Geraete legt im
            // laufenden Betrieb sporadisch auf ("read ECONNRESET") oder antwortet kurz mit 404 -
            // am 23.08.2026 an der laufenden Waschmaschine mit 21 % der Abrufe gemessen, waehrend
            // die beiden anderen Geraete bei 0 % standen. Beim ersten Fehlversuch sofort
            // info.connected fallen zu lassen liess die Verbindung im Minutentakt flackern,
            // obwohl das Geraet die ganze Zeit erreichbar war.
            let fehler = null;
            let wiederholt = false;
            for (let versuch = 1; versuch <= 2; versuch++) {
                try {
                    const state = await dev.api.getState(dev.route);
                    if (state) {
                        await this.applyState(deviceId, state);
                        await this.setStateAsync(`${deviceId}.info.connected`, { val: true, ack: true });
                        ok = true;
                    }
                    fehler = null;
                    break;
                } catch (e) {
                    fehler = e;
                    if (versuch === 1) {
                        this.log.debug(`Polling ${deviceId} failed: ${e.message} - zweiter Versuch`);
                        wiederholt = true;
                        await new Promise(r => this.setTimeout(r, MieleLocal.RETRY_PAUSE_MS));
                    } else {
                        this.log.debug(`Polling ${deviceId} failed twice: ${e.message}`);
                    }
                }
            }
            if (fehler) {
                await this.setStateAsync(`${deviceId}.info.connected`, { val: false, ack: true });
            }
            await this.verbucheAbfrage(deviceId, fehler, wiederholt && !fehler);
        }
        await this.setStateAsync('info.connection', { val: ok, ack: true });
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return; // nur echte Nutzerbefehle
        const parts = id.split('.'); // miele-local.0.<serial>.control.<sub>
        const idx = parts.indexOf('control');
        if (idx < 0) return;
        const deviceId = parts[idx - 1];
        const sub = parts[idx + 1];
        const dev = this.devices[deviceId];
        if (!dev) return;
        if (!this.config.allowControl) {
            this.log.warn('Device control is disabled in instance settings.');
            return;
        }
        if (!state.val) return; // nur bei true auslösen

        const obj = await this.getObjectAsync(id);
        const opcode = obj && obj.native ? obj.native.opcode : null;
        if (opcode == null) return;

        try {
            const payload = buildUserRequest(opcode);
            const status = await dev.api.put(`Devices/${dev.route}/DOP2/${USER_REQ_UNIT}/${USER_REQ_LEAF}?idx1=0&idx2=0`, payload);
            if (status === 200 || status === 204) {
                this.log.info(`Command '${sub}' sent to ${deviceId} (opcode 0x${opcode.toString(16)}).`);
                await this.setStateAsync(id, { val: false, ack: true });
                // Polling kurz pausieren, dann gezielt den neuen Zustand holen.
                this.pausePollUntil = Date.now() + 2500;
                if (this.pollTimer) this.clearTimeout(this.pollTimer);
                this.setTimeout(async () => {
                    await this.pollAll();
                    this.schedulePoll(false);
                }, 2600);
            } else {
                this.log.warn(`Command '${sub}' to ${deviceId}: HTTP ${status} (is MobileStart enabled on device?).`);
            }
        } catch (e) {
            this.log.warn(`Command '${sub}' to ${deviceId} failed: ${e.message} (remote control might not be supported by firmware).`);
        }
    }

    startPush() {
        try {
            this.push = new MielePushListener({
                port: this.config.pushPort || 18082,
                crypto: this.mc,
                log: this.log,
                adapter: this,
                onEvent: async ev => {
                    // ev = { route, state }
                    const deviceId = ev.route.replace(/[^a-zA-Z0-9_-]/g, '_');
                    if (this.devices[deviceId] && ev.state) {
                        await this.applyState(deviceId, ev.state);
                        this.schedulePoll(false);
                    }
                },
            });
            this.push.start();
            this.log.info(`Push listener active on port ${this.config.pushPort || 18082}.`);
        } catch (e) {
            this.log.warn(`Failed to start push listener: ${e.message}. Polling fallback remains active.`);
        }
    }

    // --- Admin-Nachrichten (OAuth-Login) ---
    async onMessage(obj) {
        if (!obj || !obj.command) return;
        try {
            if (obj.command === 'getAuthUrl') {
                const cc = (obj.message && obj.message.country) || this.config.country || 'de';
                const { url, challenge } = cloud.buildAuthorizeUrl(cc);
                this.oauth[challenge.state] = challenge;
                this.log.info(`Login URL (open in browser): ${url}`);
                // `openUrl` lässt den Admin die Login-Seite im Browser öffnen.
                this.sendTo(obj.from, obj.command, { openUrl: url, state: challenge.state }, obj.callback);
                return;
            }
            if (obj.command === 'submitRedirect') {
                const redirectUrl = obj.message && obj.message.redirectUrl;
                const region = (obj.message && obj.message.region) || this.config.region || 'EU';
                if (!redirectUrl) throw new Error('No redirect URL provided.');
                // passenden challenge über state finden
                let challenge = null;
                try {
                    const q = redirectUrl.slice(redirectUrl.indexOf('?') + 1);
                    const st = new URLSearchParams(q).get('state');
                    challenge = st ? this.oauth[st] : null;
                } catch {
                    /* ignore */
                }
                if (!challenge) challenge = Object.values(this.oauth).pop();
                if (!challenge) throw new Error('No active login challenge. Please generate a new login URL.');

                const code = cloud.parseRedirectUrl(redirectUrl, challenge.state);
                const tokens = await cloud.exchangeCode(challenge, code);
                const gk = await cloud.fetchGroupKey(tokens.access_token, region);
                delete this.oauth[challenge.state];
                this.sendTo(
                    obj.from,
                    obj.command,
                    {
                        native: {
                            groupId: gk.groupId,
                            groupKey: gk.groupKey,
                            refreshToken: tokens.refresh_token || '',
                            country: challenge.cc,
                            region,
                        },
                        saveConfig: true,
                        result: `${gk.devices.length} device(s) found in household. GroupKey saved.`,
                    },
                    obj.callback,
                );
                return;
            }
            if (obj.command === 'discover') {
                const list = await discover(6000, m => this.log.debug(m), this);
                this.sendTo(obj.from, obj.command, { devices: list.map(d => ({ ip: d.ip, techType: d.techType, deviceType: Number(d.txt.devicetype), group: d.txt.group })) }, obj.callback);
                return;
            }
        } catch (e) {
            this.sendTo(obj.from, obj.command, { error: e.message }, obj.callback);
        }
    }

    async onUnload(callback) {
        this.stopping = true;
        try {
            if (this.pollTimer) this.clearTimeout(this.pollTimer);
            if (this.discoveryTimer) this.clearInterval(this.discoveryTimer);
            if (this.enrollTimer) this.clearInterval(this.enrollTimer);
            if (this.ecoTimer) this.clearInterval(this.ecoTimer);
            if (this.secTimer) this.clearInterval(this.secTimer);
            if (this.push) await this.push.stop();
            await this.setStateAsync('info.connection', { val: false, ack: true });
            for (const deviceId of Object.keys(this.devices)) {
                await this.setStateAsync(`${deviceId}.info.connected`, { val: false, ack: true });
            }
        } catch {
            /* ignore */
        } finally {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new MieleLocal(options);
} else {
    new MieleLocal();
}
