'use strict';

const { expect } = require('chai');
const k = require('../lib/kontrolle');

/*
 * Die laufende Kontrolle an den Zahlen pruefen, die es wirklich gibt.
 *
 * Die Werte unten sind die acht Zyklen vom 28.08. bis 03.09.2026, mit denen Feld 21 als
 * Wasserzaehler belegt wurde - Feld 21 geteilt durch 200 gegen den Cloud-Wert.
 */

const T0 = 1_787_000_000_000;
const STUNDE = 3600 * 1000;

/** Die acht belegten Zyklen: lokal (Feld 21 / 200) gegen Cloud. */
const ECHT = [
    ['Pflegeleicht', 66.70, 67],
    ['Spülen', 25.89, 26],
    ['Baumwolle Hygiene', 97.20, 97],
    ['Baumwolle Hygiene', 59.91, 60],
    ['Erstwäsche', 25.14, 25],
    ['Erstwäsche', 16.65, 17],
    ['Baumwolle', 81.08, 81],
    ['Jeans', 62.01, 62],
];

function verlaufAusEcht() {
    let v = [];
    ECHT.forEach(([programm, lokal, cloud], i) => {
        v = k.aufnehmen(v, k.vergleichen({
            zeit: T0 + i * 24 * STUNDE, programm,
            lokal: { waterL: lokal }, cloud: { waterL: cloud },
        }));
    });
    return v;
}

describe('Kontrolle: die belegte Wasserzuordnung', () => {
    it('bestaetigt Feld 21 mit unter einem Prozent Abweichung', () => {
        const s = k.stand(verlaufAusEcht(), 'waterL');
        expect(s.zyklen).to.equal(8);
        expect(s.mittel).to.be.below(0.01);
        expect(s.warnt).to.be.false;
    });

    it('schreibt in den Bericht, woher der Vergleichswert kam', () => {
        expect(k.bericht(verlaufAusEcht())).to.match(/gegen cloud/);
    });

    it('nennt die groesste Einzelabweichung, nicht nur den Mittelwert', () => {
        // Der Mittelwert allein verdeckt einen einzelnen Ausschlag.
        const s = k.stand(verlaufAusEcht(), 'waterL');
        expect(s.groesste).to.be.above(s.mittel);
        expect(s.text).to.match(/groesste/);
    });
});

describe('Kontrolle: wenn die Zuordnung wegläuft', () => {
    it('warnt erst nach drei Ausreissern in Folge', () => {
        let v = verlaufAusEcht();
        // Zwei Ausreisser sind Rauschen - die Cloud rundet, und die Abrufe liegen
        // Minuten auseinander.
        for (const [lokal, cloud] of [[95, 60], [95, 25]]) {
            v = k.aufnehmen(v, k.vergleichen({ zeit: T0, lokal: { waterL: lokal },
                                               cloud: { waterL: cloud } }));
        }
        expect(k.stand(v, 'waterL').warnt).to.be.false;

        v = k.aufnehmen(v, k.vergleichen({ zeit: T0, lokal: { waterL: 95 },
                                           cloud: { waterL: 17 } }));
        const s = k.stand(v, 'waterL');
        expect(s.warnt).to.be.true;
        expect(s.text).to.match(/ACHTUNG/);
        expect(s.text).to.match(/Feldzuordnung koennte nicht mehr stimmen/);
    });

    it('vergisst alte Ausreisser, sobald es wieder passt', () => {
        // Sonst warnte der Adapter noch Wochen nach einer behobenen Stoerung.
        let v = [];
        for (const [lokal, cloud] of [[95, 60], [95, 25], [95, 17]]) {
            v = k.aufnehmen(v, k.vergleichen({ zeit: T0, lokal: { waterL: lokal },
                                               cloud: { waterL: cloud } }));
        }
        expect(k.stand(v, 'waterL').warnt).to.be.true;
        v = k.aufnehmen(v, k.vergleichen({ zeit: T0, lokal: { waterL: 62.01 },
                                           cloud: { waterL: 62 } }));
        expect(k.stand(v, 'waterL').warnt).to.be.false;
    });
});

describe('Kontrolle: Luecken', () => {
    it('zaehlt fehlende lokale Werte getrennt von Abweichungen', () => {
        /*
         * Die Unterscheidung ist der Kern: Am 04.09.2026 standen die Eco-Felder in sieben
         * von elf Zyklen auf 0, weil die Maschine sie zurueckstellt, bevor der Abruf sie
         * erwischt. Das ist eine Luecke, kein falscher Wert - wer beides zusammenwirft,
         * bekommt eine Abweichung von 100 Prozent und verwirft das richtige Feld.
         */
        let v = verlaufAusEcht();
        v = k.aufnehmen(v, k.vergleichen({ zeit: T0, lokal: { waterL: 0 },
                                           cloud: { waterL: 62 } }));
        const s = k.stand(v, 'waterL');
        expect(s.luecken).to.equal(1);
        expect(s.zyklen).to.equal(8);           // die Luecke zaehlt NICHT als Vergleich
        expect(s.mittel).to.be.below(0.01);     // und verzerrt die Genauigkeit nicht
        expect(s.text).to.match(/1 Zyklen ohne lokalen Wert/);
    });

    it('meldet ein Feld, das gar nichts liefert', () => {
        let v = [];
        for (let i = 0; i < 4; i++) {
            v = k.aufnehmen(v, k.vergleichen({ zeit: T0, lokal: { waterL: 0 },
                                               cloud: { waterL: 60 } }));
        }
        expect(k.stand(v, 'waterL').text).to.match(/liefert nichts/);
    });
});

describe('Kontrolle: Vergleichsquellen', () => {
    it('nimmt die Cloud, wo es sie gibt', () => {
        const e = k.vergleichen({ zeit: T0, lokal: { waterL: 62 },
                                  cloud: { waterL: 62 }, manuell: { waterL: 61 } });
        expect(e.werte.waterL.quelle).to.equal('cloud');
    });

    it('faellt auf die Ablesung aus der App zurueck', () => {
        // Der Zustand nach dem Cloud-Ausstieg.
        const e = k.vergleichen({ zeit: T0, lokal: { waterL: 62 }, manuell: { waterL: 61 } });
        expect(e.werte.waterL.quelle).to.equal('manuell');
    });

    it('liefert nichts, wo es keinen Vergleichswert gibt', () => {
        expect(k.vergleichen({ zeit: T0, lokal: { waterL: 62 } })).to.be.null;
    });

    it('prueft Wasser und Energie unabhaengig voneinander', () => {
        // Genau der reale Fall: Das Wasser stimmt, die Energie ist unbrauchbar.
        const e = k.vergleichen({ zeit: T0, lokal: { waterL: 62, energyKwh: 2.077 },
                                  cloud: { waterL: 62, energyKwh: 1.1 } });
        expect(e.werte.waterL.abweichung).to.be.below(0.01);
        expect(e.werte.energyKwh.abweichung).to.be.above(0.8);
    });
});

describe('Kontrolle: Robustheit', () => {
    it('haelt den Verlauf kurz', () => {
        let v = [];
        for (let i = 0; i < k.MAX_VERLAUF + 15; i++) {
            v = k.aufnehmen(v, k.vergleichen({ zeit: T0 + i, lokal: { waterL: 62 },
                                               cloud: { waterL: 62 } }));
        }
        expect(v).to.have.lengthOf(k.MAX_VERLAUF);
    });

    it('verkraftet einen leeren Verlauf', () => {
        expect(k.stand([], 'waterL').zyklen).to.equal(0);
        expect(k.bericht([])).to.match(/noch keine/);
    });

    it('verkraftet Muell in den Werten', () => {
        expect(() => k.vergleichen({ zeit: T0, lokal: { waterL: 'abc' },
                                     cloud: { waterL: 62 } })).to.not.throw();
        const e = k.vergleichen({ zeit: T0, lokal: { waterL: 'abc' }, cloud: { waterL: 62 } });
        expect(e.werte.waterL.fehlt).to.be.true;
    });
});
