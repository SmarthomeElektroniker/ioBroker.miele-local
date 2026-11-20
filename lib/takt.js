'use strict';

/*
 * Abfragetakt je Geraet (seit 0.3.46).
 *
 * Bis 0.3.45 galt der kurze Takt fuer ALLE Geraete, sobald eines lief: Backte der Ofen, wurden
 * Wasch- und Spuelmaschine im Minutentakt mitgefragt, obwohl sie aus waren. Ein XKM-Modul bedient
 * nur eine Verbindung gleichzeitig - jede ueberfluessige Frage nimmt der Miele-App einen
 * Zeitschlitz weg. Jetzt hat jedes Geraet seinen eigenen Termin: kurz, solange es laeuft, sonst
 * der Ruhetakt. Die Schleife wacht zum fruehesten Termin auf und fragt nur, wer dran ist.
 */

/** Status, bei denen ein Geraet "aktiv" ist und im Betriebstakt gefragt wird. */
const AKTIV_STATUS = new Set([3, 4, 5, 6, 7, 9, 13, 14, 15]);

/**
 * Wie lange ein frisch eingeschaltetes Geraet (Status 2 "Ein") im Betriebstakt bleibt.
 *
 * Gleich nach dem Einschalten meldet /State Status 2 und ProgramID 0 - auch an einer Maschine mit
 * Drehwaehler, die dabei laengst auf einem Programm steht. Erst spaeter folgen
 * Status 3 ("Programmiert") und die gewaehlte Programmnummer (WCR860: 24.10. und 06.11.2026 je
 * 2 -> 3 bei der naechsten Abfrage). Im Ruhetakt (120 s) kam diese naechste Abfrage am 20.11.2026
 * zu spaet: eingeschaltet 07:36:42, abgefragt 07:36:52 (2, Programm 0), ausgeschaltet 07:38:13,
 * abgefragt 07:38:52 (1) - das gewaehlte Programm stand nie im Adapter.
 *
 * Begrenzt, weil manche Geraete lange auf "Ein" stehen (Waschmaschine 10.11.2026: 14 min ohne
 * Programmwahl); danach gilt wieder der Ruhetakt.
 */
const EIN_BETRIEBSTAKT_MS = 5 * 60_000;

/**
 * Wird dieses Geraet im Betriebstakt gefragt?
 *
 * @param {number} status Status aus /State
 * @param {number|null|undefined} einSeit Zeitpunkt (ms), seit dem das Geraet auf Status 2 steht
 * @param {number} jetzt Zeitpunkt in ms
 * @returns {boolean} true fuer den kurzen Takt
 */
function imBetriebstakt(status, einSeit, jetzt) {
    if (AKTIV_STATUS.has(status)) {
        return true;
    }
    return status === 2 && einSeit != null && jetzt - einSeit < EIN_BETRIEBSTAKT_MS;
}

/** Kein Wecken in kuerzeren Abstaenden als diesem - auch wenn mehrere Termine dicht liegen. */
const MIN_WECKABSTAND_MS = 1000;

/**
 * Abstand bis zur naechsten Abfrage eines Geraets.
 *
 * @param {{active?: boolean}} dev Geraeteeintrag
 * @param {number} aktivMs Takt im Betrieb
 * @param {number} ruheMs Takt in Ruhe
 * @returns {number} Millisekunden
 */
function abstand(dev, aktivMs, ruheMs) {
    return dev && dev.active ? aktivMs : ruheMs;
}

/**
 * Ist dieses Geraet jetzt dran? Ein Geraet ohne Termin (gerade gefunden) ist sofort dran.
 *
 * @param {{naechsteAbfrage?: number}} dev Geraeteeintrag
 * @param {number} jetzt Zeitpunkt in ms
 * @returns {boolean} true, wenn es jetzt abgefragt werden soll
 */
function istFaellig(dev, jetzt) {
    return (dev.naechsteAbfrage || 0) <= jetzt;
}

/**
 * Wann die Schleife wieder aufwachen soll: zum fruehesten Termin aller Geraete.
 *
 * @param {Array<{naechsteAbfrage?: number}>} geraete alle Geraeteeintraege
 * @param {number} jetzt Zeitpunkt in ms
 * @param {number} ruheMs Abstand, wenn (noch) kein Geraet bekannt ist
 * @returns {number} Millisekunden bis zum naechsten Durchgang
 */
function weckAbstand(geraete, jetzt, ruheMs) {
    if (!geraete.length) {
        return ruheMs;
    }
    const fruehester = Math.min(...geraete.map(d => d.naechsteAbfrage || 0));
    return Math.max(MIN_WECKABSTAND_MS, fruehester - jetzt);
}

module.exports = {
    abstand,
    istFaellig,
    weckAbstand,
    imBetriebstakt,
    AKTIV_STATUS,
    EIN_BETRIEBSTAKT_MS,
    MIN_WECKABSTAND_MS,
};
