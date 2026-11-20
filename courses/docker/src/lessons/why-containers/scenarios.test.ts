import { describe, expect, it } from "vitest";
import { findContainer } from "../../engine/docker";
import { scenarioSuite } from "../shared/scenarioSuite";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

describe("why-containers", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: one pull for three containers, separate files, and a fresh container after rm", () => {
    const step4 = scene.run.events.slice(scene.stepStart(4), scene.stepEnd(4)).flat();
    expect(step4.filter((e) => e.type === "pulled")).toHaveLength(1);
    const at4 = scene.run.states[scene.stepEnd(4)]!;
    expect(["web-1", "web-2", "web-3"].every((n) => findContainer(at4, n)?.state === "running")).toBe(true);
    const step5 = scene.run.events.slice(scene.stepStart(5), scene.stepEnd(5)).flat();
    expect(step5.find((e) => e.type === "execOutput")).toMatchObject({ name: "web-2", code: 1 });
    const step6 = scene.run.events.slice(scene.stepStart(6), scene.stepEnd(6)).flat();
    expect(step6.find((e) => e.type === "execOutput")).toMatchObject({ name: "web-1", code: 1 });
    expect(step6.some((e) => e.type === "pulled")).toBe(false);
  });

  it("the terminal shows the note in web-1 and not in web-2", () => {
    const s = scenarios.find((x) => x.id === "own-files")!;
    const r = typeInto(s.start, ["docker exec web-1 sh -c 'echo merhaba > /tmp/note.txt'", "docker exec web-1 cat /tmp/note.txt", "docker exec web-2 cat /tmp/note.txt"]);
    expect(r.output).toEqual(["merhaba", "cat: /tmp/note.txt: No such file or directory"]);
  });

  scenarioSuite(scenarios, {
    solutions: {
      "three-copies": ["docker run -d --name web-1 nginx:1.27", "docker run -d --name web-2 nginx:1.27", "docker run -d --name web-3 nginx:1.27"],
      "own-files": ["docker exec web-1 sh -c 'echo merhaba > /tmp/note.txt'", "docker exec web-2 cat /tmp/note.txt"],
      "replace-not-repair": ["docker rm -f web-1", "docker run -d --name web-1 nginx:1.27"],
      "clean-up": ["docker rm -f web-1 web-2 web-3"],
    },
    alternatives: {
      "three-copies": [["docker run -d --name web-1 nginx:1.27 && docker run -d --name web-2 nginx:1.27 && docker run -d --name web-3 nginx:1.27", "docker ps"]],
      "own-files": [["docker exec web-1 sh -c \"echo hi > /tmp/x.txt\"", "docker exec web-1 cat /tmp/x.txt", "docker exec web-2 cat /tmp/x.txt"]],
      "replace-not-repair": [["docker stop web-1", "docker rm web-1", "docker run -d --name web-1 nginx:1.27"]],
      "clean-up": [["docker stop web-1 web-2 web-3", "docker rm web-1 web-2 web-3"], ["docker rm -f web-1", "docker rm -f web-2", "docker rm -f web-3"]],
    },
    wrong: {
      "three-copies": ["docker run -d nginx:1.27", "docker run -d nginx:1.27", "docker run -d nginx:1.27"],
      "own-files": ["docker exec web-2 cat /tmp/note.txt"],
      "replace-not-repair": ["docker restart web-1"],
      "clean-up": ["docker rm -f web-1 web-2 web-3", "docker rmi nginx:1.27"],
    },
  });
});
