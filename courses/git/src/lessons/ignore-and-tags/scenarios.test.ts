import { describe, expect, it } from "vitest";
import { short, status, type GitAction } from "../../engine/git";
import { ctxFor, typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { IGNORE, scene, steps } from "./Scene";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const byId = Object.fromEntries(scenarios.map((s) => [s.id, s]));
const yesterday = () => short(byId["tag-yesterday"]!.start.commits[byId["tag-yesterday"]!.start.branches.main!]!.parents[0]!);

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  secrets: ['echo ".env" > .gitignore', "git add .gitignore", 'git commit -m "Ignore .env"'],
  "safe-add-all": ['echo "*.log" >> .gitignore', 'echo "node_modules/" >> .gitignore', "git add .", 'git commit -m "Show cart"'],
  "tracked-log": ['echo "*.log" > .gitignore', "git rm --cached debug.log", "git add .gitignore", 'git commit -m "Stop tracking debug.log"'],
  "tag-yesterday": ["git tag v1.0 HEAD~1"],
  hotfix: ['git commit -am "Fix prices"', "git tag v1.0.1"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, (() => string[])[]> = {
  secrets: [() => ["echo .env >> .gitignore", "git add .", "git commit -m ignore"], () => ["git status", "touch .gitignore", 'echo ".env" > .gitignore', "git add . && git commit -m ignore"]],
  "safe-add-all": [() => ['echo "app.log" >> .gitignore && echo "node_modules/" >> .gitignore', "git add .gitignore app.js", 'git commit -m "Show cart"']],
  "tracked-log": [() => ['echo "debug.log" >> .gitignore', "git rm --cached debug.log", "git add .", 'git commit -m "Stop tracking debug.log"']],
  "tag-yesterday": [() => ["git log --oneline", `git tag v1.0 ${yesterday()}`]],
  hotfix: [() => ["git add app.js", 'git commit -m "Fix prices"', "git tag v1.0.1 HEAD"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  secrets: ["git add .", 'git commit -m "Add .env"'],
  "safe-add-all": ["git add .", 'git commit -m "Show cart"'],
  "tracked-log": ['echo "*.log" > .gitignore', "git add .", 'git commit -m "Ignore logs"'],
  "tag-yesterday": ["git tag v1.0"],
  hotfix: ["git tag v1.0.1", 'git commit -am "Fix prices"'],
};

describe("ignore-and-tags", () => {
  it("every lesson step runs without a Git error", () => {
    const errors = scene.run.events.flat().filter((e) => e.type === "error");
    expect(errors).toEqual([]);
    expect(steps.length).toBe(10);
  });

  it("the story matches the text: add . takes only .gitignore, a tracked log stays tracked", () => {
    const afterAdd = scene.run.states[scene.stepStart(2) + 1]!;
    expect(status(afterAdd).staged.map((c) => c.path)).toEqual([".gitignore"]);
    expect(status(afterAdd).ignored).toEqual([".env", "app.log", "node_modules/lib.js"]);
    const edited = scene.run.states[scene.stepEnd(3)]!;
    expect(status(edited).unstaged.map((c) => c.path)).toEqual(["debug.log"]);
    const untracked = scene.run.states[scene.stepEnd(4)]!;
    expect(status(untracked).ignored).toContain("debug.log");
    expect(untracked.work["debug.log"]).toBe("log 2");
  });

  it("the tag stays on the old commit after a new one", () => {
    const tagged = scene.run.states[scene.stepEnd(6)]!;
    const end = scene.run.states[scene.stepEnd(7)]!;
    expect(end.tags["v1.0"]).toBe(tagged.tags["v1.0"]);
    expect(end.branches.main).not.toBe(end.tags["v1.0"]);
  });

  it("an explicit add of an ignored file is refused", () => {
    const r = ctxFor(scene, [write(".gitignore", IGNORE), { type: "add", paths: ["app.log"] }]);
    expect(r.events[1]![0]).toMatchObject({ type: "error", code: "ignored" });
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
      it(`${s.id}: also wins with ${alt().join(" && ")}`, () => {
        expect(s.check(typeInto(s.start, alt()).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
