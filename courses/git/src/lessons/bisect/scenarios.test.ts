import { describe, expect, it } from "vitest";
import { currentBranch, short, type Repo } from "../../engine/git";
import { typeInto } from "../shared/missionHelpers";
import { DATES, DATES_CULPRIT, DATES_TEST, IMAGES_TEST, LOGIN_TEST, PRICES, PRICES_CULPRIT, PRICES_TEST, scenarios, type BugTest } from "./scenarios";
import { CULPRIT, LESSON_TEST, passes, scene, steps } from "./Scene";

const TESTS: Record<string, BugTest> = { dates: DATES_TEST, "no-tag": PRICES_TEST, "find-and-revert": LOGIN_TEST, "take-over": IMAGES_TEST };
const byId = Object.fromEntries(scenarios.map((s) => [s.id, s]));

/**
 * Types `before`, then marks every commit bisect stops at the way the test says (as an honest
 * reader would), then types `after`, which may use the id bisect found.
 */
function honest(start: Repo, test: BugTest, before: string[], after: (found: string) => string[] = () => [], lie = false) {
  const typed = [...before];
  for (let i = 0; i < 20; i++) {
    const s = typeInto(start, typed).ctx.state;
    if (!s.bisect || s.bisect.found) break;
    typed.push(passes(s, test) !== lie ? "git bisect good" : "git bisect bad");
  }
  const found = typeInto(start, typed).ctx.events.flat().find((e) => e.type === "bisectFound");
  return typeInto(start, [...typed, ...after(found && found.type === "bisectFound" ? short(found.id) : "")]);
}

const releaseId = short(PRICES.commits[Object.keys(PRICES.commits).find((id) => PRICES.commits[id]!.message === "Sürüm 2.0")!]!.id);

/** Per scenario: what comes before the marks, and what comes after them. */
const plays: Record<string, { before: string[]; after: (id: string) => string[] }> = {
  dates: { before: ["git bisect start HEAD v1.0"], after: () => [] },
  "no-tag": { before: ["git log --oneline", `git bisect start HEAD ${releaseId}`], after: () => ["git bisect reset"] },
  "find-and-revert": { before: ["git bisect start HEAD v2.1"], after: (id) => ["git bisect reset", `git revert ${id}`] },
  "take-over": { before: ["git status"], after: () => ["git bisect reset"] },
};
const play = (id: string, lie = false) => honest(byId[id]!.start, TESTS[id]!, plays[id]!.before, plays[id]!.after, lie);

describe("bisect", () => {
  it("every lesson step runs without a Git error", () => {
    const errors = scene.run.events.flat().filter((e) => e.type === "error");
    expect(errors).toEqual([]);
    expect(steps.length).toBe(10);
  });

  it("the lesson's marks match what the test says at each commit, and bisect finds the culprit", () => {
    for (const step of [3, 4, 5]) {
      const tested = scene.run.states[scene.stepStart(step)]!;
      const mark = steps[step]![0]!;
      expect(mark.type === "bisectMark" && mark.verdict).toBe(passes(tested, LESSON_TEST) ? "good" : "bad");
    }
    const found = scene.run.states[scene.stepEnd(5)]!.bisect!.found;
    expect(found).toBe(CULPRIT);
    expect(scene.run.states[scene.stepStart(3)]!.commits[CULPRIT]!.message).toBe("math sadeleşti");
    expect(scene.run.events.slice(scene.stepStart(2), scene.stepEnd(5)).flat().filter((e) => e.type === "bisectTesting")).toHaveLength(3);
  });

  it("after reset and revert, main adds again and later commits stay", () => {
    const end = scene.run.states[scene.stepEnd(7)]!;
    expect(currentBranch(end)).toBe("main");
    expect(passes(end, LESSON_TEST)).toBe(true);
    expect(end.work["style.css"]).toBe("koyu tema");
  });

  it("each history's culprit is the commit that broke its test", () => {
    expect(DATES.commits[DATES_CULPRIT]!.message).toBe("format düzeni");
    expect(PRICES.commits[PRICES_CULPRIT]!.message).toBe("Sepet sadeleşti");
  });

  it("the teammate's mark in the take-over scenario was honest and bisect is still open", () => {
    const s = byId["take-over"]!.start;
    expect(s.bisect && !s.bisect.found).toBe(true);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: honest marks win in exactly par`, () => {
      const r = play(s.id);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    it(`${s.id}: marking against the test blames the wrong commit`, () => {
      const r = play(s.id, true);
      expect(s.check(r.ctx)).toBe(false);
    });
  }

  it("no-tag: also wins with the long form of start", () => {
    const r = honest(PRICES, PRICES_TEST, ["git bisect start HEAD HEAD~7"], () => ["git bisect reset"]);
    expect(byId["no-tag"]!.check(r.ctx)).toBe(true);
  });

  it("find-and-revert: forgetting to reset first is refused, so the revert never lands", () => {
    const r = honest(byId["find-and-revert"]!.start, LOGIN_TEST, ["git bisect start HEAD v2.1"], (id) => [`git revert ${id}`]);
    expect(byId["find-and-revert"]!.check(r.ctx)).toBe(false);
  });
});
