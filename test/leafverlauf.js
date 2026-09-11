'use strict';

const { expect } = require('chai');
const v = require('../lib/leafverlauf');

describe('Leaf-Verlauf: nur Wechsel', () => {
    /*
     * WARUM NUR WECHSEL. Ein Feld, das eine Woche lang 7 zeigt, soll einen Eintrag belegen und
     * nicht dreitausend. Sonst passt die Ablage nicht in einen Datenpunkt - und was
     * interessiert, sind ohnehin nur die Aenderungen: Eine Zahl, die stillsteht, ist
     * Konfiguration und keine Messung.
     */
    it('haelt den ersten Wert fest', () => {
        const x = v.aufnehmen({}, '2/6195', { 21: 0 }, 1000);
        expect(x['2/6195']['21']).to.deep.equal([[1000, 0]]);
    });

    it('haengt einen gleichen Wert NICHT an', () => {
        let x = v.aufnehmen({}, '2/6195', { 21: 0 }, 1000);
        x = v.aufnehmen(x, '2/6195', { 21: 0 }, 2000);
        expect(x['2/6195']['21']).to.have.lengthOf(1);
    });

    it('haengt eine Aenderung an', () => {
        let x = v.aufnehmen({}, '2/6195', { 21: 0 }, 1000);
        x = v.aufnehmen(x, '2/6195', { 21: 13341 }, 2000);
        expect(x['2/6195']['21']).to.deep.equal([[1000, 0], [2000, 13341]]);
    });

    it('vergleicht auch Listen richtig', () => {
        // "[1,2] !== [1,2]" waere in JavaScript immer wahr - ohne den JSON-Vergleich
        // stuende jede Runde ein neuer Eintrag da.
        let x = v.aufnehmen({}, '2/119', { 3: [1, 2] }, 1000);
        x = v.aufnehmen(x, '2/119', { 3: [1, 2] }, 2000);
        expect(x['2/119']['3']).to.have.lengthOf(1);
    });

    it('laesst die Eingabe unberuehrt', () => {
        const alt = v.aufnehmen({}, '2/6195', { 21: 0 }, 1000);
        v.aufnehmen(alt, '2/6195', { 21: 99 }, 2000);
        expect(alt['2/6195']['21']).to.have.lengthOf(1);
    });

    it('begrenzt die Reihe', () => {
        let x = {};
        for (let i = 0; i < v.WECHSEL_JE_FELD + 20; i++) {
            x = v.aufnehmen(x, '2/6195', { 21: i }, i);
        }
        expect(x['2/6195']['21']).to.have.lengthOf(v.WECHSEL_JE_FELD);
        // Der aelteste faellt heraus, der juengste bleibt.
        expect(x['2/6195']['21'][v.WECHSEL_JE_FELD - 1][1]).to.equal(v.WECHSEL_JE_FELD + 19);
    });
});

describe('Leaf-Verlauf: was sich bewegt hat', () => {
    let x = {};
    x = v.aufnehmen(x, '2/6195', { 21: 0, 99: 7 }, 1000);      // vor dem Programm
    x = v.aufnehmen(x, '2/6195', { 21: 5000, 99: 7 }, 2000);   // waehrend
    x = v.aufnehmen(x, '2/6195', { 21: 13341, 99: 7 }, 3000);

    it('nennt die bewegten Felder', () => {
        const b = v.bewegt(x, 1500, 3500);
        expect(b.map(y => y.feld)).to.deep.equal(['21']);
    });

    it('nennt den Wert VOR dem Zeitraum als Ausgangspunkt', () => {
        // Sonst faengt die Spur beim ersten Wechsel an, und der Startwert fehlt - genau der
        // wird aber gebraucht, um einen Verbrauch auszurechnen.
        const b = v.bewegt(x, 1500, 3500)[0];
        expect(b.von).to.equal(0);
        expect(b.bis).to.equal(13341);
    });

    it('uebergeht, was stillstand', () => {
        expect(v.bewegt(x, 1500, 3500).map(y => y.feld)).to.not.include('99');
    });

    it('sortiert nach der Zahl der Wechsel', () => {
        let y = v.aufnehmen({}, '2/1', { 1: 'a', 2: 'x' }, 100);
        y = v.aufnehmen(y, '2/1', { 1: 'b', 2: 'x' }, 200);
        y = v.aufnehmen(y, '2/1', { 1: 'c', 2: 'y' }, 300);
        expect(v.bewegt(y, 150, 400)[0].feld).to.equal('1');
    });
});
