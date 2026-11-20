import { describe, expect, it } from "vitest";
import { findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarioSuite } from "../shared/scenarioSuite";
import { dangling, images, inspect, ps, stats } from "./cli";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, START, steps } from "./Scene";

describe("inspect-and-clean", () => {
  it("the starting machine: web up, hello and broken exited, one dangling image", () => {
    expect(findContainer(START, "web")!.state).toBe("running");
    expect(findContainer(START, "hello")).toMatchObject({ state: "exited", exitCode: 0 });
    expect(findContainer(START, "broken")).toMatchObject({ state: "exited", exitCode: 1 });
    expect(dangling(START)).toHaveLength(1);
    expect(ps(START, false)).toHaveLength(2);
    expect(ps(START, true)).toHaveLength(4);
    expect(images(START).some((line) => line.startsWith("<none>"))).toBe(true);
    expect(inspect(findContainer(START, "web")!).join("\n")).toContain('"Status": "running"');
    expect(stats(START)).toHaveLength(2);
  });

  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: logs of an exited container, exec, rmi refused, prune keeps web and tagged images", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const ev = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(findContainer(at(3), "broken")!.logs.at(-1)).toContain("disk full");
    expect(ev(4).find((e) => e.type === "execOutput")).toMatchObject({ output: ["root"] });
    const err = ev(6).find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toContain("is using its referenced image");
    expect(findContainer(at(7), "hello")).toBeUndefined();
    expect(findContainer(at(7), "web")!.state).toBe("running");
    const pruned = ev(8).find((e) => e.type === "pruned");
    expect(pruned && "containers" in pruned ? pruned.containers : []).toEqual(["broken"]);
    expect(findContainer(at(8), "web")!.state).toBe("running");
    expect(at(8).tags["acme/old:0.1"]).toBeDefined();
    expect(dangling(at(8))).toHaveLength(0);
  });

  it("docker image prune leaves containers alone; system prune does not", () => {
    expect(findContainer(typeInto(START, ["docker image prune -f"]).ctx.state, "broken")).toBeDefined();
    expect(findContainer(typeInto(START, ["docker system prune -f"]).ctx.state, "broken")).toBeUndefined();
  });

  scenarioSuite(scenarios, {
    solutions: {
      "make-room": ["docker system prune -a -f"],
      "dangling-only": ["docker image prune -f"],
      "move-out": ["docker rm -f web", "docker rmi nginx:1.27"],
      "prune-trap": ["docker start web", "docker system prune -f"],
    },
    alternatives: {
      "make-room": [["docker system df", "docker system prune --all --force"]],
      "dangling-only": [["docker images", "docker image prune --force"]],
      "move-out": [["docker stop web", "docker rm web", "docker image rm nginx:1.27"]],
      "prune-trap": [["docker start web", "docker rm hello broken"], ["docker start web && docker container prune -f"]],
    },
    wrong: {
      "make-room": ["docker system prune -f"],
      "dangling-only": ["docker system prune -f"],
      "move-out": ["docker rmi nginx:1.27"],
      "prune-trap": ["docker system prune -f"],
    },
  });
});
