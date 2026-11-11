'use strict';

/*
 * Geraetekarten fuer den Device-Manager (Issue #22).
 *
 * Geprueft wird mit dem Objektbaum aus miele-local.0.json und einem nachgebauten Adapter.
 * Kein Test spricht ein Geraet an: Befehle landen in einer Attrappe, die den Abschluss von
 * lib/befehle.js nachspielt.
 */

const { expect } = require('chai');
const path = require('node:path');
const gm = require('../lib/geraetemanager');
const namen = require('../lib/names');

const NS = 'miele-local.0';
const BAUM = require(path.join(__dirname, '..', 'miele-local.0.json'));
const OFEN = '000133333333';
const WASCHMASCHINE = '000111111111';

function objekte() {
    const m = new Map();
    for (const [id, o] of Object.entries(BAUM)) {
        if (o.type === 'state' && id.startsWith(`${NS}.`)) {
            m.set(id.slice(NS.length + 1), o);
        }
    }
    return m;
}

function karte(id, steuerung = true, deviceType = 12) {
    return gm.karte({ ns: NS, id, obj: BAUM[`${NS}.${id}`], objekte: objekte(), deviceType, steuerung });
}

/** Adapter-Attrappe: Objekte aus dem Baum, Zustaende im Speicher, Befehle werden mitgeschrieben. */
function adapter({ allowControl = true, abschluss } = {}) {
    const zustaende = {};
    const geschrieben = [];
    const zeilen = typ =>
        Object.entries(BAUM)
            .filter(([id, o]) => o.type === typ && id.startsWith(`${NS}.`))
            .map(([id, o]) => ({ id, value: { ...o, _id: id } }));
    return {
        namespace: NS,
        config: { allowControl },
        log: { debug() {}, info() {}, warn() {}, error() {} },
        on() {},
        geschrieben,
        getObjectViewAsync: async (_d, typ) => ({ rows: zeilen(typ) }),
        getStateAsync: async id => zustaende[id] || (id.endsWith('info.deviceType') ? { val: 12 } : null),
        setStateAsync: async (id, st) => {
            geschrieben.push({ id, ...st });
            zustaende[id] = { ...st, ts: Date.now() };
            // lib/befehle.js schliesst jeden Befehl mit ack=true ab - hier nachgespielt.
            if (st.ack === false && abschluss) {
                setTimeout(() => (zustaende[id] = { ...abschluss, ack: true, ts: Date.now() }), 5);
            }
        },
        setTimeout: (f, ms) => setTimeout(f, ms),
    };
}

describe('Geräte-Manager', () => {
    it('jeder Text hat alle elf Sprachen und keine leeren Einträge', () => {
        for (const [k, t] of Object.entries(gm.TEXTE)) {
            expect(Object.keys(t), k).to.have.members(namen.SPRACHEN);
            for (const [sp, s] of Object.entries(t)) {
                expect(s, `${k}/${sp}`).to.be.a('string').and.not.equal('');
            }
        }
    });

    it('Platzhalter werden je Sprache eingesetzt', () => {
        const t = gm.text('confirm', { befehl: gm.TEXTE.start });
        expect(t.de).to.equal('„Start“ jetzt an das Gerät senden?');
        expect(t.fr).to.contain('Démarrer');
        expect(gm.text('failed', { grund: 'HTTP 403' }).en).to.equal('The command was not executed: HTTP 403');
    });

    it('Karte zeigt den Betrieb: Name, Modell, Erreichbarkeit, Störung, Status bis Programmende', () => {
        const k = karte(OFEN);
        expect(k.id).to.equal(OFEN);
        expect(k.name).to.deep.equal(BAUM[`${NS}.${OFEN}`].common.name);
        expect(k.manufacturer).to.equal('Miele');
        expect(k.model).to.deep.equal({ stateId: `${NS}.${OFEN}.info.techType` });
        expect(k.status.connection.stateId).to.equal(`${NS}.${OFEN}.info.connected`);
        expect(k.status.connection.mapping).to.deep.equal({ true: 'connected', false: 'disconnected' });
        expect(k.status.warning.stateId).to.equal(`${NS}.${OFEN}.state.signalFailure`);
        expect(k.indicators.map(i => i.id)).to.deep.equal(['signalInfo']);
        // laufender Betrieb als Datenpunkt-Zeilen auf der Karte (customInfo), keine info-Controls
        expect(k.controls).to.equal(undefined);
        const zeilen = Object.values(k.customInfo.schema.items);
        expect(zeilen.map(z => z.oid)).to.deep.equal(gm.KARTE.map(s => `${NS}.${OFEN}.${s}`));
        expect(zeilen.every(z => z.type === 'state' && z.readOnly === true && z.foreign === true)).to.equal(true);
        expect(k.icon).to.match(/^data:image\/svg\+xml;base64,/);
        expect(k.hasDetails).to.equal(true);
        expect(k.group.key).to.equal('type12');
        expect(k.group.name.de).to.equal('Backofen');
        expect(k.group.name.en).to.equal('Oven');
    });

    it('Bedienung nur mit freigegebener Steuerung - und nur Alltagsbefehle', () => {
        expect(karte(OFEN, false).actions).to.equal(undefined);
        const ids = karte(OFEN).actions.map(a => a.id);
        expect(ids).to.deep.equal(['powerOn', 'powerOff', 'start', 'pause', 'stop', 'lightOn', 'lightOff']);
        for (const a of karte(OFEN).actions) {
            expect(gm.BEFEHLE).to.include(a.id);
            // Symbolknoepfe mit Befehlsnamen als Tooltip - sieben Textknoepfe passen nicht auf die Karte
            expect(a.description.de).to.be.a('string');
            expect(a.icon).to.equal(gm.KNOPFSYMBOL[a.id]);
            expect(a.title).to.equal(undefined);
            // Eingriffe in den Betrieb werden bestaetigt, das Licht nicht.
            expect(!!a.confirmation, a.id).to.equal(!a.id.startsWith('light'));
        }
    });

    it('Licht nur bei Geräten, die eines haben', () => {
        const hatLicht = objekte().has(`${WASCHMASCHINE}.state.light`);
        const ids = karte(WASCHMASCHINE, true, 1).actions.map(a => a.id);
        expect(ids.includes('lightOn')).to.equal(hatLicht);
    });

    it('keine Konfigurationsaktionen: keine Instanz-Aktionen, keine Such-/Koppel-/Löschknöpfe', () => {
        const mgr = new gm.MieleGeraeteManager(adapter());
        const inst = mgr.getInstanceInfo();
        expect(inst.apiVersion).to.equal('v3');
        expect(inst.actions).to.equal(undefined);
        const verboten = /discover|search|pair|delete|add|new|scan|settings|rename|edit/i;
        for (const id of [OFEN, WASCHMASCHINE]) {
            for (const a of karte(id).actions || []) {
                expect(a.id).to.not.match(verboten);
            }
        }
    });

    it('Aufklappfeld nennt nur vorhandene Werte, live aus den Datenpunkten', () => {
        const d = gm.details(OFEN, objekte());
        const items = Object.values(d.schema.items);
        expect(items.length).to.be.greaterThan(5);
        for (const i of items) {
            expect(i.type).to.equal('state');
            expect(objekte().has(i.oid), i.oid).to.equal(true);
        }
        expect(items.some(i => i.oid === `${OFEN}.state.targetTemperature` && i.unit === '°C')).to.equal(true);
    });

    it('loadDevices legt je Gerät eine Karte an', async () => {
        const mgr = new gm.MieleGeraeteManager(adapter());
        const karten = [];
        let gesamt = 0;
        await mgr.loadDevices({ addDevice: k => karten.push(k), setTotalDevices: n => (gesamt = n) });
        const erwartet = Object.values(BAUM).filter(o => o.type === 'device').length;
        expect(gesamt).to.equal(erwartet);
        expect(karten).to.have.length(erwartet);
        expect(karten.every(k => typeof k.actions[0].handler === 'function')).to.equal(true);
    });

    it('Knopf schreibt den Steuer-Datenpunkt mit ack=false und meldet Erfolg still', async () => {
        const a = adapter({ abschluss: { val: false, q: 0, c: 'done via 2/1586 (HTTP 204)' } });
        const mgr = new gm.MieleGeraeteManager(a);
        const meldungen = [];
        const erg = await mgr.befehl(OFEN, 'powerOn', { showMessage: async t => meldungen.push(t) }, { takt: 10 });
        expect(erg).to.deep.equal({ refresh: 'none' });
        expect(a.geschrieben[0]).to.include({ id: `${OFEN}.control.powerOn`, val: true, ack: false });
        expect(meldungen).to.deep.equal([]);
    });

    it('abgelehnter Befehl: Grund aus dem Kommentarfeld wird angezeigt', async () => {
        const a = adapter({ abschluss: { val: false, q: 0x44, c: 'not executed: HTTP 403 from x' } });
        const mgr = new gm.MieleGeraeteManager(a);
        const meldungen = [];
        await mgr.befehl(OFEN, 'start', { showMessage: async t => meldungen.push(t) }, { takt: 10 });
        expect(meldungen).to.have.length(1);
        expect(meldungen[0].de).to.equal('Der Befehl wurde nicht ausgeführt: HTTP 403 from x');
    });

    it('ohne Abschluss: Zeitüberschreitung wird gemeldet, nichts wiederholt', async () => {
        const a = adapter();
        const erg = await gm.befehlAusfuehren(a, `${OFEN}.control.stop`, { wartezeit: 40, takt: 10 });
        expect(erg).to.deep.equal({ zeitueberschreitung: true });
        expect(a.geschrieben).to.have.length(1);
    });
});
