import type { ReactNode } from "react";
import { boxFaces, pts, rel } from "@lets-explain/core/iso/geometry";
import { IsoBox, type ParcelState, type PersonState, type Shades, type Tint } from "@lets-explain/core/iso/shapes";
import "./rail-stage.css";

/**
 * The railway drawing kit every Kafka stage is built from. A partition is a track, a record is a
 * numbered wagon on it, a broker is a station, the KRaft controller a signal box, and retention
 * takes old wagons off through a tunnel. Everything is drawn along +x, with
 * (0,0) at the centre of a wagon's footprint on top of the rails, so the stages keep their layout.
 */

/* ------------------------------------------------------------------ people */

export interface Reader {
  id: string;
  name: string;
  tint: Tint;
  /** Next offset to read; undefined while the reader is down. */
  position?: number;
  committed?: number;
  state: PersonState;
  /** Changes on every action, so a one-shot animation (hop) can play again. */
  pulse?: number;
}

export function NameTag({ y, text, tint }: { y: number; text: string; tint: Tint }) {
  const w = Math.round(text.length * 7.4 + 20);
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x={-w / 2} y={-8} width={w} height={22} rx={11} className="pill-shadow" />
      <rect x={-w / 2} y={-11} width={w} height={22} rx={11} style={{ fill: tint.soft }} className="ink" />
      <text y={4.5} textAnchor="middle" style={{ fontSize: 12.5, fontWeight: 800 }}>
        {text}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------ wagons */

export type WagonKind = "order" | "cancel" | "payment" | "neutral";

export const WAGON_SHADES: Record<WagonKind, Shades> = {
  order: ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"],
  cancel: ["var(--peach)", "var(--peach-mid)", "var(--peach-deep)"],
  payment: ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"],
  neutral: ["#efe7d8", "#ddd2bf", "#c9bba3"],
};

/** Length and width of a wagon at size 1, in tiles. Slots are 1.0–1.1 long, so couplers almost meet. */
export const WAGON_LENGTH = 0.88;
const WAGON_HALF_WIDTH = 0.31;

const CHASSIS: Shades = ["#6d6976", "#57535f", "#45424d"];

/**
 * A record as a rail wagon. Box cars by default; cancels (or `open`) are low open wagons, so two
 * kinds read apart at a glance. The label (the offset, usually) is painted on a plate on the side
 * that faces the viewer. `size` scales the whole wagon.
 */
export function Wagon({
  s: s0,
  kind = "order",
  shades: custom,
  open: openProp,
  label,
  state = "normal",
  readTint,
  size = 1,
  sealed,
  children,
}: {
  s: number;
  kind?: WagonKind;
  /** Free colours (e.g. by key); overrides `kind`'s colours. */
  shades?: Shades;
  open?: boolean;
  label?: string | number;
  state?: ParcelState;
  readTint?: Tint;
  size?: number;
  /** A seal strip across the doors: the wagon is held back (an open transaction). */
  sealed?: boolean;
  /** Extra drawing in wagon space (e.g. a badge), drawn on top. */
  children?: ReactNode;
}) {
  const s = s0 * size;
  const shades = custom ?? WAGON_SHADES[kind] ?? WAGON_SHADES.order;
  const open = openProp ?? kind === "cancel";
  const half = WAGON_LENGTH / 2;
  const w = WAGON_HALF_WIDTH;
  const z0 = 0.24;
  const top = open ? 0.66 : 0.88;
  const p = (x: number, y: number, z: number) => rel(s, x, y, z);
  const f = s / 50;

  const wheel = (x: number) => {
    const [cx, cy] = p(x, w + 0.02, 0.12);
    return (
      <g key={x}>
        <circle cx={cx} cy={cy} r={s * 0.135} className="rail-wheel" />
        <circle cx={cx} cy={cy} r={s * 0.045} className="rail-hub" />
      </g>
    );
  };

  // The plate sits on the +y side; this matrix maps flat text onto that face.
  const [plx, ply] = p(0, w, (z0 + top) / 2 + (open ? 0 : 0.02));
  const text = label === undefined ? "" : String(label);
  const side = WAGON_LENGTH * s - 6;
  const baseFont = (open ? 16 : 19) * f;
  const font = Math.max(8.5, Math.min(baseFont, text.length > 2 ? (side * 1.55) / text.length : baseFont));
  const plateW = Math.min(side, text.length * font * 0.62 + 10 * f + 4);
  const plateH = Math.max(12, font + 4 * f + 2);

  // Open wagon: the inside shows as a darker well inset from the rim.
  const inset = 0.07;
  const well = pts([p(-half + inset, -w + inset, top), p(half - inset, -w + inset, top), p(half - inset, w - inset, top), p(-half + inset, w - inset, top)]);
  const wellWall = pts([p(-half + inset, -w + inset, top), p(half - inset, -w + inset, top), p(half - inset, -w + inset, top - 0.16), p(-half + inset, -w + inset, top - 0.16)]);

  const [, topY] = p(0, 0, top + (open ? 0 : 0.08));
  const ribs: ReactNode[] = [];
  if (!open) {
    for (const x of [-half + 0.08, half - 0.08]) {
      const [x1, y1] = p(x, w, z0 + 0.05);
      const [x2, y2] = p(x, w, top - 0.05);
      ribs.push(<line key={x} x1={x1} y1={y1} x2={x2} y2={y2} className="rail-rib" />);
    }
  }

  return (
    <g className={`wagon is-${state} ${s < 30 ? "is-small" : ""}`}>
      <ellipse cx={0} cy={s * 0.1} rx={s * 0.75} ry={s * 0.3} className="rail-shadow" />
      <Coupler s={s} x={-half - 0.06} />
      <IsoBox s={s} at={[-half + 0.04, -w + 0.04, 0.14]} size={[WAGON_LENGTH - 0.08, 2 * w - 0.08, 0.1]} shades={CHASSIS} />
      <g className="wagon-body">
        <IsoBox s={s} at={[-half, -w, z0]} size={[WAGON_LENGTH, 2 * w, top - z0]} shades={shades} />
      </g>
      {open ? (
        <>
          <polygon points={well} className="rail-well" style={custom ? { fill: custom[2] } : undefined} />
          <polygon points={wellWall} className="rail-well-wall" style={custom ? { fill: custom[2] } : undefined} />
        </>
      ) : (
        <>
          <g className="wagon-body">
            <IsoBox s={s} at={[-half - 0.04, -w - 0.04, top]} size={[WAGON_LENGTH + 0.08, 2 * w + 0.08, 0.07]} shades={[shades[0], shades[2], shades[2]]} />
          </g>
          <RoofSeam s={s} top={top + 0.07} half={half} />
        </>
      )}
      {ribs}
      {wheel(-half + 0.2)}
      {wheel(half - 0.2)}
      <Coupler s={s} x={half + 0.06} />
      {sealed && <SealStrip s={s} z0={z0} top={top} half={half} />}
      {text !== "" && (
        <g transform={`matrix(1 0.5 0 1 ${plx} ${ply})`}>
          <rect x={-plateW / 2} y={-plateH / 2} width={plateW} height={plateH} rx={Math.min(4, plateH / 3)} className="rail-plate" />
          <text y={font * 0.34} textAnchor="middle" className="rail-plate-text" style={{ fontSize: font }}>
            {text}
          </text>
        </g>
      )}
      {state === "dup" && (
        <g transform={`translate(0 ${topY - s * 0.55})`}>
          <g className="pop">
            <rect x={-15} y={-11} width={30} height={20} rx={10} className="badge-dup" />
            <text y={4} textAnchor="middle" className="badge-dup-text">
              2×
            </text>
          </g>
        </g>
      )}
      {state === "read" && readTint && (
        <g transform={`translate(0 ${topY - s * 0.5})`}>
          <g className="pop">
            <circle r={Math.max(7, 9 * Math.min(1, f * 1.3))} style={{ fill: readTint.body }} className="ink" />
            <path d="M-4 0l3 3 5-6" className="check" />
          </g>
        </g>
      )}
      {children}
    </g>
  );
}

/** Height above the wagon's footprint of its roof, in px, for placing things on top. */
export function wagonTop(s: number, size = 1, open = false) {
  return rel(s * size, 0, 0, open ? 0.66 : 0.95)[1];
}

/** A red seal strip across the side doors: the wagon is on the track but held back. */
function SealStrip({ s, z0, top, half }: { s: number; z0: number; top: number; half: number }) {
  const w = WAGON_HALF_WIDTH;
  const [x1, y1] = rel(s, -half + 0.12, w, (z0 + top) / 2 + 0.14);
  const [x2, y2] = rel(s, half - 0.12, w, (z0 + top) / 2 + 0.14);
  const [lx, ly] = rel(s, half - 0.16, w, (z0 + top) / 2 + 0.14);
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="rail-seal-strip" />
      <circle cx={lx} cy={ly} r={Math.max(3, s * 0.08)} className="rail-seal-dot" />
    </g>
  );
}

/** Dashed outline of the wagon that is not there yet. */
export function GhostWagon({ s: s0, size = 1, label }: { s: number; size?: number; /** The offset it will get, on a dashed plate. */ label?: string | number }) {
  const s = s0 * size;
  const [plx, ply] = rel(s, 0, WAGON_HALF_WIDTH, 0.5);
  const text = label === undefined ? "" : String(label);
  const font = Math.max(9, 15 * (s / 50));
  const a = -WAGON_LENGTH / 2;
  const b = WAGON_LENGTH / 2;
  const c = -WAGON_HALF_WIDTH;
  const d = WAGON_HALF_WIDTH;
  const h = 0.88;
  const outline = pts([rel(s, a, c, h), rel(s, b, c, h), rel(s, b, c, 0.04), rel(s, b, d, 0.04), rel(s, a, d, 0.04), rel(s, a, d, h)]);
  const inner = pts([rel(s, a, d, h), rel(s, b, d, h), rel(s, b, c, h)]);
  const [ex1, ey1] = rel(s, b, d, h);
  const [ex2, ey2] = rel(s, b, d, 0.04);
  return (
    <g>
      <polygon points={outline} className="rail-ghost" />
      <polyline points={inner} className="rail-ghost-edge" />
      <line x1={ex1} y1={ey1} x2={ex2} y2={ey2} className="rail-ghost-edge" />
      {text !== "" && (
        <g transform={`matrix(1 0.5 0 1 ${plx} ${ply})`}>
          <rect x={-(text.length * font * 0.62 + 8) / 2} y={-font / 2 - 3} width={text.length * font * 0.62 + 8} height={font + 6} rx={3} className="rail-ghost-plate" />
          <text y={font * 0.34} textAnchor="middle" className="rail-ghost-text" style={{ fontSize: font }}>
            {text}
          </text>
        </g>
      )}
    </g>
  );
}

function Coupler({ s, x }: { s: number; x: number }) {
  const [x1, y1] = rel(s, x - 0.05, 0, 0.19);
  const [x2, y2] = rel(s, x + 0.05, 0, 0.19);
  return <line x1={x1} y1={y1} x2={x2} y2={y2} className="rail-coupler" />;
}

function RoofSeam({ s, top, half }: { s: number; top: number; half: number }) {
  const [x1, y1] = rel(s, -half, 0, top);
  const [x2, y2] = rel(s, half, 0, top);
  return <line x1={x1} y1={y1} x2={x2} y2={y2} className="rail-seam" />;
}

/** Three shades (top, left, right) from one colour, for wagons coloured by key or partition. */
export function shadesFrom(fill: string): Shades {
  return [fill, `color-mix(in srgb, ${fill} 84%, #6b5a48)`, `color-mix(in srgb, ${fill} 70%, #6b5a48)`];
}

/** Small wagon for a legend. */
export function MiniWagon({
  kind = "order",
  shades,
  fill,
  open,
  sealed,
  dim,
}: {
  kind?: WagonKind;
  shades?: Shades;
  /** One colour instead of `kind`; the sides are shaded from it. */
  fill?: string;
  open?: boolean;
  sealed?: boolean;
  dim?: boolean;
}) {
  return (
    <g transform="translate(0 3)" className={`rail-mini ${dim ? "is-dim" : ""}`}>
      <Wagon s={14} kind={kind} shades={shades ?? (fill ? shadesFrom(fill) : undefined)} open={open} sealed={sealed} />
    </g>
  );
}

/* ------------------------------------------------------------------- track */

/**
 * A stretch of track along +x from `from` to `to`, centred on y = 0, rail tops at z = 0:
 * ballast, wooden sleepers and two steel rails. `tone` tints the ballast (a new or hot partition).
 */
export function Track({
  s,
  from,
  to,
  tone,
  bands = [],
}: {
  s: number;
  from: number;
  to: number;
  tone?: "new" | "hot" | "dim";
  /** Tinted stretches of ballast, under the sleepers (e.g. one per segment). */
  bands?: { from: number; to: number; className: string }[];
}) {
  const ballast = boxFaces(s, from, -0.5, -0.18, to - from, 1.0, 0.08);
  const sleepers: ReactNode[] = [];
  for (let x = from + 0.12; x < to - 0.08; x += 0.3) {
    const f = boxFaces(s, x, -0.4, -0.1, 0.13, 0.8, 0.04);
    sleepers.push(
      <g key={x.toFixed(2)} className="rail-sleeper">
        <polygon points={f.left} />
        <polygon points={f.top} />
      </g>,
    );
  }
  const rail = (y: number) => {
    const f = boxFaces(s, from, y - 0.035, -0.06, to - from, 0.07, 0.06);
    return (
      <g key={y} className="rail-steel">
        <polygon points={f.left} className="rail-steel-side" />
        <polygon points={f.right} className="rail-steel-side" />
        <polygon points={f.top} className="rail-steel-top" />
      </g>
    );
  };
  return (
    <g className={`rail-track ${tone ? `is-${tone}` : ""}`}>
      <polygon points={ballast.left} className="rail-ballast-side" />
      <polygon points={ballast.right} className="rail-ballast-side" />
      <polygon points={ballast.top} className="rail-ballast-top" />
      {bands.map((b) => (
        <polygon key={`${b.from}-${b.className}`} points={boxFaces(s, b.from, -0.5, -0.18, b.to - b.from, 1.0, 0.08).top} className={b.className} />
      ))}
      {sleepers}
      {rail(-0.22)}
      {rail(0.22)}
    </g>
  );
}

/** Buffer stop at the start of a track: where the line ends. (x, 0) is its centre. */
export function BufferStop({ s, x }: { s: number; x: number }) {
  const beam = boxFaces(s, x - 0.08, -0.36, 0.12, 0.14, 0.72, 0.16);
  return (
    <g className="rail-buffer">
      <IsoBox s={s} at={[x - 0.18, -0.3, -0.06]} size={[0.16, 0.6, 0.2]} shades={["#8d8796", "#6e6878", "#5b5664"]} />
      <polygon points={beam.left} className="rail-buffer-beam" />
      <polygon points={beam.right} className="rail-buffer-beam-end" />
      <polygon points={beam.top} className="rail-buffer-beam-top" />
    </g>
  );
}

/** The raised bed tracks run on, with a coloured rim, so a line reads as a place. */
export function Bed({ s, x0, x1, y0, y1, rim = "var(--sun)", z = -0.18 }: { s: number; x0: number; x1: number; y0: number; y1: number; rim?: string | null; z?: number }) {
  const f = boxFaces(s, x0, y0, z - 0.2, x1 - x0, y1 - y0, 0.2);
  const inset = 0.12;
  const edge = pts([rel(s, x0 + inset, y0 + inset, z), rel(s, x1 - inset, y0 + inset, z), rel(s, x1 - inset, y1 - inset, z), rel(s, x0 + inset, y1 - inset, z)]);
  return (
    <g className="rail-bed">
      <polygon points={f.left} className="rail-bed-left" />
      <polygon points={f.right} className="rail-bed-right" />
      <polygon points={f.top} className="rail-bed-top" />
      {rim && <polygon points={edge} className="rail-bed-rim" style={{ stroke: rim }} />}
    </g>
  );
}

/* ------------------------------------------------------------------ tunnel */

export interface TunnelBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  h: number;
}

const ARCH = { r: 0.52, spring: 0.42 };

function archPoints(s: number, t: TunnelBox, k: number) {
  const out: [number, number][] = [rel(s, t.x1, (t.y0 + t.y1) / 2 + ARCH.r * k, -0.18)];
  for (let i = 0; i <= 16; i++) {
    const a = (Math.PI * i) / 16;
    out.push(rel(s, t.x1, (t.y0 + t.y1) / 2 + ARCH.r * k * Math.cos(a), ARCH.spring * k + ARCH.r * k * Math.sin(a)));
  }
  out.push(rel(s, t.x1, (t.y0 + t.y1) / 2 - ARCH.r * k, -0.18));
  return out;
}

/** The hill and the dark inside of the tunnel, drawn behind the wagons. */
export function TunnelBack({ s, t }: { s: number; t: TunnelBox }) {
  const f = boxFaces(s, t.x0, t.y0, -0.38, t.x1 - t.x0, t.y1 - t.y0, t.h + 0.38);
  return (
    <g className="rail-tunnel">
      <polygon points={f.left} className="rail-stone-left" />
      <polygon points={f.top} className="rail-stone-top" />
      <polygon points={f.right} className="rail-tunnel-dark" />
    </g>
  );
}

/** The portal face with the arch cut out, drawn over the wagons so a leaving wagon goes inside. */
export function TunnelPortal({ s, t, scale = 1 }: { s: number; t: TunnelBox; scale?: number }) {
  const { x1, y0, y1, h } = t;
  const cy = (y0 + y1) / 2;
  const face = [rel(s, x1, y0, -0.38), rel(s, x1, y1, -0.38), rel(s, x1, y1, h), rel(s, x1, y0, h)];
  const arch = archPoints(s, t, scale);
  const d = `M${pts(face).split(" ").join(" L")} Z M${pts(arch).split(" ").join(" L")} Z`;
  const r = ARCH.r * scale;
  const sp = ARCH.spring * scale;
  const ticks: ReactNode[] = [];
  for (let i = 1; i < 8; i++) {
    const a = (Math.PI * i) / 8;
    const [ax, ay] = rel(s, x1, cy + r * Math.cos(a), sp + r * Math.sin(a));
    const [bx, by] = rel(s, x1, cy + (r + 0.16) * Math.cos(a), sp + (r + 0.16) * Math.sin(a));
    ticks.push(<line key={i} x1={ax} y1={ay} x2={bx} y2={by} className="rail-stone-tick" />);
  }
  const keyArc = [] as [number, number][];
  for (let i = 0; i <= 16; i++) {
    const a = (Math.PI * i) / 16;
    keyArc.push(rel(s, x1, cy + (r + 0.16) * Math.cos(a), sp + (r + 0.16) * Math.sin(a)));
  }
  return (
    <g className="rail-tunnel">
      <path d={d} fillRule="evenodd" className="rail-stone-right" />
      <polyline points={pts(keyArc)} className="rail-stone-arch" />
      {ticks}
    </g>
  );
}

/** A signpost: a pole with a little board and an arrow pointing back (towards the tunnel). */
export function SignPost({ text, pole = 40, align = "left" }: { text: string; pole?: number; align?: "left" | "center" }) {
  const w = Math.round(text.length * 7 + 26);
  const x = align === "left" ? -w + 22 : -w / 2;
  return (
    <g>
      <ellipse rx={7} ry={2.5} className="rail-shadow" />
      <line x1={0} y1={0} x2={0} y2={-pole} className="flag-pole" />
      <g transform={`translate(${x} ${-pole - 12})`}>
        <rect x={0} y={2} width={w} height={20} rx={6} className="pill-shadow" />
        <rect x={0} y={0} width={w} height={20} rx={6} className="ink rail-sign" />
        <path d="M9 10l5 -4v8z" className="rail-sign-arrow" />
        <text x={w / 2 + 6} y={14} textAnchor="middle" className="rail-sign-text">
          {text}
        </text>
      </g>
    </g>
  );
}

/* ---------------------------------------------------------------- stations */

export type StationStatus = "ok" | "down" | "busy";

/**
 * A small railway station: a house with a pitched roof on a platform. Brokers, services and
 * workers are stations. (0,0) is the centre of the house's footprint.
 */
export function Station({
  s,
  roof,
  status = "ok",
  w = 1.5,
  h = 1.0,
  platform = true,
  sign,
}: {
  s: number;
  roof: Tint;
  status?: StationStatus;
  w?: number;
  h?: number;
  platform?: boolean;
  /** A tiny board over the door, e.g. "B1". */
  sign?: string;
}) {
  const half = w / 2;
  const down = status === "down";
  const walls: Shades = down ? ["#e9e5ec", "#dcd6e0", "#c9c2cf"] : ["#fffdf8", "#f3ebdc", "#e2d6c1"];
  const roofTop = down ? "#d8d2dc" : roof.body;
  const roofDeep = down ? "#a9a1b1" : roof.deep;
  const p = (x: number, y: number, z: number) => rel(s, x, y, z);
  const o = 0.16;
  const ridge = h + w * 0.42;
  // Ridge runs along x. Back slope, then the +x gable end, then the front slope over both.
  const backSlope = pts([p(-half - o, -half - o, h - 0.04), p(half + o, -half - o, h - 0.04), p(half + o, 0, ridge), p(-half - o, 0, ridge)]);
  const gable = pts([p(half, -half, h), p(half, half, h), p(half, 0, ridge - 0.06)]);
  const frontSlope = pts([p(-half - o, half + o, h - 0.04), p(half + o, half + o, h - 0.04), p(half + o, 0, ridge), p(-half - o, 0, ridge)]);
  const roofEdge = pts([p(half + o, -half - o, h - 0.04), p(half + o, 0, ridge), p(half + o, half + o, h - 0.04)]);
  // Door and windows on the +y face (towards the viewer, lower left).
  const door = pts([p(-0.12, half, 0), p(0.24, half, 0), p(0.24, half, 0.55), p(-0.12, half, 0.55)]);
  const winA = pts([p(-half + 0.16, half, 0.36), p(-half + 0.46, half, 0.36), p(-half + 0.46, half, 0.66), p(-half + 0.16, half, 0.66)]);
  const winB = pts([p(half - 0.42, half, 0.36), p(half - 0.14, half, 0.36), p(half - 0.14, half, 0.66), p(half - 0.42, half, 0.66)]);
  const round = pts([p(half, -0.16, h * 0.42), p(half, 0.16, h * 0.42), p(half, 0.16, h * 0.72), p(half, -0.16, h * 0.72)]);
  const [, top] = p(0, 0, ridge);
  const [sx, sy] = p(0.06, half, 0.72);
  return (
    <g className={`station is-${status}`}>
      {platform && <IsoBox s={s} at={[-half - 0.3, -half - 0.2, -0.16]} size={[w + 0.6, w + 0.75, 0.16]} shades={["#f1e7d4", "#dccdb2", "#cdbd9e"]} />}
      {platform && <PlatformEdge s={s} x0={-half - 0.3} x1={half + 0.3} y={half + 0.55} />}
      <IsoBox s={s} at={[-half, -half, 0]} size={[w, w, h]} shades={walls} />
      <polygon points={door} className="ink door" />
      <polygon points={winA} className="ink window" />
      <polygon points={winB} className="ink window" />
      <polygon points={round} className="ink window" />
      <polygon points={backSlope} className="ink" style={{ fill: roofDeep }} />
      <polygon points={gable} className="ink" style={{ fill: walls[2] }} />
      <polygon points={frontSlope} className="ink" style={{ fill: roofTop }} />
      <polyline points={roofEdge} className="station-eave" />
      {sign && (
        <g transform={`matrix(1 0.5 0 1 ${sx} ${sy})`}>
          <rect x={-sign.length * 3.6 - 5} y={-7} width={sign.length * 7.2 + 10} height={13} rx={3} className="station-sign" />
          <text y={3.5} textAnchor="middle" className="station-sign-text">
            {sign}
          </text>
        </g>
      )}
      {down && (
        <g transform={`translate(${s * 0.9} ${top - 6})`}>
          <g className="pop">
            <circle r={11} className="badge-down" />
            <path d="M-4 -4l8 8m0 -8l-8 8" className="badge-x" />
          </g>
        </g>
      )}
      {down && (
        <g transform={`translate(0 ${top - 6})`}>
          <circle r={5} cx={-6} className="smoke smoke-1" />
          <circle r={4} cx={4} className="smoke smoke-2" />
        </g>
      )}
      {status === "busy" && <path d={`M${s * 0.9} ${top - 12} q4 6 0 9 q-4 -3 0 -9z`} className="sweat" />}
    </g>
  );
}

function PlatformEdge({ s, x0, x1, y }: { s: number; x0: number; x1: number; y: number }) {
  const [ax, ay] = rel(s, x0 + 0.06, y, 0);
  const [bx, by] = rel(s, x1 - 0.06, y, 0);
  return <line x1={ax} y1={ay} x2={bx} y2={by} className="station-edge" />;
}

/**
 * A signal box: a narrow two-storey tower with a glazed cabin on top, the place that decides for
 * the whole line. Used for KRaft controllers; the one in charge has its cabin lit. (0,0) is the
 * footprint centre.
 */
export function SignalBox({ s, tint, status = "ok", lit = false }: { s: number; tint: Tint; status?: StationStatus; lit?: boolean }) {
  const down = status === "down";
  const base: Shades = down ? ["#e9e5ec", "#dcd6e0", "#c9c2cf"] : ["#f3e3cf", "#e0c7a8", "#cfb08c"];
  const cabin: Shades = down ? ["#e9e5ec", "#dcd6e0", "#c9c2cf"] : ["#fffdf8", "#f3ebdc", "#e2d6c1"];
  const w = 1.0;
  const half = w / 2;
  const h1 = 0.9;
  const h2 = 0.7;
  const p = (x: number, y: number, z: number) => rel(s, x, y, z);
  const glassL = pts([p(-half + 0.1, half + 0.06, h1 + 0.14), p(half - 0.1, half + 0.06, h1 + 0.14), p(half - 0.1, half + 0.06, h1 + h2 - 0.1), p(-half + 0.1, half + 0.06, h1 + h2 - 0.1)]);
  const glassR = pts([p(half + 0.06, -half + 0.1, h1 + 0.14), p(half + 0.06, half - 0.1, h1 + 0.14), p(half + 0.06, half - 0.1, h1 + h2 - 0.1), p(half + 0.06, -half + 0.1, h1 + h2 - 0.1)]);
  const roofZ = h1 + h2;
  const o = 0.14;
  const apex = p(0, 0, roofZ + 0.42);
  const c = [p(-half - o, half + o, roofZ), p(half + o, half + o, roofZ), p(half + o, -half - o, roofZ), p(-half - o, -half - o, roofZ)];
  const roofFront = pts([c[0]!, c[1]!, apex]);
  const roofRight = pts([c[1]!, c[2]!, apex]);
  const roofBack = pts([c[3]!, c[0]!, apex]);
  const door = pts([p(-0.1, half, 0), p(0.2, half, 0), p(0.2, half, 0.5), p(-0.1, half, 0.5)]);
  const [, topY] = apex;
  const roofTint = down ? "#bdb6c4" : tint.body;
  const roofDeep = down ? "#a9a1b1" : tint.deep;
  return (
    <g className={`signal-box is-${status}`}>
      <IsoBox s={s} at={[-half, -half, 0]} size={[w, w, h1]} shades={base} />
      <polygon points={door} className="ink door" />
      <IsoBox s={s} at={[-half - 0.06, -half - 0.06, h1]} size={[w + 0.12, w + 0.12, h2]} shades={cabin} />
      <polygon points={glassL} className={`ink window ${lit && !down ? "is-lit" : ""}`} />
      <polygon points={glassR} className={`ink window ${lit && !down ? "is-lit" : ""}`} />
      <polygon points={roofBack} className="ink" style={{ fill: roofDeep }} />
      <polygon points={roofRight} className="ink" style={{ fill: roofDeep }} />
      <polygon points={roofFront} className="ink" style={{ fill: roofTint }} />
      {down && (
        <g transform={`translate(${s * 0.8} ${topY - 4})`}>
          <g className="pop">
            <circle r={11} className="badge-down" />
            <path d="M-4 -4l8 8m0 -8l-8 8" className="badge-x" />
          </g>
        </g>
      )}
    </g>
  );
}
