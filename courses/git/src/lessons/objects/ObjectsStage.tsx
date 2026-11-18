import { AnimatePresence, motion } from "motion/react";
import { buildTrees, hashBlob, type Files, type TreeObject } from "../../engine/objects";
import { headId, short, type Repo } from "../../engine/git";
import "./objects.css";

/**
 * Git's object store, drawn as three columns: commits point to a root tree, trees list
 * blobs (file contents) and subtrees (folders). Ids are the real Git ids for this content.
 * Objects new in HEAD are marked "new"; objects HEAD shares with its parent are marked
 * "shared", which is how Git avoids storing an unchanged file twice.
 */

export interface ObjectsLabels {
  newTag: string;
  shared: string;
  staged: string;
  notYet: string;
  empty: string;
}

type Kind = "commit" | "tree" | "blob";

interface Card {
  key: string;
  kind: Kind;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: { text: string; tone?: "head" | "dim" | "entry" }[];
  badge?: { text: string; tone: "new" | "shared" | "staged" | "preview" };
  /** y offset of each tree entry row, for arrows. */
  rows?: { target: string; dy: number }[];
}

const COLS = { commit: { x: 14, w: 232 }, tree: { x: 286, w: 270 }, blob: { x: 600, w: 246 } };
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

function treesOf(files: Files): Map<string, TreeObject> {
  return new Map(buildTrees(files).map((t) => [t.id, t]));
}

export function ObjectsStage({ repo, labels }: { repo: Repo; labels: ObjectsLabels }) {
  const head = headId(repo);
  const commits = head ? [head, ...repo.commits[head]!.parents.slice(0, 1)] : [];
  const headTrees = head ? treesOf(repo.commits[head]!.files) : new Map<string, TreeObject>();
  const parentId = commits[1];
  const parentTrees = parentId ? treesOf(repo.commits[parentId]!.files) : new Map<string, TreeObject>();

  // Every object reachable from the commits shown, deduplicated by id like Git does.
  const trees = new Map<string, TreeObject>([...headTrees, ...parentTrees]);
  const blobIds = new Map<string, string>(); // id → content
  const blobsIn = (files: Files) => new Set(Object.values(files).map((c) => hashBlob(c)));
  const headBlobs = head ? blobsIn(repo.commits[head]!.files) : new Set<string>();
  const parentBlobs = parentId ? blobsIn(repo.commits[parentId]!.files) : new Set<string>();
  for (const id of commits) for (const c of Object.values(repo.commits[id]!.files)) blobIds.set(hashBlob(c), c);

  // `git add` writes a blob right away, before any commit; show those too.
  const committedFiles = head ? repo.commits[head]!.files : {};
  const staged = new Map<string, string>();
  for (const [p, c] of Object.entries(repo.index)) if (committedFiles[p] !== c) staged.set(hashBlob(c), c);
  for (const [id, c] of staged) if (!blobIds.has(id)) blobIds.set(id, c);
  // Not yet in Git at all: what `git hash-object` would print for untracked files.
  const preview = new Map<string, string>();
  for (const [p, c] of Object.entries(repo.work)) if (!(p in repo.index)) preview.set(hashBlob(c), c);
  for (const [id, c] of preview) if (!blobIds.has(id)) blobIds.set(id, c);

  const isNew = (kind: Kind, id: string) => {
    // The first commit adds a tree and itself; its blobs were written earlier, by `git add`.
    if (!parentId) return Boolean(head) && kind !== "blob";
    if (kind === "commit") return id === head;
    if (kind === "tree") return headTrees.has(id) && !parentTrees.has(id);
    return headBlobs.has(id) && !parentBlobs.has(id);
  };
  const isShared = (kind: Kind, id: string) =>
    Boolean(parentId) && (kind === "tree" ? headTrees.has(id) && parentTrees.has(id) : kind === "blob" && headBlobs.has(id) && parentBlobs.has(id));

  const cards: Card[] = [];
  let y = 30;
  for (const id of commits) {
    const c = repo.commits[id]!;
    const lines: Card["lines"] = [
      { text: `commit ${short(id)}`, tone: "head" },
      { text: `tree   ${short(c.tree)}`, tone: "entry" },
      ...c.parents.map((p) => ({ text: `parent ${short(p)}`, tone: "dim" as const })),
      { text: `"${c.message.split("\n")[0]!.slice(0, 22)}"` },
    ];
    const h = 18 + lines.length * 17;
    cards.push({ key: `c-${id}`, kind: "commit", id, ...COLS.commit, y, h, lines, badge: id === head && isNew("commit", id) ? { text: labels.newTag, tone: "new" } : undefined });
    y += h + 46;
  }

  // Trees: HEAD's root first, then its subtrees, then the parent's that differ.
  const treeOrder: string[] = [];
  const pushTree = (id: string, map: Map<string, TreeObject>) => {
    if (treeOrder.includes(id)) return;
    treeOrder.push(id);
    for (const e of map.get(id)?.entries ?? []) if (e.type === "tree") pushTree(e.id, map);
  };
  if (head) pushTree(repo.commits[head]!.tree, headTrees);
  if (parentId) pushTree(repo.commits[parentId]!.tree, parentTrees);
  y = 30;
  for (const id of treeOrder) {
    const t = trees.get(id)!;
    const lines: Card["lines"] = [{ text: `tree ${short(id)}`, tone: "head" }, ...t.entries.map((e) => ({ text: `${e.type} ${short(e.id)} ${e.name}${e.type === "tree" ? "/" : ""}`, tone: "entry" as const }))];
    const h = 20 + lines.length * 17;
    cards.push({
      key: `t-${id}`,
      kind: "tree",
      id,
      ...COLS.tree,
      y,
      h,
      lines,
      rows: t.entries.map((e, i) => ({ target: e.id, dy: 20 + (i + 1) * 17 - 5 })),
      badge: isNew("tree", id) ? { text: labels.newTag, tone: "new" } : isShared("tree", id) ? { text: labels.shared, tone: "shared" } : undefined,
    });
    y += h + 22;
  }

  y = 30;
  for (const [id, content] of blobIds) {
    const inCommit = headBlobs.has(id) || parentBlobs.has(id);
    const badge: Card["badge"] = !inCommit
      ? staged.has(id)
        ? { text: labels.staged, tone: "staged" }
        : { text: labels.notYet, tone: "preview" }
      : isNew("blob", id)
        ? { text: labels.newTag, tone: "new" }
        : isShared("blob", id)
          ? { text: labels.shared, tone: "shared" }
          : undefined;
    cards.push({ key: `b-${id}`, kind: "blob", id, ...COLS.blob, y, h: 52, lines: [{ text: `blob ${short(id)}`, tone: "head" }, { text: `"${content.slice(0, 24)}"` }], badge });
    y += 52 + 16;
  }

  const bottom = Math.max(...cards.map((c) => c.y + c.h), 100);
  const scale = Math.min(1, 440 / (bottom + 10));
  const byId = new Map(cards.map((c) => [c.id, c]));

  const arrows: { key: string; d: string; dashed?: boolean }[] = [];
  for (const c of cards) {
    if (c.kind === "commit") {
      const commit = repo.commits[c.id]!;
      const tree = byId.get(commit.tree);
      if (tree) arrows.push({ key: `${c.key}-tree`, d: curve(c.x + c.w, c.y + 18 + 17 + 4, tree.x, tree.y + 14) });
      const parent = commit.parents[0] ? byId.get(commit.parents[0]) : undefined;
      if (parent) arrows.push({ key: `${c.key}-parent`, d: `M${c.x + 40} ${c.y + c.h} L${parent.x + 40} ${parent.y}`, dashed: true });
    }
    if (c.kind === "tree") {
      for (const r of c.rows ?? []) {
        const to = byId.get(r.target);
        if (!to) continue;
        const y1 = c.y + r.dy;
        if (to.kind === "tree") {
          // A subtree in the same column: loop out to the right and back in.
          arrows.push({ key: `${c.key}-${r.target}`, d: `M${c.x + c.w} ${y1} C ${c.x + c.w + 34} ${y1}, ${to.x + to.w + 34} ${to.y + 14}, ${to.x + to.w} ${to.y + 14}` });
        } else {
          arrows.push({ key: `${c.key}-${r.target}`, d: curve(c.x + c.w, y1, to.x, to.y + 16) });
        }
      }
    }
  }

  return (
    <g transform={`translate(0 ${scale < 1 ? 6 : 0}) scale(${scale})`}>
      {cards.length === 0 && (
        <text x={430} y={230} textAnchor="middle" className="area-empty">
          {labels.empty}
        </text>
      )}
      {arrows.map((a) => (
        <motion.path key={a.key} initial={false} animate={{ d: a.d }} transition={spring} className="obj-arrow" style={a.dashed ? { strokeDasharray: "5 5" } : undefined} markerEnd="url(#arrow)" />
      ))}
      <AnimatePresence initial={false}>
        {cards.map((c) => (
          <motion.g key={c.key} initial={{ opacity: 0, x: c.x + 20, y: c.y }} animate={{ opacity: 1, x: c.x, y: c.y }} exit={{ opacity: 0 }} transition={spring}>
            <ObjectCard card={c} />
          </motion.g>
        ))}
      </AnimatePresence>
    </g>
  );
}

function curve(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 4} ${y2}`;
}

const FILL: Record<Kind, string> = { commit: "var(--sun-soft)", tree: "var(--sky-soft)", blob: "var(--mint-soft)" };
const BADGE: Record<NonNullable<Card["badge"]>["tone"], string> = {
  new: "var(--tangerine)",
  shared: "var(--mint)",
  staged: "var(--sky)",
  preview: "var(--card)",
};

function ObjectCard({ card }: { card: Card }) {
  const dashed = card.badge?.tone === "preview";
  return (
    <g>
      <rect y={3} width={card.w} height={card.h} rx={12} style={{ fill: "var(--ink)" }} />
      <rect width={card.w} height={card.h} rx={12} style={{ fill: FILL[card.kind], stroke: "var(--ink)", strokeWidth: 2, strokeDasharray: dashed ? "5 4" : undefined }} />
      {card.lines.map((line, i) => (
        <text
          key={i}
          x={12}
          y={20 + i * 17}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            fontWeight: line.tone === "head" ? 800 : 600,
            fill: line.tone === "dim" ? "var(--ink-3)" : "var(--ink)",
            whiteSpace: "pre",
          }}
        >
          {line.text}
        </text>
      ))}
      {card.badge && (
        // Sits on the card's top edge like a tab, so it never covers the id.
        <g transform={`translate(${card.w - 10} -9)`}>
          <rect x={-(card.badge.text.length * 6.4 + 14)} width={card.badge.text.length * 6.4 + 14} height={17} rx={8.5} style={{ fill: BADGE[card.badge.tone], stroke: "var(--ink)", strokeWidth: 1.5 }} />
          <text x={-(card.badge.text.length * 6.4 + 14) / 2} y={12.5} textAnchor="middle" className="file-badge">
            {card.badge.text}
          </text>
        </g>
      )}
    </g>
  );
}
