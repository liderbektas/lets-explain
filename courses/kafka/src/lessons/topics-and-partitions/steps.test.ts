import { describe, expect, it } from "vitest";
import { groupStats } from "../../engine/cluster";
import { base, GROUP, TOPIC } from "./model";

const after = (step: number) => base.run.states[base.ends[step]!]!;
const eventsOf = (step: number) => base.run.events.slice(base.startOf(step), base.ends[step]!).flat();

describe("topics-and-partitions steps match the text", () => {
  it("step 2: lag builds up on one partition", () => {
    expect(after(1).topics[TOPIC]!.partitions[0]!.logEndOffset).toBe(7);
    expect(groupStats(after(1), GROUP).lag).toBe(5);
  });

  it("step 3: old records stay in P0, new partitions are empty", () => {
    expect(after(2).topics[TOPIC]!.partitions.map((p) => p.records.length)).toEqual([7, 0, 0]);
  });

  it("step 4: keyless records go P1, P2, P0, ... and start at offset 0", () => {
    const produced = eventsOf(3).flatMap((e) => (e.type === "produced" ? [[e.partition, e.offset]] : []));
    expect(produced).toEqual([[1, 0], [2, 0], [0, 7], [1, 1], [2, 1], [0, 8]]);
  });

  it("step 5: P2's newest is read while older P0 records wait", () => {
    const read = eventsOf(4).flatMap((e) => (e.type === "delivered" ? [`${e.tp}@${e.offset}`] : []));
    expect(read).toEqual(["orders-0@2", "orders-1@0", "orders-2@0", "orders-0@3", "orders-1@1", "orders-2@1"]);
    expect(read.some((r) => r.endsWith("@4") && r.startsWith("orders-0"))).toBe(false);
  });

  it("step 6: one partition each and no re-reads", () => {
    const g = after(5).groups[GROUP]!;
    expect(g.members.map((m) => m.assigned)).toEqual([["orders-0"], ["orders-1"], ["orders-2"]]);
    expect(groupStats(after(5), GROUP).duplicates).toBe(0);
    for (const id of ["billing-1", "billing-2", "billing-3"]) {
      expect(eventsOf(5).filter((e) => e.type === "delivered" && e.member === id)).toHaveLength(2);
    }
  });

  it("step 7: partitions live on brokers 1, 2, 3", () => {
    expect(after(6).topics[TOPIC]!.partitions.map((p) => p.leader)).toEqual([1, 2, 3]);
  });

  it("step 8: the fourth reader is idle", () => {
    const g = after(7).groups[GROUP]!;
    expect(g.members.find((m) => m.id === "billing-4")!.assigned).toEqual([]);
    expect(eventsOf(7).some((e) => e.type === "pollEmpty")).toBe(true);
  });
});
