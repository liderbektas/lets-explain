import { describe, expect, it } from "vitest";
import { findContainer, imageFor } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarioSuite } from "../shared/scenarioSuite";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

describe("images-and-containers", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: pull adds an image and no container; containers keep their own changes; tags and builds", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(Object.keys(at(0).images)).toHaveLength(1);
    expect(Object.keys(at(0).containers)).toHaveLength(0);
    expect(imageFor(at(2), "nginx:1.27")).toBeDefined();
    const curls = scene.run.events.slice(scene.stepStart(3), scene.stepEnd(3)).flat().filter((e) => e.type === "curlResult");
    expect(curls[0]).toMatchObject({ port: 8080, body: "web1 değişti" });
    expect(curls[1]).toMatchObject({ port: 8081, ok: true });
    expect(curls[1] && "body" in curls[1] ? curls[1].body : "").not.toBe("web1 değişti");
    // The refused rmi left the image in place.
    expect(imageFor(at(5), "nginx:1.27")).toBeDefined();
    // Removing one of two tags only untags.
    expect(at(6).tags["mysite:base"]).toBeUndefined();
    expect(imageFor(at(6), "nginx:1.27")).toBeDefined();
    const built = imageFor(at(7), "mysite:1.0")!;
    expect(built.layers).toHaveLength(2);
    expect(findContainer(at(7), "site")!.state).toBe("running");
    const siteCurl = scene.run.events.slice(scene.stepStart(7), scene.stepEnd(7)).flat().find((e) => e.type === "curlResult");
    expect(siteCurl).toMatchObject({ port: 8082, body: "Benim sitem" });
  });

  it("rmi refuses an image a stopped container uses, with Docker's message", () => {
    const s = scenarios.find((x) => x.id === "in-use")!;
    expect(typeInto(s.start, ["docker rmi nginx:1.27"]).output[0]).toContain("is using its referenced image");
  });

  scenarioSuite(scenarios, {
    solutions: {
      "pull-ahead": ["docker pull nginx:1.27", "docker pull redis:7"],
      "only-web1": ["docker exec web1 sh -c 'echo Kampanya > /usr/share/nginx/html/index.html'"],
      "in-use": ["docker rm web", "docker rmi nginx:1.27"],
      "new-name": ["docker tag nginx:1.27 mysite:base", "docker rmi nginx:1.27"],
      "own-image": ["docker build -t mysite:1.0 .", "docker run -d --name site -p 8082:80 mysite:1.0"],
    },
    alternatives: {
      "pull-ahead": [["docker image pull redis:7", "docker image pull nginx:1.27", "docker images"]],
      "only-web1": [["docker exec web1 sh -c \"echo yeni > /usr/share/nginx/html/index.html\"", "curl localhost:8080", "curl localhost:8081"]],
      "in-use": [["docker ps -a", "docker rm web && docker rmi nginx:1.27"], ["docker container rm web", "docker image rm nginx:1.27"]],
      "new-name": [["docker image tag nginx:1.27 mysite:base", "docker image rm nginx:1.27"]],
      "own-image": [["docker build -t mysite:1.0 .", "docker run -d -p 8082:80 --name site mysite:1.0", "curl localhost:8082"]],
    },
    wrong: {
      "pull-ahead": ["docker run -d nginx:1.27", "docker run -d redis:7"],
      "only-web1": ["docker exec web2 sh -c 'echo Kampanya > /usr/share/nginx/html/index.html'"],
      "in-use": ["docker rmi nginx:1.27"],
      "new-name": ["docker rmi nginx:1.27", "docker tag nginx:1.27 mysite:base"],
      "own-image": ["docker run -d --name site -p 8082:80 nginx:1.27"],
    },
  });
});
