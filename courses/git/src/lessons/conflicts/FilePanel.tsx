import { AnimatePresence, motion } from "motion/react";
import type { Repo } from "../../engine/git";
import "./file-panel.css";

/**
 * The files that matter in a merge or rebase, as they are in the folder right now. A
 * conflicted file shows Git's markers: our side (HEAD) on sun, theirs on sky, so the
 * reader can see exactly what Git wrote into the file.
 */

export interface FilePanelLabels {
  title: string;
  conflict: string;
  needsAdd: string;
  changed: string;
  clean: string;
  ours: string;
  theirs: string;
  missing: string;
}

interface Props {
  repo: Repo;
  paths: string[];
  labels: FilePanelLabels;
  box: { x: number; y: number; w: number; h: number };
}

type Tone = "conflict" | "needs-add" | "changed" | "clean";

const LINE = 17;
const spring = { type: "spring", stiffness: 180, damping: 22 } as const;

export function FilePanel({ repo, paths, labels, box }: Props) {
  const conflicts = repo.op?.conflicts ?? [];
  let y = box.y + 40;
  const cards = paths.map((path) => {
    const content = repo.work[path];
    const lines = content === undefined ? [] : content.split("\n");
    const hasMarkers = lines.some((ln) => ln.startsWith("<<<<<<< "));
    const tone: Tone = conflicts.includes(path)
      ? hasMarkers
        ? "conflict"
        : "needs-add"
      : content !== repo.index[path]
        ? "changed"
        : "clean";
    const h = 34 + Math.max(1, lines.length) * LINE + 10;
    const card = { path, lines, tone, top: y, h };
    y += h + 14;
    return card;
  });

  const badge: Record<Tone, string> = {
    conflict: labels.conflict,
    "needs-add": labels.needsAdd,
    changed: labels.changed,
    clean: labels.clean,
  };

  return (
    <g className="file-panel">
      <text x={box.x + 4} y={box.y + 22} className="fp-title">
        {labels.title}
      </text>
      <AnimatePresence initial={false}>
        {cards.map((c) => {
          let side: "ours" | "theirs" | null = null;
          return (
            <motion.g key={c.path} initial={false} animate={{ x: box.x, y: c.top }} transition={spring}>
              <rect y={4} width={box.w} height={c.h} rx={12} style={{ fill: "var(--ink)" }} />
              <rect width={box.w} height={c.h} rx={12} className={`fp-card is-${c.tone}`} />
              <text x={12} y={21} className="fp-name">
                {c.path}
              </text>
              <g transform={`translate(${box.w - 10} 8)`}>
                <rect x={-(badge[c.tone].length * 6.6 + 16)} width={badge[c.tone].length * 6.6 + 16} height={18} rx={9} className={`fp-badge is-${c.tone}`} />
                <text x={-(badge[c.tone].length * 6.6 + 16) / 2} y={13} textAnchor="middle" className="fp-badge-text">
                  {badge[c.tone]}
                </text>
              </g>
              {c.lines.length === 0 && (
                <text x={12} y={34 + 12} className="fp-line is-missing">
                  {labels.missing}
                </text>
              )}
              {c.lines.map((ln, i) => {
                const marker = ln.startsWith("<<<<<<< ") || ln === "=======" || ln.startsWith(">>>>>>> ");
                if (ln.startsWith("<<<<<<< ")) side = "ours";
                else if (ln === "=======") side = "theirs";
                else if (ln.startsWith(">>>>>>> ")) side = null;
                const bg = marker ? "marker" : side;
                const ly = 34 + i * LINE;
                const note = ln.startsWith("<<<<<<< ") ? labels.ours : ln.startsWith(">>>>>>> ") ? labels.theirs : null;
                return (
                  <g key={i}>
                    {bg && <rect x={6} y={ly - 1} width={box.w - 12} height={LINE} rx={4} className={`fp-bg is-${bg}`} />}
                    <text x={12} y={ly + 12} className={`fp-line ${marker ? "is-marker" : ""}`}>
                      {clip(ln, Math.floor((box.w - (note ? 110 : 24)) / 7))}
                    </text>
                    {note && (
                      <text x={box.w - 12} y={ly + 12} textAnchor="end" className="fp-note">
                        {note}
                      </text>
                    )}
                  </g>
                );
              })}
            </motion.g>
          );
        })}
      </AnimatePresence>
    </g>
  );
}

function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, Math.max(1, n - 1))}…` : text;
}
