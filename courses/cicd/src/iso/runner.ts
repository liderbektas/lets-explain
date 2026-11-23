import type { JobRun, Run, Status, StepRun } from "../engine/ci";
import { stepTimes } from "./replay";

/**
 * What the drawings read from a run, apart from how they draw it: the run's columns by
 * `needs`, which steps to show when there is no room for all, what each step leaves on the
 * runner's disk and what leaves the runner. The assembly line and the panels share these.
 */

const STATUS_TEXT: Record<Status, [string, string]> = {
  queued: ["sırada", "queued"],
  waiting: ["onay bekliyor", "waiting"],
  success: ["başarılı", "success"],
  failure: ["başarısız", "failure"],
  skipped: ["atlandı", "skipped"],
  cancelled: ["iptal", "cancelled"],
};

export const EVENT_TEXT: Record<string, [string, string]> = {
  push: ["push", "push"],
  pull_request: ["pull request", "pull request"],
  schedule: ["schedule", "schedule"],
  dispatch: ["elle", "manual"],
};

export const statusText = (s: Status, tr: boolean) => STATUS_TEXT[s][tr ? 0 : 1];

/** How long a crate takes to travel between a runner's disk and the run's artifact store. */
export const FLIGHT_MS = 400;

/** Jobs grouped into columns: a job stands one column after the last job it needs. */
export function levels(run: Run): string[][] {
  const ids = [...new Set(run.jobs.map((j) => j.id))];
  const lvl = new Map<string, number>();
  const level = (id: string): number => {
    if (lvl.has(id)) return lvl.get(id)!;
    const j = run.jobs.find((x) => x.id === id);
    const v = j && j.needs.length ? 1 + Math.max(...j.needs.map(level)) : 0;
    lvl.set(id, v);
    return v;
  };
  ids.forEach(level);
  const cols: string[][] = [];
  for (const id of ids) (cols[lvl.get(id)!] ??= []).push(id);
  return cols.filter(Boolean);
}

/** Which steps to show when there is room for only `rows`: keep the ones that matter. */
export function pickSteps(job: JobRun, rows: number) {
  const all = job.steps.map((s, i) => ({ s, i }));
  if (all.length <= rows) return { shown: all, hidden: 0, hiddenPassed: true };
  // One slot goes to the "+n more" gate, but never drop the step that broke the job. Of the
  // rest, the later steps are kept: the first ones are the setup every job starts with.
  const slots = Math.max(1, rows - 1);
  // A step that still ran after the failure (`if: always()` or `failure()`) matters too.
  const broke = all.findIndex((x) => x.s.status === "failure" && !x.s.allowed);
  const rank = (x: { s: JobRun["steps"][number]; i: number }) => (x.s.status === "failure" ? 0 : x.s.status === "cancelled" ? 1 : x.s.status === "success" ? (broke >= 0 && x.i > broke ? 1.5 : 3) : 2);
  const byRank = [...all].sort((a, b) => rank(a) - rank(b) || b.i - a.i);
  const keep = new Set(byRank.slice(0, slots).map((x) => x.i));
  const shown = all.filter((x) => keep.has(x.i));
  const hiddenPassed = all.every((x) => keep.has(x.i) || x.s.status === "success");
  return { shown, hidden: all.length - shown.length, hiddenPassed };
}

/* ------------------------------------------------------- the runner's disk */

export type Tone = "code" | "node" | "deps" | "dist" | "image" | "cache" | "bad";

export const TONE_FILL: Record<Tone, string> = {
  code: "var(--sun-soft)",
  node: "var(--mint)",
  deps: "var(--lilac-soft)",
  dist: "var(--sky)",
  image: "var(--sky-soft)",
  cache: "#efe5d2",
  bad: "var(--red-soft)",
};

/** Something a step left on the runner. `at` is when (simulated seconds). */
export interface Item {
  label: string;
  tone: Tone;
  at: number;
  /** Where it came from, when not made here: dropped in from the cache, or out of the artifact store. */
  from?: "cache" | "artifact";
}

/** Something that leaves the runner: an artifact upload, a cache save, an image push, a deploy. */
export interface Out {
  label: string;
  tone: Tone;
  at: number;
  to: "tray" | "up" | "right";
  /** Index of the disk item it is a copy of, so it travels from there. */
  source: number;
}

const hit = (s: StepRun) => s.kind === "cache" && s.log[0]?.startsWith("Cache restored");
const cacheFolder = (s: StepRun) => (s.name.includes("node_modules") ? "node_modules" : "~/.npm");

export function benchOf(job: JobRun, tr: boolean): { items: Item[]; outs: Out[] } {
  const items: Item[] = [];
  const outs: Out[] = [];
  const times = stepTimes(job);
  const find = (tone: Tone) => {
    for (let i = items.length - 1; i >= 0; i--) if (items[i]!.tone === tone) return i;
    return -1;
  };
  job.steps.forEach((s, i) => {
    const at = times[i]!.end;
    if (s.status === "failure" && !s.allowed) {
      items.push({ label: `exit ${s.exit ?? 1}`, tone: "bad", at });
      return;
    }
    if (s.status !== "success") return;
    switch (s.kind) {
      case "checkout":
        items.push({ label: tr ? "kod" : "code", tone: "code", at });
        break;
      case "setup-node":
        items.push({ label: `node ${job.node ?? (/node (\d+)/.exec(s.name)?.[1] ?? "22")}`, tone: "node", at });
        break;
      case "cache":
        if (hit(s)) items.push({ label: cacheFolder(s), tone: cacheFolder(s) === "node_modules" ? "deps" : "cache", at, from: "cache" });
        break;
      case "install":
        if (find("deps") < 0) items.push({ label: "node_modules", tone: "deps", at });
        break;
      case "build":
        items.push({ label: "dist/", tone: "dist", at });
        break;
      case "download":
        items.push({ label: "dist/", tone: "dist", at, from: "artifact" });
        break;
      case "upload":
        if (find("dist") >= 0) outs.push({ label: "dist/", tone: "dist", at, to: "tray", source: find("dist") });
        break;
      case "docker-push":
        items.push({ label: "image", tone: "image", at });
        outs.push({ label: "image", tone: "image", at: at + 0.01, to: "up", source: items.length - 1 });
        break;
      case "deploy": {
        // What goes out is what this runner holds: the build, or else the image. A deploy that
        // pulls from the registry holds neither; its image comes down from above (source -1).
        const src = find("dist") >= 0 ? find("dist") : find("image");
        const env = s.delivered?.env ?? "env";
        outs.push({ label: src >= 0 ? `${items[src]!.label} → ${env}` : `image → ${env}`, tone: src >= 0 ? items[src]!.tone : "image", at, to: "right", source: src });
        break;
      }
    }
  });
  // actions/cache saves in a post step, after the job's last step, only when the job passed.
  const cacheStep = job.steps.find((s) => s.kind === "cache");
  if (cacheStep && cacheStep.status === "success" && !hit(cacheStep) && job.status === "success") {
    const folder = cacheFolder(cacheStep);
    const src = folder === "node_modules" ? find("deps") : -1;
    outs.push({ label: `${folder} → cache`, tone: folder === "node_modules" ? "deps" : "cache", at: job.end, to: "up", source: src });
  }
  return { items, outs };
}

/**
 * The job's secret as its runner got it, for a job whose steps use one (print it, publish with
 * it): "masked" when the runner held a value (the log shows ***), "empty" when it got nothing
 * (a fork's run, or no secret set). Null when no step of the job reads a secret.
 */
export function secretOf(job: JobRun, run: Run): "masked" | "empty" | null {
  const uses = job.steps.filter((s) => s.kind === "print-secret" || s.kind === "publish");
  if (!uses.length || uses.every((s) => s.status === "skipped")) return null;
  const printed = uses.find((s) => s.kind === "print-secret" && s.status !== "skipped");
  if (printed) return printed.log.some((x) => x.includes("***")) ? "masked" : "empty";
  if (run.fork) return "empty";
  return uses.some((s) => s.log.some((x) => x.includes("ENEEDAUTH"))) ? "empty" : "masked";
}
