'use strict';

/*
 * Die Objekt-IDs, die nicht englisch sind - gesammelt an einer Stelle.
 *
 * WOZU DIESE DATEI. Der Adapter benennt seine Objekte durchgaengig englisch: control, eco,
 * state, stats, info. Ein Kanal faellt heraus - "sammlung" traegt ausschliesslich deutsche
 * IDs -, dazu vier deutsche Namen mitten im englischen Kanal "history". Zusammen 57 von 446
 * Objekten. Im Aufnahmeantrag (ioBroker/ioBroker.repositories#6471) hat der Pruefer das am
 * 11.09.2026 beanstandet: Ein Abzug, der ueberfliegend gelesen wird, sieht dort nach von Hand
 * angelegten Skript-Datenpunkten aus statt nach Adapter-Objekten.
 *
 * Ob umbenannt wird, ist noch nicht entschieden - eine Umbenennung bricht bestehende Anlagen,
 * die Historie und fremde Anwendungen, die daran haengen. Damit diese Entscheidung spaeter
 * nicht zu einer Suchaktion quer durch den Quelltext wird, stehen die IDs nur noch hier.
 *
 * AUFBAU. Der Schluessel ist der bleibende, englische Name, der Wert die tatsaechliche ID.
 * Eine Umbenennung ist damit ein Tausch der WERTE - der uebrige Quelltext bleibt unberuehrt.
 * Wer umbenennt, muss ausserdem an die Migration bestehender Objekte denken; ohne sie stehen
 * die alten Datenpunkte verwaist daneben.
 */

/** Kanalnamen, die nicht englisch sind. */
const KANAL = {
    collection: 'sammlung',
};

/** Datenpunkte im Kanal der Datensammlung. */
const SAMMLUNG = {
    records: 'datenJson',
    cycles: 'zyklen',
    progress: 'fortschritt',
    finding: 'befund',
    check: 'kontrolle',
    checkJson: 'kontrolleJson',
    scan: 'leafScan',
    scanState: 'leafScanStand',
    scanJson: 'leafScanJson',
    trendJson: 'leafVerlaufJson',
    trendSize: 'leafVerlaufStand',
    trendLeaf: 'leafVerlaufFein',
    inputEnergy: 'eingabeEnergie',
    inputWater: 'eingabeWasser',
};

/** Die vier deutschen Namen im sonst englischen Kanal "history". */
const HISTORY = {
    measuredLast: 'gemessenLetzter',
    measuredTotal: 'gemessenTotal',
    runningSince: 'laufendSeit',
    meterAtStart: 'zaehlerStart',
};

/**
 * Voller Pfad eines Datenpunkts der Datensammlung.
 *
 * @param {string} deviceId
 * @param {string} schluessel Schluessel aus SAMMLUNG, etwa "finding"
 * @returns {string}
 */
function s(deviceId, schluessel) {
    const id = SAMMLUNG[schluessel];
    if (!id) throw new Error(`unbekannter Datenpunkt der Sammlung: ${schluessel}`);
    return `${deviceId}.${KANAL.collection}.${id}`;
}

/**
 * Voller Pfad eines Verlaufs-Datenpunkts mit deutschem Namen.
 *
 * @param {string} deviceId
 * @param {string} schluessel Schluessel aus HISTORY, etwa "runningSince"
 * @returns {string}
 */
function h(deviceId, schluessel) {
    const id = HISTORY[schluessel];
    if (!id) throw new Error(`unbekannter Datenpunkt des Verlaufs: ${schluessel}`);
    return `${deviceId}.history.${id}`;
}

/** Der Kanal der Datensammlung selbst. */
function kanal(deviceId) {
    return `${deviceId}.${KANAL.collection}`;
}

module.exports = { KANAL, SAMMLUNG, HISTORY, s, h, kanal };
