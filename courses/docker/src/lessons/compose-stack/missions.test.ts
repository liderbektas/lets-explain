import { describe, expect, it } from "vitest";
import { containerFiles, findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { down, EXPECTED_ERRORS, fileEager, filePatient, ORDERS, scene, steps, tick, up, writeOrder } from "./Scene";

const curl: DockerAction = { type: "curl", port: 3000 };

const solutions: Record<string, DockerAction[]> = {
  "first-try": [up(filePatient), curl],
  "crash-then-up": [up(fileEager), tick(), tick(), up(fileEager)],
  "keep-orders": [up(filePatient), writeOrder, down(), up(filePatient)],
};

describe("compose-stack", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: starting too early crashes, waiting for healthy works, the volume keeps data until down -v", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const ev = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    // 1: short depends_on: app tries db while it is still starting.
    expect(findContainer(at(1), "shop-app-1")).toMatchObject({ state: "exited", exitCode: 1 });
    expect(findContainer(at(1), "shop-app-1")!.logs.at(-1)).toContain("ECONNREFUSED db:5432");
    // 2: two ticks later both are healthy and a second up works.
    expect(ev(2).filter((e) => e.type === "healthy")).toHaveLength(2);
    expect(findContainer(at(2), "shop-app-1")!.state).toBe("running");
    // 3: service_healthy: Compose waits, the app starts once and runs.
    expect(ev(3).some((e) => e.type === "composeWaiting")).toBe(true);
    expect(ev(3).some((e) => e.type === "exited" && e.name === "shop-app-1" && e.code === 1)).toBe(false);
    expect(findContainer(at(3), "shop-app-1")!.state).toBe("running");
    // 4: an order written, down and up: still there.
    expect(containerFiles(at(4), findContainer(at(4), "shop-db-1")!)[ORDERS]).toBe("3 sipariş");
    expect(findContainer(at(4), "shop-db-1")!.logs.some((x) => x.includes("existing data found"))).toBe(true);
    // 5: down -v wipes it: a new, empty database.
    expect(containerFiles(at(5), findContainer(at(5), "shop-db-1")!)[ORDERS]).toBeUndefined();
    expect(findContainer(at(5), "shop-db-1")!.logs.some((x) => x.includes("initialized a new, empty database"))).toBe(true);
    // 6: restart: on-failure keeps trying until the database is ready.
    expect(findContainer(at(6), "shop-app-1")).toMatchObject({ state: "running", restarts: 2 });
    // 7: only the app is published.
    expect(ev(7).find((e) => e.type === "curlResult")).toMatchObject({ ok: true });
    expect(findContainer(at(7), "shop-db-1")!.ports).toEqual([]);
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
