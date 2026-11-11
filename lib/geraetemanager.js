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

/** SVG-Pfade (Material Design Icons, Apache 2.0) fuer Kartenkopf und Knoepfe. */
const PFADE = {
    waschen:
        'M14.83,11.17C16.39,12.73 16.39,15.27 14.83,16.83C13.27,18.39 10.73,18.39 9.17,16.83L14.83,11.17M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M7,4A1,1 0 0,0 6,5A1,1 0 0,0 7,6A1,1 0 0,0 8,5A1,1 0 0,0 7,4M10,4A1,1 0 0,0 9,5A1,1 0 0,0 10,6A1,1 0 0,0 11,5A1,1 0 0,0 10,4M12,8A6,6 0 0,0 6,14A6,6 0 0,0 12,20A6,6 0 0,0 18,14A6,6 0 0,0 12,8Z',
    spuelen:
        'M18,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V4A2,2 0 0,0 18,2M10,4A1,1 0 0,1 11,5A1,1 0 0,1 10,6A1,1 0 0,1 9,5A1,1 0 0,1 10,4M7,4A1,1 0 0,1 8,5A1,1 0 0,1 7,6A1,1 0 0,1 6,5A1,1 0 0,1 7,4M18,20H6V8H18V20M14.67,15.33C14.69,16.03 14.41,16.71 13.91,17.21C12.86,18.26 11.15,18.27 10.09,17.21C9.59,16.71 9.31,16.03 9.33,15.33C9.4,14.62 9.63,13.94 10,13.33C10.37,12.5 10.81,11.73 11.33,11L12,10C13.79,12.59 14.67,14.36 14.67,15.33',
    backen: 'M4,5A2,2 0 0,0 2,7V17A2,2 0 0,0 4,19H20A2,2 0 0,0 22,17V7A2,2 0 0,0 20,5H4M4,7H16V17H4V7M19,7A1,1 0 0,1 20,8A1,1 0 0,1 19,9A1,1 0 0,1 18,8A1,1 0 0,1 19,7M6,9V11H14V9H6M19,11A1,1 0 0,1 20,12A1,1 0 0,1 19,13A1,1 0 0,1 18,12A1,1 0 0,1 19,11Z',
    kochen: 'M6,14H8L11,17H9L6,14M4,4H5V3A1,1 0 0,1 6,2H10A1,1 0 0,1 11,3V4H13V3A1,1 0 0,1 14,2H18A1,1 0 0,1 19,3V4H20A2,2 0 0,1 22,6V19A2,2 0 0,1 20,21V22H17V21H7V22H4V21A2,2 0 0,1 2,19V6A2,2 0 0,1 4,4M18,7A1,1 0 0,1 19,8A1,1 0 0,1 18,9A1,1 0 0,1 17,8A1,1 0 0,1 18,7M14,7A1,1 0 0,1 15,8A1,1 0 0,1 14,9A1,1 0 0,1 13,8A1,1 0 0,1 14,7M20,6H4V10H20V6M4,19H20V12H4V19M6,7A1,1 0 0,1 7,8A1,1 0 0,1 6,9A1,1 0 0,1 5,8A1,1 0 0,1 6,7M13,14H15L18,17H16L13,14Z',
    kaffee: 'M18 6V4H20V2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H20V20H15.97C17.2 19.09 18 17.64 18 16V11H8V16C8 17.64 8.81 19.09 10.03 20H6V4H8V6C8 6.55 8.45 7 9 7H17C17.55 7 18 6.55 18 6M13 8C13.55 8 14 8.45 14 9S13.55 10 13 10 12 9.55 12 9 12.45 8 13 8Z',
    kuehlen:
        'M7,2H17A2,2 0 0,1 19,4V9H5V4A2,2 0 0,1 7,2M19,19A2,2 0 0,1 17,21V22H15V21H9V22H7V21A2,2 0 0,1 5,19V10H19V19M8,5V7H10V5H8M8,12V15H10V12H8Z',
    power: 'M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13',
    lichtAn:
        'M12,6A6,6 0 0,1 18,12C18,14.22 16.79,16.16 15,17.2V19A1,1 0 0,1 14,20H10A1,1 0 0,1 9,19V17.2C7.21,16.16 6,14.22 6,12A6,6 0 0,1 12,6M14,21V22A1,1 0 0,1 13,23H11A1,1 0 0,1 10,22V21H14M20,11H23V13H20V11M1,11H4V13H1V11M13,1V4H11V1H13M4.92,3.5L7.05,5.64L5.63,7.05L3.5,4.93L4.92,3.5M16.95,5.63L19.07,3.5L20.5,4.93L18.37,7.05L16.95,5.63Z',
    lichtAus:
        'M12,2C9.76,2 7.78,3.05 6.5,4.68L16.31,14.5C17.94,13.21 19,11.24 19,9A7,7 0 0,0 12,2M3.28,4L2,5.27L5.04,8.3C5,8.53 5,8.76 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H14.73L18.73,22L20,20.72L3.28,4M9,20V21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9Z',
};

/**
 * Ein Pfad als Daten-URL (der Device-Manager nimmt base64 oder URL).
 *
 * @param {string} pfad SVG-Pfad aus PFADE
 * @param {string} farbe Fuellfarbe
 * @returns {string} data:image/svg+xml;base64,…
 */
function symbol(pfad, farbe) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${farbe}" d="${pfad}"/></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/** Kartenkopf-Symbol je Miele-Geraeteart (unbekannte Arten: kein Symbol). */
const SYMBOL_JE_ART = {
    1: 'waschen',
    2: 'waschen',
    24: 'waschen',
    7: 'spuelen',
    12: 'backen',
    13: 'backen',
    15: 'backen',
    16: 'backen',
    27: 'backen',
    67: 'backen',
    68: 'backen',
    17: 'kaffee',
    18: 'kuehlen',
    19: 'kuehlen',
    20: 'kuehlen',
    21: 'kuehlen',
    23: 'kochen',
    25: 'kochen',
};

/**
 * Knopfsymbole. Mehr als vier Textknoepfe passen nicht in die Fusszeile einer Karte (sie liefen
 * rechts hinaus), deshalb Symbolknoepfe mit dem Befehlsnamen als Tooltip.
 */
const KNOPFSYMBOL = {
    powerOn: symbol(PFADE.power, '#2e7d32'),
    powerOff: symbol(PFADE.power, '#c62828'),
    start: 'play',
    pause: 'pause',
    stop: 'stop',
    lightOn: symbol(PFADE.lichtAn, '#f9a825'),
    lightOff: symbol(PFADE.lichtAus, '#757575'),
};

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

    const art = SYMBOL_JE_ART[deviceType];
    if (art) {
        info.icon = symbol(PFADE[art], '#ffffff');
    }

    // Laufender Betrieb direkt auf der Karte. Als customInfo (Datenpunkt-Zeilen), nicht als
    // "info"-Controls: die zeigt der Admin (8.3) nur im Bedien-Dialog, und den gibt es ohne
    // schreibbare Controls gar nicht - die Werte waeren unsichtbar.
    const zeilen = {};
    for (const sub of KARTE.filter(hat)) {
        const o = objekte.get(`${id}.${sub}`);
        const z = {
            type: 'state',
            oid: voll(sub),
            foreign: true,
            label: name(sub),
            readOnly: true,
            control: 'text',
            xs: 12,
        };
        if (o.common && o.common.unit) {
            z.unit = o.common.unit;
        }
        zeilen[`_${sub.replace(/\./g, '_')}`] = z;
    }
    if (Object.keys(zeilen).length) {
        info.customInfo = { id, schema: { type: 'panel', items: zeilen } };
    }

    if (steuerung) {
        const aktionen = BEFEHLE.filter(b => hat(`control.${b}`))
            .filter(b => !b.startsWith('light') || hat('state.light'))
            .map(b => {
                const a = {
                    id: b,
                    icon: KNOPFSYMBOL[b],
                    description: text(b),
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

module.exports = {
    MieleGeraeteManager,
    karte,
    details,
    befehlAusfuehren,
    text,
    TEXTE,
    KARTE,
    DETAILS,
    BEFEHLE,
    KNOPFSYMBOL,
};
