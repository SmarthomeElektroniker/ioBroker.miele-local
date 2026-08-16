'use strict';

/*
 * ioBroker.miele-lokal
 * Verbindet moderne Miele@Home-Geräte lokal ohne Internet (MieleH256/DOP2).
 */

const utils = require('@iobroker/adapter-core');
const { MieleCrypto } = require('./lib/crypto');
const { MieleDeviceApi } = require('./lib/api');
const { discover } = require('./lib/discovery');
const cloud = require('./lib/cloud');
const objdef = require('./lib/objects');
const { MielePushListener } = require('./lib/push');
const enroll = require('./lib/enroll');
const dop2 = require('./lib/dop2');

// EcoFeedback: DOP2-Leaf 2/6195 (bislang nur Waschmaschinen liefern ihn).
// Feldindizes (1-based) empirisch gegen den Cloud-Adapter verifiziert (WCR860):
//   #25 = Energie in Wh (1991 ≈ Cloud 1,9 kWh), #40 = Wasser in 0,1 l (953 ≈ Cloud 96 l).
// Kann je Modell abweichen.
const ECO_LEAF = { unit: 2, attr: 6195 };
const ECO_ENERGY_IDX = 25; // Wh
const ECO_WATER_IDX = 40; // 0,1 l

// Sekundengenaue Zeiten aus DOP2-Leaf 2/256 (verifiziert: #7 Restzeit s, #8 Laufzeit s).
const SEC_LEAF = { unit: 2, attr: 256 };
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

class MieleLokal extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'miele-lokal' });
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

    async onReady() {
        await this.setStateAsync('info.connection', { val: false, ack: true });

        const groupId = this.config.groupId;
        const groupKey = this.config.groupKey;
        if (!groupId || !groupKey) {
            this.log.warn('Keine Zugangsdaten. Bitte in den Instanzeinstellungen anmelden (GroupKey ermitteln).');
            return;
        }
        try {
            this.mc = new MieleCrypto(groupId, groupKey);
        } catch (e) {
            this.log.error(`Ungültiger GroupKey: ${e.message}`);
            return;
        }

        // Geräte ermitteln: Auto-Discovery und/oder manuelle IP-Liste
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
                this.log.warn(`mDNS-Discovery fehlgeschlagen: ${e.message}`);
            }
        }
        for (const entry of this.config.devices || []) {
            const ip = typeof entry === 'string' ? entry : entry && entry.ip;
            if (ip && !seenIp.has(ip)) {
                found.push({ ip, techType: '', deviceType: null });
                seenIp.add(ip);
            }
        }

        if (!found.length) {
            this.log.warn('Keine Miele-Geräte gefunden (weder per mDNS noch manuell konfiguriert).');
        }
        await this.setStateAsync('info.discoveredDevices', { val: JSON.stringify(found), ack: true });

        for (const f of found) {
            try {
                await this.initDevice(f);
            } catch (e) {
                this.log.warn(`Gerät ${f.ip} konnte nicht initialisiert werden: ${e.message}`);
            }
        }

        if (Object.keys(this.devices).length) {
            await this.setStateAsync('info.connection', { val: true, ack: true });
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

    /** Gerät initialisieren: Route (Seriennr.) ermitteln, Objektbaum anlegen, Ident lesen. */
    async initDevice(f) {
        const api = new MieleDeviceApi(f.ip, this.mc, { timeout: 8000 });
        // Seriennummer(n) über signiertes /Devices/ ermitteln
        const list = await api.get('Devices/');
        const routes = Object.keys(list || {});
        if (!routes.length) throw new Error('keine Geräte-Route gefunden');

        for (const route of routes) {
            const deviceId = route; // Objekt-ID = Seriennummer
            let ident = null;
            try {
                ident = await api.getIdent(route);
            } catch (e) {
                this.log.debug(`Ident ${route} nicht lesbar: ${e.message}`);
            }
            const deviceType = ident ? Number(ident.DeviceType) : f.deviceType;
            const techType = ident ? objdef.pathGet(ident, ['DeviceIdentLabel', 'TechType']) : f.techType;

            await this.createDeviceTree(deviceId, techType, deviceType);

            this.devices[deviceId] = { ip: f.ip, route, deviceType, api, active: false };
            if (ident) await this.applyIdent(deviceId, ident);
            const cat = objdef.deviceCategory(deviceType);
            this.log.info(`Gerät erkannt: ${cat ? cat + ' - ' : ''}${techType || 'unbekannt'} (${deviceId}) @ ${f.ip}`);
        }
    }

    async createDeviceTree(deviceId, techType, deviceType) {
        const cat = objdef.deviceCategory(deviceType);
        const label = techType
            ? `${cat ? cat + ' - ' : ''}${techType} (${deviceId})`
            : (cat ? `${cat} (${deviceId})` : deviceId);
        await this.extendObjectAsync(deviceId, {
            type: 'device',
            common: { name: label },
            native: { serial: deviceId },
        });
        // Kanäle
        for (const ch of ['info', 'state']) {
            await this.setObjectNotExistsAsync(`${deviceId}.${ch}`, {
                type: 'channel',
                common: { name: ch === 'info' ? 'Information' : 'State' },
                native: {},
            });
        }
        const german = this.config.germanNames !== false;
        // Ident-States (extendObject → Namen aktualisieren sich beim Umschalten der Sprache)
        for (const f of objdef.IDENT_FIELDS) {
            await this.extendObjectAsync(`${deviceId}.info.${f.sub}`, {
                type: 'state',
                common: { name: objdef.nameFor('info', f.sub, f.name, german), role: f.role, type: f.type, read: true, write: false },
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
                    },
                    native: {},
                });
            }
        }
        // Steuer-States (nur wenn erlaubt)
        if (this.config.allowControl) {
            await this.setObjectNotExistsAsync(`${deviceId}.control`, {
                type: 'channel',
                common: { name: 'Control' },
                native: {},
            });
            for (const c of objdef.CONTROL_STATES) {
                await this.extendObjectAsync(`${deviceId}.control.${c.sub}`, {
                    type: 'state',
                    common: { name: objdef.nameFor('control', c.sub, c.name, german), role: c.role, type: 'boolean', read: false, write: true, def: false },
                    native: { opcode: c.opcode },
                });
            }
        }
    }

    async applyIdent(deviceId, ident) {
        for (const f of objdef.IDENT_FIELDS) {
            const val = objdef.pathGet(ident, f.path);
            if (val !== undefined) {
                await this.setStateAsync(`${deviceId}.info.${f.sub}`, { val: f.type === 'number' ? Number(val) : String(val), ack: true });
            }
        }
    }

    /** /State-Objekt in ioBroker-States übernehmen. */
    async applyState(deviceId, state) {
        const dev = this.devices[deviceId];
        const ctx = { deviceType: dev ? dev.deviceType : null };
        let statusVal = null;
        for (const [key, def] of Object.entries(objdef.STATE_FIELDS)) {
            if (!(key in state)) continue;
            if (!objdef.fieldAllowed(key, ctx.deviceType)) continue;
            const pairs = def.decode(state[key], ctx);
            for (const p of pairs) {
                await this.setStateAsync(`${deviceId}.state.${p.sub}`, { val: p.val === undefined ? null : p.val, ack: true });
            }
            if (key === 'Status') statusVal = state.Status;
        }
        // Voraussichtliches Programmende (wie mielecloudservice.estimatedEndTime): jetzt + Restzeit.
        // Nur wenn eine Restzeit > 0 vorliegt; sonst leeren (kein laufendes Programm). Rohantwort
        // kennt keine Uhrzeit, daher hier berechnet. Minutengenau (Restzeit-Leaf), das genügt fürs Ende.
        if ('RemainingTime' in state) {
            const remMin = objdef.timeToMinutes(state.RemainingTime);
            if (remMin && remMin > 0) {
                const end = new Date(Date.now() + remMin * 60000);
                await this.setStateAsync(`${deviceId}.state.estimatedEndTime`, { val: end.getTime(), ack: true });
                const hh = String(end.getHours()).padStart(2, '0');
                const mm = String(end.getMinutes()).padStart(2, '0');
                await this.setStateAsync(`${deviceId}.state.estimatedEndTimeText`, { val: `${hh}:${mm}`, ack: true });
            } else {
                await this.setStateAsync(`${deviceId}.state.estimatedEndTime`, { val: null, ack: true });
                await this.setStateAsync(`${deviceId}.state.estimatedEndTimeText`, { val: '', ack: true });
            }
        }
        if (dev && statusVal != null) dev.active = ACTIVE_STATUSES.has(statusVal);
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

    /** EcoFeedback (Energie/Wasser) aus DOP2-Leaf 2/6195 lesen – nur wo verfügbar. */
    async pollEco() {
        for (const [deviceId, dev] of Object.entries(this.devices)) {
            let plain;
            try {
                const res = await dev.api.readDop2(dev.route, ECO_LEAF.unit, ECO_LEAF.attr);
                if (res.status !== 200 || !res.headers['x-signature']) continue; // Gerät ohne Eco-Leaf
                plain = this.mc.decryptResponse(res.headers['x-signature'], res.body);
            } catch (e) {
                this.log.debug(`Eco ${deviceId}: ${e.message}`);
                continue;
            }
            let fields;
            try {
                ({ fields } = dop2.parseLeaf(plain));
            } catch (e) {
                this.log.debug(`Eco ${deviceId}: Parse-Fehler ${e.message}`);
                continue;
            }
            const energyRaw = dop2.interpValue(fields, ECO_ENERGY_IDX);
            const waterRaw = dop2.interpValue(fields, ECO_WATER_IDX);
            if (energyRaw == null && waterRaw == null) continue;

            await this.ensureEcoObjects(deviceId);
            if (energyRaw != null) {
                await this.setStateAsync(`${deviceId}.eco.energyWh`, { val: Number(energyRaw), ack: true });
                await this.setStateAsync(`${deviceId}.eco.energy`, { val: Math.round(Number(energyRaw)) / 1000, ack: true });
            }
            if (waterRaw != null) {
                await this.setStateAsync(`${deviceId}.eco.water`, { val: Math.round(Number(waterRaw)) / 10, ack: true });
            }
        }
    }

    async ensureEcoObjects(deviceId) {
        if (!this._ecoCreated) this._ecoCreated = {};
        if (this._ecoCreated[deviceId]) return;
        const german = this.config.germanNames !== false;
        await this.setObjectNotExistsAsync(`${deviceId}.eco`, {
            type: 'channel', common: { name: german ? 'EcoFeedback' : 'EcoFeedback' }, native: {},
        });
        const defs = [
            { sub: 'energy', name: german ? 'Energieverbrauch' : 'Energy consumption', role: 'value.power.consumption', unit: 'kWh' },
            { sub: 'energyWh', name: german ? 'Energieverbrauch (Rohwert Wh)' : 'Energy consumption (raw Wh)', role: 'value', unit: 'Wh' },
            { sub: 'water', name: german ? 'Wasserverbrauch' : 'Water consumption', role: 'value', unit: 'l' },
        ];
        for (const d of defs) {
            await this.extendObjectAsync(`${deviceId}.eco.${d.sub}`, {
                type: 'state',
                common: { name: d.name, role: d.role, type: 'number', unit: d.unit, read: true, write: false },
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
            if (rem != null) await this.setStateAsync(`${deviceId}.state.remainingSeconds`, { val: rem, ack: true });
            if (ela != null) await this.setStateAsync(`${deviceId}.state.elapsedSeconds`, { val: ela, ack: true });
        }
    }

    async ensureSecondsObjects(deviceId) {
        if (!this._secCreated) this._secCreated = {};
        if (this._secCreated[deviceId]) return;
        const german = this.config.germanNames !== false;
        await this.extendObjectAsync(`${deviceId}.state.remainingSeconds`, {
            type: 'state',
            common: { name: german ? 'Restzeit (Sekunden)' : 'Remaining time (seconds)', role: 'value.interval', type: 'number', unit: 's', read: true, write: false },
            native: {},
        });
        await this.extendObjectAsync(`${deviceId}.state.elapsedSeconds`, {
            type: 'state',
            common: { name: german ? 'Laufzeit (Sekunden)' : 'Elapsed time (seconds)', role: 'value.interval', type: 'number', unit: 's', read: true, write: false },
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
                this.log.warn(`Enrollment ${deviceId} fehlgeschlagen: ${e.message}`);
            }
        }
    }

    async pollAll() {
        let ok = false;
        for (const [deviceId, dev] of Object.entries(this.devices)) {
            try {
                const state = await dev.api.getState(dev.route);
                if (state) {
                    await this.applyState(deviceId, state);
                    ok = true;
                }
            } catch (e) {
                this.log.debug(`Polling ${deviceId} fehlgeschlagen: ${e.message}`);
            }
        }
        await this.setStateAsync('info.connection', { val: ok, ack: true });
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return; // nur echte Nutzerbefehle
        const parts = id.split('.'); // miele-lokal.0.<serial>.control.<sub>
        const idx = parts.indexOf('control');
        if (idx < 0) return;
        const deviceId = parts[idx - 1];
        const sub = parts[idx + 1];
        const dev = this.devices[deviceId];
        if (!dev) return;
        if (!this.config.allowControl) {
            this.log.warn('Steuerung ist in den Instanzeinstellungen deaktiviert.');
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
                this.log.info(`Befehl '${sub}' an ${deviceId} gesendet (opcode 0x${opcode.toString(16)}).`);
                await this.setStateAsync(id, { val: false, ack: true });
                // Polling kurz pausieren, dann gezielt den neuen Zustand holen.
                this.pausePollUntil = Date.now() + 2500;
                if (this.pollTimer) this.clearTimeout(this.pollTimer);
                this.setTimeout(async () => {
                    await this.pollAll();
                    this.schedulePoll(false);
                }, 2600);
            } else {
                this.log.warn(`Befehl '${sub}' an ${deviceId}: HTTP ${status} (MobileStart am Gerät aktiv?).`);
            }
        } catch (e) {
            this.log.warn(`Befehl '${sub}' an ${deviceId} fehlgeschlagen: ${e.message} (Firmware erlaubt evtl. keine Fernsteuerung).`);
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
                    const deviceId = ev.route;
                    if (this.devices[deviceId] && ev.state) {
                        await this.applyState(deviceId, ev.state);
                        this.schedulePoll(false);
                    }
                },
            });
            this.push.start();
            this.log.info(`Push-Listener aktiv auf Port ${this.config.pushPort || 18082}.`);
        } catch (e) {
            this.log.warn(`Push-Listener konnte nicht gestartet werden: ${e.message}. Polling bleibt aktiv.`);
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
                this.log.info(`Login-URL (im Browser öffnen): ${url}`);
                // `openUrl` lässt den Admin die Login-Seite im Browser öffnen.
                this.sendTo(obj.from, obj.command, { openUrl: url, state: challenge.state }, obj.callback);
                return;
            }
            if (obj.command === 'submitRedirect') {
                const redirectUrl = obj.message && obj.message.redirectUrl;
                const region = (obj.message && obj.message.region) || this.config.region || 'EU';
                if (!redirectUrl) throw new Error('Keine Redirect-URL übergeben.');
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
                if (!challenge) throw new Error('Kein aktiver Login-Vorgang. Bitte Login-URL neu erzeugen.');

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
                        result: `${gk.devices.length} Gerät(e) im Haushalt gefunden. GroupKey gespeichert.`,
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
            if (this.enrollTimer) this.clearInterval(this.enrollTimer);
            if (this.ecoTimer) this.clearInterval(this.ecoTimer);
            if (this.secTimer) this.clearInterval(this.secTimer);
            if (this.push) await this.push.stop();
            await this.setStateAsync('info.connection', { val: false, ack: true });
        } catch {
            /* ignore */
        } finally {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new MieleLokal(options);
} else {
    new MieleLokal();
}
