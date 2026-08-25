'use strict';

const { expect } = require('chai');
const eco = require('../lib/eco');

/**
 * Wann fragt der Adapter nach EcoFeedback?
 *
 * Belegt an der Waschmaschine: Ihr letzter Wert kam am 23.08.2026 um 11:24, mitten im
 * Programm. Danach stand sie auf "Aus" und jede Anfrage lief in HTTP 500 - eine pro Minute,
 * ueber Tage hinweg.
 */
describe('Eco-Abfrage', () => {
    const T0 = 1_787_000_000_000;

    it('fragt jedes Gerät einmal, auch wenn es steht', () => {
        expect(eco.abfragenSinnvoll(false, { ecoLaeuft: false }, T0)).to.equal(true);
    });

    it('lässt ein stehendes Gerät danach in Ruhe', () => {
        expect(eco.abfragenSinnvoll(true, { ecoLaeuft: false }, T0)).to.equal(false);
    });

    it('fragt, solange ein Programm läuft', () => {
        expect(eco.abfragenSinnvoll(true, { ecoLaeuft: true }, T0)).to.equal(true);
    });

    it('fragt im Nachlauf nach dem Programmende weiter', () => {
        expect(eco.abfragenSinnvoll(true, { ecoNachlaufBis: T0 + 60000 }, T0)).to.equal(true);
    });

    it('hört auf, wenn der Nachlauf abgelaufen ist', () => {
        expect(eco.abfragenSinnvoll(true, { ecoNachlaufBis: T0 - 1000 }, T0)).to.equal(false);
    });

    it('gibt dem Schlussstand reichlich Zeit', () => {
        expect(eco.NACHLAUF_MS).to.be.at.least(5 * 60 * 1000);
    });
});

describe('Nachlauf', () => {
    const laufend = { ecoLaeuft: true, ecoNachlaufBis: 0 };
    const endend = (letzter, stabil) => ({
        ecoLaeuft: false, ecoNachlaufBis: 1_787_000_060_000,
        ecoLetzter: letzter, ecoStabil: stabil,
    });

    it('zählt während des Programms nicht mit', () => {
        const n = eco.nachlaufFortschreiben(laufend, '500/40');
        expect(n.ecoStabil).to.equal(0);
        expect(n.ecoLetzter).to.equal('500/40');
    });

    it('setzt den Zähler zurück, wenn sich der Wert noch ändert', () => {
        const n = eco.nachlaufFortschreiben(endend('500/40', 1), '520/42');
        expect(n.ecoStabil).to.equal(0);
        expect(n.ecoNachlaufBis).to.be.above(0);
    });

    it('beendet den Nachlauf, sobald der Wert zweimal gleich bleibt', () => {
        let dev = endend('613/7', 0);
        dev = Object.assign({}, dev, eco.nachlaufFortschreiben(dev, '613/7'));
        expect(dev.ecoStabil).to.equal(1);
        expect(dev.ecoNachlaufBis).to.be.above(0);
        dev = Object.assign({}, dev, eco.nachlaufFortschreiben(dev, '613/7'));
        expect(dev.ecoStabil).to.equal(2);
        expect(dev.ecoNachlaufBis).to.equal(0);
    });
});
