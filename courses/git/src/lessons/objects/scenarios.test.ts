import { describe, expect, it } from "vitest";
import { headId } from "../../engine/git";
import { buildTrees, hashBlob } from "../../engine/objects";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { objectCounts, scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "keep-folders": ["touch uploads/.gitkeep logs/.gitkeep", "git add .", 'git commit -m "Keep the uploads and logs folders"'],
  "prod-settings": ['echo "port=8080" > settings.prod.txt', "git add .", 'git commit -m "Add production settings"'],
  "only-changelog": ["git add CHANGELOG.md", 'git commit -m "Release notes for v1.1"'],
  "price-back": ['echo "price=10" > prices.txt', 'git commit -am "Price back to 10"'],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "keep-folders": [["touch uploads/.gitkeep && touch logs/.gitkeep", "git add uploads/.gitkeep logs/.gitkeep", "git commit -m keep"]],
  "prod-settings": [["cat settings.txt", "echo port=8080 > settings.prod.txt", "git add settings.prod.txt", "git commit -m prod"]],
  "price-back": [["git show HEAD~1:prices.txt", "echo price=10 > prices.txt", "git add prices.txt", "git commit -m back"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "keep-folders": ["git add .", 'git commit -m "Keep folders"'],
  "prod-settings": ['echo "port = 8080" > settings.prod.txt', "git add .", 'git commit -m "Add production settings"'],
  "only-changelog": ["git add .", 'git commit -m "Release notes"'],
  "price-back": ['echo "Price=10" > prices.txt', 'git commit -am "Price back"'],
};

describe("objects", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(9);
  });

  it("the lesson's object counts are what the text says", () => {
    const at = (step: number) => objectCounts(scene.run.states[scene.stepEnd(step)]!);
    // git add writes the blob; commit adds one tree and one commit.
    expect(at(1)).toEqual({ blobs: 1, trees: 0, commits: 0 });
    expect(at(2)).toEqual({ blobs: 1, trees: 1, commits: 1 });
    // notes.txt has README's content: still one blob.
    expect(at(3).blobs).toBe(1);
    // Changing src/app.js: one new blob, a new src tree, a new root tree, a new commit.
    const before = scene.run.states[scene.stepStart(5)]!;
    const after = scene.run.states[scene.stepEnd(5)]!;
    expect(objectCounts(after).blobs - objectCounts(before).blobs).toBe(1);
    expect(objectCounts(after).trees - objectCounts(before).trees).toBe(2);
    const headFiles = after.commits[headId(after)!]!.files;
    expect(hashBlob(headFiles["README.md"]!)).toBe(hashBlob(before.commits[headId(before)!]!.files["README.md"]!));
    expect(buildTrees(headFiles).map((t) => t.entries.length)).toEqual([3, 1]);
  });

  it("blob id for \"Merhaba\" is the one real git prints", () => {
    // printf 'Merhaba\n' | git hash-object --stdin
    expect(hashBlob("Merhaba")).toBe("41979c4ebe928f5fe22a06edc6af95798b951285");
  });

  it("two empty files share one blob", () => {
    const r = typeInto(scenarios[0]!.start, solutions["keep-folders"]!);
    const files = r.ctx.state.commits[headId(r.ctx.state)!]!.files;
    expect(hashBlob(files["uploads/.gitkeep"]!)).toBe(hashBlob(files["logs/.gitkeep"]!));
    expect(buildTrees(files)).toHaveLength(3);
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
