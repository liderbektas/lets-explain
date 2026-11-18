import { describe, expect, it } from "vitest";
import { activeSegment, applyStorage, createLog, fileName, segmentFor, simulateStorage, type StorageAction } from "./storage";

const put = (key: string | null, value: string | null = "v"): StorageAction => ({ type: "append", key, value });
const tick = (days: number): StorageAction => ({ type: "tick", days });

describe("storage: segments", () => {
  it("rolls a new segment named after its first offset when the active one is full", () => {
    const { logs, events } = simulateStorage([put(null), put(null), put(null), put(null)], createLog({ segmentRecords: 3 }));
    const log = logs.at(-1)!;
    expect(log.segments.map((s) => s.base)).toEqual([0, 3]);
    expect(events[3]).toContainEqual({ type: "rolled", base: 3, reason: "size" });
    expect(fileName(3)).toBe("00000000000000000003.log");
  });

  it("rolls on the next append once the first record is older than segment.ms", () => {
    const { logs } = simulateStorage([put(null), tick(8), put(null)], createLog({ segmentDays: 7, retentionDays: null }));
    expect(logs.at(-1)!.segments.map((s) => s.base)).toEqual([0, 1]);
  });

  it("finds the segment holding an offset", () => {
    const { logs } = simulateStorage(Array.from({ length: 7 }, () => put(null)), createLog({ segmentRecords: 3 }));
    const log = logs.at(-1)!;
    expect(segmentFor(log, 4)!.base).toBe(3);
    expect(segmentFor(log, 6)!.base).toBe(6);
    expect(segmentFor(log, 9)).toBeNull();
  });
});

describe("storage: retention", () => {
  it("deletes a whole segment only when its newest record has expired", () => {
    const start = createLog({ segmentRecords: 3, retentionDays: 7 });
    const { logs } = simulateStorage(
      [put(null), put(null), put(null), tick(3), put(null), tick(5)],
      start,
    );
    // day 8: segment 0 (all day 0) expired; segment 3 (day 3) has not.
    const log = logs.at(-1)!;
    expect(log.segments.map((s) => s.base)).toEqual([3]);
    expect(log.logStartOffset).toBe(3);
  });

  it("keeps old records that share a segment with a newer one", () => {
    const { logs } = simulateStorage([put(null), tick(5), put(null), tick(4)], createLog({ segmentRecords: 3, retentionDays: 7 }));
    const log = logs.at(-1)!;
    expect(log.segments[0]!.records.map((r) => r.offset)).toEqual([0, 1]);
  });

  it("rolls a fresh segment before deleting an expired active one, and never reuses offsets", () => {
    const { logs } = simulateStorage([put(null), put(null), tick(8)], createLog({ segmentRecords: 3, retentionDays: 7 }));
    const log = logs.at(-1)!;
    expect(log.segments).toHaveLength(1);
    expect(activeSegment(log).base).toBe(2);
    expect(log.logStartOffset).toBe(2);
    expect(applyStorage(log, put(null)).log.logEndOffset).toBe(3);
  });

  it("retention.bytes deletes oldest segments while the rest still meets the limit", () => {
    const actions = Array.from({ length: 8 }, () => put(null));
    const { logs } = simulateStorage([...actions, { type: "retention" }], createLog({ segmentRecords: 3, retentionDays: null, retentionRecords: 4 }));
    // 8 records in [0-2][3-5][6-7]: deleting [0-2] leaves 5 >= 4; deleting [3-5] too would leave 2.
    expect(logs.at(-1)!.segments.map((s) => s.base)).toEqual([3, 6]);
  });
});

describe("storage: compaction", () => {
  const compacted = (actions: StorageAction[]) =>
    simulateStorage(actions, createLog({ policy: "compact", retentionDays: null, segmentDays: null, segmentRecords: 3 }));

  it("rejects records without a key", () => {
    const { events } = compacted([put(null)]);
    expect(events[0]![0]!.type).toBe("error");
  });

  it("keeps the latest value per key in closed segments and never changes offsets", () => {
    const { logs } = compacted([put("a", "1"), put("b", "1"), put("a", "2"), put("c", "1"), put("x"), { type: "compact" }]);
    const log = logs.at(-1)!;
    expect(log.segments.flatMap((s) => s.records.map((r) => r.offset))).toEqual([1, 2, 3, 4]);
  });

  it("does not let the active segment's records remove anything yet", () => {
    const { logs } = compacted([put("a", "1"), put("b"), put("c"), put("a", "2"), { type: "compact" }]);
    expect(logs.at(-1)!.segments.flatMap((s) => s.records.map((r) => r.offset))).toEqual([0, 1, 2, 3]);
  });

  it("keeps a tombstone through its first cleaning and drops it after delete.retention.ms", () => {
    const start = [put("a", "1"), put("a", null), put("b"), put("c")];
    const once = compacted([...start, { type: "compact" }]).logs.at(-1)!;
    expect(once.segments[0]!.records.map((r) => r.offset)).toEqual([1, 2]);
    const later = compacted([...start, { type: "compact" }, tick(2), { type: "compact" }]).logs.at(-1)!;
    expect(later.segments[0]!.records.map((r) => r.offset)).toEqual([2]);
  });

  it("merges segments that became small", () => {
    const actions = [put("a"), put("a"), put("a"), put("a"), put("a"), put("a"), put("b"), { type: "compact" } as StorageAction];
    const log = compacted(actions).logs.at(-1)!;
    expect(log.segments.map((s) => s.base)).toEqual([0, 6]);
    expect(log.segments[0]!.records.map((r) => r.offset)).toEqual([5]);
  });
});
