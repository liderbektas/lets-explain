import { describe, expect, it } from "vitest";
import { containerFiles, findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarioSuite } from "../shared/scenarioSuite";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

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

  it("the terminal shows the bind mount following edits, and the volume in use", () => {
    const at = (id: string) => scenarios.find((x) => x.id === id)!.start;
    expect(typeInto(at("live-site"), ["docker run -d --name web -p 8080:80 -v ./site:/usr/share/nginx/html nginx:1.27", "curl localhost:8080", "echo v2 > site/index.html", "curl localhost:8080"]).output.slice(1)).toEqual(["Merhaba v1", "v2"]);
    expect(typeInto(at("volume-in-use"), ["docker volume rm scratch"]).output.join("\n")).toContain("volume is in use");
  });

  scenarioSuite(scenarios, {
    solutions: {
      "upgrade-app": ["docker rm -f app", "docker run -d --name app -v notes-data:/data nginx:1.27"],
      "db-upgrade": [
        "docker run -d --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:17",
        "docker rm -f db",
        "docker run -d --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:17",
      ],
      "live-site": ["docker run -d --name web -p 8080:80 -v ./site:/usr/share/nginx/html nginx:1.27", "echo 'Merhaba v2' > site/index.html", "curl localhost:8080"],
      "volume-in-use": ["docker rm tester", "docker volume rm scratch"],
      "anonymous-pile": ["docker volume prune -f"],
    },
    alternatives: {
      "upgrade-app": [["docker stop app", "docker rm app", "docker run -d -v notes-data:/data --name app nginx:1.27", "docker exec app cat /data/notes.txt"]],
      "db-upgrade": [
        [
          "docker volume create pgdata",
          "docker run -d --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:17",
          "docker stop db",
          "docker rm db",
          "docker run -d --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:17",
          "docker logs db",
        ],
      ],
      "live-site": [["docker run -d -v ./site:/usr/share/nginx/html -p 8080:80 --name web nginx:1.27", "curl localhost:8080", "echo yeni >> site/index.html", "curl localhost:8080"]],
      "volume-in-use": [["docker ps -a", "docker rm tester && docker volume rm scratch"]],
      "anonymous-pile": [["docker volume ls", "docker volume prune --force"]],
    },
    edits: {},
    wrong: {
      "upgrade-app": ["docker rm -f app", "docker run -d --name app nginx:1.27"],
      "db-upgrade": ["docker run -d --name db -e POSTGRES_PASSWORD=secret postgres:17", "docker rm -f db", "docker run -d --name db -e POSTGRES_PASSWORD=secret postgres:17"],
      "live-site": ["docker run -d --name web -p 8080:80 nginx:1.27", "echo 'Merhaba v2' > site/index.html", "curl localhost:8080"],
      "volume-in-use": ["docker volume rm scratch"],
      "anonymous-pile": ["docker volume prune -a -f"],
    },
  });
});
