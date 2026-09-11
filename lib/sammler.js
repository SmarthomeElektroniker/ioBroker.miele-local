'use strict';

/*
 * Datensammlung fuer die Feldzuordnung fremder Miele-Modelle.
 *
 * WOZU
 * Die Feldindizes des Eco-Leaf (DOP2 2/6195) unterscheiden sich je Baureihe. Bei der WCR860
 * liegt die Energie auf Feld 25, das Wasser vermutlich auf 26 - "vermutlich", weil sich das
 * nur an einem echten Geraet mit bekannten Vergleichswerten belegen laesst. Wer ein anderes
 * Modell hat und mitmachen moechte, schaltet diese Sammlung ein: Sie schreibt je Waschgang
 * einen vollstaendigen Datensatz mit, aus dem sich die richtigen Indizes ablesen lassen.
 *
 * DATENSCHUTZ
 * Die Sammlung ist ausgeschaltet, solange niemand sie einschaltet, und die Daten bleiben in
 * der eigenen ioBroker-Instanz. Der Adapter versendet nichts, wertet nichts aus und ruft
 * nichts ab. Wer seine Datensaetze beisteuern will, kopiert den Datenpunkt selbst und schickt
 * ihn dorthin, wo er ihn haben will.
 *
 * Was NICHT mitgeschrieben wird: die Seriennummer (fabNumber). Sie identifiziert ein
 * einzelnes Geraet und damit einen Haushalt; fuer die Feldzuordnung genuegt die
 * Modellbezeichnung. Ebenso wenig Zeitpunkte im Klartext ausserhalb der Programmdauer -
 * gespeichert wird, wie lange ein Programm lief, nicht wann jemand waescht.
 */

/** So viele Zyklen braucht es, bis eine Feldzuordnung belastbar ist. */
const ZYKLEN_ZIEL = 10;

/** Mehr als so viele Datensaetze werden nicht aufgehoben - der Punkt bliebe sonst unbegrenzt. */
const MAX_DATENSAETZE = 60;

/**
 * Einen Datensatz aus den Rohdaten eines beendeten Programms bauen.
 *
 * @param {object} q  Quellen:
 *   modell      {techType, matNumber, xkmType, xkmVersion, protocolVersion}
 *   programm    {id, text, art, artText, dauerMin, temperatur}
 *   felder      {index: wert} aus dem Eco-Leaf, vollstaendig
 *   zustand     {index: wert} weitere Leafs, soweit gelesen
 *   cloud       {energyKwh, waterL} oder null - nur wenn der Nutzer den Vergleich einschaltet
 *   manuell     {energyKwh, waterL} oder null - Ablesung aus der Miele-App
 * @returns {object} Datensatz ohne geraeteidentifizierende Angaben
 */
function datensatzBauen(q) {
    const satz = {
        // Version des Datensatzformats - ohne sie waeren spaetere Auswertungen Raten.
        v: 1,
        modell: {
            techType: q.modell && q.modell.techType,
            matNumber: q.modell && q.modell.matNumber,
            xkmType: q.modell && q.modell.xkmType,
            xkmVersion: q.modell && q.modell.xkmVersion,
            protokoll: q.modell && q.modell.protocolVersion,
        },
        programm: {
            id: q.programm && q.programm.id,
            text: q.programm && q.programm.text,
            art: q.programm && q.programm.art,
            artText: q.programm && q.programm.artText,
            dauerMin: q.programm && q.programm.dauerMin,
            temperatur: q.programm && q.programm.temperatur,
        },
        felder: q.felder || {},
    };
    if (q.zustand && Object.keys(q.zustand).length) satz.zustand = q.zustand;
    /*
     * Der gemessene Verbrauch aus der Messsteckdose, in Wh.
     *
     * main.js reichte ihn seit dem 07.09.2026 herein - und hier ging er verloren, weil dieser
     * Satz ihn nie uebernahm. Am 11.09.2026 fiel es auf: In allen 28 gesammelten Zyklen der
     * WCR860 stand kein einziger Messwert, obwohl die Zyklushistorie daneben sie lueckenlos
     * fuehrte (144,7 Wh fuer Seide, 1027,7 Wh fuer Baumwolle ...). Die Feldsuche hatte damit
     * fuer die Energie nie einen belastbaren Vergleichswert, nur die auf 0,1 kWh gerundete Cloud.
     */
    if (typeof q.gemessenWh === 'number' && q.gemessenWh > 0) satz.gemessenWh = q.gemessenWh;
    /*
     * Welche Groessen dieses Zyklus KEIN Endwert sind.
     *
     * Der Datensatz bleibt vollstaendig - Rohfelder, Programm, Cloud-Wert, alles steht da und
     * laesst sich spaeter ansehen. Vermerkt wird nur, dass die lokale Ablesung den Schluss
     * nicht mehr erwischt hat; die Feldsuche laesst diese Groesse dann aus, statt sie als
     * Abweichung zu verrechnen. Siehe lib/eco.js (ablesungBewerten) und feldsuche.vergleichswert.
     */
    if (q.unvollstaendig && Object.keys(q.unvollstaendig).length) {
        satz.unvollstaendig = q.unvollstaendig;
    }
    if (q.cloud && (q.cloud.energyKwh != null || q.cloud.waterL != null)) satz.cloud = q.cloud;
    if (q.manuell && (q.manuell.energyKwh != null || q.manuell.waterL != null)) satz.manuell = q.manuell;
    return satz;
}

/**
 * Einen Datensatz in die Sammlung aufnehmen.
 *
 * @param {Array} bisher   bisherige Datensaetze
 * @param {object} satz    der neue
 * @returns {Array} die neue Sammlung, auf MAX_DATENSAETZE begrenzt
 */
function aufnehmen(bisher, satz) {
    const liste = Array.isArray(bisher) ? bisher.slice() : [];
    liste.push(satz);
    return liste.slice(-MAX_DATENSAETZE);
}

/**
 * Den zuletzt aufgenommenen Datensatz um Werte aus der Miele-App ergaenzen.
 *
 * Die App zeigt Energie und Wasser eines Programms erst, wenn es beendet ist - oft mit
 * Verzoegerung, und ablesen muss sie ohnehin ein Mensch. Deshalb nachtraeglich.
 *
 * @returns {Array} die Sammlung mit ergaenztem letztem Satz, oder die unveraenderte Liste
 */
function manuellNachtragen(bisher, werte) {
    const liste = Array.isArray(bisher) ? bisher.slice() : [];
    if (!liste.length) return liste;
    if (!werte || (werte.energyKwh == null && werte.waterL == null)) return liste;
    const letzter = Object.assign({}, liste[liste.length - 1]);
    letzter.manuell = Object.assign({}, letzter.manuell, werte);
    liste[liste.length - 1] = letzter;
    return liste;
}

/**
 * Wie weit ist die Sammlung, und was fehlt noch?
 *
 * Der Text steht als eigener Datenpunkt in der Instanz - er ist die einzige Rueckmeldung, die
 * jemand bekommt, der beim Sammeln hilft.
 */
function fortschritt(liste) {
    const n = Array.isArray(liste) ? liste.length : 0;
    const mitVergleich = (liste || []).filter(s => s.cloud || s.manuell).length;
    if (!n) {
        return `Noch keine Zyklen erfasst. Mindestens ${ZYKLEN_ZIEL} verschiedene Programme `
            + `sammeln - je unterschiedlicher, desto eindeutiger die Zuordnung.`;
    }
    const fehlt = Math.max(0, ZYKLEN_ZIEL - n);
    const teile = [`${n} Zyklen erfasst`];
    teile.push(mitVergleich
        ? `${mitVergleich} davon mit Vergleichswert`
        : `noch keiner mit Vergleichswert - ohne ihn laesst sich kein Feld zuordnen`);
    teile.push(fehlt
        ? `noch ${fehlt} bis zum Richtwert von ${ZYKLEN_ZIEL}`
        : `Richtwert von ${ZYKLEN_ZIEL} erreicht`);
    return teile.join(', ') + '.';
}

module.exports = { ZYKLEN_ZIEL, MAX_DATENSAETZE, datensatzBauen, aufnehmen,
                   manuellNachtragen, fortschritt };
