'use strict';

/*
 * Laufende Kontrolle der EINGESTELLTEN Feldzuordnung.
 *
 * WOZU - UND WORIN SIE SICH VON DER FELDSUCHE UNTERSCHEIDET
 * lib/feldsuche.js fragt "welches Feld traegt die Groesse?" und durchsucht dafuer alle
 * Felder. Dieser Modul fragt etwas Engeres, dafuer Dauerhaftes: "liefert das Feld, das
 * gerade eingestellt ist, weiterhin richtige Werte?" - Zyklus fuer Zyklus, mit Verlauf.
 *
 * Das ist noetig, weil eine einmal belegte Zuordnung nicht fuer immer gilt. Am 04.09.2026
 * wurde Feld 21 als Wasserzaehler nachgewiesen (0,49 % mittlere Abweichung ueber acht
 * Zyklen). Ein Firmware-Update kann die Feldreihenfolge verschieben, ohne dass es jemand
 * ankuendigt - und dann stimmen die Zahlen weiter plausibel, nur eben nicht mehr.
 *
 * SOLANGE DIE CLOUD LAEUFT, IST SIE DER MASSSTAB. Faellt sie weg, bleibt die Ablesung aus
 * der Miele-App; die Kontrolle rechnet mit beidem und schreibt dazu, woher der
 * Vergleichswert kam.
 */

/** Ab welcher Abweichung ein einzelner Zyklus als Ausreisser gilt. */
const AUSREISSER = 0.10;

/**
 * Ab wie vielen Ausreissern in Folge gemeldet wird.
 *
 * Nicht beim ersten: Die Cloud rundet auf ganze Liter, und zwischen dem lokalen Abruf und
 * dem Cloud-Stand liegen Minuten. Ein einzelner Ausschlag ist Rauschen. Drei hintereinander
 * sind es nicht mehr - dann hat sich etwas geaendert.
 */
const AUSREISSER_BIS_MELDUNG = 3;

/** So viele Vergleiche werden aufgehoben - der Datenpunkt soll lesbar bleiben. */
const MAX_VERLAUF = 40;

/** Zahl aus einem Wert machen; alles Unbrauchbare wird null. */
function alsZahl(v) {
    if (v == null) return null;
    if (typeof v === 'bigint') return Number(v);
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * Einen Vergleich bilden.
 *
 * @param {object} q
 *   lokal    {energyKwh, waterL}  was der Adapter aus dem Leaf gelesen hat
 *   cloud    {energyKwh, waterL}  oder null
 *   manuell  {energyKwh, waterL}  oder null - Ablesung aus der Miele-App
 *   programm Text, nur zur Einordnung im Verlauf
 *   zeit     Zeitstempel in ms (von aussen, damit der Modul pruefbar bleibt)
 * @returns {object|null} Vergleich, oder null wenn nichts zu vergleichen war
 */
function vergleichen(q) {
    const eintrag = { zeit: q.zeit, programm: q.programm || null, werte: {} };
    let etwas = false;
    for (const groesse of ['waterL', 'energyKwh']) {
        const lokal = alsZahl(q.lokal && q.lokal[groesse]);
        let soll = null, quelle = null;
        for (const [name, topf] of [['cloud', q.cloud], ['manuell', q.manuell]]) {
            const w = alsZahl(topf && topf[groesse]);
            if (w != null && w > 0) { soll = w; quelle = name; break; }
        }
        /*
         * Eine Null heisst "nichts geliefert", nicht "null Liter".
         *
         * Am 04.09.2026 nachgezaehlt: Die Eco-Felder stehen in sieben von elf Zyklen auf 0,
         * weil die Maschine sie zurueckstellt, bevor der Abruf sie erwischt. Solche Zyklen
         * gehoeren in die Zaehlung der Luecken, nicht in die der Abweichungen.
         */
        if (soll == null) continue;
        if (lokal == null || lokal === 0) {
            eintrag.werte[groesse] = { lokal, soll, quelle, fehlt: true };
            etwas = true;
            continue;
        }
        eintrag.werte[groesse] = {
            lokal, soll, quelle,
            abweichung: Math.round(Math.abs(lokal - soll) / soll * 10000) / 10000,
        };
        etwas = true;
    }
    return etwas ? eintrag : null;
}

/** Einen Vergleich in den Verlauf aufnehmen. */
function aufnehmen(bisher, eintrag) {
    const liste = Array.isArray(bisher) ? bisher.slice() : [];
    if (eintrag) liste.push(eintrag);
    return liste.slice(-MAX_VERLAUF);
}

/**
 * Wie steht es um eine Groesse - im Klartext.
 *
 * Getrennt nach drei Zahlen, weil sie Verschiedenes bedeuten: wie GENAU die Werte sind
 * (mittlere Abweichung), wie ZUVERLAESSIG sie kommen (Luecken), und ob es gerade
 * WEGLAEUFT (Ausreisser in Folge). Ein Feld kann genau und trotzdem unbrauchbar sein, wenn
 * es die Haelfte der Zyklen ueberspringt.
 */
function stand(verlauf, groesse) {
    const liste = (Array.isArray(verlauf) ? verlauf : [])
        .map(e => e.werte && e.werte[groesse]).filter(Boolean);
    if (!liste.length) return { zyklen: 0, text: 'noch kein Vergleich' };

    const mitWert = liste.filter(w => !w.fehlt && w.abweichung != null);
    const luecken = liste.length - mitWert.length;
    if (!mitWert.length) {
        return { zyklen: 0, luecken, text: `kein einziger Wert in ${liste.length} Zyklen - `
            + 'das Feld liefert nichts' };
    }
    const mittel = mitWert.reduce((a, w) => a + w.abweichung, 0) / mitWert.length;
    const groesste = Math.max(...mitWert.map(w => w.abweichung));

    // Ausreisser am Ende der Reihe - nur die zaehlen, alte sind Geschichte.
    let inFolge = 0;
    for (let i = mitWert.length - 1; i >= 0; i--) {
        if (mitWert[i].abweichung > AUSREISSER) inFolge++;
        else break;
    }
    const quellen = [...new Set(mitWert.map(w => w.quelle))].join(' und ');
    let text = `${mitWert.length} Vergleiche gegen ${quellen}: im Mittel `
        + `${(mittel * 100).toFixed(1)} % Abweichung, groesste ${(groesste * 100).toFixed(1)} %`;
    if (luecken) text += `; ${luecken} Zyklen ohne lokalen Wert`;
    if (inFolge >= AUSREISSER_BIS_MELDUNG) {
        text += `. ACHTUNG: die letzten ${inFolge} Zyklen lagen ueber `
            + `${AUSREISSER * 100} % - die Feldzuordnung koennte nicht mehr stimmen`;
    }
    return { zyklen: mitWert.length, luecken, mittel, groesste, inFolge,
             warnt: inFolge >= AUSREISSER_BIS_MELDUNG, text };
}

/** Beide Groessen in einem Satz - fuer den Datenpunkt, den ein Mensch liest. */
function bericht(verlauf) {
    const teile = [];
    for (const [groesse, beschriftung] of [['waterL', 'Wasser'], ['energyKwh', 'Energie']]) {
        const s = stand(verlauf, groesse);
        if (s.zyklen || s.luecken) teile.push(`${beschriftung}: ${s.text}.`);
    }
    return teile.length ? teile.join(' ') : 'noch keine Vergleiche aufgezeichnet.';
}

module.exports = { AUSREISSER, AUSREISSER_BIS_MELDUNG, MAX_VERLAUF,
                   alsZahl, vergleichen, aufnehmen, stand, bericht };
