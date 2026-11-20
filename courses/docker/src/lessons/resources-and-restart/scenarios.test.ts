import { describe, expect, it } from "vitest";
import { findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarioSuite } from "../shared/scenarioSuite";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

describe("resources-and-restart", () => {
  it("every lesson step runs without a Docker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(10);
  });

  it("the story: limits, OOM at start and under load, CPU limit, restart policies", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(findContainer(at(0), "api")).toMatchObject({ state: "running", memoryLimit: undefined });
    expect(findContainer(at(1), "api-lim")).toMatchObject({ state: "running", memoryLimit: 256 });
    expect(findContainer(at(2), "api-small")).toMatchObject({ exitCode: 137, oomKilled: true });
    expect(findContainer(at(3), "api-lim")).toMatchObject({ exitCode: 137, oomKilled: true });
    expect(findContainer(at(4), "api-cpu")).toMatchObject({ state: "running", cpus: 0.5 });
    // No policy: a crash stays a crash.
    expect(findContainer(at(5), "flaky")).toMatchObject({ state: "exited", exitCode: 1, restarts: 0 });
    // on-failure: retries the failing one, leaves the successful one alone.
    expect(findContainer(at(6), "flaky2")!.restarts).toBe(3);
    expect(findContainer(at(6), "backup")).toMatchObject({ exitCode: 0, restarts: 0 });
    // A daemon restart brings back `always` even after a manual stop, not `unless-stopped`.
    expect(findContainer(at(7), "web-a")!.state).toBe("running");
    expect(findContainer(at(7), "web-b")!.state).toBe("exited");
  });

  it("the terminal shows the OOM kill and the restarts", () => {
    const oom = scenarios.find((x) => x.id === "oom-at-start")!;
    expect(typeInto(oom.start, ["docker inspect -f '{{.State.OOMKilled}}' api"]).output).toEqual(["true"]);
    const heal = scenarios.find((x) => x.id === "self-heal")!;
    expect(findContainer(typeInto(heal.start, ["docker run -d --name flaky acme/flaky:1.0", "sleep 3"]).ctx.state, "flaky")!.restarts).toBe(0);
  });

  scenarioSuite(scenarios, {
    solutions: {
      "oom-at-start": ["docker rm api", "docker run -d --name api --memory 256m acme/api:2.0"],
      "self-heal": ["docker run -d --name flaky --restart on-failure acme/flaky:1.0", "sleep 3"],
      "backup-loop": ["docker rm -f backup", "docker run -d --name backup --restart on-failure acme/backup:1.0"],
      "maintenance-mode": ["docker run -d --name web --restart unless-stopped nginx:1.27", "docker stop web", "sudo systemctl restart docker"],
    },
    alternatives: {
      "oom-at-start": [["docker ps -a", "docker logs api", "docker rm api", "docker run -d -m 256m --name api acme/api:2.0", "docker stats --no-stream"]],
      "self-heal": [["docker run -d --restart=on-failure --name flaky acme/flaky:1.0", "sleep 1", "sleep 1", "docker ps -a"]],
      "backup-loop": [["docker stop backup", "docker rm backup", "docker run -d --restart on-failure --name backup acme/backup:1.0", "sleep 2"]],
      "maintenance-mode": [["docker run -d --restart unless-stopped --name web nginx:1.27", "docker stop web", "systemctl restart docker", "docker ps -a"]],
    },
    wrong: {
      "oom-at-start": ["docker start api"],
      "self-heal": ["docker run -d --name flaky acme/flaky:1.0", "sleep 3"],
      "backup-loop": ["docker rm -f backup", "docker run -d --name backup --restart always acme/backup:1.0", "sleep 2"],
      "maintenance-mode": ["docker run -d --name web --restart always nginx:1.27", "docker stop web", "sudo systemctl restart docker"],
    },
  });
});
