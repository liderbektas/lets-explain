import { describe, expect, it } from "vitest";
import { shortestWin } from "@lets-explain/core/lib/missionSearch";
import { missions, type KubeCtx } from "./missions";
import { apply, simulate, type Cluster, type KubeAction } from "./model";
import { moves, run, sandboxStart, stepEnd, stepStart, steps } from "./Scene";

const ctxFor = (actions: KubeAction[]): KubeCtx => {
  const r = simulate(actions, sandboxStart);
  return { start: sandboxStart, state: r.states[r.states.length - 1]!, actions, events: r.events };
};

const solutions: Record<string, KubeAction[]> = {
  "self-heal": [{ type: "killPod" }, { type: "curl" }],
  "lost-node": [{ type: "nodeDown", node: "node-1" }, { type: "scale", to: 3 }, { type: "curl" }],
  "new-version": [{ type: "setImage", version: "v2" }, { type: "scale", to: 3 }, { type: "scale", to: 4 }, { type: "curl" }],
};

describe("kubernetes-intro", () => {
  it("every lesson step runs without an error", () => {
    expect(run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(10);
  });

  it("the story: spread, round-robin, self-healing, rescheduling, scaling, a rolling update", () => {
    const at = (step: number) => run.states[stepEnd(step)]!;
    expect(new Set(at(1).pods.map((p) => p.node)).size).toBe(3);
    const answered = run.events.slice(stepStart(2), stepEnd(2)).flat().flatMap((e) => (e.type === "served" ? [e.pod] : []));
    expect(new Set(answered).size).toBe(3);
    expect(at(3).pods).toHaveLength(3);
    expect(at(3).pods.map((p) => p.id)).not.toEqual(at(2).pods.map((p) => p.id));
    expect(at(4).pods.every((p) => p.node !== "node-2")).toBe(true);
    expect(at(4).pods).toHaveLength(3);
    expect(at(5).pods).toHaveLength(5);
    expect(at(6).pods.every((p) => p.version === "v2")).toBe(true);
    // During the rollout there were always at least as many pods as desired.
    let pods = at(5).pods.length;
    for (const e of run.events.slice(stepStart(6), stepEnd(6)).flat()) {
      if (e.type === "podCreated") pods += 1;
      if (e.type === "podGone") pods -= 1;
      expect(pods).toBeGreaterThanOrEqual(5);
    }
    // A node coming back does not pull pods back by itself.
    expect(at(7).pods.filter((p) => p.node === "node-2")).toHaveLength(0);
  });

  it("no mission is won before any move", () => {
    for (const m of missions) expect(m.check(ctxFor([])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution uses only enabled buttons and wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      let state: Cluster = sandboxStart;
      for (const a of actions) {
        expect(moves(state), `${m.id}`).toContainEqual(a);
        state = apply(state, a).state;
      }
      expect(m.check(ctxFor(actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      const found = shortestWin<Cluster, KubeAction, KubeCtx>({
        start: sandboxStart,
        moves: (s) => moves(s),
        step: (s, a) => apply(s, a).state,
        context: (start, history) => {
          const r = simulate(history, start);
          return { start, state: r.states[r.states.length - 1]!, actions: history, events: r.events };
        },
        check: m.check,
        depth: m.par - 1,
      });
      expect(found).toBeNull();
    });
  }
});
