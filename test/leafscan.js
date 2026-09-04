'use strict';

const { expect } = require('chai');
const ls = require('../lib/leafscan');

describe('Leaf-Scan: Adressen', () => {
    it('geht die Bereiche vollstaendig durch', () => {
        const a = ls.adressen([{ unit: 2, von: 10, bis: 13 }]);
        expect(a).to.deep.equal([
            { unit: 2, attr: 10 }, { unit: 2, attr: 11 },
            { unit: 2, attr: 12 }, { unit: 2, attr: 13 },
        ]);
    });

    it('schliesst die vier bekannten Leafs ein', () => {
        // 2/119 Betriebsstunden, 2/256 Zeiten, 2/1583 Benutzeranfrage, 2/6195 EcoFeedback.
        // Waeren sie nicht dabei, taugte der Scan nicht als Gegenprobe.
        const alle = new Set(ls.adressen().map(a => ls.schluessel(a.unit, a.attr)));
        for (const bekannt of ['2/119', '2/256', '2/1583', '2/6195']) {
            expect(alle.has(bekannt), bekannt).to.be.true;
        }
    });

    it('bleibt in einer Groessenordnung, die ein Geraet vertraegt', () => {
        // Bei 700 ms Pause sind 700 Adressen rund acht Minuten reine Wartezeit - vertretbar.
        // Ein Scan ueber alle 65535 Attribute waere es nicht.
        expect(ls.adressen().length).to.be.below(1000);
    });
});

describe('Leaf-Scan: Fortsetzen', () => {
    const bereiche = [{ unit: 2, von: 1, bis: 10 }];

    it('faengt vorn an, wenn noch nichts da ist', () => {
        const n = ls.naechste({}, 3, bereiche);
        expect(n).to.deep.equal([{ unit: 2, attr: 1 }, { unit: 2, attr: 2 }, { unit: 2, attr: 3 }]);
    });

    it('setzt hinter dem Geprueften fort', () => {
        /*
         * Der Kern der Schonung: Ein Scan darf jederzeit abbrechen - Adapterneustart,
         * Netzfehler, Geraet schlaeft ein - und kostet dann nichts. Beim naechsten Mal geht
         * es an derselben Stelle weiter statt von vorn.
         */
        let erg = {};
        for (let a = 1; a <= 4; a++) erg = ls.aufnehmen(erg, 2, a, { status: 500 });
        expect(ls.naechste(erg, 2, bereiche)).to.deep.equal([
            { unit: 2, attr: 5 }, { unit: 2, attr: 6 },
        ]);
    });

    it('liefert nichts mehr, wenn alles geprueft ist', () => {
        let erg = {};
        for (let a = 1; a <= 10; a++) erg = ls.aufnehmen(erg, 2, a, { status: 500 });
        expect(ls.naechste(erg, 5, bereiche)).to.be.empty;
        expect(ls.fortschritt(erg, bereiche).text).to.match(/fertig/);
    });
});

describe('Leaf-Scan: Ergebnisse', () => {
    it('merkt sich die Feldwerte, nicht nur die Anzahl', () => {
        // Ohne die Werte muesste jedes gefundene Leaf noch einmal von Hand angesehen werden.
        const erg = ls.aufnehmen({}, 2, 6195, { felder: { 21: 13341, 25: 319 } });
        expect(erg['2/6195'].felder['21']).to.equal(13341);
        expect(erg['2/6195'].anzahl).to.equal(2);
    });

    it('haelt eine Absage als Absage fest', () => {
        // Auch ein 500er ist ein Ergebnis - sonst wird die Adresse ewig neu gefragt.
        const erg = ls.aufnehmen({}, 2, 999, { status: 500 });
        expect(erg['2/999'].antwortet).to.be.false;
        expect(erg['2/999'].status).to.equal(500);
    });

    it('wertet ein leeres Leaf nicht als Treffer', () => {
        const erg = ls.aufnehmen({}, 2, 5, { felder: {} });
        expect(erg['2/5'].antwortet).to.be.false;
    });

    it('sortiert die Treffer nach Feldzahl', () => {
        let erg = {};
        erg = ls.aufnehmen(erg, 2, 100, { felder: { 1: 1 } });
        erg = ls.aufnehmen(erg, 2, 200, { felder: { 1: 1, 2: 2, 3: 3 } });
        erg = ls.aufnehmen(erg, 2, 300, { status: 500 });
        expect(ls.treffer(erg)).to.deep.equal([
            { leaf: '2/200', felder: 3 }, { leaf: '2/100', felder: 1 },
        ]);
    });
});

describe('Leaf-Scan: Unterschiede zwischen zwei Scans', () => {
    /*
     * DER EIGENTLICHE ZWECK. Ein Leaf mit vierzig Feldern sagt fuer sich nichts. Erst zwei
     * Scans - einer im Leerlauf, einer waehrend eines Programms - zeigen, welche Felder
     * sich mit der Maschine bewegen. Genau diese sind die Kandidaten fuer Energie, TwinDos
     * und alles andere, was noch fehlt.
     */
    const leerlauf = {
        '2/6195': { antwortet: true, felder: { 21: 0, 25: 0, 99: 7 }, anzahl: 3 },
        '2/300': { antwortet: true, felder: { 1: 'W1' }, anzahl: 1 },
    };
    const imLauf = {
        '2/6195': { antwortet: true, felder: { 21: 13341, 25: 319, 99: 7 }, anzahl: 3 },
        '2/300': { antwortet: true, felder: { 1: 'W1' }, anzahl: 1 },
    };

    it('findet genau die Felder, die sich bewegt haben', () => {
        const u = ls.unterschiede(leerlauf, imLauf);
        expect(u).to.have.lengthOf(2);
        expect(u.map(x => x.feld).sort()).to.deep.equal(['21', '25']);
    });

    it('nennt alten und neuen Wert', () => {
        const u = ls.unterschiede(leerlauf, imLauf).find(x => x.feld === '21');
        expect(u.von).to.equal(0);
        expect(u.bis).to.equal(13341);
        expect(u.leaf).to.equal('2/6195');
    });

    it('uebergeht, was gleich geblieben ist', () => {
        // Feld 99 und das ganze Leaf 2/300 - Konfiguration und Geraetebeschreibung.
        const felder = ls.unterschiede(leerlauf, imLauf).map(x => x.feld);
        expect(felder).to.not.include('99');
        expect(ls.unterschiede(leerlauf, imLauf).map(x => x.leaf)).to.not.include('2/300');
    });

    it('verkraftet ein Leaf, das nur in einem der beiden Scans antwortet', () => {
        // Ein schlafendes Geraet antwortet auf manches nicht - das ist kein Unterschied,
        // sondern eine Luecke, und darf nicht als Bewegung gezaehlt werden.
        const halb = { '2/6195': { antwortet: false, status: 500 } };
        expect(ls.unterschiede(halb, imLauf)).to.be.empty;
        expect(ls.unterschiede(leerlauf, halb)).to.be.empty;
    });

    it('verkraftet leere Eingaben', () => {
        expect(ls.unterschiede(null, null)).to.be.empty;
        expect(ls.unterschiede({}, imLauf)).to.be.empty;
    });
});
