import { imageSize, type DockerEvent, type Host } from "../../engine/docker";

/** Every `shop:*` image on the machine as a bar, so sizes compare at a glance. */
export function SizeBars({ host, title, last, x = 640, y = 30 }: { host: Host; title: string; last: DockerEvent[]; x?: number; y?: number }) {
  const rows = Object.entries(host.tags)
    .filter(([t]) => t.startsWith("shop:"))
    .map(([t, id]) => ({ tag: t.replace(/^shop:/, ""), size: imageSize(host.images[id]!) }))
    .sort((a, b) => b.size - a.size);
  const max = Math.max(1, ...rows.map((r) => r.size));
  const exec = last.find((e): e is Extract<DockerEvent, { type: "execOutput" }> => e.type === "execOutput");
  return (
    <g transform={`translate(${x} ${y})`}>
      <text x={0} y={0} style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, fill: "var(--ink)" }}>
        {title}
      </text>
      {rows.map((r, i) => {
        const w = Math.max(6, (r.size / max) * 140);
        const yy = 26 + i * 46;
        return (
          <g key={r.tag} transform={`translate(0 ${yy})`}>
            <text x={0} y={0} style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, fill: "var(--ink)" }}>
              shop:{r.tag}
            </text>
            <rect x={0} y={9} width={w} height={16} rx={8} style={{ fill: r.size < 200 ? "var(--mint)" : r.size < 600 ? "var(--sun)" : "var(--coral)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
            <text x={w + 8} y={22} style={{ fontFamily: "var(--font-display)", fontSize: 12.5, fontWeight: 800, fill: "var(--ink-2)" }}>
              {r.size} MB
            </text>
          </g>
        );
      })}
      {exec && (
        <g transform={`translate(0 ${26 + rows.length * 46 + 14})`}>
          <rect x={0} y={0} width={210} height={58} rx={10} style={{ fill: "#2b2a33", stroke: "var(--ink)", strokeWidth: 2 }} />
          <text x={10} y={20} style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, fill: "var(--mint)" }}>
            $ docker exec -it {exec.name} {exec.cmd}
          </text>
          <text x={10} y={40} style={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: exec.code === 0 ? "#fffdf8" : "var(--coral)" }}>
            {exec.code === 0 ? (exec.output.join(" ").slice(0, 28) || "/ #") : "exec: \"sh\": not found (127)"}
          </text>
        </g>
      )}
    </g>
  );
}
