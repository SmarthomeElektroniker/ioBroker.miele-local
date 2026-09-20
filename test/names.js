'use strict';

/*
 * Jeder deutsche Datenpunktname braucht alle elf Sprachen.
 *
 * Die Objektpruefung des PR #6471 meldete am 11.09.2026 54-mal E6001: Alle Datenpunkte, die seit
 * 0.3.5 dazugekommen waren, trugen nur {en, de}. Die Uebersetzungen stehen in lib/names.js
 * (TEXTE), der Name selbst aber im Code - neue Datenpunkte fallen deshalb erst beim naechsten
 * Objektexport auf. Dieser Test sucht die Namen im Quelltext und prueft sie sofort.
 *
 * Erfasst werden beide Schreibweisen: namen.text('Deutsch', 'English', ...) bzw. t('Deutsch', ...)
 * und die Zeilen der Sammlungs-Liste ['id', 'Deutsch', 'English', 'string' | 'number' | 'boolean', ...].
 */

const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('chai');
const namen = require('../lib/names');

const SPRACHEN = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];
const STRING = String.raw`'((?:[^'\\]|\\.)*)'`;

function quelltexte() {
    const wurzel = path.join(__dirname, '..');
    const dateien = ['main.js', ...fs.readdirSync(path.join(wurzel, 'lib')).map(f => `lib/${f}`)]
        .filter(f => f.endsWith('.js'));
    return dateien.map(f => fs.readFileSync(path.join(wurzel, f), 'utf8')).join('\n');
}

function deutscheNamen(code) {
    const gefunden = new Set();
    const aufrufe = new RegExp(String.raw`(?:namen\.text|\bt)\(\s*${STRING}\s*,\s*${STRING}`, 'g');
    /*
     * Das erste Element ist entweder ein Stringliteral oder - seit die Objekt-IDs in
     * lib/ids.js stehen - ein Verweis in jene Tabelle (ids.SAMMLUNG.records). Beides muss
     * der Ausdruck finden, sonst rutschen die Namen der Datensammlung ungeprueft durch.
     */
    const KENNUNG = String.raw`(?:'\w+'|ids\.[A-Z]+\.\w+)`;
    const zeilen = new RegExp(
        String.raw`\[\s*${KENNUNG}\s*,\s*${STRING}\s*,\s*${STRING}\s*,\s*'(?:string|number|boolean)'`, 'g');
    for (const muster of [aufrufe, zeilen]) {
        for (const m of code.matchAll(muster)) gefunden.add(m[1].replace(/\\'/g, "'"));
    }
    return [...gefunden];
}

/*
 * Die Namen der geraeteinternen Werte stehen in Tabellen, nicht in Aufrufen.
 *
 * lib/datenpunkte.js fuehrt die Beschriftungen als Nachschlagewerk (DEUTSCH je Feld,
 * KANAL_NAMEN je Kanal) und reicht sie erst zur Laufzeit an namen.text weiter. Der Regelausdruck
 * oben findet sie deshalb nicht - und ohne diese Ergaenzung waeren seit 0.3.37 rund vierzig
 * Datenpunktnamen ungeprueft durchgerutscht, genau die Sorte Luecke, derentwegen es diesen Test
 * gibt.
 */
function tabellenNamen() {
    const dp = require('../lib/datenpunkte');
    return [...Object.values(dp.DEUTSCH), ...Object.values(dp.KANAL_NAMEN).map(p => p[0])];
}

describe('Datenpunktnamen', () => {
    const liste = [...new Set([...deutscheNamen(quelltexte()), ...tabellenNamen()])];

    it('findet die Namen im Quelltext', () => {
        expect(liste.length).to.be.greaterThan(30);
        expect(liste).to.include('Anzahl gesammelter Zyklen');
        expect(liste).to.include('Betriebsstunden gesamt');
    });

    it('hat fuer jeden Namen alle elf Sprachen', () => {
        const fehlend = liste
            .map(de => ({ de, obj: namen.text(de, 'x', true) }))
            .filter(({ obj }) => SPRACHEN.some(s => !obj[s]))
            .map(({ de, obj }) => `${de} (fehlt: ${SPRACHEN.filter(s => !obj[s]).join(', ')})`);
        expect(fehlend, fehlend.join('\n')).to.deep.equal([]);
    });
});
