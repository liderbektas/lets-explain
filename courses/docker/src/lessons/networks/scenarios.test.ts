import { describe, expect, it } from "vitest";
import { findContainer, type DockerEvent } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarioSuite } from "../shared/scenarioSuite";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";
import { targetOf } from "../../iso/HostStage";
import { buildTimeline } from "../../iso/BuildStage";

const execOf = (events: DockerEvent[]) => events.filter((e): e is Extract<DockerEvent, { type: "execOutput" }> => e.type === "execOutput");

describe("networks", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: no names on the default bridge, names on shop, no -p needed inside, host and none", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const evs = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(execOf(evs(1))[0]).toMatchObject({ code: 1 });
    expect(execOf(evs(3))[0]).toMatchObject({ code: 0 });
    expect(execOf(evs(4))[0]).toMatchObject({ code: 0, output: ["api says hello"] });
    expect(evs(4).find((e) => e.type === "curlResult")).toMatchObject({ ok: false });
    expect(findContainer(at(4), "api")!.ports).toEqual([]);
    expect(execOf(evs(5))[0]).toMatchObject({ code: 1 });
    // On the host network -p is ignored; on none there is no network to speak of.
    expect(findContainer(at(6), "hostnet")!.ports).toEqual([]);
    expect(findContainer(at(6), "isolated")!.networks).toEqual(["none"]);
  });

  it("the terminal shows the failed lookup, then the ping by name", () => {
    const s = scenarios.find((x) => x.id === "by-name")!;
    const r = typeInto(s.start, ["docker exec web ping cache", "docker network create shop", "docker network connect shop web", "docker network connect shop cache", "docker exec web ping cache"]);
    expect(r.output[0]).toBe("ping: bad address 'cache'");
    expect(r.output.at(-1)).toContain("PING cache");
  });

  scenarioSuite(scenarios, {
    solutions: {
      "by-name": ["docker network create shop", "docker network connect shop web", "docker network connect shop cache", "docker exec web ping cache"],
      "worker-only": ["docker network create jobs", "docker network connect jobs cache", "docker run -d --name worker --network jobs nginx:1.27"],
      "private-api": ["docker run -d --name api --network shop nginx:1.27", "docker exec web curl http://api"],
      "quick-check": ["docker run --rm --network shop alpine:3.20 ping -c 1 cache"],
    },
    alternatives: {
      "by-name": [["docker network create backend && docker network connect backend web && docker network connect backend cache", "docker exec web ping -c 1 cache"]],
      "worker-only": [["docker network create sessions", "docker run -d --name worker --network sessions nginx:1.27", "docker network connect sessions cache"]],
      "private-api": [["docker run -d --network shop --name api nginx:1.27", "docker exec web curl api"]],
      "quick-check": [["docker run --rm --network=shop alpine:3.20 ping cache"]],
    },
    wrong: {
      "by-name": ["docker exec web ping cache"],
      "worker-only": ["docker network create shop", "docker network connect shop web", "docker network connect shop cache", "docker run -d --name worker --network shop nginx:1.27"],
      "private-api": ["docker run -d --name api -p 8080:80 nginx:1.27", "docker exec web curl http://api"],
      "quick-check": ["docker run --rm alpine:3.20 ping -c 1 cache"],
    },
  });
});

describe("networks: what the stage animates", () => {
  const h = scene.run.states[scene.stepEnd(4)]!;
  const list = Object.values(h.containers);

  it("a ping or curl inside a container is drawn to the container whose name it used", () => {
    expect(targetOf("ping cache", list)?.name).toBe("cache");
    expect(targetOf("curl http://api", list)?.name).toBe("api");
    expect(targetOf("cat /etc/hosts", list)).toBeUndefined();
  });

  it("a Compose service name finds that service's container", () => {
    const fake = [{ ...list[0]!, name: "shop-db-1" }];
    expect(targetOf("ping db", fake)?.name).toBe("shop-db-1");
  });

  it("builds play line by line: a cached line is quicker than one that runs", () => {
    const tl = buildTimeline([
      { index: 0, text: "FROM node:22", cached: true, seconds: 0, size: 1, stage: 0 },
      { index: 1, text: "RUN npm ci", cached: false, seconds: 30, size: 60, stage: 0 },
    ]);
    expect(tl.start[1]).toBeGreaterThan(tl.start[0]!);
    expect(tl.end[0]! - tl.start[0]!).toBeLessThan(tl.end[1]! - tl.start[1]!);
    expect(tl.total).toBe(tl.end[1]);
  });
});
