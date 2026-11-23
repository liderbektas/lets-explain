import { motion } from "motion/react";
import type { Replay } from "./replay";
import { appearAt } from "./replay";
import { TONE_FILL, type Tone } from "./runner";
import { StatusDot } from "./parts";

/**
 * The CI/CD course's factory pieces: boxes seen from the front with their depth going up-right,
 * crates (what a job makes and hands on), barriers, levers, the safe and the rocket. The
 * assembly line, the side panels and the lessons' own drawings are built from these.
 */

export const INK = { stroke: "var(--ink)", strokeWidth: 1.8, strokeLinejoin: "round" as const };
export const THIN = { stroke: "var(--ink)", strokeWidth: 1.3, strokeLinejoin: "round" as const };

/** Machine colours: housing front, top and side. */
export const METAL = { front: "#d9d3e2", top: "#ece8f1", side: "#b4abc2" };
/** Base plate colours. */
export const PLATE = { front: "#efe5d2", top: "var(--paper-2)", side: "#ddd0b8" };
/** Belt colours. */
export const BELT = { front: "#57535f", top: "#8b8694", side: "#45424d" };

/** A box seen from the front: its front face, a top that recedes up-right at 2:1 and its right side. */
export function OBox({ x, y, w, h, d, front, top, side, thin, rx }: { x: number; y: number; w: number; h: number; d: number; front: string; top: string; side: string; thin?: boolean; rx?: number }) {
  const e = d / 2;
  return (
    <g style={thin ? THIN : INK}>
      <polygon points={`${x},${y} ${x + w},${y} ${x + w + d},${y - e} ${x + d},${y - e}`} style={{ fill: top }} />
      <polygon points={`${x + w},${y} ${x + w + d},${y - e} ${x + w + d},${y + h - e} ${x + w},${y + h}`} style={{ fill: side }} />
      <rect x={x} y={y} width={w} height={h} rx={rx} style={{ fill: front }} />
    </g>
  );
}

/* ------------------------------------------------------------------ crates */

export const crateW = (label: string, size = 11) => Math.round(label.length * size * 0.62 + 16);

const SIDE: Record<Tone, string> = {
  code: "#f1dc95",
  node: "var(--mint-mid)",
  deps: "#cfc2f2",
  dist: "var(--sky-mid)",
  image: "#bfd4f6",
  cache: "#ddd0b8",
  bad: "#f5b7ae",
};

/**
 * A crate with its label on the front: something a step made (code, node_modules, dist/), an
 * artifact, a cache entry, an image. Drawn from its left edge, centred on y = 0.
 */
export function Crate({ label, tone, ghost, size = 11, w: fixed }: { label: string; tone: Tone; ghost?: boolean; size?: number; w?: number }) {
  const w = fixed ?? crateW(label, size);
  const h = size + 10;
  return (
    <g opacity={ghost ? 0.3 : 1}>
      <OBox x={0} y={-h / 2} w={w} h={h} d={8} front={TONE_FILL[tone]} top="#fffdf8" side={SIDE[tone]} thin />
      <line x1={3} x2={3} y1={-h / 2 + 3} y2={h / 2 - 3} style={{ stroke: "rgba(43,42,51,0.25)", strokeWidth: 1 }} />
      <line x1={w - 3} x2={w - 3} y1={-h / 2 + 3} y2={h / 2 - 3} style={{ stroke: "rgba(43,42,51,0.25)", strokeWidth: 1 }} />
      <text x={w / 2} y={size * 0.36} textAnchor="middle" className="mono" style={{ fontSize: size, fill: tone === "bad" ? "var(--red)" : undefined }}>
        {label}
      </text>
    </g>
  );
}

/* --------------------------------------------------------------- barrier */

/**
 * A barrier with a lamp: an arm across the way that rises when the way opens. (x, y) is the foot
 * of its post; the arm reaches left. `open` with `at` raises it at that screen time.
 */
export function Barrier({ x, y, open, at, play, k, lamp, len = 32, label }: { x: number; y: number; open: boolean; at?: number; play?: Replay | null; k?: string; lamp: "success" | "failure" | "waiting" | "queued" | "skipped"; len?: number; label?: string }) {
  const pivot = { x: x + 3, y: y - 34 };
  const arm = (
    <g>
      <rect x={pivot.x - len} y={pivot.y - 3.5} width={len} height={7} rx={2} style={{ fill: "#fffdf8", ...THIN }} />
      {Array.from({ length: Math.floor(len / 8) }, (_, v) => (
        <rect key={v} x={pivot.x - len + 1 + v * 8} y={pivot.y - 2.5} width={4} height={5} style={{ fill: "var(--coral)" }} />
      ))}
    </g>
  );
  return (
    <g>
      <OBox x={x - 3} y={y - 4} w={12} h={4} d={8} {...BELT} thin />
      <rect x={x} y={y - 42} width={6} height={40} style={{ fill: "#fffdf8", ...INK }} />
      {play && open ? (
        // Rotates about the arm's own right end (the pivot), measured on the arm itself so it
        // holds inside scaled groups too.
        <motion.g key={`${play.key}-${k ?? "arm"}`} style={{ transformBox: "fill-box", originX: 1, originY: 0.5 }} initial={{ rotate: 0 }} animate={{ rotate: 82 }} transition={{ delay: (at ?? 0) / 1000, duration: 0.35 }}>
          {arm}
        </motion.g>
      ) : (
        <g transform={open ? `rotate(82 ${pivot.x} ${pivot.y})` : undefined}>{arm}</g>
      )}
      {play ? (
        <>
          <StatusDot status="queued" x={pivot.x} y={y - 48} r={5.5} />
          <motion.g key={`${play.key}-${k ?? "arm"}-lamp`} {...appearAt(at ?? 0)}>
            <StatusDot status={lamp} x={pivot.x} y={y - 48} r={5.5} />
          </motion.g>
        </>
      ) : (
        <StatusDot status={lamp} x={pivot.x} y={y - 48} r={5.5} />
      )}
      {label && (
        <text x={pivot.x} y={y + 13} textAnchor="middle" className="mono" style={{ fontSize: 10.5 }}>
          {label}
        </text>
      )}
    </g>
  );
}

/** A switch lever on a small box: up is on, down is off. (x, y) is the box's top-left. */
export function Lever({ x, y, on, label, w = 22 }: { x: number; y: number; on: boolean; label?: string; w?: number }) {
  const cx = x + w / 2;
  return (
    <g>
      <OBox x={x} y={y} w={w} h={12} d={8} {...METAL} thin />
      <line x1={cx + 2} y1={y - 2} x2={cx + (on ? -5 : 9)} y2={y - 16} style={{ stroke: "var(--ink)", strokeWidth: 2.4, strokeLinecap: "round" }} />
      <circle cx={cx + (on ? -5 : 9)} cy={y - 17} r={4} style={{ fill: on ? "#3fd07f" : "#b9b2c2", ...THIN }} />
      {label && (
        <text x={cx + 4} y={y + 26} textAnchor="middle" className="mono" style={{ fontSize: 10.5 }}>
          {label}
        </text>
      )}
    </g>
  );
}

/** A small safe with a dial; open and empty when the runner got no secret. (x, y) is its top-left. */
export function Safe({ x, y, empty }: { x: number; y: number; empty?: boolean }) {
  return (
    <g>
      <OBox x={x} y={y} w={22} h={18} d={8} front="#8b8694" top="#b4abc2" side="#6d6976" />
      {empty ? (
        <>
          <rect x={x + 3} y={y + 3} width={16} height={12} style={{ fill: "#45424d" }} />
          <polygon points={`${x},${y} ${x - 9},${y + 4} ${x - 9},${y + 20} ${x},${y + 18}`} style={{ fill: "#8b8694", ...THIN }} />
        </>
      ) : (
        <>
          <circle cx={x + 11} cy={y + 9} r={4.5} style={{ fill: "#d9d3e2", ...THIN }} />
          <line x1={x + 11} y1={y + 9} x2={x + 11} y2={y + 5.5} style={{ stroke: "var(--ink)", strokeWidth: 1.3 }} />
        </>
      )}
    </g>
  );
}

/** A small rocket standing on its pad; it lifts off when its deploy step succeeded, and only then. */
export function Rocket({ x, play, at, launched, dim, base = 63 }: { x: number; play: Replay | null; at: number; launched: boolean; dim?: boolean; base?: number }) {
  const b = base - 63;
  const body = (
    <g opacity={dim ? 0.45 : 1} transform={b ? `translate(0 ${b})` : undefined}>
      <path d={`M${x - 9} 52 l-7 12 l7 -3z M${x + 9} 52 l7 12 l-7 -3z`} style={{ fill: "var(--coral-deep)", ...THIN }} />
      <path d={`M${x - 9} 63 V34 Q${x - 8} 22 ${x} 14 Q${x + 8} 22 ${x + 9} 34 V63 Q${x} 67 ${x - 9} 63z`} style={{ fill: "#fffdf8", ...INK }} />
      <path d={`M${x - 9} 34 Q${x - 8} 22 ${x} 14 Q${x + 8} 22 ${x + 9} 34 Q${x} 37 ${x - 9} 34z`} style={{ fill: "var(--coral)", ...THIN }} />
      <circle cx={x} cy={44} r={4} style={{ fill: "var(--sky)", ...THIN }} />
    </g>
  );
  const flame = <path d={`M${x - 5} ${65 + b} Q${x} ${82 + b} ${x + 5} ${65 + b}z`} style={{ fill: "var(--sun)", ...THIN }} />;
  if (!launched) return body;
  const up = -34;
  if (!play) {
    return (
      <g transform={`translate(0 ${up})`}>
        {flame}
        {body}
      </g>
    );
  }
  return (
    <motion.g key={`${play.key}-rocket-${x}`} initial={{ y: 0 }} animate={{ y: up }} transition={{ delay: at / 1000, duration: 0.6, ease: "easeIn" }}>
      <motion.g key={`${play.key}-flame-${x}`} {...appearAt(at, 0.1)}>
        {flame}
      </motion.g>
      {body}
    </motion.g>
  );
}

/** A screw head, for plates and panels. */
export const Bolt = ({ x, y }: { x: number; y: number }) => (
  <g>
    <circle cx={x} cy={y} r={2.6} style={{ fill: "#d9d3e2", stroke: "var(--ink)", strokeWidth: 1.1 }} />
    <line x1={x - 1.5} y1={y + 1.5} x2={x + 1.5} y2={y - 1.5} style={{ stroke: "var(--ink)", strokeWidth: 0.9 }} />
  </g>
);
