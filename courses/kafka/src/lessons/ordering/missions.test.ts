import { describe, expect, it } from "vitest";
import { missions, type SandboxCtx } from "./missions";
import { apply, base, CONSUMERS, MAX_PARTITIONS, sandboxStart, violations, type OAction, type OEvent, type OState } from "./model";

/** The moves the try-it buttons allow, matching which buttons are enabled. */
function movesIn(state: OState): OAction[] {
  const out: OAction[] = [];
  for (const order of ["1042", "1043"]) {
    if ((state.written[order] ?? 0) < 3) out.push({ type: "write", order, keyed: true }, { type: "write", order, keyed: false });
  }
  if (state.partitions.length < MAX_PARTITIONS) out.push({ type: "addPartition" });
  for (const c of CONSUMERS) out.push({ type: "read", consumer: c.id });
  return out;
}

function ctxFor(actions: OAction[]): SandboxCtx {
  let state = sandboxStart;
  const events: OEvent[][] = [];
  for (const a of actions) {
    const r = apply(state, a);
    state = r.state;
    events.push(r.events);
  }
  return { start: sandboxStart, state, actions, events };
}

function shortcut(check: (c: SandboxCtx) => boolean, depth: number): OAction[] | null {
  const walk = (actions: OAction[], state: OState, events: OEvent[][]): OAction[] | null => {
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

const solutions: Record<string, OAction[]> = {
  break: [
    { type: "write", order: "1042", keyed: false },
    { type: "write", order: "1042", keyed: false },
    { type: "read", consumer: "c2" },
  ],
  rekey: [
    { type: "write", order: "1042", keyed: true },
    { type: "addPartition" },
    { type: "write", order: "1042", keyed: true },
    { type: "read", consumer: "c3" },
  ],
  drain: [
    { type: "write", order: "1042", keyed: true },
    { type: "read", consumer: "c3" },
    { type: "addPartition" },
    { type: "write", order: "1042", keyed: true },
    { type: "read", consumer: "c3" },
  ],
};

describe("ordering model", () => {
  it("sends a key to the same partition until the partition count changes", () => {
    const run = base.run;
    const written = run.events.flat().filter((e): e is Extract<OEvent, { type: "written" }> => e.type === "written");
    const p1043 = new Set(written.filter((e) => e.order === "1043").map((e) => e.partition));
    expect(p1043.size).toBe(1);
    const p1045 = written.filter((e) => e.order === "1045").map((e) => e.partition);
    // Two events before the fourth partition, one after.
    expect(p1045[0]).toBe(p1045[1]);
    expect(p1045[2]).not.toBe(p1045[0]);
  });

  it("the lesson's steps show the order breaking where the text says", () => {
    const at = (step: number) => base.run.states[base.ends[step]!]!;
    expect(violations(at(1))).toBe(0);
    expect(violations(at(2))).toBe(2);
    expect(violations(at(4))).toBe(2);
    expect(violations(at(5))).toBe(2);
    expect(violations(at(6))).toBe(3);
  });
});

describe("ordering missions", () => {
  it("starts with nothing already done", () => {
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
