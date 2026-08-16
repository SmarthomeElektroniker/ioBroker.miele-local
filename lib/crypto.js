'use strict';

/**
 * MieleH256 – lokale Signierung & Verschlüsselung für Miele@Home-Geräte (DOP2).
 *
 * Verfahren (reverse-engineered, verifiziert gegen WCR860 / G5840 / H2469BP):
 *   GroupKey = 64 Byte.  AES-Key = erste 32 Byte,  HMAC-Key = alle 64 Byte.
 *   Signatur = HMAC-SHA256(GroupKey) über
 *     "METHOD\nHOST/resource\nContent-Type\nAccept\nDate\n" + Body
 *   Header:  Authorization: MieleH256 <GroupID>:<SIG_HEX_UPPER>
 *   Antwort: AES-256-CBC, Key = erste 32 Byte, IV = erste 16 Byte der
 *            Signatur aus dem X-Signature-Antwortheader.
 *   PUT-Body: auf 16 Byte gepaddet, AES-256-CBC, IV = erste 16 Byte der
 *            Request-Signatur.
 */

const crypto = require('crypto');

const ACCEPT = 'application/vnd.miele.v1+json';
const CONTENT_TYPE = 'application/vnd.miele.v1+json; charset=utf-8';
// Das Gerät wertet das Datum nicht aus – fester Wert wie in der App.
const DATE = 'Thu, 01 Jan 1970 02:09:22 GMT';

class MieleCrypto {
    /**
     * @param {string} groupId  Hex-String (16 Zeichen / 8 Byte)
     * @param {string} groupKey Hex-String (128 Zeichen / 64 Byte)
     */
    constructor(groupId, groupKey) {
        this.groupId = String(groupId).toUpperCase();
        this.groupKey = Buffer.from(groupKey, 'hex');
        if (this.groupKey.length !== 64) {
            throw new Error(`GroupKey muss 64 Byte sein, ist ${this.groupKey.length}`);
        }
        this.aesKey = this.groupKey.subarray(0, 32);
    }

    /**
     * HMAC-SHA256-Signatur über den kanonischen String + Body.
     * @param {string} method  GET/PUT
     * @param {string} host     z.B. "192.168.10.127"
     * @param {string} resource Pfad ohne führenden Slash, z.B. "Devices/000149933556/State"
     * @param {Buffer} [body]   Klartext-Body (bei PUT), sonst leer
     * @returns {string} Signatur als Großbuchstaben-Hex
     */
    sign(method, host, resource, body = Buffer.alloc(0)) {
        const header = [method, `${host}/${resource}`, CONTENT_TYPE, ACCEPT, DATE].join('\n') + '\n';
        const payload = Buffer.concat([Buffer.from(header, 'utf8'), body]);
        return crypto.createHmac('sha256', this.groupKey).update(payload).digest('hex').toUpperCase();
    }

    /** Header-Objekt inkl. Authorization für einen Request. */
    headers(method, host, resource, body) {
        const signature = this.sign(method, host, resource, body);
        return {
            headers: {
                'Content-Type': CONTENT_TYPE,
                Host: host,
                'User-Agent': 'Miele@mobile 2.3.3 iOS',
                Authorization: `MieleH256 ${this.groupId}:${signature}`,
                Date: DATE,
                Accept: ACCEPT,
            },
            signature,
        };
    }

    /** IV = erste 16 Byte einer Hex-Signatur. */
    static ivFromSignature(sigHex) {
        return Buffer.from(sigHex, 'hex').subarray(0, 16);
    }

    /** IV aus dem X-Signature-Antwortheader ("MieleH256 gid:sig"). */
    static ivFromAuthHeader(authHeader) {
        const sig = authHeader.slice('MieleH256 '.length).split(':')[1];
        return MieleCrypto.ivFromSignature(sig);
    }

    /** Antwortkörper entschlüsseln. */
    decryptResponse(xSignatureHeader, cipherBuf) {
        const iv = MieleCrypto.ivFromAuthHeader(xSignatureHeader);
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.aesKey, iv);
        decipher.setAutoPadding(false);
        return Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
    }

    /** Eingehenden Push-Body entschlüsseln (IV = erste 16 Byte der Authorization-Signatur). */
    decryptWithSignature(sigHex, cipherBuf) {
        if (sigHex.length % 2) sigHex = '0' + sigHex;
        const iv = MieleCrypto.ivFromSignature(sigHex);
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.aesKey, iv);
        decipher.setAutoPadding(false);
        return Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
    }

    /**
     * Peer-Antwort signieren & verschlüsseln (für den SuperVision-Handshake).
     * canonical = "status\nContent-Type\nDate\n" + gepaddeter Body.
     * @returns {{ body: Buffer, signature: string }}
     */
    signResponse(status, date, bodyPlain) {
        const bodyBuf = MieleCrypto.padResponseBody(Buffer.isBuffer(bodyPlain) ? bodyPlain : Buffer.from(bodyPlain, 'utf8'));
        const canonical = Buffer.concat([Buffer.from(`${status}\n${CONTENT_TYPE}\n${date}\n`, 'utf8'), bodyBuf]);
        const sig = crypto.createHmac('sha256', this.groupKey).update(canonical).digest();
        const iv = sig.subarray(0, 16);
        let body = Buffer.alloc(0);
        if (bodyBuf.length) {
            const cipher = crypto.createCipheriv('aes-256-cbc', this.aesKey, iv);
            cipher.setAutoPadding(false);
            body = Buffer.concat([cipher.update(bodyBuf), cipher.final()]);
        }
        return { body, signature: `MieleH256 ${this.groupId}:${sig.toString('hex').toUpperCase()}` };
    }

    /** Response-Padding (JSON auf min. 64 Byte, sonst auf 16 ausrichten). */
    static padResponseBody(buf) {
        if (!buf.length) return buf;
        const isJson = buf[0] === 0x7b && buf[buf.length - 1] === 0x7d; // { … }
        if (isJson && buf.length < 64) {
            return Buffer.concat([buf.subarray(0, buf.length - 1), Buffer.alloc(64 - buf.length, 0x20), Buffer.from('}')]);
        }
        const rem = buf.length % 16;
        if (rem === 0 && buf.length >= 64) return buf;
        const needed = Math.max(64 - buf.length, 0) || (16 - rem);
        return Buffer.concat([buf, Buffer.alloc(needed, 0x20)]);
    }

    /**
     * Klartext-Body für PUT/POST padden.
     * JSON-Bodys ({ … }) werden auf mind. 64 Byte und 16-Byte-Ausrichtung gebracht,
     * indem Leerzeichen VOR dem schließenden '}' eingefügt werden (bleibt gültiges JSON).
     * Andere Bodys werden nur auf die nächste 16-Byte-Grenze aufgefüllt.
     */
    static padBody(plain) {
        let buf = Buffer.isBuffer(plain) ? plain : Buffer.from(plain, 'utf8');
        if (buf.length === 0) return buf;
        const isJson = buf[0] === 0x7b && buf[buf.length - 1] === 0x7d; // { … }
        if (isJson) {
            let target = Math.max(64, buf.length);
            if (target % 16) target += 16 - (target % 16);
            const spaces = target - buf.length;
            if (spaces > 0) {
                return Buffer.concat([buf.subarray(0, buf.length - 1), Buffer.alloc(spaces, 0x20), Buffer.from('}')]);
            }
            return buf;
        }
        const rem = buf.length % 16;
        if (rem === 0) return buf;
        return Buffer.concat([buf, Buffer.alloc(16 - rem, 0x20)]);
    }

    /** PUT-Body verschlüsseln mit IV = erste 16 Byte der Request-Signatur. */
    encryptBody(paddedBody, signature) {
        const iv = MieleCrypto.ivFromSignature(signature);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.aesKey, iv);
        cipher.setAutoPadding(false);
        return Buffer.concat([cipher.update(paddedBody), cipher.final()]);
    }
}

module.exports = { MieleCrypto, ACCEPT, CONTENT_TYPE, DATE };
