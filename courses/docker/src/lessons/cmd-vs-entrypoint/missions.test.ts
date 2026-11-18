import { describe, expect, it } from "vitest";
import { apply, findContainer, type DockerAction } from "../../engine/docker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { commandLine, printed, runLineOf } from "./model";
import { EXPECTED_ERRORS, sandboxRun, scene, START, steps } from "./Scene";

const solutions: Record<string, DockerAction[]> = {
  "hello-ada": [sandboxRun([], "acme/greet:ep", ["Ada"])],
  "fix-127": (() => {
    const first = sandboxRun([], "acme/greet:cmd", ["Ada"]);
    return [first, sandboxRun([first], "acme/greet:cmd")];
  })(),
  "three-greetings": (() => {
    const a = sandboxRun([], "acme/greet:cmd");
    const b = sandboxRun([a], "acme/greet:ep");
    return [a, b, sandboxRun([a, b], "acme/greet:ep", ["Ada"])];
  })(),
};

describe("cmd-vs-entrypoint", () => {
  it("works out the command line the way Docker does", () => {
    expect(commandLine("acme/greet:cmd")).toEqual(["echo", "Merhaba"]);
    expect(commandLine("acme/greet:cmd", ["Ada"])).toEqual(["Ada"]);
    expect(commandLine("acme/greet:ep")).toEqual(["echo", "Merhaba", "dünya"]);
    expect(commandLine("acme/greet:ep", ["Ada"])).toEqual(["echo", "Merhaba", "Ada"]);
    expect(commandLine("acme/greet:ep", ["/"], "ls")).toEqual(["ls", "/"]);
  });

  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: outputs, 127 for a replaced CMD and a typo, the run line read back, shell form killed with 137", () => {
    const end = scene.run.states.at(-1)!;
    const c = (n: string) => findContainer(end, n)!;
    expect(printed(c("g1"))).toEqual(["Merhaba"]);
    expect(c("g2").exitCode).toBe(127);
    expect(printed(c("g3"))).toEqual(["Selam"]);
    expect(printed(c("g4"))).toEqual(["Merhaba dünya"]);
    expect(printed(c("g5"))).toEqual(["Merhaba Ada"]);
    expect(c("g6").exitCode).toBe(0);
    expect(c("exec").exitCode).toBe(0);
    expect(c("shell").exitCode).toBe(137);
    expect(c("g7").exitCode).toBe(127);
    expect(runLineOf(c("g2"))).toBe("docker run acme/greet:cmd Ada");
    expect(runLineOf(c("g5"))).toBe("docker run acme/greet:ep Ada");
    expect(runLineOf(c("g6"))).toBe("docker run --entrypoint ls acme/greet:ep /");
    expect(runLineOf(c("g4"))).toBe("docker run acme/greet:ep");
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

  // `run` keeps the image's ENTRYPOINT when only arguments are given, and honours `entrypoint`.
  it("the engine keeps ENTRYPOINT when cmd only replaces CMD", () => {
    const r = apply(START, { type: "run", image: "acme/greet:ep", name: "x", cmd: ["Ada"] });
    expect(findContainer(r.state, "x")!.cmd).toEqual(["echo", "Merhaba", "Ada"]);
  });

  it("the engine honours the entrypoint run option", () => {
    const r = apply(START, { type: "run", image: "acme/greet:ep", name: "y", entrypoint: ["ls"], cmd: ["/"] });
    expect(findContainer(r.state, "y")!.cmd).toEqual(["ls", "/"]);
  });

  // Unnamed containers always get a free random name.
  it("the engine can start more than five unnamed containers", () => {
    let h = START;
    for (let i = 0; i < 6; i++) h = apply(h, { type: "run", image: "acme/greet:cmd" }).state;
    expect(Object.keys(h.containers)).toHaveLength(6);
  });
});
