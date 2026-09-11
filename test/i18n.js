'use strict';

const { expect } = require('chai');
const fs = require('node:fs');
const path = require('node:path');

/*
 * Die Uebersetzungen gegen die Admin-Oberflaeche halten.
 *
 * WOZU EIN TEST. Jeder Text, der in admin/jsonConfig.json steht, braucht bei "i18n": true
 * einen Eintrag in allen Sprachdateien - sonst faellt die Oberflaeche fuer alle nicht-deutschen
 * Benutzer auf den deutschen Rohtext zurueck, ohne dass irgendwo ein Fehler erscheint. Am
 * 11.09.2026 fehlten so ZWOELF Texte; gemeldet hatte der Adapter-Checker nur einen davon.
 *
 * Die Gegenrichtung zaehlt genauso: Schluessel, die keine Oberflaeche mehr nennt, sind
 * Ueberbleibsel frueherer Fassungen und wandern bei jeder Uebersetzungsrunde mit.
 */
const I18N = path.join(__dirname, '..', 'admin', 'i18n');

/** Die Feldnamen der jsonConfig, deren Inhalt der Admin uebersetzt anzeigt. */
const TEXTFELDER = ['text', 'label', 'help', 'placeholder', 'title', 'tooltip', 'desc'];

function texteAusConfig(knoten, aus = new Set()) {
    if (Array.isArray(knoten)) {
        knoten.forEach(k => texteAusConfig(k, aus));
    } else if (knoten && typeof knoten === 'object') {
        for (const [name, wert] of Object.entries(knoten)) {
            if (TEXTFELDER.includes(name) && typeof wert === 'string' && wert.trim()) {
                aus.add(wert);
            } else {
                texteAusConfig(wert, aus);
            }
        }
    }
    return aus;
}

describe('Übersetzungen', () => {
    const config = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'admin', 'jsonConfig.json'), 'utf8'));
    const gebraucht = [...texteAusConfig(config)];
    const sprachen = fs.readdirSync(I18N).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
    const lade = l => JSON.parse(fs.readFileSync(path.join(I18N, `${l}.json`), 'utf8'));

    it('kennt alle Sprachen des Repositories', () => {
        expect(sprachen).to.have.members(
            ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'uk', 'zh-cn']);
    });

    it('hat für jeden Text der Oberfläche einen Eintrag', () => {
        const en = lade('en');
        const fehlend = gebraucht.filter(t => !(t in en));
        expect(fehlend, `ohne Übersetzung: ${fehlend.map(t => t.slice(0, 60)).join(' | ')}`)
            .to.deep.equal([]);
    });

    it('führt keine Schlüssel mit, die niemand mehr braucht', () => {
        const en = lade('en');
        const verwaist = Object.keys(en).filter(k => !gebraucht.includes(k));
        expect(verwaist, `verwaist: ${verwaist.map(t => t.slice(0, 60)).join(' | ')}`)
            .to.deep.equal([]);
    });

    it('hat in jeder Sprache dieselben Schlüssel und keine leeren Werte', () => {
        const en = Object.keys(lade('en')).sort();
        for (const l of sprachen) {
            const d = lade(l);
            expect(Object.keys(d).sort(), `Sprache ${l}`).to.deep.equal(en);
            const leer = Object.entries(d).filter(([, v]) => !String(v).trim()).map(([k]) => k);
            expect(leer, `leere Werte in ${l}`).to.deep.equal([]);
        }
    });

    it('liegt im kurzen Dateiformat vor', () => {
        // admin/i18n/en.json statt admin/i18n/en/translations.json - siehe Checker S5601.
        expect(fs.existsSync(path.join(I18N, 'en', 'translations.json'))).to.equal(false);
    });
});
