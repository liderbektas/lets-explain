import { describe, expect, it } from "vitest";
import { containerFiles, findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

const app = (volumes?: string[]): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name: "app", ...(volumes ? { volumes } : {}) });
const note = (n: number): DockerAction => ({ type: "write", container: "app", path: "/data/note.txt", content: `not ${n}` });
const cat: DockerAction = { type: "exec", container: "app", cmd: "cat /data/note.txt" };
const rmf: DockerAction = { type: "rm", container: "app", force: true };

const solutions: Record<string, DockerAction[]> = {
  survivor: [app(["data:/data"]), note(1), rmf, app(["data:/data"]), cat],
  "drop-volume": [app(["data:/data"]), note(1), rmf, { type: "volumeRm", name: "data" }],
  "lost-note": [app(), note(1), rmf, app(), cat],
};

describe("volumes", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: layer data dies, a volume keeps it, a bind mount shows host edits, postgres needs a named volume", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const evs = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(evs(0).find((e) => e.type === "wrote")).toMatchObject({ where: "layer" });
    expect(evs(1).find((e) => e.type === "execOutput")).toMatchObject({ code: 1 });
    expect(evs(2).find((e) => e.type === "wrote")).toMatchObject({ where: "volume", source: "notes-data" });
    expect(evs(3).find((e) => e.type === "execOutput")).toMatchObject({ code: 0, output: ["ilk not"] });
    expect(evs(4).find((e) => e.type === "curlResult")).toMatchObject({ ok: true, body: "Merhaba v1" });
    expect(evs(5).find((e) => e.type === "curlResult")).toMatchObject({ ok: true, body: "Merhaba v2" });
    // Without -v, each new postgres starts empty; the old data sits in an orphaned anonymous volume.
    expect(findContainer(at(6), "db")!.logs.at(-1)).toContain("new, empty database");
    expect(Object.values(at(6).volumes).filter((v) => v.anonymous).length).toBe(2);
    expect(findContainer(at(7), "db")!.logs.at(-1)).toContain("existing data found");
    expect(containerFiles(at(7), findContainer(at(7), "db")!)["/var/lib/postgresql/data/PG_VERSION"]).toBe("17");
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
