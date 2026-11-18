import { AnimatePresence, motion } from "motion/react";
import { reachable, short, type Repo } from "../../engine/git";

/** The newest reflog entries, as `git reflog` prints them: HEAD@{n}, the commit, what moved HEAD. */
export function reflogEntries(repo: Repo, max = 9) {
  return repo.reflog
    .map((e, i) => ({ ...e, n: repo.reflog.length - 1 - i }))
    .reverse()
    .slice(0, max);
}

export function ReflogPanel({ repo, x, w, labels }: { repo: Repo; x: number; w: number; labels: { title: string; lost: string } }) {
  const live = reachable(repo);
  const rows = reflogEntries(repo);
  return (
    <g transform={`translate(${x} 16)`}>
      <rect y={4} width={w} height={438} rx={18} style={{ fill: "var(--ink)" }} />
      <rect width={w} height={438} rx={18} style={{ fill: "#2b2a33", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={16} y={28} style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, fill: "var(--mint)" }}>
        $ git reflog
      </text>
      <text x={w - 14} y={28} textAnchor="end" style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, fill: "#cfc8d6" }}>
        {labels.title}
      </text>
      <AnimatePresence initial={false}>
        {rows.map((e, i) => {
          const lost = !live.has(e.to);
          const message = e.message.length > 30 ? `${e.message.slice(0, 29)}…` : e.message;
          return (
            <motion.g
              key={`${repo.reflog.length - e.n}-${e.to}`}
              initial={{ opacity: 0, y: 40 + i * 44 - 12 }}
              animate={{ opacity: 1, y: 40 + i * 44 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 24 }}
            >
              <rect x={10} width={w - 20} height={38} rx={10} style={{ fill: i === 0 ? "#3d3c47" : "transparent" }} />
              <text x={18} y={16} style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, fill: "var(--sun)" }}>
                {short(e.to)}
              </text>
              <text x={80} y={16} style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, fill: "#fffdf8" }}>
                {`HEAD@{${e.n}}`}
              </text>
              {lost && (
                <g transform={`translate(${w - 64} 4)`}>
                  <rect width={44} height={17} rx={8.5} style={{ fill: "var(--red)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
                  <text x={22} y={12.5} textAnchor="middle" style={{ fontFamily: "var(--font-display)", fontSize: 10.5, fontWeight: 800, fill: "var(--ink)" }}>
                    {labels.lost}
                  </text>
                </g>
              )}
              <text x={18} y={32} style={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: "#b9b2c2" }}>
                {message}
              </text>
            </motion.g>
          );
        })}
      </AnimatePresence>
    </g>
  );
}
