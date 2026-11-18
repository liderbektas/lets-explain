import { describe, expect, it } from "vitest";
import { findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, scene, steps, terminalLines } from "./Scene";

const site2 = (port: string): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name: "site2", ports: [port] });

const solutions: Record<string, DockerAction[]> = {
  "fix-api": [{ type: "rm", container: "api", force: true }, { type: "run", image: "acme/api:1.0", detach: true, name: "api", env: { DATABASE_URL: "postgres://db/shop" } }],
  "no-root": [{ type: "rm", container: "uploader", force: true }, { type: "run", image: "acme/uploader:1.1", detach: true, name: "uploader" }],
  "second-site": [site2("8080:80"), { type: "rm", container: "site2", force: true }, site2("8081:80"), { type: "curl", port: 8081 }],
};

describe("debugging", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: exit codes 1, 127 and 137, exec, a port clash, a permission error and its fix", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(findContainer(at(0), "api")).toMatchObject({ state: "exited", exitCode: 1 });
    expect(findContainer(at(0), "api")!.logs.at(-1)).toContain("DATABASE_URL");
    expect(findContainer(at(2), "typo")!.exitCode).toBe(127);
    expect(findContainer(at(3), "report")).toMatchObject({ exitCode: 137, oomKilled: true });
    const exec = scene.run.events.slice(scene.stepStart(4), scene.stepEnd(4)).flat().find((e) => e.type === "execOutput");
    expect(exec && "output" in exec ? exec.output : []).toEqual(["root"]);
    expect(findContainer(at(5), "site2")!.state).toBe("created");
    expect(findContainer(at(6), "site2")!.state).toBe("running");
    expect(scene.run.events.slice(scene.stepStart(6), scene.stepEnd(6)).flat().some((e) => e.type === "curlResult" && e.ok)).toBe(true);
    expect(findContainer(at(7), "uploader")).toMatchObject({ exitCode: 1 });
    expect(findContainer(at(7), "uploader")!.logs.at(-1)).toContain("EACCES");
    expect(findContainer(at(8), "uploader")).toMatchObject({ state: "running", user: "node" });
  });

  it("the terminal shows the focus container's exit code and OOM flag", () => {
    const end3 = scene.run.states[scene.stepEnd(3)]!;
    const last = scene.run.events[scene.stepEnd(3) - 1]!;
    const { lines } = terminalLines(end3, last);
    expect(lines[2]!.out).toBe("137 true");
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
