import { describe, expect, it } from "vitest";
import { containerFiles, findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { COMPOSE_PATIENT, scenarios } from "./scenarios";
import { EXPECTED_ERRORS, ORDERS, scene, steps } from "./Scene";

type Way = { lines: string[]; edits?: ((t: string) => string)[] };

/** The reader's own edit: `restart: on-failure` under app. */
const addRestart = (policy: string) => (text: string) => text.replace("    depends_on:\n      - db", `    restart: ${policy}\n    depends_on:\n      - db`);

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Way> = {
  "too-early": { lines: ["nano compose.yaml", "docker compose up -d"], edits: [() => COMPOSE_PATIENT] },
  "ci-wait": { lines: ["docker compose up -d --wait"] },
  "recreate-keep": { lines: ["docker compose down", "docker compose up -d"] },
  "clean-slate": { lines: ["docker compose down -v", "docker compose up -d"] },
  retry: { lines: ["nano compose.yaml", "docker compose up -d", "sleep 3"], edits: [addRestart("on-failure")] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  "too-early": [{ lines: ["docker compose logs app", "nano compose.yaml", "docker compose down", "docker compose up -d --wait"], edits: [() => COMPOSE_PATIENT] }],
  "ci-wait": [{ lines: ["docker compose up --wait"] }],
  "recreate-keep": [{ lines: ["docker compose up -d --force-recreate"] }],
  "clean-slate": [{ lines: ["docker compose down --volumes && docker compose up -d --wait"] }],
  retry: [{ lines: ["nano compose.yaml", "docker compose up -d", "sleep 5", "docker compose ps"], edits: [addRestart("unless-stopped")] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  "too-early": { lines: ["docker compose up -d", "sleep 3", "docker compose up -d"] },
  "ci-wait": { lines: ["docker compose up -d", "sleep 10"] },
  "recreate-keep": { lines: ["docker compose down -v", "docker compose up -d"] },
  "clean-slate": { lines: ["docker compose down", "docker compose up -d"] },
  retry: { lines: ["sleep 3", "docker compose up -d"] },
};

describe("compose-stack", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: starting too early crashes, waiting for healthy works, the volume keeps data until down -v", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const ev = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(ev(1).some((e) => e.type === "exited" && e.name === "shop-app-1" && e.code === 1)).toBe(true);
    expect(findContainer(at(2), "shop-app-1")!.state).toBe("running");
    expect(ev(3).some((e) => e.type === "composeWaiting")).toBe(true);
    expect(ev(3).some((e) => e.type === "exited" && e.name === "shop-app-1")).toBe(false);
    const db = (step: number) => findContainer(at(step), "shop-db-1")!;
    expect(containerFiles(at(4), db(4))[ORDERS]).toBe("3 sipariş");
    expect(containerFiles(at(5), db(5))[ORDERS]).toBeUndefined();
    expect(findContainer(at(6), "shop-app-1")!.state).toBe("running");
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
      const w = wrong[s.id]!;
      expect(s.check(typeInto(s.start, w.lines, [...(w.edits ?? [])]).ctx)).toBe(false);
    });
  }
});
