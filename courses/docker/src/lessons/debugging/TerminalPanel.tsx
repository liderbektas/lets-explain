/**
 * A dark terminal strip under the host drawing: a few commands and what they printed.
 * Used by the debugging and resources lessons. Fills are inline because the stage's default
 * text colour would otherwise win.
 */

export interface TermLine {
  cmd: string;
  out: string;
  tone?: "plain" | "bad" | "ok";
}

const OUT_FILL = { plain: "#fffdf8", bad: "#ffb1a8", ok: "#a8e6cf" } as const;

export function TerminalPanel({ title, lines, badge, y = 366, height = 94 }: { title: string; lines: TermLine[]; badge?: { text: string; tone: "bad" | "ok" | "plain" }; y?: number; height?: number }) {
  const x = 24;
  const w = 812;
  return (
    <g className="term-panel">
      <rect x={x} y={y + 4} width={w} height={height} rx={14} style={{ fill: "var(--ink)" }} />
      <rect x={x} y={y} width={w} height={height} rx={14} style={{ fill: "#2b2a33", stroke: "var(--ink)", strokeWidth: 2 }} />
      <circle cx={x + 18} cy={y + 15} r={4.5} style={{ fill: "var(--coral)" }} />
      <circle cx={x + 32} cy={y + 15} r={4.5} style={{ fill: "var(--sun)" }} />
      <circle cx={x + 46} cy={y + 15} r={4.5} style={{ fill: "var(--mint)" }} />
      <text x={x + 62} y={y + 19} style={{ fill: "#cfc8d6", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 13 }}>
        {title}
      </text>
      {badge && (
        <g transform={`translate(${x + w - 14} ${y + 15})`}>
          <rect x={-badge.text.length * 6.6 - 18} y={-10} width={badge.text.length * 6.6 + 18} height={20} rx={10} style={{ fill: badge.tone === "bad" ? "var(--red-soft)" : badge.tone === "ok" ? "var(--mint)" : "var(--sun-soft)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
          <text x={-badge.text.length * 3.3 - 9} y={4} textAnchor="middle" style={{ fill: "var(--ink)", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11.5 }}>
            {badge.text}
          </text>
        </g>
      )}
      {lines.slice(0, 3).map((line, i) => (
        <g key={i} transform={`translate(${x + 16} ${y + 42 + i * 19})`}>
          <text x={0} y={0} style={{ fill: "#8bd3b0", fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 700 }}>
            $
          </text>
          <text x={12} y={0} style={{ fill: "#cfc8d6", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
            {clip(line.cmd, 58)}
          </text>
          <text x={430} y={0} style={{ fill: OUT_FILL[line.tone ?? "plain"], fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 700 }}>
            {clip(line.out, 50)}
          </text>
        </g>
      ))}
    </g>
  );
}

export function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
