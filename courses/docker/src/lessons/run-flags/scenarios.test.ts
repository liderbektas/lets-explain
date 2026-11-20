import { describe, expect, it } from "vitest";
import { findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  preview: ["docker run -d -p 8080:80 nginx:1.27"],
  "forgot-port": ["docker rm -f web", "docker run -d --name web -p 8080:80 nginx:1.27"],
  "api-down": ["docker rm api", "docker run -d --name api -e DATABASE_URL=postgres://db/shop acme/api:1.0"],
  "no-leftovers": ["docker run --rm hello-world"],
  "port-taken": ["docker run -d --name web -p 8081:80 nginx:1.27"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  preview: [["docker run --detach --publish 8080:80 --name web nginx:1.27", "curl localhost:8080"], ["docker run -dp 8080:80 nginx:1.27"]],
  "forgot-port": [["docker stop web", "docker rm web", "docker run -d -p 8080:80 --name web nginx:1.27"], ["docker rm -f web && docker run -d --name=web -p 8080:80 nginx:1.27"]],
  "api-down": [
    ["docker ps -a", "docker logs api", "docker rm api", "docker run -d --name api --env-file .env acme/api:1.0"],
    ["docker rm -f api", "docker run -d -e DATABASE_URL=postgres://db/shop --name api acme/api:1.0"],
  ],
  "no-leftovers": [["docker run --name check hello-world", "docker rm check"]],
  "port-taken": [["docker run -d -p 8081:80 --name web nginx:1.27", "curl localhost:8081"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  preview: ["docker run -d -p 80:8080 nginx:1.27"],
  "forgot-port": ["docker run -d --name web -p 8080:80 nginx:1.27"],
  "api-down": ["docker start api"],
  "no-leftovers": ["docker run hello-world"],
  "port-taken": ["docker run -d --name web -p 8080:80 nginx:1.27"],
};

describe("run-flags", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: hello exits 0, no port means no answer, -p answers, the name clash, the env var", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(findContainer(at(0), "hello")).toMatchObject({ state: "exited", exitCode: 0 });
    expect(findContainer(at(1), "web")!.state).toBe("running");
    const curls = scene.run.events.flat().filter((e) => e.type === "curlResult");
    expect(curls[0]).toMatchObject({ port: 80, ok: false });
    expect(curls[1]).toMatchObject({ port: 8080, ok: true });
    const err = scene.run.events.slice(scene.stepStart(4), scene.stepEnd(4)).flat().find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toContain("is already in use");
    expect(scene.run.events.slice(scene.stepStart(5), scene.stepEnd(5)).flat().some((e) => e.type === "exited" && e.code === 1)).toBe(true);
    expect(findContainer(at(5), "api")!.state).toBe("running");
    expect(findContainer(at(6), "once")).toBeUndefined();
    expect(at(7).volumes.site!.files["index.html"]).toBe("Merhaba!");
  });

  it("the logs say why the API stopped", () => {
    const s = scenarios.find((x) => x.id === "api-down")!;
    expect(typeInto(s.start, ["docker logs api"]).output).toContain("Error: environment variable DATABASE_URL is not set");
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = typeInto(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" && ")}`, () => {
        expect(s.check(typeInto(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
