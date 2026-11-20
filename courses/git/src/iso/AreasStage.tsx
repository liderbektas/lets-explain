import { AnimatePresence, motion } from "motion/react";
import { IsoBox, type Shades } from "@lets-explain/core/iso/shapes";
import { headFiles, headId, isIgnored, ignorePatterns, short, type GitEvent, type Repo } from "../engine/git";
import "./git-stage.css";

/**
 * Git's three areas side by side: the working tree (your folder), the staging area (the
 * index: the next commit being put together) and the repository (commits). Every area
 * shows a full set of files, which is how Git really works: the index is not a list of
 * changes but a complete snapshot-in-waiting.
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
  /** Events of the last action: the files it copied fly from one area to the next. */
  last?: GitEvent[];
  box?: { x: number; y: number; w: number; h: number };
}

const TRAY_TINTS = ["var(--sky-soft)", "var(--mint-soft)", "var(--sun-soft)"];
const spring = { type: "spring", stiffness: 180, damping: 22 } as const;

type Badge = { text: string; tone: "new" | "mod" | "del" | "ok" | "ign" } | null;

export function AreasStage({ repo, labels, flow = null, last, box = { x: 0, y: 0, w: 860, h: 470 } }: Props) {
  // Wide enough for "git commit" between two trays.
  const gap = 84;
  const trayW = (box.w - 24 - gap * 2) / 3;
  const trayH = box.h - 40;
  const xs = [0, 1, 2].map((i) => box.x + 12 + i * (trayW + gap));
  const top = box.y + 20;
  const head = headFiles(repo);
  const patterns = ignorePatterns(repo);

  const workCards = Object.keys(repo.work)
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
  const indexCards = Object.keys(repo.index)
    .sort()
    .map((p) => ({ path: p, content: repo.index[p]!, badge: repo.index[p] !== head[p] ? ({ text: labels.staged, tone: "ok" } as Badge) : null }));
  for (const p of Object.keys(head)) {
    if (!(p in repo.index)) indexCards.push({ path: p, content: "", badge: { text: labels.deleted, tone: "del" } });
  }
  const repoCards = Object.keys(head)
    .sort()
    .map((p) => ({ path: p, content: head[p]!, badge: null as Badge }));

  const tip = headId(repo);
  const history: string[] = [];
  for (let c = tip; c && history.length < 3; c = repo.commits[c]!.parents[0] ?? null) history.push(c);

  return (
    <g className="areas">
      {[labels.work, labels.index, labels.repo].map((title, i) => (
        <g key={title}>
          <rect x={xs[i]} y={top + 5} width={trayW} height={trayH} rx={22} style={{ fill: "var(--ink)" }} />
          <rect x={xs[i]} y={top} width={trayW} height={trayH} rx={22} className="area-tray" style={{ fill: TRAY_TINTS[i] }} />
          <g transform={`translate(${xs[i]! + 34} ${top + 44})`}>
            <AreaIcon kind={i} />
          </g>
          <text x={xs[i]! + 64} y={top + 32} className="area-title">
            {title}
          </text>
          <text x={xs[i]! + 64} y={top + 50} className="area-sub">
            {[labels.workSub, labels.indexSub, labels.repoSub][i]}
          </text>
        </g>
      ))}

      <Cards x={xs[0]!} y={top + 74} w={trayW} cards={workCards} empty={labels.empty} />
      <Cards x={xs[1]!} y={top + 74} w={trayW} cards={indexCards} empty={labels.empty} />
      {tip ? (
        <g>
          <Cards x={xs[2]!} y={top + 74} w={trayW} cards={repoCards} empty={labels.empty} max={4} />
          <History x={xs[2]!} y={top + trayH - 86} w={trayW} repo={repo} ids={history} />
        </g>
      ) : (
        <text x={xs[2]! + trayW / 2} y={top + 120} textAnchor="middle" className="area-empty">
          {labels.noCommits}
        </text>
      )}

      {last && flow && (
        <Flights
          key={actionKey(last)}
          trays={[workCards, indexCards, repoCards]}
          flow={flow}
          paths={copiedPaths(last, flow, indexCards)}
          xs={xs as [number, number, number]}
          y={top + 74}
          w={trayW}
        />
      )}

      <Arrow x1={xs[0]! + trayW + 4} x2={xs[1]! - 4} y={top + 150} label="git add" lit={flow === "add"} />
      <Arrow x1={xs[1]! + trayW + 4} x2={xs[2]! - 4} y={top + 150} label="git commit" lit={flow === "commit"} />
      <Arrow x1={xs[1]! - 4} x2={xs[0]! + trayW + 4} y={top + 236} label="restore" lit={flow === "restore"} small />
      <Arrow x1={xs[2]! - 4} x2={xs[1]! + trayW + 4} y={top + 236} label="--staged" lit={flow === "unstage"} small />
    </g>
  );
}

function Cards({ x, y, w, cards, empty, max = 6 }: { x: number; y: number; w: number; cards: { path: string; content: string; badge: Badge }[]; empty: string; max?: number }) {
  const shown = cards.slice(0, max);
  return (
    <g>
      {cards.length === 0 && (
        <text x={x + w / 2} y={y + 30} textAnchor="middle" className="area-empty">
          {empty}
        </text>
      )}
      <AnimatePresence initial={false}>
        {shown.map((c, i) => (
          <motion.g
            key={c.path}
            className="file-card"
            initial={{ opacity: 0, x: x + 14 - 30, y: y + i * 50 }}
            animate={{ opacity: 1, x: x + 14, y: y + i * 50 }}
            exit={{ opacity: 0, x: x + 14 + 30 }}
            transition={spring}
          >
            <rect y={3} width={w - 28} height={42} rx={10} style={{ fill: "var(--ink)" }} />
            <rect width={w - 28} height={42} rx={10} className="sheet" style={{ fill: c.badge?.tone === "ign" ? "var(--paper-2)" : "var(--card)", strokeDasharray: c.badge?.tone === "new" || c.badge?.tone === "ign" ? "5 4" : undefined }} />
            <path d="M12 9h10M12 14h7" stroke="var(--ink-3)" strokeWidth={2} strokeLinecap="round" />
            <text x={30} y={17} className="file-name">
              {clip(c.path, Math.floor((w - 130) / 7.3))}
            </text>
            <text x={30} y={33} className="file-body">
              {c.badge?.tone === "del" ? "—" : clip(c.content.split("\n")[0] ?? "", Math.floor((w - 70) / 6.7))}
            </text>
            {c.badge && <BadgePill x={w - 28 - 8} text={c.badge.text} tone={c.badge.tone} />}
          </motion.g>
        ))}
      </AnimatePresence>
      {cards.length > max && (
        <text x={x + w / 2} y={y + max * 50 + 14} textAnchor="middle" className="area-empty">
          +{cards.length - max}
        </text>
      )}
    </g>
  );
}

/** Each action's events are one array; a new array means a new action, so its copies fly again. */
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

/** Copies of file cards travelling between areas. The originals stay where they are. */
function Flights({ trays, flow, paths, xs, y, w }: { trays: { path: string; badge: Badge }[][]; flow: NonNullable<AreaFlow>; paths: string[]; xs: [number, number, number]; y: number; w: number }) {
  const [from, to] = ({ add: [0, 1], commit: [1, 2], restore: [1, 0], unstage: [2, 1] } as const)[flow];
  const max = [6, 6, 4];
  const row = (tray: number, path: string) => {
    const i = trays[tray]!.findIndex((c) => c.path === path);
    return i >= 0 && i < max[tray]! && trays[tray]![i]!.badge?.tone !== "del" ? i : -1;
  };
  return (
    <g pointerEvents="none">
      {paths.map((p, k) => {
        const a = row(from, p);
        const b = row(to, p);
        if (a < 0 || b < 0) return null;
        return (
          <motion.g
            key={p}
            className="file-card"
            initial={{ x: xs[from] + 14, y: y + a * 50, opacity: 0.95 }}
            animate={{ x: xs[to] + 14, y: y + b * 50, opacity: [0.95, 0.95, 0] }}
            transition={{ x: { duration: 0.6, delay: k * 0.08, ease: "easeInOut" }, y: { duration: 0.6, delay: k * 0.08, ease: "easeInOut" }, opacity: { duration: 0.85, delay: k * 0.08, times: [0, 0.75, 1] } }}
          >
            <rect y={3} width={w - 28} height={42} rx={10} style={{ fill: "var(--ink)" }} />
            <rect width={w - 28} height={42} rx={10} className="sheet" style={{ fill: "var(--card)" }} />
            <path d="M12 9h10M12 14h7" stroke="var(--ink-3)" strokeWidth={2} strokeLinecap="round" />
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

function BadgePill({ x, text, tone }: { x: number; text: string; tone: NonNullable<Badge>["tone"] }) {
  const w = Math.round(text.length * 6.4 + 14);
  return (
    <g transform={`translate(${x - w} 7)`}>
      <rect width={w} height={17} rx={8.5} className="sheet" style={{ fill: BADGE_FILL[tone], stroke: "var(--ink)", strokeWidth: 1.5 }} />
      <text x={w / 2} y={12.5} textAnchor="middle" className="file-badge">
        {text}
      </text>
    </g>
  );
}

function History({ x, y, w, repo, ids }: { x: number; y: number; w: number; repo: Repo; ids: string[] }) {
  return (
    <g>
      <line x1={x + 16} x2={x + w - 16} y1={y - 10} y2={y - 10} stroke="var(--line)" strokeWidth={2} strokeDasharray="4 4" />
      {ids.map((id, i) => (
        <g key={id} transform={`translate(${x + 28} ${y + 8 + i * 24})`}>
          <rect x={-8} y={-8} width={16} height={16} rx={4} className="sheet" style={{ fill: i === 0 ? "var(--tangerine)" : "var(--sun)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
          <text x={16} y={4.5} className="file-name">
            {short(id)}
          </text>
          <text x={78} y={4.5} className="file-body">
            {clip(repo.commits[id]!.message.split("\n")[0]!, Math.floor((w - 120) / 6.7))}
          </text>
        </g>
      ))}
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

function AreaIcon({ kind }: { kind: number }) {
  const s = 11;
  const shades: Shades[] = [
    ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"],
    ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"],
    ["var(--sun)", "#f2bd3a", "#d9a826"],
  ];
  if (kind === 0) {
    // A folder: a flat box with a tab.
    return (
      <g className="iso-icon">
        <IsoBox s={s} at={[-1, -0.8, 0]} size={[2, 1.6, 0.5]} shades={shades[0]!} />
        <IsoBox s={s} at={[-1, -0.8, 0.5]} size={[0.8, 0.5, 0.2]} shades={shades[0]!} />
      </g>
    );
  }
  if (kind === 1) {
    // An open box being packed.
    return (
      <g className="iso-icon">
        <IsoBox s={s} at={[-0.9, -0.9, 0]} size={[1.8, 1.8, 1]} shades={shades[1]!} />
      </g>
    );
  }
  // A stack of commits.
  return (
    <g className="iso-icon">
      <IsoBox s={s} at={[-0.8, -0.8, 0]} size={[1.6, 1.6, 0.5]} shades={shades[2]!} />
      <IsoBox s={s} at={[-0.8, -0.8, 0.5]} size={[1.6, 1.6, 0.5]} shades={shades[2]!} />
      <IsoBox s={s} at={[-0.8, -0.8, 1]} size={[1.6, 1.6, 0.5]} shades={["var(--tangerine)", "#f08770", "var(--tangerine-deep)"]} />
    </g>
  );
}

function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, Math.max(1, n - 1))}…` : text;
}

export { short };
