import { status, type Repo } from "../../engine/git";

/**
 * A strip under the graph that answers "where did my change go?" after a reset:
 * the folder, staging, or nowhere (clean).
 */
export function WherePanel({ repo, y, labels }: { repo: Repo; y: number; labels: { title: string; work: string; index: string; clean: string } }) {
  const st = status(repo);
  const work = [...st.unstaged.map((c) => c.path), ...st.untracked];
  const staged = st.staged.map((c) => c.path);
  const cols: { title: string; items: string[]; fill: string }[] = [
    { title: labels.work, items: work, fill: "var(--sky-soft)" },
    { title: labels.index, items: staged, fill: "var(--mint-soft)" },
  ];
  // One line: the question on the left, the two places side by side.
  return (
    <g transform={`translate(0 ${y})`}>
      <text x={24} y={34} className="graph-title" style={{ fontSize: 14 }}>
        {labels.title}
      </text>
      {cols.map((c, i) => {
        const x = 214 + i * 320;
        return (
          <g key={c.title} transform={`translate(${x} 4)`}>
            <rect y={4} width={306} height={52} rx={14} style={{ fill: "var(--ink)" }} />
            <rect width={306} height={52} rx={14} className="area-tray" style={{ fill: c.fill }} />
            <text x={14} y={20} className="area-title" style={{ fontSize: 13 }}>
              {c.title}
            </text>
            {c.items.length === 0 ? (
              <text x={14} y={40} className="area-empty">
                {labels.clean}
              </text>
            ) : (
              c.items.map((p, j) => (
                <g key={p} transform={`translate(${14 + j * 92} 26)`}>
                  <rect width={86} height={20} rx={10} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2 }} />
                  <text x={43} y={14} textAnchor="middle" className="file-name">
                    {p}
                  </text>
                </g>
              ))
            )}
          </g>
        );
      })}
    </g>
  );
}
