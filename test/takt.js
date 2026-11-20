'use strict';

/*
 * Abfragetakt je Geraet (lib/takt.js, seit 0.3.46).
 *
 * Simuliert eine Stunde mit drei Geraeten, von denen nur der Backofen laeuft, und zaehlt die
 * Abfragen. Bis 0.3.45 haetten alle drei im Betriebstakt gezaehlt - genau das darf nicht
 * wiederkommen.
 */

const { expect } = require('chai');
const takt = require('../lib/takt');

const AKTIV = 60_000;
const RUHE = 120_000;

/** Die Schleife des Adapters nachgestellt: wecken, faellige abfragen, Termine neu setzen. */
function simuliere(geraete, dauerMs, istAktiv = id => geraete[id].active) {
    const zaehler = Object.fromEntries(Object.keys(geraete).map(id => [id, 0]));
    let jetzt = 0;
    while (jetzt < dauerMs) {
        for (const [id, dev] of Object.entries(geraete)) {
            if (!takt.istFaellig(dev, jetzt)) continue;
            zaehler[id]++;
            dev.active = istAktiv(id, jetzt);          // wie applyState() nach der Abfrage
            dev.naechsteAbfrage = jetzt + takt.abstand(dev, AKTIV, RUHE);
        }
        jetzt += takt.weckAbstand(Object.values(geraete), jetzt, RUHE);
    }
    return zaehler;
}

describe('Abfragetakt je Geraet', () => {
    it('fragt nur das laufende Geraet im Betriebstakt, die anderen im Ruhetakt', () => {
        const z = simuliere({ ofen: { active: true }, wasch: { active: false }, spuel: { active: false } }, 3600_000);
        expect(z.ofen).to.equal(60);
        expect(z.wasch).to.equal(30);
        expect(z.spuel).to.equal(30);
    });

    it('ohne laufendes Geraet: alle im Ruhetakt', () => {
        const z = simuliere({ a: {}, b: {} }, 3600_000);
        expect(z).to.deep.equal({ a: 30, b: 30 });
    });

    it('ein neu gefundenes Geraet (ohne Termin) ist sofort dran', () => {
        expect(takt.istFaellig({}, 0)).to.equal(true);
        expect(takt.istFaellig({ naechsteAbfrage: 5000 }, 4999)).to.equal(false);
    });

    it('wechselt nach dem Einschalten in den Betriebstakt', () => {
        // Ofen geht nach 10 min an: bis dahin Ruhetakt, danach Betriebstakt.
        const z = simuliere({ ofen: {} }, 3600_000, (id, t) => t >= 600_000);
        // 0..600 s: Abfragen bei 0,120,...,600 (6, die bei 600 s erkennt den Betrieb), danach je 60 s bis 3540 s (49)
        expect(z.ofen).to.equal(55);
    });

    it('weckt nie oefter als einmal je Sekunde und ohne Geraete im Ruhetakt', () => {
        expect(takt.weckAbstand([{ naechsteAbfrage: 100 }], 0, RUHE)).to.equal(takt.MIN_WECKABSTAND_MS);
        expect(takt.weckAbstand([], 0, RUHE)).to.equal(RUHE);
        expect(takt.weckAbstand([{ naechsteAbfrage: 90_000 }, { naechsteAbfrage: 30_000 }], 0, RUHE)).to.equal(30_000);
    });
    describe('Status 2 "Ein" gleich nach dem Einschalten', () => {
        it('bleibt die ersten Minuten im Betriebstakt, danach Ruhetakt', () => {
            expect(takt.imBetriebstakt(2, 0, 0)).to.equal(true);
            expect(takt.imBetriebstakt(2, 0, takt.EIN_BETRIEBSTAKT_MS - 1)).to.equal(true);
            expect(takt.imBetriebstakt(2, 0, takt.EIN_BETRIEBSTAKT_MS)).to.equal(false);
            expect(takt.imBetriebstakt(2, null, 0)).to.equal(false);
        });

        it('aendert nichts an Aus und an den laufenden Status', () => {
            expect(takt.imBetriebstakt(1, 0, 0)).to.equal(false);
            expect(takt.imBetriebstakt(255, 0, 0)).to.equal(false);
            for (const st of [3, 4, 5, 6, 7, 9, 13, 14, 15]) {
                expect(takt.imBetriebstakt(st, null, 10 * 3600_000)).to.equal(true);
            }
        });

        it('20.11.2026: Programmwahl ohne Start wird jetzt vor dem Ausschalten noch einmal gefragt', () => {
            // eingeschaltet bei 0 s, erste Abfrage 10 s spaeter (Status 2, Programm 0), ausgeschaltet 91 s.
            // Vorher kam die naechste Abfrage erst nach 130 s - das Geraet war da schon aus.
            const dev = {};
            const status = t => (t >= 10_000 && t < 91_000 ? 2 : 1);
            let jetzt = 10_000;
            const abfragen = [];
            while (jetzt < 200_000) {
                const st = status(jetzt);
                abfragen.push([jetzt, st]);
                dev.einSeit = st === 2 ? (dev.einSeit == null ? jetzt : dev.einSeit) : null;
                dev.active = takt.imBetriebstakt(st, dev.einSeit, jetzt);
                jetzt += takt.abstand(dev, AKTIV, RUHE);
            }
            expect(abfragen.filter(([, st]) => st === 2).length).to.equal(2);
            expect(abfragen[1]).to.deep.equal([70_000, 2]);
        });

        it('ein lange eingeschaltetes Geraet faellt nach 5 min in den Ruhetakt zurueck', () => {
            // 30 min auf "Ein": 0, 60 … 240 s im Betriebstakt (5), ab 300 s je 120 s bis 1740 s (13).
            const dev = {};
            let jetzt = 0;
            let n = 0;
            while (jetzt < 1800_000) {
                n++;
                dev.einSeit = dev.einSeit == null ? jetzt : dev.einSeit;
                dev.active = takt.imBetriebstakt(2, dev.einSeit, jetzt);
                jetzt += takt.abstand(dev, AKTIV, RUHE);
            }
            expect(n).to.equal(5 + 13);
        });
    });
});
