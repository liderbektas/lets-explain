import { memoryUse, type Container, type Host } from "../../engine/docker";

/**
 * A `docker stats`-style table under the host drawing: memory use against the limit, the CPU
 * limit, status and restart count, one row per container. Fills are inline so the stage's
 * default text colour does not override them.
 */

const mono = { fontFamily: "var(--font-mono)", fontSize: 11.5 } as const;
const COLS = [16, 170, 360, 450, 640];

export function StatsPanel({ host, containers, noLimit }: { host: Host; containers: Container[]; noLimit: string }) {
  const x = 24;
  const y = 366;
  const w = 812;
  const h = 94;
  const head = ["NAME", "MEM USAGE / LIMIT", "CPUS", "STATUS", "RESTARTS"];
  return (
    <g>
      <rect x={x} y={y + 4} width={w} height={h} rx={14} style={{ fill: "var(--ink)" }} />
      <rect x={x} y={y} width={w} height={h} rx={14} style={{ fill: "#2b2a33", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={x + 16} y={y + 19} style={{ ...mono, fill: "#8bd3b0", fontWeight: 700 }}>
        $ docker stats --no-stream
      </text>
      {head.map((t, i) => (
        <text key={t} x={x + COLS[i]!} y={y + 38} style={{ ...mono, fontSize: 10.5, fill: "#8b8694", fontWeight: 700 }}>
          {t}
        </text>
      ))}
      {containers.slice(0, 3).map((c, r) => {
        const used = memoryUse(host, c);
        const near = c.memoryLimit !== undefined && used > 0 && used / c.memoryLimit > 0.8;
        const status = c.state === "running" ? "Up" : c.state === "created" ? "Created" : `Exited (${c.exitCode})${c.oomKilled ? " OOM" : ""}`;
        const cells = [c.name, `${used}MiB / ${c.memoryLimit !== undefined ? `${c.memoryLimit}MiB` : noLimit}`, c.cpus !== undefined ? String(c.cpus) : "—", status, String(c.restarts)];
        return (
          <g key={c.id}>
            {cells.map((cell, i) => (
              <text
                key={i}
                x={x + COLS[i]!}
                y={y + 57 + r * 16}
                style={{
                  ...mono,
                  fontWeight: 700,
                  fill: i === 3 && c.state === "exited" && c.exitCode !== 0 ? "#ffb1a8" : i === 1 && near ? "var(--sun)" : i === 4 && c.restarts > 0 ? "#ffb1a8" : "#fffdf8",
                }}
              >
                {cell}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}
