import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { Shades } from "@lets-explain/core/iso/shapes";
import type { Fate, Pt } from "./choreography";

/**
 * The pieces of the post room the RabbitMQ course is drawn as (see MailroomStage): letters,
 * mailboxes, the sorting machine, the clerk's desk, chutes, signs and stamps. Everything here
 * is a plain drawing; what moves and when is decided by the stage from the broker's events.
 */

export type Kind = "order" | "cancel" | "payment" | "neutral";

/* ------------------------------------------------------------------ iso helpers */

export type V3 = [number, number, number];
export type Proj = (x: number, y: number, z?: number) => Pt;
export const iso =
  (s: number): Proj =>
  (x, y, z = 0) => [(x - y) * s, ((x + y) * s) / 2 - z * s];
export const ptsOf = (P: Proj, list: V3[]) => list.map(([x, y, z]) => P(x, y, z).map((n) => n.toFixed(1)).join(",")).join(" ");
/** Text and flat shapes lying on a face that runs along iso x (the near +y face). */
export const ON_FACE = "matrix(1 0.5 0 1 0 0)";

/** An iso box: top, near-left (+y) and near-right (+x) faces. */
export function Prism({ P, at, size, shades, className = "k" }: { P: Proj; at: V3; size: V3; shades: Shades; className?: string }) {
  const [x, y, z] = at;
  const [w, d, h] = size;
  return (
    <g className={className}>
      <polygon points={ptsOf(P, [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} style={{ fill: shades[0] }} />
      <polygon points={ptsOf(P, [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} style={{ fill: shades[1] }} />
      <polygon points={ptsOf(P, [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} style={{ fill: shades[2] }} />
    </g>
  );
}

/* ------------------------------------------------------------------ colours */

export const WOOD: Shades = ["#d9c9a0", "#c4b083", "#ab966a"];
export const STEEL: Shades = ["#e4dfe8", "#c3bccb", "#8f8899"];
export const CARDBOARD: Shades = ["#e8cc9c", "#d4b27c", "#bb945c"];
export const RETURNED: Shades = ["#ff8f86", "var(--red)", "#d4473f"];
export const GREYED: Shades = ["#e2dde6", "#cfc8d6", "#b9b2c2"];
export const ENV_FILL: Record<Kind, string> = { order: "var(--mint)", cancel: "var(--peach)", payment: "var(--sky)", neutral: "#efe7d8" };

/* ------------------------------------------------------------------ letters */

export interface LetterMarks {
  /** Which delivery this is when it was handed back before (2 = second time): a red postmark. */
  again?: number;
  /** Ticks left before its TTL runs out: a small timer. */
  ttl?: number;
  /** Persistent message (written to disk): a wax seal on the flap. */
  seal?: boolean;
  /** Transient message drawn as a loose paper note instead of a sealed envelope. */
  note?: boolean;
  /** The correlation id it carries (RPC). */
  corr?: string;
}

/** A letter: kind colour, flap and short label, with optional marks. Centred on (0, 0). */
export function Envelope({ kind, label, w = 24, again, ttl, seal, note, corr }: { kind: Kind; label?: string; w?: number } & LetterMarks) {
  const h = w * 0.7;
  return (
    <g className="mr-env">
      {note ? (
        <>
          <path d={`M${-w / 2} ${-h / 2} H${w / 2 - 6} L${w / 2} ${-h / 2 + 6} V${h / 2} H${-w / 2} Z`} style={{ fill: ENV_FILL[kind] }} className="mr-note" />
          <path d={`M${w / 2 - 6} ${-h / 2} V${-h / 2 + 6} H${w / 2}`} className="mr-flap" />
          <path d={`M${-w / 2 + 3} ${-h / 2 + 5} H${w / 2 - 8}`} className="mr-rule" />
        </>
      ) : (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2.5} style={{ fill: ENV_FILL[kind] }} />
          <path d={`M${-w / 2 + 1.5} ${-h / 2 + 1.5} L0 ${-h / 2 + h * 0.38} L${w / 2 - 1.5} ${-h / 2 + 1.5}`} className="mr-flap" />
        </>
      )}
      {seal && !note && <circle cy={-h / 2 + h * 0.38} r={Math.max(2.6, w * 0.11)} className="mr-seal" />}
      {label && (
        <text y={h / 2 - h * 0.14} textAnchor="middle" className="mr-env-label" style={{ fontSize: w * 0.42 }}>
          {label}
        </text>
      )}
      {again !== undefined && again > 1 && <Postmark x={w / 2 - 1} y={-h / 2 - 1} r={Math.max(7.5, w * 0.3)} text={`${again}×`} />}
      {ttl !== undefined && <Timer x={-w / 2 - 1} y={-h / 2 - 2} r={Math.max(6, w * 0.22)} left={ttl} />}
      {corr && (
        <g transform={`translate(0 ${h / 2 + 7})`}>
          <rect x={-corr.length * 3.4 - 5} y={-6} width={corr.length * 6.8 + 10} height={12} rx={6} className="mr-corr" />
          <text y={3.6} textAnchor="middle" className="mr-corr-text">
            {corr}
          </text>
        </g>
      )}
    </g>
  );
}

/** A round red postmark: "this letter has been delivered n times". */
export function Postmark({ x, y, r, text }: { x: number; y: number; r: number; text: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-12)`} className="mr-postmark">
      <circle r={r} />
      <circle r={r - 2.4} className="mr-postmark-ring" />
      <text y={r * 0.36} textAnchor="middle" style={{ fontSize: r * 0.95 }}>
        {text}
      </text>
    </g>
  );
}

/** A small clock with the ticks a letter has left before it expires. */
function Timer({ x, y, r, left }: { x: number; y: number; r: number; left: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className="mr-timer">
      <circle r={r} />
      <path d={`M0 0 V${-r * 0.6} M0 0 L${r * 0.45} ${r * 0.2}`} className="mr-timer-hand" />
      <g transform={`translate(${-r - 7} 0)`}>
        <rect x={-7} y={-6.5} width={14} height={13} rx={6.5} className="mr-timer-pill" />
        <text y={4} textAnchor="middle">
          {Math.max(0, left)}
        </text>
      </g>
    </g>
  );
}

/** The clerk's "done" stamp, pressed on a letter as it is acked. */
export function AckStamp() {
  return (
    <g transform="rotate(-14)" className="mr-ack">
      <circle r={11} />
      <path d="M-5 0.5 L-1.5 4 L5.5 -4" />
    </g>
  );
}

/** The broker's answer to a publisher using confirms: a receipt slip, ack or nack. */
export function Receipt({ ok }: { ok: boolean }) {
  const w = 34;
  const h = 26;
  // A torn bottom edge, right to left.
  const torn = Array.from({ length: 10 }, (_, i) => `L${(w / 2 - ((i + 1) * w) / 10).toFixed(1)} ${i % 2 === 0 ? h / 2 - 3 : h / 2}`).join(" ");
  return (
    <g className="mr-receipt">
      <path d={`M${-w / 2} ${-h / 2} H${w / 2} V${h / 2} ${torn} Z`} />
      <text y={-2} textAnchor="middle" className={ok ? "is-ok" : "is-bad"}>
        {ok ? "ack" : "nack"}
      </text>
      <path d={ok ? "M-5 6 L-1.5 9.5 L5 3" : "M-4 3.5 L4 10 M4 3.5 L-4 10"} className={ok ? "mr-receipt-ok" : "mr-receipt-bad"} />
    </g>
  );
}

/* ------------------------------------------------------------------ queue: mailbox */

/** The mailbox, in iso units: length along x, depth, post height, wall height. */
export const MB = { s: 23, L: 6.6, d: 1.6, z0: 2.2, h: 1.45 };
export const SLOTS = 6;
export const SLOT_STEP = (MB.L - 1.9) / (SLOTS - 1);

export type MailboxLook = "paint" | "cardboard" | "returned";

/** A curbside mailbox on a post, lying along x: door at the +x end, a window down its near side. */
export function Mailbox({
  s,
  shades,
  look = "paint",
  flagUp,
  flagAt,
  capacity,
  slotAt,
  children,
}: {
  s: number;
  shades: Shades;
  look?: MailboxLook;
  flagUp: boolean;
  flagAt: number;
  /** A max-length queue: only this many places in the window. */
  capacity?: number;
  slotAt?: (i: number) => Pt;
  children?: ReactNode;
}) {
  const P = iso(s);
  const { L, d, z0, h } = MB;
  const r = d / 2;
  const x0 = -L / 2;
  const x1 = L / 2;
  const zt = z0 + h;
  const N = 14;
  const arcAt = (t: number): [number, number] => [r * Math.cos(t), zt + r * Math.sin(t)];
  const strips = Array.from({ length: N }, (_, j) => {
    const i = N - j;
    const [ya, za] = arcAt((Math.PI * i) / N);
    const [yb, zb] = arcAt((Math.PI * (i - 1)) / N);
    return ptsOf(P, [[x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb]]);
  });
  const arc = (x: number) => Array.from({ length: N + 1 }, (_, i) => P(x, ...arcAt((Math.PI * i) / N)));
  const nearArc = arc(x1);
  const farArc = arc(x0);
  const topIdx = (a: Pt[]) => a.reduce((m, p, i) => (p[1] < a[m]![1] ? i : m), 0);
  const ti = topIdx(farArc);
  const tj = topIdx(nearArc);
  const door = [P(x1, r, z0), ...nearArc, P(x1, -r, z0)];
  const backRim = farArc.slice(0, ti + 1);
  const flagBase = P(x1 - 1.5, -r, zt + 0.1);
  const fs = s / MB.s;
  const [hx, hy] = P(x1, 0, z0 + h * 0.55);
  const [dx, dy] = P(x1, 0.05, z0 + h * 0.62);
  const cap = capacity !== undefined && slotAt ? Math.min(capacity, SLOTS) : 0;
  return (
    <g className={`mr-mailbox is-${look}`}>
      <polygon points={ptsOf(P, [[x0 + 0.6, -r - 0.1, 0], [x1 + 0.4, -r - 0.1, 0], [x1 + 0.4, r + 0.3, 0], [x0 + 0.6, r + 0.3, 0]])} className="ground-shadow" />
      <Prism P={P} at={[-0.14, -0.14, 0]} size={[0.28, 0.28, z0]} shades={look === "cardboard" ? CARDBOARD : WOOD} />
      {/* The flag on the far side: raised while letters wait inside. */}
      {flagUp ? (
        <motion.g className="k" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.2, delay: flagAt }} style={{ originY: 1, transformBox: "fill-box" }}>
          <line x1={flagBase[0]} y1={flagBase[1]} x2={flagBase[0]} y2={flagBase[1] - 34 * fs} />
          <path d={`M${flagBase[0]} ${flagBase[1] - 34 * fs} h${14 * fs} v${10 * fs} h${-14 * fs}z`} style={{ fill: look === "returned" ? "var(--sun)" : "var(--red)" }} />
        </motion.g>
      ) : (
        <polygon className="k" points={ptsOf(P, [[x1 - 2.9, -r, zt + 0.05], [x1 - 1.5, -r, zt + 0.05], [x1 - 1.5, -r, zt + 0.4], [x1 - 2.9, -r, zt + 0.4]])} style={{ fill: look === "returned" ? "var(--sun)" : "var(--red)" }} />
      )}
      {strips.map((p, i) => (
        <polygon key={i} points={p} style={{ fill: shades[0], stroke: shades[0], strokeWidth: 0.6 }} />
      ))}
      <g className="k-line">
        <line x1={farArc[ti]![0]} y1={farArc[ti]![1]} x2={nearArc[tj]![0]} y2={nearArc[tj]![1]} />
        <polyline points={backRim.map((p) => p.join(",")).join(" ")} />
      </g>
      {look === "cardboard" && <line className="mr-tape" x1={farArc[ti]![0]} y1={farArc[ti]![1]} x2={nearArc[tj]![0]} y2={nearArc[tj]![1]} />}
      <polygon className="k" points={ptsOf(P, [[x0, r, z0], [x1, r, z0], [x1, r, zt], [x0, r, zt]])} style={{ fill: shades[1] }} />
      {/* The window: the line of waiting letters, head on the right next to the door. */}
      <polygon className="k mr-window" points={ptsOf(P, [[x0 + 0.35, r, z0 + 0.14], [x1 - 0.35, r, z0 + 0.14], [x1 - 0.35, r, zt - 0.08], [x0 + 0.35, r, zt - 0.08]])} />
      {cap > 0 && (
        <g className="mr-capacity">
          {/* Places beyond the limit are boarded up. */}
          <polygon points={ptsOf(P, [[x0 + 0.35, r, z0 + 0.14], [x1 - 0.95 - (cap - 0.5) * SLOT_STEP, r, z0 + 0.14], [x1 - 0.95 - (cap - 0.5) * SLOT_STEP, r, zt - 0.08], [x0 + 0.35, r, zt - 0.08]])} className="mr-boarded" />
          {[0.38, 0.62].map((f) => {
            const z = z0 + 0.14 + (h - 0.22) * f;
            const [ax, ay] = P(x0 + 0.35, r, z);
            const [bx, by] = P(x1 - 0.95 - (cap - 0.5) * SLOT_STEP, r, z);
            return <line key={f} x1={ax} y1={ay} x2={bx} y2={by} className="mr-plank" />;
          })}
          {Array.from({ length: cap }, (_, i) => {
            const [cx, cy] = slotAt!(i);
            const w = SLOT_STEP * s * 0.86;
            const hh = h * s * 0.62;
            return <rect key={i} transform={`translate(${cx} ${cy}) ${ON_FACE}`} x={-w / 2} y={-hh / 2} width={w} height={hh} rx={2} className="mr-place" />;
          })}
        </g>
      )}
      <path className="k" d={`M${door.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join(" L")}Z`} style={{ fill: shades[2] }} />
      {look === "returned" ? (
        <path className="mr-return-glyph" transform={`translate(${dx} ${dy}) scale(${fs})`} d="M5 3 C5 -3 -1 -4 -5 -1 M-5 -1 L-5 -6 M-5 -1 L0 -1" />
      ) : (
        <circle cx={hx} cy={hy} r={2.6 * fs} className="k" style={{ fill: "var(--card)" }} />
      )}
      {children}
    </g>
  );
}

/* ------------------------------------------------------------------ queue: stream ledger */

/** The stream: a pigeonhole cabinet, in iso units. Letters stay in their hole after reading. */
export const LG = { L: 6.6, d: 1.3, z0: 0.95, h: 2.15 };
export const LEDGER_STEP = (LG.L - 1.3) / (SLOTS - 1);

export function Ledger({ s, shades, count, children }: { s: number; shades: Shades; count: number; children?: ReactNode }) {
  const P = iso(s);
  const { L, d, z0, h } = LG;
  const x0 = -L / 2;
  const legs: V3[] = [[x0 + 0.15, 0.1, 0], [L / 2 - 0.45, 0.1, 0], [x0 + 0.15, d - 0.4, 0], [L / 2 - 0.45, d - 0.4, 0]];
  return (
    <g className="mr-ledger">
      <polygon points={ptsOf(P, [[x0 + 0.3, 0, 0], [L / 2 + 0.3, 0, 0], [L / 2 + 0.3, d + 0.3, 0], [x0 + 0.3, d + 0.3, 0]])} className="ground-shadow" />
      {legs.map((at, i) => (
        <Prism key={i} P={P} at={at} size={[0.3, 0.3, z0]} shades={WOOD} />
      ))}
      <Prism P={P} at={[x0, 0, z0]} size={[L, d, h]} shades={shades} />
      {Array.from({ length: SLOTS }, (_, i) => {
        const cx = x0 + 0.65 + i * LEDGER_STEP;
        const half = LEDGER_STEP * 0.44;
        const [nx, ny] = P(cx, d, z0 + 0.1);
        return (
          <g key={i}>
            <polygon className="k mr-hole" points={ptsOf(P, [[cx - half, d, z0 + 0.5], [cx + half, d, z0 + 0.5], [cx + half, d, z0 + h - 0.16], [cx - half, d, z0 + h - 0.16]])} />
            <text transform={`translate(${nx.toFixed(1)} ${ny.toFixed(1)}) ${ON_FACE}`} textAnchor="middle" className={`mr-offset ${i < count ? "" : "is-empty"}`} style={{ fontSize: Math.max(8, 0.42 * s) }}>
              {i}
            </text>
          </g>
        );
      })}
      {children}
    </g>
  );
}

/* ------------------------------------------------------------------ exchange: sorting machine */

/** The sorting machine body, in iso units. */
export const MX = { s: 29, w: 2.6, d: 2.4, h: 2.2, hop: 0.8 };

/** The exchange: a sorting machine with a hopper on top and one slot per binding on its right face. */
export function Machine({ s, shades, name, slots }: { s: number; shades: Shades; name: string; slots: number[] }) {
  const P = iso(s);
  const { w, d, h, hop } = MX;
  const x0 = -w / 2;
  const y0 = -d / 2;
  const x1 = w / 2;
  const y1 = d / 2;
  const zb = 0.28;
  const ht = h + hop;
  const hi = 0.55;
  const hole: V3[] = [[x0 + hi, y0 + hi, h], [x1 - hi, y0 + hi, h], [x1 - hi, y1 - hi, h], [x0 + hi, y1 - hi, h]];
  const rim: V3[] = [[x0 + 0.08, y0 + 0.08, ht], [x1 - 0.08, y0 + 0.08, ht], [x1 - 0.08, y1 - 0.08, ht], [x0 + 0.08, y1 - 0.08, ht]];
  const [lx, ly] = P(0, y1, 1.15);
  // The name fits the plate: its length along the face is (w - 0.6) * s across the screen.
  const fontSize = Math.min(15 * (s / MX.s), ((w - 0.8) * s) / (Math.max(name.length, 3) * 0.6));
  return (
    <g className="mr-machine">
      <polygon points={ptsOf(P, [[x0 - 0.1, y0 + 0.3, 0], [x1 + 0.7, y0 + 0.3, 0], [x1 + 0.7, y1 + 0.5, 0], [x0 - 0.1, y1 + 0.5, 0]])} className="ground-shadow" />
      <Prism P={P} at={[x0 - 0.08, y0 - 0.08, 0]} size={[w + 0.16, d + 0.16, zb]} shades={["var(--ink-2)", "var(--ink-2)", "var(--ink)"]} />
      <Prism P={P} at={[x0, y0, zb]} size={[w, d, h - zb]} shades={shades} />
      {/* A trim band round the top of the body. */}
      <polygon className="k" points={ptsOf(P, [[x0, y1, h - 0.3], [x1, y1, h - 0.3], [x1, y1, h], [x0, y1, h]])} style={{ fill: shades[2] }} />
      <polygon className="k" points={ptsOf(P, [[x1, y0, h - 0.3], [x1, y1, h - 0.3], [x1, y1, h], [x1, y0, h]])} style={{ fill: shades[2] }} />
      {/* Hopper: the rim, the throat, then the two inner walls we can see. */}
      <polygon className="k" points={ptsOf(P, rim)} style={{ fill: STEEL[2] }} />
      <polygon className="k" points={ptsOf(P, hole)} style={{ fill: "var(--ink)" }} />
      <polygon className="k" points={ptsOf(P, [hole[3]!, hole[2]!, rim[2]!, rim[3]!])} style={{ fill: STEEL[0] }} />
      <polygon className="k" points={ptsOf(P, [hole[1]!, hole[2]!, rim[2]!, rim[1]!])} style={{ fill: STEEL[1] }} />
      {/* Name plate on the front. */}
      <polygon className="k" points={ptsOf(P, [[x0 + 0.3, y1, 0.8], [x1 - 0.3, y1, 0.8], [x1 - 0.3, y1, 1.55], [x0 + 0.3, y1, 1.55]])} style={{ fill: "var(--card)" }} />
      <text transform={`matrix(1 0.5 0 1 ${lx.toFixed(1)} ${(ly + fontSize * 0.36).toFixed(1)})`} textAnchor="middle" className="mr-plate" style={{ fontSize }}>
        {name}
      </text>
      {/* Reject flap: where a letter with no matching binding falls out. */}
      <polygon className="k" points={ptsOf(P, [[-1.15, y1, 0.38], [-0.35, y1, 0.38], [-0.35, y1, 0.62], [-1.15, y1, 0.62]])} style={{ fill: "var(--ink)" }} />
      {/* One slot per binding, each feeding its chute. */}
      {slots.map((yy, i) => (
        <polygon key={i} className="k" points={ptsOf(P, [[x1, yy - 0.3, 0.86], [x1, yy + 0.3, 0.86], [x1, yy + 0.3, 1.26], [x1, yy - 0.3, 1.26]])} style={{ fill: "var(--ink)" }} />
      ))}
    </g>
  );
}

/** Where unroutable letters end up: a waste bin with one crumpled ball per lost letter (up to five). */
export function WasteBin({ s, at, lost, before, landsAt }: { s: number; at: Pt; lost: number; before: number; landsAt: number }) {
  const k = s / MX.s;
  const rx = 17 * k;
  const ry = 7 * k;
  const hh = 30 * k;
  const [cx, cy] = at;
  const balls = Math.min(lost, 5);
  return (
    <g className="mr-bin">
      <ellipse cx={cx} cy={cy + 2} rx={rx + 4} ry={ry + 2} className="ground-shadow" />
      <path className="k" d={`M${cx - rx} ${cy - hh} L${cx - rx * 0.8} ${cy} A${rx * 0.8} ${ry * 0.8} 0 0 0 ${cx + rx * 0.8} ${cy} L${cx + rx} ${cy - hh} Z`} style={{ fill: "#cfc8d6" }} />
      {[-0.45, 0, 0.45].map((f) => (
        <line key={f} x1={cx + rx * f} y1={cy - hh + ry} x2={cx + rx * f * 0.8} y2={cy + ry * 0.7} className="k-thin" />
      ))}
      <ellipse cx={cx} cy={cy - hh} rx={rx} ry={ry} className="k" style={{ fill: "var(--ink-2)" }} />
      {Array.from({ length: balls }, (_, i) => (
        <motion.circle
          key={i}
          cx={cx - rx * 0.5 + (i % 3) * rx * 0.5}
          cy={cy - hh - 1 - Math.floor(i / 3) * 5 * k}
          r={4.6 * k}
          className="k"
          style={{ fill: "var(--card)" }}
          initial={i >= before ? { scale: 0 } : false}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2, delay: i >= before ? landsAt : 0 }}
        />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ people's furniture */

/** The app's laptop on a small desk in front of the producer. */
export function Laptop() {
  const P = iso(15);
  return (
    <g transform="translate(26 10)">
      <Prism P={P} at={[-0.9, -0.7, 0]} size={[1.8, 1.4, 1.3]} shades={WOOD} />
      <Prism P={P} at={[-0.65, -0.5, 1.3]} size={[1.3, 1.0, 0.08]} shades={STEEL} />
      <polygon className="k" points={ptsOf(P, [[-0.65, -0.5, 1.38], [0.65, -0.5, 1.38], [0.65, -0.5, 2.3], [-0.65, -0.5, 2.3]])} style={{ fill: "var(--ink-2)" }} />
      <polygon points={ptsOf(P, [[-0.5, -0.5, 1.55], [0.5, -0.5, 1.55], [0.5, -0.5, 2.15], [-0.5, -0.5, 2.15]])} style={{ fill: "var(--sky)" }} />
    </g>
  );
}

/** A letter's place on the clerk's desk tray: two columns, two rows. */
export const handAt = (k: number): Pt => [-39 + (Math.min(k, 3) % 2) * 22, -13 - Math.floor(Math.min(k, 3) / 2) * 11];

/** The clerk's desk. With a prefetch limit, the tray on top has exactly that many places (up to four). */
export function Desk({ places }: { places: number }) {
  const P = iso(17);
  return (
    <g>
      <g transform="translate(-28 14)">
        <Prism P={P} at={[-1.0, -0.75, 0]} size={[2.0, 1.5, 1.15]} shades={WOOD} />
      </g>
      {/* More than four places would not fit the desk: then the limit is only written under the clerk. */}
      {Array.from({ length: places <= 4 ? places : 0 }, (_, k) => {
        const [x, y] = handAt(k);
        return <rect key={k} x={x - 11.5} y={y - 8} width={23} height={16} rx={3} className="mr-tray" />;
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ routes and signs */

export function Chute({ from, to }: { from: Pt; to: Pt }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const d = `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  return (
    <g className="mr-chute">
      <motion.path initial={false} animate={{ d }} className="mr-chute-edge" />
      <motion.path initial={false} animate={{ d }} className="mr-chute-bed" />
    </g>
  );
}

export function Path({ from, to, dashed, label, lift = 0 }: { from: Pt; to: Pt; dashed?: boolean; label?: string; lift?: number }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  return (
    <g>
      <motion.path initial={false} animate={{ d: `M${x1} ${y1} C ${mx} ${y1 - lift}, ${mx} ${y2 - lift}, ${x2} ${y2}` }} className={`road ${dashed ? "is-dashed" : ""}`} />
      {label && <Tag x={mx} y={(y1 + y2) / 2 - lift * 0.75} text={label} fill="var(--sun-soft)" small />}
    </g>
  );
}

export function Tag({ x = 0, y, text, fill, small }: { x?: number; y: number; text: string; fill: string; small?: boolean }) {
  const size = small ? 11 : 12.5;
  const w = Math.round(text.length * size * 0.6 + (small ? 14 : 20));
  const h = small ? 18 : 22;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2 + 3} width={w} height={h} rx={h / 2} className="pill-shadow" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} className="ink" style={{ fill }} />
      <text y={size * 0.36} textAnchor="middle" className="tag-text" style={{ fontSize: size }}>
        {text}
      </text>
    </g>
  );
}

/** A binding's sign over its chute: one line per key or header rule. */
export function Sign({ x, y, lines }: { x: number; y: number; lines: string[] }) {
  if (lines.length === 1) return <Tag x={x} y={y} text={lines[0]!} fill="var(--sun-soft)" />;
  const size = 11.5;
  const w = Math.round(Math.max(...lines.map((s) => s.length)) * size * 0.6 + 20);
  const h = lines.length * 15 + 9;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2 + 3} width={w} height={h} rx={9} className="pill-shadow" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={9} className="ink" style={{ fill: "var(--sun-soft)" }} />
      {lines.map((s, i) => (
        <text key={i} y={-h / 2 + 16 + i * 15} textAnchor="middle" className="tag-text" style={{ fontSize: size }}>
          {s}
        </text>
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ the post office building */

/** A post office: one broker node. Down, it is greyed out with a red cross on its sign. */
export function PostOffice({ s = 15, roof = "var(--peach)", name, down }: { s?: number; roof?: string; name?: string; down?: boolean }) {
  const P = iso(s);
  const walls: Shades = down ? GREYED : ["#fffdf8", "#f3ebdc", "#e2d6c1"];
  const top: Shades = down ? ["#d8d2dc", "#bdb6c4", "#a9a1b1"] : [roof, roof, roof];
  const w = 3.4;
  const d = 2.4;
  const h = 1.9;
  const [sx, sy] = P(w / 2, d, h - 0.42);
  const fontSize = Math.min(12, 95 / Math.max((name ?? "").length, 6)) * (s / 15);
  return (
    <g className={`mr-office ${down ? "is-down" : ""}`}>
      <polygon points={ptsOf(P, [[-0.2, -0.2, 0], [w + 0.6, -0.2, 0], [w + 0.6, d + 0.5, 0], [-0.2, d + 0.5, 0]])} className="ground-shadow" />
      <Prism P={P} at={[0, 0, 0]} size={[w, d, h]} shades={walls} />
      <Prism P={P} at={[-0.12, -0.12, h]} size={[w + 0.24, d + 0.24, 0.3]} shades={top} />
      {/* Door and windows on the front. */}
      <polygon className="k" points={ptsOf(P, [[0.45, d, 0], [1.05, d, 0], [1.05, d, 1.0], [0.45, d, 1.0]])} style={{ fill: down ? "#b9b2c2" : "var(--sky)" }} />
      <polygon className="k" points={ptsOf(P, [[1.5, d, 0.45], [2.25, d, 0.45], [2.25, d, 1.0], [1.5, d, 1.0]])} style={{ fill: down ? "#cfc8d6" : "var(--sky-soft)" }} />
      <polygon className="k" points={ptsOf(P, [[2.55, d, 0.45], [3.1, d, 0.45], [3.1, d, 1.0], [2.55, d, 1.0]])} style={{ fill: down ? "#cfc8d6" : "var(--sky-soft)" }} />
      {/* The sign band with the node's name. */}
      <polygon className="k" points={ptsOf(P, [[0.2, d, h - 0.7], [w - 0.2, d, h - 0.7], [w - 0.2, d, h - 0.15], [0.2, d, h - 0.15]])} style={{ fill: "var(--card)" }} />
      {name && (
        <text transform={`matrix(1 0.5 0 1 ${sx.toFixed(1)} ${(sy + fontSize * 0.36).toFixed(1)})`} textAnchor="middle" className="mr-plate" style={{ fontSize }}>
          {name}
        </text>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ held letters */

const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

/**
 * A letter sitting in a mailbox or on a desk. It shows up when the letter that carried it
 * lands, slides when the line moves up, and leaves the way its fate says.
 */
export function Held({ place, x, y, arrive, shift, children }: { place: string; x: number; y: number; arrive?: number; shift: number; children: ReactNode }) {
  return (
    <motion.g
      initial={{ scale: 0, x, y }}
      animate={{ scale: 1, x, y }}
      exit="gone"
      variants={{
        gone: (fate: (key: string) => Fate | undefined) => {
          const f = fate(place);
          if (f?.how === "leave") return { scale: 0, transition: { duration: 0.01, delay: f.at } };
          if (f?.how === "drop") return { scale: 0, y: y + 22, transition: { duration: 0.45, delay: f.at } };
          if (f?.how === "done") return { scale: 0, transition: { duration: 0.3, delay: f.at + 0.35 } };
          return { scale: 0, transition: { duration: 0.3 } };
        },
      }}
      // Scale, not opacity, so it changes in the same frame as the flight that hands it over.
      transition={{ x: { ...spring, delay: shift }, y: spring, scale: arrive === undefined ? { duration: 0.25 } : { duration: 0.01, delay: arrive } }}
    >
      {children}
    </motion.g>
  );
}

/** Visibility keyframes: 0 until `from`, 1 until `to`, then 0 by the end (times are fractions). */
export function appear(from: number, to: number) {
  if (from <= 0.001) return { values: [0, 1, 1, 0], times: [0, 0.001, Math.max(to, 0.002), 1] };
  return { values: [0, 0, 1, 1, 0], times: [0, from - 0.001, from, Math.max(to, from + 0.001), 1] };
}

/** A letter for a legend (a 22 × 18 swatch). */
export function LetterSwatch({ kind, ...marks }: { kind: Kind } & LetterMarks) {
  return (
    <g className="mailroom" transform="translate(0 -3)">
      <Envelope kind={kind} w={18} {...marks} />
    </g>
  );
}
