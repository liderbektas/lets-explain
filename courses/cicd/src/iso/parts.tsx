import type { ReactNode } from "react";
import type { Status, StepStatus } from "../engine/ci";
import "./ci-stage.css";
import { Bolt, METAL, OBox } from "./factory";

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

/**
 * A panel of the factory: a board with depth (its top and right side show, like the stations'
 * plates), screwed on at the corners, with an optional coloured name strip. Content is drawn
 * on its front, in the same box as before.
 */
export function Sticker({ x, y, w, h, head, headH = 32, fill = "var(--card)", lit, children }: { x: number; y: number; w: number; h: number; head?: string; headH?: number; fill?: string; lit?: boolean; children?: ReactNode }) {
  const d = Math.min(10, h / 6);
  const e = d / 2;
  return (
    <g className={lit ? "is-lit" : undefined}>
      <polygon points={`${x + 4},${y} ${x + w - 4},${y} ${x + w - 4 + d},${y - e} ${x + 4 + d},${y - e}`} className="sticker" style={{ fill: "#f1e8d6", strokeWidth: 1.8 }} />
      <polygon points={`${x + w},${y + 4} ${x + w + d},${y + 4 - e} ${x + w + d},${y + h - 4 - e} ${x + w},${y + h - 4}`} className="sticker" style={{ fill: "#ddd0b8", strokeWidth: 1.8 }} />
      <rect x={x} y={y} width={w} height={h} rx={6} style={{ fill }} className="sticker" />
      {head && (
        <>
          <path d={`M${x + 1} ${y + headH} V${y + 6} a5 5 0 0 1 5 -5 H${x + w - 6} a5 5 0 0 1 5 5 V${y + headH} Z`} style={{ fill: head }} />
          <line x1={x} x2={x + w} y1={y + headH} y2={y + headH} className="sticker" />
        </>
      )}
      {w >= 120 && h >= 60 && [
        [x + 7, y + h - 7],
        [x + w - 7, y + h - 7],
      ].map(([bx, by]) => <Bolt key={`${bx}-${by}`} x={bx!} y={by!} />)}
      {children}
    </g>
  );
}

/** Cut a string to `n` characters with an ellipsis. */
export const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

/** Width in px a mono string takes at `size`. */
export const monoWidth = (s: string, size: number) => s.length * size * 0.6;

/**
 * A console: a machine housing with a dark screen. The title sits on the housing above the
 * screen with three indicator lights; whatever is drawn from y + 44 down lands on the screen.
 */
export function Terminal({ box, title, children }: { box: Box; title: string; children?: ReactNode }) {
  return (
    <g>
      <OBox x={box.x} y={box.y} w={box.w} h={box.h} d={10} {...METAL} rx={6} />
      <rect x={box.x + 6} y={box.y + 28} width={box.w - 12} height={box.h - 34} rx={5} className="term" />
      {["#3fd07f", "#ffd66b", "#ff9f8a"].map((c, i) => (
        <circle key={c} cx={box.x + 16 + i * 13} cy={box.y + 14.5} r={4} style={{ fill: c, stroke: "var(--ink)", strokeWidth: 1.1 }} />
      ))}
      <text x={box.x + 60} y={box.y + 19} className="mono" style={{ fontSize: 11.5 }}>
        {cut(title, Math.floor((box.w - 74) / 6.9))}
      </text>
      {children}
    </g>
  );
}
