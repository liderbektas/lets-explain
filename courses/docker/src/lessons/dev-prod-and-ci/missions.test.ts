import { describe, expect, it } from "vitest";
import { apply, findContainer, imageFor, imageSize, type DockerAction, type Host } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { buildTarget, COMMITS, edit, REPO, runProd, scene, steps } from "./Scene";

const curl = (port: number): DockerAction => ({ type: "curl", port });

function play(start: Host, moves: ((h: Host) => DockerAction)[]): DockerAction[] {
  let h = start;
  return moves.map((m) => {
    const a = m(h);
    h = apply(h, a).state;
    return a;
  });
}

const solutions: Record<string, (h: Host) => DockerAction[]> = {
  instant: (h) => play(h, [() => edit(2), () => curl(3000)]),
  ship: (h) => play(h, [() => edit(2), (x) => buildTarget(x, "prod", "shop:prod"), () => runProd("shop:prod"), () => curl(8080)]),
  "two-worlds": (h) => play(h, [(x) => buildTarget(x, "prod", "shop:prod"), () => runProd("shop:prod"), () => edit(2), () => curl(3000), () => curl(8080)]),
};

describe("dev-prod-and-ci", () => {
  it("every lesson step runs without a Docker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(10);
  });

  it("the story: dev reloads through the bind mount, prod is frozen, CI pushes one tag per commit", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const bodies = scene.run.events.flat().flatMap((e) => (e.type === "curlResult" ? [`${e.port}:${e.body}`] : []));
    expect(bodies).toEqual(["3000:Merhaba v2", "8080:Merhaba v2", "3000:Merhaba v3", "8080:Merhaba v2"]);
    expect(findContainer(at(1), "shop-app-1")!.mounts[0]).toMatchObject({ type: "bind", target: "/app" });
    expect(imageSize(imageFor(at(3), "shop:1.0")!)).toBeLessThan(imageSize(imageFor(at(3), "shop:dev")!));
    expect(imageFor(at(3), "shop:1.0")!.config.user).toBe("node");
    expect(Object.keys(at(7).registry.tags).filter((t) => t.startsWith(`${REPO}:`))).toEqual(COMMITS.map((c) => `${REPO}:sha-${c}`));
    expect(at(7).registry.tags[`${REPO}:sha-${COMMITS[0]}`]).not.toBe(at(7).registry.tags[`${REPO}:sha-${COMMITS[1]}`]);
  });

  it("the sandbox starts with dev answering v1 on :3000 and nothing on :8080", () => {
    expect(apply(scene.sandboxStart, curl(3000)).events[0]).toMatchObject({ ok: true, body: "Merhaba v1" });
    expect(apply(scene.sandboxStart, curl(8080)).events[0]).toMatchObject({ ok: false });
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
