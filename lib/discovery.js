'use strict';

/**
 * mDNS-Discovery der Miele-Geräte (_mieleathome._tcp).
 *
 * Record-Struktur (real beobachtet):
 *   PTR  _mieleathome._tcp.local            → "Miele <TechType>._mieleathome._tcp.local"
 *   SRV  Miele <TechType>._mieleathome...   → target "Miele-<MAC>.local", port 80
 *   TXT  Miele <TechType>._mieleathome...   → group=<GroupID>, devicetype, pairing, …
 *   A    Miele-<MAC>.local                  → IP
 *
 * Liefert je Gerät: ip, host, techType, txt (group/devicetype/pairing/…).
 * Die Seriennummer steht NICHT im mDNS – sie kommt aus dem signierten /Ident.
 *
 * Nutzt `multicast-dns` (pure JS, keine nativen Abhängigkeiten).
 */

// multicast-dns wird bewusst NICHT top-level geladen: mDNS-Discovery ist experimentell und im
// Bridge-Netz (Docker) ohnehin funktionslos (Multicast wird nicht gebrückt) - der Normalbetrieb
// nutzt manuelle Geräte-IPs. Fehlt das Modul (z. B. nach einem abgebrochenen npm-Install), darf das
// NICHT den ganzen Adapter am Start crashen. Daher lazy require erst in discover().
const SERVICE = '_mieleathome._tcp.local';

function parseTxt(buffers) {
    const txt = {};
    for (const b of buffers || []) {
        const s = b.toString('utf8');
        const eq = s.indexOf('=');
        if (eq > 0) {
            txt[s.slice(0, eq)] = s.slice(eq + 1);
        } else if (s) {
            txt[s] = true;
        }
    }
    return txt;
}

/**
 * @param {number} timeoutMs  Sammelzeit
 * @param {(msg:string)=>void} [log]
 * @returns {Promise<Array<{ip:string, host:string, port:number, techType:string, txt:object}>>}
 */
function discover(timeoutMs = 5000, log = () => {}, adapter = null) {
    // Timer über den Adapter, damit sie beim Beenden sauber aufgeräumt werden (ioBroker-Vorgabe)
    const setT = adapter ? adapter.setTimeout.bind(adapter) : global.setTimeout;
    const clearT = adapter ? adapter.clearTimeout.bind(adapter) : global.clearTimeout;
    return new Promise(resolve => {
        let multicastDns;
        try {
            multicastDns = require('multicast-dns');
        } catch (e) {
            log('mDNS discovery unavailable (multicast-dns not installed) - please configure device IPs manually.');
            return resolve([]);
        }
        const mdns = multicastDns();
        const instances = {}; // instanceName → { techType, host, port, txt }
        const hostToIp = {}; // host → ip

        mdns.on('response', res => {
            for (const a of [...(res.answers || []), ...(res.additionals || [])]) {
                if (a.type === 'SRV' && a.name.endsWith(`.${SERVICE}`)) {
                    const inst = (instances[a.name] = instances[a.name] || { techType: '', host: null, port: 80, txt: {} });
                    inst.host = a.data.target;
                    inst.port = a.data.port;
                    inst.techType = a.name.replace(`.${SERVICE}`, '').replace(/^Miele\s*/i, '').trim();
                } else if (a.type === 'TXT' && a.name.endsWith(`.${SERVICE}`)) {
                    const inst = (instances[a.name] = instances[a.name] || { techType: '', host: null, port: 80, txt: {} });
                    Object.assign(inst.txt, parseTxt(a.data));
                    if (!inst.techType) {
                        inst.techType = a.name.replace(`.${SERVICE}`, '').replace(/^Miele\s*/i, '').trim();
                    }
                } else if (a.type === 'A') {
                    hostToIp[a.name] = a.data;
                }
            }
        });

        const query = () => mdns.query({ questions: [{ name: SERVICE, type: 'PTR' }] });
        query();
        const q2 = setT(query, 1000);

        setT(() => {
            clearT(q2);
            try {
                mdns.destroy();
            } catch {
                /* egal */
            }
            const list = [];
            for (const inst of Object.values(instances)) {
                const ip = inst.host ? hostToIp[inst.host] : null;
                if (ip) {
                    list.push({ ip, host: inst.host, port: inst.port, techType: inst.techType, txt: inst.txt });
                }
            }
            log(`mDNS: ${list.length} Miele device(s) found`);
            resolve(list);
        }, timeoutMs);
    });
}

module.exports = { discover, SERVICE };
