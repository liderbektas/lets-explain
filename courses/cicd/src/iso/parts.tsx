import type { ReactNode } from "react";
import type { Status, StepStatus } from "../engine/ci";
import "./ci-stage.css";

/** Small drawing pieces every CI/CD view shares. */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const STATUS_FILL: Record<Status | StepStatus | "expected" | "pending", string> = {
  success: "#3fd07f",
  failure: "var(--red)",
  cancelled: "#b9b2c2",
  skipped: "#e9e5ec",
  waiting: "var(--sun)",
  queued: "#fffdf8",
  pending: "var(--sun)",
  expected: "#fffdf8",
};

/** Soft card headers per status. */
export const STATUS_SOFT: Record<Status, string> = {
  success: "var(--mint-soft)",
  failure: "var(--red-soft)",
  cancelled: "#eeebf0",
  skipped: "#f5f2f6",
  waiting: "var(--sun-soft)",
  queued: "var(--paper-2)",
};

/** A status lamp: tick, cross, pause, slash. (x, y) is its centre. */
export function StatusDot({ status, x, y, r = 8 }: { status: Status | StepStatus | "expected" | "pending"; x: number; y: number; r?: number }) {
  const k = r / 8;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} className="dot" style={{ fill: STATUS_FILL[status] }} />
      {status === "success" && <path d={`M${-3.6 * k} ${0.2 * k} l${2.6 * k} ${2.6 * k} ${4.8 * k} ${-5 * k}`} className="check-mark" />}
      {status === "failure" && <path d={`M${-3 * k} ${-3 * k} l${6 * k} ${6 * k} m0 ${-6 * k} l${-6 * k} ${6 * k}`} className="check-mark" />}
      {(status === "waiting" || status === "pending") && <path d={`M${-2 * k} ${-3 * k} v${6 * k} M${2 * k} ${-3 * k} v${6 * k}`} className="check-mark" />}
      {(status === "cancelled" || status === "skipped") && <path d={`M${-3 * k} ${3 * k} L${3 * k} ${-3 * k}`} className="check-mark" />}
    </g>
  );
}

/** A sticker card: ink outline, offset shadow, optional coloured header band. */
export function Sticker({ x, y, w, h, head, headH = 32, fill = "var(--card)", lit, children }: { x: number; y: number; w: number; h: number; head?: string; headH?: number; fill?: string; lit?: boolean; children?: ReactNode }) {
  return (
    <g className={lit ? "is-lit" : undefined}>
      <rect x={x} y={y + 4} width={w} height={h} rx={14} className="sticker-shadow" />
      <rect x={x} y={y} width={w} height={h} rx={14} style={{ fill }} className="sticker" />
      {head && (
        <>
          <path d={`M${x + 1} ${y + headH} V${y + 14} a13 13 0 0 1 13 -13 H${x + w - 14} a13 13 0 0 1 13 13 V${y + headH} Z`} style={{ fill: head }} />
          <line x1={x} x2={x + w} y1={y + headH} y2={y + headH} className="sticker" />
        </>
      )}
      {children}
    </g>
  );
}

/** Cut a string to `n` characters with an ellipsis. */
export const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

/** Width in px a mono string takes at `size`. */
export const monoWidth = (s: string, size: number) => s.length * size * 0.6;

/** A terminal-style dark card with a title bar. */
export function Terminal({ box, title, children }: { box: Box; title: string; children?: ReactNode }) {
  return (
    <g>
      <rect x={box.x} y={box.y + 4} width={box.w} height={box.h} rx={14} className="sticker-shadow" />
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={14} className="term" />
      <path d={`M${box.x + 1} ${box.y + 30} V${box.y + 14} a13 13 0 0 1 13 -13 H${box.x + box.w - 14} a13 13 0 0 1 13 13 V${box.y + 30} Z`} className="term-bar" />
      {["#ff9f8a", "#ffd66b", "#8fe0b6"].map((c, i) => (
        <circle key={c} cx={box.x + 18 + i * 15} cy={box.y + 15} r={4.5} style={{ fill: c }} />
      ))}
      <text x={box.x + 70} y={box.y + 19.5} className="mono-dim" style={{ fontSize: 11.5 }}>
        {cut(title, Math.floor((box.w - 84) / 6.9))}
      </text>
      {children}
    </g>
  );
}
