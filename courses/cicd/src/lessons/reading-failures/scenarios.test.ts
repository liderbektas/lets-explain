import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { FIXED_TEST, scenarios } from "./scenarios";
import { errorLine, scene, steps } from "./Scene";

type Way = { typed: string[]; edits: ((t: string) => string)[] };

const vat = (t: string) => t.replace("1.18", "1.2");
const listenFirst = () => FIXED_TEST;
const skipIt = (t: string) => t.replace('it("confirms the order"', 'it.skip("confirms the order"');

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, Way> = {
  vat: { typed: ["gh run view --log-failed", "nano src/cart.ts", 'git commit -am "fix: VAT is 20%"', "git push"], edits: [vat] },
  "rerun-flaky": { typed: ["gh run view --log-failed", "gh run rerun"], edits: [] },
  "fix-flaky": { typed: ["cat src/checkout.test.ts", "nano src/checkout.test.ts", 'git commit -am "test: listen before ordering"', "git push"], edits: [listenFirst] },
  prove: { typed: ["gh run rerun", "gh run view --log-failed", "nano src/cart.ts", 'git commit -am "fix: VAT is 20%"', "git push"], edits: [vat] },
  clean: { typed: ["nano src/cart.ts", "nano src/checkout.test.ts", 'git commit -am "fix: VAT and the checkout race"', "git push"], edits: [vat, listenFirst] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  vat: [{ typed: ["nano src/cart.ts", "git add src/cart.ts", 'git commit -m "fix VAT"', "git push origin main"], edits: [vat] }],
  "rerun-flaky": [{ typed: ["gh run list", "gh run rerun 1 --failed"], edits: [] }],
  // Setting the test aside is the other honest answer the lesson gives.
  "fix-flaky": [{ typed: ["nano src/checkout.test.ts", 'git commit -am "test: skip the racy checkout test for now"', "git push"], edits: [skipIt] }],
  prove: [{ typed: ["gh run rerun 1", "nano src/cart.ts", "git add .", 'git commit -m "fix VAT"', "git push"], edits: [vat] }],
  clean: [{ typed: ["nano src/checkout.test.ts", "nano src/cart.ts", "git add .", 'git commit -m "fix both"', "git push"], edits: [listenFirst, vat] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  // A real bug fails on every attempt.
  vat: { typed: ["gh run rerun"], edits: [] },
  // A new commit is a new first attempt: the flaky test fails again, and the release commit is not the one tested.
  "rerun-flaky": { typed: ['echo "" >> README.md', 'git commit -am "retry ci"', "git push"], edits: [] },
  // Green, but only on the second attempt: the race is still in the test.
  "fix-flaky": { typed: ["gh run rerun"], edits: [] },
  // Fixed, but nobody showed that the re-run fails the same way.
  prove: { typed: ["nano src/cart.ts", 'git commit -am "fix: VAT is 20%"', "git push"], edits: [vat] },
  // Fixing VAT alone, then re-running past the flaky test: green, but the race stays.
  clean: { typed: ["nano src/cart.ts", 'git commit -am "fix: VAT"', "git push", "gh run rerun"], edits: [vat] },
};

describe("reading-failures", () => {
  it("the story: a real bug, a flaky test that passes on re-run, a real bug that does not", () => {
    expect(steps).toHaveLength(9);
    expect(errorLine(latestRun(scene.at(0)))).toBe("AssertionError: expected 118 to be 120");
    expect(latestRun(scene.at(2))!.status).toBe("success");
    expect(errorLine(latestRun(scene.at(3)))).toBe("Error: Test timed out in 5000ms.");
    expect(latestRun(scene.at(4))!).toMatchObject({ status: "success", attempt: 2 });
    const s5 = scene.at(5).runs.slice(-2);
    expect(s5.map((r) => [r.attempt, r.status])).toEqual([
      [1, "failure"],
      [2, "failure"],
    ]);
    expect(errorLine(s5[1])).toBe("AssertionError: expected 118 to be 120");
    expect(latestRun(scene.at(6))!.status).toBe("success");
  });

  it("each scenario starts on a red run whose log names the problem the story describes", () => {
    const first = (id: string) => errorLine(latestRun(scenarios.find((s) => s.id === id)!.start.world));
    expect(first("vat")).toBe("AssertionError: expected 118 to be 120");
    expect(first("rerun-flaky")).toBe("Error: Test timed out in 5000ms.");
    expect(first("clean")).toBe("AssertionError: expected 118 to be 120");
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
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
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
