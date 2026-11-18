import type { Host } from "../../engine/docker";

/**
 * A GitHub Actions run on the left (one card per step, ticked once it is done) and the
 * registry on the right with every tag pushed so far. Colours are inline: the stage's
 * default SVG text colour would otherwise win over classes.
 */
export function CiPanel({ host, repo, commit, labels }: { host: Host; repo: string; commit: string; labels: { workflow: string; registry: string; empty: string; steps: string[] } }) {
  const ref = `${repo}:sha-${commit}`;
  const built = Boolean(host.tags[ref]);
  const pushed = Boolean(host.registry.tags[ref]);
  const done = [true, true, true, built && pushed];
  const tags = Object.keys(host.registry.tags)
    .filter((t) => t.startsWith(`${repo}:`))
    .sort();
  return (
    <g>
      <rect x={24} y={44} width={380} height={300} rx={18} style={{ fill: "var(--ink)" }} />
      <rect x={24} y={40} width={380} height={300} rx={18} style={{ fill: "#2b2a33", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={46} y={72} style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, fill: "#fffdf8" }}>
        {labels.workflow}
      </text>
      <text x={46} y={94} style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, fill: "#b9b2c2" }}>
        push → main · commit {commit}
      </text>
      {labels.steps.map((name, i) => {
        const y = 128 + i * 52;
        const ok = done[i];
        const running = !ok && built && !pushed && i === 3;
        return (
          <g key={name}>
            <rect x={46} y={y - 18} width={336} height={38} rx={10} style={{ fill: "#3a3943", stroke: "#55535f", strokeWidth: 1.5 }} />
            <circle cx={68} cy={y + 1} r={9} style={{ fill: ok ? "#3fd07f" : running ? "var(--sun)" : "#55535f", stroke: "var(--ink)", strokeWidth: 1.5 }} />
            {ok && <path d={`M${63} ${y + 1} l3 3 6 -6`} style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 2.2, strokeLinecap: "round" }} />}
            <text x={88} y={y + 6} style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 700, fill: "#fffdf8" }}>
              {name}
            </text>
          </g>
        );
      })}

      <path d="M408 190 C 450 190, 460 190, 488 190" style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 2.5, strokeDasharray: pushed ? undefined : "5 6" }} />
      <path d="M480 184 l8 6 -8 6" style={{ fill: "none", stroke: "var(--ink)", strokeWidth: 2.5, strokeLinecap: "round" }} />

      <rect x={492} y={64} width={344} height={260} rx={18} style={{ fill: "var(--ink)" }} />
      <rect x={492} y={60} width={344} height={260} rx={18} style={{ fill: "var(--sky-soft)", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={514} y={92} style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, fill: "var(--ink)" }}>
        {labels.registry}
      </text>
      <text x={514} y={112} style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, fill: "var(--ink-2)" }}>
        {repo}
      </text>
      {tags.length === 0 && (
        <text x={514} y={146} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, fill: "var(--ink-3)" }}>
          {labels.empty}
        </text>
      )}
      {tags.slice(0, 5).map((t, i) => {
        const y = 144 + i * 34;
        const fresh = t === ref && pushed;
        return (
          <g key={t}>
            <rect x={514} y={y - 15} width={300} height={26} rx={13} style={{ fill: fresh ? "var(--mint)" : "var(--card)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
            <text x={530} y={y + 3} style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, fill: "var(--ink)" }}>
              :{t.split(":").pop()} · {host.registry.tags[t]!.slice(0, 7)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
