import type { Container, Host } from "../../engine/docker";
import { IMAGES, printed, runLineOf } from "./model";

/**
 * Three pieces side by side: the image's Dockerfile, the `docker run` line typed, and what
 * actually ran as PID 1 with its output and exit code.
 */

export interface CardLabels {
  dockerfile: string;
  typed: string;
  pid1: string;
  output: string;
  exit: string;
  none: string;
}

const mono = { fontFamily: "var(--font-mono)", fontWeight: 700 } as const;

export function ProcessCard({ host, c, x, y, w, labels, compact }: { host: Host; c: Container | undefined; x: number; y: number; w: number; labels: CardLabels; compact?: boolean }) {
  void host;
  if (!c) {
    return (
      <text x={x + w / 2} y={y + 120} textAnchor="middle" style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, fill: "var(--ink-3)" }}>
        {labels.none}
      </text>
    );
  }
  const img = IMAGES[c.ref];
  const lines = img?.lines ?? [];
  const run = runLineOf(c);
  const out = printed(c);
  const code = c.exitCode;
  const ok = c.state === "running" || code === 0;
  const fit = (s: string, px: number) => {
    const n = Math.floor(px / 7.3);
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  };
  const h1 = compact ? 92 : 108;
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* Dockerfile */}
      <rect y={4} width={w} height={h1} rx={14} style={{ fill: "var(--ink)" }} />
      <rect width={w} height={h1} rx={14} style={{ fill: "#2b2a33", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={14} y={24} style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, fill: "#cfc8d6" }}>
        {labels.dockerfile} · {c.ref}
      </text>
      {lines.map((line, i) => (
        <text key={i} x={14} y={48 + i * 20} xmlSpace="preserve" style={{ ...mono, fontSize: 12.5, fill: /^(CMD|ENTRYPOINT)/.test(line) ? "var(--sun)" : "#f4efe6" }}>
          {fit(line, w - 28)}
        </text>
      ))}

      {/* What was typed */}
      <g transform={`translate(0 ${h1 + 18})`}>
        <text x={2} y={0} style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, fill: "var(--ink-2)" }}>
          {labels.typed}
        </text>
        <rect y={8} width={w} height={34} rx={10} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2 }} />
        <text x={12} y={30} xmlSpace="preserve" style={{ ...mono, fontSize: 12.5, fill: "var(--ink)" }}>
          <tspan style={{ fill: "var(--green)" }}>$ </tspan>
          {fit(run, w - 40)}
        </text>
      </g>

      {/* What ran */}
      <g transform={`translate(0 ${h1 + 76})`}>
        <text x={2} y={0} style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, fill: "var(--ink-2)" }}>
          {labels.pid1}
        </text>
        <rect y={8} width={w} height={compact ? 96 : 112} rx={12} style={{ fill: ok ? "var(--mint-soft)" : "var(--red-soft)", stroke: "var(--ink)", strokeWidth: 2 }} />
        <text x={12} y={32} xmlSpace="preserve" style={{ ...mono, fontSize: 13, fill: "var(--ink)" }}>
          {fit(c.cmd.map((p) => (p.includes(" ") ? `"${p}"` : p)).join(" "), w - 24)}
        </text>
        <text x={12} y={58} style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, fill: "var(--ink-2)" }}>
          {labels.output}
        </text>
        <text x={12} y={78} xmlSpace="preserve" style={{ ...mono, fontSize: 12.5, fill: ok ? "var(--ink)" : "#c33a33" }}>
          {fit(out.join(" · ") || "—", w - 24)}
        </text>
        <g transform={`translate(${w - 12} ${compact ? 92 : 104})`}>
          <rect x={-118} y={-16} width={118} height={22} rx={11} style={{ fill: c.state === "running" ? "var(--mint)" : code === 0 ? "var(--card)" : "var(--coral)", stroke: "var(--ink)", strokeWidth: 2 }} />
          <text x={-59} y={-1} textAnchor="middle" style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, fill: "var(--ink)" }}>
            {c.state === "running" ? "running" : `${labels.exit} ${code}`}
          </text>
        </g>
      </g>
    </g>
  );
}
