import { describe, expect, it } from "vitest";
import { findContainer, type DockerAction, type DockerEvent } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";
import { targetOf } from "../../iso/HostStage";
import { buildTimeline } from "../../iso/BuildStage";

const create: DockerAction = { type: "networkCreate", name: "shop" };
const connect = (container: string): DockerAction => ({ type: "networkConnect", network: "shop", container });
const ping = (from: string): DockerAction => ({ type: "exec", container: from, cmd: "ping cache" });
const worker: DockerAction = { type: "run", image: "nginx:1.27", detach: true, name: "worker", network: "shop" };

const solutions: Record<string, DockerAction[]> = {
  "hello-cache": [create, connect("web"), connect("cache"), ping("web")],
  newcomer: [create, connect("cache"), worker, ping("worker")],
  "see-then-fix": [ping("web"), create, connect("web"), connect("cache"), ping("web")],
};

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

  it("no mission is won before any move", () => {
    for (const m of missions) expect(m.check(ctxFor(scene, [])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution uses only enabled buttons and wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      actions.forEach((a, i) => {
        const before = ctxFor(scene, actions.slice(0, i));
        expect(scene.moves(before.state, actions.slice(0, i)), `${m.id} move ${i}`).toContainEqual(a);
      });
      expect(m.check(ctxFor(scene, actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(searchWin(scene, m.check, m.par - 1)).toBeNull();
    });
  }
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
