'use strict';

/*
 * Die Feldnamen der DOP2-Leafs und die Umrechnung der Betriebszeit.
 *
 * Die Namen stammen aus fremder Reverse-Engineering-Arbeit (siehe lib/felder.js) und sind damit
 * genau die Sorte Wissen, die beim naechsten Umbau unbemerkt verlorengeht. Geprueft wird deshalb
 * nicht die ganze Tabelle, sondern was der Adapter tatsaechlich benutzt - und die Umrechnung,
 * die einen echten Fehler behoben hat.
 */

const { expect } = require('chai');
const felder = require('../lib/felder');

describe('Feldnamen der DOP2-Leafs', () => {
    it('kennt die Felder, an denen die Feldsuche haengt', () => {
        expect(felder.feldName('2/6195', 21)).to.equal('totalImpulses');
        expect(felder.feldName('2/6195', 25)).to.equal('heatingEnergy');
        expect(felder.feldName('2/6195', 26)).to.equal('heatingTime');
        expect(felder.feldName('2/6195', 16)).to.equal('energyConsumed');
        expect(felder.feldName('2/6195', 17)).to.equal('waterConsumedInLitres');
    });

    it('kennt Aktoren und Sensoren', () => {
        expect(felder.feldName('2/6192', 1)).to.equal('heater1');
        expect(felder.feldName('2/6193', 4)).to.equal('doorSwitch');
    });

    it('erfindet nichts', () => {
        expect(felder.feldName('2/6195', 999)).to.equal(null);
        expect(felder.feldName('9/9999', 1)).to.equal(null);
    });

    it('haengt den Namen an die Nummer, ohne die Nummer zu verlieren', () => {
        const aus = felder.benennen('2/6195', { 21: 13341, 25: 319, 99: 7 });
        // Feld 21 traegt eine bekannte Einheit und zeigt sie mit an - siehe "Einheiten der Rohfelder".
        expect(aus['21 totalImpulses']).to.equal('13341 (66.71 l)');
        expect(aus['25 heatingEnergy']).to.equal(319);
        // Unbekanntes Feld behaelt seinen Schluessel - keine erfundene Bezeichnung.
        expect(aus['99']).to.equal(7);
    });
});

describe('Einheiten der Rohfelder', () => {
    it('rechnet die belegten Felder um', () => {
        // Wasser: 5 ml je Impuls. 13341 Impulse = 66,7 l - gegen die Cloud auf 0,5 % genau.
        expect(felder.umrechnen('2/6195', 21, 13341)).to.deep.equal({ wert: 66.71, einheit: 'l' });
        // Temperatur am Frequenzumrichter, Zehntelgrad.
        expect(felder.umrechnen('2/6195', 15, 1028)).to.deep.equal({ wert: 102.8, einheit: '°C' });
        // Beladung in halben Kilogramm: der hoechste je gemessene Rohwert 16 ergibt die Nennlast.
        expect(felder.umrechnen('2/6195', 65, 16)).to.deep.equal({ wert: 8, einheit: 'kg' });
    });

    it('laesst Felder ohne bekannte Einheit unberuehrt', () => {
        expect(felder.umrechnen('2/6195', 26, 568)).to.equal(null);
        expect(felder.umrechnen('2/6192', 1, 1)).to.equal(null);
        expect(felder.umrechnen('2/6195', 21, null)).to.equal(null);
    });

    it('zeigt in benennen() Rohwert UND Umrechnung', () => {
        const aus = felder.benennen('2/6195', { 21: 13341, 25: 319 });
        // Der Rohwert bleibt sichtbar - jede Auswertung muss auf ihn zurueckgreifen koennen.
        expect(aus['21 totalImpulses']).to.equal('13341 (66.71 l)');
        expect(aus['25 heatingEnergy']).to.equal(319);
    });
});

describe('Betriebszeit aus Leaf 2/119', () => {
    /*
     * Der Beleg vom 11.09.2026: Die Spuelmaschine meldet 439713. Als Stunden waeren das 50 Jahre
     * Dauerbetrieb, als Minuten 7329 Stunden - und nur das ist moeglich.
     */
    it('rechnet Minuten in Stunden um', () => {
        expect(felder.stundenAusLeaf(439713)).to.equal(7328.6);
        expect(felder.stundenAusLeaf(6766)).to.equal(112.8);
        expect(felder.MINUTEN_JE_STUNDE).to.equal(60);
    });

    it('nimmt nur brauchbare Zahlen', () => {
        // 0 heisst bei einem laufenden Geraet nicht "null Stunden", sondern "fuehrt diesen
        // Zaehler nicht" - dann bleibt der Datenpunkt lieber, wie er ist.
        expect(felder.stundenAusLeaf(0)).to.equal(null);
        expect(felder.stundenAusLeaf(-5)).to.equal(null);
        expect(felder.stundenAusLeaf(null)).to.equal(null);
        expect(felder.stundenAusLeaf('123')).to.equal(null);
        expect(felder.stundenAusLeaf(NaN)).to.equal(null);
    });
});
