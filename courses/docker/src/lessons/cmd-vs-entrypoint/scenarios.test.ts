import { describe, expect, it } from "vitest";
import { apply, findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { commandLine, printed, runLineOf, runOf, BUILDS } from "./model";
import { partsOf } from "./ProcessCard";
import { printedRuns, scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, START, steps } from "./Scene";

type Play = { typed: string[]; edits?: ((t: string) => string)[] };

const GREETER = 'FROM alpine:3.20\nENTRYPOINT ["echo", "Merhaba"]\nCMD ["dünya"]';

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "hello-ada": { typed: ["docker run acme/greet:ep Ada"] },
  "exit-127": { typed: ["docker run acme/greet:cmd echo Merhaba Ada"] },
  "look-inside": { typed: ["docker run --entrypoint ls acme/greet:ep /"] },
  "own-greeter": { typed: ["nano Dockerfile", "docker build -t greet .", "docker run greet", "docker run greet Ada"], edits: [() => GREETER] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "hello-ada": [{ typed: ["docker run --rm acme/greet:ep Ada"] }, { typed: ["docker run acme/greet:cmd echo Merhaba Ada"] }],
  "exit-127": [{ typed: ["docker ps -a", "docker run --rm acme/greet:cmd echo Merhaba Ada"] }, { typed: ["docker run --entrypoint echo acme/greet:cmd Merhaba Ada"] }],
  "look-inside": [{ typed: ["docker run --rm --entrypoint ls acme/greet:ep /"] }],
  "own-greeter": [
    { typed: ["nano Dockerfile", "docker build -t greet .", "docker run --rm greet Ada", "docker run --rm greet"], edits: [() => 'FROM alpine:3.20\nENTRYPOINT ["echo","Merhaba"]\nCMD ["dünya"]'] },
  ],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // No ENTRYPOINT here: "Ada" is taken as the program, exit 127.
  "hello-ada": { typed: ["docker run acme/greet:cmd Ada"] },
  // The other image prints it, but the scenario is about this one.
  "exit-127": { typed: ["docker run acme/greet:ep Ada"] },
  // The words go to echo: it prints "Merhaba ls /".
  "look-inside": { typed: ["docker run acme/greet:ep ls /"] },
  // Everything in CMD: `docker run greet Ada` replaces it all and fails with 127.
  "own-greeter": { typed: ["nano Dockerfile", "docker build -t greet .", "docker run greet", "docker run greet Ada"], edits: [() => 'FROM alpine:3.20\nCMD ["echo", "Merhaba", "dünya"]'] },
};

const play = (p: Play, start = START) => typeInto(start, p.typed, [...(p.edits ?? [])]);

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

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = play(solutions[s.id]!, s.start);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const [i, alt] of (alternatives[s.id] ?? []).entries()) {
      it(`${s.id}: also wins another way (${i + 1})`, () => {
        expect(s.check(play(alt, s.start).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(play(wrong[s.id]!, s.start).ctx)).toBe(false);
    });
  }

  it("the terminal prints what each run printed, and 127 for a missing program", () => {
    expect(play({ typed: ["docker run acme/greet:ep Ada"] }).output).toContain("Merhaba Ada");
    expect(play({ typed: ["docker run acme/greet:cmd"] }).output).toContain("Merhaba");
    expect(play({ typed: ["docker run acme/greet:ep ls /"] }).output).toContain("Merhaba ls /");
    expect(play({ typed: ["docker run acme/greet:cmd Ada"] }).output.join("\n")).toContain('exec: "Ada": executable file not found in $PATH');
    const own = play(solutions["own-greeter"]!);
    expect(printedRuns(own.ctx).map((r) => r.lines.join(" "))).toEqual(["Merhaba dünya", "Merhaba Ada"]);
  });

  it("the card reads an image the reader built: its Dockerfile lines and where each word came from", () => {
    const own = play({ typed: ["nano Dockerfile", "docker build -t greet .", "docker run --name g greet Ada"], edits: [() => GREETER] });
    const c = findContainer(own.ctx.state, "g")!;
    expect(runLineOf(c, own.ctx.state)).toBe("docker run greet Ada");
    expect(partsOf(c, own.ctx.state).map((p) => `${p.origin}:${p.words.join(" ")}`)).toEqual(["entrypoint:echo Merhaba", "typed:Ada"]);
  });

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

describe("cmd-vs-entrypoint: where PID 1's words come from", () => {
  let h = START;
  for (const b of BUILDS) h = apply(h, b).state;
  const parts = (name: string, ref: string, args: string[] = [], ep?: string) => {
    const c = findContainer(apply(h, runOf(name, ref, args, ep)).state, name)!;
    return partsOf(c).map((p) => `${p.origin}:${p.words.join(" ")}`);
  };

  it("CMD alone, or replaced by typed words", () => {
    expect(parts("a", "acme/greet:cmd")).toEqual(["cmd:echo Merhaba"]);
    expect(parts("b", "acme/greet:cmd", ["ls"])).toEqual(["typed:ls"]);
  });

  it("ENTRYPOINT stays first; typed words replace CMD after it", () => {
    expect(parts("c", "acme/greet:ep")).toEqual(["entrypoint:echo Merhaba", "cmd:dünya"]);
    expect(parts("d", "acme/greet:ep", ["Ada"])).toEqual(["entrypoint:echo Merhaba", "typed:Ada"]);
  });

  it("--entrypoint replaces ENTRYPOINT and drops CMD: everything was typed", () => {
    expect(parts("e", "acme/greet:ep", [], "ls")).toEqual(["typed:ls"]);
  });
});
