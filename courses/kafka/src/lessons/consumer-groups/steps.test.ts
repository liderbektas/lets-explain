import { describe, expect, it } from "vitest";
import { groupStats } from "../../engine/cluster";
import { ANALYTICS, base, BILLING } from "./model";

const after = (step: number) => base.run.states[base.ends[step]!]!;
const before = (step: number) => base.run.states[base.startOf(step)]!;
const eventsOf = (step: number) => base.run.events.slice(base.startOf(step), base.ends[step]!).flat();
const assigned = (step: number) =>
  Object.fromEntries(after(step).groups[BILLING]!.members.map((m) => [m.id, m.assigned.map((t) => Number(t.slice(-1)))]));
const dupsIn = (step: number, g = BILLING) => groupStats(after(step), g).duplicates - (before(step).groups[g] ? groupStats(before(step), g).duplicates : 0);

describe("consumer-groups steps match the text", () => {
  it("step 1: one member reads all six", () => {
    expect(assigned(0)).toEqual({ "billing-1": [0, 1, 2] });
    expect(eventsOf(0).filter((e) => e.type === "delivered")).toHaveLength(6);
  });
  it("step 2: two members split 2 + 1", () => {
    expect(assigned(1)).toEqual({ "billing-1": [0, 1], "billing-2": [2] });
    expect(dupsIn(1)).toBe(0);
  });
  it("step 3: billing-1 takes over P2 and re-reads offsets 3–4", () => {
    expect(assigned(2)).toEqual({ "billing-1": [0, 1, 2] });
    expect(dupsIn(2)).toBe(2);
    const dups = eventsOf(2).filter((e) => e.type === "delivered" && e.duplicate);
    expect(dups.map((e) => (e.type === "delivered" ? `${e.tp}@${e.offset}` : ""))).toEqual(["orders-2@3", "orders-2@4"]);
  });
  it("step 4: analytics reads all 15 records on its own, billing untouched", () => {
    expect(eventsOf(3).filter((e) => e.type === "delivered")).toHaveLength(15);
    expect(after(3).groups[BILLING]!.committed).toEqual(before(3).groups[BILLING]!.committed);
    expect(groupStats(after(3), ANALYTICS).lag).toBe(0);
  });
  it("step 5: billing-2 comes back with no re-reads", () => {
    expect(assigned(4)).toEqual({ "billing-1": [0, 1], "billing-2": [2] });
    expect(dupsIn(4)).toBe(0);
  });
  it("step 6: one partition each", () => {
    expect(assigned(5)).toEqual({ "billing-1": [0], "billing-2": [1], "billing-3": [2] });
  });
  it("step 7: the spare takes over when billing-1 crashes", () => {
    const mid = base.run.states[base.startOf(6) + 1]!;
    expect(mid.groups[BILLING]!.members.find((m) => m.id === "billing-4")!.assigned).toEqual([]);
    expect(assigned(6)).toEqual({ "billing-2": [0], "billing-3": [1], "billing-4": [2] });
    expect(dupsIn(6)).toBe(0);
    expect(groupStats(after(6), BILLING).lag).toBe(0);
  });
});

describe("consumer-groups step 8 numbers", () => {
  it("billing is at 8, analytics at 5 on every partition", () => {
    const s = after(7);
    expect(Object.values(s.groups[BILLING]!.committed)).toEqual([8, 8, 8]);
    expect(Object.values(s.groups[ANALYTICS]!.committed)).toEqual([5, 5, 5]);
  });
  it("billing-2 moved from P2 to P1 when billing-3 joined", () => {
    expect(assigned(4)["billing-2"]).toEqual([2]);
    expect(assigned(5)["billing-2"]).toEqual([1]);
  });
});
