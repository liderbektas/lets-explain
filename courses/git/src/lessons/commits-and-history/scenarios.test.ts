import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "typo-message": ['git commit --amend -m "Fix checkout"'],
  "forgot-file": ["git add cart.css", "git commit --amend --no-edit"],
  "one-thing-each": ["git add README.md", 'git commit -m "Fix setup steps"', "git add app.js", 'git commit -m "Add search"'],
  wip: ["git add cart.test.js", 'git commit --amend -m "Add removing from the cart"'],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "one-thing-each": [["git add app.js", 'git commit -m "Add search"', 'git commit -am "Fix setup steps"']],
  "forgot-file": [["git add .", "git commit --amend --no-edit"]],
  wip: [["git add .", 'git commit --amend -m "Cart: remove items, with a test"']],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "typo-message": ['git commit -m "Fix checkout"'],
  "forgot-file": ["git add cart.css", 'git commit -m "Add cart.css"'],
  "one-thing-each": ["git add .", 'git commit -m "Setup and search"'],
  wip: ["git add cart.test.js", "git commit --amend --no-edit"],
};

describe("commits-and-history", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(8);
  });

  it("an amend through the editor counts too", () => {
    const s = scenarios.find((x) => x.id === "typo-message")!;
    const r = typeInto(s.start, ["git commit --amend"], [(t) => t.replace("Fix chekout", "Fix checkout")]);
    expect(s.check(r.ctx)).toBe(true);
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
