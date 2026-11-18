import { describe, expect, it } from "vitest";
import { allRecords, applyStorage, type StorageAction, type StorageEvent, type StorageLog } from "../../engine/storage";
import { missions, type SandboxCtx } from "./missions";
import { base, MOVES, moveAction, sandboxStart, stepBeats, tableOf, type SandboxMove } from "./model";

function ctxFor(moves: SandboxMove[]): SandboxCtx {
  let log = sandboxStart;
  const actions: StorageAction[] = [];
  const events: StorageEvent[][] = [];
  moves.forEach((m, i) => {
    const a = moveAction(m, i);
    const r = applyStorage(log, a);
    log = r.log;
    actions.push(a);
    events.push(r.events);
  });
  return { start: sandboxStart, log, actions, events };
}

function shortcut(check: (c: SandboxCtx) => boolean, depth: number): SandboxMove[] | null {
  const walk = (moves: SandboxMove[], log: StorageLog, actions: StorageAction[], events: StorageEvent[][]): SandboxMove[] | null => {
    if (moves.length > 0 && check({ start: sandboxStart, log, actions, events })) return moves;
    if (moves.length === depth) return null;
    for (const m of MOVES) {
      const a = moveAction(m, moves.length);
      const r = applyStorage(log, a);
      const found = walk([...moves, m], r.log, [...actions, a], [...events, r.events]);
      if (found) return found;
    }
    return null;
  };
  return walk([], sandboxStart, [], []);
}

const solutions: Record<string, SandboxMove[]> = {
  "only-ali": ["d-ece", "d-can"],
  clean: ["w-ece", "w-can", "w-ali", "compact"],
  "forget-ece": ["d-ece", "w-ali", "w-can", "compact", "wait", "compact"],
};

describe("log-compaction lesson", () => {
  const offsets = (step: number) =>
    base.run.logs[base.ends[step]!]!.segments.map((s) => `${s.base}:${s.records.map((r) => r.offset).join(",")}`);

  it("plays the story the text tells", () => {
    expect(offsets(3)).toEqual(["0:2,4,5", "6:6"]);
    expect(offsets(4)).toEqual(["0:6,7,8", "9:9"]);
    expect(offsets(5)).toEqual(["0:9,10,11", "12:12"]);
    expect(offsets(6)).toEqual(["0:9,11", "12:12"]);
    expect([...tableOf(base.run.logs[base.ends[6]!]!).entries()]).toEqual([
      ["can", "İzmir"],
      ["ali", "Konya"],
    ]);
    expect(stepBeats).toHaveLength(10);
  });
});

describe("log-compaction missions", () => {
  it("start with nothing done", () => {
    for (const m of missions) expect(m.check(ctxFor([])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution wins in exactly par moves`, () => {
      expect(solutions[m.id]).toHaveLength(m.par);
      expect(m.check(ctxFor(solutions[m.id]!))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(shortcut(m.check, m.par - 1)).toBeNull();
    });
  }

  it("compacting before the active segment closes removes nothing", () => {
    const ctx = ctxFor(["compact"]);
    expect(allRecords(ctx.log).map((r) => r.offset)).toEqual([0, 1, 2, 3]);
  });
});
