'use strict';

/**
 * Minimaler DOP2-Binärparser (portiert aus akappner/MieleRESTServer MieleDop2.py).
 * Dekodiert einen Leaf in eine Map { feldindex(1-based) -> { type, value } }.
 * Struct-Werte sind Arrays von Sub-Attributen; Integer sind Big-Endian.
 */

// Feste Byte-Längen je Feldtyp
const FIXED = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 2, 8: 4, 9: 4, 10: 4, 11: 8, 12: 8, 13: 8, 14: 4, 15: 8 };
const SIGNED = new Set([3, 6, 9, 12]);
// Array-Elementtypen: type -> elementByteLength
const ARRAY_ELEM = { 17: 1, 20: 1, 21: 2, 22: 2, 23: 2, 25: 4, 27: 8 };

function readInt(buf, off, len, signed) {
    let v = 0n;
    for (let i = 0; i < len; i++) v = (v << 8n) | BigInt(buf[off + i]);
    if (signed) {
        const bits = BigInt(len * 8);
        if (v >= 1n << (bits - 1n)) v -= 1n << bits;
    }
    return len > 4 ? v : Number(v); // 8-Byte als BigInt, sonst Number
}

/** Dekodiert EIN Feld ab off. Gibt { value, wireLength } zurück. */
function decodeField(type, buf, off) {
    if (FIXED[type] != null) {
        const len = FIXED[type];
        if (type === 1) return { value: buf[off] === 1, wireLength: 1 };
        if (type === 14) return { value: buf.readFloatBE(off), wireLength: 4 };
        if (type === 15) return { value: buf.readDoubleBE(off), wireLength: 8 };
        return { value: readInt(buf, off, len, SIGNED.has(type)), wireLength: len };
    }
    if (type === 16) return decodeStruct(buf, off);
    if (type === 18 || type === 32) {
        const strLen = (buf[off] << 8) + buf[off + 1];
        return { value: buf.subarray(off + 2, off + 2 + strLen), wireLength: 2 + strLen };
    }
    if (ARRAY_ELEM[type] != null) {
        const n = (buf[off] << 8) + buf[off + 1];
        const el = ARRAY_ELEM[type];
        const vals = [];
        for (let i = 0; i < n; i++) {
            const p = off + 2 + i * el;
            vals.push(type === 17 ? buf[p] === 1 : readInt(buf, p, el, SIGNED.has(type - 10)));
        }
        return { value: vals, wireLength: 2 + n * el };
    }
    throw new Error(`Unbekannter DOP2-Feldtyp ${type} @${off}`);
}

/** Struct: Header [byte0, numberOfFields, byte2], dann Felder [id, type, value] mit 0x00-Padding. */
function decodeStruct(buf, off) {
    const numberOfFields = buf[off + 1];
    if (numberOfFields === 0 || numberOfFields > 160) throw new Error(`Struct unplausibel (${numberOfFields})`);
    let p = off + 3;
    let fieldLength = 0;
    const fields = [];
    while (true) {
        const dataType = buf[p + 1];
        const f = decodeField(dataType, buf, p + 2);
        const cur = f.wireLength + 2;
        fieldLength += cur;
        fields.push({ type: dataType, value: f.value });
        if (fields.length === numberOfFields) break;
        p += cur;
        if (buf[p] === 0x00) { p += 1; fieldLength += 1; }
    }
    return { value: fields, wireLength: fieldLength + 3 };
}

/**
 * Parst einen ganzen DOP2-Leaf (entschlüsselte Bytes) → { unit, attr, fields{idx:{type,value}} }.
 */
function parseLeaf(buf) {
    const payloadLength = (buf[0] << 8) + buf[1];
    const unit = (buf[2] << 8) + buf[3];
    const attr = (buf[4] << 8) + buf[5];
    const padding = buf.length - payloadLength - 2;
    const payload = buf.subarray(8, buf.length - (padding > 0 ? padding : 0));
    const fields = {};
    if (payload.length === 0) return { unit, attr, fields };
    const numberOfFields = payload[3] + (payload[4] << 8);
    let rem = payload.subarray(5);
    let count = 0;
    while (count < numberOfFields && rem.length >= 2) {
        const idx = rem[0];
        const type = rem[1];
        const f = decodeField(type, rem, 2);
        fields[idx] = { type, value: f.value };
        count++;
        rem = rem.subarray(3 + f.wireLength);
    }
    return { unit, attr, fields };
}

/** Wert eines "interpretierten" Feldes (Struct [mask, value, interpretation]) → mittleres Sub-Feld. */
function interpValue(fields, idx) {
    const f = fields[idx];
    if (!f || !Array.isArray(f.value) || f.value.length < 2) return null;
    return f.value[1].value;
}

module.exports = { parseLeaf, interpValue, decodeField };
