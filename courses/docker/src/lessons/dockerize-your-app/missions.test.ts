import { describe, expect, it } from "vitest";
import { apply, findContainer, imageFor, imageSize, type DockerAction, type Host } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { buildWith, NAIVE, PROJECT, SMART } from "./project";
import { scene, steps } from "./Scene";

const edit = (n: number): DockerAction => ({ type: "editHost", path: `${PROJECT}/index.html`, content: `Merhaba v${n}` });
const runShop: DockerAction = { type: "run", image: "shop", detach: true, name: "shop", ports: ["3000:3000"] };
const rm: DockerAction = { type: "rm", container: "shop", force: true };
const curl: DockerAction = { type: "curl", port: 3000 };

/** Builds a solution move by move, since a build reads the folder as it is at that moment. */
function play(start: Host, moves: ((h: Host) => DockerAction)[]): DockerAction[] {
  let h = start;
  return moves.map((m) => {
    const a = m(h);
    h = apply(h, a).state;
    return a;
  });
}

const solutions: Record<string, (h: Host) => DockerAction[]> = {
  "ship-it": (h) => play(h, [() => edit(2), (x) => buildWith(x, SMART), () => rm, () => runShop, () => curl]),
  "fast-rebuild": (h) => play(h, [() => edit(2), (x) => buildWith(x, SMART)]),
  "slow-way": (h) => play(h, [(x) => buildWith(x, NAIVE), () => edit(2), (x) => buildWith(x, NAIVE)]),
};

describe("dockerize-your-app", () => {
  it("every lesson step runs without a Docker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(10);
  });

  it("the story: slim is smaller, no .dockerignore leaks node_modules and .env, deps-first rebuilds fast, USER node, -p", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(imageSize(imageFor(at(1), "node:22-slim")!)).toBeLessThan(imageSize(imageFor(at(1), "node:22")!) / 3);
    const fat = imageFor(at(2), "shop:fat")!;
    expect(fat.layers.some((l) => Object.values(l.files).includes("STRIPE_KEY=sk_live_secret"))).toBe(true);
    const lean = imageFor(at(3), "shop")!;
    expect(lean.layers.some((l) => Object.values(l.files).includes("STRIPE_KEY=sk_live_secret"))).toBe(false);
    expect(imageSize(fat)).toBeGreaterThan(imageSize(lean) + 150);
    expect(at(4).lastBuild!.seconds).toBeLessThan(5);
    const whoami = scene.run.events.slice(scene.stepStart(5), scene.stepEnd(5)).flat().find((e) => e.type === "execOutput");
    expect(whoami && whoami.type === "execOutput" ? whoami.output : []).toEqual(["node"]);
    const curls = scene.run.events.flat().filter((e) => e.type === "curlResult");
    expect(curls[0]).toMatchObject({ ok: false });
    expect(curls[1]).toMatchObject({ ok: true, body: "Merhaba v2" });
    expect(findContainer(at(7), "shop")!.ports).toEqual([{ host: 3000, container: 3000 }]);
  });

  it("the sandbox starts with v1 running on :3000", () => {
    const r = apply(scene.sandboxStart, curl);
    expect(r.events[0]).toMatchObject({ ok: true, body: "Merhaba v1" });
  });

  it("no mission is won before any move", () => {
    for (const m of missions) expect(m.check(ctxFor(scene, [])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution uses only enabled buttons and wins in exactly par moves`, () => {
      const actions = solutions[m.id]!(scene.sandboxStart);
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
