import { describe, expect, it } from "vitest";
import { headFiles, reachable } from "../../engine/git";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, START, steps, todo } from "./Scene";

type Edit = (text: string) => string;
interface Play {
  typed: string[];
  edits?: Edit[];
}

/** Changes the first word of the todo line for a commit message. */
const mark = (message: string, word: string): Edit => (t) => {
  const re = new RegExp(`^pick (\\w+) ${message}$`, "m");
  if (!re.test(t)) throw new Error(`no todo line for ${message}`);
  return t.replace(re, `${word} $1 ${message}`);
};
const all = (...edits: Edit[]): Edit => (t) => edits.reduce((x, e) => e(x), t);
const message = (m: string): Edit => () => m;

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  typo: { typed: ['git commit --amend -m "Sepet sayfası"'] },
  "forgot-file": { typed: ["git add login.css", "git commit --amend --no-edit"] },
  "drop-debug": { typed: ["git rebase -i origin/main"], edits: [mark("debug log", "drop")] },
  "squash-wip": { typed: ["git rebase -i origin/main"], edits: [all(mark("wip 2", "squash"), mark("çalışıyor galiba", "squash")), message("Şifre kontrolü")] },
  "ready-for-pr": {
    typed: ["git rebase -i origin/main"],
    edits: [
      all(mark("yazım hatası düzeltildi", "fixup"), mark("debug log", "drop"), mark("wip", "reword"), mark("Şifre kontorlü", "fixup")),
      message("Şifre kontrolü"),
    ],
  },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  typo: [
    { typed: ["git commit --amend"], edits: [(t) => t.replace("Sepet sayfsı", "Sepet sayfası")] },
    { typed: ["git rebase -i origin/main"], edits: [(t) => t.replace(/^pick/m, "reword"), message("Sepet sayfası")] },
  ],
  "forgot-file": [{ typed: ["git add . && git commit --amend --no-edit"] }, { typed: ["git add login.css", 'git commit --amend -m "Giriş formu"'] }],
  "drop-debug": [{ typed: ["git log --oneline", "git rebase -i origin/main"], edits: [(t) => t.replace(/^pick \w+ debug log\n/m, "")] }],
  "squash-wip": [
    { typed: ["git rebase -i origin/main"], edits: [all(mark("wip", "reword"), mark("wip 2", "fixup"), mark("çalışıyor galiba", "f")), message("Şifre kontrolü")] },
    { typed: ["git reset --soft origin/main", 'git commit -m "Şifre kontrolü"'] },
  ],
  "ready-for-pr": [
    {
      typed: ['git commit --amend -m "Şifre kontrolü"', "git rebase -i origin/main"],
      edits: [all(mark("yazım hatası düzeltildi", "fixup"), mark("debug log", "drop"), mark("wip", "reword"), mark("Şifre kontrolü", "fixup")), message("Şifre kontrolü")],
    },
  ],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  typo: { typed: ['git commit -m "Sepet sayfası"'] },
  "forgot-file": { typed: ["git add login.css", 'git commit -m "login.css"'] },
  "drop-debug": { typed: ["git revert HEAD~1"] },
  "squash-wip": { typed: ["git rebase -i origin/main"], edits: [all(mark("wip 2", "fixup"), mark("çalışıyor galiba", "fixup"))] },
  "ready-for-pr": { typed: ["git reset --hard origin/main"] },
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
    const amended = scene.run.states[scene.stepEnd(1)]!;
    expect(reachable(amended).has(START.branches.main!)).toBe(false);
  });

  for (const s of scenarios) {
    const play = (p: Play) => typeInto(s.start, p.typed, [...(p.edits ?? [])]);

    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = play(solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.typed.join(" && ")}`, () => {
        expect(s.check(play(alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(play(wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
