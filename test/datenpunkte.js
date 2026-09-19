'use strict';

const { expect } = require('chai');
const dp = require('../lib/datenpunkte');
const leafnamen = require('../lib/leafnamen');

/*
 * Die Regel, um die es hier geht: ES GIBT NUR, WAS DAS GERAET LIEFERT.
 *
 * Die Namenstabelle kennt ueber dreihundert Felder aus fremden Projekten. Legte der Adapter sie
 * alle an, stuende bei jedem Anwender ein Baum voller Nullen - und eine echte Null waere darin
 * nicht mehr zu erkennen. Diese Tests halten fest, dass aus einem NICHT gelieferten Feld auch
 * kein Datenpunkt wird, und dass die gelieferten an der richtigen Stelle ausgelesen werden.
 */

/** Eine Wertehuelle, wie das Geraet sie schickt: [Maske, Wert, Deutung]. */
function annotated(wert, typ = 5) {
    return { type: 16, value: [
        { id: 1, type: 2, value: 8 }, { id: 2, type: typ, value: wert }, { id: 3, type: 4, value: 0 },
    ] };
}

/** Die andere Bauart: [Maske, min, max, ISTWERT, Schritt, ...]. */
function generic(istwert) {
    return { type: 16, value: [
        { id: 1, type: 2, value: 9 }, { id: 2, type: 2, value: 0 }, { id: 3, type: 2, value: 0 },
        { id: 4, type: 2, value: istwert }, { id: 5, type: 2, value: 0 }, { id: 6, type: 4, value: 0 },
    ] };
}

describe('Datenpunkte aus Leaf-Feldern', () => {
    it('liest den Istwert einer Generic-Huelle an vierter Stelle', () => {
        // Der Beleg: 40-Grad-Programm, Feld 24 kam als [9, 0, 0, 40, 0, 0] vom Geraet.
        const aus = dp.fuerLeaf('2/6195', { 24: generic(40) }, true);
        expect(aus).to.have.length(1);
        expect(aus[0].sub).to.equal('heatingTargetTemperature');
        expect(aus[0].wert, 'nicht das Minimum, sondern der Istwert').to.equal(40);
        expect(aus[0].common.unit).to.equal('°C');
    });

    it('liest den Wert einer Annotated-Huelle an zweiter Stelle', () => {
        const aus = dp.fuerLeaf('2/6195', { 25: annotated(2020) }, true);
        expect(aus[0].sub).to.equal('heatingEnergy');
        expect(aus[0].wert).to.equal(2020);
        expect(aus[0].common.unit).to.equal('Wh');
    });

    it('legt fuer ein Feld ohne Namen nichts an', () => {
        // Feld 99 kennt keine Tabelle. Eine Zahl namens "99" hilft niemandem; der Rohwert
        // steht ohnehin im Verlauf und in der CSV.
        expect(dp.fuerLeaf('2/6195', { 99: annotated(7) }, true)).to.deep.equal([]);
    });

    it('legt fuer ein Leaf ohne Struktur nichts an', () => {
        expect(dp.fuerLeaf('2/220', { 1: { type: 8, value: 0 } }, true)).to.deep.equal([]);
    });

    it('legt die Kennung aus 2/145 NICHT ein zweites Mal an', () => {
        // Seriennummer, Modell und Materialnummer stehen bereits als info.fabNumber,
        // info.techType und info.matNumber im Baum - aus derselben Quelle, der Geraetekennung.
        const aus = dp.fuerLeaf('2/145', { 1: { type: 18, value: Buffer.from('000188837439') } }, true);
        expect(aus).to.deep.equal([]);
    });

    it('rechnet nur dort um, wo der Teiler gemessen ist', () => {
        const aus = dp.fuerLeaf('2/6195', { 21: annotated(13341, 9), 20: annotated(3, 2) }, true);
        const wasser = aus.find(a => a.sub === 'totalImpulses');
        expect(wasser.wert, '13341 Impulse / 200 = 66,71 l').to.equal(66.71);
        const zaehler = aus.find(a => a.sub === 'hygieneCounter');
        expect(zaehler.wert, 'ohne belegten Teiler bleibt der Rohwert').to.equal(3);
        expect(zaehler.common.unit, 'und ohne Einheit').to.equal(undefined);
    });

    it('macht aus 2/119 Stunden, weil der Leaf in Minuten zaehlt', () => {
        const aus = dp.fuerLeaf('2/119', { 1: { type: 8, value: 439025 } }, true);
        expect(aus[0].wert).to.equal(7317.08);
        expect(aus[0].common.unit).to.equal('h');
    });

    it('nimmt den Typ aus dem WERT, nicht aus der Tabelle', () => {
        const aus = dp.fuerLeaf('2/6192', { 1: annotated(true, 1) }, true);
        expect(aus[0].common.type).to.equal('boolean');
        expect(aus[0].common.role).to.equal('indicator');
        expect(aus[0].wert).to.equal(true);
    });

    it('legt eine Liste als JSON ab, nicht als zwanzig Datenpunkte', () => {
        const aus = dp.fuerLeaf('2/1584', { 2: { type: 21, value: [1, 133, 3] } }, true);
        expect(aus[0].sub).to.equal('programIds');
        expect(aus[0].common.type).to.equal('string');
        expect(aus[0].common.role).to.equal('json');
        expect(aus[0].wert).to.equal('[1,133,3]');
    });

    it('steigt in eine benannte Unterstruktur hinab und nutzt deren Feldnummern', () => {
        /*
         * 2/1585 Feld 6 traegt die EcoFeedback-Werte des Geraets. Ihre Nummern sind
         * lueckenhaft (1, 3, 4, ...) - ueber die STELLE zugeordnet kaeme Unsinn heraus.
         */
        const fields = { 6: { type: 16, value: [
            { id: 1, type: 2, value: 1 },
            { id: 4, type: 16, value: [
                { id: 1, type: 2, value: 9 }, { id: 2, type: 5, value: 0 },
                { id: 3, type: 5, value: 0 }, { id: 4, type: 5, value: 47 },
                { id: 5, type: 5, value: 0 },
            ] },
        ] } };
        const werte = dp.istwerte('2/1585', fields);
        const wasser = werte.find(w => w.pfad === '6.4');
        expect(wasser, 'Feld 6.4 gefunden').to.not.equal(undefined);
        expect(wasser.wert, 'Istwert der Generic-Huelle').to.equal(47);
        expect(wasser.struktur).to.equal('DeviceAttributesDWTDWM');
        expect(leafnamen.feldNameIn(wasser.struktur, wasser.idx))
            .to.equal('ecoFeedbackWaterConsumptionLastProg');
    });

    it('ordnet jedem Kanal einen Namen zu', () => {
        for (const kanal of Object.values(dp.KANAELE)) {
            expect(dp.KANAL_NAMEN[kanal], `Kanal ${kanal}`).to.be.an('array').with.length(2);
        }
    });
});
