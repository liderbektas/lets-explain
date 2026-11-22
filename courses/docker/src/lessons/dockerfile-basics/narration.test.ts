import { describe, expect, it } from "vitest";
import { narrationProblems } from "@lets-explain/core/course/narration";
import { narration } from "./narration";
import { dockerfileBasics } from "./lesson";
import { steps } from "./Scene";

describe("dockerfile-basics narration", () => {
  it("matches the lesson: one entry per step, answers only on predictions, every scene action cued in order", () => {
    expect(narrationProblems(narration, dockerfileBasics.steps, steps.map((s) => s.length))).toEqual([]);
  });
});
