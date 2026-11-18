import { describe, expect, it } from "vitest";
import { findContainer, type DockerAction, type DockerEvent } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

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
