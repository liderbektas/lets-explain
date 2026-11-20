import { describe, expect, it } from "vitest";
import { findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarioSuite } from "../shared/scenarioSuite";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

describe("architecture", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: the daemon pulls on run, refuses unknown images, and a daemon restart stops containers without a policy", () => {
    const ev = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(ev(2).some((e) => e.type === "pulled")).toBe(true);
    expect(ev(3).some((e) => e.type === "pulled")).toBe(false);
    expect(ev(4).some((e) => e.type === "pulled" && e.ref === "redis:7")).toBe(true);
    const err = ev(5).find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toContain("pull access denied");
    expect(ev(6).some((e) => e.type === "pulled" && e.ref.startsWith("gcr.io/"))).toBe(true);
    const at7 = scene.run.states[scene.stepEnd(7)]!;
    expect(findContainer(at7, "web")!.state).toBe("exited");
    expect(findContainer(at7, "cache")!.state).toBe("exited");
  });

  it("a name without a registry goes to Docker Hub and fails there", () => {
    const s = scenarios.find((x) => x.id === "full-name")!;
    expect(typeInto(s.start, ["docker pull distroless/nodejs22-debian12"]).output.join("\n")).toMatch(/denied|not found/i);
  });

  scenarioSuite(scenarios, {
    solutions: {
      "no-pull": ["docker run -d --name web nginx:1.27", "docker run -d --name cache redis:7"],
      "full-name": ["docker pull gcr.io/distroless/nodejs22-debian12"],
      "survive-restart": ["docker run -d --name web --restart unless-stopped nginx:1.27", "sudo systemctl restart docker"],
      "bring-back": ["docker start web"],
    },
    alternatives: {
      "no-pull": [["docker run -d --name cache redis:7 && docker run -d --name web nginx:1.27", "docker ps"]],
      "full-name": [["docker image pull gcr.io/distroless/nodejs22-debian12", "docker images"]],
      "survive-restart": [["docker run -d --restart always --name web nginx:1.27", "systemctl restart docker", "docker ps"]],
      "bring-back": [["docker ps -a", "docker container start web"]],
    },
    wrong: {
      "no-pull": ["docker pull nginx:1.27", "docker pull redis:7", "docker run -d --name web nginx:1.27", "docker run -d --name cache redis:7"],
      "full-name": ["docker pull distroless/nodejs22-debian12"],
      "survive-restart": ["docker run -d --name web nginx:1.27", "sudo systemctl restart docker"],
      "bring-back": ["docker rm web", "docker run -d --name web -p 8080:80 nginx:1.27"],
    },
  });
});
