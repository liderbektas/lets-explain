import { describe, expect, it } from "vitest";
import { missions, type SandboxCtx } from "./missions";
import {
  apply,
  base,
  indexDuplicates,
  movesIn,
  sandboxStart,
  topicDuplicates,
  type Action,
  type ConnectEvent,
  type ConnectState,
} from "./model";

function ctxFor(actions: Action[]): SandboxCtx {
  let state = sandboxStart;
  const events: ConnectEvent[][] = [];
  for (const a of actions) {
    const r = apply(state, a);
    state = r.state;
    events.push(r.events);
  }
  return { start: sandboxStart, state, actions, events };
}

function shortcut(check: (c: SandboxCtx) => boolean, depth: number): Action[] | null {
  const walk = (actions: Action[], state: ConnectState, events: ConnectEvent[][]): Action[] | null => {
    if (actions.length > 0 && check({ start: sandboxStart, state, actions, events })) return actions;
    if (actions.length === depth) return null;
    for (const a of movesIn(state)) {
      const r = apply(state, a);
      const found = walk([...actions, a], r.state, [...events, r.events]);
      if (found) return found;
    }
    return null;
  };
  return walk([], sandboxStart, []);
}

const insert: Action = { type: "insertRow" };
const poll: Action = { type: "sourcePoll" };
const crash1: Action = { type: "crash", worker: "w1" };

const solutions: Record<string, Action[]> = {
  twice: [insert, poll, crash1, poll],
  "safe-handover": [insert, insert, poll, { type: "sourceFlush" }, crash1],
  masked: [{ type: "toggleMask" }, insert, poll, { type: "sinkPoll" }],
  upsert: [{ type: "setSinkMode", mode: "upsert" }, insert, poll, crash1, poll, { type: "sinkPoll" }],
};

describe("kafka-connect lesson", () => {
  it("tells the story the steps describe", () => {
    const at = (step: number) => base.run.states[base.ends[step]!]!;
    expect(at(2).topic).toHaveLength(3);
    expect(at(3).index).toHaveLength(3);
    expect(at(4).topic[3]!.card).toBe("**** ****"); // the mask SMT hid the card
    expect(topicDuplicates(at(6))).toBe(2); // the crash before a flush sent rows 5 and 6 again
    expect(at(6).tasks.source).toBe("w2");
    expect(at(7).tasks).toEqual({ source: "w1", sink: "w2" });
    expect(indexDuplicates(at(8))).toBe(0); // upsert absorbed the repeats
    expect(at(8).index).toHaveLength(6);
  });

  it("starts the sandbox with nothing already done", () => {
    for (const m of missions) expect(m.check(ctxFor([])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      expect(m.check(ctxFor(actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(shortcut(m.check, m.par - 1)?.map((a) => a.type)).toBeUndefined();
    });
  }
});
