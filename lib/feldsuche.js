'use strict';

/*
 * Aus gesammelten Zyklen ableiten, welches Feld Energie und Wasser traegt.
 *
 * WOZU
 * Die Feldindizes des Eco-Leaf (DOP2 2/6195) sind nicht dokumentiert. Sie wurden durch
 * Vergleich mit der Cloud erschlossen, gelten fuer eine Baureihe und koennen sich mit einem
 * Firmware-Update verschieben, ohne dass es jemand ankuendigt. Solange die Cloud noch
 * antwortet, gibt es einen unabhaengigen Massstab - dieser Modul nutzt ihn, um die
 * Zuordnung zu BELEGEN statt sie zu glauben.
 *
 * WAS DIESE SUCHE FRUEHER GEFUNDEN HAETTE
 * Der Adapter las das Wasser bis zum 28.08.2026 aus Feld 40 und meldete zehn Tage lang
 * unveraendert 95,3 l - fuer Seide (36 min) genauso wie fuer Baumwolle (214 min).
 * Aufgefallen ist es nur, weil jemand den Wert in der App merkwuerdig fand. Ein Feld, das
 * ueber alle Zyklen denselben Wert traegt, waehrend der Vergleichswert schwankt, kann diese
 * Groesse nicht sein - das ist die erste und wichtigste Regel hier.
 *
 * Ebenso die Energie: F25 und F26 stehen waehrend des ganzen Programms still und tragen
 * bestenfalls den zuletzt abgeschlossenen Lauf. Am 29.08.2026 ueber einen Waschgang von
 * 4:16 h gemessen - Shelly 1,884 kWh, Cloud 2 kWh, F25 dagegen 2,077 kWh unveraendert seit
 * dem Vorlauf.
 *
 * WAS DIESER MODUL NICHT TUT
 * Er entscheidet nichts. Er liefert eine Rangfolge mit Belegzahlen; ob eine Zuordnung
 * uebernommen wird, bleibt eine Entscheidung des Menschen davor. Eine automatisch
 * umgestellte Feldzuordnung waere genau die Art Aenderung, die niemand bemerkt, bis die
 * Jahresstatistik nicht mehr stimmt.
 */

/** Teiler, die bei Miele vorkommen: ganze Einheiten, Zehntel, Hundertstel, Tausendstel. */
const TEILER = [1, 10, 100, 1000];

/** Unter so vielen Vergleichszyklen ist jede Aussage Zufall. */
const MIN_ZYKLEN = 3;

/**
 * Ab welcher mittleren Abweichung ein Feld noch als Treffer gilt.
 *
 * Zehn Prozent klingt grosszuegig, ist es aber nicht: Die Cloud rundet (sie liefert "2 kWh"
 * fuer 1,884 gemessene), und zwischen dem lokalen Abruf und dem Cloud-Stand liegen Minuten.
 * Wer hier auf ein Prozent geht, verwirft die richtige Zuordnung wegen der Rundung.
 */
const TREFFER_GRENZE = 0.10;

/** Zahl aus einem Feldwert machen - Bigint, String und Verschachteltes verkraften. */
function alsZahl(v) {
    if (v == null) return null;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * Die Vergleichswerte eines Datensatzes - Cloud bevorzugt, sonst die Ablesung aus der App.
 *
 * Die Cloud zuerst, weil sie ohne Zutun kommt und deshalb bei jedem Zyklus da ist. Die
 * manuelle Ablesung ist genauer, aber es gibt sie nur, wo jemand hingesehen hat.
 */
function vergleichswert(satz, groesse) {
    for (const quelle of ['cloud', 'manuell']) {
        const w = satz[quelle] && alsZahl(satz[quelle][groesse]);
        if (w != null && w > 0) return { wert: w, quelle };
    }
    return null;
}

/**
 * Ein einzelnes Feld gegen die Vergleichswerte halten.
 *
 * @param {Array}  saetze  Datensaetze mit .felder und .cloud/.manuell
 * @param {string} index   Feldindex als Schluessel in .felder
 * @param {string} groesse 'waterL' oder 'energyKwh'
 * @returns {object|null}  Bewertung oder null, wenn zu wenige Zyklen
 */
function feldPruefen(saetze, index, groesse) {
    const paare = [];
    for (const satz of saetze) {
        const v = vergleichswert(satz, groesse);
        if (!v) continue;
        const roh = alsZahl(satz.felder && satz.felder[index]);
        if (roh == null) continue;
        paare.push({ roh, soll: v.wert });
    }
    if (paare.length < MIN_ZYKLEN) return null;

    /*
     * Ein Feld, das sich nie aendert, kann keine Groesse sein, die sich aendert.
     *
     * Das ist die Regel, an der Feld 40 mit seinen konstanten 95,3 l gescheitert waere. Sie
     * greift nur, wenn der Vergleichswert selbst schwankt - liefen zufaellig drei gleiche
     * Programme hintereinander, ist auch ein konstantes Feld kein Widerspruch.
     */
    const rohWerte = paare.map(p => p.roh);
    const sollWerte = paare.map(p => p.soll);
    const rohKonstant = new Set(rohWerte).size === 1;
    const sollKonstant = new Set(sollWerte).size === 1;
    if (rohKonstant && !sollKonstant) {
        return { index, teiler: null, abweichung: null, zyklen: paare.length,
                 konstant: true, taugt: false,
                 grund: `Feld steht konstant auf ${rohWerte[0]}, waehrend der Vergleichswert schwankt` };
    }

    // Den Teiler suchen, unter dem das Feld am besten passt.
    let bester = null;
    for (const teiler of TEILER) {
        const fehler = paare.map(p => Math.abs(p.roh / teiler - p.soll) / p.soll);
        const mittel = fehler.reduce((a, b) => a + b, 0) / fehler.length;
        const groesster = Math.max(...fehler);
        if (!bester || mittel < bester.abweichung) {
            bester = { teiler, abweichung: mittel, groessteAbweichung: groesster };
        }
    }
    return {
        index,
        teiler: bester.teiler,
        abweichung: bester.abweichung,
        groessteAbweichung: bester.groessteAbweichung,
        zyklen: paare.length,
        konstant: rohKonstant,
        taugt: bester.abweichung <= TREFFER_GRENZE,
    };
}

/**
 * Alle Felder bewerten und nach Eignung sortieren.
 *
 * @returns {Array} Bewertungen, bester Treffer zuerst; untaugliche ans Ende
 */
function felderBewerten(saetze, groesse) {
    const liste = Array.isArray(saetze) ? saetze : [];
    const indizes = new Set();
    for (const satz of liste) {
        for (const k of Object.keys((satz && satz.felder) || {})) indizes.add(k);
    }
    const bewertet = [];
    for (const index of indizes) {
        const b = feldPruefen(liste, index, groesse);
        if (b) bewertet.push(b);
    }
    return bewertet.sort((a, b) => {
        if (a.taugt !== b.taugt) return a.taugt ? -1 : 1;
        if (a.abweichung == null) return 1;
        if (b.abweichung == null) return -1;
        return a.abweichung - b.abweichung;
    });
}

/**
 * Wie viele Zyklen taugen ueberhaupt zum Vergleich?
 *
 * Ohne diese Zahl liesse sich ein Ergebnis nicht einordnen: "Feld 26 passt" heisst etwas
 * anderes bei drei Zyklen als bei dreissig.
 */
function belegbar(saetze, groesse) {
    return (Array.isArray(saetze) ? saetze : [])
        .filter(s => vergleichswert(s, groesse) != null).length;
}

/**
 * Das Ergebnis in einem Satz - fuer den Datenpunkt, den ein Mensch liest.
 *
 * @param {Array} saetze      gesammelte Zyklen
 * @param {object} eingestellt aktuell konfigurierte Indizes {energie, wasser, wasserTeiler}
 */
function befund(saetze, eingestellt = {}) {
    const zeilen = [];
    for (const [groesse, beschriftung, gesetzt] of [
        ['energyKwh', 'Energie', eingestellt.energie],
        ['waterL', 'Wasser', eingestellt.wasser],
    ]) {
        const n = belegbar(saetze, groesse);
        if (n < MIN_ZYKLEN) {
            zeilen.push(`${beschriftung}: ${n} Zyklen mit Vergleichswert - mindestens ${MIN_ZYKLEN} noetig.`);
            continue;
        }
        const rang = felderBewerten(saetze, groesse);
        const beste = rang.filter(b => b.taugt);
        if (!beste.length) {
            const nah = rang.find(b => b.abweichung != null);
            zeilen.push(`${beschriftung}: kein Feld passt zu den ${n} Vergleichswerten`
                + (nah ? ` (am naechsten Feld ${nah.index} mit ${(nah.abweichung * 100).toFixed(0)} % Abweichung)` : '')
                + '.');
            continue;
        }
        const b = beste[0];
        const teil = `${beschriftung}: Feld ${b.index}`
            + (b.teiler !== 1 ? ` geteilt durch ${b.teiler}` : '')
            + ` passt auf ${(b.abweichung * 100).toFixed(1)} % genau (${b.zyklen} Zyklen)`;
        const konflikt = gesetzt != null && String(gesetzt) !== String(b.index)
            ? ` - eingestellt ist aber Feld ${gesetzt}` : '';
        const zweiter = beste.length > 1
            ? `; auch Feld ${beste[1].index} passt (${(beste[1].abweichung * 100).toFixed(1)} %), die Zuordnung ist noch nicht eindeutig` : '';
        zeilen.push(teil + konflikt + zweiter + '.');
    }
    return zeilen.join(' ');
}

module.exports = { TEILER, MIN_ZYKLEN, TREFFER_GRENZE, alsZahl, vergleichswert,
                   feldPruefen, felderBewerten, belegbar, befund };
