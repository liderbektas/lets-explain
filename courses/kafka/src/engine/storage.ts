/**
 * How one partition's log is stored on a broker's disk, for the Storage lessons.
 * Deterministic and small, like cluster.ts, but about files instead of readers.
 *
 * Units are simplified so a lesson can show them:
 * - Time is counted in whole days.
 * - Segment size is counted in records. Real Kafka counts bytes (segment.bytes, 1 GiB by default).
 *
 * What it does follow from real Kafka:
 * - Records are appended to the last (active) segment.
 * - A new segment is rolled when the active one is full, or when its first record is older
 *   than segment.ms (checked on the next append).
 * - Retention deletes whole segments, oldest first, once their newest record is older than
 *   retention.ms. When even the active segment has expired, Kafka rolls a fresh empty
 *   segment first, so the log always has one to write to.
 * - retention.bytes deletes oldest segments while what remains is still over the limit.
 * - Compaction cleans closed segments only: it keeps the latest record per key among them,
 *   never changes offsets, and merges segments that became small. The active segment is
 *   left alone, and its records do not count yet.
 * - A tombstone (null value) survives its first cleaning, and is removed by a later
 *   cleaning once delete.retention.ms has passed since then.
 */

export interface StoredRecord {
  offset: number;
  key: string | null;
  /** null is a tombstone: "this key is deleted". */
  value: string | null;
  /** Day it was written. */
  time: number;
  /** For tombstones: the day the cleaner first saw it. */
  cleanedAt?: number;
}

export interface Segment {
  /** Offset of its first record; also its file name. */
  base: number;
  records: StoredRecord[];
  /** Day the segment was rolled, for segment.ms. */
  created: number;
}

export interface StorageConfig {
  /** Stand-in for segment.bytes. */
  segmentRecords: number;
  /** segment.ms in days; null means only size rolls segments. */
  segmentDays: number | null;
  /** retention.ms in days; null means keep forever (retention.ms = -1). */
  retentionDays: number | null;
  /** Stand-in for retention.bytes, in records; null means no size limit. */
  retentionRecords: number | null;
  policy: "delete" | "compact";
  /** delete.retention.ms in days: how long a tombstone outlives its first cleaning. */
  deleteRetentionDays: number;
}

export interface StorageLog {
  time: number;
  config: StorageConfig;
  /** Oldest first; the last one is the active segment. Never empty. */
  segments: Segment[];
  logStartOffset: number;
  logEndOffset: number;
}

export type StorageAction =
  | { type: "append"; key?: string | null; value: string | null }
  | { type: "tick"; days: number }
  | { type: "retention" }
  | { type: "compact" }
  | { type: "configure"; config: Partial<StorageConfig> };

export type StorageEvent =
  | { type: "appended"; offset: number; segment: number; key: string | null; tombstone: boolean }
  | { type: "rolled"; base: number; reason: "size" | "time" | "retention" }
  | { type: "ticked"; from: number; to: number }
  | { type: "segmentsDeleted"; bases: number[]; from: number; to: number; reason: "time" | "size" }
  | {
      type: "compacted";
      /** Older values removed because a newer record has the same key. */
      removed: number[];
      /** Tombstones removed for good because delete.retention.ms had passed. */
      tombstonesRemoved: number[];
      /** Segment bases that were merged into the one before them. */
      merged: number[];
    }
  | { type: "nothingToDo"; what: "retention" | "compact" }
  | { type: "configured"; config: Partial<StorageConfig> }
  | { type: "error"; message: string };

export const DEFAULT_CONFIG: StorageConfig = {
  segmentRecords: 3,
  segmentDays: 7,
  retentionDays: 7,
  retentionRecords: null,
  policy: "delete",
  deleteRetentionDays: 1,
};

export function createLog(config: Partial<StorageConfig> = {}, time = 0): StorageLog {
  return {
    time,
    config: { ...DEFAULT_CONFIG, ...config },
    segments: [{ base: 0, records: [], created: time }],
    logStartOffset: 0,
    logEndOffset: 0,
  };
}

export const activeSegment = (log: StorageLog) => log.segments[log.segments.length - 1]!;
export const recordCount = (log: StorageLog) => log.segments.reduce((n, s) => n + s.records.length, 0);
export const allRecords = (log: StorageLog) => log.segments.flatMap((s) => s.records);

/** The timestamp retention looks at: the segment's newest record. */
export const newestTime = (segment: Segment) =>
  segment.records.length === 0 ? null : Math.max(...segment.records.map((r) => r.time));

/** Days since the segment's newest record, or null for an empty segment. */
export function segmentAge(log: StorageLog, segment: Segment): number | null {
  const newest = newestTime(segment);
  return newest === null ? null : log.time - newest;
}

export function isExpired(log: StorageLog, segment: Segment): boolean {
  const age = segmentAge(log, segment);
  return log.config.retentionDays !== null && age !== null && age > log.config.retentionDays;
}

/** Which segment holds an offset: the last one whose base is not past it (Kafka uses a sorted map). */
export function segmentFor(log: StorageLog, offset: number): Segment | null {
  if (offset < log.logStartOffset || offset >= log.logEndOffset) return null;
  let found: Segment | null = null;
  for (const s of log.segments) if (s.base <= offset) found = s;
  return found;
}

export function applyStorage(prev: StorageLog, action: StorageAction): { log: StorageLog; events: StorageEvent[] } {
  const log = structuredClone(prev);
  const events: StorageEvent[] = [];
  const fail = (message: string) => ({ log: prev, events: [{ type: "error", message } as StorageEvent] });

  switch (action.type) {
    case "append": {
      const key = action.key ?? null;
      if (log.config.policy === "compact" && key === null) {
        return fail("A compacted topic only accepts records with a key");
      }
      let active = activeSegment(log);
      const full = active.records.length >= log.config.segmentRecords;
      // segment.ms counts from the segment's first record.
      const old =
        log.config.segmentDays !== null &&
        active.records.length > 0 &&
        log.time - active.records[0]!.time > log.config.segmentDays;
      if (full || old) {
        active = { base: log.logEndOffset, records: [], created: log.time };
        log.segments.push(active);
        events.push({ type: "rolled", base: active.base, reason: full ? "size" : "time" });
      }
      const offset = log.logEndOffset;
      active.records.push({ offset, key, value: action.value, time: log.time });
      log.logEndOffset = offset + 1;
      events.push({ type: "appended", offset, segment: active.base, key, tombstone: action.value === null });
      break;
    }

    case "tick": {
      const from = log.time;
      log.time += action.days;
      events.push({ type: "ticked", from, to: log.time });
      // The broker's retention checker runs on its own; here it runs after every tick.
      if (log.config.policy === "delete") runRetention(log, events, false);
      break;
    }

    case "retention": {
      runRetention(log, events, true);
      break;
    }

    case "compact": {
      if (log.config.policy !== "compact") return fail("cleanup.policy is not compact");
      runCompaction(log, events);
      break;
    }

    case "configure": {
      log.config = { ...log.config, ...action.config };
      events.push({ type: "configured", config: action.config });
      if (log.config.policy === "delete") runRetention(log, events, false);
      break;
    }
  }
  return { log, events };
}

function deleteOldest(log: StorageLog, count: number, reason: "time" | "size", events: StorageEvent[]) {
  if (count <= 0) return;
  if (count >= log.segments.length) {
    // Everything is going: roll first so there is still a segment to write to.
    log.segments.push({ base: log.logEndOffset, records: [], created: log.time });
    events.push({ type: "rolled", base: log.logEndOffset, reason: "retention" });
  }
  const gone = log.segments.splice(0, count);
  const from = log.logStartOffset;
  log.logStartOffset = log.segments[0]!.base;
  events.push({ type: "segmentsDeleted", bases: gone.map((s) => s.base), from, to: log.logStartOffset, reason });
}

function runRetention(log: StorageLog, events: StorageEvent[], report: boolean) {
  const before = events.length;
  if (log.config.policy === "delete") {
    // Time: oldest first, stop at the first segment that has not expired.
    let n = 0;
    while (n < log.segments.length && isExpired(log, log.segments[n]!)) n++;
    deleteOldest(log, n, "time", events);

    // Size: delete oldest closed segments while what remains still meets the limit.
    const limit = log.config.retentionRecords;
    if (limit !== null) {
      let excess = recordCount(log) - limit;
      let m = 0;
      while (m < log.segments.length - 1 && excess - log.segments[m]!.records.length >= 0) {
        excess -= log.segments[m]!.records.length;
        m++;
      }
      deleteOldest(log, m, "size", events);
    }
  }
  if (report && events.length === before) events.push({ type: "nothingToDo", what: "retention" });
}

function runCompaction(log: StorageLog, events: StorageEvent[]) {
  // The cleaner's key map covers closed segments only: the active segment is not cleanable yet,
  // so a newer value there does not remove older ones until it rolls.
  const closed = log.segments.slice(0, -1);
  const latest = new Map<string, number>();
  for (const seg of closed) for (const r of seg.records) if (r.key !== null) latest.set(r.key, r.offset);

  const removed: number[] = [];
  const tombstonesRemoved: number[] = [];
  let touched = false;

  for (const seg of closed) {
    seg.records = seg.records.filter((r) => {
      if (r.key === null) return true;
      if (latest.get(r.key) !== r.offset) {
        removed.push(r.offset);
        return false;
      }
      if (r.value === null) {
        if (r.cleanedAt === undefined) {
          r.cleanedAt = log.time;
          touched = true;
          return true;
        }
        if (log.time - r.cleanedAt > log.config.deleteRetentionDays) {
          tombstonesRemoved.push(r.offset);
          return false;
        }
      }
      return true;
    });
  }

  // Segments that shrank are merged with the one before, up to the segment size (Kafka groups them).
  const merged: number[] = [];
  const grouped: Segment[] = [];
  for (const seg of closed) {
    const prev = grouped[grouped.length - 1];
    if (prev && prev.records.length + seg.records.length <= log.config.segmentRecords) {
      prev.records.push(...seg.records);
      merged.push(seg.base);
    } else {
      grouped.push(seg);
    }
  }
  log.segments = [...grouped, activeSegment(log)];

  if (removed.length === 0 && tombstonesRemoved.length === 0 && merged.length === 0 && !touched) {
    events.push({ type: "nothingToDo", what: "compact" });
    return;
  }
  events.push({ type: "compacted", removed, tombstonesRemoved, merged });
}

export function simulateStorage(actions: StorageAction[], start: StorageLog) {
  const logs = [start];
  const events: StorageEvent[][] = [];
  let current = start;
  for (const a of actions) {
    const r = applyStorage(current, a);
    current = r.log;
    logs.push(current);
    events.push(r.events);
  }
  return { logs, events };
}

/** Kafka names segment files after their base offset, zero-padded to 20 digits. */
export const fileName = (base: number, ext = "log") => `${String(base).padStart(20, "0")}.${ext}`;
