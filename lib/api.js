'use strict';

const http = require('http');
const { MieleCrypto } = require('./crypto');

/**
 * Lokaler Miele-Geräte-Client: signierte GET-Reads (entschlüsselt JSON) und
 * signierte PUT-Writes (verschlüsselter Body) über HTTP Port 80.
 */
class MieleDeviceApi {
    /**
     * @param {string} host    Geräte-IP
     * @param {MieleCrypto} mc  Krypto-Provider (GroupID/GroupKey)
     * @param {object} [opts]   { timeout }
     */
    constructor(host, mc, opts = {}) {
        this.host = host;
        this.mc = mc;
        this.timeout = opts.timeout || 8000;
    }

    _request(method, resource, bodyPlain) {
        return new Promise((resolve, reject) => {
            const bodyMethod = method === 'PUT' || method === 'POST';
            let body = Buffer.alloc(0);
            let signature;
            if (bodyMethod && bodyPlain != null) {
                body = MieleCrypto.padBody(bodyPlain);
            }
            const { headers, signature: sig } = this.mc.headers(method, this.host, resource, body);
            signature = sig;

            let sendBuf = null;
            if (bodyMethod && body.length > 0) {
                sendBuf = this.mc.encryptBody(body, signature);
                headers['Content-Length'] = sendBuf.length;
            }

            const req = http.request(
                { host: this.host, port: 80, method, path: `/${resource}`, headers, timeout: this.timeout },
                res => {
                    const chunks = [];
                    res.on('data', c => chunks.push(c));
                    res.on('end', () => {
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            body: Buffer.concat(chunks),
                        });
                    });
                },
            );
            req.on('error', reject);
            req.on('timeout', () => req.destroy(new Error(`Timeout ${this.host}/${resource}`)));
            if (sendBuf) req.write(sendBuf);
            req.end();
        });
    }

    /** Signierter GET, entschlüsselt & als JSON geparst. */
    async get(resource) {
        const res = await this._request('GET', resource);
        if (res.status === 204) return null;
        if (res.status !== 200) {
            const err = new Error(`GET /${resource} → HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }
        const xsig = res.headers['x-signature'];
        if (!xsig) throw new Error(`GET /${resource}: kein X-Signature-Header`);
        const plain = this.mc.decryptResponse(xsig, res.body);
        const txt = plain.toString('utf8').replace(/[\x00\x20]+$/g, '');
        try {
            return JSON.parse(txt);
        } catch (e) {
            const err = new Error(`GET /${resource}: JSON-Fehler (${e.message})`);
            err.raw = txt;
            throw err;
        }
    }

    /** Signierter PUT mit verschlüsseltem Body. Gibt Statuscode zurück. */
    async put(resource, bodyPlain) {
        const res = await this._request('PUT', resource, bodyPlain);
        return res.status;
    }

    /** Signierter POST mit verschlüsseltem Body. Gibt {status, location} zurück. */
    async post(resource, bodyPlain) {
        const res = await this._request('POST', resource, bodyPlain);
        return { status: res.status, location: res.headers['location'] || '' };
    }

    // --- Convenience ---
    getIdent(route) {
        return this.get(`Devices/${route}/Ident`);
    }
    getState(route) {
        return this.get(`Devices/${route}/State`);
    }
    readDop2(route, unit, attr, idx1 = 0, idx2 = 0) {
        return this._request('GET', `Devices/${route}/DOP2/${unit}/${attr}?idx1=${idx1}&idx2=${idx2}`);
    }
}

module.exports = { MieleDeviceApi };
