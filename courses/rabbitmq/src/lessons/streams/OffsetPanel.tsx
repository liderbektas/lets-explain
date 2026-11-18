import { motion } from "motion/react";
import { TINTS, type Tint } from "@lets-explain/core/iso/shapes";
import type { Broker } from "../../engine/broker";

/**
 * A stream's log as a row of numbered cells, with a marker under the offset each consumer
 * will read next. Consumers get the same colours as on the broker stage (by name order).
 */

const TINT_ORDER: Tint[] = [TINTS.coral, TINTS.lilac, TINTS.sun, TINTS.mint];
const CELL = 48;
const MAX = 12;
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

export function OffsetPanel({
  broker,
  stream,
  names,
  title,
  box,
}: {
  broker: Broker;
  stream: string;
  names: Record<string, string>;
  title: string;
  box: { x: number; y: number; w: number; h: number };
}) {
  const q = broker.queues[stream];
  if (!q) return null;
  const tags = Object.keys(broker.consumers).sort();
  const readers = tags.filter((t) => broker.consumers[t]!.queue === stream);
  const from = Math.max(0, q.log.length + 1 - MAX);
  const cells = q.log.slice(from);
  const width = (cells.length + 1) * (CELL + 6);
  const x0 = box.x + Math.max(16, (box.w - width) / 2);
  const cellX = (offset: number) => x0 + (offset - from) * (CELL + 6);
  const y = box.y + 26;

  return (
    <g className="offset-panel">
      <rect x={box.x} y={box.y + 4} width={box.w} height={box.h} rx={16} style={{ fill: "var(--ink)" }} />
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={16} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={box.x + 16} y={box.y + 20} style={{ fill: "var(--ink)", fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800 }}>
        {title}
      </text>
      {cells.map((m, i) => {
        const offset = from + i;
        return (
          <g key={m.id} transform={`translate(${cellX(offset)} ${y})`}>
            <rect width={CELL} height={30} rx={9} style={{ fill: "var(--mint-soft)", stroke: "var(--ink)", strokeWidth: 2 }} />
            <text x={CELL / 2} y={20} textAnchor="middle" style={{ fill: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 800 }}>
              {m.body}
            </text>
            <text x={CELL / 2} y={44} textAnchor="middle" style={{ fill: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700 }}>
              {offset}
            </text>
          </g>
        );
      })}
      {/* Where the next message will land. */}
      <g transform={`translate(${cellX(q.log.length)} ${y})`}>
        <rect width={CELL} height={30} rx={9} style={{ fill: "none", stroke: "var(--ink-3)", strokeWidth: 2, strokeDasharray: "4 4" }} />
        <text x={CELL / 2} y={44} textAnchor="middle" style={{ fill: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700 }}>
          {q.log.length}
        </text>
      </g>
      {readers.map((t) => {
        const c = broker.consumers[t]!;
        const tint = TINT_ORDER[tags.indexOf(t) % TINT_ORDER.length]!;
        const at = Math.max(c.offset, from);
        // Readers waiting at the same offset stack their name tags.
        const idx = readers.filter((o) => readers.indexOf(o) < readers.indexOf(t) && Math.max(broker.consumers[o]!.offset, from) === at).length;
        const label = names[t] ?? t;
        const w = Math.round(label.length * 6.6 + 18);
        return (
          <motion.g key={t} initial={false} animate={{ x: cellX(at) + CELL / 2, y: y + 54 }} transition={spring}>
            {idx === 0 && <path d="M0 -6 L-6 4 L6 4 Z" style={{ fill: tint.body, stroke: "var(--ink)", strokeWidth: 1.5 }} />}
            <g transform={`translate(0 ${8 + idx * 19})`}>
              <rect x={-w / 2} y={0} width={w} height={17} rx={8.5} style={{ fill: tint.soft, stroke: "var(--ink)", strokeWidth: 1.5 }} />
              <text y={12.5} textAnchor="middle" style={{ fill: "var(--ink)", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800 }}>
                {label}
              </text>
            </g>
          </motion.g>
        );
      })}
    </g>
  );
}
