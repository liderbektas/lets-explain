import { describe, expect, it } from "vitest";
import { findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarioSuite } from "../shared/scenarioSuite";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps, terminalLines } from "./Scene";

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

  it("the terminal gives the clues: the missing command, EACCES, the taken port and the OOM kill", () => {
    const at = (id: string) => scenarios.find((x) => x.id === id)!.start;
    expect(typeInto(at("exit-127"), ["docker logs proxy"]).output.join("\n")).toContain("ngnix");
    expect(typeInto(at("no-root"), ["docker logs uploader"]).output.join("\n")).toContain("EACCES");
    expect(typeInto(at("never-started"), ["docker start site2"]).output.join("\n")).toContain("port is already allocated");
    expect(typeInto(at("exit-137"), ["docker inspect -f '{{.State.OOMKilled}}' report"]).output).toEqual(["true"]);
  });

  scenarioSuite(scenarios, {
    solutions: {
      "exit-127": ["docker rm proxy", "docker run -d --name proxy nginx:1.27"],
      "no-root": ["docker rm uploader", "docker run -d --name uploader acme/uploader:1.1"],
      "never-started": ["docker rm site2", "docker run -d --name site2 -p 8081:80 nginx:1.27"],
      "exit-137": ["docker rm report", "docker run -d --name report --memory 512m acme/report:1.0"],
    },
    alternatives: {
      "exit-127": [["docker ps -a", "docker logs proxy", "docker rm proxy && docker run -d --name proxy nginx:1.27"]],
      "no-root": [["docker logs uploader", "docker rm -f uploader", "docker run -d --name uploader --user node acme/uploader:1.1"]],
      "never-started": [["docker ps -a", "docker rm -f site2", "docker run -d -p 8081:80 --name site2 nginx:1.27", "curl localhost:8081"]],
      "exit-137": [["docker inspect -f '{{.State.OOMKilled}}' report", "docker rm report", "docker run -d -m 512m --name report acme/report:1.0"]],
    },
    wrong: {
      "exit-127": ["docker start proxy"],
      "no-root": ["docker rm uploader", "docker run -d --name uploader --user root acme/uploader:1.0"],
      "never-started": ["docker start site2"],
      "exit-137": ["docker rm report", "docker run -d --name report acme/report:1.0"],
    },
  });
});
