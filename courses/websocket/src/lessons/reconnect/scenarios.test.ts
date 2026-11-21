import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { reconnectEverySecond, stopOn4001, withCap, withJitter } from "./code";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Run = { lines: string[]; edits?: ((t: string) => string)[] };

const tabs = (n: number) => `for i in $(seq 1 ${n}); do TAB=$i node tab.js & done`;

const solutions: Record<string, Run> = {
  "come-back": { lines: ["nano tab.js", tabs(5), "pkill -f chat.js", "node chat.js &", "sleep 10"], edits: [reconnectEverySecond] },
  stampede: { lines: ["nano tab.js", "pkill -f tab.js", tabs(30), "pkill -f chat.js", "node chat.js &", "sleep 40"], edits: [withJitter] },
  ceiling: { lines: ["nano tab.js", "pkill -f tab.js", tabs(5), "sleep 300", "node chat.js &", "sleep 35"], edits: [withCap] },
  "know-when-to-stop": { lines: ["nano tab.js", "pkill -f tab.js", tabs(5), "sleep 30"], edits: [stopOn4001] },
};

const alternatives: Record<string, Run[]> = {
  ceiling: [{ lines: ["nano tab.js", "pkill -f tab.js", tabs(5), "sleep 300", "node chat.js &", "sleep 35"], edits: [withJitter] }],
};

const wrong: Record<string, Run> = {
  // Never reloaded the tabs: the old code can't come back.
  "come-back": { lines: ["nano tab.js", "pkill -f chat.js", "node chat.js &", "sleep 10"], edits: [reconnectEverySecond] },
  // Backoff without jitter: they still move as one herd.
  stampede: { lines: ["nano tab.js", "pkill -f tab.js", tabs(30), "pkill -f chat.js", "node chat.js &", "sleep 40"], edits: [(t) => t.replace("    setTimeout(connect, 1000);", "    setTimeout(connect, 1000 * 2 ** (attempt++));").replace("function connect() {", "let attempt = 0;\nfunction connect() {")] },
  // No ceiling: the next try is minutes away.
  ceiling: { lines: ["pkill -f tab.js", tabs(5), "sleep 300", "node chat.js &", "sleep 35"] },
  // Still retrying on 4001.
  "know-when-to-stop": { lines: ["pkill -f tab.js", tabs(5), "sleep 30"] },
};

describe("reconnect", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
  const online = (step: number) => at(step).conns.filter((c) => c.serverClosedAt === null && c.server.startsWith("proc:")).length;
  const refused = (step: number) => at(step).exchanges.slice(at(step - 1).exchanges.length).filter((e) => e.status === 503).length;

  it("the story: nobody comes back; then a stampede of 503s; then jitter brings everyone back", () => {
    expect(steps).toHaveLength(5);
    expect(online(0)).toBe(0);
    // Everyone retrying together keeps the server overloaded: hardly anyone gets back in.
    expect(online(1)).toBeLessThan(10);
    expect(refused(1)).toBeGreaterThan(50);
    // With jitter the returns spread out and everyone is back.
    expect(online(2)).toBe(20);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });
    it(`${s.id}: the intended commands win in exactly par`, () => {
      const sol = solutions[s.id]!;
      const r = typeInto(s.start, sol.lines, [...(sol.edits ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });
    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.lines.join(" ; ")}`, () => {
        expect(s.check(typeInto(s.start, alt.lines, [...(alt.edits ?? [])]).ctx)).toBe(true);
      });
    }
    it(`${s.id}: a tempting wrong move does not win`, () => {
      const w = wrong[s.id]!;
      expect(s.check(typeInto(s.start, w.lines, [...(w.edits ?? [])]).ctx)).toBe(false);
    });
  }
});
