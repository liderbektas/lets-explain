import { motion } from "motion/react";
import type { ReactNode } from "react";
import { boxFaces, pts, rel } from "@lets-explain/core/iso/geometry";

/* ------------------------------------------------------------------ colors */

export type Shades = [top: string, left: string, right: string];

export const PARCEL_SHADES: Record<string, Shades> = {
  order: ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"],
  cancel: ["var(--peach)", "var(--peach-mid)", "var(--peach-deep)"],
  payment: ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"],
  neutral: ["#efe7d8", "#ddd2bf", "#c9bba3"],
};

export interface Tint {
  body: string;
  deep: string;
  soft: string;
}

export const TINTS = {
  coral: { body: "var(--coral)", deep: "var(--coral-deep)", soft: "var(--coral-soft)" },
  lilac: { body: "var(--lilac)", deep: "var(--lilac-deep)", soft: "var(--lilac-soft)" },
  sun: { body: "var(--sun)", deep: "#d9a826", soft: "var(--sun-soft)" },
  sky: { body: "var(--sky)", deep: "var(--sky-deep)", soft: "var(--sky-soft)" },
  mint: { body: "var(--mint)", deep: "var(--mint-deep)", soft: "var(--mint-soft)" },
  grey: { body: "#d8d2dc", deep: "#9a94a2", soft: "#eeebf0" },
} satisfies Record<string, Tint>;

const spring = { type: "spring", stiffness: 190, damping: 24 } as const;

/* ------------------------------------------------------------------- boxes */

export function IsoBox({
  s,
  at = [0, 0, 0],
  size,
  shades,
  className,
}: {
  s: number;
  at?: [number, number, number];
  size: [number, number, number];
  shades: Shades;
  className?: string;
}) {
  const f = boxFaces(s, at[0], at[1], at[2], size[0], size[1], size[2]);
  return (
    <g className={`iso ${className ?? ""}`}>
      <polygon points={f.left} style={{ fill: shades[1] }} />
      <polygon points={f.right} style={{ fill: shades[2] }} />
      <polygon points={f.top} style={{ fill: shades[0] }} />
    </g>
  );
}

/* ----------------------------------------------------------------- parcels */

export type ParcelState = "normal" | "read" | "dup" | "dim";

/**
 * A record drawn as a small parcel with a strip of tape. The anchor (0,0) is the
 * centre of its footprint, so it sits wherever its parent translates it.
 */
export function Parcel({
  s,
  kind = "order",
  label,
  state = "normal",
  size = 0.78,
  readTint,
}: {
  s: number;
  kind?: keyof typeof PARCEL_SHADES;
  label?: string | number;
  state?: ParcelState;
  size?: number;
  readTint?: Tint;
}) {
  const h = size;
  const half = size / 2;
  const shades = PARCEL_SHADES[kind] ?? PARCEL_SHADES.order!;
  const [tx1, ty1] = rel(s, -half, 0, h);
  const [tx2, ty2] = rel(s, half, 0, h);
  const [, topY] = rel(s, 0, 0, h);
  return (
    <g className={`parcel is-${state}`}>
      <IsoBox s={s} at={[-half, -half, 0]} size={[size, size, h]} shades={shades} />
      <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} className="tape" />
      {label !== undefined && (
        <text x={0} y={topY + 4} textAnchor="middle" className="parcel-label">
          {label}
        </text>
      )}
      {state === "dup" && (
        <g transform={`translate(0 ${topY - s * 1.1})`}>
          <g className="pop">
            <rect x={-15} y={-11} width={30} height={20} rx={10} className="badge-dup" />
            <text y={4} textAnchor="middle" className="badge-dup-text">
              2×
            </text>
          </g>
        </g>
      )}
      {state === "read" && readTint && (
        <g transform={`translate(0 ${topY - s * 1.05})`}>
          <g className="pop">
            <circle r={9} style={{ fill: readTint.body }} className="ink" />
            <path d="M-4 0l3 3 5-6" className="check" />
          </g>
        </g>
      )}
    </g>
  );
}

/** Empty slot where the next record will land. */
export function GhostSlot({ s, size = 0.78 }: { s: number; size?: number }) {
  const half = size / 2;
  return (
    <polygon
      className="ghost-slot"
      points={pts([rel(s, -half, -half), rel(s, half, -half), rel(s, half, half), rel(s, -half, half)])}
    />
  );
}

/* -------------------------------------------------------------------- belt */

/** A conveyor belt along +x: the shape we use for a partition. */
export function Belt({ s, from, to, slot = 1.1 }: { s: number; from: number; to: number; slot?: number }) {
  const width = 1.25;
  const height = 0.32;
  const y = -width / 2;
  const faces = boxFaces(s, from, y, -height, to - from, width, height);
  const stripes: ReactNode[] = [];
  for (let x = from + slot / 2; x < to; x += slot) {
    const [x1, y1] = rel(s, x, y, 0);
    const [x2, y2] = rel(s, x, y + width, 0);
    stripes.push(<line key={x} x1={x1} y1={y1} x2={x2} y2={y2} className="belt-stripe" />);
  }
  const rollers: ReactNode[] = [];
  for (let x = from + 0.5; x < to - 0.2; x += 0.9) {
    const [cx, cy] = rel(s, x, y + width, -height / 2);
    rollers.push(<circle key={x} cx={cx} cy={cy} r={s * 0.13} className="belt-roller" />);
  }
  return (
    <g className="belt">
      <polygon points={faces.left} className="belt-side" />
      <polygon points={faces.right} className="belt-end" />
      <polygon points={faces.top} className="belt-top" />
      {stripes}
      {rollers}
    </g>
  );
}

/* ------------------------------------------------------------------ people */

export type PersonState = "idle" | "busy" | "crashed" | "happy" | "hop";

/** A small round character. (0,0) is where the feet touch the ground. */
export function Person({
  tint,
  state = "idle",
  carrying,
  scale = 1,
}: {
  tint: Tint;
  state?: PersonState;
  carrying?: ReactNode;
  scale?: number;
}) {
  const crashed = state === "crashed";
  const body = crashed ? TINTS.grey.body : tint.body;
  const cap = crashed ? TINTS.grey.deep : tint.deep;
  return (
    <g transform={`scale(${scale})`}>
      <ellipse cx={0} cy={0} rx={17} ry={5} className="ground-shadow" />
      <g className={`person is-${state}`}>
        <g transform={crashed ? "rotate(-9)" : undefined}>
          <rect x={-14} y={-34} width={28} height={34} rx={12} style={{ fill: body }} className="ink" />
          <circle cx={0} cy={-47} r={14} className="ink skin" />
          <path d="M-14 -49 A14 14 0 0 1 14 -49 Z" style={{ fill: cap }} className="ink" />
          {crashed ? (
            <g className="face">
              <path d="M-7.5 -46.5l4 4m0 -4l-4 4M3.5 -46.5l4 4m0 -4l-4 4" />
              <path d="M-4 -37 q2 -2 4 0 q2 2 4 0" />
            </g>
          ) : state === "happy" ? (
            <g className="face">
              <path d="M-7.5 -43 q2.5 -3 5 0M2.5 -43 q2.5 -3 5 0" />
              <path d="M-4.5 -39 Q0 -34.5 4.5 -39" />
            </g>
          ) : (
            <g className="face">
              <circle cx={-5} cy={-44} r={1.9} className="eye" />
              <circle cx={5} cy={-44} r={1.9} className="eye" />
              <path d="M-3.8 -38.5 Q0 -35.5 3.8 -38.5" />
            </g>
          )}
          {!crashed && (
            <>
              <ellipse cx={-9.5} cy={-40} rx={2.8} ry={1.8} className="cheek" />
              <ellipse cx={9.5} cy={-40} rx={2.8} ry={1.8} className="cheek" />
            </>
          )}
          {carrying && <g transform="translate(0 -16)">{carrying}</g>}
        </g>
        {state === "busy" && <path d="M16 -60 q3 5 0 7 q-3 -2 0 -7z" className="sweat" />}
        {crashed && <DizzyStars y={-70} />}
      </g>
    </g>
  );
}

function DizzyStars({ y }: { y: number }) {
  const star = "M0 -5 L1.4 -1.5 L5 -1.2 L2.2 1 L3 4.6 L0 2.6 L-3 4.6 L-2.2 1 L-5 -1.2 L-1.4 -1.5 Z";
  return (
    <g transform={`translate(0 ${y})`}>
      <g className="dizzy">
        <path d={star} transform="translate(-12 0)" className="star" />
        <path d={star} transform="translate(12 0)" className="star" />
        <path d={star} transform="translate(0 -6) scale(0.8)" className="star" />
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------- flags */

/** A reader's bookmark: planted at the offset it will read next. (0,0) is the pole's foot. */
export function Flag({ tint, label, height = 62, muted }: { tint: Tint; label: string | number; height?: number; muted?: boolean }) {
  return (
    <g className={`flag ${muted ? "is-muted" : ""}`}>
      <line x1={0} y1={0} x2={0} y2={-height} className="flag-pole" />
      <path
        d={`M0 ${-height} h34 l-6 8 l6 8 h-34 z`}
        style={{ fill: muted ? TINTS.grey.body : tint.body }}
        className="ink"
      />
      <text x={14} y={-height + 12.5} textAnchor="middle" className="flag-label">
        {label}
      </text>
      <circle cx={0} cy={0} r={2.5} className="flag-foot" />
    </g>
  );
}

/** Commit seal: a stamped circle with the committed offset. */
export function CommitSeal({ tint, label }: { tint: Tint; label: string | number }) {
  return (
    <g className="seal">
      <circle r={12} style={{ fill: tint.soft, stroke: tint.deep }} className="seal-ring" />
      <circle r={8.5} style={{ stroke: tint.deep }} className="seal-inner" />
      <text y={4} textAnchor="middle" className="seal-label" style={{ fill: tint.deep }}>
        {label}
      </text>
    </g>
  );
}

/* --------------------------------------------------------------- buildings */

export type BuildingStatus = "ok" | "down" | "busy";

/** A little service building. (0,0) is the centre of its footprint. */
export function Building({
  s,
  roof,
  status = "ok",
  w = 1.5,
  h = 1.05,
}: {
  s: number;
  roof: Tint;
  status?: BuildingStatus;
  w?: number;
  h?: number;
}) {
  const half = w / 2;
  const down = status === "down";
  const walls: Shades = down ? ["#e9e5ec", "#dcd6e0", "#c9c2cf"] : ["#fffdf8", "#f3ebdc", "#e2d6c1"];
  const roofShades: Shades = down ? ["#d8d2dc", "#bdb6c4", "#a9a1b1"] : [roof.body, roof.deep, roof.deep];
  const [dx1, dy1] = rel(s, -0.15, half, 0);
  const door = pts([
    [dx1, dy1],
    rel(s, 0.25, half, 0),
    rel(s, 0.25, half, 0.5),
    rel(s, -0.15, half, 0.5),
  ]);
  const win = pts([rel(s, half, -0.3, 0.45), rel(s, half, 0.15, 0.45), rel(s, half, 0.15, 0.8), rel(s, half, -0.3, 0.8)]);
  const [, roofTop] = rel(s, 0, 0, h + 0.28);
  return (
    <g className={`building is-${status}`}>
      <IsoBox s={s} at={[-half, -half, 0]} size={[w, w, h]} shades={walls} />
      <polygon points={door} className="ink door" />
      <polygon points={win} className="ink window" />
      <IsoBox s={s} at={[-half - 0.1, -half - 0.1, h]} size={[w + 0.2, w + 0.2, 0.28]} shades={roofShades} />
      {down && (
        <g transform={`translate(${s * 0.9} ${roofTop - 8})`}>
          <g className="pop">
            <circle r={11} className="badge-down" />
            <path d="M-4 -4l8 8m0 -8l-8 8" className="badge-x" />
          </g>
        </g>
      )}
      {down && (
        <g transform={`translate(0 ${roofTop - 6})`}>
          <circle r={5} cx={-6} className="smoke smoke-1" />
          <circle r={4} cx={4} className="smoke smoke-2" />
        </g>
      )}
      {status === "busy" && <path d={`M${s * 0.9} ${roofTop - 14} q4 6 0 9 q-4 -3 0 -9z`} className="sweat" />}
    </g>
  );
}

/** Retention shredder: old records fall in here. (0,0) is its footprint centre. */
export function Shredder({ s }: { s: number }) {
  const size = 1.1;
  const half = size / 2;
  const h = 0.95;
  const [sx1, sy1] = rel(s, -0.3, -0.05, h);
  const [sx2, sy2] = rel(s, 0.3, -0.05, h);
  return (
    <g className="shredder">
      <IsoBox s={s} at={[-half, -half, 0]} size={[size, size, h]} shades={["#8d8796", "#6e6878", "#5b5664"]} />
      <line x1={sx1} y1={sy1} x2={sx2} y2={sy2} className="shredder-slot" />
      <path
        d={`M${rel(s, -half, half, 0.25)[0]} ${rel(s, -half, half, 0.25)[1]} l6 4 l6 -1 l6 4 l6 -1 l6 4`}
        className="shredder-teeth"
      />
    </g>
  );
}

/* ------------------------------------------------------------------ labels */

export type PillTone = "plain" | "danger" | "warn" | "ok" | "sun" | "ink";

/** A sticker label inside a diagram. (x, y) is its centre. */
export function Pill({
  x,
  y,
  text,
  tone = "plain",
  size = 12,
  animate = true,
}: {
  x: number;
  y: number;
  text: string;
  tone?: PillTone;
  size?: number;
  animate?: boolean;
}) {
  const w = Math.round(text.length * size * 0.58 + 22);
  const h = size + 12;
  const inner = (
    <>
      <rect x={-w / 2} y={-h / 2 + 3} width={w} height={h} rx={h / 2} className="pill-shadow" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} className={`pill pill-${tone}`} />
      <text y={size * 0.36} textAnchor="middle" className={`pill-text pill-text-${tone}`} style={{ fontSize: size }}>
        {text}
      </text>
    </>
  );
  if (!animate) return <g transform={`translate(${x} ${y})`}>{inner}</g>;
  return (
    <motion.g
      initial={{ opacity: 0, x, y: y + 6 }}
      animate={{ opacity: 1, x, y }}
      exit={{ opacity: 0 }}
      transition={spring}
    >
      {inner}
    </motion.g>
  );
}

/** Moves a child to screen coordinates with a spring, fading in from `from` if given. */
export function Place({
  x,
  y,
  from,
  children,
  exitTo,
}: {
  x: number;
  y: number;
  from?: [number, number];
  exitTo?: [number, number];
  children: ReactNode;
}) {
  return (
    <motion.g
      initial={from ? { x: from[0], y: from[1], opacity: 0 } : { x, y, opacity: 0 }}
      animate={{ x, y, opacity: 1 }}
      exit={exitTo ? { x: exitTo[0], y: exitTo[1], opacity: 0 } : { opacity: 0 }}
      transition={spring}
    >
      {children}
    </motion.g>
  );
}
