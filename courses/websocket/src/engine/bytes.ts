/**
 * Byte helpers the WebSocket handshake needs, written out so they run the same in the browser and
 * in tests: UTF-8, SHA-1 (FIPS 180-4), base64 and hex, and a seeded random source for keys.
 */

export type Bytes = Uint8Array;

export const utf8 = (text: string): Bytes => new TextEncoder().encode(text);
export const fromUtf8 = (bytes: Bytes): string => new TextDecoder().decode(bytes);

export function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** SHA-1 of some bytes: 20 bytes out. */
export function sha1(data: Bytes): Bytes {
  const ml = data.length * 8;
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(ml / 2 ** 32));
  view.setUint32(padded.length - 4, ml >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h));
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Bytes): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : B64[c & 63];
  }
  return out;
}

/** Decodes base64, ignoring whitespace; null when the text is not base64. */
export function fromBase64(text: string): Bytes | null {
  const clean = text.replace(/\s+/g, "");
  if (clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null;
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (clean[i + k] === "=" ? -1 : B64.indexOf(clean[i + k]!)));
    out.push((n[0]! << 2) | (n[1]! >> 4));
    if (n[2]! >= 0) out.push(((n[1]! & 15) << 4) | (n[2]! >> 2));
    if (n[3]! >= 0) out.push(((n[2]! & 3) << 6) | n[3]!);
  }
  return new Uint8Array(out);
}

export const toHex = (bytes: Bytes): string => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The GUID RFC 6455 fixes for every WebSocket handshake. */
export const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/** Sec-WebSocket-Accept for a key: base64(SHA-1(key + GUID)). */
export const acceptFor = (key: string): string => toBase64(sha1(utf8(key + WS_GUID)));

/** What the ws library accepts as a key: 16 bytes in base64. */
export const validKey = (key: string | undefined): boolean => key !== undefined && /^[+/0-9A-Za-z]{22}==$/.test(key);

/**
 * Deterministic "random" bytes: the sandbox must replay the same way every time, so `openssl rand`
 * and browser keys come from this instead of the real random source.
 */
export function seededBytes(seed: number, count: number): Bytes {
  let x = (seed * 2654435761 + 0x9e3779b9) >>> 0;
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}
