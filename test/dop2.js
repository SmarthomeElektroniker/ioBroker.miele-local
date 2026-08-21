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
        const eco = dop2.ecoValues(fields, 25, 40);
        expect(eco.energyWh, 'Wh bleibt roh').to.equal(1991);
        expect(eco.energyKwh, '1991 Wh = 1,991 kWh').to.equal(1.991);
        expect(eco.waterL, '953 Zehntelliter = 95,3 l').to.equal(95.3);
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
