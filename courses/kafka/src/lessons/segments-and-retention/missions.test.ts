import { describe, expect, it } from "vitest";
import { applyStorage, type StorageAction, type StorageEvent, type StorageLog } from "../../engine/storage";
import { missions, type SandboxCtx } from "./missions";
import { moveAction, sandboxStart, type SandboxMove } from "./model";

const MOVES: SandboxMove[] = ["write", "day1", "day3"];

function ctxFor(moves: SandboxMove[]): SandboxCtx {
  let log = sandboxStart;
  const actions: StorageAction[] = [];
  const events: StorageEvent[][] = [];
  for (const m of moves) {
    const a = moveAction(m);
    const r = applyStorage(log, a);
    log = r.log;
    actions.push(a);
    events.push(r.events);
  }
  return { start: sandboxStart, log, actions, events };
}

/** The first winning sequence of at most `depth` moves, or null. */
function shortcut(check: (c: SandboxCtx) => boolean, depth: number): SandboxMove[] | null {
  const walk = (moves: SandboxMove[], log: StorageLog, actions: StorageAction[], events: StorageEvent[][]): SandboxMove[] | null => {
    if (moves.length > 0 && check({ start: sandboxStart, log, actions, events })) return moves;
    if (moves.length === depth) return null;
    for (const m of MOVES) {
      const a = moveAction(m);
      const r = applyStorage(log, a);
      const found = walk([...moves, m], r.log, [...actions, a], [...events, r.events]);
      if (found) return found;
    }
    return null;
  };
  return walk([], sandboxStart, [], []);
}

const solutions: Record<string, SandboxMove[]> = {
  roll: ["write", "write", "write"],
  "start-at-3": ["day3", "write", "day3", "day3"],
  // Day 9's write rolls the segment by age (segment.ms), closing it with the 9-day-old offset 3 inside.
  "old-survivor": ["day3", "write", "day3", "day3", "write"],
};

describe("segments-and-retention missions", () => {
  it("start with one closed segment and an active one, nothing done yet", () => {
    expect(sandboxStart.segments.map((s) => s.base)).toEqual([0, 3]);
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

  it("letting everything expire empties the log instead of starting it at 3", () => {
    const ctx = ctxFor(["day3", "day3", "day3"]);
    expect(ctx.log.logStartOffset).toBe(4);
    expect(missions[1]!.check(ctx)).toBe(false);
  });
});
