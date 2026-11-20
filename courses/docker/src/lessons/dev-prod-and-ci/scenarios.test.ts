import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/missionHelpers";
import { REPO, scenarios } from "./scenarios";
import { scene } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "first-dev": ["docker compose up -d", 'echo "Merhaba v2" > index.html', "curl localhost:3000"],
  "prod-image": ["docker build --target prod -t shop:1.0 .", "docker run -d --name prod -p 8080:3000 shop:1.0"],
  "two-worlds": ['echo "Merhaba v2" > index.html', "curl localhost:3000", "curl localhost:8080"],
  "ci-is-down": [`docker build --target prod -t ${REPO}:sha-3f2a1c9 .`, `docker push ${REPO}:sha-3f2a1c9`],
  deploy: ["TAG=sha-8b1d24e docker compose -f compose.yaml -f compose.prod.yaml up -d"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "first-dev": [["docker compose up --build -d", "docker compose ps", 'echo "Merhaba v2" > index.html', "curl localhost:3000"]],
  "prod-image": [["docker build -t shop:1.0 --target=prod .", "docker images", "docker run -d -p 8080:3000 --name prod shop:1.0", "curl localhost:8080"]],
  "two-worlds": [["curl localhost:8080", 'echo "Merhaba v2" > index.html', "curl localhost:8080", "curl localhost:3000"]],
  "ci-is-down": [[`docker build --target prod -t shop:prod .`, `docker tag shop:prod ${REPO}:sha-3f2a1c9`, `docker push ${REPO}:sha-3f2a1c9`]],
  deploy: [["TAG=sha-8b1d24e docker compose -f compose.yaml -f compose.prod.yaml config", "TAG=sha-8b1d24e docker compose -f compose.yaml -f compose.prod.yaml up -d", "docker compose ps"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "first-dev": ["docker compose up -d", 'echo "Merhaba v2" > index.html', "docker compose up -d --build", "curl localhost:3000"],
  "prod-image": ["docker build -t shop:1.0 .", "docker run -d --name prod -p 8080:3000 shop:1.0"],
  "two-worlds": ['echo "Merhaba v2" > index.html', "docker build --target prod -t shop:1.0 .", "docker rm -f prod", "docker run -d --name prod -p 8080:3000 shop:1.0", "curl localhost:3000", "curl localhost:8080"],
  "ci-is-down": [`docker build -t ${REPO}:sha-3f2a1c9 .`, `docker push ${REPO}:sha-3f2a1c9`],
  deploy: ["TAG=sha-8b1d24e docker compose up -d"],
};

describe("dev-prod-and-ci", () => {
  it("every lesson step runs without a Docker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = typeInto(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" && ")}`, () => {
        const r = typeInto(s.start, alt);
        expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
