import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { l, type L } from "@lets-explain/core/i18n";
import { currentBranch, headId, short, type Repo } from "../engine/git";
import { copyRank, GIT_STAGE, layoutGraph, STAGGER, TRAVEL, type RefKind } from "./layout";
import "./metro-stage.css";

/**
 * The commit graph drawn as a metro map, the Git course's one picture of history. Time runs
 * left to right along thick coloured lines; each commit is a round station platform with its
 * short id on top; each line of work is its own coloured line that splits off where a branch
 * starts and joins again at a merge (an interchange, ringed). Branch names are station signs
 * on a post, tags are sun-yellow plaques, remote-tracking refs are dashed signs, HEAD is a dark
 * sign riding on the current branch's sign (or standing alone on a commit when detached), and
 * commits nothing points to any more are faded, out-of-service stations on a dashed track.
 *
 * Motion follows Git: commits never change once made, so a station keeps the spot it was born
 * in and only signs move. A new commit grows out of its parent. A rebased, cherry-picked,
 * amended or squashed commit is a copy: it lifts off its original, travels to its new place
 * and gets its new id there, while the original stays where it was. A fetched or pushed commit
 * is the same commit travelling over from the other repository's map.
 */

export interface MetroStageProps {
  repo: Repo;
  /** Where to draw. Defaults to the whole 860×470 stage. */
  box?: Box;
  /** Commits to glow, e.g. the ones the last action created. */
  highlight?: Set<string>;
  /** Show commits nothing reaches. Default true. */
  showGhosts?: boolean;
  /** Order of lanes: the first branch listed keeps the front line. */
  laneOrder?: string[];
  /** Words for the time arrow in the corner, e.g. ["older", "newer"]. Omit to hide it. */
  time?: [string, string];
  /** A name plate in the board's corner, e.g. "origin (GitHub)". */
  title?: string;
  /** The board's colour: each repository gets its own map. */
  tone?: "lilac" | "sky";
  /** Hide HEAD, e.g. on a remote's map. */
  hideHead?: boolean;
  /** Draw each commit's message under its station. Default true. */
  messages?: boolean;
  /** Extra dashed signs (e.g. a remote's own branches as "origin/main"), keyed by label. */
  extraRefs?: Record<string, string>;
  /**
   * Where a commit that is new to this map was drawn elsewhere on the stage, e.g. on the other
   * repository's map: fetched and pushed commits travel over from there instead of growing here.
   */
  arrivals?: (id: string) => Pt | undefined;
  /** Small plaques hung on stations, e.g. bisect's verdicts or the reflog's names for a commit. */
  marks?: Map<string, StationMark>;
  /** Lesson extras drawn on the map, in the map's own coordinates. */
  overlay?: (geo: MetroGeo) => ReactNode;
  /**
   * How many lines of work this map will need over the whole lesson. Given, the map is
   * centred for that many from the start, so it does not shift when a line appears later.
   */
  lanes?: number;
  /** Translates the drawing's own words. Defaults to English. */
  t?: (x: L) => string;
}

export type StationMark = { label: string; tone: "good" | "bad" | "reflog" };
type Box = { x: number; y: number; w: number; h: number };
type Pt = [number, number];

/** One colour per line of work: the line itself, the platform top and the platform's band. */
const LINES = [
  { line: "#ffd66b", top: "#ffe48f", band: "#f2bd3a" },
  { line: "#a993ee", top: "#d4c8fa", band: "#8f78e0" },
  { line: "#8db4f0", top: "#c3d8fa", band: "#5f8fdc" },
  { line: "#f08770", top: "#ffc2b4", band: "#e2735c" },
  { line: "#7fd3b5", top: "#bfeedd", band: "#4fb08c" },
];
export const metroLine = (lane: number) => LINES[lane % LINES.length]!;

const MAX_COL = 205;
const MAX_LANE = 142;
const spring = { type: "spring", stiffness: 160, damping: 22 } as const;

/** Where the next commit of an operation that stopped half-way (merge, rebase…) would go. */
function pendingCol(repo: Repo, pos: Map<string, { col: number; lane: number }>) {
  const head = headId(repo);
  if (!repo.op || !head || !pos.has(head)) return null;
  return { col: pos.get(head)!.col + 1, lane: pos.get(head)!.lane };
}

/** Where every station sits in the box, and how large things are drawn (k = 1 is full size). */
export function metroGeometry(repo: Repo, box: Box, opts: { showGhosts?: boolean; laneOrder?: string[]; messages?: boolean; lanes?: number } = {}) {
  const layout = layoutGraph(repo, opts);
  const { pos } = layout;
  const pend = pendingCol(repo, pos);
  const cols = Math.max(1, pend ? pend.col + 1 : 1, ...[...pos.values()].map((p) => p.col + 1));
  const lanes = Math.max(1, ...[...pos.values()].map((p) => p.lane + 1));
  const padX = Math.min(96, Math.max(80, box.w * 0.12));
  const colPx = cols > 1 ? Math.min(MAX_COL, (box.w - 2 * padX) / (cols - 1)) : MAX_COL;
  // The front line keeps its height and back lines stack above it, so a new line of work never
  // shifts the stations already drawn. Only when lines run out of room do they close up.
  const padTop = 116;
  const padBottom = opts.messages === false ? 118 : 148;
  const room = box.h - padTop - padBottom;
  const block = Math.max(lanes, opts.lanes ?? 0);
  const lanePx = block > 1 ? Math.min(MAX_LANE, room / (block - 1)) : MAX_LANE;
  // With a known number of lines, the block they fill is centred on the board.
  const spare = opts.lanes ? Math.max(0, room - (block - 1) * lanePx) / 2 : 0;
  // Stations shrink with the room they have, down to a size where their ids still read.
  const k = Math.max(colPx < 90 ? 0.42 : 0.55, Math.min(1, colPx / 170, lanePx / 124));
  const width = (cols - 1) * colPx;
  // History starts at the left and grows to the right; it is centred once it fills the board.
  const x0 = box.x + padX + Math.min(20, (box.w - 2 * padX - width) / 2);
  const y0 = box.y + box.h - padBottom - spare;
  const cell = (col: number, lane: number): Pt => [x0 + col * colPx, y0 - lane * lanePx];
  const at = (c: string): Pt => {
    const p = pos.get(c)!;
    return cell(p.col, p.lane);
  };
  const rx = 45 * k;
  return { layout, at, cell, k, colPx, lanePx, x0, y0, rx, ry: rx / 2, H: 18 * k, pending: pend ? { at: cell(pend.col, pend.lane), lane: pend.lane } : null };
}

export type MetroGeo = ReturnType<typeof metroGeometry>;

/** A polyline with its corners rounded off, the way metro maps bend. */
function roundedPath(points: Pt[], r: number): string {
  if (points.length < 3) return `M${points.map((p) => p.join(" ")).join(" L")}`;
  let d = `M${points[0]![0]} ${points[0]![1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    const [cx, cy] = points[i + 1]!;
    const l1 = Math.hypot(bx - ax, by - ay) || 1;
    const l2 = Math.hypot(cx - bx, cy - by) || 1;
    const r1 = Math.min(r, l1 / 2);
    const r2 = Math.min(r, l2 / 2);
    d += ` L${bx - ((bx - ax) / l1) * r1} ${by - ((by - ay) / l1) * r1} Q${bx} ${by} ${bx + ((cx - bx) / l2) * r2} ${by + ((cy - by) / l2) * r2}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L${last[0]} ${last[1]}`;
}

/**
 * The track from a parent station to its child. Between two lines the bend sits at the front
 * line's end: a branch splits off right after the station it started from, and a merge's
 * other line joins right before the merge station. A line that carries on lower down (after
 * a fast-forward, say) also bends right away, so it never runs under another line's stations.
 */
function trackPath(from: Pt, to: Pt, fromLane: number, toLane: number, colPx: number, lanePx: number, k: number, merge = false): string {
  if (fromLane === toLane) return `M${from[0]} ${from[1]} L${to[0]} ${to[1]}`;
  const run = Math.min(Math.abs(to[1] - from[1]), Math.abs(to[0] - from[0]) * 0.75, colPx * 0.75, lanePx);
  const pts: Pt[] = fromLane < toLane || !merge ? [from, [from[0] + run, to[1]], to] : [from, [to[0] - run, from[1]], to];
  return roundedPath(pts, 26 * k);
}

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

const BOARD_H = 28;
const HEAD_W = 62;
const boardWidth = (label: string) => Math.round(label.length * 9 + 28);

/** The commit a revert undoes, read from the message Git writes for it. */
function revertTarget(message: string): string | null {
  if (!message.startsWith('Revert "')) return null;
  return /This reverts commit ([0-9a-f]+)/.exec(message)?.[1] ?? null;
}

type Sign = { key: string; x: number; y: number; label: string; kind: RefKind; delay: number };
type Post = { id: string; x: number; top: number; bottom: number; delay: number };

const english = (x: L) => x.en;

export function MetroStage({
  repo,
  box = { x: 0, y: 0, w: GIT_STAGE.width, h: GIT_STAGE.height },
  highlight,
  showGhosts = true,
  laneOrder,
  time,
  title,
  tone = "lilac",
  hideHead,
  messages = true,
  extraRefs,
  arrivals,
  marks,
  overlay,
  lanes,
  t = english,
}: MetroStageProps) {
  const geo = metroGeometry(repo, box, { showGhosts, laneOrder, messages, lanes });
  const { layout, at, k, colPx, lanePx, rx, ry, H } = geo;
  const { pos, ghosts, shown } = layout;
  const laneOf = (c: string) => pos.get(c)!.lane;

  const idSize = Math.max(10.5, 16 * k);
  const msgSize = Math.max(10.5, 14 * k);
  const msgChars = Math.max(9, Math.floor(colPx / 9));

  /** Where a commit that just appeared starts, and when it sets off. */
  const entry = (c: string): { from: Pt; delay: number; copy: boolean; grow: boolean; arrived: boolean } => {
    const commit = repo.commits[c]!;
    // Fetched or pushed: the same commit, travelling over from the other repository.
    const elsewhere = arrivals?.(c);
    if (elsewhere) return { from: elsewhere, delay: 0, copy: false, grow: false, arrived: true };
    const source = commit.from?.find((f) => pos.has(f));
    if (source) return { from: at(source), delay: copyRank(repo, c) * STAGGER, copy: true, grow: false, arrived: false };
    const parent = commit.parents.find((p) => pos.has(p));
    if (parent) return { from: at(parent), delay: 0, copy: false, grow: true, arrived: false };
    return { from: at(c), delay: 0, copy: false, grow: true, arrived: false };
  };

  // Refs per commit.
  const branch = currentBranch(repo);
  const head = headId(repo);
  const refs = new Map<string, { label: string; kind: RefKind }[]>();
  const add = (id: string, r: { label: string; kind: RefKind }) => {
    if (!pos.has(id)) return;
    refs.set(id, [...(refs.get(id) ?? []), r]);
  };
  for (const [name, id] of Object.entries(repo.branches)) add(id, { label: name, kind: name === branch && !hideHead ? "current" : "branch" });
  for (const [name, id] of Object.entries(repo.tracking)) add(id, { label: name, kind: "remote" });
  for (const [label, id] of Object.entries(extraRefs ?? {})) add(id, { label, kind: "remote" });
  for (const [name, id] of Object.entries(repo.tags)) add(id, { label: name, kind: "tag" });
  if (head && !branch && !hideHead) add(head, { label: "HEAD", kind: "head" });
  const order = { head: 0, current: 1, branch: 2, tag: 3, remote: 4 };
  for (const list of refs.values()) list.sort((a, b) => order[a.kind] - order[b.kind]);

  // Signs stand on a post: in front of a front-line station (below it, past its caption),
  // behind a station on a back line (above it). Each board keeps its own key, so a branch
  // that moves glides over to its new station.
  const signs: Sign[] = [];
  const posts: Post[] = [];
  let headSign = null as { x: number; y: number; delay: number } | null;
  const row = BOARD_H + 6;
  const captionRoom = messages ? msgSize + 18 : 0;
  // Stacks next to each other would overlap when stations are close: a stack that would
  // touch its neighbour's steps one row further out.
  const taken: { x1: number; x2: number; y1: number; y2: number }[] = [];
  const signW = (r: { label: string; kind: RefKind }) => (r.kind === "current" ? HEAD_W + 6 + boardWidth(r.label) : r.kind === "head" ? HEAD_W : boardWidth(r.label) + (r.kind === "tag" ? 12 : 0));
  const stacks = [...refs].sort(([a], [b]) => at(a)[0] - at(b)[0]);
  for (const [id, list] of stacks) {
    const [x, y] = at(id);
    const fresh = highlight?.has(id) ? entry(id) : null;
    const delay = fresh?.copy ? fresh.delay + TRAVEL : 0;
    const front = laneOf(id) === 0;
    const dir = front ? 1 : -1;
    const base = front ? y + ry + 18 + captionRoom : y - H - ry - 32;
    const rects = (shift: number) =>
      list.map((r, i) => {
        const cy = base + dir * (i + shift) * row;
        return { x1: x - signW(r) / 2 - 4, x2: x + signW(r) / 2 + 4, y1: cy - BOARD_H / 2, y2: cy + BOARD_H / 2 };
      });
    let shift = 0;
    while (shift < 4 && rects(shift).some((a) => taken.some((b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2))) shift += 1;
    taken.push(...rects(shift));
    const firstY = base + dir * shift * row;
    list.forEach((r, i) => {
      const by = firstY + dir * i * row;
      const w = boardWidth(r.label);
      if (r.kind === "current") {
        const total = HEAD_W + 6 + w;
        headSign = { x: x - total / 2, y: by, delay };
        signs.push({ key: `ref:${r.label}`, x: x - total / 2 + HEAD_W + 6 + w / 2, y: by, label: r.label, kind: r.kind, delay });
      } else if (r.kind === "head") {
        headSign = { x: x - HEAD_W / 2, y: by, delay };
      } else {
        signs.push({ key: `${r.kind === "branch" ? "ref" : r.kind}:${r.label}`, x, y: by, label: r.label, kind: r.kind, delay });
      }
    });
    const lastY = firstY + dir * (list.length - 1) * row;
    posts.push(front ? { id, x, top: firstY, bottom: lastY + BOARD_H / 2 + 9, delay } : { id, x, top: lastY, bottom: y - H - ry * 0.55, delay });
  }

  // The warning sign of a stopped operation: in front of a front-line station (below it,
  // clear of the other signs), above a station on a back line.
  let warn = null as { x: number; y: number; w: number; h: number; lines: string[]; done: boolean; below: boolean } | null;
  if (geo.pending && repo.op) {
    const open = repo.op.conflicts;
    const done = open.length === 0;
    const next = repo.op.kind === "merge" ? "git commit" : `git ${repo.op.kind} --continue`;
    const lines = done ? [t(l("hazır:", "ready:")), next] : ["conflict:", ...open.slice(0, 3)];
    const w = Math.max(...lines.map((s) => s.length * 8 + 54), 120);
    const h = 16 + lines.length * 17;
    const [px, py] = geo.pending.at;
    const x = Math.max(box.x + 24, Math.min(px - w / 2, box.x + box.w - 24 - w));
    // Everything already on the map: signs, and each station with its caption.
    const blocks = [
      ...taken,
      ...shown.map((c) => {
        const [sx, sy] = at(c);
        const half = Math.max(rx, messages ? Math.min(repo.commits[c]!.message.length * msgSize * 0.3, colPx / 2) : 0);
        return { x1: sx - half, x2: sx + half, y1: sy - H - ry, y2: sy + ry + captionRoom };
      }),
      { x1: px - rx, x2: px + rx, y1: py - H - ry, y2: py + ry + captionRoom },
    ];
    const overlap = (y: number) => blocks.reduce((sum, r) => sum + Math.max(0, Math.min(x + w, r.x2) - Math.max(x, r.x1)) * Math.max(0, Math.min(y + h, r.y2) - Math.max(y, r.y1)), 0);
    // Above the station first, then in front of it; the spot that covers least wins.
    const upper = py - H - ry - 22 - h;
    const lower = py + ry + captionRoom + 10;
    const spots = [
      ...Array.from({ length: 14 }, (_, i) => ({ y: upper - i * 12, below: false })),
      ...Array.from({ length: 14 }, (_, i) => ({ y: lower + i * 12, below: true })),
    ].filter((c) => c.y > box.y + 46 && c.y + h < box.y + box.h - 22);
    const best = spots.reduce<{ y: number; below: boolean; cost: number } | null>((acc, c) => {
      const cost = overlap(c.y) + Math.abs(c.y - (c.below ? lower : upper)) * 0.5;
      return !acc || cost < acc.cost ? { ...c, cost } : acc;
    }, null) ?? { y: upper, below: false };
    const y = best.y;
    const below = best.below;
    warn = { x, y, w, h, lines, done, below };
  }

  // Tracks: one per parent link. The line takes the colour of the line the child is on; a
  // merge's second parent is the other line coming in, so it keeps its own colour.
  type Track = { key: string; d: string; color: string; ghost: boolean; merge: boolean; delay: number };
  const tracks: Track[] = [];
  for (const c of shown) {
    repo.commits[c]!.parents.forEach((p, i) => {
      if (!pos.has(p)) return;
      const d = trackPath(at(p), at(c), laneOf(p), laneOf(c), colPx, lanePx, k, i > 0);
      const e = entry(c);
      tracks.push({ key: `${c}-${p}`, d, color: metroLine(i > 0 ? laneOf(p) : laneOf(c)).line, ghost: ghosts.has(c), merge: i > 0, delay: e.delay + TRAVEL });
    });
  }
  // History cut off on the left trails off as a dashed stub.
  const stubs = shown.flatMap((c) =>
    repo.commits[c]!.parents
      .filter((p) => !pos.has(p) && repo.commits[p])
      .map((p) => {
        const [x, y] = at(c);
        return { key: `${c}-${p}-stub`, d: `M${x} ${y} L${x - colPx * 0.6} ${y}` };
      }),
  );

  // Reverts: a new station that undoes an older one, linked to it by a dashed arc.
  const reverts = shown.flatMap((c) => {
    const target = revertTarget(repo.commits[c]!.message);
    const hit = target ? [...pos.keys()].find((id) => id === target || id.startsWith(target)) : undefined;
    return hit ? [{ c, target: hit }] : [];
  });

  // An operation stopped half-way: the commit it will make is not there yet.
  const pending = geo.pending && repo.op ? { ...geo.pending, op: repo.op } : null;

  const lineW = 13 * k + 3;
  const outlineW = lineW + 5;
  const sorted = [...shown].sort((a, b) => laneOf(b) - laneOf(a) || pos.get(a)!.col - pos.get(b)!.col);
  const gridX = Array.from({ length: Math.floor((box.w - 60) / 44) }, (_, i) => box.x + 36 + (i + 1) * 44);
  const gridY = Array.from({ length: Math.floor((box.h - 40) / 44) }, (_, i) => box.y + 20 + (i + 1) * 44);
  const titleW = title ? Math.round(title.length * 8.4 + 30) : 0;

  return (
    <g className={`metro tone-${tone}`}>
      {/* The map board everything is drawn on. */}
      <rect x={box.x + 14} y={box.y + 12} width={box.w - 28} height={box.h - 16} rx={22} className="metro-board-shadow" />
      <rect x={box.x + 14} y={box.y + 8} width={box.w - 28} height={box.h - 16} rx={22} className="metro-board" />
      {/* Map paper: a faint grid. */}
      {gridX.map((gx) => (
        <line key={`gx${gx}`} x1={gx} x2={gx} y1={box.y + 10} y2={box.y + box.h - 10} className="metro-grid" />
      ))}
      {gridY.map((gy) => (
        <line key={`gy${gy}`} x1={box.x + 16} x2={box.x + box.w - 16} y1={gy} y2={gy} className="metro-grid" />
      ))}
      {title && (
        <g transform={`translate(${box.x + 30} ${box.y + 22})`}>
          <rect y={3} width={titleW} height={28} rx={8} className="metro-board-ink" />
          <rect width={titleW} height={28} rx={8} className="metro-title-plate" />
          <text x={titleW / 2} y={19.5} textAnchor="middle" className="metro-title">
            {title}
          </text>
        </g>
      )}
      {time && (
        <g transform={`translate(${title ? box.x + box.w - 44 - (time[0].length + time[1].length) * 8 - 92 + 8 : box.x + 36} ${box.y + 36})`}>
          <text className="metro-time">{time[0]}</text>
          <path d={`M${time[0].length * 8 + 10} -4.5 h70 m-7 -5 l7 5 l-7 5`} className="metro-time-arrow" />
          <text x={time[0].length * 8 + 92} className="metro-time">
            {time[1]}
          </text>
        </g>
      )}

      {shown.length === 0 && (
        <text x={box.x + box.w / 2} y={box.y + box.h / 2} textAnchor="middle" className="metro-caption">
          {t(l("(henüz commit yok)", "(no commits yet)"))}
        </text>
      )}

      {stubs.map((s) => (
        <path key={s.key} d={s.d} className="metro-stub" />
      ))}

      {/* The commit a stopped operation will make: dashed track in, nothing built yet. */}
      {pending && <PendingTracks pending={pending} repo={repo} at={at} laneOf={laneOf} has={(c) => pos.has(c)} geo={geo} />}

      {/* All outlines first, then all colours, so lines that meet at a station blend into one. */}
      <AnimatePresence initial={false}>
        {tracks.map((tr) => (
          <motion.path
            key={`o:${tr.key}`}
            initial={{ d: tr.d, opacity: 0 }}
            animate={{ d: tr.d, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ d: spring, opacity: { duration: 0.3, delay: tr.delay } }}
            className={`metro-track-outline ${tr.ghost ? "is-ghost" : ""}`}
            style={{ strokeWidth: tr.ghost ? 3 : outlineW }}
          />
        ))}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {tracks
          .filter((tr) => !tr.ghost)
          .map((tr) => (
            <motion.path
              key={`c:${tr.key}`}
              initial={{ d: tr.d, opacity: 0 }}
              animate={{ d: tr.d, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ d: spring, opacity: { duration: 0.3, delay: tr.delay } }}
              className="metro-track"
              style={{ stroke: tr.color, strokeWidth: lineW }}
            />
          ))}
      </AnimatePresence>
      {/* A merge's second parent is marked with a dotted centre. */}
      <AnimatePresence initial={false}>
        {tracks
          .filter((tr) => tr.merge && !tr.ghost)
          .map((tr) => (
            <motion.path
              key={`m:${tr.key}`}
              initial={{ d: tr.d, opacity: 0 }}
              animate={{ d: tr.d, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ d: spring, opacity: { duration: 0.3, delay: tr.delay } }}
              className="metro-track-merge"
            />
          ))}
      </AnimatePresence>

      {/* Posts behind back-line stations go under the platforms. */}
      {posts
        .filter((p) => p.bottom < at(p.id)[1])
        .map((p) => (
          <SignPost key={`post:${p.id}`} {...p} k={k} />
        ))}

      {pending && <PendingStation x={pending.at[0]} y={pending.at[1]} rx={rx * 1.18} h={H} op={pending.op} t={t} msgSize={msgSize} />}

      <AnimatePresence initial={false}>
        {sorted.map((c) => {
          const [x, y] = at(c);
          const commit = repo.commits[c]!;
          const ghost = ghosts.has(c);
          const tint = metroLine(laneOf(c));
          const merge = commit.parents.length > 1;
          const R = merge ? rx * 1.18 : rx;
          const e = entry(c);
          // The id is stamped once the commit is in place: a copy gets a new one. A fetched or
          // pushed commit is the same commit, so it carries its id all the way.
          const stamp = e.arrived ? 0 : e.delay + (e.grow ? 0.25 : TRAVEL);
          const front = laneOf(c) === 0;
          const undo = reverts.some((r) => r.c === c);
          return (
            <CommitNode key={c} x={x} y={y} from={e.from} delay={e.delay} copy={e.copy} grow={e.grow} lift={34 * k}>
              <g className={`metro-station ${ghost ? "is-ghost" : ""} ${highlight?.has(c) ? "is-lit" : ""}`}>
                <Platform rx={R} ry={R / 2} h={H} top={ghost ? "var(--paper-2)" : tint.top} band={ghost ? "var(--line)" : tint.band} merge={merge} />
                <motion.text
                  y={-H + idSize * 0.36}
                  textAnchor="middle"
                  className="metro-id"
                  style={{ fontSize: idSize }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, delay: stamp }}
                >
                  {short(c).slice(0, 5)}
                </motion.text>
                {messages && (
                  <text y={R / 2 + 10 + msgSize} textAnchor="middle" className="metro-caption" style={{ fontSize: msgSize }}>
                    {clip(commit.message.split("\n")[0]!, front ? msgChars + 2 : msgChars)}
                  </text>
                )}
                {undo && <UndoBadge x={-R - 6} y={-H / 2} k={k} />}
              </g>
            </CommitNode>
          );
        })}
      </AnimatePresence>

      {/* Squash and fixup fold several commits into one: the others fly in and merge into the copy. */}
      <AnimatePresence initial={false}>
        {sorted.flatMap((c) =>
          (repo.commits[c]!.from ?? [])
            .slice(1)
            .filter((f) => pos.has(f))
            .map((f, i) => {
              const [x, y] = at(c);
              const [fx, fy] = at(f);
              const tint = metroLine(laneOf(c));
              return (
                <motion.g
                  key={`${c}<${f}`}
                  initial={{ x: fx, y: fy, opacity: 1 }}
                  animate={{ x, y, opacity: 0 }}
                  transition={{ x: { ...spring, delay: (i + 1) * 0.2 }, y: { ...spring, delay: (i + 1) * 0.2 }, opacity: { duration: 0.2, delay: TRAVEL + (i + 1) * 0.2 } }}
                  pointerEvents="none"
                >
                  <g className="metro-station">
                    <Platform rx={rx} ry={ry} h={H} top={tint.top} band={tint.band} merge={false} />
                  </g>
                </motion.g>
              );
            }),
        )}
      </AnimatePresence>

      {reverts.map(({ c, target }) => (
        <RevertArc key={`undo:${c}`} from={at(c)} to={at(target)} lift={H + ry + 26} label={t(l("geri alır", "undoes"))} delay={entry(c).delay + 0.3} />
      ))}

      {marks &&
        [...marks].map(([c, m]) => {
          if (!pos.has(c)) return null;
          const [x, y] = at(c);
          const backWithSigns = laneOf(c) > 0 && refs.has(c);
          const my = backWithSigns ? y + ry + captionRoom + 22 : y - H - ry - 18;
          return <Plaque key={`mark:${c}`} x={x} y={my} mark={m} />;
        })}

      {overlay?.(geo)}

      {posts
        .filter((p) => p.bottom >= at(p.id)[1])
        .map((p) => (
          <SignPost key={`post:${p.id}`} {...p} k={k} />
        ))}
      <AnimatePresence initial={false}>
        {headSign && <HeadSign key="HEAD" x={headSign.x} y={headSign.y} delay={headSign.delay} />}
        {signs.map((s) => (
          <Board key={s.key} x={s.x} y={s.y} label={s.label} kind={s.kind} delay={s.delay} />
        ))}
      </AnimatePresence>
      {pending && warn && <WarningSign {...warn} px={pending.at[0]} top={pending.at[1] - H - ry - 4} k={k} />}
    </g>
  );
}

/**
 * One commit station. It sets off from `from` when it first appears (after `delay`, so copies
 * of one rebase leave one after another); later it only follows the map's fit, with no delay.
 */
export function CommitNode({ x, y, from, delay, copy, grow, lift, children }: { x: number; y: number; from: Pt; delay: number; copy: boolean; grow: boolean; lift: number; children: ReactNode }) {
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

/** A round platform: a short cylinder with a coloured band, its top in the line's colour. */
export function Platform({ rx, ry, h, top, band, merge }: { rx: number; ry: number; h: number; top: string; band: string; merge: boolean }) {
  const side = `M${-rx} ${-h} L${-rx} 0 A${rx} ${ry} 0 0 0 ${rx} 0 L${rx} ${-h} Z`;
  const bh = h * 0.42;
  const bandPath = `M${-rx} ${-bh} A${rx} ${ry} 0 0 0 ${rx} ${-bh} L${rx} 0 A${rx} ${ry} 0 0 1 ${-rx} 0 Z`;
  return (
    <g>
      <ellipse cx={3} cy={4} rx={rx + 2} ry={ry + 1.5} className="metro-shadow" />
      <path d={side} className="metro-side" />
      <path d={bandPath} className="metro-band" style={{ fill: band }} />
      <ellipse cy={-h} rx={rx} ry={ry} className="metro-top" style={{ fill: top }} />
      {/* An interchange (a merge, where two lines meet) gets a second ring. */}
      {merge && <ellipse cy={-h} rx={rx * 0.8} ry={ry * 0.8} className="metro-ring" />}
    </g>
  );
}

/** The post a stack of signs stands on, with its foot on the ground. */
function SignPost({ x, top, bottom, delay, k }: Post & { k: number }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay }}>
      <motion.line initial={false} animate={{ x1: x, x2: x, y1: top, y2: bottom }} transition={spring} className="metro-post" />
      <motion.ellipse initial={false} animate={{ cx: x, cy: bottom }} transition={spring} rx={7 * k + 2} ry={3.5 * k + 1} className="metro-foot" />
    </motion.g>
  );
}

/** A station sign with a ref's name; a tag is a plaque with a hole. It glides when its ref moves. */
function Board({ x, y, label, kind, delay }: { x: number; y: number; label: string; kind: RefKind; delay: number }) {
  const w = boardWidth(label) + (kind === "tag" ? 12 : 0);
  const h2 = BOARD_H / 2;
  // A tag: a plaque with a cut-off left end and a hole for its string.
  const tagPath = `M${-w / 2 + 12} ${-h2} H${w / 2 - 6} Q${w / 2} ${-h2} ${w / 2} ${-h2 + 6} V${h2 - 6} Q${w / 2} ${h2} ${w / 2 - 6} ${h2} H${-w / 2 + 12} L${-w / 2} 0 Z`;
  return (
    <motion.g initial={{ opacity: 0, x, y: y + 8 }} animate={{ opacity: 1, x, y }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ ...spring, delay }}>
      {kind === "tag" ? (
        <>
          <path d={tagPath} transform="translate(0 3)" className="metro-board-ink" />
          <path d={tagPath} className="metro-sign metro-sign-tag" />
          <circle cx={-w / 2 + 11} cy={0} r={3} className="metro-tag-hole" />
        </>
      ) : (
        <>
          <rect x={-w / 2} y={-h2 + 3} width={w} height={BOARD_H} rx={7} className="metro-board-ink" />
          <rect x={-w / 2} y={-h2} width={w} height={BOARD_H} rx={7} className={`metro-sign metro-sign-${kind}`} />
        </>
      )}
      <text x={kind === "tag" ? 6 : 0} y={5.5} textAnchor="middle" className="metro-sign-text">
        {label}
      </text>
    </motion.g>
  );
}

/** HEAD: a dark sign. On a branch it rides on the left of that branch's sign; detached, it stands on a commit. */
function HeadSign({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <motion.g initial={{ opacity: 0, x, y: y + 8 }} animate={{ opacity: 1, x, y }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ ...spring, delay }}>
      <rect y={-BOARD_H / 2 + 3} width={HEAD_W} height={BOARD_H} rx={7} className="metro-board-ink" />
      <rect y={-BOARD_H / 2} width={HEAD_W} height={BOARD_H} rx={7} className="metro-head" />
      <circle cx={12} cy={0} r={4} className="metro-head-dot" />
      <text x={HEAD_W / 2 + 6} y={5} textAnchor="middle" className="metro-head-text">
        HEAD
      </text>
    </motion.g>
  );
}

/** A small plaque hung over a station: a bisect verdict, or the reflog's name for a commit. */
function Plaque({ x, y, mark }: { x: number; y: number; mark: StationMark }) {
  const w = Math.round(mark.label.length * (mark.tone === "reflog" ? 7.6 : 7.4) + 20);
  return (
    <motion.g initial={{ opacity: 0, x, y: y - 6 }} animate={{ opacity: 1, x, y }} transition={spring}>
      <rect x={-w / 2} y={-11 + 2.5} width={w} height={22} rx={11} className="metro-board-ink" />
      <rect x={-w / 2} y={-11} width={w} height={22} rx={11} className={`metro-plaque is-${mark.tone}`} />
      <text y={4.5} textAnchor="middle" className={`metro-plaque-text is-${mark.tone}`}>
        {mark.label}
      </text>
    </motion.g>
  );
}

/** The arrow-back badge on a revert station. */
function UndoBadge({ x, y, k }: { x: number; y: number; k: number }) {
  const r = 9 * Math.max(0.8, k) + 2;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cy={2} r={r} className="metro-board-ink" />
      <circle r={r} className="metro-undo" />
      <path d={`M${r * 0.45} ${r * 0.4} A${r * 0.45} ${r * 0.45} 0 1 0 ${-r * 0.45} ${-r * 0.05} M${-r * 0.45} ${-r * 0.5} V${-r * 0.02} H${-r * 0.02}`} className="metro-undo-mark" />
    </g>
  );
}

/** A revert's link to the commit it undoes: a dashed arc over the map. */
function RevertArc({ from, to, lift, label, delay }: { from: Pt; to: Pt; lift: number; label: string; delay: number }) {
  const top = Math.min(from[1], to[1]) - lift;
  const mx = (from[0] + to[0]) / 2;
  const d = `M${from[0]} ${from[1] - lift * 0.55} C${from[0]} ${top - 18} ${to[0]} ${top - 18} ${to[0]} ${to[1] - lift * 0.55}`;
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay }}>
      <path d={d} className="metro-undo-arc" />
      <path d={`M${to[0] - 6} ${to[1] - lift * 0.55 - 9} L${to[0]} ${to[1] - lift * 0.55} L${to[0] + 6} ${to[1] - lift * 0.55 - 9}`} className="metro-undo-arc is-head" />
      <text x={mx} y={top - 6} textAnchor="middle" className="metro-undo-label">
        {label}
      </text>
    </motion.g>
  );
}

type Pending = { at: Pt; lane: number; op: NonNullable<Repo["op"]> };

/** The commit an operation is building comes from: merge's other side, or the commit being copied. */
function pendingSource(op: Pending["op"]): string {
  if (op.kind === "merge") return op.theirs;
  if (op.kind === "rebase") return op.applying;
  return op.target;
}

/** Dashed track into the station a stopped operation will build: from HEAD, and for a merge also from the other side. */
function PendingTracks({ pending, repo, at, laneOf, has, geo }: { pending: Pending; repo: Repo; at: (c: string) => Pt; laneOf: (c: string) => number; has: (c: string) => boolean; geo: MetroGeo }) {
  const head = headId(repo)!;
  const src = pendingSource(pending.op);
  const merge = pending.op.kind === "merge";
  const ds: { d: string; copy: boolean }[] = [{ d: `M${at(head)[0]} ${at(head)[1]} L${pending.at[0]} ${pending.at[1]}`, copy: false }];
  if (has(src)) {
    const [sx, sy] = at(src);
    ds.push(
      merge
        ? { d: trackPath(at(src), pending.at, laneOf(src), pending.lane, geo.colPx, geo.lanePx, geo.k, true), copy: false }
        : { d: `M${sx} ${sy - geo.H - geo.ry} Q${(sx + pending.at[0]) / 2} ${Math.min(sy, pending.at[1]) - geo.lanePx * 0.6 - 30} ${pending.at[0]} ${pending.at[1] - geo.H - geo.ry}`, copy: true },
    );
  }
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {ds.map((x, i) => (
        <path key={i} d={x.d} className={x.copy ? "metro-copy-arc" : "metro-pending-track"} />
      ))}
    </motion.g>
  );
}

/** The station a stopped operation will build: an outline only, it is not a commit yet. */
function PendingStation({ x, y, rx, h, op, t, msgSize }: { x: number; y: number; rx: number; h: number; op: Pending["op"]; t: (x: L) => string; msgSize: number }) {
  const ry = rx / 2;
  const side = `M${-rx} ${-h} L${-rx} 0 A${rx} ${ry} 0 0 0 ${rx} 0 L${rx} ${-h} Z`;
  const caption = op.kind === "merge" ? l("merge bekliyor", "merge waiting") : l("kopya bekliyor", "copy waiting");
  return (
    <motion.g initial={{ opacity: 0, x, y }} animate={{ opacity: 1, x, y }} transition={spring} className="metro-pending">
      <path d={side} className="metro-pending-side" />
      <ellipse cy={-h} rx={rx} ry={ry} className="metro-pending-top" />
      <text y={-h + 5} textAnchor="middle" className="metro-id" style={{ fontSize: 15, fill: "var(--ink-3)" }}>
        ?
      </text>
      <text y={ry + 10 + msgSize} textAnchor="middle" className="metro-caption" style={{ fontSize: msgSize }}>
        {t(caption)}
      </text>
    </motion.g>
  );
}

/**
 * A warning sign at the station a stopped operation will build: which files are in conflict,
 * or, once all are resolved and added, the command that finishes the job. It stands on its own
 * post: in front of the station, or behind it on a back line.
 */
function WarningSign({ x, y, w, h, lines, done, below, px, top, k }: { x: number; y: number; w: number; h: number; lines: string[]; done: boolean; below: boolean; px: number; top: number; k: number }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {below ? (
        <>
          <line x1={px} x2={px} y1={y + h / 2} y2={y + h + 12} className="metro-post" />
          <ellipse cx={px} cy={y + h + 12} rx={7 * k + 2} ry={3.5 * k + 1} className="metro-foot" />
        </>
      ) : (
        <line x1={px} x2={px} y1={y + h} y2={top} className="metro-post" />
      )}
      <rect x={x} y={y + 3} width={w} height={h} rx={9} className="metro-board-ink" />
      <rect x={x} y={y} width={w} height={h} rx={9} className={`metro-warn ${done ? "is-done" : ""}`} />
      <g transform={`translate(${x + 20} ${y + 21})`}>
        {done ? (
          <>
            <circle r={9} className="metro-warn-badge is-done" />
            <path d="M-4 0 L-1 3.5 L4.5 -3" className="metro-warn-tick" />
          </>
        ) : (
          <>
            <path d="M0 -10 L10 8 L-10 8 Z" className="metro-warn-badge" />
            <text y={6} textAnchor="middle" className="metro-warn-bang">
              !
            </text>
          </>
        )}
      </g>
      {lines.map((s, i) => (
        <text key={i} x={x + 38} y={y + 25 + i * 17} className={i === 0 ? "metro-warn-head" : "metro-warn-file"}>
          {s}
        </text>
      ))}
    </motion.g>
  );
}
