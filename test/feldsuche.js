'use strict';

const { expect } = require('chai');
const fs = require('../lib/feldsuche');

/*
 * Die Feldsuche an den Faellen pruefen, die es wirklich gab.
 *
 * Jeder dieser Tests bildet einen Fehlgriff nach, der im Betrieb passiert ist. Sie sind
 * damit keine erfundenen Beispiele, sondern die Belege dafuer, dass die Suche genau das
 * findet, was Monate lang niemandem aufgefallen ist.
 */

/** Ein Zyklus, wie ihn der Sammler ablegt. */
function zyklus(felder, cloud) {
    return { v: 1, modell: { techType: 'WCR860' }, programm: {}, felder, cloud };
}

describe('Feldsuche: Wasser', () => {
    /*
     * Der Fall vom 28.08.2026: Der Adapter las Feld 40, das konstant 95,3 l meldete - fuer
     * Seide (36 min) genauso wie fuer Baumwolle (214 min). Feld 26 traegt die Zehntelliter
     * und folgt der Cloud.
     */
    const saetze = [
        zyklus({ 26: 1160, 40: 953, 4: 109 }, { waterL: 116 }),
        zyklus({ 26: 370, 40: 953, 4: 109 }, { waterL: 37 }),
        zyklus({ 26: 540, 40: 953, 4: 122 }, { waterL: 54 }),
        zyklus({ 26: 890, 40: 953, 4: 118 }, { waterL: 89 }),
    ];

    it('findet das Feld, das der Cloud folgt', () => {
        const rang = fs.felderBewerten(saetze, 'waterL');
        expect(rang[0].index).to.equal('26');
        expect(rang[0].teiler).to.equal(10);
        expect(rang[0].taugt).to.be.true;
    });

    it('verwirft ein Feld, das konstant bleibt, waehrend der Vergleichswert schwankt', () => {
        // GENAU DER FEHLER VON FELD 40. Ohne diese Regel gaebe es keinen Hinweis darauf,
        // dass zehn Tage lang derselbe Wert gemeldet wurde.
        const vierzig = fs.felderBewerten(saetze, 'waterL').find(b => b.index === '40');
        expect(vierzig.taugt).to.be.false;
        expect(vierzig.konstant).to.be.true;
        expect(vierzig.grund).to.match(/konstant/);
    });

    it('nennt das eingestellte Feld, wenn es ein anderes ist als das gefundene', () => {
        const text = fs.befund(saetze, { wasser: 40 });
        expect(text).to.match(/Feld 26/);
        expect(text).to.match(/eingestellt ist aber Feld 40/);
    });

    it('haelt still, solange zu wenige Zyklen vorliegen', () => {
        // Zwei Zyklen koennen zufaellig zu jedem Feld passen - dazu sagt die Suche nichts.
        const text = fs.befund(saetze.slice(0, 2), {});
        expect(text).to.match(/mindestens 3/);
        expect(fs.felderBewerten(saetze.slice(0, 2), 'waterL')).to.be.empty;
    });
});

describe('Feldsuche: Energie', () => {
    /*
     * Der Fall vom 29.08.2026: F25 stand den ganzen Waschgang still (2,077 kWh, seit dem
     * Vorlauf unveraendert), waehrend die Cloud 2 kWh und der Shelly 1,884 kWh zeigten. Bei
     * gleichbleibendem Feld und schwankendem Vergleichswert darf kein Treffer herauskommen.
     */
    const saetze = [
        zyklus({ 25: 2077, 12: 1884 }, { energyKwh: 1.884 }),
        zyklus({ 25: 2077, 12: 96 }, { energyKwh: 0.096 }),
        zyklus({ 25: 2077, 12: 90 }, { energyKwh: 0.090 }),
        zyklus({ 25: 2077, 12: 94 }, { energyKwh: 0.094 }),
    ];

    it('erkennt ein stehendes Feld als untauglich', () => {
        const fuenfundzwanzig = fs.felderBewerten(saetze, 'energyKwh').find(b => b.index === '25');
        expect(fuenfundzwanzig.taugt).to.be.false;
        expect(fuenfundzwanzig.konstant).to.be.true;
    });

    it('findet stattdessen das mitlaufende Feld samt Teiler', () => {
        const rang = fs.felderBewerten(saetze, 'energyKwh');
        expect(rang[0].index).to.equal('12');
        expect(rang[0].teiler).to.equal(1000);
    });

    it('meldet ehrlich, wenn gar kein Feld passt', () => {
        // Der reale Zustand der WCR860: kein Feld folgt dem gemessenen Verbrauch. Dann darf
        // die Suche nichts vorschlagen - eine erfundene Zuordnung waere schlimmer als keine.
        const ohne = saetze.map(s => zyklus({ 25: s.felder['25'] }, s.cloud));
        const text = fs.befund(ohne, {});
        expect(text).to.match(/kein Feld passt/);
    });
});

describe('Feldsuche: Vergleichsquellen', () => {
    it('nimmt die Cloud, wo es sie gibt', () => {
        const s = { felder: {}, cloud: { waterL: 50 }, manuell: { waterL: 52 } };
        expect(fs.vergleichswert(s, 'waterL')).to.deep.equal({ wert: 50, quelle: 'cloud' });
    });

    it('faellt auf die Ablesung aus der App zurueck', () => {
        // Genau der Fall, auf den es hinauslaeuft, sobald die Cloud abgeschaltet ist.
        const s = { felder: {}, manuell: { waterL: 52 } };
        expect(fs.vergleichswert(s, 'waterL')).to.deep.equal({ wert: 52, quelle: 'manuell' });
    });

    it('uebergeht Nullwerte - sie tragen keine Aussage', () => {
        expect(fs.vergleichswert({ felder: {}, cloud: { waterL: 0 } }, 'waterL')).to.be.null;
    });

    it('zaehlt, wie viele Zyklen ueberhaupt belegbar sind', () => {
        const liste = [
            { felder: { 1: 5 }, cloud: { waterL: 5 } },
            { felder: { 1: 6 } },
            { felder: { 1: 7 }, manuell: { waterL: 7 } },
        ];
        expect(fs.belegbar(liste, 'waterL')).to.equal(2);
    });
});

describe('Feldsuche: Robustheit', () => {
    it('verkraftet eine leere Sammlung', () => {
        expect(fs.felderBewerten([], 'waterL')).to.be.empty;
        expect(fs.befund([], {})).to.match(/0 Zyklen/);
    });

    it('verkraftet Datensaetze ohne Felder', () => {
        expect(() => fs.felderBewerten([{}, { felder: null }], 'waterL')).to.not.throw();
    });

    it('rechnet mit BigInt-Feldwerten', () => {
        // DOP2 liefert 8-Byte-Felder als BigInt - siehe lib/dop2.js, readInt.
        expect(fs.alsZahl(1160n)).to.equal(1160);
    });

    it('haelt ein konstantes Feld nicht fuer falsch, wenn auch der Sollwert konstant ist', () => {
        // Liefen dreimal dieselben Programme, ist ein gleichbleibendes Feld kein Widerspruch.
        const gleich = [
            zyklus({ 26: 500 }, { waterL: 50 }),
            zyklus({ 26: 500 }, { waterL: 50 }),
            zyklus({ 26: 500 }, { waterL: 50 }),
        ];
        const b = fs.felderBewerten(gleich, 'waterL')[0];
        expect(b.taugt).to.be.true;
    });
});
