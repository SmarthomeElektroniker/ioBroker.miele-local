'use strict';

/**
 * SuperVision-Push-Listener.
 *
 * Der Adapter gibt sich per mDNS als Haushalts-Peer aus. Cloud-gekoppelte
 * Miele-Geräte melden ihn dann als SuperVision-Empfänger an und POSTen ihre
 * Zustandsänderungen verschlüsselt an unseren HTTP-Server. Wir entschlüsseln
 * mit dem GroupKey (IV = Authorization-Signatur) und liefern das State-Objekt
 * per Callback zurück.
 *
 * Der Handshake (die Geräte fragen vorab unser /Devices, /Ident, /State,
 * /SuperVision ab) wird mit signierten, verschlüsselten Antworten bedient.
 *
 * Hinweis: Push ist eine Best-Effort-Ergänzung; das Polling bleibt der
 * zuverlässige Fallback.
 */

const http = require('node:http');
const os = require('node:os');
const multicastDns = require('multicast-dns');

const SERVICE = '_mieleathome._tcp.local';
const CONTENT_TYPE = 'application/vnd.miele.v1+json; charset=utf-8';
// OUI-EUI64-Präfix von Miele für den synthetischen Hostnamen
const MIELE_OUI_EUI64 = '001D63FFFE';
const OUR_FAB = '000000000001'; // synthetische Fab-Nummer unseres Peers

function httpDate() {
    return new Date().toUTCString();
}

function detectLanIp(_targetIp) {
    // Erste nicht-interne IPv4 als Fallback; genauer wäre routing-basiert.
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const i of ifaces[name]) {
            if (i.family === 'IPv4' && !i.internal) return i.address;
        }
    }
    return '0.0.0.0';
}

function syntheticHostname(fab) {
    const digits = String(fab).replace(/\D/g, '');
    const fabInt = parseInt(digits.slice(-8) || '0', 10);
    const bottom24 = (fabInt & 0xffffff).toString(16).toUpperCase().padStart(6, '0');
    return `Miele-${MIELE_OUI_EUI64}${bottom24}.local`;
}

class MielePushListener {
    /**
     * @param {object} opts
     * @param {number} opts.port
     * @param {import('./crypto').MieleCrypto} opts.crypto
     * @param {object} opts.log
     * @param {(ev:{route:string, state:object})=>Promise<void>} opts.onEvent
     * @param {string} [opts.hostIp]
     */
    constructor(opts) {
        this.port = opts.port || 18082;
        this.mc = opts.crypto;
        this.log = opts.log || console;
        this.adapter = opts.adapter || null;
        this.onEvent = opts.onEvent;
        this.hostIp = opts.hostIp || detectLanIp('192.168.0.1');
        this.ourFab = OUR_FAB;
        this.hostname = syntheticHostname(OUR_FAB);
        this.instance = `ioBroker ${OUR_FAB}.${SERVICE}`;
        this.server = null;
        this.mdns = null;
    }

    start() {
        this._startHttp();
        this._advertiseMdns();
    }

    async stop() {
        try {
            if (this.mdns) this.mdns.destroy();
        } catch {
            /* egal */
        }
        await new Promise(res => {
            if (this.server) this.server.close(() => res());
            else res();
        });
    }

    _startHttp() {
        this.server = http.createServer((req, res) => this._handle(req, res));
        this.server.on('error', e => this.log.warn(`Push-HTTP-Server-Fehler: ${e.message}`));
        this.server.listen(this.port, '0.0.0.0');
    }

    _parseAuth(headers) {
        const auth = headers['authorization'] || '';
        if (!auth.startsWith('MieleH256 ')) return { gid: '', sig: '' };
        const rest = auth.slice('MieleH256 '.length);
        const c = rest.indexOf(':');
        if (c < 0) return { gid: '', sig: '' };
        return { gid: rest.slice(0, c), sig: rest.slice(c + 1) };
    }

    _signedResponse(res, bodyText) {
        const date = httpDate();
        const { body, signature } = this.mc.signResponse(200, date, bodyText);
        res.writeHead(200, {
            'Content-Type': CONTENT_TYPE,
            'Content-Length': body.length,
            Date: date,
            'X-Signature': signature,
            Connection: 'close',
        });
        res.end(body);
    }

    _handle(req, res) {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            const body = Buffer.concat(chunks);
            const path = req.url.split('?')[0];
            try {
                // SuperVision-Push: POST /Devices/<ourfab>/SuperVision/<peerfab>/State/…
                const m = path.match(/^\/Devices\/\d+\/SuperVision\/(\d+)\//);
                if (req.method === 'POST' && m) {
                    return this._handlePush(req, res, m[1], body);
                }
                // Subscription-Anlage durch Peer
                if (req.method === 'POST' && /^\/Subscriptions\/?$/.test(path)) {
                    res.writeHead(200, { 'Content-Length': 0, Connection: 'close' });
                    return res.end();
                }
                // Handshake-GETs → signierte, minimale Antworten
                if (req.method === 'GET' && /^\/Devices\/?$/.test(path)) {
                    return this._signedResponse(res, JSON.stringify({ [OUR_FAB]: { href: `${OUR_FAB}/` } }));
                }
                if (req.method === 'GET' && /^\/Devices\/\d+\/Ident\/?$/.test(path)) {
                    return this._signedResponse(res, JSON.stringify({ DeviceType: 2, DeviceName: 'ioBroker', ProtocolVersion: 4 }));
                }
                if (req.method === 'GET' && /^\/Devices\/\d+\/(State|SuperVision)/.test(path)) {
                    return this._signedResponse(res, JSON.stringify({}));
                }
                // Catch-all → 204, damit Peers nicht endlos retryen
                res.writeHead(204, { Connection: 'close' });
                res.end();
            } catch (e) {
                this.log.debug(`Push-Handler-Fehler (${path}): ${e.message}`);
                try {
                    res.writeHead(204);
                    res.end();
                } catch {
                    /* egal */
                }
            }
        });
    }

    _handlePush(req, res, peerFab, body) {
        const { gid, sig } = this._parseAuth(req.headers);
        let state = null;
        if (gid && sig && body.length && gid.toUpperCase() === this.mc.groupId) {
            try {
                const plain = this.mc.decryptWithSignature(sig, body);
                const txt = plain.toString('utf8').replace(/[\x00\x20\r\n\t]+$/g, '');
                const parsed = JSON.parse(txt);
                // Struktur: { Host, Resource, Content: {…State…} }
                state = parsed.Content && typeof parsed.Content === 'object' ? parsed.Content : parsed;
            } catch (e) {
                this.log.debug(`Push-Entschlüsselung von ${req.socket.remoteAddress} fehlgeschlagen: ${e.message}`);
            }
        }
        res.writeHead(204, { Connection: 'close' });
        res.end();
        if (state && this.onEvent) {
            this.onEvent({ route: peerFab, state }).catch(e => this.log.debug(`Push-Callback-Fehler: ${e.message}`));
        }
    }

    _advertiseMdns() {
        this.mdns = multicastDns();
        const props = {
            txtvers: '1',
            group: this.mc.groupId,
            path: '/',
            security: '1',
            pairing: 'false',
            devicetype: '2',
            con: '1',
            subtype: '0',
            s: '0',
        };
        const txtBuffers = Object.entries(props).map(([k, v]) => Buffer.from(`${k}=${v}`));

        const respond = () => {
            this.mdns.respond({
                answers: [
                    { name: SERVICE, type: 'PTR', ttl: 120, data: this.instance },
                    { name: this.instance, type: 'SRV', ttl: 120, data: { port: this.port, target: this.hostname } },
                    { name: this.instance, type: 'TXT', ttl: 120, data: txtBuffers },
                    { name: this.hostname, type: 'A', ttl: 120, data: this.hostIp },
                ],
            });
        };

        this.mdns.on('query', query => {
            for (const q of query.questions || []) {
                if ((q.name === SERVICE && q.type === 'PTR') || q.name === this.instance || q.name === this.hostname) {
                    respond();
                    return;
                }
            }
        });
        // initial ankündigen
        respond();
        // Timer über den Adapter (ioBroker-Vorgabe), Fallback auf global für Standalone-Betrieb
        (this.adapter ? this.adapter.setTimeout.bind(this.adapter) : global.setTimeout)(respond, 1000);
    }
}

module.exports = { MielePushListener, syntheticHostname, OUR_FAB };
