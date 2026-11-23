import { motion } from "motion/react";
import { Pill } from "@lets-explain/core/iso/shapes";
import { utf8 } from "../engine/bytes";
import { applyMask, OP, OPCODE_NAME } from "../engine/frames";
import type { WsFrame } from "../engine/net";
import { at, Bubble, type Cable, clip, Device, deviceGeom, isoAt, OpenCable, Rack, sample, WifiIcon } from "./kit";
import { screenText } from "./SocketStage";

/**
 * One frame, magnified. Below, the frame rides the cable between the client and the server's rack,
 * in the direction it went; a lens over it opens into a card that lays the frame out byte by byte
 * as it is on the wire: the two header bytes with their bits, any extended length, the masking key,
 * and the payload. With `xor`, the card works the mask out instead: each data byte XOR the key byte
 * under it gives the byte on the wire.
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
  /** The XOR rows: the data as sent, the key repeated under it, what goes on the wire. */
  xorData: string;
  xorKey: string;
  xorWire: string;
  client: string;
  server: string;
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
  if (f.opcode === OP.binary || (/^[0-9a-f]+$/.test(f.text) && f.opcode !== OP.text && f.opcode !== OP.cont)) {
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
const SHORT: Record<number, string> = { [OP.cont]: "cont", [OP.text]: "text", [OP.binary]: "binary", [OP.close]: "close", [OP.ping]: "ping", [OP.pong]: "pong" };
const KEY_TINT = ["var(--coral-soft)", "var(--sun-soft)", "var(--sky-soft)", "var(--lilac-soft)"];

/* The little scene under the card: where the frame is. */
const SCENE = {
  device: deviceGeom("monitor", 90, 482, 112, 72),
  rack: { p: isoAt(744, 452), w: 64, d: 50, h: 104 },
};
const rackJack = (() => {
  const { p, d } = SCENE.rack;
  const [x, y] = p(14, d, 62);
  return [x - 6, y] as const;
})();
const CABLE: Cable = { a: SCENE.device.jack, b: rackJack, sag: 18 };
const LENS = at(CABLE, 0.5);

export function FrameView({ frame, beat, labels, xor = false }: { frame: WsFrame; beat: number; labels: FrameViewLabels; xor?: boolean }) {
  const payload = payloadBytes(frame);
  const lenField = frame.size < 126 ? frame.size : frame.size < 65536 ? 126 : 127;
  const b0 = (frame.fin ? 0x80 : 0) | frame.opcode;
  const b1 = (frame.masked ? 0x80 : 0) | lenField;
  const ext: number[] =
    lenField === 126 ? [frame.size >> 8, frame.size & 0xff] : lenField === 127 ? [0, 0, 0, 0, (frame.size >>> 24) & 0xff, (frame.size >>> 16) & 0xff, (frame.size >>> 8) & 0xff, frame.size & 0xff] : [];
  const key = frame.mask ? Uint8Array.from(frame.mask.match(/../g) ?? [], (h) => parseInt(h, 16)) : null;
  const perRow = 15;
  const room = perRow - 2 - ext.length - (key ? 4 : 0);
  // a payload that doesn't fit leaves room at the end of the row for "… and N more bytes"
  const fits = payload.length <= room;
  const shownPayload = payload.subarray(0, fits ? payload.length : Math.max(3, room - 2));
  const masked = key ? applyMask(shownPayload, key) : shownPayload;
  const cells: { byte: number; kind: keyof typeof COLORS }[] = [
    { byte: b0, kind: "head" },
    { byte: b1, kind: "len" },
    ...ext.map((b) => ({ byte: b, kind: "ext" as const })),
    ...(key ? [...key].map((b) => ({ byte: b, kind: "key" as const })) : []),
    ...[...masked].map((b) => ({ byte: b, kind: "data" as const })),
  ];
  const W = 48;
  const GAP = 6;
  const rowW = Math.min(cells.length, perRow) * W - GAP;
  const x0 = 430 - rowW / 2 - (payload.length > shownPayload.length ? 56 : 0);
  const rows = Math.ceil(cells.length / perRow);
  const cellX = (i: number) => x0 + (i % perRow) * W;
  const cellY = (i: number) => 58 + Math.floor(i / perRow) * 84;

  // Runs of one kind on one row get a bracket under them; the two header bytes form one run.
  const runs: { from: number; to: number; label: string }[] = [];
  const nameOf = (k: keyof typeof COLORS) => (k === "head" || k === "len" ? labels.header : k === "ext" ? labels.ext : k === "key" ? labels.key : labels.payload);
  cells.forEach((c, i) => {
    const last = runs[runs.length - 1];
    if (last && last.label === nameOf(c.kind) && Math.floor(last.to / perRow) === Math.floor(i / perRow)) last.to = i;
    else runs.push({ from: i, to: i, label: nameOf(c.kind) });
  });

  const BIT = 34;
  const bx0 = 430 - (16 * BIT) / 2;
  const by = cellY(cells.length - 1) + 118;
  const fanY = cellY(0) + 80;
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
      text: `${labels.payload}: ${frame.size} B${frame.opcode === OP.text || frame.opcode === OP.cont ? ` · ${labels.unmasked}: "${clip(frame.text, 22)}"` : ""}`,
    },
  ];
  const half = Math.ceil(legend.length / 2);
  const toServer = frame.dir === "out";
  const ride = toServer ? sample(CABLE, 0.08, 0.5, 10) : sample(CABLE, 0.92, 0.5, 10);
  const said = frame.opcode === OP.text ? screenText(frame.text) : null;
  const bottom = xor && key ? by - 30 + 16 + 2 * 46 + 42 : by + 60 + (half - 1) * 23 + 8;
  const CARD = { x: 20, y: 12, w: 820, h: Math.min(LENS[1] - 70, bottom + 14) - 12 };

  return (
    <g className="ws-stage frame-view">
      {/* the scene the frame is in */}
      <ellipse cx={SCENE.device.foot[0] - 6} cy={SCENE.device.foot[1] - 8} rx={96} ry={34} className="ps-floor" />
      <ellipse cx={SCENE.rack.p(32, 25, 0)[0]} cy={SCENE.rack.p(32, 25, 0)[1] + 6} rx={78} ry={28} className="ps-floor" />
      <Device g={SCENE.device}>
        {(sw) => (
          <g>
            <rect x={0} y={0} width={sw} height={13} className="ps-scr-bar" />
            <WifiIcon x={sw - 9} y={8} off={false} />
            {said && (
              <g>
                <rect x={toServer ? sw - 6 - Math.min(sw - 12, said.length * 6.4 + 12) : 6} y={22} width={Math.min(sw - 12, said.length * 6.4 + 12)} height={16} rx={6} className={`ps-scr-msg ${toServer ? "is-mine" : ""}`} />
                <text x={toServer ? sw - 6 - Math.min(sw - 12, said.length * 6.4 + 12) + 6 : 12} y={33.5} className="ps-scr-text">
                  {clip(said, Math.floor((sw - 24) / 6.4))}
                </text>
              </g>
            )}
          </g>
        )}
      </Device>
      <Rack p={SCENE.rack.p} w={SCENE.rack.w} d={SCENE.rack.d} h={SCENE.rack.h} units={[{ z: [74, 98], led: "on" }, { z: [12, 66], grille: true }]} />
      <OpenCable c={CABLE} kind="ws" thin />
      <Pill x={SCENE.device.foot[0] - 70} y={SCENE.device.foot[1] - 40} text={labels.client} size={10.5} animate={false} />
      <Pill x={SCENE.rack.p(32, 50, 0)[0] + 20} y={SCENE.rack.p(32, 50, 0)[1] + 4} text={labels.server} size={10.5} animate={false} />

      {/* the card the lens opens into */}
      <motion.g key={`card-${beat}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.3 }}>
        <path d={`M${LENS[0] - 22} ${LENS[1] - 14} L${CARD.x + CARD.w * 0.3} ${CARD.y + CARD.h} M${LENS[0] + 22} ${LENS[1] - 14} L${CARD.x + CARD.w * 0.7} ${CARD.y + CARD.h}`} className="fv-lens-line" />
        <rect x={CARD.x} y={CARD.y + 4} width={CARD.w} height={CARD.h} rx={16} className="pill-shadow" />
        <rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={16} className="fv-card" />
      </motion.g>
      <motion.g key={`ride-${beat}`} initial={{ x: ride[0]![0], y: ride[0]![1] }} animate={{ x: ride.map((q) => q[0]), y: ride.map((q) => q[1]) }} transition={{ duration: 0.5, ease: "easeOut" }}>
        <Bubble label={SHORT[frame.opcode] ?? "frame"} fill={frame.opcode === OP.close ? "var(--coral)" : frame.opcode === OP.binary ? "var(--sky)" : frame.opcode === OP.ping || frame.opcode === OP.pong ? "var(--sun)" : "var(--mint)"} out={toServer} small />
      </motion.g>
      <motion.circle key={`lens-${beat}`} cx={LENS[0]} cy={LENS[1] - 12} r={30} className="fv-lens" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.45, duration: 0.25 }} />

      <motion.g key={`bytes-${beat}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.3 }}>
        <text x={430} y={40} textAnchor="middle" className="fv-title">
          {labels.title} · {OPCODE_NAME[frame.opcode]} · {labels.total(frame.wire)} · {toServer ? `${labels.client} → ${labels.server}` : `${labels.server} → ${labels.client}`}
        </text>

        {cells.map((c, i) => (
          <g key={i}>
            <rect x={cellX(i)} y={cellY(i)} width={W - GAP} height={42} rx={8} className="fv-byte" style={{ fill: c.kind === "key" && xor ? KEY_TINT[(i - 2 - ext.length) % 4] : COLORS[c.kind] }} />
            <text x={cellX(i) + (W - GAP) / 2} y={cellY(i) + 27} textAnchor="middle" className="fv-hex">
              {hex(c.byte)}
            </text>
          </g>
        ))}

        {runs.map((r) => {
          const xa = cellX(r.from) + 2;
          const xb = cellX(r.to) + W - GAP - 2;
          const y = cellY(r.from) + 50;
          return (
            <g key={`${r.from}-${r.label}`}>
              <path d={`M${xa} ${y} v5 H${xb} v-5`} className="fv-bracket" />
              <text x={(xa + xb) / 2} y={y + 20} textAnchor="middle" className="fv-note">
                {r.label}
              </text>
            </g>
          );
        })}

        {payload.length > shownPayload.length && (
          <text x={cellX(cells.length - 1) + W + 4} y={cellY(cells.length - 1) + 26} className="fv-note">
            {labels.more(payload.length - shownPayload.length)}
          </text>
        )}

        {xor && key ? (
          <XorTable at={by - 30} data={shownPayload} keyBytes={key} wire={masked} text={frame.text} labels={labels} />
        ) : (
          <>
            {/* The two header bytes, opened up into their bits. */}
            {rows === 1 && (
              <path
                d={`M${cellX(0)} ${fanY} L${bx0} ${by - 20} M${cellX(1)} ${fanY} L${bx0 + 8 * BIT} ${by - 20} M${cellX(1) + W - GAP} ${fanY} L${bx0 + 16 * BIT} ${by - 20}`}
                className="fv-fan"
              />
            )}
            {FIELDS.map((f) => (
              <g key={f.id}>
                <rect x={bx0 + f.from * BIT} y={by} width={f.bits * BIT} height={32} className="fv-field" style={{ fill: f.fill }} />
                <text x={bx0 + (f.from + f.bits / 2) * BIT} y={by - 6} textAnchor="middle" className="fv-fname">
                  {f.bits > 1 ? `${f.name} = ${value(f)}` : f.name}
                </text>
              </g>
            ))}
            {bits.map((b, i) => (
              <text key={i} x={bx0 + i * BIT + BIT / 2} y={by + 22} textAnchor="middle" className="fv-bit">
                {b}
              </text>
            ))}
            {legend.map((row, i) => {
              const col = i < half ? 0 : 1;
              const x = col === 0 ? 52 : 446;
              const y = by + 60 + (i % half) * 23;
              return (
                <g key={i}>
                  <rect x={x} y={y - 12} width={14} height={14} rx={3} className="fv-byte" style={{ fill: row.fill }} />
                  <text x={x + 22} y={y} className="fv-label">
                    {row.text}
                  </text>
                </g>
              );
            })}
          </>
        )}
      </motion.g>
    </g>
  );
}

/** The mask worked out: data byte XOR key byte = wire byte, column by column. */
function XorTable({ at: y0, data, keyBytes, wire, text, labels }: { at: number; data: Uint8Array; keyBytes: Uint8Array; wire: Uint8Array; text: string; labels: FrameViewLabels }) {
  const W = 50;
  const n = data.length;
  const x0 = 430 - (n * W) / 2 + 40;
  const chars = [...text];
  const rows: { label: string; bytes: number[]; fill: (i: number) => string; op?: string }[] = [
    { label: labels.xorData, bytes: [...data], fill: () => COLORS.data },
    { label: labels.xorKey, bytes: [...data].map((_, i) => keyBytes[i % 4]!), fill: (i) => KEY_TINT[i % 4]!, op: "⊕" },
    { label: labels.xorWire, bytes: [...wire], fill: () => "var(--card)", op: "=" },
  ];
  return (
    <g>
      {[...data].map((_, i) => (
        <text key={`c${i}`} x={x0 + i * W + (W - 6) / 2} y={y0 + 8} textAnchor="middle" className="fv-char">
          {chars[i] ?? ""}
        </text>
      ))}
      {rows.map((r, k) => {
        const y = y0 + 16 + k * 46;
        return (
          <g key={r.label}>
            <text x={x0 - 18} y={y + 25} textAnchor="end" className="fv-label">
              {r.label}
            </text>
            {r.op && (
              <text x={x0 - 4} y={y + 2} textAnchor="middle" className="fv-op">
                {r.op}
              </text>
            )}
            {r.bytes.map((b, i) => (
              <g key={i}>
                <rect x={x0 + i * W} y={y + 4} width={W - 6} height={34} rx={7} className="fv-byte" style={{ fill: r.fill(i) }} />
                <text x={x0 + i * W + (W - 6) / 2} y={y + 26} textAnchor="middle" className="fv-hex" style={{ fontSize: 14 }}>
                  {hex(b)}
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}
