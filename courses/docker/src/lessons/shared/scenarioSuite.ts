import { expect, it } from "vitest";
import type { DockerScenario } from "./DockerScene";
import { typeInto } from "./missionHelpers";

type Edits = ((text: string) => string)[];

export interface ScenarioCases {
  /** The intended commands for each scenario: they must win in exactly par. */
  solutions: Record<string, string[]>;
  /** Other ways people really do it, which must count too. */
  alternatives?: Record<string, string[][]>;
  /** A tempting wrong move per scenario, which must not win. */
  wrong: Record<string, string[]>;
  /** Editor saves for a scenario's solution, in order. */
  edits?: Record<string, Edits>;
}

/** The standard checks for a lesson's scenarios; call inside a describe block. */
export function scenarioSuite(scenarios: DockerScenario[], cases: ScenarioCases) {
  it("every scenario has a solution and a wrong move", () => {
    for (const s of scenarios) {
      expect(cases.solutions[s.id], s.id).toBeDefined();
      expect(cases.wrong[s.id], s.id).toBeDefined();
      expect(s.hints, s.id).toHaveLength(3);
    }
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = typeInto(s.start, cases.solutions[s.id]!, [...(cases.edits?.[s.id] ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of cases.alternatives?.[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" && ")}`, () => {
        expect(s.check(typeInto(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, cases.wrong[s.id]!).ctx)).toBe(false);
    });
  }
}
