import { describe, expect, it } from "vitest";
import { headId } from "../../engine/git";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "bring-it-in": ["git switch main", "git merge search"],
  "both-moved": ["git merge cart", "git branch -d cart"],
  "leave-a-trace": ["git merge --no-ff login"],
  "release-day": ["git merge --ff-only login"],
  "one-merge": ["git merge login", "git merge menu"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "bring-it-in": [["git checkout main", "git merge --ff-only search"], ["git status", "git switch main", "git log --oneline --all", "git merge search"]],
  "both-moved": [["git merge cart && git branch -d cart"]],
  "leave-a-trace": [["git log --oneline --all", "git merge --no-ff login"]],
  "release-day": [["git merge --ff-only menu", "git merge --ff-only login"], ["git merge login"]],
  "one-merge": [["git merge --ff-only login", "git merge menu"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "bring-it-in": ["git merge main"],
  "both-moved": ["git branch -D cart"],
  "leave-a-trace": ["git merge login"],
  "release-day": ["git merge menu"],
  "one-merge": ["git merge menu", "git merge login"],
};

describe("merging", () => {
  it("only the refusal the lesson is about produces a Git error", () => {
    steps.forEach((_, step) => {
      const events = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
      const codes = events.flatMap((e) => (e.type === "error" ? [e.code] : []));
      expect(codes, `step ${step}`).toEqual(EXPECTED_ERRORS[step] ? [EXPECTED_ERRORS[step]] : []);
    });
  });

  it("the story: fast-forward, then a merge commit, then --no-ff", () => {
    const after = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 1 slides main onto feature without a new commit.
    expect(after(1).branches.main).toBe(after(1).branches.feature);
    expect(Object.keys(after(1).commits).length).toBe(Object.keys(after(0).commits).length);
    // Step 3 makes a merge commit with the default message.
    const m = after(3).commits[headId(after(3))!]!;
    expect(m.parents).toHaveLength(2);
    expect(m.message).toBe("Merge branch 'sepet'");
    // Step 5: --no-ff makes a merge commit even though a fast-forward was possible.
    expect(after(5).commits[headId(after(5))!]!.parents).toHaveLength(2);
    // Step 7 ends with only main.
    expect(Object.keys(after(7).branches)).toEqual(["main"]);
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
