'use strict';

const { expect } = require('chai');
const stats = require('../lib/stats');

/** Ein Zyklus an einem festen Tag; Zeiten lokal, wie sie auch der Adapter bildet. */
const zyklus = (jahr, monat, tag, opt = {}) => ({
    ende: new Date(jahr, monat - 1, tag, 12, 0, 0).getTime(),
    dauerS: opt.dauerS ?? 3600,
    // Nicht ??: das faengt auch null ab, dann liesse sich "Programm ohne Namen" nie pruefen.
    program: 'program' in opt ? opt.program : 'Baumwolle',
    energyKwh: opt.energyKwh ?? 1,
    waterL: opt.waterL ?? 50,
});

describe('Programmstatistik', () => {
    it('zählt den ersten Zyklus in allen drei Zeiträumen', () => {
        const s = stats.verbuchen(null, zyklus(2026, 8, 21, { energyKwh: 0.8, waterL: 65 }));
        const a = stats.ausgabe(s);
        for (const z of ['week', 'month', 'year']) {
            expect(a[z].cycles, z).to.equal(1);
            expect(a[z].energy, z).to.equal(0.8);
            expect(a[z].water, z).to.equal(65);
        }
        expect(a.total.cycles).to.equal(1);
    });

    it('bildet den Mittelwert je Programm, wie ihn die Herstellerauswertung zeigt', () => {
        let s = null;
        // Vier Seide-Programme mit zusammen 0,5 kWh und 117 l - die Werte aus der Miele-App.
        for (const [kwh, l] of [[0.1, 29], [0.1, 30], [0.2, 29], [0.1, 29]]) {
            s = stats.verbuchen(s, zyklus(2026, 8, 10, { program: 'Seide', energyKwh: kwh, waterL: l }));
        }
        const seide = stats.ausgabe(s).programs.find(p => p.program === 'Seide');
        expect(seide.cycles).to.equal(4);
        expect(seide.energy).to.equal(0.5);
        expect(seide.water).to.equal(117);
        expect(seide.avgEnergy, 'Durchschnitt je Waschgang').to.equal(0.125);
        expect(seide.avgWater).to.equal(29.25);
    });

    it('rechnet den Anteil eines Programms am Gesamtverbrauch aus', () => {
        let s = null;
        s = stats.verbuchen(s, zyklus(2026, 8, 10, { program: 'Seide', energyKwh: 1, waterL: 30 }));
        s = stats.verbuchen(s, zyklus(2026, 8, 11, { program: 'Baumwolle', energyKwh: 3, waterL: 70 }));
        const a = stats.ausgabe(s);
        const seide = a.programs.find(p => p.program === 'Seide');
        expect(seide.shareCycles, 'die Hälfte der Programme').to.equal(50);
        expect(seide.shareEnergy, '1 von 4 kWh').to.equal(25);
        expect(seide.shareWater, '30 von 100 l').to.equal(30);
    });

    it('sortiert die Programme nach Häufigkeit', () => {
        let s = null;
        s = stats.verbuchen(s, zyklus(2026, 8, 10, { program: 'Pflegeleicht' }));
        for (let i = 0; i < 3; i++) s = stats.verbuchen(s, zyklus(2026, 8, 11 + i, { program: 'Seide' }));
        for (let i = 0; i < 2; i++) s = stats.verbuchen(s, zyklus(2026, 8, 15 + i, { program: 'Baumwolle' }));
        expect(stats.ausgabe(s).programs.map(p => p.program)).to.eql(['Seide', 'Baumwolle', 'Pflegeleicht']);
    });

    it('schiebt beim Monatswechsel den alten Monat auf den Vergleichswert', () => {
        let s = stats.verbuchen(null, zyklus(2026, 7, 20, { energyKwh: 2, waterL: 60 }));
        s = stats.verbuchen(s, zyklus(2026, 7, 25, { energyKwh: 2, waterL: 40 }));
        s = stats.verbuchen(s, zyklus(2026, 8, 3, { energyKwh: 1, waterL: 10 }));
        const m = stats.ausgabe(s).month;
        expect(m.key).to.equal('2026-08');
        expect(m.cycles, 'der neue Monat beginnt bei eins').to.equal(1);
        expect(m.energy).to.equal(1);
        expect(m.prevKey).to.equal('2026-07');
        expect(m.prevCycles, 'der Vormonat bleibt erhalten').to.equal(2);
        expect(m.prevEnergy).to.equal(4);
        expect(m.prevAvgWater, '100 l auf zwei Programme').to.equal(50);
    });

    it('führt die Programmnutzung je Zeitraum getrennt', () => {
        let s = stats.verbuchen(null, zyklus(2026, 7, 20, { program: 'Baumwolle' }));
        s = stats.verbuchen(s, zyklus(2026, 7, 21, { program: 'Baumwolle' }));
        s = stats.verbuchen(s, zyklus(2026, 8, 3, { program: 'Seide' }));
        const a = stats.ausgabe(s);
        expect(a.month.programs.map(p => p.program), 'nur der laufende Monat').to.eql(['Seide']);
        expect(a.month.programs[0].shareCycles, 'einziges Programm im Monat').to.equal(100);
        expect(a.month.prevPrograms.map(p => p.program), 'der Vormonat bleibt abrufbar').to.eql(['Baumwolle']);
        expect(a.month.prevPrograms[0].cycles).to.equal(2);
        // Im Jahr laufen beide zusammen - dort ist Baumwolle häufiger.
        expect(a.year.programs.map(p => p.program)).to.eql(['Baumwolle', 'Seide']);
        expect(a.year.programs[0].shareCycles, '2 von 3').to.equal(66.7);
    });

    it('lässt Jahres- und Gesamtwerte über den Monatswechsel hinweg stehen', () => {
        let s = stats.verbuchen(null, zyklus(2026, 7, 20, { energyKwh: 2 }));
        s = stats.verbuchen(s, zyklus(2026, 8, 3, { energyKwh: 1 }));
        const a = stats.ausgabe(s);
        expect(a.year.cycles, 'beide Programme im selben Jahr').to.equal(2);
        expect(a.year.energy).to.equal(3);
        expect(a.total.cycles).to.equal(2);
    });

    it('hebt einzelne Monate und Jahre zum Auswählen auf', () => {
        let s = null;
        s = stats.verbuchen(s, zyklus(2025, 11, 5, { energyKwh: 2, waterL: 80 }));
        s = stats.verbuchen(s, zyklus(2026, 3, 14, { energyKwh: 1, waterL: 60, program: 'Seide' }));
        s = stats.verbuchen(s, zyklus(2026, 3, 20, { energyKwh: 1, waterL: 40, program: 'Seide' }));
        s = stats.verbuchen(s, zyklus(2026, 8, 21, { energyKwh: 0.8, waterL: 65 }));
        const a = stats.ausgabe(s);

        expect(a.months.map(m => m.key), 'neueste zuerst').to.eql(['2026-08', '2026-03', '2025-11']);
        const maerz = a.months.find(m => m.key === '2026-03');
        expect(maerz.cycles).to.equal(2);
        expect(maerz.energy).to.equal(2);
        expect(maerz.avgWater, '100 l auf zwei Programme').to.equal(50);
        expect(maerz.programs[0].program, 'auch die Programme je Monat').to.equal('Seide');

        expect(a.years.map(y => y.key)).to.eql(['2026', '2025']);
        expect(a.years.find(y => y.key === '2026').cycles, 'drei Programme in 2026').to.equal(3);
    });

    it('wirft alte Monate weg, statt endlos zu wachsen', () => {
        let s = null;
        // 30 Monate am Stück - aufgehoben werden nur die letzten MAX_MONATE.
        for (let i = 0; i < 30; i++) {
            const jahr = 2024 + Math.floor(i / 12);
            const monat = (i % 12) + 1;
            s = stats.verbuchen(s, zyklus(jahr, monat, 5));
        }
        const a = stats.ausgabe(s);
        expect(a.months.length).to.equal(stats.MAX_MONATE);
        expect(a.months[0].key, 'der jüngste bleibt').to.equal('2026-06');
        expect(a.total.cycles, 'die Gesamtsumme bleibt vollständig').to.equal(30);
    });

    it('trennt Kalenderwochen nach ISO 8601', () => {
        // 2026-08-16 ist ein Sonntag, 2026-08-17 der Montag danach - zwei Wochen.
        expect(stats.wocheVon(new Date(2026, 7, 16))).to.not.equal(stats.wocheVon(new Date(2026, 7, 17)));
        // Der 1. Januar 2027 ist ein Freitag und gehört noch zur letzten Woche von 2026.
        expect(stats.wocheVon(new Date(2027, 0, 1))).to.equal('2026-W53');
    });

    it('zählt Programme ohne Namen nicht als eigene Zeile', () => {
        // Sonst entstünde ein Eintrag "null", der die Anteilsrechnung verfälscht.
        let s = stats.verbuchen(null, zyklus(2026, 8, 10, { program: null }));
        s = stats.verbuchen(s, zyklus(2026, 8, 11, { program: 'Seide' }));
        const a = stats.ausgabe(s);
        expect(a.programs.map(p => p.program)).to.eql(['Seide']);
        expect(a.total.cycles, 'in den Summen zählt er trotzdem mit').to.equal(2);
    });

    it('liefert null statt 0 als Mittelwert, wenn nichts gelaufen ist', () => {
        const a = stats.ausgabe(stats.neuerStand());
        expect(a.month.avgEnergy).to.equal(null);
        expect(a.total.avgWater).to.equal(null);
    });

    it('überlebt einen Neustart, wenn der Zustand gespeichert wurde', () => {
        let s = stats.verbuchen(null, zyklus(2026, 8, 10, { energyKwh: 1.5 }));
        const gespeichert = JSON.parse(JSON.stringify(s));
        const weiter = stats.verbuchen(gespeichert, zyklus(2026, 8, 11, { energyKwh: 0.5 }));
        expect(stats.ausgabe(weiter).month.energy).to.equal(2);
    });
});
