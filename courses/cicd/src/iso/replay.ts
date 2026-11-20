import { useEffect, useRef } from "react";
import type { JobRun, Run } from "../engine/ci";

/**
 * Replaying a run on screen. The engine finishes a run the moment it is triggered; the scene
 * then plays it back: the commit arrives, jobs start when their `needs` are done, steps run
 * one after another. Simulated seconds are mapped to screen milliseconds with a log curve, so a
 * 3-second checkout is still visible next to a 70-second test, and since the curve only ever
 * goes forward, everything keeps its real order: parallel jobs move together, a job waits for
 * the jobs it needs, a fail-fast cancel lands when the other leg failed.
 */

/** Screen time for the run itself, after the commit has arrived. */
export const REPLAY_MS = 2400;
/** The commit travelling in before the first job starts. */
export const LEAD_MS = 450;
/** How long a scene should wait after an action that started (or resumed) a run. */
export const HOLD_MS = LEAD_MS + REPLAY_MS + 650;

export interface Replay {
  /** Changes whenever a new replay starts; animated parts are keyed on it so they start over. */
  key: string;
  /** Screen delay in ms for a simulated time. */
  ms: (t: number) => number;
  /** True for jobs that run in this replay; the others are drawn as they ended. */
  fresh: (job: JobRun) => boolean;
  /** The run was just triggered (not resumed after an approval): the commit travels in. */
  arrival: boolean;
}

const warp = (dt: number) => Math.log1p(Math.max(0, dt) / 15);

/** Start and end of every step of a job, in simulated seconds. */
export function stepTimes(job: JobRun): { start: number; end: number }[] {
  let t = job.start;
  return job.steps.map((s) => {
    const start = t;
    t += s.seconds;
    return { start, end: t };
  });
}

interface Seen {
  sig: string;
  id?: number;
  jobs: Map<string, JobRun["status"]>;
  replay: Replay | null;
}

const sigOf = (run?: Run) => (run ? `${run.id}|${run.jobs.map((j) => `${j.key}:${j.status}:${j.end}`).join(",")}` : "none");

/**
 * Whether `run` should be played back now, and its clock. A run seen for the first time on
 * mount is drawn as it ended (the reader arrived after it ran); a newer run, or the same run
 * after an approval let more jobs go, is played. Going back to an older run plays nothing.
 */
export function useReplay(run?: Run): Replay | null {
  const seen = useRef<Seen | null>(null);
  const sig = sigOf(run);
  const before = seen.current;
  let replay: Replay | null = null;
  if (before && before.sig === sig) replay = before.replay;
  else if (before && run) {
    const isNew = before.id === undefined || run.id > before.id;
    const resumed = run.id === before.id ? run.jobs.filter((j) => (before.jobs.get(j.key) === "waiting" || before.jobs.get(j.key) === "queued") && j.status !== "waiting" && j.status !== "queued") : [];
    if (isNew || resumed.length) {
      const freshKeys = new Set((isNew ? run.jobs : resumed).map((j) => j.key));
      const freshJobs = run.jobs.filter((j) => freshKeys.has(j.key));
      const t0 = isNew ? run.start : Math.min(...freshJobs.map((j) => j.start));
      const t1 = Math.max(t0, ...freshJobs.map((j) => j.end));
      const span = warp(t1 - t0) || 1;
      const lead = isNew ? LEAD_MS : 150;
      replay = {
        key: `${sig}#${isNew ? "new" : "resume"}`,
        ms: (t: number) => lead + (warp(t - t0) / span) * REPLAY_MS,
        fresh: (j) => freshKeys.has(j.key),
        arrival: isNew,
      };
    }
  }
  useEffect(() => {
    seen.current = { sig, id: run?.id, jobs: new Map(run?.jobs.map((j) => [j.key, j.status]) ?? []), replay };
  });
  return replay;
}

/** Motion props: fade in at a screen time. */
export const appearAt = (ms: number, duration = 0.25) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { delay: ms / 1000, duration },
});

/** Motion props: visible only between two screen times (a "running" ring). */
export const visibleBetween = (from: number, to: number) => {
  const total = Math.max(0.05, (to - from) / 1000);
  return {
    initial: { opacity: 0 },
    animate: { opacity: [0, 1, 1, 0] },
    transition: { delay: from / 1000, duration: total, times: [0, 0.08, 0.92, 1] },
  };
};
