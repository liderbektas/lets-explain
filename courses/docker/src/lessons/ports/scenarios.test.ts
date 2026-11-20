import { describe, expect, it } from "vitest";
import { findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarioSuite } from "../shared/scenarioSuite";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

describe("ports", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: mapping works, a wrong container port resets, a taken host port is refused, a random port works", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const evs = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(evs(0).find((e) => e.type === "curlResult")).toMatchObject({ port: 8080, ok: true });
    const reset = evs(1).find((e) => e.type === "curlResult");
    expect(reset).toMatchObject({ port: 8081, ok: false });
    expect(reset && "body" in reset ? reset.body : "").toContain("reset");
    expect(evs(2).find((e) => e.type === "curlResult")).toMatchObject({ port: 8081, ok: true });
    const err = evs(3).find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toContain("port is already allocated");
    // The container exists but never started.
    expect(findContainer(at(3), "web3")!.state).toBe("created");
    expect(findContainer(at(4), "web3")!.ports).toEqual([{ host: 32768, container: 80 }]);
    expect(evs(4).find((e) => e.type === "curlResult")).toMatchObject({ port: 32768, ok: true });
  });

  it("the terminal tells what is wrong: reset, the taken port, the picked port and the image's port", () => {
    const at = (id: string) => scenarios.find((x) => x.id === id)!.start;
    expect(typeInto(at("wrong-door"), ["curl localhost:8081"]).output.join("\n")).toContain("Connection reset by peer");
    expect(typeInto(at("who-holds-it"), ["docker run -d --name site -p 8080:80 nginx:1.27"]).output.join("\n")).toContain("port is already allocated");
    expect(typeInto(at("any-free-port"), ["docker run -d --name preview -p 80 nginx:1.27", "docker port preview"]).output).toContain("80/tcp -> 0.0.0.0:32768");
    expect(typeInto(at("unknown-port"), ["docker inspect acme/docs:1.0"]).output.join("\n")).toContain("3000/tcp");
  });

  scenarioSuite(scenarios, {
    solutions: {
      "wrong-door": ["docker rm -f web2", "docker run -d --name web2 -p 8081:80 nginx:1.27"],
      "who-holds-it": ["docker stop blog-test", "docker run -d --name site -p 8080:80 nginx:1.27"],
      "any-free-port": ["docker run -d --name preview -p 80 nginx:1.27", "docker port preview", "curl localhost:32768"],
      "unknown-port": ["docker inspect acme/docs:1.0", "docker run -d --name docs -p 8080:3000 acme/docs:1.0"],
    },
    alternatives: {
      "wrong-door": [["curl localhost:8081", "docker stop web2", "docker rm web2", "docker run -d -p 8081:80 --name web2 nginx:1.27", "curl localhost:8081"]],
      "who-holds-it": [["docker ps", "docker rm -f blog-test", "docker run -d -p 8080:80 --name site nginx:1.27"]],
      "any-free-port": [["docker run -d -p 80 --name preview nginx:1.27", "docker ps", "curl localhost:32768"]],
      "unknown-port": [["docker run -d --name docs acme/docs:1.0", "docker logs docs", "docker rm -f docs", "docker run -d --name docs -p 8080:3000 acme/docs:1.0"]],
    },
    wrong: {
      "wrong-door": ["docker restart web2"],
      "who-holds-it": ["docker rm -f api-docs blog-test status", "docker run -d --name site -p 8080:80 nginx:1.27"],
      "any-free-port": ["docker run -d --name preview -p 8090:80 nginx:1.27", "curl localhost:8090"],
      "unknown-port": ["docker run -d --name docs -p 8080:80 acme/docs:1.0"],
    },
  });
});
