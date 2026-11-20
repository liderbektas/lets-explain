import { describe, expect, it } from "vitest";
import { reachable, resolve, short } from "../../engine/git";
import { typeInto } from "../shared/missionHelpers";
import { DARK, LOGIN, PAYMENTS, SEARCH, scenarios } from "./scenarios";
import { EXPERIMENT, IMPORTANT, scene } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. Ids come from `git reflog`. */
const solutions: Record<string, string[]> = {
  "lost-commit": [`git reset --hard ${short(PAYMENTS)}`],
  "deleted-branch": [`git branch dark-mode ${short(DARK)}`],
  "undo-reset": [`git reset --hard ${short(SEARCH)}`],
  "undo-amend": [`git reset --hard ${short(LOGIN)}`],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "lost-commit": [["git reflog", `git reset --hard ${PAYMENTS}`], [`git merge ${short(PAYMENTS)}`]],
  "deleted-branch": [["git reflog", `git switch -c dark-mode ${short(DARK)}`], [`git checkout -b dark-mode ${short(DARK)}`]],
  "undo-reset": [[`git reset ${short(SEARCH)}`], [`git reset --soft ${short(SEARCH)}`]],
  "undo-amend": [["git reflog", `git reset --hard ${short(LOGIN)}`]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "lost-commit": ["git reset --hard HEAD~1"],
  "deleted-branch": ["git branch dark-mode"],
  "undo-reset": ['git commit -m "Search"'],
  "undo-amend": ["git reset --hard HEAD~1"],
};

describe("reflog", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
  });

  it("the lesson's story holds: lost after reset, found again, and uncommitted work is gone", () => {
    const at = (i: number) => scene.run.states[scene.stepEnd(i)]!;
    expect(reachable(at(1)).has(IMPORTANT)).toBe(false);
    expect(at(1).reflog.some((e) => e.to === IMPORTANT)).toBe(true);
    expect(at(3).branches.main).toBe(IMPORTANT);
    expect(reachable(at(4)).has(EXPERIMENT)).toBe(false);
    expect(at(5).branches.deneme).toBe(EXPERIMENT);
    // The unsaved README change never reached a commit, so nothing in the reflog holds it.
    const s6 = at(6);
    expect(s6.work["README.md"]).toBe("Merhaba");
    expect(Object.values(s6.commits).some((c) => c.files["README.md"] === "yarım kalmış iş")).toBe(false);
  });

  it("each scenario starts with its commit lost but still in the reflog", () => {
    const lost: Record<string, string> = { "lost-commit": PAYMENTS, "deleted-branch": DARK, "undo-reset": SEARCH, "undo-amend": LOGIN };
    for (const s of scenarios) {
      const id = lost[s.id]!;
      expect(reachable(s.start).has(id), s.id).toBe(false);
      expect(s.start.reflog.some((e) => e.to === id), s.id).toBe(true);
      // Real Git would print this id in `git reflog`; the reader copies it from there.
      expect(typeInto(s.start, ["git reflog"]).output.some((line) => line.startsWith(short(id))), s.id).toBe(true);
    }
    expect(resolve(scenarios[0]!.start, "HEAD")).toBeTruthy();
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
