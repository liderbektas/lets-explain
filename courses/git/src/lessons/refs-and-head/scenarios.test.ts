import { describe, expect, it } from "vitest";
import { currentBranch, headId, reachable } from "../../engine/git";
import { typeInto } from "../shared/missionHelpers";
import { EXPERIMENT, scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

const id = EXPERIMENT.slice(0, 7);

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "look-back": ["git checkout HEAD~2", "git switch main"],
  "keep-experiment": ["git switch -c yeni-menu", "git switch main"],
  "find-lost": ["git reflog", `git branch yeni-menu ${id}`],
  "mark-release": ["git branch release main~2"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "look-back": [["git switch --detach HEAD~2", "git switch main"], ["git status", "git checkout main~2", "git checkout main"]],
  "keep-experiment": [["git branch yeni-menu", "git switch main"], ["git checkout -b yeni-menu", "git checkout main"]],
  "find-lost": [[`git checkout ${id}`, "git switch -c yeni-menu", "git switch main"], [`git branch yeni-menu ${EXPERIMENT}`]],
  "mark-release": [["git branch release HEAD~2"], ["git log --oneline", `git branch release HEAD^^`]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "look-back": ["git reset --hard HEAD~2"],
  "keep-experiment": ["git switch main"],
  "find-lost": ["git switch -c yeni-menu"],
  "mark-release": ["git switch -c release HEAD~2"],
};

describe("refs-and-head", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(10);
  });

  it("the story: detached commit fades, then is rescued onto a branch", () => {
    const after = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(after(4).head.kind).toBe("detached");
    const lost = headId(after(5))!;
    expect(reachable(after(6)).has(lost)).toBe(false);
    expect(after(7).branches.deneme).toBe(lost);
    expect(currentBranch(after(7))).toBe("deneme");
  });

  it("the lost commit is really lost at the start of find-lost", () => {
    const s = scenarios.find((x) => x.id === "find-lost")!;
    expect(reachable(s.start).has(EXPERIMENT)).toBe(false);
    expect(typeInto(s.start, ["git reflog"]).output.join("\n")).toContain(id);
    expect(headId(s.start)).not.toBe(EXPERIMENT);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = typeInto(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" && ")}`, () => {
        expect(s.check(typeInto(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }

  it("keep-experiment ends on main", () => {
    const s = scenarios.find((x) => x.id === "keep-experiment")!;
    expect(currentBranch(typeInto(s.start, solutions["keep-experiment"]!).ctx.state)).toBe("main");
  });
});
