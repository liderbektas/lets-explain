import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/missionHelpers";
import { LATEST, LOGIN, REPO, scenarios, V1, V11 } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "first-release": [`docker tag shop:dev ${V1}`, LOGIN, `docker push ${V1}`],
  "latest-too": [`docker tag shop:dev ${LATEST}`, `docker push ${LATEST}`],
  "pin-it": [`docker run -d --name shop -p 3000:3000 ${V1}`],
  "just-a-name": [`docker rmi ${LATEST}`],
  "new-version": [`docker tag shop:dev ${V11}`, `docker tag shop:dev ${LATEST}`, `docker push --all-tags ${REPO}`],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "first-release": [[LOGIN, `docker image tag shop:dev ${V1}`, "docker images", `docker image push ${V1}`]],
  "latest-too": [[`docker tag ${V1} ${LATEST}`, `docker push ${LATEST}`]],
  "pin-it": [[`docker pull ${V1}`, `docker run -d -p 3000:3000 --name shop ${V1}`]],
  "just-a-name": [[`docker image rm ${LATEST}`]],
  "new-version": [[`docker tag shop:dev ${V11}`, `docker push ${V11}`, `docker tag shop:dev ${LATEST}`, `docker push ${LATEST}`]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "first-release": [`docker tag shop:dev ${V1}`, `docker push ${V1}`],
  "latest-too": [`docker push ${LATEST}`],
  "pin-it": [`docker run -d --name shop -p 3000:3000 ${REPO}`],
  "just-a-name": [`docker rmi shop:dev`],
  "new-version": [`docker tag shop:dev ${LATEST}`, `docker tag shop:dev ${V1}`, `docker push --all-tags ${REPO}`],
};

describe("registry-and-tags", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: one image, many names; latest moves; rmi only untags", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(at(1).tags[V1]).toBe(at(1).tags["shop:dev"]);
    expect(at(2).registry.tags[V1]).toBe(at(1).tags[V1]);
    expect(at(4).tags[LATEST]).not.toBe(at(4).tags[V1]);
    expect(at(6).images[at(5).tags[V1]!]).toBeDefined();
  });

  it("pushing without a login is refused the way GHCR refuses it", () => {
    const s = scenarios.find((x) => x.id === "first-release")!;
    const r = typeInto(s.start, [`docker tag shop:dev ${V1}`, `docker push ${V1}`]);
    expect(r.output.join("\n")).toContain("unauthorized: unauthenticated");
    expect(typeInto(s.start, [LOGIN]).output).toEqual(["Login Succeeded"]);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = typeInto(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" && ")}`, () => {
        const r = typeInto(s.start, alt);
        expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
