import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { Pill } from "@lets-explain/core/iso/shapes";
import "./stage.css";

/**
 * The drawing kit every WebSocket stage shares: an isometric projection, boxes, the cables that
 * stand for connections (SSE one lane, WebSocket two), the envelopes and bubbles that ride them,
 * server racks and the client devices (phone, tablet, laptop, desktop browser).
 */

export const STAGE = { width: 860, height: 520 };

export type Pt = readonly [number, number];
export type V3 = readonly [number, number, number];

/** 2:1 isometric projection in stage pixels, around an origin. */
export const isoAt =
  (ox: number, oy: number) =>
  (x: number, y: number, z = 0): Pt => [ox + x - y, oy + (x + y) / 2 - z];
export type Proj = ReturnType<typeof isoAt>;
export const pts = (p: Proj, list: V3[]) => list.map(([x, y, z]) => p(x, y, z).map((n) => n.toFixed(1)).join(",")).join(" ");

/** A box: top, front (+y, faces the viewer's left) and side (+x) faces. */
export function Box({ p, at, size, shades, className }: { p: Proj; at: V3; size: V3; shades: readonly [string, string, string]; className?: string }) {
  const [x, y, z] = at;
  const [w, d, h] = size;
  return (
    <g className={`ps-box ${className ?? ""}`}>
      <polygon points={pts(p, [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} style={{ fill: shades[1] }} />
      <polygon points={pts(p, [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} style={{ fill: shades[2] }} />
      <polygon points={pts(p, [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} style={{ fill: shades[0] }} />
    </g>
  );
}

/** Draws children flat on a front face: local x runs along the face, local y runs down. */
export const onFront = (p: Proj, x: number, y: number, zTop: number) => {
  const [X, Y] = p(x, y, zTop);
  return `matrix(1 0.5 0 1 ${X.toFixed(1)} ${Y.toFixed(1)})`;
};
/** Draws children flat on a side (+x) face: local x runs along -y… towards the back, local y down. */
export const onSide = (p: Proj, x: number, y: number, zTop: number) => {
  const [X, Y] = p(x, y, zTop);
  return `matrix(1 -0.5 0 1 ${X.toFixed(1)} ${Y.toFixed(1)})`;
};
/** Draws children flat on a top face: local x runs along x, local y along y. */
export const onTop = (p: Proj, x: number, y: number, z: number) => {
  const [X, Y] = p(x, y, z);
  return `matrix(1 0.5 -1 0.5 ${X.toFixed(1)} ${Y.toFixed(1)})`;
};

export const DARK = ["#6d6976", "#45424d", "#36343d"] as const;
export const SHELL = ["#57535f", "#36343d", "#45424d"] as const;
export const SILVER = ["#d8d2dc", "#b9b2c0", "#a39cab"] as const;

export const seconds = (ms: number) => (ms % 1000 === 0 ? String(ms / 1000) : (ms / 1000).toFixed(1));
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

/* ------------------------------------------------------------------ cables */

export interface Cable {
  a: Pt;
  b: Pt;
  sag: number;
}
const ctrl = (c: Cable): Pt => [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2 + c.sag];
/** t = 0 at the client, 1 at the server. */
export function at(c: Cable, t: number): Pt {
  const k = ctrl(c);
  const u = 1 - t;
  return [u * u * c.a[0] + 2 * u * t * k[0] + t * t * c.b[0], u * u * c.a[1] + 2 * u * t * k[1] + t * t * c.b[1]];
}
export function angle(c: Cable, t: number): number {
  const k = ctrl(c);
  const dx = 2 * (1 - t) * (k[0] - c.a[0]) + 2 * t * (c.b[0] - k[0]);
  const dy = 2 * (1 - t) * (k[1] - c.a[1]) + 2 * t * (c.b[1] - k[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}
export const sample = (c: Cable, t0: number, t1: number, n = 16): Pt[] => Array.from({ length: n + 1 }, (_, i) => at(c, t0 + ((t1 - t0) * i) / n));
export const lineD = (list: Pt[]) => `M${list.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")}`;
/** Drawn from the server towards the client, so a growing cable starts at the server. */
export const cableD = (c: Cable) => {
  const k = ctrl(c);
  return `M${c.b[0]} ${c.b[1]} Q${k[0]} ${k[1]} ${c.a[0]} ${c.a[1]}`;
};

export type CableKind = "sse" | "ws" | "bus";
export const TUBE: Record<CableKind | "wsThin", { outer: number; inner: number }> = {
  sse: { outer: 20, inner: 14 },
  ws: { outer: 32, inner: 26 },
  wsThin: { outer: 20, inner: 15 },
  bus: { outer: 16, inner: 10 },
};

export function Chevron({ c, t, toServer, offset = 0, size = 5 }: { c: Cable; t: number; toServer: boolean; offset?: number; size?: number }) {
  const [x, y] = at(c, t);
  const a = angle(c, t) + (toServer ? 0 : 180);
  const r = (angle(c, t) * Math.PI) / 180;
  const nx = -Math.sin(r) * offset;
  const ny = Math.cos(r) * offset;
  return <path d={`M${-size} ${-size} L${size * 0.6} 0 L${-size} ${size}`} transform={`translate(${(x + nx).toFixed(1)} ${(y + ny).toFixed(1)}) rotate(${a.toFixed(1)})`} className="ps-chevron" />;
}

export function Plug({ c, end, outer }: { c: Cable; end: "a" | "b"; outer: number }) {
  const [x, y] = end === "a" ? c.a : c.b;
  const a = angle(c, end === "a" ? 0 : 1);
  const h = outer + 6;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)})`}>
      <rect x={end === "a" ? -4 : -12} y={-h / 2} width={16} height={h} rx={4} className="ps-plug" />
      <line x1={end === "a" ? 2 : -6} y1={-h / 2 + 4} x2={end === "a" ? 2 : -6} y2={h / 2 - 4} className="ps-plug-groove" />
    </g>
  );
}

/**
 * An open connection: a plugged-in cable. SSE has one lane (server to client); a WebSocket two,
 * one each way; a Redis bus carries published messages between servers.
 */
export function OpenCable({
  c,
  kind,
  label,
  grow = null,
  thin = false,
  plugs = "both",
}: {
  c: Cable;
  kind: CableKind;
  label?: string;
  /** Seconds before the cable starts growing from the server; null when it was already there. */
  grow?: number | null;
  thin?: boolean;
  plugs?: "both" | "a" | "b" | "none";
}) {
  const d = cableD(c);
  const mid = at(c, 0.5);
  const fresh = grow !== null;
  const tube = kind === "ws" && thin ? TUBE.wsThin : TUBE[kind];
  // The targets never change, so a re-render mid-growth (the next command) lets the growth finish.
  const drawn = { initial: fresh ? { pathLength: 0 } : false, animate: { pathLength: 1 }, transition: { delay: grow ?? 0, duration: 0.35, ease: "easeOut" as const } };
  const after = { initial: fresh ? { opacity: 0 } : false, animate: { opacity: 1 }, transition: { delay: (grow ?? 0) + 0.25, duration: 0.2 } };
  const ts = thin ? [0.3, 0.7] : [0.2, 0.35, 0.65, 0.8];
  const off = thin ? 4 : 6.5;
  const sz = thin ? 3.4 : 4.4;
  return (
    <g className={`ps-cable is-${kind}`}>
      <motion.path d={d} className="ps-tube-outer" style={{ strokeWidth: tube.outer }} {...drawn} />
      <motion.path d={d} className="ps-tube-inner" style={{ strokeWidth: tube.inner }} {...drawn} />
      <motion.g {...after}>
        <path d={lineD(sample(c, 0.03, 0.97, 24).map(([x, y]) => [x, y - tube.inner / 2 + 2.5] as const))} className="ps-tube-shine" />
        {kind === "ws" && <path d={lineD(sample(c, 0.06, 0.94, 24))} className="ps-lane-divider" />}
        {kind === "sse" && ts.map((t) => <Chevron key={t} c={c} t={t} toServer={false} />)}
        {kind === "ws" &&
          ts.flatMap((t) => [
            <Chevron key={`u${t}`} c={c} t={t} toServer offset={-off} size={sz} />,
            <Chevron key={`d${t}`} c={c} t={t} toServer={false} offset={off} size={sz} />,
          ])}
        {(plugs === "both" || plugs === "a") && <Plug c={c} end="a" outer={tube.outer} />}
        {(plugs === "both" || plugs === "b") && <Plug c={c} end="b" outer={tube.outer} />}
        {label && <Pill x={mid[0]} y={kind === "ws" ? mid[1] - 46 : mid[1] + 30} text={label} tone={kind === "ws" ? "ok" : "sun"} size={11.5} animate={false} />}
      </motion.g>
    </g>
  );
}

/**
 * A connection that ended: the cable comes apart in the middle and goes grey. `fresh` plays the
 * coming apart (it ended in this very action); otherwise it lies there already split.
 */
export function CutCable({
  c,
  kind,
  label,
  fresh = true,
  thin = false,
  tone = "danger",
  labelDy,
  unplug = false,
}: {
  c: Cable;
  kind: CableKind;
  label?: string;
  fresh?: boolean;
  thin?: boolean;
  tone?: "danger" | "plain";
  labelDy?: number;
  /** Both plugs out of their sockets: the connection is over at both ends. */
  unplug?: boolean;
}) {
  const tube = kind === "ws" && thin ? TUBE.wsThin : TUBE[kind];
  const ends = unplug ? ([0.07, 0.93] as const) : ([0, 1] as const);
  const left = lineD(sample(c, ends[0], 0.42));
  const right = lineD(sample(c, 0.58, ends[1]));
  const mid = at(c, 0.5);
  const half = (d: string, dx: number) => (
    <motion.g initial={fresh ? { x: 0, opacity: 1 } : false} animate={{ x: dx, opacity: 0.75 }} transition={{ delay: 0.1, duration: 0.45, ease: "easeOut" }}>
      <path d={d} className="ps-tube-outer" style={{ strokeWidth: tube.outer }} />
      <path d={d} className="ps-tube-inner is-dead" style={{ strokeWidth: tube.inner }} />
    </motion.g>
  );
  return (
    <g className={`ps-cable is-${kind} is-cut`}>
      {unplug && <circle cx={c.a[0]} cy={c.a[1]} r={5.5} className="ps-socket" />}
      {unplug && <circle cx={c.b[0]} cy={c.b[1]} r={5.5} className="ps-socket" />}
      {half(left, -10)}
      {half(right, 10)}
      {!unplug && <Plug c={c} end="a" outer={tube.outer} />}
      {!unplug && <Plug c={c} end="b" outer={tube.outer} />}
      {unplug && (
        <motion.g initial={fresh ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 0.1, duration: 0.3 }}>
          <g transform="translate(-10 0)">
            <Plug c={{ a: at(c, ends[0]), b: at(c, ends[1]), sag: c.sag * 0.86 }} end="a" outer={tube.outer} />
          </g>
          <g transform="translate(10 0)">
            <Plug c={{ a: at(c, ends[0]), b: at(c, ends[1]), sag: c.sag * 0.86 }} end="b" outer={tube.outer} />
          </g>
        </motion.g>
      )}
      <motion.g initial={fresh ? { opacity: 0, scale: 0.4 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25, duration: 0.3 }} style={{ x: mid[0], y: mid[1] }}>
        <path d="M-8 -8 L8 8 M8 -8 L-8 8" className="ps-cut-x" />
      </motion.g>
      {label && <Pill x={mid[0]} y={mid[1] + (labelDy ?? -tube.outer / 2 - 16)} text={label} tone={tone} size={labelDy !== undefined ? 11.5 : 10.5} animate={false} />}
    </g>
  );
}

/**
 * Half open: one end has let go and the other has not noticed. The end that closed is grey and
 * pulled out of its socket; the other half is still plugged in and looks fine from where it sits.
 */
export function HalfCable({ c, gone, label, note, thin = false }: { c: Cable; gone: "a" | "b"; label?: string; note?: string; thin?: boolean }) {
  const tube = thin ? TUBE.wsThin : TUBE.ws;
  const live = gone === "b" ? sample(c, 0, 0.47) : sample(c, 0.53, 1);
  const dead = gone === "b" ? sample(c, 0.53, 0.93) : sample(c, 0.07, 0.47);
  const mid = at(c, 0.5);
  const tag = at(c, gone === "b" ? 0.74 : 0.26);
  return (
    <g className="ps-cable is-ws is-half">
      <path d={lineD(live)} className="ps-tube-outer" style={{ strokeWidth: tube.outer }} />
      <path d={lineD(live)} className="ps-tube-inner" style={{ strokeWidth: tube.inner }} />
      <path d={lineD(dead)} className="ps-tube-outer" style={{ strokeWidth: tube.outer }} />
      <path d={lineD(dead)} className="ps-tube-inner is-dead" style={{ strokeWidth: tube.inner }} />
      <Plug c={c} end={gone === "b" ? "a" : "b"} outer={tube.outer} />
      <g transform={`translate(${mid[0].toFixed(1)} ${mid[1].toFixed(1)})`}>
        <path d="M-7 -7 L7 7 M7 -7 L-7 7" className="ps-cut-x" />
      </g>
      {label && <Pill x={tag[0]} y={tag[1] + tube.outer / 2 + 16} text={label} tone="danger" size={10.5} animate={false} />}
      {note && <Pill x={tag[0]} y={tag[1] + tube.outer / 2 + 40} text={note} tone="warn" size={10.5} animate={false} />}
    </g>
  );
}

/* ----------------------------------------------------------------- movers */

/** Follows a list of points, fading in at the start and out after it arrives (or staying, with `stay`). */
export function PathMover({ path, delay = 0, duration = 0.8, stay = false, children }: { path: Pt[]; delay?: number; duration?: number; stay?: boolean; children: ReactNode }) {
  const hold = 0.15;
  const total = duration + hold;
  const n = path.length;
  const times = path.map((_, i) => ((i / (n - 1)) * duration) / total);
  const end = path[n - 1]!;
  return (
    <motion.g
      initial={{ x: path[0]![0], y: path[0]![1], opacity: 0 }}
      animate={{ x: [...path.map((q) => q[0]), end[0]], y: [...path.map((q) => q[1]), end[1]], opacity: stay ? [0, 1, 1, 1] : [0, 1, 1, 0] }}
      transition={{
        default: { duration: total, delay, times: [...times, 1], ease: "linear" },
        opacity: { duration: total, delay, times: [0, 0.1, duration / total, 1] },
      }}
    >
      {children}
    </motion.g>
  );
}

/** A straight line, sampled with ease-in-out spacing. */
export const ease = (path: Pt[], n = 14): Pt[] => {
  const [a, b] = [path[0]!, path[path.length - 1]!];
  return Array.from({ length: n + 1 }, (_, i) => {
    const s = i / n;
    const e = s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2;
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e] as const;
  });
};

/** Several straight legs one after another, evenly sampled. */
export const legs = (points: Pt[], n = 10): Pt[] => points.slice(1).flatMap((b, i) => ease([points[i]!, b], n).slice(i === 0 ? 0 : 1));

/** A message in flight, as a chat bubble. */
export function Bubble({ label, fill, out, small }: { label: string; fill: string; out?: boolean; small?: boolean }) {
  const fs = small ? 10.5 : 12.5;
  const w = Math.max(small ? 26 : 34, label.length * fs * 0.6 + (small ? 12 : 18));
  const h = small ? 19 : 24;
  const tx = out ? w / 2 - 14 : -w / 2 + 6;
  const tail = out ? `M${tx} ${h / 2 - 2} l8 7 l0 -7 z` : `M${tx} ${h / 2 - 2} l0 7 l8 -7 z`;
  return (
    <g className="ps-bubble" transform={`translate(0 ${-h / 2 - 5})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2.6} className="ink" style={{ fill }} />
      <path d={tail} className="ink" style={{ fill }} />
      <rect x={tx + 1.2} y={h / 2 - 4} width={5.8} height={4.6} style={{ fill }} />
      <text y={fs * 0.36} textAnchor="middle" className="ps-bubble-text" style={{ fontSize: fs }}>
        {label}
      </text>
    </g>
  );
}

export type LetterTone = "ask" | "msg" | "empty" | "bad" | "ok";

/**
 * A one-off HTTP request or answer, as an envelope, with what it says underneath. A `stamp` is a
 * header that decides something (Upgrade: websocket), drawn as a stamp on the envelope.
 */
export function Letter({ tone, label, sub, stamp, labelAbove }: { tone: LetterTone; label: string; sub?: string; stamp?: { text: string; ok: boolean }; labelAbove?: boolean }) {
  const fill = { ask: "var(--sky)", msg: "var(--mint)", empty: "var(--card)", bad: "var(--red-soft)", ok: "var(--mint)" }[tone];
  const ly = labelAbove ? (sub ? -36 : -22) : 28;
  return (
    <g className={`ps-letter is-${tone}`}>
      <rect x={-18} y={-12} width={36} height={24} rx={4} className="ink" style={{ fill }} />
      <path d="M-18 -10 L0 2 L18 -10" className="ps-letter-flap" />
      {stamp && (
        <g transform="translate(13 -12) rotate(-12)">
          <rect x={-9} y={-7} width={18} height={14} rx={2} className={`ps-stamp ${stamp.ok ? "is-ok" : "is-bad"}`} />
          <path d={stamp.ok ? "M-4 0 L-1 3 L4 -3" : "M-3 -3 L3 3 M3 -3 L-3 3"} className="ps-stamp-mark" />
        </g>
      )}
      <text y={ly} textAnchor="middle" className="ps-letter-label">
        {label}
      </text>
      {sub && (
        <text y={ly + 14} textAnchor="middle" className="ps-letter-sub">
          {sub}
        </text>
      )}
    </g>
  );
}

export function Hourglass() {
  return (
    <g className="ps-hourglass">
      <path d="M-6 -9 H6 L0 0 L6 9 H-6 L0 0 Z" className="ink" style={{ fill: "var(--sun)" }} />
    </g>
  );
}

/** A card listing what one side holds (the server's messages). */
export function Board({ x, y, title, rows, empty, w = 250 }: { x: number; y: number; title: string; rows: string[]; empty: string; w?: number }) {
  const h = 26 + Math.max(1, rows.length) * 19 + 8;
  return (
    <g transform={`translate(${x} ${y})`} className="ps-board">
      <rect x={0} y={3} width={w} height={h} rx={12} className="pill-shadow" />
      <rect x={0} y={0} width={w} height={h} rx={12} className="ps-board-card" />
      <text x={12} y={18} className="ps-board-title">
        {title}
      </text>
      {rows.length === 0 ? (
        <text x={12} y={40} className="ps-board-row is-empty">
          {empty}
        </text>
      ) : (
        rows.map((r, i) => (
          <text key={i} x={12} y={40 + i * 19} className="ps-board-row">
            {clip(r, Math.floor((w - 24) / 6.9))}
          </text>
        ))
      )}
    </g>
  );
}

export function WifiIcon({ x, y, off, light }: { x: number; y: number; off: boolean; light?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} className={`ps-wifi ${off ? "is-off" : ""} ${light ? "is-light" : ""}`}>
      <path d="M-6 -2 Q0 -8 6 -2" />
      <path d="M-3.5 1 Q0 -2.5 3.5 1" />
      <circle cx={0} cy={3.5} r={1.3} className="ps-wifi-dot" />
      {off && <path d="M-6 -7 L6 5" className="ps-wifi-slash" />}
    </g>
  );
}

/* ------------------------------------------------------------------ racks */

export interface RackUnit {
  /** Bottom and top of the unit, in rack heights from the floor. */
  z: readonly [number, number];
  label?: string;
  led?: "on" | "warm" | "off" | "bad";
  grille?: boolean;
}

/**
 * A server rack: a dark cabinet whose front holds units (one per thing it runs, with a label and
 * a status light). Sockets are drawn by whoever plugs into them.
 */
export function Rack({ p, w, d, h, units, down }: { p: Proj; w: number; d: number; h: number; units: RackUnit[]; down?: boolean }) {
  const v = (z: number) => h - z;
  return (
    <g className={`ps-rack ${down ? "is-down" : ""}`}>
      <Box p={p} at={[0, 0, 0]} size={[w, d, h]} shades={DARK} />
      <g transform={onSide(p, w, d, h)}>
        {Array.from({ length: Math.max(2, Math.floor(d / 16)) }, (_, k) => 14 + k * 14)
          .filter((x) => x < d - 8)
          .map((x) => (
            <line key={x} x1={x} y1={24} x2={x} y2={h - 24} className="ps-vent" />
          ))}
      </g>
      <g transform={onFront(p, 0, d, h)}>
        {units.map((u, i) => {
          const [z0, z1] = u.z;
          const mid = (z0 + z1) / 2;
          return (
            <g key={i}>
              <rect x={5} y={v(z1)} width={w - 10} height={z1 - z0} rx={2.5} className="ps-unit" />
              {u.grille &&
                [0, 1, 2, 3].map((k) => <line key={k} x1={w * 0.3 + k * 9} y1={v(z1) + 6} x2={w * 0.3 + k * 9} y2={v(z0) - 6} className="ps-grille" />)}
              {u.label && (
                <text x={12} y={v(z1) + 15} className="ps-unit-label">
                  {u.label}
                </text>
              )}
              {u.led && <circle cx={w - 13} cy={u.label ? v(z1) + 11 : v(mid)} r={3.2} className={`ps-led is-${u.led}`} />}
            </g>
          );
        })}
      </g>
    </g>
  );
}

/** A socket on a face, drawn flat on it (call inside an onFront/onSide transform). */
export const Socket = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={6} className="ps-socket" />;

/* ---------------------------------------------------------------- devices */

export type DeviceKind = "phone" | "tablet" | "laptop" | "monitor";

export interface DeviceGeom {
  kind: DeviceKind;
  p: Proj;
  /** Width and height of the screen face; depth of the body. */
  w: number;
  h: number;
  /** Where the cable plugs in, on the device's right side. */
  jack: Pt;
  /** Screen inset (x, y, width, height) in face coordinates. */
  screen: readonly [number, number, number, number];
  /** Lowest point of the drawing, for a name under it. */
  foot: Pt;
}

/**
 * Lays a device out with its screen face `w` wide and `h` tall; (x, y) is the floor point under
 * the face's bottom-left corner.
 */
export function deviceGeom(kind: DeviceKind, x: number, y: number, w: number, h: number): DeviceGeom {
  const side = (p: Proj, yy: number, z: number): Pt => {
    const [X, Y] = p(w, yy, z);
    return [X + 4, Y];
  };
  if (kind === "laptop") {
    const base = laptopBase(h);
    const p = isoAt(x + 6, y - 3);
    return { kind, p, w, h, jack: side(p, 3, 8 + h * 0.7), screen: [6, 6, w - 12, h - 12], foot: p(w * 0.5, base, 0) };
  }
  if (kind === "monitor") {
    const stand = monitorStand(h);
    const p = isoAt(x + 10, y - 5);
    return { kind, p, w, h, jack: side(p, 5, stand + h * 0.6), screen: [6, 6, w - 12, h - 12], foot: p(w * 0.5, 34, 0) };
  }
  const d = slabDepth(kind, w);
  const p = isoAt(x + d, y - d / 2);
  const top = Math.round(h * (kind === "phone" ? 0.085 : 0.07));
  return { kind, p, w, h, jack: side(p, d / 2, h * 0.68), screen: [6, top, w - 12, h - top * 2], foot: p(w * 0.5, d, 0) };
}

const laptopBase = (h: number) => Math.round(h * 0.62);
const monitorStand = (h: number) => Math.round(h * 0.16);
const slabDepth = (kind: DeviceKind, w: number) => (kind === "phone" ? Math.max(8, Math.round(w * 0.09)) : 10);

/** A device with whatever its screen shows; the screen's children get (width, height) in screen pixels. */
export function Device({ g, dim, children }: { g: DeviceGeom; dim?: boolean; children: (sw: number, sh: number) => ReactNode }) {
  const id = useId().replace(/:/g, "");
  const { p, w, h, kind } = g;
  const [sx, sy, sw, sh] = g.screen;
  const screen = (zTop: number, yFace: number) => (
    <g transform={onFront(p, 0, yFace, zTop)}>
      <rect x={sx} y={sy} width={sw} height={sh} rx={kind === "phone" ? 9 : 5} className="ps-screen" />
      <clipPath id={`scr-${id}`}>
        <rect x={sx} y={sy} width={sw} height={sh} rx={kind === "phone" ? 9 : 5} />
      </clipPath>
      <g clipPath={`url(#scr-${id})`}>
        <g transform={`translate(${sx} ${sy})`}>{children(sw, sh)}</g>
      </g>
      {dim && <rect x={sx} y={sy} width={sw} height={sh} rx={kind === "phone" ? 9 : 5} className="ps-screen-dim" />}
      {kind === "phone" && <rect x={w / 2 - 12} y={sy / 2 - 2} width={24} height={4} rx={2} className="ps-speaker" />}
    </g>
  );
  if (kind === "laptop") {
    const base = laptopBase(h);
    return (
      <g className="ps-device is-laptop">
        <Box p={p} at={[0, 0, 0]} size={[w, base, 8]} shades={SILVER} />
        <g transform={onTop(p, 0, 0, 8)}>
          {Array.from({ length: 3 }, (_, r) =>
            Array.from({ length: Math.floor((w - 20) / 12) }, (_, k) => <rect key={`${r}-${k}`} x={10 + k * 12} y={8 + r * 9} width={9} height={6.5} rx={1.2} className="ps-key" />),
          )}
          <rect x={w / 2 - w * 0.17} y={base - base * 0.42} width={w * 0.34} height={base * 0.32} rx={3} className="ps-trackpad" />
        </g>
        <Box p={p} at={[0, 0, 8]} size={[w, 6, h]} shades={["#b9b2c0", "#8b8694", "#a39cab"]} />
        {screen(8 + h, 6)}
      </g>
    );
  }
  if (kind === "monitor") {
    const stand = monitorStand(h);
    return (
      <g className="ps-device is-monitor">
        <Box p={p} at={[w / 2 - 20, 4, 0]} size={[40, 30, 4]} shades={SILVER} />
        <Box p={p} at={[w / 2 - 6, 2, 4]} size={[12, 8, stand]} shades={SILVER} />
        <Box p={p} at={[0, 0, stand]} size={[w, 10, h]} shades={SHELL} />
        {screen(stand + h, 10)}
      </g>
    );
  }
  const d = slabDepth(kind, w);
  return (
    <g className={`ps-device is-${kind}`}>
      <Box p={p} at={[0, 0, 0]} size={[w, d, h]} shades={SHELL} />
      {screen(h, d)}
    </g>
  );
}
