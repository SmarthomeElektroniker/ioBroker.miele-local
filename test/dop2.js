'use strict';

const { expect } = require('chai');
const dop2 = require('../lib/dop2');

/*
 * Baut einen ProcessData-Leaf nach, wie ihn die Waschmaschine liefert. Ohne so einen Test
 * laesst sich die Eco-Kette nur pruefen, wenn gerade eine Maschine laeuft - im Aus-Zustand
 * antwortet das Geraet mit HTTP 500, es kommen also gar keine Daten an.
 *
 * Die Referenzwerte stammen aus dem Abgleich gegen die Miele-Cloud (docs/DOP2-Protokoll.md):
 * Feld #25 = 1991 Wh entsprach 1,9 kWh in der Cloud, Feld #40 = 953 entsprach 96 l.
 */

/** Ein "interpretiertes" Feld: Struct aus [maske, wert, deutung]. interpValue nimmt das mittlere. */
function interpStruct(wert) {
    const teile = [];
    for (const v of [0, wert, 0]) {
        const b = Buffer.alloc(4);
        b[0] = 0x01;      // Sub-Feld-Id
        b[1] = 0x07;      // Typ 7 = 2 Byte ohne Vorzeichen
        b.writeUInt16BE(v & 0xffff, 2);
        teile.push(b);
    }
    // Struct-Kopf: [byte0, anzahlFelder, byte2], danach die Felder
    return Buffer.concat([Buffer.from([0x00, teile.length, 0x00]), ...teile]);
}

/** Ein Feld im Leaf-Rumpf: [index, typ, wert..., ein Byte Fuellung]. */
function feld(idx, koerper) {
    return Buffer.concat([Buffer.from([idx, 0x10]), koerper, Buffer.from([0x00])]);
}

function leafBauen(werte) {
    const felder = Object.entries(werte).map(([idx, v]) => feld(Number(idx), interpStruct(v)));
    const hoechster = Math.max(...Object.keys(werte).map(Number));
    // Der Parser liest die Feldzahl aus payload[3..4] und beginnt die Felder bei payload[5].
    const rumpf = Buffer.concat([Buffer.from([0, 0, 0, hoechster & 0xff, hoechster >> 8]), ...felder]);
    const kopf = Buffer.alloc(8);
    kopf.writeUInt16BE(rumpf.length + 6, 0);   // payloadLength
    kopf.writeUInt16BE(2, 2);                  // unit
    kopf.writeUInt16BE(6195, 4);               // attr
    return Buffer.concat([kopf, rumpf]);
}

describe('DOP2 EcoFeedback', () => {
    it('liest Energie und Wasser aus dem ProcessData-Leaf', () => {
        const buf = leafBauen({ 25: 1991, 40: 953 });
        const { unit, attr, fields } = dop2.parseLeaf(buf);
        expect(unit, 'unit').to.equal(2);
        expect(attr, 'attr').to.equal(6195);
        expect(dop2.interpValue(fields, 25), 'Feld 25 roh').to.equal(1991);
        expect(dop2.interpValue(fields, 40), 'Feld 40 roh').to.equal(953);
    });

    it('rechnet auf kWh und Liter um - die gegen die Cloud geprüften Werte', () => {
        const { fields } = dop2.parseLeaf(leafBauen({ 25: 1991, 40: 953 }));
        // Teiler ausdruecklich 10: Feld 40 war bis 0.3.14 mit Zehntellitern eingestellt.
        const eco = dop2.ecoValues(fields, 25, 40, 10);
        expect(eco.energyWh, 'Wh bleibt roh').to.equal(1991);
        expect(eco.energyKwh, '1991 Wh = 1,991 kWh').to.equal(1.991);
        expect(eco.waterL, '953 Zehntelliter = 95,3 l').to.equal(95.3);
    });

    it('nimmt den Teiler des Wasserfelds von aussen', () => {
        // Die WCR860 zaehlt Wasser in Feld 4 und in ganzen Litern - der Teiler 10 der
        // urspruenglichen Fassung haette daraus 1,7 l gemacht. Genau dieser Fehler steckte
        // bis zum 28.08.2026 im Adapter, nur mit einem anderen Feld.
        const { fields } = dop2.parseLeaf(leafBauen({ 25: 894, 4: 17 }));
        expect(dop2.ecoValues(fields, 25, 4, 1).waterL, 'ganze Liter').to.equal(17);
        expect(dop2.ecoValues(fields, 25, 4, 10).waterL, 'Zehntel').to.equal(1.7);
        expect(dop2.ecoValues(fields, 25, 4, 100).waterL, 'Hundertstel').to.equal(0.17);
    });

    it('faellt auf den Teilungsfaktor 200 zurueck, wenn kein Teiler angegeben ist', () => {
        // Bis zum 11.09.2026 war der Rueckfall hier 10 (Zehntelliter), in main.js 100 - beides passte
        // nicht zu Feld 21 der WCR860, das in Schritten von 5 ml zaehlt. Siehe test/wasserteiler.js.
        const { fields } = dop2.parseLeaf(leafBauen({ 25: 894, 21: 23200 }));
        expect(dop2.ecoValues(fields, 25, 21).waterL, '23200 / 200 = 116 l').to.equal(116);
        // Auch ein unsinniger Teiler darf nicht durch null teilen.
        expect(dop2.ecoValues(fields, 25, 21, 0).waterL).to.equal(116);
    });

    it('liefert null statt 0, wenn ein Feld fehlt', () => {
        const { fields } = dop2.parseLeaf(leafBauen({ 25: 613 }));
        const eco = dop2.ecoValues(fields, 25, 40);
        expect(eco.energyKwh).to.equal(0.613);
        // Wichtig: 0 waere ein gemessener Wert, null heisst "nicht geliefert" - sonst
        // ueberschriebe ein Geraet ohne Wasserzaehler den letzten echten Stand mit 0.
        expect(eco.waterL, 'fehlendes Feld').to.equal(null);
    });

    it('verkraftet einen leeren Leaf, ohne zu werfen', () => {
        const kopf = Buffer.alloc(8);
        kopf.writeUInt16BE(6, 0);
        kopf.writeUInt16BE(2, 2);
        kopf.writeUInt16BE(6195, 4);
        const { fields } = dop2.parseLeaf(kopf);
        const eco = dop2.ecoValues(fields, 25, 40);
        expect(eco.energyWh).to.equal(null);
        expect(eco.waterL).to.equal(null);
    });
});

/*
 * Die Wertehuellen - der Fehler, der bis 0.3.36 sieben Felder auf 0 stehen liess.
 *
 * Miele verpackt jeden Messwert in eine kleine Struktur, und es gibt zwei Bauarten. Der Adapter
 * las immer die zweite Stelle: bei "Annotated" der Wert, bei "Generic" das MINIMUM - und das ist
 * bei allen beobachteten Feldern 0. Aufgefallen ist es am 15.09.2026 an Feld 24 des Eco-Leaf:
 * Die Maschine fuhr ein 40-Grad-Programm und meldete [9, 0, 0, 40, 0, 0], der Adapter 0 Grad.
 */
describe('Wertehuellen', () => {
    const dop2neu = require('../lib/dop2');

    it('nimmt bei drei Eintraegen den zweiten', () => {
        expect(dop2neu.wertAusStruktur([
            { id: 1, type: 2, value: 8 }, { id: 2, type: 5, value: 2020 }, { id: 3, type: 4, value: 0 },
        ])).to.equal(2020);
    });

    it('nimmt bei sechs Eintraegen den vierten - den Istwert, nicht das Minimum', () => {
        expect(dop2neu.wertAusStruktur([
            { id: 1, type: 2, value: 9 }, { id: 2, type: 2, value: 0 }, { id: 3, type: 2, value: 0 },
            { id: 4, type: 2, value: 40 }, { id: 5, type: 2, value: 0 }, { id: 6, type: 4, value: 0 },
        ])).to.equal(40);
    });

    it('kommt auch ohne Feldnummern zurecht - alte Abzuege tragen keine', () => {
        expect(dop2neu.wertAusStruktur([
            { type: 2, value: 9 }, { type: 2, value: 0 }, { type: 2, value: 0 },
            { type: 2, value: 40 }, { type: 2, value: 0 }, { type: 4, value: 0 },
        ])).to.equal(40);
        expect(dop2neu.wertAusStruktur([
            { type: 2, value: 8 }, { type: 5, value: 714 }, { type: 4, value: 0 },
        ])).to.equal(714);
    });

    it('gibt bei unbrauchbarer Eingabe null zurueck, statt zu werfen', () => {
        expect(dop2neu.wertAusStruktur(null)).to.equal(null);
        expect(dop2neu.wertAusStruktur([])).to.equal(null);
        expect(dop2neu.wertAusStruktur([{ type: 2, value: 8 }])).to.equal(null);
    });

    it('interpValue greift auf dieselbe Regel zurueck', () => {
        const fields = { 24: { type: 16, value: [
            { id: 1, type: 2, value: 9 }, { id: 2, type: 2, value: 0 }, { id: 3, type: 2, value: 0 },
            { id: 4, type: 2, value: 40 }, { id: 5, type: 2, value: 0 },
        ] } };
        expect(dop2neu.interpValue(fields, 24)).to.equal(40);
        expect(dop2neu.interpValue(fields, 25)).to.equal(null);
    });
});
