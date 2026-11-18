import { AnimatePresence, motion } from "motion/react";
import { project, type Frame } from "@lets-explain/core/iso/geometry";
import { IsoBox, type Shades } from "@lets-explain/core/iso/shapes";
import { currentBranch, headId, reachable, short, type Repo } from "../engine/git";
import "./git-stage.css";

/**
 * The commit graph as isometric blocks: each commit a cube, time running down-right,
 * one lane per branch. Branch names are flags above their tip, HEAD is a dark tag on the
 * branch it points to (or straight on a commit when detached), tags are sun-coloured and
 * remote-tracking refs are dashed. Commits nothing can reach any more are drawn as ghosts,
 * which is what makes reset and reflog visible.
 */

export interface GraphStageProps {
  repo: Repo;
  /** Where to draw inside the SVG. Defaults to the whole 860×470 stage. */
  box?: { x: number; y: number; w: number; h: number };
  /** Commits to glow, e.g. the ones the last action created. */
  highlight?: Set<string>;
  /** Show commits nothing reaches (after a reset or rebase). Default true. */
  showGhosts?: boolean;
  /** Draw the commit message under each cube. Default true. */
  messages?: boolean;
  /** Order of lanes: branch names listed here come first. */
  laneOrder?: string[];
  /** A short caption over the graph, e.g. "origin". */
  title?: string;
  /** Hide HEAD, e.g. for a remote's graph. */
  hideHead?: boolean;
  /** Extra refs to draw (e.g. the remote's branches as "origin/main"), keyed by label. */
  extraRefs?: Record<string, string>;
}

export const GIT_STAGE = { width: 860, height: 470 };

const LANE_TINTS: Shades[] = [
  ["var(--sun)", "#f2bd3a", "#d9a826"],
  ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"],
  ["var(--lilac)", "#a993ee", "var(--lilac-deep)"],
  ["var(--coral)", "#f08770", "var(--coral-deep)"],
  ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"],
];
const GHOST: Shades = ["#f4efe6", "#e8e0d1", "#ddd3c1"];
const COL = 2.15;
/** Lanes sit behind main (up and to the right), far enough apart for labels and messages. */
const LANE = 3.0;
const CUBE = 0.82;
/** How many columns of history fit before older ones are trimmed. */
const VISIBLE_COLS = 8;
const spring = { type: "spring", stiffness: 160, damping: 22 } as const;

export interface Layout {
  pos: Map<string, { col: number; lane: number }>;
  laneOf: Map<string, number>;
  ghosts: Set<string>;
  shown: string[];
  /** True when older commits were left out to keep the graph readable. */
  clipped: boolean;
}

/** Columns by depth from the root, lanes by which branch first reaches a commit. */
export function layoutGraph(repo: Repo, opts: { showGhosts?: boolean; laneOrder?: string[] } = {}): Layout {
  const live = reachable(repo);
  const all = Object.keys(repo.commits);
  const ghosts = new Set(opts.showGhosts === false ? [] : all.filter((c) => !live.has(c)));
  const shown = all.filter((c) => live.has(c) || ghosts.has(c));

  const depth = new Map<string, number>();
  const depthOf = (c: string): number => {
    const known = depth.get(c);
    if (known !== undefined) return known;
    const parents = repo.commits[c]!.parents.filter((p) => repo.commits[p]);
    const d = parents.length ? Math.max(...parents.map(depthOf)) + 1 : 0;
    depth.set(c, d);
    return d;
  };
  shown.forEach(depthOf);

  // Lane order: listed branches, then the rest by the age of their first own commit.
  const order = [...(opts.laneOrder ?? ["main", "master"])];
  const names = Object.keys(repo.branches).filter((b) => !order.includes(b));
  names.sort((a, b) => repo.commits[repo.branches[a]!]!.time - repo.commits[repo.branches[b]!]!.time);
  const tips: string[] = [
    ...order.filter((b) => repo.branches[b]).map((b) => repo.branches[b]!),
    ...names.map((b) => repo.branches[b]!),
    ...Object.values(repo.tracking),
    ...(headId(repo) ? [headId(repo)!] : []),
    ...Object.values(repo.tags),
    ...[...ghosts].sort((a, b) => repo.commits[b]!.time - repo.commits[a]!.time),
  ];
  const laneOf = new Map<string, number>();
  const isShown = new Set(shown);
  // Columns each lane already uses, so a new chain can share a lane it does not overlap.
  const busy: [number, number][][] = [];
  const chainFrom = (tip: string) => {
    const chain: string[] = [];
    for (let c: string | undefined = tip; c && isShown.has(c) && !laneOf.has(c); c = repo.commits[c]!.parents[0]) chain.push(c);
    return chain;
  };
  const place = (chain: string[], first: boolean) => {
    if (!chain.length) return;
    const cols = chain.map((c) => depth.get(c)!);
    const lo = Math.min(...cols) - 1;
    const hi = Math.max(...cols) + 1;
    // Lane 0 is main's; other chains take the lowest free lane above it.
    let lane = first ? 0 : 1;
    while (!first && (busy[lane] ?? []).some(([a, b]) => lo <= b && a <= hi)) lane += 1;
    (busy[lane] ??= []).push([lo, hi]);
    for (const c of chain) laneOf.set(c, lane);
  };
  tips.forEach((tip, i) => place(chainFrom(tip), i === 0 && busy.length === 0));
  // Side chains that only a merge still reaches (their branch was deleted) share lanes too.
  const byTime = [...shown].sort((a, b) => repo.commits[b]!.time - repo.commits[a]!.time);
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of byTime) {
      if (!laneOf.has(c)) continue;
      for (const p of repo.commits[c]!.parents.slice(1)) {
        const chain = chainFrom(p);
        if (chain.length) {
          place(chain, false);
          changed = true;
        }
      }
    }
  }
  for (const c of byTime) if (!laneOf.has(c)) place(chainFrom(c), false);

  // Long histories show their newest columns only; older commits trail off to the left.
  const maxCol = Math.max(0, ...shown.map((c) => depth.get(c)!));
  const from = Math.max(0, maxCol - (VISIBLE_COLS - 1));
  const visible = shown.filter((c) => depth.get(c)! >= from);
  const pos = new Map<string, { col: number; lane: number }>();
  for (const c of visible) pos.set(c, { col: depth.get(c)! - from, lane: laneOf.get(c)! });
  return { pos, laneOf, ghosts, shown: visible, clipped: from > 0 };
}

export function GraphStage({
  repo,
  box = { x: 0, y: 0, w: GIT_STAGE.width, h: GIT_STAGE.height },
  highlight,
  showGhosts = true,
  messages = true,
  laneOrder,
  title,
  hideHead,
  extraRefs,
}: GraphStageProps) {
  const layout = layoutGraph(repo, { showGhosts, laneOrder });
  const { pos, ghosts, shown } = layout;

  // Fit: project at s = 1, then scale so the whole graph (plus labels) fits the box.
  const cols = Math.max(1, ...[...pos.values()].map((p) => p.col + 1));
  const lanes = Math.max(1, ...[...pos.values()].map((p) => p.lane + 1));
  const unit: Frame = { ox: 0, oy: 0, s: 1 };
  const back = -(lanes - 1) * LANE;
  const corners = [
    project(unit, -0.6, 0.6),
    project(unit, (cols - 1) * COL + 0.6, 0.6),
    project(unit, -0.6, back - 0.6),
    project(unit, (cols - 1) * COL + 0.6, back - 0.6),
  ];
  const minX = Math.min(...corners.map((c) => c[0]));
  const maxX = Math.max(...corners.map((c) => c[0]));
  const minY = Math.min(...corners.map((c) => c[1]));
  const maxY = Math.max(...corners.map((c) => c[1]));
  // Room for labels: above for back lanes, below for the front lane (see the refs below).
  const padTop = lanes > 1 ? 92 : 40;
  const padBottom = (messages ? 46 : 26) + 62;
  const s = Math.min(52, (box.w - 140) / Math.max(maxX - minX, 1), (box.h - padTop - padBottom) / Math.max(maxY - minY, 1));
  const frame: Frame = {
    s,
    ox: box.x + box.w / 2 - ((minX + maxX) / 2) * s,
    oy: box.y + padTop + (box.h - padTop - padBottom) / 2 - ((minY + maxY) / 2) * s,
  };
  const at = (c: string) => {
    const p = pos.get(c)!;
    return project(frame, p.col * COL, -p.lane * LANE);
  };

  // Refs per commit, drawn as a stack of pills above it.
  const head = headId(repo);
  const branch = currentBranch(repo);
  const refs = new Map<string, { label: string; kind: "branch" | "current" | "tag" | "remote" | "head" }[]>();
  const push = (id: string, r: { label: string; kind: "branch" | "current" | "tag" | "remote" | "head" }) => {
    if (!pos.has(id)) return;
    refs.set(id, [...(refs.get(id) ?? []), r]);
  };
  for (const [name, id] of Object.entries(repo.branches)) push(id, { label: name, kind: name === branch && !hideHead ? "current" : "branch" });
  for (const [name, id] of Object.entries(repo.tracking)) push(id, { label: name, kind: "remote" });
  for (const [label, id] of Object.entries(extraRefs ?? {})) push(id, { label, kind: "remote" });
  for (const [name, id] of Object.entries(repo.tags)) push(id, { label: name, kind: "tag" });
  if (head && !branch && !hideHead) push(head, { label: "HEAD", kind: "head" });
  const order = { head: 0, current: 1, branch: 2, tag: 3, remote: 4 };
  for (const list of refs.values()) list.sort((a, b) => order[a.kind] - order[b.kind]);

  const sorted = [...shown].sort((a, b) => {
    const pa = pos.get(a)!;
    const pb = pos.get(b)!;
    return pa.col * COL - pa.lane * LANE - (pb.col * COL - pb.lane * LANE);
  });

  return (
    <g className="git-graph">
      {title && (
        <text x={box.x + 18} y={box.y + 26} className="graph-title">
          {title}
        </text>
      )}
      {shown.length === 0 && (
        <text x={box.x + box.w / 2} y={box.y + box.h / 2} textAnchor="middle" className="label-soft">
          (no commits yet)
        </text>
      )}

      {/* Parent links first, on the ground, so cubes sit on top. */}
      {shown.flatMap((c) =>
        repo.commits[c]!.parents
          .filter((p) => !pos.has(p) && repo.commits[p])
          .map((p) => {
            const [x1, y1] = at(c);
            const cc = pos.get(c)!;
            const [x2, y2] = project(frame, cc.col * COL - COL * 0.75, -cc.lane * LANE);
            return <path key={`${c}-${p}-stub`} d={`M${x1} ${y1} L${x2} ${y2}`} className="graph-edge is-stub" />;
          }),
      )}
      {shown.flatMap((c) =>
        repo.commits[c]!.parents
          .filter((p) => pos.has(p))
          .map((p, i) => {
            const [x1, y1] = at(c);
            const [x2, y2] = at(p);
            const pc = pos.get(p)!;
            const cc = pos.get(c)!;
            // Bend through the corner: along the child's lane back to the parent's column.
            const [bx, by] = project(frame, pc.col * COL, -cc.lane * LANE);
            const d = cc.lane === pc.lane ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} L${bx} ${by} L${x2} ${y2}`;
            return (
              <motion.path
                key={`${c}-${p}`}
                initial={false}
                animate={{ d }}
                transition={spring}
                className={`graph-edge ${ghosts.has(c) ? "is-ghost" : ""} ${i > 0 ? "is-merge" : ""}`}
              />
            );
          }),
      )}

      <AnimatePresence initial={false}>
        {sorted.map((c) => {
          const [x, y] = at(c);
          const commit = repo.commits[c]!;
          const ghost = ghosts.has(c);
          const tint = ghost ? GHOST : LANE_TINTS[layout.laneOf.get(c)! % LANE_TINTS.length]!;
          const lit = highlight?.has(c);
          const top = project({ ox: 0, oy: 0, s }, 0, 0, CUBE)[1];
          return (
            <motion.g
              key={c}
              initial={{ x, y: y - 30, opacity: 0, scale: 0.6 }}
              animate={{ x, y, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={spring}
            >
              <g className={`commit ${ghost ? "is-ghost" : ""} ${lit ? "is-lit" : ""} ${commit.parents.length > 1 ? "is-merge" : ""}`}>
                <IsoBox s={s} at={[-CUBE / 2, -CUBE / 2, 0]} size={[CUBE, CUBE, CUBE]} shades={tint} />
                <text y={top + s * 0.22} textAnchor="middle" className="commit-id" style={{ fontSize: Math.max(9, s * 0.27) }}>
                  {short(c).slice(0, 5)}
                </text>
                {messages && (
                  <text y={s * 0.95} textAnchor="middle" className="commit-msg" style={{ fontSize: Math.max(9.5, Math.min(12, s * 0.27)) }}>
                    {clip(commit.message.split("\n")[0]!, 14)}
                  </text>
                )}
              </g>
            </motion.g>
          );
        })}
      </AnimatePresence>

      {[...refs].map(([id, list]) => {
        const [x, y] = at(id);
        // The front lane has nothing below it, so its labels hang under the commit, clear of
        // the lanes behind. Other lanes carry theirs above, clear of the cube's top corner.
        const below = pos.get(id)!.lane === 0;
        const baseY = below ? y + s * 0.45 + (messages ? 30 : 14) : y - s * CUBE * 1.5 - 18;
        return (
          <motion.g key={`refs-${id}`} initial={false} animate={{ x, y: baseY }} transition={spring}>
            {/* A short stem ties the labels to their own commit, not the neighbour. */}
            {!below && <line x1={0} y1={11} x2={0} y2={s * CUBE * 0.5 + 12} className="ref-stem" />}
            {list.map((r, i) => (
              <RefPill key={`${r.kind}-${r.label}`} y={(below ? 1 : -1) * i * 25} label={r.label} kind={r.kind} withHead={r.kind === "current"} />
            ))}
          </motion.g>
        );
      })}
    </g>
  );
}

function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

/** A ref label. The current branch carries a small dark "HEAD" tab on its left. */
function RefPill({ y, label, kind, withHead }: { y: number; label: string; kind: string; withHead?: boolean }) {
  const w = Math.round(label.length * 7.3 + 22);
  const headW = withHead ? 46 : 0;
  const total = w + headW;
  const x0 = -total / 2;
  return (
    <motion.g initial={{ opacity: 0, y: y + 8 }} animate={{ opacity: 1, y }} transition={spring}>
      {withHead && (
        <g>
          <rect x={x0} y={-8} width={headW + 12} height={22} rx={11} className="pill-shadow" />
          <rect x={x0} y={-11} width={headW + 12} height={22} rx={11} className="ref-head" />
          <text x={x0 + headW / 2 + 1} y={4.5} textAnchor="middle" className="ref-head-text" style={{ fill: "var(--card)" }}>
            HEAD
          </text>
        </g>
      )}
      <rect x={x0 + headW} y={-8} width={w} height={22} rx={11} className="pill-shadow" />
      <rect x={x0 + headW} y={-11} width={w} height={22} rx={11} className={`ref ref-${kind}`} />
      <text x={x0 + headW + w / 2} y={4.5} textAnchor="middle" className="ref-text" style={kind === "head" ? { fill: "var(--card)" } : undefined}>
        {label}
      </text>
    </motion.g>
  );
}
