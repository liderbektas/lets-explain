import { motion } from "motion/react";
import { utf8 } from "../engine/bytes";
import { applyMask, OP, OPCODE_NAME } from "../engine/frames";
import type { WsFrame } from "../engine/net";

/**
 * One frame laid out byte by byte, as it goes on the wire: the two header bytes with their bits,
 * any extended length, the masking key, and the payload (masked, then as the receiver reads it).
 */

export interface FrameViewLabels {
  title: string;
  header: string;
  fin: string;
  opcode: string;
  mask: string;
  length: string;
  ext: string;
  key: string;
  payload: string;
  unmasked: string;
  total: (n: number) => string;
  more: (n: number) => string;
}

const COLORS = {
  head: "var(--lilac-soft)",
  len: "var(--sun-soft)",
  ext: "var(--sun-soft)",
  key: "var(--coral-soft)",
  data: "var(--mint-soft)",
};

/** The fields of the first two bytes, bit by bit, as RFC 6455 draws them. */
const FIELDS = [
  { id: "fin", name: "FIN", from: 0, bits: 1, fill: "var(--lilac-soft)" },
  { id: "rsv", name: "RSV", from: 1, bits: 3, fill: "var(--paper-2)" },
  { id: "opcode", name: "opcode", from: 4, bits: 4, fill: "var(--sky-soft)" },
  { id: "mask", name: "MASK", from: 8, bits: 1, fill: "var(--coral-soft)" },
  { id: "len", name: "len", from: 9, bits: 7, fill: "var(--sun-soft)" },
] as const;

/** The payload's bytes, worked back from what the model keeps. */
export function payloadBytes(f: WsFrame): Uint8Array {
  if (f.opcode === OP.binary || /^[0-9a-f]+$/.test(f.text) && f.opcode !== OP.text && f.opcode !== OP.cont) {
    return Uint8Array.from(f.text.replace(/…$/, "").match(/../g) ?? [], (h) => parseInt(h, 16));
  }
  if (f.opcode === OP.close) {
    const [code, ...reason] = f.text.split(" ");
    if (!code) return new Uint8Array();
    const r = utf8(reason.join(" "));
    return new Uint8Array([Number(code) >> 8, Number(code) & 0xff, ...r]);
  }
  return utf8(f.text.replace(/…$/, ""));
}

const hex = (b: number) => b.toString(16).padStart(2, "0");

export function FrameView({ frame, beat, labels }: { frame: WsFrame; beat: number; labels: FrameViewLabels }) {
  const payload = payloadBytes(frame);
  const lenField = frame.size < 126 ? frame.size : frame.size < 65536 ? 126 : 127;
  const b0 = (frame.fin ? 0x80 : 0) | frame.opcode;
  const b1 = (frame.masked ? 0x80 : 0) | lenField;
  const ext: number[] = lenField === 126 ? [frame.size >> 8, frame.size & 0xff] : lenField === 127 ? [0, 0, 0, 0, (frame.size >>> 24) & 0xff, (frame.size >>> 16) & 0xff, (frame.size >>> 8) & 0xff, frame.size & 0xff] : [];
  const key = frame.mask ? Uint8Array.from(frame.mask.match(/../g) ?? [], (h) => parseInt(h, 16)) : null;
  const shownPayload = payload.subarray(0, 12);
  const masked = key ? applyMask(shownPayload, key) : shownPayload;
  const cells: { byte: number; kind: keyof typeof COLORS; bits?: string }[] = [
    { byte: b0, kind: "head", bits: b0.toString(2).padStart(8, "0") },
    { byte: b1, kind: "len", bits: b1.toString(2).padStart(8, "0") },
    ...ext.map((b) => ({ byte: b, kind: "ext" as const })),
    ...(key ? [...key].map((b) => ({ byte: b, kind: "key" as const })) : []),
    ...[...masked].map((b) => ({ byte: b, kind: "data" as const })),
  ];
  const W = 52;
  const GAP = 6;
  const perRow = 14;
  const rowW = Math.min(cells.length, perRow) * W - GAP;
  const x0 = 430 - rowW / 2;
  const rows = Math.ceil(cells.length / perRow);
  const cellX = (i: number) => x0 + (i % perRow) * W;
  const cellY = (i: number) => 76 + Math.floor(i / perRow) * 100;

  // Runs of one kind on one row get a bracket under them; the two header bytes form one run.
  const runs: { from: number; to: number; label: string }[] = [];
  const nameOf = (k: keyof typeof COLORS) => (k === "head" || k === "len" ? labels.header : k === "ext" ? labels.ext : k === "key" ? labels.key : labels.payload);
  cells.forEach((c, i) => {
    const last = runs[runs.length - 1];
    if (last && last.label === nameOf(c.kind) && Math.floor(last.to / perRow) === Math.floor(i / perRow)) last.to = i;
    else runs.push({ from: i, to: i, label: nameOf(c.kind) });
  });

  const BIT = 36;
  const bx0 = 430 - (16 * BIT) / 2;
  const by = 84 + rows * 100 + (rows === 1 ? 64 : 34);
  const fanY = cellY(0) + 88;
  const bits = (b0.toString(2).padStart(8, "0") + b1.toString(2).padStart(8, "0")).split("");
  const value = (f: (typeof FIELDS)[number]) => parseInt(bits.slice(f.from, f.from + f.bits).join(""), 2);
  const legend = [
    { fill: FIELDS[0].fill, text: `FIN = ${frame.fin ? 1 : 0} · ${labels.fin}` },
    { fill: FIELDS[2].fill, text: `opcode = ${frame.opcode} (${OPCODE_NAME[frame.opcode]}) · ${labels.opcode}` },
    { fill: FIELDS[3].fill, text: `MASK = ${frame.masked ? 1 : 0} · ${labels.mask}` },
    { fill: FIELDS[4].fill, text: `len = ${lenField}${ext.length ? ` → ${labels.ext}: ${frame.size}` : ""} · ${labels.length}` },
    ...(key ? [{ fill: COLORS.key, text: `${labels.key}: ${frame.mask}` }] : []),
    {
      fill: COLORS.data,
      text: `${labels.payload}: ${frame.size} B${frame.opcode === OP.text || frame.opcode === OP.cont ? ` · ${labels.unmasked}: "${frame.text.slice(0, 40)}"` : ""}`,
    },
  ];
  const half = Math.ceil(legend.length / 2);

  return (
    <g className="frame-view">
      <text x={430} y={44} textAnchor="middle" className="fv-title">
        {labels.title} · {OPCODE_NAME[frame.opcode]} · {labels.total(frame.wire)}
      </text>

      {cells.map((c, i) => (
        <motion.g key={`${beat}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i, duration: 0.25 }}>
          <rect x={cellX(i)} y={cellY(i)} width={W - GAP} height={46} rx={8} className="fv-byte" style={{ fill: COLORS[c.kind] }} />
          <text x={cellX(i) + (W - GAP) / 2} y={cellY(i) + 30} textAnchor="middle" className="fv-hex">
            {hex(c.byte)}
          </text>
        </motion.g>
      ))}

      {runs.map((r) => {
        const xa = cellX(r.from) + 2;
        const xb = cellX(r.to) + W - GAP - 2;
        const y = cellY(r.from) + 56;
        return (
          <g key={`${r.from}-${r.label}`}>
            <path d={`M${xa} ${y} v6 H${xb} v-6`} className="fv-bracket" />
            <text x={(xa + xb) / 2} y={y + 22} textAnchor="middle" className="fv-note">
              {r.label}
            </text>
          </g>
        );
      })}

      {payload.length > shownPayload.length && (
        <text x={x0 + rowW + 10} y={cellY(cells.length - 1) + 29} className="fv-note">
          {labels.more(payload.length - shownPayload.length)}
        </text>
      )}

      {/* The two header bytes, opened up into their bits. */}
      {rows === 1 && (
        <path
          d={`M${cellX(0)} ${fanY} L${bx0} ${by - 22} M${cellX(1)} ${fanY} L${bx0 + 8 * BIT} ${by - 22} M${cellX(1) + W - GAP} ${fanY} L${bx0 + 16 * BIT} ${by - 22}`}
          className="fv-fan"
        />
      )}
      {FIELDS.map((f) => (
        <g key={f.id}>
          <rect x={bx0 + f.from * BIT} y={by} width={f.bits * BIT} height={34} className="fv-field" style={{ fill: f.fill }} />
          <text x={bx0 + (f.from + f.bits / 2) * BIT} y={by - 6} textAnchor="middle" className="fv-fname">
            {f.bits > 1 ? `${f.name} = ${value(f)}` : f.name}
          </text>
        </g>
      ))}
      {bits.map((b, i) => (
        <text key={i} x={bx0 + i * BIT + BIT / 2} y={by + 23} textAnchor="middle" className="fv-bit">
          {b}
        </text>
      ))}

      {legend.map((row, i) => {
        const col = i < half ? 0 : 1;
        const x = col === 0 ? 60 : 450;
        const y = by + 66 + (i % half) * 24;
        return (
          <g key={i}>
            <rect x={x} y={y - 12} width={14} height={14} rx={3} className="fv-byte" style={{ fill: row.fill }} />
            <text x={x + 22} y={y} className="fv-label">
              {row.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
