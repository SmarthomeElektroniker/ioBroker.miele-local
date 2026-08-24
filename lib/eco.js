'use strict';

/*
 * Wann lohnt sich eine EcoFeedback-Abfrage?
 *
 * Das DOP2-Leaf 2/6195 antwortet nur, solange das Geraet wach ist. Eine ausgeschaltete
 * Maschine meldet HTTP 500 - keine Aussage ueber das Modell, nur ueber den Augenblick.
 * Belegt an der Waschmaschine: Ihr letzter Wert kam am 23.08.2026 um 11:24, mitten im
 * Programm. Danach stand sie still, und jede weitere Anfrage ging ins Leere - eine pro
 * Minute, ueber Tage. Jede belegt das XKM-Modul, das ohnehin nur eine gleichzeitig
 * beantwortet.
 *
 * Gefragt wird deshalb nur noch:
 *   - waehrend ein Programm laeuft,
 *   - im Nachlauf danach, weil der Schlussstand erst nach dem Statuswechsel feststeht,
 *   - einmal beim Start, damit ueberhaupt erkennbar ist, ob ein Modell den Leaf kennt.
 */

/** Wie lange nach dem Programmende weiter gefragt wird. */
const NACHLAUF_MS = 10 * 60 * 1000;

/** Wie oft derselbe Wert kommen muss, damit der Nachlauf vorzeitig endet. */
const STABIL_MAX = 2;

/**
 * @param {boolean} erkundet  Wurde dieses Geraet seit dem Adapterstart schon einmal gefragt?
 * @param {{ecoLaeuft?: boolean, ecoNachlaufBis?: number}} dev  Zustand des Geraets
 * @param {number} [jetzt]  Zeitpunkt, standardmaessig die aktuelle Zeit
 */
function abfragenSinnvoll(erkundet, dev, jetzt = Date.now()) {
    if (!erkundet) return true;
    if (!dev) return false;
    if (dev.ecoLaeuft) return true;
    return !!(dev.ecoNachlaufBis && jetzt < dev.ecoNachlaufBis);
}

/**
 * Nachlauf fortschreiben: Aendert sich der Wert nicht mehr, steht der Schlussstand fest.
 *
 * Gibt den neuen Zustand zurueck, statt das Geraeteobjekt zu veraendern - so laesst sich die
 * Regel pruefen, ohne einen Adapter zu bauen.
 */
function nachlaufFortschreiben(dev, wert) {
    if (dev.ecoLaeuft || !dev.ecoNachlaufBis) {
        return { ecoLetzter: wert, ecoStabil: 0, ecoNachlaufBis: dev.ecoNachlaufBis || 0 };
    }
    const stabil = wert === dev.ecoLetzter ? (dev.ecoStabil || 0) + 1 : 0;
    return {
        ecoLetzter: wert,
        ecoStabil: stabil,
        ecoNachlaufBis: stabil >= STABIL_MAX ? 0 : dev.ecoNachlaufBis,
    };
}

module.exports = { NACHLAUF_MS, STABIL_MAX, abfragenSinnvoll, nachlaufFortschreiben };
