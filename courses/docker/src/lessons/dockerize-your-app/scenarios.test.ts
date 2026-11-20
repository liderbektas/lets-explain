import { describe, expect, it } from "vitest";
import { findContainer } from "../../engine/docker";
import { typeInto } from "../shared/missionHelpers";
import { DOCKERFILE_NODE_USER, DOCKERFILE_SMART, DOCKERIGNORE, scenarios } from "./scenarios";
import { scene } from "./Scene";

type Way = { lines: string[]; edits?: ((t: string) => string)[] };
const to = (text: string) => () => text;

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Way> = {
  "first-dockerfile": { lines: ["nano Dockerfile", "docker build -t shop .", "docker run -d -p 3000:3000 shop", "curl localhost:3000"], edits: [to(DOCKERFILE_SMART)] },
  "secret-in-image": { lines: ["nano .dockerignore", "docker build -t shop ."], edits: [to(DOCKERIGNORE)] },
  "slow-builds": { lines: ["nano Dockerfile", "docker build -t shop .", 'echo "Merhaba v2" > index.html', "docker build -t shop ."], edits: [to(DOCKERFILE_SMART)] },
  "ship-v2": { lines: ["docker build -t shop .", "docker rm -f shop", "docker run -d --name shop -p 3000:3000 shop", "curl localhost:3000"] },
  "not-root": { lines: ["nano Dockerfile", "docker build -t shop .", "docker rm -f shop", "docker run -d --name shop -p 3000:3000 shop"], edits: [to(DOCKERFILE_NODE_USER)] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  "first-dockerfile": [
    {
      lines: ["nano Dockerfile", "docker build -t shop:1.0 .", "docker run -d --name shop -p 3000:3000 shop:1.0", "docker ps", "curl localhost:3000"],
      edits: [to('FROM node:22-slim\nWORKDIR /app\nCOPY . .\nRUN npm ci --omit=dev\nCMD ["npm", "start"]')],
    },
  ],
  "secret-in-image": [{ lines: ["echo node_modules > .dockerignore", "echo .git >> .dockerignore", "echo .env >> .dockerignore", "docker build -t shop ."] }],
  "slow-builds": [{ lines: ['echo "Merhaba v2" > index.html', "nano Dockerfile", "docker build -t shop .", 'echo "Merhaba v3" > index.html', "docker build -t shop ."], edits: [to(DOCKERFILE_SMART)] }],
  "ship-v2": [{ lines: ["docker stop shop", "docker rm shop", "docker build -t shop .", "docker run -d -p 3000:3000 --name shop shop", "curl localhost:3000"] }],
  "not-root": [{ lines: ["nano Dockerfile", "docker build -t shop .", "docker rm -f shop && docker run -d --name shop -p 3000:3000 shop", "docker exec shop whoami"], edits: [to(DOCKERFILE_NODE_USER)] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  "first-dockerfile": { lines: ["docker run -d -p 3000:3000 node:22-slim", "curl localhost:3000"] },
  "secret-in-image": { lines: ["rm .env", "docker build -t shop ."] },
  "slow-builds": { lines: ['echo "Merhaba v2" > index.html', "docker build -t shop ."] },
  "ship-v2": { lines: ["docker restart shop", "curl localhost:3000"] },
  "not-root": { lines: ["docker rm -f shop", "docker run -d --name shop -u node -p 3000:3000 shop"] },
};

describe("dockerize-your-app", () => {
  it("every lesson step runs without a Docker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
  });

  it("the story: the recipe builds fast after a code change and runs as node", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(at(4).lastBuild!.seconds).toBeLessThan(5);
    expect(findContainer(at(7), "shop")!.state).toBe("running");
    expect(scene.run.events.slice(scene.stepStart(7), scene.stepEnd(7)).flat().some((e) => e.type === "curlResult" && e.ok)).toBe(true);
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
