import { l, type L } from "@lets-explain/core/i18n";
import type { Metric } from "@lets-explain/core/components/SceneFrame";
import { aheadBehind, BORA, createRepo, currentBranch, headId, reachable, short, type GitEvent, type Repo } from "../../engine/git";
import { metroGeometry, MetroStage } from "../../iso/MetroStage";

/**
 * Your repository and origin side by side, each on its own metro map. origin is drawn as its
 * own small repo built from `repo.remote`: its branches, its commits, no HEAD. Commits that a
 * force-push left behind on origin show as ghosts. Between the maps runs the link both
 * directions use: push carries commits to origin, fetch brings them back, and a commit that
 * crosses travels from one map to the other.
 */

/**
 * Two graphs share one stage, so each keeps only the newest few commits behind every ref
 * (and, on origin, a teammate's commit no ref reaches, so work lost to a force push shows as a ghost).
 * Older history is simply left off, like a shallow view.
 */
export function recent(repo: Repo, keep = 3, ghosts = false): Repo {
  const tips = [headId(repo), ...Object.values(repo.branches), ...Object.values(repo.tracking), ...Object.values(repo.tags)].filter(Boolean) as string[];
  const kept = new Set<string>();
  let level = tips;
  for (let d = 0; d < keep && level.length; d++) {
    const next: string[] = [];
    for (const c of level) {
      if (kept.has(c) || !repo.commits[c]) continue;
      kept.add(c);
      next.push(...repo.commits[c]!.parents);
    }
    level = next;
  }
  const live = reachable(repo);
  // Only a teammate's lost work is worth showing; your own replaced commits would just crowd the view.
  if (ghosts) for (const c of Object.keys(repo.commits)) if (!live.has(c) && repo.commits[c]!.author === BORA) kept.add(c);
  const view = { ...repo, commits: Object.fromEntries(Object.entries(repo.commits).filter(([c]) => kept.has(c))) };
  return view;
}

export function originView(repo: Repo): Repo | null {
  if (!repo.remote) return null;
  const view = createRepo();
  view.commits = repo.remote.commits;
  view.branches = { ...repo.remote.branches };
  view.tags = { ...repo.remote.tags };
  view.head = { kind: "branch", name: "main" };
  return view;
}

const text = {
  local: l("Bilgisayarın", "Your computer"),
  origin: l("origin (GitHub)", "origin (GitHub)"),
  ahead: l("Önde", "Ahead"),
  behind: l("Geride", "Behind"),
  tracking: l("origin/", "origin/"),
};

/** Where each side draws a commit, so pushed and fetched commits travel from one repo to the other. */
export function placeIn(repo: Repo | null, box: { x: number; y: number; w: number; h: number }, opts: { showGhosts?: boolean; messages?: boolean; lanes?: number } = {}) {
  if (!repo) return () => undefined;
  const g = metroGeometry(repo, box, opts);
  return (id: string) => (g.layout.pos.has(id) ? g.at(id) : undefined);
}

const LOCAL_BOX = { x: 0, y: 0, w: 446, h: 470 };
const ORIGIN_BOX = { x: 446, y: 0, w: 414, h: 470 };

export function TwoRepos({ repo, fresh, t, last }: { repo: Repo; fresh: Set<string>; t: (x: L) => string; last: GitEvent[] }) {
  const originRepo = originView(repo);
  const local = recent(repo);
  const origin = originRepo && recent(originRepo, 3, true);
  return (
    <g>
      <MetroStage repo={local} box={LOCAL_BOX} highlight={fresh} title={t(text.local)} showGhosts={false} lanes={2} arrivals={placeIn(origin, ORIGIN_BOX, { lanes: 2 })} t={t} />
      {origin && <MetroStage repo={origin} box={ORIGIN_BOX} tone="sky" highlight={fresh} hideHead lanes={2} title={t(text.origin)} arrivals={placeIn(local, LOCAL_BOX, { showGhosts: false, lanes: 2 })} t={t} />}
      {origin && <Link x={LOCAL_BOX.x + LOCAL_BOX.w} y={232} last={last} />}
    </g>
  );
}

/**
 * The link between the two maps: push carries commits to origin, fetch (and pull, which
 * starts with a fetch) brings them over. The direction the last command used lights up.
 */
export function Link({ x, y, last }: { x: number; y: number; last: GitEvent[] }) {
  const pushed = last.some((e) => e.type === "pushed");
  const fetched = last.some((e) => e.type === "fetched");
  const lane = (dy: number, dir: 1 | -1, lit: boolean, label: string) => {
    const x1 = x - 26 * dir;
    const x2 = x + 26 * dir;
    return (
      <g className={`remote-link ${lit ? "is-lit" : ""}`}>
        <path d={`M${x1} ${y + dy} L${x2} ${y + dy}`} className="remote-link-rail" />
        <path d={`M${x2 - 8 * dir} ${y + dy - 6} L${x2} ${y + dy} L${x2 - 8 * dir} ${y + dy + 6}`} className="remote-link-rail" />
        <text x={x} y={y + dy + (dy < 0 ? -10 : 22)} textAnchor="middle" className="remote-link-label">
          {label}
        </text>
      </g>
    );
  };
  return (
    <g>
      {lane(-10, 1, pushed, "push")}
      {lane(10, -1, fetched, "fetch")}
    </g>
  );
}

/** Ahead/behind of the current branch against its remote-tracking branch. */
export function remoteMetrics(repo: Repo, t: (x: L) => string): Metric[] {
  const branch = currentBranch(repo) ?? "HEAD";
  const local = headId(repo);
  const tracking = repo.tracking[repo.upstream[branch] ?? `origin/${branch}`];
  const ab = local && tracking ? aheadBehind(repo, local, tracking) : null;
  return [
    { label: t(l("Branch", "Branch")), value: branch },
    { label: t(text.ahead), value: ab ? ab.ahead : "—", tone: ab && ab.ahead ? "warn" : "plain" },
    { label: t(text.behind), value: ab ? ab.behind : "—", tone: ab && ab.behind ? "danger" : "plain" },
    { label: `origin/${branch}`, value: tracking ? short(tracking) : "—" },
  ];
}
