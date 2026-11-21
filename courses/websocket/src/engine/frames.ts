import { fromUtf8, toHex, utf8, type Bytes } from "./bytes";

/**
 * WebSocket frames as RFC 6455 lays them out on the wire:
 *
 *   byte 0: FIN, RSV1-3, opcode        byte 1: MASK, payload length (7 bits)
 *   then 2 or 8 bytes of extended length (126 / 127), a 4-byte masking key from clients,
 *   then the payload, XORed with the key when masked.
 */

export const OP = { cont: 0x0, text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa } as const;
export type Opcode = (typeof OP)[keyof typeof OP];

export const OPCODE_NAME: Record<number, string> = {
  0: "Continuation",
  1: "Text",
  2: "Binary",
  8: "Connection Close",
  9: "Ping",
  10: "Pong",
};

/** Bytes before the payload: 2, plus 2 or 8 for a long payload, plus 4 for a client's mask. */
export function headerSize(payload: number, masked: boolean): number {
  return 2 + (payload < 126 ? 0 : payload < 65536 ? 2 : 8) + (masked ? 4 : 0);
}

export const wireSize = (payload: number, masked: boolean) => headerSize(payload, masked) + payload;

export function applyMask(payload: Bytes, mask: Bytes): Bytes {
  const out = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) out[i] = payload[i]! ^ mask[i % 4]!;
  return out;
}

export interface FrameSpec {
  fin: boolean;
  opcode: number;
  payload: Bytes;
  mask?: Bytes;
}

export function encodeFrame(f: FrameSpec): Bytes {
  const len = f.payload.length;
  const head = headerSize(len, Boolean(f.mask));
  const out = new Uint8Array(head + len);
  out[0] = (f.fin ? 0x80 : 0) | (f.opcode & 0x0f);
  const maskBit = f.mask ? 0x80 : 0;
  let at = 2;
  if (len < 126) out[1] = maskBit | len;
  else if (len < 65536) {
    out[1] = maskBit | 126;
    out[2] = len >> 8;
    out[3] = len & 0xff;
    at = 4;
  } else {
    out[1] = maskBit | 127;
    const view = new DataView(out.buffer);
    view.setUint32(2, Math.floor(len / 2 ** 32));
    view.setUint32(6, len >>> 0);
    at = 10;
  }
  if (f.mask) {
    out.set(f.mask, at);
    at += 4;
    out.set(applyMask(f.payload, f.mask), at);
  } else out.set(f.payload, at);
  return out;
}

export interface Decoded {
  fin: boolean;
  rsv: number;
  opcode: number;
  masked: boolean;
  length: number;
  mask: Bytes | null;
  payload: Bytes;
  /** Bytes the frame took. */
  size: number;
}

/** Reads one frame from the front of `bytes`; null when it is not complete. */
export function decodeFrame(bytes: Bytes): Decoded | null {
  if (bytes.length < 2) return null;
  const fin = (bytes[0]! & 0x80) !== 0;
  const rsv = (bytes[0]! >> 4) & 0x7;
  const opcode = bytes[0]! & 0x0f;
  const masked = (bytes[1]! & 0x80) !== 0;
  let length = bytes[1]! & 0x7f;
  let at = 2;
  if (length === 126) {
    if (bytes.length < 4) return null;
    length = (bytes[2]! << 8) | bytes[3]!;
    at = 4;
  } else if (length === 127) {
    if (bytes.length < 10) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    length = view.getUint32(2) * 2 ** 32 + view.getUint32(6);
    at = 10;
  }
  const mask = masked ? bytes.slice(at, at + 4) : null;
  if (masked) at += 4;
  if (bytes.length < at + length) return null;
  const raw = bytes.slice(at, at + length);
  return { fin, rsv, opcode, masked, length, mask, payload: mask ? applyMask(raw, mask) : raw, size: at + length };
}

/** A close frame's payload: the status code in two bytes, then the reason in UTF-8. */
export function closePayload(code: number | null, reason = ""): Bytes {
  if (code === null) return new Uint8Array();
  const r = utf8(reason);
  const out = new Uint8Array(2 + r.length);
  out[0] = code >> 8;
  out[1] = code & 0xff;
  out.set(r, 2);
  return out;
}

export function readClose(payload: Bytes): { code: number | null; reason: string } {
  if (payload.length < 2) return { code: null, reason: "" };
  return { code: (payload[0]! << 8) | payload[1]!, reason: fromUtf8(payload.slice(2)) };
}

export const hexBytes = (b: Bytes) => toHex(b).replace(/(..)(?!$)/g, "$1 ");
