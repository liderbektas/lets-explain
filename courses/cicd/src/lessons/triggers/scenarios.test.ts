import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

const CI = "nano .github/workflows/ci.yml";

/** Editor saves: each turns the workflow text into what the reader would write. */
const under = (key: string, ...add: string[]) => (t: string) => t.replace(new RegExp(`^(  ${key}:\\n(?:    .*\\n)*)`, "m"), `$1${add.map((a) => `${a}\n`).join("")}`);
const addEvent = (...lines: string[]) => (t: string) => t.replace(/^jobs:/m, `${lines.join("\n")}\njobs:`).replace(/\n\njobs:/, "\njobs:");

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, { typed: string[]; edits: ((t: string) => string)[] }> = {
  "main-only": { typed: [CI, 'git commit -am "CI only on main"', "git push"], edits: [under("push", "    branches: [main]")] },
  "pr-checks": { typed: [CI, 'git commit -am "CI on PRs"', "git push", "gh pr create --head coupons"], edits: [addEvent("  pull_request:", "    branches: [main]")] },
  "by-hand": { typed: [CI, 'git commit -am "Allow manual runs"', "git push", "gh workflow run ci.yml"], edits: [addEvent("  workflow_dispatch:")] },
  "docs-quiet": { typed: [CI, 'git commit -am "Skip CI for docs"', "git push"], edits: [under("push", "    paths-ignore: ['docs/**', '**/*.md']")] },
  nightly: { typed: [CI, 'git commit -am "Nightly CI"', "git push"], edits: [addEvent("  schedule:", "    - cron: '0 3 * * *'")] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, { typed: string[]; edits: ((t: string) => string)[] }[]> = {
  "main-only": [{ typed: [CI, "git add .github/workflows/ci.yml", 'git commit -m "ci: main only"', "git push origin main"], edits: [under("push", "    branches:", "      - main")] }],
  "pr-checks": [{ typed: [CI, "git add .", "git commit -m ci", "git push", "git switch coupons", "gh pr create --fill"], edits: [addEvent("  pull_request:")] }],
  "by-hand": [{ typed: [CI, 'git commit -am "dispatch"', "git push", "gh workflow run CI --ref main"], edits: [addEvent("  workflow_dispatch: {}")] }],
  "docs-quiet": [{ typed: [CI, 'git commit -am "only code"', "git push"], edits: [under("push", "    paths: ['src/**']")] }],
  nightly: [{ typed: [CI, 'git commit -am "Nightly"', "git push"], edits: [addEvent("  schedule:", '    - cron: "0 3 * * *"')] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, { typed: string[]; edits: ((t: string) => string)[] }> = {
  // Saved and committed, but never pushed: GitHub still has the old workflow.
  "main-only": { typed: [CI, 'git commit -am "CI only on main"'], edits: [under("push", "    branches: [main]")] },
  // The event is there, but no PR was opened.
  "pr-checks": { typed: [CI, 'git commit -am "CI on PRs"', "git push"], edits: [addEvent("  pull_request:", "    branches: [main]")] },
  // Pressing the button before GitHub has the new workflow is refused.
  "by-hand": { typed: [CI, 'git commit -am "Allow manual runs"', "gh workflow run ci.yml"], edits: [addEvent("  workflow_dispatch:")] },
  // Ignoring everything also silences code changes.
  "docs-quiet": { typed: [CI, 'git commit -am "quiet"', "git push"], edits: [under("push", "    paths-ignore: ['**']")] },
  // Hour and minute swapped: 00:03, not 03:00.
  nightly: { typed: [CI, 'git commit -am "Nightly"', "git push"], edits: [addEvent("  schedule:", "    - cron: '3 0 * * *'")] },
};

describe("triggers", () => {
  it("the story: every push, main only, PR runs, schedule, dispatch, docs ignored", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).runs.map((r) => r.branch)).toEqual(["main", "feature"]);
    expect(scene.at(1).runs).toHaveLength(2);
    const events = scene.run.events.flat();
    expect(events.filter((e) => e.type === "notTriggered").map((e) => (e as { reason: string }).reason)).toEqual(["branch", "branch", "paths"]);
    expect(scene.at(2).runs.slice(2).map((r) => r.event)).toEqual(["pull_request", "pull_request"]);
    expect(scene.at(3).runs.at(-1)!.event).toBe("schedule");
    expect(scene.at(4).runs.at(-1)!.event).toBe("dispatch");
    expect(scene.at(5).runs).toHaveLength(scene.at(4).runs.length);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const { typed, edits } = solutions[s.id]!;
      const r = typeInto(s.start, typed, [...edits]);
      expect(r.output.filter((x) => /^(fatal|error|Invalid)/.test(x)), r.output.join("\n")).toEqual([]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const [i, alt] of (alternatives[s.id] ?? []).entries()) {
      it(`${s.id}: also wins another way (${i + 1})`, () => {
        const r = typeInto(s.start, alt.typed, [...alt.edits]);
        expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const { typed, edits } = wrong[s.id]!;
      expect(s.check(typeInto(s.start, typed, [...edits]).ctx)).toBe(false);
    });
  }
});
