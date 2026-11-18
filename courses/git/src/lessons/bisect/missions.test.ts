import { describe, expect, it } from "vitest";
import { currentBranch, resolve, type GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { CULPRIT, LESSON_TEST, passes, SANDBOX, SANDBOX_CULPRIT, SANDBOX_TEST, scene, steps } from "./Scene";

const start: GitAction = { type: "bisectStart", bad: "HEAD", good: "v1.0" };
const good: GitAction = { type: "bisectMark", verdict: "good" };
const bad: GitAction = { type: "bisectMark", verdict: "bad" };
const reset: GitAction = { type: "bisectReset" };

/** The intended solutions: mark by what the test says at each commit. */
const find: GitAction[] = [start, bad, bad, good];
const solutions: Record<string, GitAction[]> = {
  find,
  "find-and-return": [...find, reset],
  fix: [...find, reset, { type: "revert", target: SANDBOX_CULPRIT }],
};

describe("bisect", () => {
  it("every lesson step runs without a Git error", () => {
    const errors = scene.run.events.flat().filter((e) => e.type === "error");
    expect(errors).toEqual([]);
    expect(steps.length).toBe(10);
  });

  it("the lesson's marks match what the test says at each commit, and bisect finds the culprit", () => {
    // Steps 3–5 mark the commit bisect checked out in the step before.
    for (const step of [3, 4, 5]) {
      const tested = scene.run.states[scene.stepStart(step)]!;
      const mark = steps[step]![0]!;
      expect(mark.type === "bisectMark" && mark.verdict).toBe(passes(tested, LESSON_TEST) ? "good" : "bad");
    }
    const found = scene.run.states[scene.stepEnd(5)]!.bisect!.found;
    expect(found).toBe(CULPRIT);
    expect(scene.run.states[scene.stepStart(3)]!.commits[CULPRIT]!.message).toBe("math sadeleşti");
    // Three tries for seven candidates, as the text says.
    expect(scene.run.events.slice(scene.stepStart(2), scene.stepEnd(5)).flat().filter((e) => e.type === "bisectTesting")).toHaveLength(3);
  });

  it("after reset and revert, main adds again and later commits stay", () => {
    const end = scene.run.states[scene.stepEnd(7)]!;
    expect(currentBranch(end)).toBe("main");
    expect(passes(end, LESSON_TEST)).toBe(true);
    expect(end.work["style.css"]).toBe("koyu tema");
  });

  it("the sandbox solution's marks are honest", () => {
    const moves = solutions.find!;
    for (let i = 1; i < moves.length; i++) {
      const before = ctxFor(scene, moves.slice(0, i)).state;
      const mark = moves[i]!;
      expect(mark.type === "bisectMark" && mark.verdict).toBe(passes(before, SANDBOX_TEST) ? "good" : "bad");
    }
    expect(resolve(SANDBOX, "HEAD~5")).toBe(SANDBOX_CULPRIT);
    expect(SANDBOX.commits[SANDBOX_CULPRIT]!.message).toBe("format düzeni");
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
