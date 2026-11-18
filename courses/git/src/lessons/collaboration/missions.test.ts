import { describe, expect, it } from "vitest";
import { BORA, type GitAction } from "../../engine/git";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { REJECTED_STEPS, scene, steps } from "./Scene";

const bora = (n: number): GitAction => ({ type: "teammate", branch: "main", path: `bora${n}.txt`, content: "not", message: `Bora ${n}` });
const edit = (n: number): GitAction => ({ type: "write", path: "app.js", content: `v${n + 2}` });
const commitAll: GitAction = { type: "commit", message: "Change", all: true };

const solutions: Record<string, GitAction[]> = {
  "straight-line": [bora(1), edit(1), commitAll, { type: "pull", rebase: true }, { type: "push" }],
  "safe-amend": [{ type: "commit", amend: true, message: "Fixed message" }, { type: "push", force: "lease" }],
  "pr-ready": [{ type: "switch", target: "feature", create: true }, edit(1), commitAll, { type: "push", setUpstream: true }, { type: "switch", target: "main" }],
};

const eventsOf = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();

describe("collaboration", () => {
  it("no step gives a Git error; pushes are refused only where planned", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    steps.forEach((_, i) => {
      const rejected = eventsOf(i).filter((e) => e.type === "pushRejected");
      expect(rejected.length > 0, `step ${i}`).toBe(REJECTED_STEPS.includes(i));
    });
  });

  it("the story does what the text says", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(eventsOf(1).at(-1)).toMatchObject({ reason: "non-fast-forward" });
    // pull made a merge commit with two parents.
    expect(at(2).commits[at(2).branches.main!]!.parents).toHaveLength(2);
    expect(at(3).remote!.branches.main).toBe(at(3).branches.main);
    // pull --rebase kept the line straight: the tip has one parent, Bora's commit.
    const tip4 = at(4).commits[at(4).branches.main!]!;
    expect(tip4.parents).toHaveLength(1);
    expect(at(4).commits[tip4.parents[0]!]!.author).toBe(BORA);
    expect(eventsOf(5).at(-1)).toMatchObject({ reason: "stale" });
    // --force overwrote Bora's README commit on origin.
    expect(eventsOf(6).at(-1)).toMatchObject({ type: "pushed", forced: true });
    const remote = at(6).remote!;
    const lost = Object.values(remote.commits).find((c) => c.message === "Bora: README düzeltildi")!;
    expect(lost).toBeDefined();
    expect(remote.branches.main).not.toBe(lost.id);
    expect(at(7).remote!.branches.feature).toBe(at(7).branches.feature);
    expect(at(8).branches.feature).toBeUndefined();
    expect(at(8).remote!.branches.main).toBe(at(8).branches.main);
  });

  it("no mission is won before any move", () => {
    for (const m of missions) expect(m.check(ctxFor(scene, [])), m.id).toBe(false);
  });

  it("safe-amend: the --force shortcut is not a win", () => {
    const m = missions.find((x) => x.id === "safe-amend")!;
    expect(m.check(ctxFor(scene, [{ type: "commit", amend: true, message: "Fixed message" }, { type: "push", force: "force" }]))).toBe(false);
  });

  it("straight-line: a plain pull makes a merge commit and does not win", () => {
    const m = missions.find((x) => x.id === "straight-line")!;
    expect(m.check(ctxFor(scene, [bora(1), edit(1), commitAll, { type: "pull" }, { type: "push" }]))).toBe(false);
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
