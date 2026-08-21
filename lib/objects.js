'use strict';

/**
 * Deklaratives Objektmodell: /State- und /Ident-Felder → ioBroker-States.
 * Enthält Rollen, Typen, Einheiten und Dekodierfunktionen.
 */

const enums = require('./enums');
const de = require('./enums_de');

const TEMP_SENTINEL = -32768; // "nicht verfügbar"

/** [h, min] → Gesamtminuten (null bei fehlend). */
function timeToMinutes(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return null;
    return arr[0] * 60 + arr[1];
}

/** [h, min] → "H:MM"-String (wie mielecloudservice), null bei fehlend. */
function timeToHHMM(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return null;
    return `${arr[0]}:${String(arr[1]).padStart(2, '0')}`;
}

// Deutsch mit englischem Fallback
function statusTextDe(v) { return de.statusDe(v) || enums.statusText(v); }
function programTypeTextDe(v) { return de.programTypeDe(v) || enums.programTypeText(v); }
function dryingStepTextDe(v) { return de.dryingStepDe(v) || enums.dryingStepText(v); }
function programTextDe(dt, v) { const en = enums.programText(dt, v); return de.programNameDe(en) || en; }
// Phase: erst numerische DE-Tabelle (Waschen/Spülen/Backofen), dann englisch-basierte DE-Map
// (deckt alle uebrigen Gerätetypen ab), sonst englischer Klartext.
function phaseTextDe(dt, v) { const en = enums.phaseText(dt, v); return de.phaseDe(dt, v) || de.phaseNameDe(en) || en; }

/** Miele-Temperatur (Hundertstel °C) → °C, Sentinel → null. */
function temp(v) {
    if (v == null || v === TEMP_SENTINEL) return null;
    return v / 100;
}

/**
 * Zustands-Kanäle (Rohwert + optionaler Klartext) je /State-Feld.
 * decode(value, ctx) → { states: [{sub, val}] }
 * ctx = { deviceType }
 */
const STATE_FIELDS = {
    Status: {
        states: [
            { sub: 'status', role: 'value', type: 'number', def: 0, name: 'Status (raw)' },
            { sub: 'statusText', role: 'text', type: 'string', def: '', name: 'Status' },
        ],
        decode: (v) => [{ sub: 'status', val: v }, { sub: 'statusText', val: statusTextDe(v) }],
    },
    ProgramType: {
        states: [
            { sub: 'programType', role: 'value', type: 'number', def: 0, name: 'Program type (raw)' },
            { sub: 'programTypeText', role: 'text', type: 'string', def: '', name: 'Program type' },
        ],
        decode: (v) => [{ sub: 'programType', val: v }, { sub: 'programTypeText', val: programTypeTextDe(v) }],
    },
    ProgramID: {
        states: [
            { sub: 'programId', role: 'value', type: 'number', def: 0, name: 'Program (raw)' },
            { sub: 'programText', role: 'text', type: 'string', def: '', name: 'Program' },
        ],
        decode: (v, ctx) => [{ sub: 'programId', val: v }, { sub: 'programText', val: programTextDe(ctx.deviceType, v) }],
    },
    ProgramPhase: {
        states: [
            { sub: 'programPhase', role: 'value', type: 'number', def: 0, name: 'Phase (raw)' },
            { sub: 'programPhaseText', role: 'text', type: 'string', def: '', name: 'Phase' },
        ],
        decode: (v, ctx) => [{ sub: 'programPhase', val: v }, { sub: 'programPhaseText', val: phaseTextDe(ctx.deviceType, v) }],
    },
    RemainingTime: {
        states: [
            { sub: 'remainingMinutes', role: 'value.interval', type: 'number', unit: 'min', def: 0, name: 'Remaining time' },
            { sub: 'remainingHHMM', role: 'text', type: 'string', def: '', name: 'Remaining time (H:MM)' },
            // Voraussichtliches Programmende (wie mielecloudservice.estimatedEndTime). Der Wert wird
            // NICHT hier dekodiert (die Rohantwort kennt keine Uhrzeit), sondern in main.js aus
            // "jetzt + Restzeit" berechnet - hier nur die Objektanlage.
            { sub: 'estimatedEndTime', role: 'date', type: 'number', def: 0, name: 'Estimated end time' },
            { sub: 'estimatedEndTimeText', role: 'text', type: 'string', def: '', name: 'Estimated end time (HH:MM)' },
        ],
        decode: (v) => [{ sub: 'remainingMinutes', val: timeToMinutes(v) }, { sub: 'remainingHHMM', val: timeToHHMM(v) }],
    },
    ElapsedTime: {
        states: [
            { sub: 'elapsedMinutes', role: 'value.interval', type: 'number', unit: 'min', def: 0, name: 'Elapsed time' },
            { sub: 'elapsedHHMM', role: 'text', type: 'string', def: '', name: 'Elapsed time (H:MM)' },
        ],
        decode: (v) => [{ sub: 'elapsedMinutes', val: timeToMinutes(v) }, { sub: 'elapsedHHMM', val: timeToHHMM(v) }],
    },
    StartTime: {
        states: [
            { sub: 'startInMinutes', role: 'value.interval', type: 'number', unit: 'min', def: 0, name: 'Start delay' },
            { sub: 'startHHMM', role: 'text', type: 'string', def: '', name: 'Start delay (H:MM)' },
        ],
        decode: (v) => [{ sub: 'startInMinutes', val: timeToMinutes(v) }, { sub: 'startHHMM', val: timeToHHMM(v) }],
    },
    TargetTemperature: {
        states: [
            { sub: 'targetTemperature', role: 'value.temperature', type: 'number', unit: '°C', def: 0, name: 'Target temperature' },
            { sub: 'targetTemperatureZone2', role: 'value.temperature', type: 'number', unit: '°C', def: 0, name: 'Target temperature zone 2' },
            { sub: 'targetTemperatureZone3', role: 'value.temperature', type: 'number', unit: '°C', def: 0, name: 'Target temperature zone 3' },
        ],
        decode: (v) => [
            { sub: 'targetTemperature', val: temp(v && v[0]) },
            { sub: 'targetTemperatureZone2', val: temp(v && v[1]) },
            { sub: 'targetTemperatureZone3', val: temp(v && v[2]) },
        ],
    },
    Temperature: {
        states: [
            { sub: 'temperature', role: 'value.temperature', type: 'number', unit: '°C', def: 0, name: 'Temperature' },
            { sub: 'temperatureZone2', role: 'value.temperature', type: 'number', unit: '°C', def: 0, name: 'Temperature zone 2' },
            { sub: 'temperatureZone3', role: 'value.temperature', type: 'number', unit: '°C', def: 0, name: 'Temperature zone 3' },
        ],
        decode: (v) => [
            { sub: 'temperature', val: temp(v && v[0]) },
            { sub: 'temperatureZone2', val: temp(v && v[1]) },
            { sub: 'temperatureZone3', val: temp(v && v[2]) },
        ],
    },
    SignalInfo: {
        states: [{ sub: 'signalInfo', role: 'indicator', type: 'boolean', def: false, name: 'Info signal' }],
        decode: (v) => [{ sub: 'signalInfo', val: !!v }],
    },
    SignalFailure: {
        states: [{ sub: 'signalFailure', role: 'indicator.maintenance', type: 'boolean', def: false, name: 'Failure signal' }],
        decode: (v) => [{ sub: 'signalFailure', val: !!v }],
    },
    SignalDoor: {
        states: [{ sub: 'signalDoor', role: 'sensor.door', type: 'boolean', def: false, name: 'Door open' }],
        decode: (v) => [{ sub: 'signalDoor', val: !!v }],
    },
    RemoteEnable: {
        states: [
            { sub: 'mobileStart', role: 'indicator', type: 'boolean', def: false, name: 'MobileStart enabled' },
            { sub: 'remoteEnableRaw', role: 'json', type: 'string', def: '[]', name: 'RemoteEnable (raw)' },
        ],
        // Element[1] = MobileStart-Freigabe (0/1). Steuerung nur möglich, wenn 1.
        decode: (v) => [
            { sub: 'mobileStart', val: Array.isArray(v) ? !!v[1] : false },
            { sub: 'remoteEnableRaw', val: JSON.stringify(v) },
        ],
    },
    ProcessAction: {
        states: [{ sub: 'processAction', role: 'value', type: 'number', def: 0, name: 'Process action' }],
        decode: (v) => [{ sub: 'processAction', val: v }],
    },
    DeviceAction: {
        states: [{ sub: 'deviceAction', role: 'value', type: 'number', def: 0, name: 'Device action' }],
        decode: (v) => [{ sub: 'deviceAction', val: v }],
    },
    Light: {
        states: [{ sub: 'light', role: 'switch.light', type: 'boolean', def: false, name: 'Light on' }],
        // Light: 0 = kein Licht/aus, 1 = an, 2 = aus (gerätespezifisch); >0 && !=2 → an
        decode: (v) => [{ sub: 'light', val: v === 1 }],
    },
    StandbyState: {
        states: [{ sub: 'standbyState', role: 'value', type: 'number', def: 0, name: 'Standby state' }],
        decode: (v) => [{ sub: 'standbyState', val: v }],
    },
    SpinningSpeed: {
        states: [{ sub: 'spinningSpeed', role: 'value', type: 'number', unit: 'rpm', def: 0, name: 'Spin speed' }],
        decode: (v) => [{ sub: 'spinningSpeed', val: v }],
    },
    DryingStep: {
        states: [
            { sub: 'dryingStep', role: 'value', type: 'number', def: 0, name: 'Drying step (raw)' },
            { sub: 'dryingStepText', role: 'text', type: 'string', def: '', name: 'Drying step' },
        ],
        decode: (v) => [{ sub: 'dryingStep', val: v }, { sub: 'dryingStepText', val: dryingStepTextDe(v) }],
    },
    SyncState: {
        states: [{ sub: 'syncState', role: 'value', type: 'number', def: 0, name: 'Sync state' }],
        decode: (v) => [{ sub: 'syncState', val: v }],
    },
    InternalState: {
        states: [{ sub: 'internalState', role: 'value', type: 'number', def: 0, name: 'Internal state' }],
        decode: (v) => [{ sub: 'internalState', val: v }],
    },
};

/** Ident-Felder → info-States (statisch). */
const IDENT_FIELDS = [
    { sub: 'connected', role: 'indicator.reachable', type: 'boolean', def: false, name: 'Connected / reachable' },
    { sub: 'techType', role: 'info.name', type: 'string', def: '', name: 'Model / TechType', path: ['DeviceIdentLabel', 'TechType'] },
    { sub: 'fabNumber', role: 'info.serial', type: 'string', def: '', name: 'Serial number', path: ['DeviceIdentLabel', 'FabNumber'] },
    { sub: 'matNumber', role: 'text', type: 'string', def: '', name: 'Material number', path: ['DeviceIdentLabel', 'MatNumber'] },
    { sub: 'deviceType', role: 'value', type: 'number', def: 0, name: 'Device type', path: ['DeviceType'] },
    { sub: 'xkmType', role: 'text', type: 'string', def: '', name: 'WiFi module type', path: ['XKMIdentLabel', 'TechType'] },
    { sub: 'xkmVersion', role: 'info.firmware', type: 'string', def: '', name: 'WiFi module firmware', path: ['XKMIdentLabel', 'ReleaseVersion'] },
    { sub: 'protocolVersion', role: 'value', type: 'number', def: 0, name: 'Protocol version', path: ['ProtocolVersion'] },
];

/** Steuer-States (beschreibbar, per Opcode). Nur angelegt, wenn allowControl. */
const CONTROL_STATES = [
    { sub: 'start', role: 'button.start', type: 'boolean', def: false, name: 'Start program', opcode: 0x01 },
    { sub: 'stop', role: 'button.stop', type: 'boolean', def: false, name: 'Stop program', opcode: 0x37 },
    { sub: 'pause', role: 'button.pause', type: 'boolean', def: false, name: 'Pause program', opcode: 0x03 },
    { sub: 'powerOn', role: 'button', type: 'boolean', def: false, name: 'Switch on', opcode: 0x10 },
    { sub: 'powerOff', role: 'button', type: 'boolean', def: false, name: 'Switch off', opcode: 0x13 },
    { sub: 'lightOn', role: 'button', type: 'boolean', def: false, name: 'Light on', opcode: 0x0d },
    { sub: 'lightOff', role: 'button', type: 'boolean', def: false, name: 'Light off', opcode: 0x0e },
];

// Geräteart je DeviceType (für den Objektnamen).
const DEVICE_CATEGORY = {
    1: 'Waschmaschine', 2: 'Trockner', 24: 'Waschtrockner',
    7: 'Spülmaschine', 12: 'Backofen', 13: 'Backofen mit Mikrowelle',
    15: 'Dampfgarer', 16: 'Dampfbackofen', 17: 'Kaffeevollautomat',
    18: 'Kühlschrank', 19: 'Gefrierschrank', 20: 'Kühl-Gefrier-Kombination',
    21: 'Weinkühlschrank', 23: 'Dunstabzug', 25: 'Kochfeld', 27: 'Mikrowelle',
    67: 'Wärmeschublade', 68: 'Wärmeschublade',
};

function deviceCategory(deviceType) {
    return DEVICE_CATEGORY[deviceType] || null;
}

// Gerätespezifische STATE_FIELDS nur beim passenden Gerätetyp anlegen/schreiben - sonst stünde z. B.
// die Schleuderdrehzahl auch bei Spülmaschine und Backofen (sinnlos). Key = STATE_FIELDS-Schlüssel,
// Wert = erlaubte deviceTypes. Nicht gelistete Felder gelten für ALLE Geräte (Status, Programm, …).
const FIELD_DEVICE_TYPES = {
    SpinningSpeed: [1, 24],   // Schleuderdrehzahl: Waschmaschine, Waschtrockner
    DryingStep: [2, 24],      // Trockenstufe: Trockner, Waschtrockner
};

/** true, wenn das STATE_FIELDS-Feld [key] für [deviceType] angelegt/geschrieben werden soll. */
function fieldAllowed(key, deviceType) {
    const allowed = FIELD_DEVICE_TYPES[key];
    return !allowed || allowed.includes(deviceType);
}

// Deutsche Datenpunkt-Namen (überlappende Punkte an mielecloudservice angelehnt).
const DE_NAMES = {
    state: {
        status: 'Status (Rohwert)', statusText: 'Status',
        programType: 'Programmart (Rohwert)', programTypeText: 'Programmart',
        programId: 'Programmbezeichnung (Rohwert)', programText: 'Programmbezeichnung',
        programPhase: 'Programmphase (Rohwert)', programPhaseText: 'Programmphase',
        remainingMinutes: 'Restzeit (Minuten)', remainingHHMM: 'Restzeit',
        estimatedEndTime: 'Voraussichtliches Ende', estimatedEndTimeText: 'Voraussichtliches Ende (Uhrzeit)',
        elapsedMinutes: 'Verstrichene Zeit (Minuten)', elapsedHHMM: 'Verstrichene Zeit',
        startInMinutes: 'Startvorwahl (Minuten)', startHHMM: 'Startvorwahl',
        targetTemperature: 'Zieltemperatur', targetTemperatureZone2: 'Zieltemperatur Zone 2', targetTemperatureZone3: 'Zieltemperatur Zone 3',
        temperature: 'Temperatur', temperatureZone2: 'Temperatur Zone 2', temperatureZone3: 'Temperatur Zone 3',
        signalInfo: 'Info-Signal', signalFailure: 'Störungssignal', signalDoor: 'Tür offen',
        mobileStart: 'MobileStart verfügbar', remoteEnableRaw: 'Fernsteuer-Freigabe (Rohwert)',
        processAction: 'Prozess-Aktion', deviceAction: 'Geräte-Aktion', light: 'Licht',
        standbyState: 'Standby-Zustand', spinningSpeed: 'Schleuderdrehzahl',
        dryingStep: 'Trockenstufe (Rohwert)', dryingStepText: 'Trockenstufe',
        syncState: 'Sync-Zustand', internalState: 'Interner Zustand',
    },
    info: {
        connected: 'Verbunden / Erreichbar',
        techType: 'Gerätetyp (Technik)', fabNumber: 'Seriennummer', matNumber: 'Materialnummer',
        deviceType: 'Gerätetyp', xkmType: 'Kommunikationsmodul-Typ', xkmVersion: 'Kommunikationsmodul-Firmware',
        protocolVersion: 'Protokollversion',
    },
    control: {
        start: 'Programm starten', stop: 'Programm stoppen', pause: 'Programm pausieren',
        powerOn: 'Einschalten', powerOff: 'Ausschalten', lightOn: 'Licht an', lightOff: 'Licht aus',
    },
};

/**
 * common.name für einen Datenpunkt: {en, de} wenn eine deutsche Übersetzung existiert,
 * sonst nur der englische Name. Bei german=false wird immer nur Englisch verwendet.
 */
function nameFor(channel, sub, en, german) {
    const de = DE_NAMES[channel] && DE_NAMES[channel][sub];
    if (german && de) return { en, de };
    return en;
}

function pathGet(obj, path) {
    let cur = obj;
    for (const p of path) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

module.exports = { STATE_FIELDS, IDENT_FIELDS, CONTROL_STATES, DE_NAMES, DEVICE_CATEGORY, deviceCategory, FIELD_DEVICE_TYPES, fieldAllowed, nameFor, timeToMinutes, temp, pathGet, TEMP_SENTINEL };
