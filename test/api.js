'use strict';

const { expect } = require('chai');
const { MieleDeviceApi } = require('../lib/api');

/**
 * Der Reihenfolgeschutz sitzt in _request(); die eigentliche Uebertragung wird ersetzt, damit der
 * Test ohne Geraet und ohne Netz auskommt.
 */
function testApi(ablauf) {
    const api = new MieleDeviceApi('192.0.2.1', null);
    api._sendeAnfrage = (method, resource) => ablauf(method, resource);
    return api;
}

describe('Anfragen an ein Gerät', () => {
    it('stellt sie nacheinander, nie gleichzeitig', async () => {
        let laufend = 0;
        let hoechstens = 0;
        const api = testApi(() => {
            laufend++;
            hoechstens = Math.max(hoechstens, laufend);
            return new Promise(r => setTimeout(() => { laufend--; r('ok'); }, 5));
        });
        // Genau die Ueberlagerung aus der Praxis: Zustand, EcoFeedback und Sekundenzeit fallen
        // zusammen. Die XKM-Module beantworten dann nur eine Anfrage, der Rest laeuft ins Timeout.
        await Promise.all([api._request('GET', 'Devices/x/State'),
            api._request('GET', 'Devices/x/DOP2/2/6195'),
            api._request('GET', 'Devices/x/DOP2/2/256')]);
        expect(hoechstens, 'gleichzeitige Anfragen').to.equal(1);
    });

    it('behält die Reihenfolge bei', async () => {
        const dran = [];
        const api = testApi((m, res) => {
            dran.push(res);
            return Promise.resolve('ok');
        });
        await Promise.all(['a', 'b', 'c'].map(r => api._request('GET', r)));
        expect(dran).to.eql(['a', 'b', 'c']);
    });

    it('läuft nach einem Fehler weiter', async () => {
        // Sonst haette eine einzige Zeitueberschreitung alle folgenden Anfragen mitgerissen.
        let nr = 0;
        const api = testApi(() => {
            nr++;
            return nr === 1 ? Promise.reject(new Error('Timeout')) : Promise.resolve('ok');
        });
        await api._request('GET', 'a').then(() => { throw new Error('haette scheitern muessen'); },
            e => expect(e.message).to.equal('Timeout'));
        expect(await api._request('GET', 'b')).to.equal('ok');
        expect(await api._request('GET', 'c')).to.equal('ok');
    });
});
