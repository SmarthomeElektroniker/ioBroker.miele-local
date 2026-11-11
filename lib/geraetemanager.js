'use strict';

/*
 * Geraetekarten fuer den ioBroker Device-Manager (Issue #22, Anregung von mcm1957).
 *
 * WAS DIE KARTEN SIND. Je Kuechen- und Waschgeraet eine Karte mit dem laufenden Betrieb:
 * Name und Modell, Erreichbarkeit, Betriebszustand, Programm, Phase, Restzeit, Programmende,
 * Fehler und Hinweise. Dazu - nur wenn die Steuerung in der Instanz freigeschaltet ist und die
 * Datenpunkte dafuer existieren - die Alltagsknoepfe Ein/Aus, Start/Pause/Stopp und Licht.
 *
 * WAS SIE NICHT SIND. Keine Konfiguration: kein Suchen, kein Koppeln, kein Hinzufuegen oder
 * Entfernen, keine Diagnose- oder Erkundungswerkzeuge, keine Instanz-Aktionen. Das bleibt auf
 * der Einstellungsseite und im Diagnose-Reiter (Vorgabe des Nutzers: "Karten nur fuer dauerhafte
 * Funktion, nicht fuer Config-Aufgaben").
 *
 * WIE DIE KNOEPFE SCHALTEN. Nicht selbst, sondern ueber die vorhandenen Datenpunkte
 * control.<befehl>: Der Knopf schreibt true mit ack=false - genau wie ein Skript oder VIS - und
 * wartet, bis lib/befehle.js den Befehl abgeschlossen hat. Damit gelten dieselben Pruefungen
 * (Steuerung freigegeben, Geraet verbunden, MobileStart) und dieselbe Rueckmeldung im Feld c.
 * Einen zweiten Weg zum Geraet gibt es nicht.
 *
 * WOHER DIE BESCHRIFTUNGEN KOMMEN. Werte und Bezeichnungen der Datenpunkte stammen aus den
 * Objekten selbst (common.name ist bei eingeschalteten deutschen Namen schon elfsprachig). Nur
 * die Knopf- und Meldungstexte stehen hier in TEXTE, in allen Sprachen des Repositories.
 */

const { DeviceManagement } = require('@iobroker/dm-utils');
const objdef = require('./objects');
const namen = require('./names');

/** Knopf- und Meldungstexte. {befehl}, {grund} und {sekunden} werden eingesetzt. */
const TEXTE = {
    serial: {
        en: 'Serial number',
        de: 'Seriennummer',
        ru: 'Серийный номер',
        pt: 'Número de série',
        nl: 'Serienummer',
        fr: 'Numéro de série',
        it: 'Numero di serie',
        es: 'Número de serie',
        pl: 'Numer seryjny',
        uk: 'Серійний номер',
        'zh-cn': '序列号',
    },
    powerOn: {
        en: 'On',
        de: 'Ein',
        ru: 'Вкл.',
        pt: 'Ligar',
        nl: 'Aan',
        fr: 'Marche',
        it: 'Accendi',
        es: 'Encender',
        pl: 'Włącz',
        uk: 'Увімк.',
        'zh-cn': '开机',
    },
    powerOff: {
        en: 'Off',
        de: 'Aus',
        ru: 'Выкл.',
        pt: 'Desligar',
        nl: 'Uit',
        fr: 'Arrêt',
        it: 'Spegni',
        es: 'Apagar',
        pl: 'Wyłącz',
        uk: 'Вимк.',
        'zh-cn': '关机',
    },
    start: {
        en: 'Start',
        de: 'Start',
        ru: 'Старт',
        pt: 'Iniciar',
        nl: 'Start',
        fr: 'Démarrer',
        it: 'Avvia',
        es: 'Iniciar',
        pl: 'Start',
        uk: 'Старт',
        'zh-cn': '启动',
    },
    pause: {
        en: 'Pause',
        de: 'Pause',
        ru: 'Пауза',
        pt: 'Pausa',
        nl: 'Pauze',
        fr: 'Pause',
        it: 'Pausa',
        es: 'Pausa',
        pl: 'Pauza',
        uk: 'Пауза',
        'zh-cn': '暂停',
    },
    stop: {
        en: 'Stop',
        de: 'Stopp',
        ru: 'Стоп',
        pt: 'Parar',
        nl: 'Stop',
        fr: 'Arrêter',
        it: 'Ferma',
        es: 'Detener',
        pl: 'Stop',
        uk: 'Стоп',
        'zh-cn': '停止',
    },
    lightOn: {
        en: 'Light on',
        de: 'Licht an',
        ru: 'Свет вкл.',
        pt: 'Luz ligada',
        nl: 'Licht aan',
        fr: 'Lumière allumée',
        it: 'Luce accesa',
        es: 'Luz encendida',
        pl: 'Światło wł.',
        uk: 'Світло увімк.',
        'zh-cn': '开灯',
    },
    lightOff: {
        en: 'Light off',
        de: 'Licht aus',
        ru: 'Свет выкл.',
        pt: 'Luz desligada',
        nl: 'Licht uit',
        fr: 'Lumière éteinte',
        it: 'Luce spenta',
        es: 'Luz apagada',
        pl: 'Światło wył.',
        uk: 'Світло вимк.',
        'zh-cn': '关灯',
    },
    confirm: {
        en: 'Send “{befehl}” to the appliance now?',
        de: '„{befehl}“ jetzt an das Gerät senden?',
        ru: 'Отправить «{befehl}» на прибор сейчас?',
        pt: 'Enviar «{befehl}» ao aparelho agora?',
        nl: '“{befehl}” nu naar het apparaat sturen?',
        fr: 'Envoyer « {befehl} » à l’appareil maintenant ?',
        it: 'Inviare «{befehl}» all’apparecchio adesso?',
        es: '¿Enviar «{befehl}» al aparato ahora?',
        pl: 'Wysłać teraz „{befehl}” do urządzenia?',
        uk: 'Надіслати «{befehl}» на прилад зараз?',
        'zh-cn': '现在向设备发送“{befehl}”？',
    },
    failed: {
        en: 'The command was not executed: {grund}',
        de: 'Der Befehl wurde nicht ausgeführt: {grund}',
        ru: 'Команда не выполнена: {grund}',
        pt: 'O comando não foi executado: {grund}',
        nl: 'De opdracht is niet uitgevoerd: {grund}',
        fr: 'La commande n’a pas été exécutée : {grund}',
        it: 'Il comando non è stato eseguito: {grund}',
        es: 'El comando no se ha ejecutado: {grund}',
        pl: 'Polecenie nie zostało wykonane: {grund}',
        uk: 'Команду не виконано: {grund}',
        'zh-cn': '命令未执行：{grund}',
    },
    timeout: {
        en: 'No confirmation within {sekunden} seconds. The result will appear in the control state.',
        de: 'Keine Bestätigung innerhalb von {sekunden} Sekunden. Das Ergebnis erscheint im Steuer-Datenpunkt.',
        ru: 'Нет подтверждения в течение {sekunden} секунд. Результат появится в точке данных управления.',
        pt: 'Sem confirmação em {sekunden} segundos. O resultado aparecerá no estado de controlo.',
        nl: 'Geen bevestiging binnen {sekunden} seconden. Het resultaat verschijnt in het stuurdatapunt.',
        fr: 'Pas de confirmation en {sekunden} secondes. Le résultat apparaîtra dans l’état de commande.',
        it: 'Nessuna conferma entro {sekunden} secondi. Il risultato apparirà nello stato di controllo.',
        es: 'Sin confirmación en {sekunden} segundos. El resultado aparecerá en el estado de control.',
        pl: 'Brak potwierdzenia w ciągu {sekunden} sekund. Wynik pojawi się w stanie sterującym.',
        uk: 'Немає підтвердження протягом {sekunden} секунд. Результат з’явиться в точці даних керування.',
        'zh-cn': '{sekunden} 秒内未收到确认。结果将显示在控制数据点中。',
    },
    fault: {
        en: 'The appliance reports a fault',
        de: 'Das Gerät meldet eine Störung',
        ru: 'Прибор сообщает о неисправности',
        pt: 'O aparelho indica uma avaria',
        nl: 'Het apparaat meldt een storing',
        fr: 'L’appareil signale une panne',
        it: 'L’apparecchio segnala un guasto',
        es: 'El aparato indica una avería',
        pl: 'Urządzenie zgłasza usterkę',
        uk: 'Прилад повідомляє про несправність',
        'zh-cn': '设备报告故障',
    },
    notice: {
        en: 'The appliance shows a notice',
        de: 'Das Gerät zeigt einen Hinweis',
        ru: 'Прибор показывает уведомление',
        pt: 'O aparelho mostra um aviso',
        nl: 'Het apparaat toont een melding',
        fr: 'L’appareil affiche un message',
        it: 'L’apparecchio mostra un avviso',
        es: 'El aparato muestra un aviso',
        pl: 'Urządzenie wyświetla komunikat',
        uk: 'Прилад показує повідомлення',
        'zh-cn': '设备显示提示',
    },
};

/**
 * Text mit eingesetzten Platzhaltern in allen Sprachen.
 *
 * @param {string} schluessel Eintrag in TEXTE
 * @param {Record<string, string|number|Record<string, string>>} [werte] Platzhalter; ein
 *   Sprachobjekt wird je Sprache eingesetzt, alles andere unveraendert
 * @returns {Record<string, string>} Text je Sprache
 */
function text(schluessel, werte = {}) {
    const vorlage = TEXTE[schluessel];
    const aus = {};
    for (const [sp, t] of Object.entries(vorlage)) {
        aus[sp] = t.replace(/\{(\w+)\}/g, (ganz, name) => {
            const w = werte[name];
            if (w === undefined || w === null) {
                return ganz;
            }
            return typeof w === 'object' ? w[sp] || w.en : String(w);
        });
    }
    return aus;
}

/** Werte auf der Karte selbst, in dieser Reihenfolge - der laufende Betrieb. */
const KARTE = [
    'state.statusText',
    'state.programText',
    'state.programPhaseText',
    'state.remainingHHMM',
    'state.estimatedEndTimeText',
];

/** Weitere Betriebswerte, die beim Aufklappen erscheinen - nur, wenn das Geraet sie hat. */
const DETAILS = [
    'state.programTypeText',
    'state.elapsedHHMM',
    'state.startHHMM',
    'state.startTimeText',
    'state.temperature',
    'state.targetTemperature',
    'state.temperatureZone2',
    'state.targetTemperatureZone2',
    'state.temperatureZone3',
    'state.targetTemperatureZone3',
    'state.spinningSpeed',
    'state.dryingStepText',
    'state.signalDoor',
    'state.light',
    'state.mobileStart',
    'eco.energy',
    'eco.water',
    'info.operatingHours',
    'info.techType',
];

/** Alltagsbefehle in Anzeigereihenfolge. Licht nur bei Geraeten mit state.light. */
const BEFEHLE = ['powerOn', 'powerOff', 'start', 'pause', 'stop', 'lightOn', 'lightOff'];

/** Wie lange ein Knopf auf den Abschluss des Befehls wartet (Einschalten weckt und prueft nach). */
const WARTEZEIT_MS = 90000;
const TAKT_MS = 500;

/**
 * Die Karte eines Geraets zusammenstellen. Rein: liest nichts, schreibt nichts.
 *
 * @param {object} p Angaben
 * @param {string} p.ns Namensraum der Instanz, z. B. "miele-local.0"
 * @param {string} p.id Geraete-ID (Seriennummer)
 * @param {ioBroker.Object} p.obj Geraeteobjekt
 * @param {Map<string, ioBroker.Object>} p.objekte vorhandene Objekte des Geraets, Schluessel ohne Namensraum
 * @param {number|null} p.deviceType Miele-Geraeteart aus info.deviceType
 * @param {boolean} p.steuerung ob die Steuerung in der Instanz freigegeben ist
 * @param {(id: string, befehl: string, ctx: object) => Promise<object>} [p.handler] Ausfuehrung eines Befehls
 * @returns {object} DeviceInfo fuer den Device-Manager
 */
function karte({ ns, id, obj, objekte, deviceType, steuerung, handler }) {
    const hat = sub => objekte.has(`${id}.${sub}`);
    const voll = sub => `${ns}.${id}.${sub}`;
    const name = sub => {
        const o = objekte.get(`${id}.${sub}`);
        return (o && o.common && o.common.name) || sub.split('.').pop();
    };

    const info = {
        id,
        identifier: id,
        name: (obj && obj.common && obj.common.name) || id,
        manufacturer: 'Miele',
        hasDetails: DETAILS.some(hat),
    };
    if (hat('info.techType')) {
        info.model = { stateId: voll('info.techType') };
    }

    const status = {};
    if (hat('info.connected')) {
        status.connection = {
            stateId: voll('info.connected'),
            mapping: { true: 'connected', false: 'disconnected' },
        };
    }
    if (hat('state.signalFailure')) {
        status.warning = { stateId: voll('state.signalFailure'), mapping: { true: text('fault'), false: false } };
    }
    if (Object.keys(status).length) {
        info.status = status;
    }

    if (hat('state.signalInfo')) {
        info.indicators = [
            {
                id: 'signalInfo',
                value: { stateId: voll('state.signalInfo') },
                icon: 'info',
                colorOn: 'warning',
                tooltip: text('notice'),
            },
        ];
    }

    const kategorie = objdef.deviceCategory(deviceType);
    if (kategorie) {
        const k = namen.KATEGORIEN[kategorie];
        info.group = { key: `type${deviceType}`, name: k ? { ...k, de: kategorie } : kategorie };
    }

    info.controls = KARTE.filter(hat).map(sub => {
        const o = objekte.get(`${id}.${sub}`);
        const c = { id: sub, type: 'info', stateId: voll(sub), label: name(sub) };
        if (o.common && o.common.unit) {
            c.unit = o.common.unit;
        }
        return c;
    });

    if (steuerung) {
        const aktionen = BEFEHLE.filter(b => hat(`control.${b}`))
            .filter(b => !b.startsWith('light') || hat('state.light'))
            .map(b => {
                const a = {
                    id: b,
                    title: text(b),
                    variant: 'outlined',
                    timeout: WARTEZEIT_MS + 10000,
                };
                // Licht ist harmlos; alles andere greift in den Betrieb ein und wird bestaetigt.
                if (!b.startsWith('light')) {
                    a.confirmation = text('confirm', { befehl: TEXTE[b] });
                }
                if (handler) {
                    a.handler = (geraet, ctx) => handler(geraet, b, ctx);
                }
                return a;
            });
        if (aktionen.length) {
            info.actions = aktionen;
        }
    }
    return info;
}

/**
 * Das Aufklappfeld eines Geraets: weitere Betriebswerte, live aus den Datenpunkten.
 *
 * @param {string} id Geraete-ID
 * @param {Map<string, ioBroker.Object>} objekte vorhandene Objekte, Schluessel ohne Namensraum
 * @returns {{id: string, schema: object}} DeviceDetails
 */
function details(id, objekte) {
    const items = {};
    for (const sub of DETAILS) {
        const o = objekte.get(`${id}.${sub}`);
        if (!o) {
            continue;
        }
        const c = o.common || {};
        const item = { type: 'state', oid: `${id}.${sub}`, label: c.name || sub, control: 'text', sm: 12 };
        if (c.unit) {
            item.unit = c.unit;
        }
        items[`_${sub.replace(/\./g, '_')}`] = item;
    }
    return { id, schema: { type: 'panel', items } };
}

/** Device-Manager der Instanz. Nur Anzeige und Alltagsbefehle, keine Instanz-Aktionen. */
class MieleGeraeteManager extends DeviceManagement {
    /** @returns {object} Instanzangaben: API v3, keine Instanz-Aktionen */
    getInstanceInfo() {
        return { apiVersion: 'v3', identifierLabel: TEXTE.serial };
    }

    /**
     * Alle Objekte unterhalb der Geraete holen, gruppiert nach Geraet.
     *
     * @returns {Promise<{geraete: ioBroker.Object[], objekte: Map<string, ioBroker.Object>}>} Geraete und Objekte
     */
    async lesen() {
        const ns = this.adapter.namespace;
        const bereich = { startkey: `${ns}.`, endkey: `${ns}.香` };
        const ger = await this.adapter.getObjectViewAsync('system', 'device', bereich);
        const st = await this.adapter.getObjectViewAsync('system', 'state', bereich);
        const geraete = ((ger && ger.rows) || []).map(r => r.value).filter(Boolean);
        const objekte = new Map();
        for (const r of (st && st.rows) || []) {
            if (r.value) {
                objekte.set(r.id.slice(ns.length + 1), r.value);
            }
        }
        return { geraete, objekte };
    }

    /**
     * Je Geraet eine Karte an den Device-Manager geben.
     *
     * @param {{addDevice: (d: object) => void, setTotalDevices: (n: number) => void}} context Ladekontext
     */
    async loadDevices(context) {
        const ns = this.adapter.namespace;
        const { geraete, objekte } = await this.lesen();
        context.setTotalDevices(geraete.length);
        const steuerung = !!this.adapter.config.allowControl;
        for (const obj of geraete) {
            const id = obj._id.slice(ns.length + 1);
            let deviceType = null;
            try {
                const s = await this.adapter.getStateAsync(`${id}.info.deviceType`);
                deviceType = s && s.val != null ? Number(s.val) : null;
            } catch {
                /* ohne Geraeteart keine Gruppe */
            }
            context.addDevice(
                karte({
                    ns,
                    id,
                    obj,
                    objekte,
                    deviceType,
                    steuerung,
                    handler: (geraet, befehl, ctx) => this.befehl(geraet, befehl, ctx),
                }),
            );
        }
    }

    /**
     * Das Aufklappfeld eines Geraets.
     *
     * @param {string} id Geraete-ID
     */
    async getDeviceDetails(id) {
        const { objekte } = await this.lesen();
        return details(id, objekte);
    }

    /**
     * Einen Alltagsbefehl ueber den vorhandenen Datenpunkt control.<befehl> ausfuehren.
     *
     * @param {string} geraet Geraete-ID
     * @param {string} befehl Name des Befehls (powerOn, start …)
     * @param {{showMessage: (t: object) => Promise<void>}} ctx Dialog-Kontext des Device-Managers
     * @param {{wartezeit?: number, takt?: number}} [zeiten] fuer Tests verkuerzbar
     * @returns {Promise<{refresh: 'none'}>} nichts neu laden - die Karte folgt den Datenpunkten
     */
    async befehl(geraet, befehl, ctx, zeiten) {
        const erg = await befehlAusfuehren(this.adapter, `${geraet}.control.${befehl}`, zeiten);
        if (erg.zeitueberschreitung) {
            await ctx.showMessage(text('timeout', { sekunden: Math.round(WARTEZEIT_MS / 1000) }));
        } else if (erg.fehler) {
            await ctx.showMessage(text('failed', { grund: erg.fehler }));
        }
        return { refresh: 'none' };
    }
}

/**
 * Befehl schreiben und auf den Abschluss durch lib/befehle.js warten.
 *
 * @param adapter Adapterinstanz (setStateAsync, getStateAsync, setTimeout)
 * @param {string} id Steuer-Datenpunkt ohne Namensraum
 * @param {{wartezeit?: number, takt?: number}} [o] Zeiten, fuer Tests verkuerzbar
 * @returns {Promise<{ok?: boolean, fehler?: string, zeitueberschreitung?: boolean}>} Ergebnis
 */
async function befehlAusfuehren(adapter, id, o = {}) {
    const wartezeit = o.wartezeit != null ? o.wartezeit : WARTEZEIT_MS;
    const takt = o.takt != null ? o.takt : TAKT_MS;
    const ab = Date.now();
    await adapter.setStateAsync(id, { val: true, ack: false });
    for (let warte = 0; warte < wartezeit; warte += takt) {
        await new Promise(r => adapter.setTimeout(r, takt));
        const st = await adapter.getStateAsync(id);
        if (st && st.ack && st.ts >= ab) {
            if (st.q) {
                return { fehler: String(st.c || '').replace(/^not executed: /, '') || `q=${st.q}` };
            }
            return { ok: true };
        }
    }
    return { zeitueberschreitung: true };
}

module.exports = { MieleGeraeteManager, karte, details, befehlAusfuehren, text, TEXTE, KARTE, DETAILS, BEFEHLE };
