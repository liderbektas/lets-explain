import type { Host } from "../../engine/docker";
import { status } from "./cli";

/**
 * A terminal on the left (one command and what it printed) and a small live summary of the
 * machine on the right: every container with its state, every image with its tag.
 */

export function Terminal({ command, lines, title }: { command: string; lines: string[]; title: string }) {
  const shown = lines.slice(0, 15);
  return (
    <g>
      <rect x={16} y={24} width={560} height={426} rx={16} style={{ fill: "var(--ink)" }} />
      <rect x={16} y={20} width={560} height={426} rx={16} style={{ fill: "#2b2a33", stroke: "var(--ink)", strokeWidth: 2 }} />
      <circle cx={38} cy={40} r={5} style={{ fill: "var(--coral)" }} />
      <circle cx={54} cy={40} r={5} style={{ fill: "var(--sun)" }} />
      <circle cx={70} cy={40} r={5} style={{ fill: "var(--mint)" }} />
      <text x={92} y={44} style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, fill: "#cfc8d6" }}>
        {title}
      </text>
      <text x={34} y={78} style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, fill: "#fffdf8" }}>
        <tspan style={{ fill: "var(--mint)" }}>$ </tspan>
        {command.length > 66 ? `${command.slice(0, 65)}…` : command}
      </text>
      {shown.map((line, i) => (
        <text key={i} x={34} y={104 + i * 22} xmlSpace="preserve" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fill: i === 0 && /^[A-Z ]{6}/.test(line) ? "#b9b2c2" : "#f4efe6", whiteSpace: "pre" }}>
          {line.length > 74 ? `${line.slice(0, 73)}…` : line}
        </text>
      ))}
      {lines.length > shown.length && (
        <text x={34} y={104 + shown.length * 22} style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fill: "#8b8694" }}>
          … +{lines.length - shown.length}
        </text>
      )}
    </g>
  );
}

const FILL = { running: "var(--mint)", created: "#fffdf8", exited: "#e2dde8" } as const;

export function Summary({ host, titles }: { host: Host; titles: { containers: string; images: string; none: string } }) {
  const cs = Object.values(host.containers);
  const imgs = Object.values(host.images);
  return (
    <g transform="translate(596 20)">
      <text x={0} y={22} style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, fill: "var(--ink)" }}>
        {titles.containers} ({cs.length})
      </text>
      {cs.length === 0 && (
        <text x={0} y={48} style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 700, fill: "var(--ink-3)" }}>
          {titles.none}
        </text>
      )}
      {cs.slice(0, 5).map((c, i) => (
        <g key={c.id} transform={`translate(0 ${36 + i * 32})`}>
          <rect width={240} height={26} rx={13} style={{ fill: c.state === "exited" && c.exitCode ? "var(--red-soft)" : FILL[c.state], stroke: "var(--ink)", strokeWidth: 2 }} />
          <text x={12} y={17} style={{ fontFamily: "var(--font-display)", fontSize: 12.5, fontWeight: 800, fill: "var(--ink)" }}>
            {c.name}
          </text>
          <text x={228} y={17} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, fill: "var(--ink-2)" }}>
            {status(c)}
          </text>
        </g>
      ))}
      <text x={0} y={36 + Math.max(1, Math.min(5, cs.length)) * 32 + 30} style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, fill: "var(--ink)" }}>
        {titles.images} ({imgs.length})
      </text>
      {imgs.slice(0, 7).map((img, i) => {
        const tag = Object.keys(host.tags).find((t) => host.tags[t] === img.id) ?? "<none>";
        return (
          <g key={img.id} transform={`translate(0 ${36 + Math.max(1, Math.min(5, cs.length)) * 32 + 44 + i * 26})`}>
            <rect width={240} height={21} rx={10.5} style={{ fill: tag === "<none>" ? "var(--paper-2)" : "var(--sky-soft)", stroke: "var(--ink)", strokeWidth: 1.5, strokeDasharray: tag === "<none>" ? "4 3" : undefined }} />
            <text x={10} y={14.5} style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, fill: "var(--ink)" }}>
              {tag.length > 30 ? `${tag.slice(0, 29)}…` : tag}
            </text>
          </g>
        );
      })}
    </g>
  );
}
