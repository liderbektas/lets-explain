import { describe, expect, it } from "vitest";
import { findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarioSuite } from "../shared/scenarioSuite";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

describe("lifecycle", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: created, running, exited keeps files, rm refuses a running one, a new container starts empty", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const ev = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(findContainer(at(0), "web")!.state).toBe("created");
    expect(findContainer(at(1), "web")!.state).toBe("running");
    expect(findContainer(at(2), "web")).toMatchObject({ state: "exited", exitCode: 0 });
    expect(ev(3).find((e) => e.type === "execOutput")).toMatchObject({ code: 0, output: ["alışveriş listesi"] });
    const err = ev(4).find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toContain("container is running");
    expect(findContainer(at(4), "web")).toBeUndefined();
    expect(ev(5).find((e) => e.type === "execOutput")).toMatchObject({ code: 1 });
    expect(findContainer(at(6), "hello")).toMatchObject({ state: "exited", exitCode: 0 });
    expect(findContainer(at(7), "web")).toMatchObject({ state: "exited", exitCode: 137 });
  });

  it("rm refuses a running container with Docker's message", () => {
    const s = scenarios.find((x) => x.id === "gentle-goodbye")!;
    expect(typeInto(s.start, ["docker rm web"]).output.join("\n")).toContain("container is running");
  });

  scenarioSuite(scenarios, {
    solutions: {
      "ready-not-running": ["docker create --name web -p 8080:80 nginx:1.27", "docker start web"],
      maintenance: ["docker stop web", "docker start web"],
      "gentle-goodbye": ["docker stop web", "docker rm web"],
      "tidy-list": ["docker container prune -f"],
    },
    alternatives: {
      "ready-not-running": [["docker container create -p 8080:80 --name web nginx:1.27", "docker ps -a", "docker container start web"]],
      maintenance: [["docker stop web && docker start web", "docker exec web cat /notes.txt"], ["docker restart web"]],
      "gentle-goodbye": [["docker stop web && docker rm web"]],
      "tidy-list": [["docker ps -a", "docker rm hello old-web"], ["docker rm hello", "docker rm old-web"]],
    },
    wrong: {
      "ready-not-running": ["docker run -d --name web -p 8080:80 nginx:1.27"],
      maintenance: ["docker rm -f web", "docker run -d --name web -p 8080:80 nginx:1.27"],
      "gentle-goodbye": ["docker rm -f web"],
      "tidy-list": ["docker rm -f hello old-web web"],
    },
  });
});
