import type { Container } from "../../engine/docker";

/**
 * The four states a container passes through, as a strip under the host, with the command
 * that moves it between them. The state of the tracked container is lit.
 */

export type Phase = "created" | "running" | "exited" | "removed" | "none";

export function phaseOf(c: Container | undefined, everExisted: boolean): Phase {
  if (!c) return everExisted ? "removed" : "none";
  return c.state;
}

const BOXES: { id: Exclude<Phase, "none">; x: number }[] = [
  { id: "created", x: 130 },
  { id: "running", x: 330 },
  { id: "exited", x: 530 },
  { id: "removed", x: 730 },
];

const FILL: Record<Exclude<Phase, "none">, string> = {
  created: "#fffdf8",
  running: "var(--mint)",
  exited: "#e2dde8",
  removed: "var(--red-soft)",
};

export function LifecycleStrip({ phase, names, arrows }: { phase: Phase; names: Record<Exclude<Phase, "none">, string>; arrows: { start: string; stop: string; rm: string } }) {
  const y = 418;
  const w = 128;
  const h = 34;
  return (
    <g className="lifecycle">
      <rect x={20} y={378} width={820} height={84} rx={18} style={{ fill: "var(--paper)", stroke: "var(--line)", strokeWidth: 2, strokeDasharray: "5 5" }} />
      {BOXES.slice(0, -1).map((b, i) => {
        const next = BOXES[i + 1]!;
        const label = i === 0 ? arrows.start : i === 1 ? arrows.stop : arrows.rm;
        return (
          <g key={b.id}>
            <path d={`M${b.x + w / 2 + 4} ${y} L${next.x - w / 2 - 8} ${y}`} style={{ stroke: "var(--ink)", strokeWidth: 2.5, fill: "none" }} markerEnd="url(#arrow)" />
            <text x={(b.x + next.x) / 2} y={y - 9} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, fill: "var(--ink-2)" }}>
              {label}
            </text>
          </g>
        );
      })}
      {/* exited → running again with start */}
      <path d={`M${BOXES[2]!.x - 20} ${y + h / 2 + 2} C ${BOXES[2]!.x - 40} ${y + 40}, ${BOXES[1]!.x + 40} ${y + 40}, ${BOXES[1]!.x + 20} ${y + h / 2 + 4}`} style={{ stroke: "var(--ink-3)", strokeWidth: 2, fill: "none", strokeDasharray: "4 4" }} markerEnd="url(#arrow)" />
      <text x={(BOXES[1]!.x + BOXES[2]!.x) / 2} y={y + 40} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 800, fill: "var(--ink-3)" }}>
        {arrows.start}
      </text>
      {BOXES.map((b) => {
        const lit = phase === b.id;
        return (
          <g key={b.id} transform={`translate(${b.x} ${y})`}>
            <rect x={-w / 2} y={-h / 2 + (lit ? 4 : 2)} width={w} height={h} rx={h / 2} style={{ fill: "var(--ink)" }} />
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} style={{ fill: lit ? FILL[b.id] : "var(--card)", stroke: "var(--ink)", strokeWidth: lit ? 3 : 2, opacity: lit ? 1 : 0.75 }} />
            <text y={5} textAnchor="middle" style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 800, fill: "var(--ink)", opacity: lit ? 1 : 0.6 }}>
              {names[b.id]}
            </text>
          </g>
        );
      })}
    </g>
  );
}
