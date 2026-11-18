import { describe, expect, it } from "vitest";
import { missions } from "./missions";
import { applyMove, knobsAfter, measure, MOVES, settingsOf, START_KNOBS, type Knobs, type SandboxMove } from "./model";

const ctx = (k: Knobs) => ({ knobs: k, m: measure(settingsOf(k)) });

function shortcut(check: (c: ReturnType<typeof ctx>) => boolean, depth: number): SandboxMove[] | null {
  const walk = (moves: SandboxMove[], k: Knobs): SandboxMove[] | null => {
    if (moves.length > 0 && check(ctx(k))) return moves;
    if (moves.length === depth) return null;
    for (const m of MOVES) {
      const next = applyMove(k, m);
      if (!next) continue;
      const found = walk([...moves, m], next);
      if (found) return found;
    }
    return null;
  };
  return walk([], START_KNOBS);
}

const solutions: Record<string, SandboxMove[]> = {
  fifty: ["batch+", "batch+"],
  "few-requests": ["batch+", "batch+", "batch+"],
  "beat-network": ["batch+", "batch+", "batch+", "lz4"],
  "read-fast": ["batch+", "batch+", "part+", "part+", "cons+", "cons+"],
};

describe("why-fast model", () => {
  it("gives the round numbers the lesson quotes", () => {
    expect(measure({ batch: 1, compression: "none", partitions: 1, consumers: 1 }).produce).toBe(990);
    expect(measure({ batch: 100, compression: "none", partitions: 1, consumers: 1 }).produce).toBe(50_000);
    expect(measure({ batch: 100, compression: "none", partitions: 4, consumers: 4 }).produce).toBe(100_000);
    expect(measure({ batch: 100, compression: "lz4", partitions: 4, consumers: 5 })).toMatchObject({ working: 4, idle: 1 });
  });
});

describe("why-fast missions", () => {
  it("start with nothing done", () => {
    for (const m of missions) expect(m.check(ctx(START_KNOBS)), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution wins in exactly par moves`, () => {
      expect(solutions[m.id]).toHaveLength(m.par);
      expect(m.check(ctx(knobsAfter(solutions[m.id]!)))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(shortcut(m.check, m.par - 1)).toBeNull();
    });
  }
});

describe("why-fast steps", () => {
  it("tell the numbers the text quotes", async () => {
    const { steps } = await import("./model");
    const at = (i: number, which: "before" | "after") => measure(steps[i]![which]);
    expect(at(4, "before").produce).toBe(7_920);
    expect(at(4, "after")).toMatchObject({ produce: 100_000, networkBound: true, consume: 100_000 });
    expect(at(5, "after")).toMatchObject({ produce: 200_000, consume: 200_000 });
    expect(at(6, "before")).toMatchObject({ produce: 50_000, consume: 25_000 });
    expect(at(6, "after")).toMatchObject({ produce: 100_000, consume: 100_000, idle: 1 });
  });
});
