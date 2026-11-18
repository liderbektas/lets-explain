import { describe, expect, it } from "vitest";
import { findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { down, EXPECTED_ERRORS, fileFull, scene, steps, up } from "./Scene";

const curl: DockerAction = { type: "curl", port: 8080 };

const solutions: Record<string, DockerAction[]> = {
  "all-up": [up(fileFull), curl],
  "keep-data": [up(fileFull), down(), up(fileFull)],
  "missing-env": [up(fileFull, {}), up(fileFull)],
  "clean-slate": [up(fileFull), down(true)],
};

describe("compose-basics", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: a network per project, .env fills ${VAR}, start order, DNS by service name, down keeps the volume", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const ev = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    // 1: one service, its own project network, reachable on 8080.
    expect(findContainer(at(1), "shop-web-1")!.state).toBe("running");
    expect(at(1).networks.shop_default).toBeDefined();
    expect(ev(1).find((e) => e.type === "curlResult")).toMatchObject({ ok: true });
    // 2: without .env the variable is empty and the api exits 1; it was built first.
    expect(ev(2).some((e) => e.type === "built")).toBe(true);
    expect(findContainer(at(2), "shop-api-1")).toMatchObject({ state: "exited", exitCode: 1 });
    expect(findContainer(at(2), "shop-web-1")!.state).toBe("running");
    // 3: with .env the api is recreated and runs, with the value filled in.
    expect(findContainer(at(3), "shop-api-1")!.state).toBe("running");
    expect(findContainer(at(3), "shop-api-1")!.env.DATABASE_URL).toBe("postgres://app:s3cret@db:5432/shop");
    // 4: db starts before api: depends_on sets the order; a project volume appears.
    const order = ev(4).find((e) => e.type === "composeUp");
    expect(order && "services" in order ? order.services : []).toEqual(["db", "api", "web"]);
    expect(at(4).volumes.shop_pgdata).toBeDefined();
    expect(findContainer(at(4), "shop-db-1")!.env.POSTGRES_PASSWORD).toBe("s3cret");
    // 5: the service name resolves on the project network.
    expect(ev(5).find((e) => e.type === "execOutput")).toMatchObject({ code: 0 });
    // 6: down removes containers and the network, not the volume.
    expect(Object.values(at(6).containers)).toHaveLength(0);
    expect(at(6).networks.shop_default).toBeUndefined();
    expect(at(6).volumes.shop_pgdata).toBeDefined();
    // 7: up again: the database finds its data.
    expect(findContainer(at(7), "shop-db-1")!.logs.at(-1)).toContain("existing data found");
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
