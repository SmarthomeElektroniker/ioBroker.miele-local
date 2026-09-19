'use strict';

/*
 * Der Teilungsfaktor des Wasserfelds - an allen Stellen derselbe.
 *
 * Bis zum 11.09.2026 war die Einstellung eine Auswahl "Einheit Wasserfeld" mit 1, 10 und 100, die
 * Vorgabe aber 200 (Feld 21 der WCR860 zaehlt in Schritten von 5 ml). Der richtige Wert liess sich
 * nicht auswaehlen, und fehlte er, rechnete main.js mit 100 und lib/dop2.js mit 10 - doppelt bzw.
 * zwanzigmal zu viele Liter. Dieser Test haelt die vier Stellen zusammen.
 */

const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('chai');

const wurzel = path.join(__dirname, '..');
const jsonConfig = require('../admin/jsonConfig.json');
const io = require('../io-package.json');

function finde(knoten, name) {
    const items = knoten && knoten.items;
    if (!items || typeof items !== 'object' || Array.isArray(items)) return null;
    if (items[name]) return items[name];
    for (const kind of Object.values(items)) {
        const treffer = finde(kind, name);
        if (treffer) return treffer;
    }
    return null;
}

describe('Teilungsfaktor Wasserfeld', () => {
    it('ist ein freies Zahlenfeld mit Nachkommastellen und Vorgabe 200', () => {
        const feld = finde(jsonConfig, 'ecoWaterDiv');
        expect(feld, 'ecoWaterDiv in jsonConfig').to.not.equal(null);
        expect(feld.type).to.equal('number');
        expect(feld.default).to.equal(200);
        expect(feld.step).to.be.below(1);
    });

    it('hat in io-package.json und in beiden Rueckfallwerten dieselbe Vorgabe', () => {
        expect(io.native.ecoWaterDiv).to.equal(200);
        const main = fs.readFileSync(path.join(wurzel, 'main.js'), 'utf8');
        const dop2 = fs.readFileSync(path.join(wurzel, 'lib/dop2.js'), 'utf8');
        expect(Number(main.match(/const ECO_WATER_DIV = (\d+)/)[1])).to.equal(200);
        expect(dop2.match(/waterDiv = (\d+)\)/)[1]).to.equal('200');
        expect(dop2.match(/Number\(waterDiv\) > 0 \? Number\(waterDiv\) : (\d+);/)[1]).to.equal('200');
    });
});
