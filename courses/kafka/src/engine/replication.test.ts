import { describe, expect, it } from "vitest";
import { applyReplicated, createReplicated, leaderLog, sendStats, simulateReplicated, type RAction, type RState } from "./replication";

const rf3 = (config = {}) => createReplicated({ brokers: 3, partitions: [[1, 2, 3]], config });
const run = (actions: RAction[], start: RState) => simulateReplicated(actions, start);
const last = (r: { states: RState[] }) => r.states[r.states.length - 1]!;
const p0 = (s: RState) => s.partitions[0]!;

describe("replication model", () => {
  it("copies every write to all followers and moves the high watermark", () => {
    const s = last(run([{ type: "produce", value: "a" }, { type: "produce", value: "b" }], rf3()));
    expect(p0(s).logs[2]!.map((r) => r.offset)).toEqual([0, 1]);
    expect(p0(s).hw).toBe(2);
    expect(sendStats(s).acked).toBe(2);
  });

  it("holds an acks=all write while a slow follower is in the ISR, then completes it when the follower is dropped", () => {
    const r = run(
      [{ type: "setSlow", broker: 3, slow: true }, { type: "produce", value: "a" }],
      rf3(),
    );
    expect(p0(last(r)).hw).toBe(0);
    expect(last(r).sends[0]!.status).toBe("pending");
    const after = applyReplicated(last(r), { type: "tick" }).state;
    expect(p0(after).isr).toEqual([1, 2]);
    expect(p0(after).hw).toBe(1);
    expect(after.sends[0]!.status).toBe("acked");
  });

  it("brings a slow follower back into the ISR once it catches up", () => {
    const s = last(
      run(
        [
          { type: "setSlow", broker: 3, slow: true },
          { type: "produce", value: "a" },
          { type: "tick" },
          { type: "setSlow", broker: 3, slow: false },
        ],
        rf3(),
      ),
    );
    expect(p0(s).isr).toEqual([1, 2, 3]);
    expect(p0(s).logs[3]!).toHaveLength(1);
  });

  it("elects an in-sync follower when the leader crashes, and the old leader rejoins as a follower", () => {
    const r = run([{ type: "produce", value: "a" }, { type: "crash", broker: 1 }], rf3());
    expect(p0(last(r)).leader).toBe(2);
    expect(p0(last(r)).epoch).toBe(1);
    const back = applyReplicated(last(r), { type: "restart", broker: 1 }).state;
    expect(p0(back).leader).toBe(2);
    expect(p0(back).isr).toContain(1);
  });

  it("loses an acks=1 write when the leader dies before followers copied it", () => {
    const s = last(
      run(
        [
          { type: "setAcks", acks: 1 },
          { type: "setSlow", broker: 2, slow: true },
          { type: "setSlow", broker: 3, slow: true },
          { type: "produce", value: "a" },
          { type: "crash", broker: 1 },
        ],
        rf3(),
      ),
    );
    expect(p0(s).leader).toBe(2);
    expect(sendStats(s).lost).toBe(1);
  });

  it("does not lose an acks=all write in the same situation: the producer gets an error instead", () => {
    const s = last(
      run(
        [
          { type: "setSlow", broker: 2, slow: true },
          { type: "setSlow", broker: 3, slow: true },
          { type: "produce", value: "a" },
          { type: "crash", broker: 1 },
        ],
        rf3(),
      ),
    );
    expect(sendStats(s)).toMatchObject({ lost: 0, failed: 1 });
  });

  it("truncates the old leader's unreplicated records when it comes back", () => {
    const r = run(
      [
        { type: "setAcks", acks: 1 },
        { type: "setSlow", broker: 2, slow: true },
        { type: "setSlow", broker: 3, slow: true },
        { type: "produce", value: "a" },
        { type: "crash", broker: 1 },
        { type: "produce", value: "b" },
        { type: "restart", broker: 1 },
      ],
      rf3(),
    );
    const s = last(r);
    expect(p0(s).logs[1]!.map((x) => x.value)).toEqual(["b"]);
    expect(r.events.flat().some((e) => e.type === "truncated")).toBe(true);
  });

  it("rejects acks=all writes when the ISR is smaller than min.insync.replicas", () => {
    const s = last(
      run([{ type: "setMinIsr", value: 2 }, { type: "crash", broker: 2 }, { type: "crash", broker: 3 }, { type: "produce", value: "a" }], rf3()),
    );
    expect(s.sends[0]).toMatchObject({ status: "failed", reason: "notEnoughReplicas" });
    expect(leaderLog(p0(s))).toHaveLength(0);
  });

  it("goes offline when no in-sync replica is left, and recovers when the last ISR member returns", () => {
    const r = run(
      [
        { type: "setSlow", broker: 3, slow: true },
        { type: "produce", value: "a" },
        { type: "tick" },
        { type: "crash", broker: 2 },
        { type: "crash", broker: 1 },
      ],
      rf3(),
    );
    expect(p0(last(r)).leader).toBeNull();
    expect(p0(last(r)).isr).toEqual([1]);
    const back = applyReplicated(last(r), { type: "restart", broker: 1 }).state;
    expect(p0(back).leader).toBe(1);
  });

  it("with unclean election on, an out-of-sync replica becomes leader and acked data is lost", () => {
    const s = last(
      run(
        [
          { type: "setSlow", broker: 3, slow: true },
          { type: "produce", value: "a" },
          { type: "tick" },
          { type: "crash", broker: 2 },
          { type: "crash", broker: 1 },
          { type: "setUnclean", value: true },
        ],
        rf3(),
      ),
    );
    expect(p0(s).leader).toBe(3);
    expect(sendStats(s).lost).toBe(1);
  });

  it("with replication factor 1 a crashed broker takes its partition offline, and writes there fail", () => {
    const start = createReplicated({ brokers: 3, partitions: [[1], [2], [3]] });
    const s = last(run([{ type: "crash", broker: 2 }, { type: "produce", value: "a", partition: 1 }], start));
    expect(s.partitions[1]!.leader).toBeNull();
    expect(s.sends[0]).toMatchObject({ status: "failed", reason: "offline" });
  });

  it("moves a partition to a new broker with reassign, copying its data", () => {
    const start = createReplicated({ brokers: 3, partitions: [[1]] });
    const s = last(run([{ type: "produce", value: "a" }, { type: "addBroker" }, { type: "reassign", partition: 0, replicas: [4] }], start));
    expect(p0(s).leader).toBe(4);
    expect(p0(s).logs[4]!.map((x) => x.value)).toEqual(["a"]);
    expect(p0(s).logs[1]).toBeUndefined();
  });

  it("is deterministic and never mutates the input state", () => {
    const start = rf3();
    const copy = structuredClone(start);
    const a = run([{ type: "produce", value: "a" }, { type: "crash", broker: 1 }], start);
    const b = run([{ type: "produce", value: "a" }, { type: "crash", broker: 1 }], start);
    expect(a.states).toEqual(b.states);
    expect(start).toEqual(copy);
  });
});
