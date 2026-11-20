import { createLog, simulateStorage, type StorageAction, type StorageLog } from "../../engine/storage";

/**
 * The lesson's log: segments of 3 records (standing in for segment.bytes), segment.ms and
 * retention.ms of 7 days, the clock in whole days.
 */

export const CONFIG = {
  segmentRecords: 3,
  segmentDays: 7,
  retentionDays: 7,
  retentionRecords: null,
  policy: "delete",
  deleteRetentionDays: 1,
} as const;

/** A step's beat: a storage action, or a pause that only moves the scene's own pictures on. */
export type Beat = StorageAction | { type: "beat" };

let written = 0;
export const put = (): StorageAction => ({ type: "append", value: `order:${1041 + written++}` });
export const tick = (days: number): StorageAction => ({ type: "tick", days });
const beat: Beat = { type: "beat" };

const START = createLog(CONFIG);

export const stepBeats: Beat[][] = [
  [put(), put()],
  [put(), put()],
  [put(), put(), put()],
  [beat],
  [tick(3), put(), tick(3)],
  [tick(2)],
  [beat],
  [beat],
  [put(), put(), put(), put(), put(), { type: "configure", config: { retentionRecords: 4 } }],
  [],
];

export const SANDBOX_STEP = stepBeats.length - 1;

/** Steps whose scene shows a reader asking for an offset, and which one. */
export const LOOKUPS: Record<number, number> = { 3: 4, 7: 2 };
/** The step that points at a record older than retention that is still there. */
export const SURVIVOR_STEP = 6;
export const SURVIVOR = 6;

const asAction = (b: Beat): StorageAction => (b.type === "beat" ? { type: "configure", config: {} } : b);

export const base = (() => {
  const flat = stepBeats.flat();
  const run = simulateStorage(flat.map(asAction), START);
  // A pause beat is not an action: drop the "configured" event it produced.
  run.events = run.events.map((evs, i) => (flat[i]!.type === "beat" ? [] : evs));
  const ends: number[] = [];
  let n = 0;
  for (const beats of stepBeats) {
    n += beats.length;
    ends.push(n);
  }
  const startOf = (step: number) => (step === 0 ? 0 : ends[step - 1]!);
  return { run, ends, startOf };
})();

/** The try-it step starts fresh: four orders on day 0, so one closed segment and an active one. */
export const sandboxStart: StorageLog = (() => {
  let log = createLog(CONFIG);
  log = simulateStorage([put(), put(), put(), put()], log).logs[4]!;
  return log;
})();
