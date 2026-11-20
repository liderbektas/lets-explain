import { describe, expect, it } from "vitest";
import { copies, nodeOf, WFS } from "./model";
import { scenarios } from "./scenarios";
import { typeIntoRw } from "./shell";
import { scene, steps } from "./Scene";

const ranNodes = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().flatMap((e) => (e.type === "ran" ? [e.node] : []));

const CI = "nano .github/workflows/ci.yml";
const RELEASE = "nano .github/workflows/release.yml";
const NIGHTLY = "nano .github/workflows/nightly.yml";
const ACTION = "nano .github/actions/setup/action.yml";
const TEST = "nano .github/workflows/test.yml";

type Edit = (t: string) => string;
const node22: Edit = (t) => t.replace("node-version: 20", "node-version: 22");
const toComposite: Edit = (t) => t.replace(/      - uses: actions\/setup-node@v4\n        with:\n          node-version: \d+\n      - run: npm ci/, "      - uses: ./.github/actions/setup");
const defaultTo = (n: number): Edit => (t) => t.replace(/default: '\d+'/, `default: '${n}'`);
const callTest: Edit = (t) => t.replace(/  test:\n    runs-on: ubuntu-latest\n    steps:\n(?: {6,}.*\n?)*/, "  test:\n    uses: ./.github/workflows/test.yml\n    secrets: inherit\n");
const callable: Edit = (t) => t.replace("on:\n  push:\n    branches: [main]", "on:\n  workflow_call:");

const solutions: Record<string, { typed: string[]; edits: Edit[] }> = {
  "node-22": { typed: [CI, RELEASE, NIGHTLY, 'git commit -am "Node 22"', "git push"], edits: [node22, node22, node22] },
  "one-place": { typed: [NIGHTLY, ACTION, 'git commit -am "One setup"', "git push"], edits: [toComposite, defaultTo(22)] },
  "one-line": { typed: [ACTION, 'git commit -am "Node 24"', "git push"], edits: [defaultTo(24)] },
  "shared-job": { typed: [CI, RELEASE, 'git commit -am "Share the test job"', "git push"], edits: [callTest, callTest] },
  "make-callable": { typed: [TEST, 'git commit -am "Make test.yml callable"', "git push"], edits: [callable] },
};

const alternatives: Record<string, { typed: string[]; edits: Edit[] }[]> = {
  "node-22": [{ typed: [CI, "git commit -am ci", "git push", RELEASE, NIGHTLY, "git add .", 'git commit -m "the rest"', "git push origin main"], edits: [node22, node22, (t) => t.replace("node-version: 20", "node-version: '22'")] }],
  // Using the composite everywhere, nightly included, with one version in action.yml.
  "one-place": [{ typed: [ACTION, NIGHTLY, "git add -A", "git commit -m setup", "git push"], edits: [defaultTo(22), toComposite] }],
  "one-line": [{ typed: ["cat .github/actions/setup/action.yml", ACTION, "git commit -a", "git push"], edits: [defaultTo(24), () => "Node 24"] }],
  "shared-job": [{ typed: [RELEASE, CI, "git add .", "git commit -m reuse", "git push"], edits: [callTest, callTest] }],
  "make-callable": [{ typed: [TEST, "git commit -am fix", "git push"], edits: [(t) => t.replace("on:\n  push:\n    branches: [main]", "on: workflow_call")] }],
};

const wrong: Record<string, { typed: string[]; edits: Edit[] }> = {
  // Nightly forgotten again.
  "node-22": { typed: [CI, RELEASE, 'git commit -am "Node 22"', "git push"], edits: [node22, node22] },
  // Node 22 everywhere, but nightly keeps its own copy.
  "one-place": { typed: [NIGHTLY, ACTION, 'git commit -am "Node 22"', "git push"], edits: [node22, defaultTo(22)] },
  // Saved and committed, never pushed: GitHub still runs Node 22.
  "one-line": { typed: [ACTION, 'git commit -am "Node 24"'], edits: [defaultTo(24)] },
  // Only ci: release keeps its own copy of the job.
  "shared-job": { typed: [CI, 'git commit -am "Share"', "git push"], edits: [callTest] },
  // Undoing Bora's call makes CI valid again, but nothing is shared.
  "make-callable": { typed: ["rm .github/workflows/test.yml", CI, 'git commit -am "Back to inline"', "git push"], edits: [(t) => t] },
};

describe("reusable-workflows", () => {
  it("the story: three copies, one forgotten, a composite action, a one-line upgrade, a reusable job", () => {
    expect(steps).toHaveLength(8);
    expect(ranNodes(0)).toEqual([20, 20, 20]);
    expect(copies(scene.at(0))).toBe(3);
    expect(ranNodes(1)).toEqual([22, 22, 20]);
    expect(ranNodes(2)).toEqual([22, 22, 22]);
    expect(copies(scene.at(2))).toBe(1);
    const before = scene.at(2).edits;
    expect(ranNodes(3)).toEqual([24, 24, 24]);
    expect(scene.at(3).edits - before).toBe(1);
    const w4 = scene.at(4);
    expect(w4.calls).toEqual({ ci: true, release: true });
    expect(WFS.map((wf) => nodeOf(w4, wf))).toEqual([24, 24, 24]);
  });

  it("GitHub refuses a call to a workflow that is not callable, with its own wording", () => {
    const s = scenarios.find((x) => x.id === "make-callable")!;
    const r = typeIntoRw(s.start, [CI, "git commit -am again", "git push"], [(t) => `${t}\n# try again`]);
    expect(r.output.join("\n")).toMatch(/workflow is not reusable as it is missing a `on.workflow_call` trigger/);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeIntoRw(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const { typed, edits } = solutions[s.id]!;
      const r = typeIntoRw(s.start, typed, [...edits]);
      expect(r.output.filter((x) => /^(fatal|error|Error|Invalid)/.test(x)), r.output.join("\n")).toEqual([]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const [i, alt] of (alternatives[s.id] ?? []).entries()) {
      it(`${s.id}: also wins another way (${i + 1})`, () => {
        const r = typeIntoRw(s.start, alt.typed, [...alt.edits]);
        expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const { typed, edits } = wrong[s.id]!;
      expect(s.check(typeIntoRw(s.start, typed, [...edits]).ctx)).toBe(false);
    });
  }
});
