import { describe, expect, it } from "vitest";
import { aheadBehind } from "../../engine/git";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "not-pushed": ["git push"],
  "just-look": ["git fetch"],
  "catch-up": ["git merge origin/main"],
  rejected: ["git pull", "git push"],
  publish: ["git push -u origin search"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "not-pushed": [["git status", "git push origin main"]],
  "just-look": [["git fetch origin", "git log --oneline origin/main"]],
  "catch-up": [["git pull"]],
  rejected: [["git pull --rebase", "git push"], ["git fetch", "git merge origin/main", "git push"], ["git push", "git pull", "git push"]],
  publish: [["git push", "git push --set-upstream origin search"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "not-pushed": ["git fetch"],
  "just-look": ["git pull"],
  "catch-up": ["git fetch"],
  rejected: ["git push --force"],
  publish: ["git push origin search"],
};

describe("remotes", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(11);
  });

  it("the story does what the text says", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // A local commit: main is one ahead, origin unchanged.
    expect(aheadBehind(at(1), at(1).branches.main!, at(1).tracking["origin/main"]!)).toEqual({ ahead: 1, behind: 0 });
    expect(at(2).remote!.branches.main).toBe(at(2).branches.main);
    // Bora pushed: your origin/main does not know yet.
    expect(at(3).tracking["origin/main"]).toBe(at(2).tracking["origin/main"]);
    // fetch moves origin/main only.
    expect(at(4).branches.main).toBe(at(3).branches.main);
    expect(aheadBehind(at(4), at(4).branches.main!, at(4).tracking["origin/main"]!)).toEqual({ ahead: 0, behind: 1 });
    expect(at(5).branches.main).toBe(at(5).tracking["origin/main"]);
    expect(at(6).branches.main).toBe(at(6).remote!.branches.main);
    // The first plain push of a new branch is refused, -u sends it.
    expect(scene.run.events.slice(scene.stepStart(7), scene.stepEnd(7)).flat().at(-1)).toMatchObject({ type: "pushRejected", reason: "no-upstream" });
    expect(at(8).remote!.branches.feature).toBe(at(8).branches.feature);
    expect(at(8).upstream.feature).toBe("origin/feature");
  });

  it("the rejected scenario really starts with a refused push", () => {
    const s = scenarios.find((x) => x.id === "rejected")!;
    expect(typeInto(s.start, ["git push"]).output).toContain(" ! [rejected]        main -> main (fetch first)");
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
});
