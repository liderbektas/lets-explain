import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "first-version": ["git add rapor.md", 'git commit -m "İlk taslak"'],
  "new-chapter": ["git add rapor.md", 'git commit -m "Bölüm 1 eklendi"'],
  "with-notes": ["git add .", 'git commit -m "Bölüm 1 ve kaynaklar"'],
  "look-back": ["git checkout HEAD~2", "git switch main"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "first-version": [["git status", "git add .", 'git commit -m "first"']],
  "new-chapter": [['git commit -am "Bölüm 1"']],
  "with-notes": [["git add rapor.md kaynaklar.md", 'git commit -m "x"'], ["git add kaynaklar.md", 'git commit -am "x"']],
  "look-back": [["git checkout HEAD~2", "git checkout main"], ["git log --oneline", "git checkout HEAD^^", "git switch main"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "first-version": ['git commit -m "İlk taslak"'],
  "new-chapter": ['git commit -m "Bölüm 1"'],
  "with-notes": ['git commit -am "x"'],
  "look-back": ["git reset --hard HEAD~2"],
};

describe("why-git", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(8);
  });

  it("looking back at the first draft keeps the later commits", () => {
    const atOld = scene.run.states[scene.stepEnd(4)]!;
    expect(atOld.head.kind).toBe("detached");
    expect(atOld.work["rapor.md"]).toBe("Giriş");
    expect(Object.keys(atOld.commits)).toHaveLength(3);
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
