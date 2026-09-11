'use strict';

const { expect } = require('chai');
const v = require('../lib/leafverlauf');

/*
 * DER ZUSTAND ZUR MESSUNG - ohne ihn ist keine Zahlenreihe zu deuten.
 *
 * "608, 368, -378, -598, 676" wird erst zu einer Aussage, wenn danebensteht, was die Maschine
 * in diesem Augenblick tat. Am 05.09.2026 stand die Vermutung im Raum, ein Feld zeige die
 * Trommeldrehzahl mit Vorzeichen fuer die Drehrichtung - pruefen laesst sich das nur mit der
 * Phase daneben.
 */
describe('Leaf-Verlauf: Zustand mitschreiben', () => {
    it('haelt den ersten Zustand fest', () => {
        const x = v.zustandAufnehmen({}, { phase: 'Waschen' }, 1000);
        expect(x._zustand).to.deep.equal([[1000, { phase: 'Waschen' }]]);
    });

    it('haengt einen unveraenderten Zustand NICHT an', () => {
        // Eine Phase dauert Minuten - sie bei jeder Runde erneut zu speichern waere Ballast.
        let x = v.zustandAufnehmen({}, { phase: 'Waschen' }, 1000);
        x = v.zustandAufnehmen(x, { phase: 'Waschen' }, 2000);
        expect(x._zustand).to.have.lengthOf(1);
    });

    it('haengt einen Wechsel an', () => {
        let x = v.zustandAufnehmen({}, { phase: 'Waschen' }, 1000);
        x = v.zustandAufnehmen(x, { phase: 'Spülen' }, 2000);
        expect(x._zustand).to.have.lengthOf(2);
    });

    it('nennt zu einem Zeitpunkt den dann geltenden Zustand', () => {
        let x = v.zustandAufnehmen({}, { phase: 'Waschen' }, 1000);
        x = v.zustandAufnehmen(x, { phase: 'Schleudern' }, 3000);
        // Gesucht ist der letzte Wechsel VOR dem Zeitpunkt - der galt dann.
        expect(v.zustandBei(x, 2000).phase).to.equal('Waschen');
        expect(v.zustandBei(x, 3500).phase).to.equal('Schleudern');
    });

    it('sagt nichts ueber die Zeit vor der ersten Messung', () => {
        const x = v.zustandAufnehmen({}, { phase: 'Waschen' }, 1000);
        expect(v.zustandBei(x, 500)).to.equal(null);
    });

    it('kommt der Feldablage nicht in die Quere', () => {
        // Der Zustand liegt in einem eigenen Zweig - die Felder bleiben unberuehrt.
        let x = v.aufnehmen({}, '2/6193', { 9: 23 }, 1000);
        x = v.zustandAufnehmen(x, { phase: 'Waschen' }, 1000);
        expect(x['2/6193']['9']).to.deep.equal([[1000, 23]]);
        expect(v.umfang(x).leafs).to.be.at.least(1);
    });
});
