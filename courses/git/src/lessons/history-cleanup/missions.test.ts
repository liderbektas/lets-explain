import { describe, expect, it } from "vitest";
import { apply, headFiles, reachable, type GitAction, type PlanItem, type Repo } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { BASE, plan, REWORD, scene, START, steps, todo } from "./Scene";

/** Builds a button's action against the state it would be pressed in, like the sandbox does. */
function play(moves: ((s: Repo) => GitAction)[]): GitAction[] {
  const out: GitAction[] = [];
  let s = scene.sandboxStart;
  for (const m of moves) {
    const a = m(s);
    out.push(a);
    s = apply(s, a).state;
  }
  return out;
}
const rebaseI = (changes: Record<string, PlanItem["action"]>, msgs?: Record<string, string>) => (s: Repo): GitAction => ({
  type: "rebaseInteractive",
  base: BASE,
  plan: plan(s, changes, msgs),
});
const amend = (s: Repo): GitAction => {
  const msg = s.commits[todo(s).at(-1)!]!.message;
  return { type: "commit", amend: true, message: REWORD[msg] ?? msg };
};

const solutions: Record<string, GitAction[]> = {
  tidy: play([rebaseI({ "debug log": "drop" }), rebaseI({ "yazım hatası düzeltildi": "fixup" })]),
  messages: play([amend, rebaseI({ wip: "reword" }, { wip: REWORD.wip! })]),
  two: play([
    rebaseI({ "yazım hatası düzeltildi": "fixup" }),
    rebaseI({ "debug log": "drop" }),
    rebaseI({ "Şifre kontorlü": "fixup" }),
    rebaseI({ wip: "reword" }, { wip: REWORD.wip! }),
  ]),
};

describe("history-cleanup", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(9);
  });

  it("the story ends with two clean commits on top of origin/main and the same code", () => {
    const end = scene.run.states[scene.stepEnd(5)]!;
    expect(todo(end).map((c) => end.commits[c]!.message)).toEqual(["Giriş formu", "Şifre kontrolü"]);
    const { "debug.js": dropped, ...kept } = headFiles(START);
    expect(dropped).toBeDefined();
    expect(headFiles(end)).toEqual(kept);
    // The amend left the old commit as a ghost.
    const amended = scene.run.states[scene.stepEnd(1)]!;
    expect(reachable(amended).has(START.branches.main!)).toBe(false);
  });

  it("no mission is won before any move", () => {
    for (const m of missions) expect(m.check(ctxFor(scene, [])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution uses only enabled buttons and wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      actions.forEach((a, i) => {
        const before = ctxFor(scene, actions.slice(0, i));
        expect(scene.moves(before.state, actions.slice(0, i)), `${m.id} move ${i}`).toContainEqual(a);
      });
      expect(m.check(ctxFor(scene, actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(searchWin(scene, m.check, m.par - 1)).toBeNull();
    });
  }
});
