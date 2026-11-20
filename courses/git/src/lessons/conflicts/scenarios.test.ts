import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { LOG, scene, steps, TITLE } from "./Scene";

/** What a reader does in nano: delete the conflict marker lines, keep the rest. */
const dropMarkers = (text: string) =>
  text
    .split("\n")
    .filter((line) => !/^(<{7}|={7}|>{7})/.test(line))
    .join("\n");

interface Play {
  typed: string[];
  edits?: ((text: string) => string)[];
}

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "new-name": { typed: ["git merge feature", "git checkout --theirs title.txt", "nano CHANGELOG.md", "git add .", "git commit"], edits: [dropMarkers] },
  "not-now": { typed: ["git merge --abort"] },
  "after-lunch": { typed: ["nano CHANGELOG.md", "git add CHANGELOG.md", "git commit", "git branch -d feature"], edits: [dropMarkers] },
  "forgot-add": { typed: ["git add .", "git commit"] },
  "on-your-branch": {
    typed: ["git switch feature", "git merge main", "git checkout --theirs title.txt", "nano CHANGELOG.md", "git add .", "git commit"],
    edits: [dropMarkers],
  },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "new-name": [
    {
      typed: [
        "git merge feature",
        "git status",
        'echo "Online Mağaza" > title.txt',
        'echo "Şifre sıfırlama eklendi" > CHANGELOG.md',
        'echo "Karanlık tema eklendi" >> CHANGELOG.md',
        "git add title.txt CHANGELOG.md",
        "git merge --continue",
      ],
    },
    { typed: ["git merge feature", "git restore --theirs title.txt", "nano CHANGELOG.md", "git add .", 'git commit -m "Merge feature"'], edits: [dropMarkers] },
  ],
  "after-lunch": [{ typed: ["cat CHANGELOG.md", "nano CHANGELOG.md", "git add .", "git merge --continue", "git branch -d feature"], edits: [dropMarkers] }],
  "forgot-add": [{ typed: ["git add title.txt CHANGELOG.md", "git merge --continue"] }],
  "on-your-branch": [
    { typed: ["git checkout feature", "git merge main", "git checkout --theirs title.txt", "nano CHANGELOG.md", "git add .", "git merge --continue"], edits: [dropMarkers] },
  ],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Adding without fixing the changelog commits the markers.
  "new-name": { typed: ["git merge feature", "git checkout --theirs title.txt", "git add .", "git commit"] },
  "not-now": { typed: ["git restore title.txt CHANGELOG.md"] },
  "after-lunch": { typed: ["git checkout --ours CHANGELOG.md", "git add .", "git commit", "git branch -d feature"] },
  "forgot-add": { typed: ["git commit"] },
  // Merging on main changes main.
  "on-your-branch": { typed: ["git merge feature", "git checkout --ours title.txt", "nano CHANGELOG.md", "git add .", "git commit"], edits: [dropMarkers] },
};

const play = (start: Parameters<typeof typeInto>[0], p: Play) => typeInto(start, p.typed, [...(p.edits ?? [])]);

describe("conflicts", () => {
  it("every lesson step runs without a Git error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps.length).toBe(9);
  });

  it("the merge stops on both files, and the lesson ends with a two-parent merge commit", () => {
    const afterMerge = scene.run.states[scene.stepEnd(1)]!;
    expect(afterMerge.op?.conflicts).toEqual([LOG, TITLE]);
    expect(afterMerge.work[TITLE]).toBe("<<<<<<< HEAD\nMağaza: Büyük indirim\n=======\nOnline Mağaza\n>>>>>>> feature");
    const afterAbort = scene.run.states[scene.stepEnd(3)]!;
    expect(afterAbort.op).toBeNull();
    expect(afterAbort.work[TITLE]).toBe("Mağaza: Büyük indirim");
    const done = scene.run.states[scene.stepEnd(6)]!;
    const head = done.commits[done.branches.main!]!;
    expect(head.parents).toHaveLength(2);
    expect(head.files[LOG]).toBe("Şifre sıfırlama eklendi\nKaranlık tema eklendi");
    expect(head.files[TITLE]).toBe("Online Mağaza");
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = play(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.typed.join(" && ")}`, () => {
        expect(s.check(play(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(play(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
