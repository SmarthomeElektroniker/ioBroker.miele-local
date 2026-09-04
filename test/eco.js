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

/*
 * Die EcoFeedback-Objekte - EINE Definition, zwei Aufrufer.
 *
 * WAS DIESE TESTS VERHINDERN SOLLEN. Bis 0.3.10 stand die Definition zweimal im Code:
 * in ensureEcoObjects (legt die Punkte an, sobald ein Geraet Werte liefert) und in
 * aktualisiereEcoNamen (zieht sie beim Start nach, weil ein stehendes Geraet kein
 * EcoFeedback liefert). Die Umbenennung der Energiefelder wurde nur in der zweiten
 * gemacht - beim Start stand danach der neue Name da, und sobald ein Programm lief,
 * setzte die erste den alten zurueck. Am 04.09.2026 am laufenden Adapter nachgesehen:
 * Dort stand weiterhin "Energieverbrauch". Alle Tests waren dabei gruen, weil es fuer
 * diese Stelle keinen gab.
 */
const objdef = require('../lib/objects');
const namen = require('../lib/names');

describe('EcoFeedback-Objekte', () => {
    it('beschreibt den Energiewert als Erwartung, nicht als Messung', () => {
        // Der Kern der Umbenennung: Am Geraet gemessen weicht der Wert um die Haelfte vom
        // tatsaechlichen Verbrauch ab (770 Wh gegen 1158 Wh am Shelly). Wer ihn
        // "Energieverbrauch" nennt, verspricht eine Messung, die er nicht ist.
        const c = objdef.ecoCommon(true);
        expect(c['eco.energy'].name.de).to.match(/Erwartung/);
        expect(c['eco.energyWh'].name.de).to.match(/Erwartung|keine Messung/);
    });

    it('gibt dem Wasserwert die Rolle value, nicht value.volume', () => {
        // value.volume beanstandet der Repository-Pruefer.
        expect(objdef.ecoCommon(true)['eco.water'].role).to.equal('value');
    });

    it('setzt Einheiten passend zum Feld', () => {
        const c = objdef.ecoCommon(true);
        expect(c['eco.energy'].unit).to.equal('kWh');
        expect(c['eco.energyWh'].unit).to.equal('Wh');
        expect(c['eco.water'].unit).to.equal('l');
    });

    it('liefert EcoFeedback in jeder Sprache gleich', () => {
        // Mieles eigener Begriff - er wird nicht uebersetzt, muss aber vollstaendig sein,
        // sonst warnt die Repository-Pruefung.
        const name = objdef.ecoCommon(true)['eco'].name;
        for (const sp of namen.SPRACHEN) expect(name[sp]).to.equal('EcoFeedback');
    });

    it('nimmt Name, Rolle und Einheit fuer die Anlage aus derselben Quelle', () => {
        // DER EIGENTLICHE TEST: Was ensureEcoObjects anlegt, muss zu dem passen, was
        // aktualisiereEcoNamen nachtraegt. Liefen die beiden auseinander, setzte jedes
        // laufende Programm die Namen wieder zurueck.
        const gemeinsam = objdef.ecoCommon(true);
        for (const d of objdef.ecoStates(true, false)) {
            const soll = gemeinsam[`eco.${d.sub}`];
            expect(d.common.name, `Name von eco.${d.sub}`).to.deep.equal(soll.name);
            expect(d.common.role, `Rolle von eco.${d.sub}`).to.equal(soll.role);
            expect(d.common.unit, `Einheit von eco.${d.sub}`).to.equal(soll.unit);
        }
    });

    it('legt genau die drei Punkte an - das Diagnosefeld nur auf Wunsch', () => {
        expect(objdef.ecoStates(true, false).map(d => d.sub))
            .to.deep.equal(['energy', 'energyWh', 'water']);
        expect(objdef.ecoStates(true, true).some(d => d.sub === 'felderJson')).to.be.true;
    });

    it('gibt jedem angelegten Punkt Typ und Vorgabewert', () => {
        // Ohne die faellt der Repository-Pruefer darueber her - und ein Datenpunkt ohne
        // Typ laesst sich nicht historisieren.
        for (const d of objdef.ecoStates(true, true)) {
            expect(d.common.type, `Typ von eco.${d.sub}`).to.be.a('string').and.not.empty;
            expect(d.common.read).to.be.true;
            expect(d.common.write).to.be.false;
            expect(d.common.def, `Vorgabewert von eco.${d.sub}`).to.not.be.undefined;
        }
    });

    it('folgt der Spracheinstellung', () => {
        // namen.text liefert bei deutschen Namen ein i18n-Objekt, sonst den englischen
        // String allein - beide Formen muessen hier ankommen.
        expect(objdef.ecoCommon(true)['eco.energy'].name).to.be.an('object');
        expect(objdef.ecoCommon(false)['eco.energy'].name)
            .to.be.a('string').and.match(/estimate/);
    });
});
