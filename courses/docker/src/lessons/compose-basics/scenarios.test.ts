import { describe, expect, it } from "vitest";
import { findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { COMPOSE, scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

/** Adds db's named volume to the file the way a reader would in nano. */
const addVolume = (text: string) =>
  text.replace("      POSTGRES_PASSWORD: ${DB_PASSWORD}\n", "      POSTGRES_PASSWORD: ${DB_PASSWORD}\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n") + "\nvolumes:\n  pgdata:\n";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }> = {
  "first-day": { lines: ["docker compose up -d", "curl localhost:8080"] },
  "missing-env": { lines: ["echo DATABASE_URL=postgres://app:s3cret@db:5432/shop > .env", "docker compose up -d"] },
  "end-of-day": { lines: ["docker compose down"] },
  "data-vanishes": { lines: ["nano compose.yaml", "docker compose up -d"], edits: [addVolume] },
  "find-db": { lines: ["docker compose exec web ping db"] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }[]> = {
  "first-day": [{ lines: ["cat compose.yaml", "docker compose up --detach", "docker compose ps", "curl localhost:8080"] }],
  "missing-env": [
    { lines: ["docker compose logs api", "nano .env", "docker compose up -d"], edits: [() => "DATABASE_URL=postgres://app:s3cret@db:5432/shop\nDB_PASSWORD=s3cret\n"] },
    { lines: ["DATABASE_URL=postgres://app:s3cret@db:5432/shop docker compose up -d"] },
  ],
  "end-of-day": [{ lines: ["docker compose stop"] }],
  "data-vanishes": [{ lines: ["nano compose.yaml", "docker compose down", "docker compose up -d"], edits: [addVolume] }],
  "find-db": [{ lines: ["docker compose ps", "docker exec shop-web-1 ping db"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "first-day": ["docker run -d -p 8080:80 nginx:1.27", "curl localhost:8080"],
  "missing-env": ["docker compose restart api"],
  "end-of-day": ["docker compose down -v"],
  "data-vanishes": ["docker compose down", "docker compose up -d"],
  "find-db": ["ping db"],
};

describe("compose-basics", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: one service, a project network, .env fills the api, the volume outlives down", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(findContainer(at(1), "shop-web-1")!.state).toBe("running");
    expect(at(1).networks.shop_default).toBeDefined();
    expect(findContainer(at(2), "shop-api-1")!.state).toBe("exited");
    expect(findContainer(at(3), "shop-api-1")!.state).toBe("running");
    expect(at(6).volumes.shop_pgdata).toBeDefined();
    expect(scene.run.events.slice(scene.stepStart(7), scene.stepEnd(7)).flat().some((e) => e.type === "log" && e.line.includes("existing data found"))).toBe(true);
  });

  it("the start files are the ones the lesson teaches", () => {
    expect(COMPOSE).toContain("pgdata:/var/lib/postgresql/data");
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const sol = solutions[s.id]!;
      const r = typeInto(s.start, sol.lines, [...(sol.edits ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.lines.join(" && ")}`, () => {
        const r = typeInto(s.start, alt.lines, [...(alt.edits ?? [])]);
        expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
