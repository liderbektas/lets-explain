import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { project, type Frame } from "@lets-explain/core/iso/geometry";
import { IsoBox, type Shades } from "@lets-explain/core/iso/shapes";
import { currentBranch, headId, reachable, short, type Commit, type Repo } from "../engine/git";
import "./git-stage.css";

/**
 * The commit graph as isometric blocks: each commit a cube, time running down-right,
 * one lane per line of work. Branch names are flags above their tip, HEAD is a dark tag on the
 * branch it points to (or straight on a commit when detached), tags are sun-coloured and
 * remote-tracking refs are dashed. Commits nothing can reach any more are drawn as ghosts,
 * which is what makes reset and reflog visible.
 *
 * Motion follows Git: commits never change once made, so a cube keeps the spot it was born in
 * and only refs move. A new commit grows out of its parent. A rebased, cherry-picked, amended
 * or squashed commit is a copy: it lifts off its original, travels to its new place and gets
 * its new id there, while the original stays where it was.
 */

export interface GraphStageProps {
  repo: Repo;
  /** Where to draw inside the SVG. Defaults to the whole 860×470 stage. */
  box?: Box;
  /** Commits to glow, e.g. the ones the last action created. */
  highlight?: Set<string>;
  /** Show commits nothing reaches (after a reset or rebase). Default true. */
  showGhosts?: boolean;
  /** Draw the commit message under each cube. Default true. */
  messages?: boolean;
  /** Order of lanes: the first branch listed keeps the front lane. */
  laneOrder?: string[];
  /** A short caption over the graph, e.g. "origin". */
  title?: string;
  /** Hide HEAD, e.g. for a remote's graph. */
  hideHead?: boolean;
  /** Extra refs to draw (e.g. the remote's branches as "origin/main"), keyed by label. */
  extraRefs?: Record<string, string>;
  /**
   * Where a commit that is new to this graph was drawn elsewhere on the stage, e.g. in the
   * other repository: fetched and pushed commits travel from there instead of growing here.
   */
  arrivals?: (id: string) => [number, number] | undefined;
}

type Box = { x: number; y: number; w: number; h: number };

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
/** A copy's trip from its original to its new place, and the gap between copies of one rebase. */
const TRAVEL = 0.75;
const STAGGER = 0.45;

export interface Layout {
  pos: Map<string, { col: number; lane: number }>;
  laneOf: Map<string, number>;
  ghosts: Set<string>;
  shown: string[];
  /** True when older commits were left out to keep the graph readable. */
  clipped: boolean;
}

/** The line of work a commit was made on; commits made with a detached HEAD share one. */
const lineOf = (c: Commit) => (c.branch === undefined ? "" : (c.branch ?? "(detached)"));

/**
 * Columns by depth from the root. Lanes are given out in the order commits were made and
 * never change afterwards: a commit continues its parent's lane when both were made on the
 * same branch, returns to its branch's lane otherwise, and takes the first free lane when
 * that spot is taken (a rebased copy, a commit after a reset). The first branch in
 * `laneOrder` (main) keeps the front lane. Nothing ever moves because a ref moved.
 */
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

  const front = new Set(opts.laneOrder?.length ? [opts.laneOrder[0]!] : ["main", "master"]);
  const isShown = new Set(shown);
  const born = [...shown].sort((a, b) => repo.commits[a]!.time - repo.commits[b]!.time || (a < b ? -1 : 1));
  const laneOf = new Map<string, number>();
  const cells = new Map<number, Map<number, string>>();
  const home = new Map<string, number>();
  // A spot is free when nothing sits there and no unrelated commit sits right next to it,
  // so every line keeps room for its labels.
  const free = (lane: number, c: string) => {
    const row = cells.get(lane);
    if (!row) return true;
    const col = depth.get(c)!;
    if (row.has(col)) return false;
    const parents = new Set(repo.commits[c]!.parents);
    return [col - 1, col + 1].every((n) => !row.has(n) || parents.has(row.get(n)!));
  };
  for (const c of born) {
    const commit = repo.commits[c]!;
    const line = lineOf(commit);
    const parent = commit.parents[0];
    const wanted: number[] = [];
    if (parent && isShown.has(parent) && laneOf.has(parent) && lineOf(repo.commits[parent]!) === line) wanted.push(laneOf.get(parent)!);
    if (home.has(line)) wanted.push(home.get(line)!);
    if (front.has(line)) wanted.push(0);
    let lane = wanted.find((l) => free(l, c));
    if (lane === undefined) {
      lane = front.has(line) ? 0 : 1;
      while (!free(lane, c)) lane += 1;
    }
    laneOf.set(c, lane);
    if (!cells.has(lane)) cells.set(lane, new Map());
    cells.get(lane)!.set(depth.get(c)!, c);
    home.set(line, lane);
  }

  // Long histories show their newest columns only; older commits trail off to the left.
  const maxCol = Math.max(0, ...shown.map((c) => depth.get(c)!));
  const from = Math.max(0, maxCol - (VISIBLE_COLS - 1));
  const visible = shown.filter((c) => depth.get(c)! >= from);
  const pos = new Map<string, { col: number; lane: number }>();
  for (const c of visible) pos.set(c, { col: depth.get(c)! - from, lane: laneOf.get(c)! });
  return { pos, laneOf, ghosts, shown: visible, clipped: from > 0 };
}

/** Where every commit of a graph is drawn in a box: the same fit GraphStage uses. */
export function graphGeometry(repo: Repo, box: Box, opts: { showGhosts?: boolean; laneOrder?: string[]; messages?: boolean } = {}) {
  const layout = layoutGraph(repo, opts);
  const { pos } = layout;
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
  const padBottom = (opts.messages === false ? 26 : 46) + 62;
  const s = Math.min(52, (box.w - 140) / Math.max(maxX - minX, 1), (box.h - padTop - padBottom) / Math.max(maxY - minY, 1));
  const frame: Frame = {
    s,
    ox: box.x + box.w / 2 - ((minX + maxX) / 2) * s,
    oy: box.y + padTop + (box.h - padTop - padBottom) / 2 - ((minY + maxY) / 2) * s,
  };
  const at = (c: string): [number, number] => {
    const p = pos.get(c)!;
    return project(frame, p.col * COL, -p.lane * LANE);
  };
  return { layout, frame, s, at };
}

/** How many copies of the same rebase came before this one: copies leave one after another. */
function copyRank(repo: Repo, c: string): number {
  let rank = 0;
  for (let cur = repo.commits[c]!; ; ) {
    const p = cur.parents[0] ? repo.commits[cur.parents[0]] : undefined;
    if (!p?.from || !cur.from || p.time !== cur.time - 60) return rank;
    rank += 1;
    cur = p;
  }
}

type RefKind = "branch" | "current" | "tag" | "remote" | "head";

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
  arrivals,
}: GraphStageProps) {
  const { layout, frame, s, at } = graphGeometry(repo, box, { showGhosts, laneOrder, messages });
  const { pos, ghosts, shown } = layout;

  // Refs per commit, drawn as a stack of pills above it.
  const head = headId(repo);
  const branch = currentBranch(repo);
  const refs = new Map<string, { label: string; kind: RefKind }[]>();
  const push = (id: string, r: { label: string; kind: RefKind }) => {
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

  /** Where a commit that just appeared starts, and when it sets off. */
  const entry = (c: string): { from: [number, number]; delay: number; copy: boolean; grow: boolean } => {
    const [x, y] = at(c);
    const commit = repo.commits[c]!;
    // Fetched or pushed: the same commit, travelling over from the other repository.
    const elsewhere = arrivals?.(c);
    if (elsewhere) return { from: elsewhere, delay: 0, copy: false, grow: false };
    const source = commit.from?.find((f) => pos.has(f));
    if (source) return { from: at(source), delay: copyRank(repo, c) * STAGGER, copy: true, grow: false };
    const parent = commit.parents.find((p) => pos.has(p));
    if (parent) return { from: at(parent), delay: 0, copy: false, grow: true };
    return { from: [x, y], delay: 0, copy: false, grow: true };
  };

  // Every pill gets its own place, so a ref that moves glides from its old commit to the new one.
  const pills: { key: string; x: number; y: number; label: string; kind: RefKind; delay: number }[] = [];
  const stems: { id: string; x: number; y: number; delay: number }[] = [];
  let headTab = null as { x: number; y: number; delay: number } | null;
  for (const [id, list] of refs) {
    const [x, y] = at(id);
    // A ref moves to a fresh copy only when the copy has arrived (rebase moves the branch last).
    const fresh = highlight?.has(id) ? entry(id) : null;
    const delay = fresh?.copy ? fresh.delay + TRAVEL : 0;
    // The front lane has nothing below it, so its labels hang under the commit, clear of
    // the lanes behind. Other lanes carry theirs above, clear of the cube's top corner.
    const below = pos.get(id)!.lane === 0;
    const baseY = below ? y + s * 0.45 + (messages ? 30 : 14) : y - s * CUBE * 1.5 - 18;
    if (!below) stems.push({ id, x, y: baseY, delay });
    list.forEach((r, i) => {
      const py = baseY + (below ? 1 : -1) * i * 25;
      const w = pillWidth(r.label);
      if (r.kind === "current") {
        // HEAD rides on the left of the branch it points to; together they stay centred.
        const total = w + HEAD_W;
        headTab = { x: x - total / 2, y: py, delay };
        pills.push({ key: `ref:${r.label}`, x: x - total / 2 + HEAD_W + w / 2, y: py, label: r.label, kind: r.kind, delay });
      } else if (r.kind === "head") {
        headTab = { x: x - HEAD_W / 2 - 6, y: py, delay };
      } else {
        pills.push({ key: `${r.kind === "branch" ? "ref" : r.kind}:${r.label}`, x, y: py, label: r.label, kind: r.kind, delay });
      }
    });
  }

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
      <AnimatePresence initial={false}>
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
              // A link appears once its commit has arrived.
              const arrive = entry(c).delay + TRAVEL;
              return (
                <motion.path
                  key={`${c}-${p}`}
                  initial={{ d, opacity: 0 }}
                  animate={{ d, opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ d: spring, opacity: { duration: 0.3, delay: arrive } }}
                  className={`graph-edge ${ghosts.has(c) ? "is-ghost" : ""} ${i > 0 ? "is-merge" : ""}`}
                />
              );
            }),
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {sorted.map((c) => {
          const [x, y] = at(c);
          const commit = repo.commits[c]!;
          const ghost = ghosts.has(c);
          const tint = ghost ? GHOST : LANE_TINTS[layout.laneOf.get(c)! % LANE_TINTS.length]!;
          const lit = highlight?.has(c);
          const top = project({ ox: 0, oy: 0, s }, 0, 0, CUBE)[1];
          const e = entry(c);
          const stamp = e.delay + (e.grow ? 0.25 : TRAVEL);
          return (
            <CommitNode key={c} x={x} y={y} from={e.from} delay={e.delay} copy={e.copy} grow={e.grow} lift={s * 0.5}>
              <g className={`commit ${ghost ? "is-ghost" : ""} ${lit ? "is-lit" : ""} ${commit.parents.length > 1 ? "is-merge" : ""}`}>
                <IsoBox s={s} at={[-CUBE / 2, -CUBE / 2, 0]} size={[CUBE, CUBE, CUBE]} shades={tint} />
                {/* The id is stamped once the commit is in place: a copy gets a new one. */}
                <motion.text
                  y={top + s * 0.22}
                  textAnchor="middle"
                  className="commit-id"
                  style={{ fontSize: Math.max(9, s * 0.27) }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, delay: stamp }}
                >
                  {short(c).slice(0, 5)}
                </motion.text>
                {messages && (
                  <text y={s * 0.95} textAnchor="middle" className="commit-msg" style={{ fontSize: Math.max(9.5, Math.min(12, s * 0.27)) }}>
                    {clip(commit.message.split("\n")[0]!, 14)}
                  </text>
                )}
              </g>
            </CommitNode>
          );
        })}
      </AnimatePresence>

      {/* Squash and fixup fold several commits into one: the others fly in and merge into the copy. */}
      <AnimatePresence initial={false}>
        {sorted.flatMap((c) =>
          (repo.commits[c]!.from ?? []).slice(1).filter((f) => pos.has(f)).map((f, i) => {
            const [x, y] = at(c);
            const [fx, fy] = at(f);
            return (
              <motion.g
                key={`${c}<${f}`}
                initial={{ x: fx, y: fy, opacity: 1 }}
                animate={{ x, y, opacity: 0 }}
                transition={{ x: { ...spring, delay: (i + 1) * 0.2 }, y: { ...spring, delay: (i + 1) * 0.2 }, opacity: { duration: 0.2, delay: TRAVEL + (i + 1) * 0.2 } }}
                pointerEvents="none"
              >
                <g className="commit">
                  <IsoBox s={s} at={[-CUBE / 2, -CUBE / 2, 0]} size={[CUBE, CUBE, CUBE]} shades={LANE_TINTS[layout.laneOf.get(c)! % LANE_TINTS.length]!} />
                </g>
              </motion.g>
            );
          }),
        )}
      </AnimatePresence>

      {stems.map((st) => (
        <motion.line
          key={`stem-${st.id}`}
          initial={{ opacity: 0 }}
          animate={{ x1: st.x, x2: st.x, y1: st.y + 11, y2: st.y + s * CUBE * 0.5 + 12, opacity: 1 }}
          transition={{ ...spring, opacity: { duration: 0.2, delay: st.delay } }}
          className="ref-stem"
        />
      ))}
      <AnimatePresence initial={false}>
        {headTab && <HeadTab key="HEAD" x={headTab.x} y={headTab.y} delay={headTab.delay} />}
        {pills.map((p) => (
          <RefPill key={p.key} x={p.x} y={p.y} label={p.label} kind={p.kind} delay={p.delay} />
        ))}
      </AnimatePresence>
    </g>
  );
}

/**
 * One commit cube. It sets off from `from` when it first appears (after `delay`, so copies of
 * one rebase leave one after another); later it only follows the graph's fit, with no delay.
 */
function CommitNode({ x, y, from, delay, copy, grow, lift, children }: { x: number; y: number; from: [number, number]; delay: number; copy: boolean; grow: boolean; lift: number; children: ReactNode }) {
  const arrived = useRef(false);
  useEffect(() => {
    arrived.current = true;
  }, []);
  const wait = arrived.current ? 0 : delay;
  // A commit that travels (a copy, or one coming from the other repo) is visible all the way
  // and moves at an even pace; a new commit grows out of its parent.
  const travels = !grow && !arrived.current;
  const move = travels ? { duration: TRAVEL, ease: "easeInOut" as const, delay: wait } : { ...spring, delay: wait };
  return (
    <motion.g
      initial={{ x: from[0], y: from[1], opacity: grow ? 0 : 1, scale: grow ? 0.5 : 1 }}
      animate={{ x, y, opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={{ x: move, y: move, scale: { ...spring, delay: wait }, opacity: { duration: 0.25, delay: wait } }}
    >
      {/* A copy lifts off its original before it travels, and settles at the end. */}
      <motion.g initial={{ y: 0 }} animate={{ y: copy && !arrived.current ? [0, -lift, -lift, 0] : 0 }} transition={{ duration: TRAVEL + 0.15, delay: wait, times: [0, 0.2, 0.8, 1] }}>
        {children}
      </motion.g>
    </motion.g>
  );
}

function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

const HEAD_W = 46;
const pillWidth = (label: string) => Math.round(label.length * 7.3 + 22);

/** A ref label. It glides when its ref moves to another commit. */
function RefPill({ x, y, label, kind, delay }: { x: number; y: number; label: string; kind: RefKind; delay: number }) {
  const w = pillWidth(label);
  return (
    <motion.g initial={{ opacity: 0, x, y: y + 8 }} animate={{ opacity: 1, x, y }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ ...spring, delay }}>
      <rect x={-w / 2} y={-8} width={w} height={22} rx={11} className="pill-shadow" />
      <rect x={-w / 2} y={-11} width={w} height={22} rx={11} className={`ref ref-${kind}`} />
      <text y={4.5} textAnchor="middle" className="ref-text" style={kind === "head" ? { fill: "var(--card)" } : undefined}>
        {label}
      </text>
    </motion.g>
  );
}

/** HEAD: a dark tab. On a branch it sits on the branch's left; detached, it stands on a commit. */
function HeadTab({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <motion.g initial={{ opacity: 0, x, y: y + 8 }} animate={{ opacity: 1, x, y }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ ...spring, delay }}>
      <rect y={-8} width={HEAD_W + 12} height={22} rx={11} className="pill-shadow" />
      <rect y={-11} width={HEAD_W + 12} height={22} rx={11} className="ref-head" />
      <text x={HEAD_W / 2 + 1} y={4.5} textAnchor="middle" className="ref-head-text" style={{ fill: "var(--card)" }}>
        HEAD
      </text>
    </motion.g>
  );
}
