import { describe, expect, it } from "vitest";
import { missions, type SandboxCtx } from "./missions";
import {
  apply,
  base,
  movesIn,
  overcount,
  sandboxStart,
  tableOf,
  visible,
  type Action,
  type StreamsEvent,
  type StreamsState,
} from "./model";

function ctxFor(actions: Action[]): SandboxCtx {
  let state = sandboxStart;
  const events: StreamsEvent[][] = [];
  for (const a of actions) {
    const r = apply(state, a);
    state = r.state;
    events.push(r.events);
  }
  return { start: sandboxStart, state, actions, events };
}

function shortcut(check: (c: SandboxCtx) => boolean, depth: number): Action[] | null {
  const walk = (actions: Action[], state: StreamsState, events: StreamsEvent[][]): Action[] | null => {
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

const ist: Action = { type: "order", city: "İstanbul" };
const process: Action = { type: "process" };
const crash: Action = { type: "crash" };
const restart: Action = { type: "restart" };

const solutions: Record<string, Action[]> = {
  "double-count": [ist, process, crash, restart, process],
  "exactly-once": [{ type: "setGuarantee", guarantee: "exactly_once_v2" }, ist, process, crash, restart, process],
  "commit-first": [ist, process, { type: "commit" }, crash, restart],
};

describe("kafka-streams lesson", () => {
  it("tells the story the steps describe", () => {
    const at = (step: number) => base.run.states[base.ends[step]!]!;
    expect(at(3).store).toEqual({ İstanbul: 2, Ankara: 1 });
    expect(at(3).output).toHaveLength(3); // three updates in the stream…
    expect(Object.keys(tableOf(at(3).output))).toHaveLength(2); // …two rows in the table
    expect(at(5).store).toEqual(at(4).store); // restored from the changelog after losing the disk
    expect(overcount(at(6))).toBe(2); // at_least_once counted two orders twice
    expect(overcount(at(7))).toBe(0); // the reset recount is right
    expect(overcount(at(8))).toBe(0); // exactly_once_v2 survived the same crash
    expect(at(8).output.some((u) => u.status === "aborted")).toBe(true);
    expect(tableOf(at(8).output).Ankara).toBe(3);
    expect(visible(at(8).output).every((u) => u.status === "committed")).toBe(true);
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
