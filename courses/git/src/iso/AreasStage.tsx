import { AnimatePresence, motion } from "motion/react";
import { headFiles, headId, isIgnored, ignorePatterns, short, type GitEvent, type Repo } from "../engine/git";
import { Platform } from "./MetroStage";
import "./git-stage.css";

/**
 * Git's three areas side by side, drawn as places: the working tree is a desk with your files
 * on it, the staging area (the index) is a station platform where the next commit's files
 * wait, and the repository is the metro map of commits. Every area shows a full set of files,
 * which is how Git really works: the index is not a list of changes but a complete
 * snapshot-in-waiting, and committing does not empty it.
 *
 * `git add` copies a file from the desk onto the platform. `git commit` loads copies of
 * everything on the platform onto a train, which runs to the map and becomes the new station.
 * `restore` copies the platform's version back onto the desk; `restore --staged` copies the
 * last commit's version back onto the platform.
 */

export type AreaFlow = "add" | "commit" | "restore" | "unstage" | null;

export interface AreasLabels {
  work: string;
  index: string;
  repo: string;
  workSub: string;
  indexSub: string;
  repoSub: string;
  empty: string;
  untracked: string;
  modified: string;
  deleted: string;
  staged: string;
  ignored: string;
  noCommits: string;
}

interface Props {
  repo: Repo;
  labels: AreasLabels;
  /** Which arrow to light up for the last action. */
  flow?: AreaFlow;
  /** Events of the last action: the files it copied travel from one area to the next. */
  last?: GitEvent[];
  box?: { x: number; y: number; w: number; h: number };
}

const spring = { type: "spring", stiffness: 180, damping: 22 } as const;
/** When a commit's train reaches the map: the new station appears then. */
const ARRIVE = 1.35;
const CARD_H = 42;
const ROW = 50;
const MAX = [6, 6, 4];

type Badge = { text: string; tone: "new" | "mod" | "del" | "ok" | "ign" } | null;
type Card = { path: string; content: string; badge: Badge };

export function AreasStage({ repo, labels, flow = null, last, box = { x: 0, y: 0, w: 860, h: 470 } }: Props) {
  // Wide enough for "git commit" between two areas.
  const gap = 84;
  const areaW = (box.w - 24 - gap * 2) / 3;
  const areaH = box.h - 40;
  const xs = [0, 1, 2].map((i) => box.x + 12 + i * (areaW + gap)) as [number, number, number];
  const top = box.y + 20;
  const cardsY = top + 74;
  const head = headFiles(repo);
  const patterns = ignorePatterns(repo);

  const workCards: Card[] = Object.keys(repo.work)
    .sort()
    .map((p) => {
      let badge: Badge = null;
      if (!(p in repo.index)) badge = isIgnored(patterns, p) ? { text: labels.ignored, tone: "ign" } : { text: labels.untracked, tone: "new" };
      else if (repo.work[p] !== repo.index[p]) badge = { text: labels.modified, tone: "mod" };
      return { path: p, content: repo.work[p]!, badge };
    });
  for (const p of Object.keys(repo.index)) {
    if (!(p in repo.work)) workCards.push({ path: p, content: "", badge: { text: labels.deleted, tone: "del" } });
  }
  const indexCards: Card[] = Object.keys(repo.index)
    .sort()
    .map((p) => ({ path: p, content: repo.index[p]!, badge: repo.index[p] !== head[p] ? ({ text: labels.staged, tone: "ok" } as Badge) : null }));
  for (const p of Object.keys(head)) {
    if (!(p in repo.index)) indexCards.push({ path: p, content: "", badge: { text: labels.deleted, tone: "del" } });
  }
  const repoCards: Card[] = Object.keys(head)
    .sort()
    .map((p) => ({ path: p, content: head[p]!, badge: null }));

  const tip = headId(repo);
  const history: string[] = [];
  for (let c = tip; c && history.length < 3; c = repo.commits[c]!.parents[0] ?? null) history.push(c);
  // Oldest at the top, the newest at the bottom, where the track from the platform comes in.
  history.reverse();

  const floor = top + areaH;
  const trackY = floor - 26;
  const stationX = xs[2] + 40;
  const rowY = (i: number) => trackY - (history.length - 1 - i) * 30;
  const committing = flow === "commit" && Boolean(last);

  return (
    <g className="areas">
      <Desk x={xs[0]} y={top + 56} w={areaW} h={areaH - 56 - 8} />
      <StagingPlatform x={xs[1]} y={top + 56} w={areaW} h={areaH - 56 - 52} />
      <MapBoard x={xs[2]} y={top + 56} w={areaW} h={areaH - 56} />
      {/* The track a commit's train runs on, from the platform to the newest station. */}
      <Track x1={xs[1] + 14} x2={stationX} y={trackY} />

      {[labels.work, labels.index, labels.repo].map((title, i) => (
        <g key={i}>
          <g transform={`translate(${xs[i]! + 18} ${top + 26})`}>
            <AreaIcon kind={i} />
          </g>
          <text x={xs[i]! + 44} y={top + 24} className="area-title">
            {title}
          </text>
          <text x={xs[i]! + 44} y={top + 42} className="area-sub">
            {[labels.workSub, labels.indexSub, labels.repoSub][i]}
          </text>
        </g>
      ))}

      <Cards x={xs[0]} y={cardsY} w={areaW} cards={workCards} empty={labels.empty} max={MAX[0]!} />
      <Cards x={xs[1]} y={cardsY} w={areaW} cards={indexCards} empty={labels.empty} max={MAX[1]!} />
      {/* Always mounted, so the very first commit arrives the same way as every later one. */}
      <Cards x={xs[2]} y={cardsY} w={areaW} cards={repoCards} empty={tip ? labels.empty : ""} max={MAX[2]!} enter={committing ? ARRIVE : 0} />
      <History x={stationX} rowY={rowY} w={areaW - 40} repo={repo} ids={history} fresh={committing ? tip : null} />
      {!tip && (
        <text x={xs[2] + areaW / 2} y={top + 130} textAnchor="middle" className="area-empty">
          {labels.noCommits}
        </text>
      )}

      {last && flow && (
        <Flights
          key={actionKey(last)}
          trays={[workCards, indexCards, repoCards]}
          flow={flow}
          paths={copiedPaths(last, flow, indexCards)}
          xs={xs}
          y={cardsY}
          w={areaW}
          train={{ x: xs[1] + areaW / 2, y: trackY }}
        />
      )}
      {committing && tip && <Train key={`train-${actionKey(last!)}`} from={xs[1] + areaW / 2} to={stationX} y={trackY} files={indexCards.filter((c) => c.badge?.tone !== "del").length} />}

      <Arrow x1={xs[0] + areaW + 4} x2={xs[1] - 4} y={top + 150} label="git add" lit={flow === "add"} />
      <Arrow x1={xs[1] + areaW + 4} x2={xs[2] - 4} y={top + 150} label="git commit" lit={flow === "commit"} />
      <Arrow x1={xs[1] - 4} x2={xs[0] + areaW + 4} y={top + 236} label="restore" lit={flow === "restore"} small />
      <Arrow x1={xs[2] - 4} x2={xs[1] + areaW + 4} y={top + 236} label="--staged" lit={flow === "unstage"} small />
    </g>
  );
}

/** The working tree: a desk your files lie on. */
function Desk({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const edge = 14;
  return (
    <g className="desk">
      <rect x={x + 18} y={y + h - 4} width={12} height={16} rx={3} className="desk-leg" />
      <rect x={x + w - 30} y={y + h - 4} width={12} height={16} rx={3} className="desk-leg" />
      <rect x={x} y={y + 5} width={w} height={h - 4} rx={14} className="area-shadow" />
      <rect x={x} y={y} width={w} height={h - 4} rx={14} className="desk-top" />
      <path d={`M${x} ${y + h - 4 - edge - 10} V${y + h - 18} Q${x} ${y + h - 4} ${x + 14} ${y + h - 4} H${x + w - 14} Q${x + w} ${y + h - 4} ${x + w} ${y + h - 18} V${y + h - 4 - edge - 10}`} className="desk-edge" />
      {/* Wood grain. */}
      <path d={`M${x + 20} ${y + h - 46} h${w * 0.35} M${x + w * 0.55} ${y + h - 58} h${w * 0.3}`} className="desk-grain" />
    </g>
  );
}

/** The staging area: a station platform with a sign, files waiting on it for the next train. */
function StagingPlatform({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const face = 16;
  return (
    <g className="platform">
      <rect x={x} y={y + 5} width={w} height={h + face} rx={14} className="area-shadow" />
      <rect x={x} y={y} width={w} height={h + face} rx={14} className="platform-face" />
      <rect x={x} y={y} width={w} height={h} rx={14} className="platform-top" />
      {/* The yellow safety line along the platform's edge, where the train stops. */}
      <path d={`M${x + 12} ${y + h - 9} H${x + w - 12}`} className="platform-edge" />
      {/* Paving. */}
      {Array.from({ length: Math.floor((h - 30) / 46) }, (_, i) => y + 30 + i * 46).map((py) => (
        <path key={py} d={`M${x + 10} ${py} H${x + w - 10}`} className="platform-paving" />
      ))}
    </g>
  );
}

/** The repository: the metro map of commits. */
function MapBoard({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g className="map">
      <rect x={x} y={y + 5} width={w} height={h} rx={16} className="area-shadow" />
      <rect x={x} y={y} width={w} height={h} rx={16} className="map-board" />
      {Array.from({ length: Math.floor((w - 20) / 34) }, (_, i) => x + 17 + (i + 1) * 34 - 17).map((gx) => (
        <line key={`x${gx}`} x1={gx} x2={gx} y1={y + 3} y2={y + h - 3} className="map-grid" />
      ))}
      {Array.from({ length: Math.floor((h - 20) / 34) }, (_, i) => y + 17 + i * 34).map((gy) => (
        <line key={`y${gy}`} x1={x + 3} x2={x + w - 3} y1={gy} y2={gy} className="map-grid" />
      ))}
    </g>
  );
}

/** Rails from the platform's edge to the newest station on the map. */
function Track({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  const sleepers = Math.floor((x2 - x1) / 16);
  return (
    <g className="rail">
      {Array.from({ length: sleepers }, (_, i) => x1 + 8 + i * 16).map((sx) => (
        <path key={sx} d={`M${sx} ${y - 7} V${y + 7}`} className="rail-sleeper" />
      ))}
      <path d={`M${x1} ${y - 4} H${x2} M${x1} ${y + 4} H${x2}`} className="rail-line" />
    </g>
  );
}

/** A commit's train: it waits at the platform while copies of the files board, runs to the map and becomes the new station. */
function Train({ from, to, y, files }: { from: number; to: number; y: number; files: number }) {
  const w = 74;
  return (
    <motion.g
      initial={{ x: from - w / 2, opacity: 0 }}
      animate={{ x: [from - w / 2, from - w / 2, to - w / 2, to - w / 2], opacity: [0, 1, 1, 0] }}
      transition={{ duration: ARRIVE + 0.25, times: [0, 0.4, 0.84, 1], ease: "easeInOut" }}
      pointerEvents="none"
    >
      <g transform={`translate(0 ${y - 30})`}>
        <rect y={4} width={w} height={26} rx={9} style={{ fill: "var(--ink)" }} />
        <rect width={w} height={26} rx={9} className="train-body" />
        <rect x={8} y={5} width={14} height={9} rx={2.5} className="train-window" />
        <rect x={52} y={5} width={14} height={9} rx={2.5} className="train-window" />
        {/* How many files it carries: the whole snapshot on the platform. */}
        <path d={`M${w / 2 - 14} 7 h7 l3 3 v9 h-10 Z`} className="train-sheet" />
        <text x={w / 2 + 6} y={19} textAnchor="middle" className="train-text">
          {files}
        </text>
        <circle cx={16} cy={28} r={4} className="train-wheel" />
        <circle cx={w - 16} cy={28} r={4} className="train-wheel" />
      </g>
    </motion.g>
  );
}

function Cards({ x, y, w, cards, empty, max, enter = 0 }: { x: number; y: number; w: number; cards: Card[]; empty: string; max: number; enter?: number }) {
  const shown = cards.slice(0, max);
  return (
    <g>
      {cards.length === 0 && empty && (
        <text x={x + w / 2} y={y + 30} textAnchor="middle" className="area-empty">
          {empty}
        </text>
      )}
      <AnimatePresence initial={false}>
        {shown.map((c, i) => (
          <motion.g
            key={c.path}
            className="file-card"
            initial={{ opacity: 0, x: x + 14 - 30, y: y + i * ROW }}
            animate={{ opacity: 1, x: x + 14, y: y + i * ROW }}
            exit={{ opacity: 0, x: x + 14 + 30 }}
            transition={{ ...spring, delay: enter }}
          >
            <Sheet w={w - 28} dashed={c.badge?.tone === "new" || c.badge?.tone === "ign"} faded={c.badge?.tone === "ign"} />
            {/* The name gives way to the badge, so the two never overlap. */}
            <text x={30} y={17} className="file-name">
              {clip(c.path, Math.floor((w - 28 - 30 - (c.badge ? badgeWidth(c.badge.text) + 22 : 16)) / 7.3))}
            </text>
            <text x={30} y={33} className="file-body">
              {c.badge?.tone === "del" ? "—" : clip(c.content.split("\n")[0] ?? "", Math.floor((w - 70) / 6.7))}
            </text>
            {c.badge && <BadgePill x={w - 28 - 16} text={c.badge.text} tone={c.badge.tone} />}
          </motion.g>
        ))}
      </AnimatePresence>
      {cards.length > max && (
        <text x={x + w / 2} y={y + max * ROW + 14} textAnchor="middle" className="area-empty">
          +{cards.length - max}
        </text>
      )}
    </g>
  );
}

/** A sheet of paper: one file. */
function Sheet({ w, dashed, faded }: { w: number; dashed?: boolean; faded?: boolean }) {
  const fold = 11;
  const outline = `M10 0 H${w - fold} L${w} ${fold} V${CARD_H - 10} Q${w} ${CARD_H} ${w - 10} ${CARD_H} H10 Q0 ${CARD_H} 0 ${CARD_H - 10} V10 Q0 0 10 0 Z`;
  return (
    <g>
      <path d={outline} transform="translate(0 3)" style={{ fill: "var(--ink)" }} />
      <path d={outline} className="sheet" style={{ fill: faded ? "var(--paper-2)" : "var(--card)", strokeDasharray: dashed ? "5 4" : undefined }} />
      <path d={`M${w - fold} 0 V${fold} H${w}`} className="sheet-fold" />
      <path d="M12 9h10M12 14h7" stroke="var(--ink-3)" strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

/** Each action's events are one array; a new array means a new action, so its copies travel again. */
const keys = new WeakMap<object, number>();
let nextKey = 0;
function actionKey(last: GitEvent[]): number {
  if (!keys.has(last)) keys.set(last, nextKey++);
  return keys.get(last)!;
}

/**
 * What an action copied. `git add` copies files from the folder into the index; `git commit`
 * records the whole index as a snapshot; `restore` copies the index back over the folder;
 * `restore --staged` copies the last commit's version back into the index.
 */
function copiedPaths(last: GitEvent[], flow: NonNullable<AreaFlow>, indexCards: { path: string; badge: Badge }[]): string[] {
  if (flow === "commit") return indexCards.filter((c) => c.badge?.tone !== "del").map((c) => c.path);
  const e = last[last.length - 1];
  if (flow === "add" && e?.type === "staged") return e.paths;
  if (flow === "restore" && e?.type === "restored") return [e.path];
  if (flow === "unstage" && e?.type === "unstaged") return e.paths;
  return [];
}

/**
 * Copies of file cards travelling between areas. The originals stay where they are. On a
 * commit the copies board the train waiting at the platform's edge.
 */
function Flights({ trays, flow, paths, xs, y, w, train }: { trays: Card[][]; flow: NonNullable<AreaFlow>; paths: string[]; xs: [number, number, number]; y: number; w: number; train: { x: number; y: number } }) {
  const [from, to] = ({ add: [0, 1], commit: [1, 2], restore: [1, 0], unstage: [2, 1] } as const)[flow];
  const row = (tray: number, path: string) => {
    const i = trays[tray]!.findIndex((c) => c.path === path);
    return i >= 0 && i < MAX[tray]! && trays[tray]![i]!.badge?.tone !== "del" ? i : -1;
  };
  return (
    <g pointerEvents="none">
      {paths.map((p, k) => {
        const a = row(from, p);
        const b = flow === "commit" ? 0 : row(to, p);
        if (a < 0 || b < 0) return null;
        const start = { x: xs[from] + 14, y: y + a * ROW };
        const end = flow === "commit" ? { x: train.x - (w - 28) / 2, y: train.y - 30 } : { x: xs[to] + 14, y: y + b * ROW };
        const shrink = flow === "commit" ? 0.35 : 1;
        return (
          <motion.g
            key={p}
            className="file-card"
            initial={{ x: start.x, y: start.y, opacity: 0.95, scale: 1 }}
            animate={{ x: end.x, y: end.y, opacity: [0.95, 0.95, 0], scale: shrink }}
            transition={{
              x: { duration: 0.6, delay: k * 0.08, ease: "easeInOut" },
              y: { duration: 0.6, delay: k * 0.08, ease: "easeInOut" },
              scale: { duration: 0.6, delay: k * 0.08 },
              opacity: { duration: 0.85, delay: k * 0.08, times: [0, 0.75, 1] },
            }}
            style={{ transformOrigin: `${(w - 28) / 2}px ${CARD_H / 2}px` }}
          >
            <Sheet w={w - 28} />
            <text x={30} y={17} className="file-name">
              {clip(p, Math.floor((w - 130) / 7.3))}
            </text>
          </motion.g>
        );
      })}
    </g>
  );
}

const BADGE_FILL: Record<NonNullable<Badge>["tone"], string> = {
  new: "var(--card)",
  mod: "var(--peach)",
  del: "var(--red-soft)",
  ok: "var(--mint)",
  ign: "var(--paper-2)",
};

const badgeWidth = (text: string) => Math.round(text.length * 6.4 + 14);

function BadgePill({ x, text, tone }: { x: number; text: string; tone: NonNullable<Badge>["tone"] }) {
  const w = badgeWidth(text);
  return (
    <g transform={`translate(${x - w} 7)`}>
      <rect width={w} height={17} rx={8.5} className="sheet" style={{ fill: BADGE_FILL[tone], stroke: "var(--ink)", strokeWidth: 1.5 }} />
      <text x={w / 2} y={12.5} textAnchor="middle" className="file-badge">
        {text}
      </text>
    </g>
  );
}

/** The newest commits as stations on one line, oldest at the top, the current one at the bottom. */
function History({ x, rowY, w, repo, ids, fresh }: { x: number; rowY: (i: number) => number; w: number; repo: Repo; ids: string[]; fresh: string | null }) {
  const first = rowY(0);
  const lastY = rowY(ids.length - 1);
  // The line runs on past the oldest shown station when history goes further back.
  const line = ids.length ? `M${x} ${first - (repo.commits[ids[0]!]!.parents.length ? 22 : 0)} V${lastY}` : null;
  return (
    <g>
      {line && <path d={line} className="map-line-outline" />}
      {line && <path d={line} className="map-line" />}
      <AnimatePresence initial={false}>
        {ids.map((id, i) => {
          const tags = Object.entries(repo.tags)
            .filter(([, at]) => at === id)
            .map(([n]) => n);
          const tip = i === ids.length - 1;
          return (
            <motion.g
              key={id}
              initial={{ opacity: 0, scale: 0.5, x, y: rowY(i) }}
              animate={{ opacity: 1, scale: 1, x, y: rowY(i) }}
              exit={{ opacity: 0 }}
              transition={{ ...spring, delay: id === fresh ? ARRIVE - 0.1 : 0 }}
            >
              <g transform="translate(0 5)">
                <Platform rx={15} ry={7.5} h={6} top={tip ? "var(--tangerine)" : "#ffe48f"} band={tip ? "var(--tangerine-deep)" : "#f2bd3a"} merge={false} />
              </g>
              <text x={24} y={4.5} className="file-name">
                {short(id)}
              </text>
              <text x={86} y={4.5} className="file-body">
                {clip(repo.commits[id]!.message.split("\n")[0]!, Math.floor((w - 96) / 6.7))}
              </text>
              {tags.length > 0 && <TagPlaque x={w - 4} text={tags.join(", ")} />}
            </motion.g>
          );
        })}
      </AnimatePresence>
    </g>
  );
}

/** A release tag: a sun-yellow plaque on the station it names. */
function TagPlaque({ x, text }: { x: number; text: string }) {
  const w = Math.round(text.length * 7 + 22);
  return (
    <g transform={`translate(${x - w} -9)`}>
      <path d={`M8 0 H${w - 5} Q${w} 0 ${w} 5 V13 Q${w} 18 ${w - 5} 18 H8 L0 9 Z`} style={{ fill: "var(--sun)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
      <circle cx={8} cy={9} r={2} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 1.2 }} />
      <text x={w / 2 + 4} y={13} textAnchor="middle" className="file-badge">
        {text}
      </text>
    </g>
  );
}

function Arrow({ x1, x2, y, label, lit, small }: { x1: number; x2: number; y: number; label: string; lit: boolean; small?: boolean }) {
  const dir = x2 > x1 ? 1 : -1;
  const head = `M${x2 - dir * 8} ${y - 6} L${x2} ${y} L${x2 - dir * 8} ${y + 6}`;
  return (
    <g opacity={small && !lit ? 0.55 : 1}>
      <path d={`M${x1} ${y} L${x2} ${y}`} className={`area-arrow ${lit ? "is-lit" : ""}`} />
      <path d={head} className={`area-arrow ${lit ? "is-lit" : ""}`} />
      <text x={(x1 + x2) / 2} y={y - 10} textAnchor="middle" className="area-arrow-label" style={{ fontSize: small ? 10.5 : 12 }}>
        {label}
      </text>
    </g>
  );
}

/** Small pictures next to each area's name: a sheet of paper, a platform sign, a station. */
function AreaIcon({ kind }: { kind: number }) {
  if (kind === 0) {
    return (
      <g className="area-icon">
        <path d="M-8 -11 H4 L9 -6 V11 H-8 Z" style={{ fill: "var(--card)" }} />
        <path d="M4 -11 V-6 H9" style={{ fill: "none" }} />
        <path d="M-4 -2 h8 M-4 3 h6" style={{ fill: "none", strokeWidth: 1.5 }} />
      </g>
    );
  }
  if (kind === 1) {
    return (
      <g className="area-icon">
        <path d="M-6 -2 V12 M6 -2 V12" style={{ fill: "none", strokeWidth: 2.5 }} />
        <rect x={-11} y={-12} width={22} height={12} rx={3} style={{ fill: "var(--mint)" }} />
      </g>
    );
  }
  return (
    <g className="area-icon" transform="translate(0 4)">
      <Platform rx={11} ry={5.5} h={6} top="#ffe48f" band="#f2bd3a" merge={false} />
    </g>
  );
}

function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, Math.max(1, n - 1))}…` : text;
}

export { short };
