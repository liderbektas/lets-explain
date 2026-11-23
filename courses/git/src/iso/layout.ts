import { reachable, type Commit, type Repo } from "../engine/git";

/**
 * Where the commit graph puts every commit, as plain data: the metro map (MetroStage) draws
 * from this. Motion follows Git: commits never change once made, so a commit keeps the spot
 * it was born in and only refs move.
 */

/** The size of every Git lesson's stage. */
export const GIT_STAGE = { width: 860, height: 470 };

/** How many columns of history fit before older ones are trimmed. */
const VISIBLE_COLS = 8;
/** A copy's trip from its original to its new place, and the gap between copies of one rebase. */
export const TRAVEL = 0.75;
export const STAGGER = 0.45;

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

/** How many copies of the same rebase came before this one: copies leave one after another. */
export function copyRank(repo: Repo, c: string): number {
  let rank = 0;
  for (let cur = repo.commits[c]!; ; ) {
    const p = cur.parents[0] ? repo.commits[cur.parents[0]] : undefined;
    if (!p?.from || !cur.from || p.time !== cur.time - 60) return rank;
    rank += 1;
    cur = p;
  }
}

export type RefKind = "branch" | "current" | "tag" | "remote" | "head";

