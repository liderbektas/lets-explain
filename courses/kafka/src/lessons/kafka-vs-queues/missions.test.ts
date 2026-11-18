import { describe, expect, it } from "vitest";
import { missions, type SandboxCtx } from "./missions";
import {
  ack,
  ANALYTICS,
  base,
  BILLING,
  canDo,
  crash,
  inQueue,
  kafkaSeen,
  kCommit,
  kRead,
  kRewind,
  restart,
  run,
  sandboxStart,
  step,
  take,
  write,
  type QEvent,
  type VAction,
  type VState,
} from "./model";

/** The moves the try-it buttons allow, matching which buttons are enabled. */
function movesIn(s: VState): VAction[] {
  const all: VAction[] = [
    write,
    take("a"),
    ack("a"),
    crash("a"),
    restart("a"),
    take("b"),
    ack("b"),
    crash("b"),
    restart("b"),
    kRead(BILLING),
    kCommit(BILLING),
    kRewind(BILLING),
    kRead(ANALYTICS),
    kCommit(ANALYTICS),
  ];
  return all.filter((a) => canDo(s, a));
}

function ctxFor(actions: VAction[]): SandboxCtx {
  const r = run(actions, sandboxStart);
  return { start: sandboxStart, state: r.states[r.states.length - 1]!, actions, events: r.events };
}

function shortcut(check: (c: SandboxCtx) => boolean, depth: number): string[] | null {
  const walk = (actions: VAction[], s: VState, events: QEvent[][]): VAction[] | null => {
    if (actions.length > 0 && check({ start: sandboxStart, state: s, actions, events })) return actions;
    if (actions.length === depth) return null;
    for (const a of movesIn(s)) {
      const r = step(s, a);
      const found = walk([...actions, a], r.state, [...events, r.events]);
      if (found) return found;
    }
    return null;
  };
  return walk([], sandboxStart, [])?.map((a) => (a.type === "kafka" ? a.action.type : `${a.type}${"w" in a ? `:${a.w}` : ""}`)) ?? null;
}

const solutions: Record<string, VAction[]> = {
  redeliver: [take("a"), crash("a"), take("b"), ack("b")],
  "both-worlds": [take("a"), ack("a"), kRead(BILLING), kRead(ANALYTICS)],
  replay: [kRewind(BILLING), kRead(BILLING)],
};

describe("kafka-vs-queues lesson", () => {
  const at = (i: number) => base.run.states[base.ends[i]!]!;

  it("tells the story the steps describe", () => {
    expect(inQueue(at(1).queue)).toEqual([1, 2]);
    expect(inQueue(at(2).queue)).toEqual([]);
    // Analytics joined the queue late and found nothing.
    expect(base.run.events[base.ends[3]! - 1]![0]!.type).toBe("empty");
    // The crashed worker's message went to B.
    const q4 = at(4).queue;
    expect(q4.acked[5]).toBe("b");
    // Kafka kept every record; both groups read all five.
    const k6 = at(6);
    expect(k6.kafka.topics.orders!.partitions[0]!.records).toHaveLength(6);
    expect(kafkaSeen(k6, BILLING).size).toBe(6);
    expect(kafkaSeen(k6, ANALYTICS).size).toBe(6);
    expect(inQueue(sandboxStart.queue)).toEqual([6]);
  });

  it("starts the try-it step with no mission done", () => {
    for (const m of missions) expect(m.check(ctxFor([])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      expect(m.check(ctxFor(actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(shortcut(m.check, m.par - 1)).toBeNull();
    });
  }
});
