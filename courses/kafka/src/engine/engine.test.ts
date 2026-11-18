import { describe, expect, it } from "vitest";
import { apply, createCluster, groupStats, simulate } from "./cluster";
import { murmur2, partitionForKey } from "./murmur2";
import type { Action, ClusterState } from "./types";

const bytes = (s: string) => new TextEncoder().encode(s);

const run = (actions: Action[], brokers = 1): ClusterState => {
  const { states } = simulate(actions, createCluster({ brokers }));
  return states[states.length - 1]!;
};

describe("murmur2", () => {
  // Expected values from Kafka's own UtilsTest.testMurmur2.
  it.each([
    ["21", -973932308],
    ["foobar", -790332482],
    ["a-little-bit-long-string", -985981536],
    ["a-little-bit-longer-string", -1486304829],
    ["lkjh234lh9fiuh90y23oiuhsafujhadof229phr9h19h89h8", -58897971],
    ["abc", 479470107],
  ])("hashes %s like Kafka", (input, expected) => {
    expect(murmur2(bytes(input))).toBe(expected);
  });

  it("sends the same key to the same partition", () => {
    const first = partitionForKey("customer-42", 6);
    for (let i = 0; i < 5; i++) expect(partitionForKey("customer-42", 6)).toBe(first);
  });
});

describe("producing", () => {
  it("assigns increasing offsets per partition", () => {
    const s = run([
      { type: "createTopic", name: "orders", partitions: 1 },
      { type: "produce", topic: "orders", value: "a" },
      { type: "produce", topic: "orders", value: "b" },
      { type: "produce", topic: "orders", value: "c" },
    ]);
    const p = s.topics.orders!.partitions[0]!;
    expect(p.records.map((r) => r.offset)).toEqual([0, 1, 2]);
    expect(p.logEndOffset).toBe(3);
  });

  it("routes keyed records by hash and keyless ones round-robin", () => {
    const { events } = simulate(
      [
        { type: "createTopic", name: "t", partitions: 3 },
        { type: "produce", topic: "t", value: "1" },
        { type: "produce", topic: "t", value: "2" },
        { type: "produce", topic: "t", value: "3" },
        { type: "produce", topic: "t", value: "k", key: "user-7" },
      ],
      createCluster(),
    );
    const produced = events.flat().filter((e) => e.type === "produced");
    expect(produced.slice(0, 3).map((e) => e.partition)).toEqual([0, 1, 2]);
    expect(produced[3]!.partition).toBe(partitionForKey("user-7", 3));
  });

  it("rejects bad actions without changing state", () => {
    const start = createCluster();
    const result = apply(start, { type: "produce", topic: "missing", value: "x" });
    expect(result.state).toBe(start);
    expect(result.events[0]!.type).toBe("error");
  });
});

describe("consumer groups", () => {
  const base: Action[] = [
    { type: "createTopic", name: "orders", partitions: 1 },
    { type: "produce", topic: "orders", value: "o1" },
    { type: "produce", topic: "orders", value: "o2" },
    { type: "produce", topic: "orders", value: "o3" },
  ];

  it("reading does not delete records", () => {
    const s = run([
      ...base,
      { type: "joinGroup", group: "billing", member: "c1", topics: ["orders"], autoOffsetReset: "earliest" },
      { type: "poll", group: "billing", member: "c1" },
    ]);
    expect(s.topics.orders!.partitions[0]!.records).toHaveLength(3);
    expect(groupStats(s, "billing").delivered).toBe(3);
  });

  it("each group keeps its own position", () => {
    const s = run([
      ...base,
      { type: "joinGroup", group: "billing", member: "b1", topics: ["orders"], autoOffsetReset: "earliest" },
      { type: "joinGroup", group: "analytics", member: "a1", topics: ["orders"], autoOffsetReset: "earliest" },
      { type: "poll", group: "billing", member: "b1" },
      { type: "poll", group: "analytics", member: "a1", max: 1 },
    ]);
    expect(s.groups.billing!.members[0]!.positions["orders-0"]).toBe(3);
    expect(s.groups.analytics!.members[0]!.positions["orders-0"]).toBe(1);
  });

  it("auto.offset.reset=latest skips records written before the group existed", () => {
    const s = run([
      ...base,
      { type: "joinGroup", group: "late", member: "c1", topics: ["orders"] },
      { type: "poll", group: "late", member: "c1" },
    ]);
    expect(groupStats(s, "late").delivered).toBe(0);
  });

  it("committed offset is the next offset to read", () => {
    const s = run([
      ...base,
      { type: "joinGroup", group: "g", member: "c1", topics: ["orders"], autoOffsetReset: "earliest" },
      { type: "poll", group: "g", member: "c1", max: 2 },
      { type: "commit", group: "g", member: "c1" },
    ]);
    expect(s.groups.g!.committed["orders-0"]).toBe(2);
    expect(groupStats(s, "g").lag).toBe(1);
  });

  it("a crash before commit makes the next owner read the same records again", () => {
    const s = run([
      ...base,
      { type: "joinGroup", group: "g", member: "c1", topics: ["orders"], autoOffsetReset: "earliest" },
      { type: "poll", group: "g", member: "c1", max: 1 },
      { type: "commit", group: "g", member: "c1" },
      { type: "poll", group: "g", member: "c1" },
      { type: "crashMember", group: "g", member: "c1" },
      { type: "joinGroup", group: "g", member: "c2", topics: ["orders"] },
      { type: "poll", group: "g", member: "c2" },
    ]);
    const stats = groupStats(s, "g");
    expect(stats.unique).toBe(3);
    expect(stats.duplicates).toBe(2);
  });

  it("splits partitions across members and rebalances when one leaves", () => {
    const { states, events } = simulate(
      [
        { type: "createTopic", name: "t", partitions: 4 },
        { type: "joinGroup", group: "g", member: "a", topics: ["t"] },
        { type: "joinGroup", group: "g", member: "b", topics: ["t"] },
        { type: "leaveGroup", group: "g", member: "a" },
      ],
      createCluster(),
    );
    const afterTwo = states[3]!.groups.g!;
    expect(afterTwo.members.find((m) => m.id === "a")!.assigned).toEqual(["t-0", "t-1"]);
    expect(afterTwo.members.find((m) => m.id === "b")!.assigned).toEqual(["t-2", "t-3"]);
    expect(states[4]!.groups.g!.members[0]!.assigned).toEqual(["t-0", "t-1", "t-2", "t-3"]);
    expect(events[3]!.some((e) => e.type === "rebalanced")).toBe(true);
  });

  it("seek rewinds a member so it can replay history", () => {
    const s = run([
      ...base,
      { type: "joinGroup", group: "g", member: "c1", topics: ["orders"], autoOffsetReset: "earliest" },
      { type: "poll", group: "g", member: "c1" },
      { type: "seek", group: "g", member: "c1", tp: "orders-0", offset: 0 },
      { type: "poll", group: "g", member: "c1" },
    ]);
    expect(groupStats(s, "g").delivered).toBe(6);
  });
});

describe("retention", () => {
  it("deletes old records without reusing offsets", () => {
    const s = run([
      { type: "createTopic", name: "t", partitions: 1 },
      { type: "produce", topic: "t", value: "a" },
      { type: "produce", topic: "t", value: "b" },
      { type: "produce", topic: "t", value: "c" },
      { type: "deleteRecordsBefore", topic: "t", partition: 0, offset: 2 },
      { type: "produce", topic: "t", value: "d" },
    ]);
    const p = s.topics.t!.partitions[0]!;
    expect(p.logStartOffset).toBe(2);
    expect(p.records.map((r) => r.offset)).toEqual([2, 3]);
  });

  it("a slow group loses records retention deleted before it read them", () => {
    const s = run([
      { type: "createTopic", name: "t", partitions: 1 },
      { type: "produce", topic: "t", value: "a" },
      { type: "produce", topic: "t", value: "b" },
      { type: "produce", topic: "t", value: "c" },
      { type: "joinGroup", group: "g", member: "c1", topics: ["t"], autoOffsetReset: "earliest" },
      { type: "poll", group: "g", member: "c1", max: 1 },
      { type: "deleteRecordsBefore", topic: "t", partition: 0, offset: 2 },
      { type: "poll", group: "g", member: "c1" },
    ]);
    expect(groupStats(s, "g").skipped).toBe(1);
    expect(s.groups.g!.deliveries.map((d) => d.offset)).toEqual([0, 2]);
  });
});

describe("adding partitions", () => {
  it("adds empty partitions, refuses to shrink, and moves some keys", () => {
    const start: Action[] = [{ type: "createTopic", name: "t", partitions: 2 }];
    const s = run([...start, { type: "addPartitions", topic: "t", count: 3 }]);
    expect(s.topics.t!.partitions.map((p) => p.logEndOffset)).toEqual([0, 0, 0]);
    const shrink = apply(s, { type: "addPartitions", topic: "t", count: 2 });
    expect(shrink.events[0]!.type).toBe("error");
    const keys = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(keys.some((k) => partitionForKey(k, 2) !== partitionForKey(k, 3))).toBe(true);
  });

  it("rebalances a group subscribed to the topic", () => {
    const s = run([
      { type: "createTopic", name: "t", partitions: 1 },
      { type: "joinGroup", group: "g", member: "a", topics: ["t"] },
      { type: "joinGroup", group: "g", member: "b", topics: ["t"] },
      { type: "addPartitions", topic: "t", count: 2 },
    ]);
    expect(s.groups.g!.members.map((m) => m.assigned)).toEqual([["t-0"], ["t-1"]]);
  });
});
