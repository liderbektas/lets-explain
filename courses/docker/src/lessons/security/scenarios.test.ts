import { describe, expect, it } from "vitest";
import { findContainer, imageFor, type Host } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";
import { hasSecret } from "./SecurityPanel";

type Play = { typed: string[]; edits?: ((t: string) => string)[] };

const RESTART = ["docker rm -f api", "docker run -d --name api --env-file .env acme/api:dev"];
const DISTROLESS = `FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
COPY --from=build /app /app
CMD ["server.js"]`;

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "not-root": { typed: ["nano Dockerfile", "docker build -t acme/api:dev .", ...RESTART], edits: [(t) => t.replace("CMD", "USER node\nCMD")] },
  "secret-out": { typed: ["echo .env > .dockerignore", "docker build -t acme/api:dev .", ...RESTART] },
  "typo-base": { typed: ["nano Dockerfile", "docker build -t acme/api:dev ."], edits: [(t) => t.replace("FROM nod:22-slim", "FROM node:22-slim")] },
  "no-shell": { typed: ["nano Dockerfile", "docker build -t acme/api:dev .", ...RESTART, "docker exec api sh"], edits: [() => DISTROLESS] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "not-root": [
    {
      typed: ["nano Dockerfile", "docker build -t acme/api:dev .", "docker stop api", "docker rm api", "docker run -d --name api -e API_KEY=sk_live_51Hx_example acme/api:dev", "docker exec api whoami"],
      edits: [(t) => t.replace("COPY . .", "COPY --chown=node:node . .").replace("CMD", "USER node\nCMD")],
    },
  ],
  "secret-out": [{ typed: ["nano .dockerignore", "docker build -t acme/api:dev .", "docker rm -f api", "docker run -d --name api -e API_KEY=sk_live_51Hx_example acme/api:dev"], edits: [() => ".env\n.git\nnode_modules"] }],
  "typo-base": [{ typed: ["cat Dockerfile", "nano Dockerfile", "docker build --tag acme/api:dev ."], edits: [(t) => t.replace("nod:", "node:")] }],
  "no-shell": [{ typed: ["nano Dockerfile", "docker build -t acme/api:dev .", ...RESTART, "docker exec -it api sh"], edits: [() => DISTROLESS] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // A rebuilt image does not change the user of a container that is already running.
  "not-root": { typed: ["nano Dockerfile", "docker build -t acme/api:dev .", "docker restart api"], edits: [(t) => t.replace("CMD", "USER node\nCMD")] },
  // Deleting .env in a later layer: the COPY layer below still holds it.
  "secret-out": { typed: ["nano Dockerfile", "docker build -t acme/api:dev .", ...RESTART], edits: [(t) => t.replace("COPY . .", "COPY . .\nRUN rm .env")] },
  // Building again without fixing the name fails the same way.
  "typo-base": { typed: ["docker build -t acme/api:dev ."] },
  // USER node alone: not root, but the image still has a shell.
  "no-shell": { typed: ["nano Dockerfile", "docker build -t acme/api:dev .", ...RESTART, "docker exec api sh"], edits: [(t) => t.replace("CMD", "USER node\nCMD")] },
};

const play = (start: Host, p: Play) => typeInto(start, p.typed, [...(p.edits ?? [])]);

describe("security", () => {
  it("lesson steps only fail where the failure is the point", () => {
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      expect(errors.length, `step ${step}`).toBe(EXPECTED_ERRORS[step] ?? 0);
    });
  });

  it("the story: root by default, USER node, a leak that rm cannot undo, a clean image, no shell in distroless", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const execs = scene.run.events.flat().filter((e) => e.type === "execOutput");
    expect(execs[0]).toMatchObject({ name: "api-root", output: ["root"] });
    expect(execs[1]).toMatchObject({ name: "api-user", output: ["node"] });
    expect(hasSecret(imageFor(at(0), "acme/api:root"))).toBe(false);
    expect(hasSecret(imageFor(at(2), "acme/api:leaky"))).toBe(true);
    // Deleting the file in a later layer does not remove it from the earlier one.
    expect(hasSecret(imageFor(at(3), "acme/api:leaky2"))).toBe(true);
    expect(hasSecret(imageFor(at(4), "acme/api:clean"))).toBe(false);
    expect(findContainer(at(4), "api")!.env.API_KEY).toBeTruthy();
    const dl = imageFor(at(7), "acme/api:distroless")!;
    expect(dl.config.binaries).not.toContain("sh");
    expect(findContainer(at(7), "api-dl")).toMatchObject({ state: "running", user: "nonroot" });
    expect(execs.at(-1)).toMatchObject({ name: "api-dl", cmd: "sh", code: 127 });
  });

  it("the sandbox starts with the secret inside and api running as root", () => {
    const s = scene.sandboxStart;
    const api = findContainer(s, "api")!;
    expect(api.user).toBe("root");
    expect(hasSecret(s.images[api.image])).toBe(true);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = play(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const [i, alt] of (alternatives[s.id] ?? []).entries()) {
      it(`${s.id}: also wins another way (${i + 1})`, () => {
        expect(s.check(play(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(play(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }

  it("the start states tell the truth: root, the key readable from the image, a build that cannot pull", () => {
    expect(findContainer(scenarios[0]!.start, "api")).toMatchObject({ state: "running", user: "root" });
    expect(hasSecret(imageFor(scenarios[1]!.start, "acme/api:dev"))).toBe(true);
    expect(play(scenarios[1]!.start, { typed: ["docker run --rm acme/api:dev cat .env"] }).output).toContain("API_KEY=sk_live_51Hx_example");
    expect(play(scenarios[2]!.start, { typed: ["docker build -t acme/api:dev ."] }).output[0]).toMatch(/^ERROR: failed to solve: nod:22-slim: .*pull access denied/);
    // After the fix the key is gone from the image.
    const fixed = play(scenarios[1]!.start, solutions["secret-out"]!);
    expect(play(fixed.ctx.state, { typed: ["docker run --rm acme/api:dev cat .env"] }).output).toContain("cat: .env: No such file or directory");
    expect(play(play(scenarios[0]!.start, solutions["not-root"]!).ctx.state, { typed: ["docker exec api whoami"] }).output).toEqual(["node"]);
  });
});
