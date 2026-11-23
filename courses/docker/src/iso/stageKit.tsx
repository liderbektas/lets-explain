import { motion } from "motion/react";
import type { Container } from "../engine/docker";

/**
 * Shared pieces of the Docker stages: the canvas size, labels, a per-state stamp for one-shot
 * motion, and the small moving things (a file, a packet, an unresolved name) and pill tags.
 */

export const HOST_STAGE = { width: 860, height: 470 };

export interface HostLabels {
  images: string;
  volumes: string;
  networks: string;
  running: string;
  exited: string;
  created: string;
  noContainers: string;
  noImages: string;
}

const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

/**
 * The engine clones the host on every action, so each drawn state is its own object. A stamp
 * per object keys one-shot motion (a packet, a file being written) so it plays once per action
 * and not again when the same state is drawn again.
 */
const stamps = new WeakMap<object, number>();
let nextStamp = 0;
export function stampOf(o: object): number {
  let s = stamps.get(o);
  if (s === undefined) {
    s = ++nextStamp;
    stamps.set(o, s);
  }
  return s;
}

/** The container a network command inside `from` is talking to: by name, or by Compose service name. */
export function targetOf(cmd: string, list: Container[]): Container | undefined {
  const m = /^(?:ping|curl|wget|nslookup)\s+(?:-\S+\s+)*(?:https?:\/\/)?([a-z0-9_.-]+)/i.exec(cmd);
  if (!m) return undefined;
  const name = m[1]!;
  return list.find((c) => c.name === name) ?? list.find((c) => new RegExp(`^.+-${name}-\\d+$`).test(c.name));
}

export function FileChip({ path, label }: { path: [number, number][]; label: string }) {
  const w = Math.round(Math.min(label.length, 22) * 6.8 + 22);
  return (
    <motion.g
      initial={{ x: path[0]![0], y: path[0]![1], opacity: 0 }}
      animate={{ x: path.map((p) => p[0]), y: path.map((p) => p[1]), opacity: [0, 1, 1, 0] }}
      transition={{ duration: 0.85, ease: "easeInOut" }}
    >
      <rect x={-w / 2} y={-10} width={w} height={20} rx={6} className="ink" style={{ fill: "var(--sun-soft)" }} />
      <text y={4} textAnchor="middle" className="tag-text" style={{ fontSize: 11 }}>
        {clip(label, 22)}
      </text>
    </motion.g>
  );
}

export function Packet({ path, bad }: { path: [number, number][]; bad?: boolean }) {
  return (
    // A delivered packet fades once it arrives (the answer shows at the top); a refused one stays red where it stopped.
    <motion.g initial={{ x: path[0]![0], y: path[0]![1], opacity: 0 }} animate={{ x: path.map((p) => p[0]), y: path.map((p) => p[1]), opacity: bad ? [0, 1, 1] : [0, 1, 1, 0] }} transition={{ duration: bad ? 0.75 : 0.9, ease: "easeInOut" }}>
      <motion.circle r={7} className="ink" initial={{ fill: "#ffd66b" }} animate={{ fill: bad ? ["#ffd66b", "#ffd66b", "#f2615a"] : "#ffd66b" }} transition={{ duration: 0.75 }} />
    </motion.g>
  );
}

export function Unresolved({ x, y }: { x: number; y: number }) {
  return (
    <motion.g initial={{ x, y, scale: 0, opacity: 0 }} animate={{ x, y, scale: 1, opacity: 1 }} transition={spring}>
      <circle r={12} className="ink" style={{ fill: "var(--red-soft)" }} />
      <text y={5} textAnchor="middle" className="tag-text" style={{ fontSize: 14 }}>
        ?
      </text>
    </motion.g>
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

export function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
