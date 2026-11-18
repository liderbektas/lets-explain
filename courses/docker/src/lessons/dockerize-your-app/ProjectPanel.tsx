import { ignoredBy, type Files } from "../../engine/docker";

/**
 * The reader's project folder as a card: every file, its rough size, and whether the
 * .dockerignore keeps it out of the build. Text colours are inline because the stage's
 * default SVG text colour would win over classes in some places.
 */
export function ProjectPanel({ files, ignore, title, ignoredLabel, sentLabel }: { files: Files; ignore: string[]; title: string; ignoredLabel: string; sentLabel: string }) {
  const entries = Object.entries(files).sort(([a], [b]) => (a.startsWith(".") === b.startsWith(".") ? a.localeCompare(b) : a.startsWith(".") ? 1 : -1));
  const top = 70;
  return (
    <g>
      <rect x={210} y={top - 36 + 4} width={440} height={entries.length * 40 + 64} rx={18} style={{ fill: "var(--ink)" }} />
      <rect x={210} y={top - 36} width={440} height={entries.length * 40 + 64} rx={18} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={236} y={top - 8} style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, fill: "var(--ink)" }}>
        {title}
      </text>
      {entries.map(([path, content], i) => {
        const out = ignoredBy(ignore, path);
        const size = content.startsWith("size:") ? `${content.slice(5)} MB` : "< 1 KB";
        const y = top + 22 + i * 40;
        return (
          <g key={path} opacity={out ? 0.55 : 1}>
            <rect x={232} y={y - 16} width={396} height={30} rx={9} style={{ fill: out ? "var(--paper-2)" : "var(--sky-soft)", stroke: "var(--ink)", strokeWidth: 1.5, strokeDasharray: out ? "5 4" : undefined }} />
            <text x={246} y={y + 4} style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, fill: "var(--ink)" }}>
              {path.split("/")[0]}
              {path.includes("/") ? "/" : ""}
            </text>
            <text x={470} y={y + 4} textAnchor="end" style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 700, fill: "var(--ink-2)" }}>
              {size}
            </text>
            <g transform={`translate(560 ${y - 1})`}>
              <rect x={-52} y={-10} width={104} height={20} rx={10} style={{ fill: out ? "var(--red-soft)" : "var(--mint)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
              <text y={4} textAnchor="middle" style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800, fill: "var(--ink)" }}>
                {out ? ignoredLabel : sentLabel}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
