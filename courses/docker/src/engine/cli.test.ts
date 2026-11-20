import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { dockerShell, projectSetup } from "./cli";
import { createHost, findContainer, simulate, type DockerAction, type Host } from "./docker";
import { parseCompose, parseDockerfile, programFromSource } from "./files";

const after = (h: Host, actions: DockerAction[]) => simulate(actions, h).states.at(-1)!;
const type = (start: Host, typed: string[], edits: ((t: string) => string)[] = []) => typeLines(dockerShell, after, start, typed, edits);

const SERVER = `const express = require("express");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const app = express();
app.get("/", (req, res) => res.send("hello"));
app.listen(3000);`;

const DOCKERFILE = `FROM node:22-slim
WORKDIR /app
COPY package.json .
RUN npm ci
COPY . .
CMD ["node", "server.js"]`;

const project = after(createHost(), projectSetup({ "package.json": '{ "name": "api" }', "server.js": SERVER, Dockerfile: DOCKERFILE }));

describe("docker cli", () => {
  it("runs a detached container with a port and prints its id", () => {
    const { state, output, moves } = type(createHost(), ["docker run -d -p 8080:80 --name web nginx:1.27"]);
    expect(output[0]).toBe("Unable to find image 'nginx:1.27' locally");
    expect(output.at(-1)).toMatch(/^[0-9a-f]{64}$/);
    expect(findContainer(state, "web")?.ports).toEqual([{ host: 8080, container: 80 }]);
    expect(moves).toBe(1);
  });

  it("refuses a name that is taken, with Docker's message", () => {
    const { output, state } = type(createHost(), ["docker run -d --name web nginx:1.27", "docker run -d --name web -p 8080:80 nginx:1.27"]);
    expect(output.some((l) => l.includes('Conflict. The container name "/web" is already in use'))).toBe(true);
    expect(findContainer(state, "web")?.ports).toEqual([]);
  });

  it("lists containers and shows logs", () => {
    const { output } = type(createHost(), ["docker run -d --name web nginx:1.27", "docker ps", "docker logs web"]);
    expect(output.some((l) => l.startsWith("CONTAINER ID"))).toBe(true);
    expect(output.at(-1)).toBe("nginx: listening on port 80");
  });

  it("answers curl only on a published port", () => {
    const { output } = type(createHost(), ["docker run -d --name web nginx:1.27", "curl localhost:8080", "docker rm -f web", "docker run -d -p 8080:80 --name web nginx:1.27", "curl http://localhost:8080"]);
    expect(output).toContain("curl: (7) Failed to connect to localhost port 8080: Connection refused");
    expect(output.at(-1)).toBe("web says hello");
  });

  it("builds the project's Dockerfile and reads what the program needs from its source", () => {
    const first = type(project, ["docker build -t acme/api:1.0 .", "docker run -d --name api acme/api:1.0"]);
    expect(first.output[0]).toMatch(/^\[\+\] Building/);
    expect(findContainer(first.state, "api")?.exitCode).toBe(1);
    const second = type(first.state, ["docker build -t acme/api:1.0 ."]);
    // Every filesystem step comes from the cache; CMD is a setting, not a listed step.
    expect(second.output.filter((l) => l.includes("CACHED")).length).toBe(4);
    const fixed = type(first.state, ["docker rm api", "docker run -d --name api -e DATABASE_URL=postgres://db/shop acme/api:1.0"]);
    expect(findContainer(fixed.state, "api")?.state).toBe("running");
  });

  it("edits files with nano and echo", () => {
    const { state } = type(project, ["nano Dockerfile", 'echo "node_modules" > .dockerignore', "cat .dockerignore"], [(t) => t.replace("node:22-slim", "node:22-alpine")]);
    expect(state.hostFiles["/home/ada/project/Dockerfile"]).toContain("node:22-alpine");
    expect(state.hostFiles["/home/ada/project/.dockerignore"]).toBe("node_modules");
  });

  it("removes a one-off container with --rm", () => {
    const { state, output } = type(createHost(), ["docker run --rm hello-world"]);
    expect(output).toContain("Hello from Docker!");
    expect(Object.keys(state.containers)).toHaveLength(0);
  });

  it("brings a compose project up in dependency order", () => {
    const compose = `services:
  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: secret
    healthcheck:
      test: ["CMD", "pg_isready"]
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://db/shop
    depends_on:
      db:
        condition: service_healthy`;
    const h = after(project, projectSetup({ "compose.yaml": compose }));
    const { state, output } = type(h, ["docker compose up -d", "docker compose ps"]);
    expect(output[0]).toMatch(/^\[\+\] Running/);
    expect(findContainer(state, "project-api-1")?.state).toBe("running");
    expect(findContainer(state, "project-db-1")?.health).toBe("healthy");
    const down = type(state, ["docker compose down"]);
    expect(Object.keys(down.state.containers)).toHaveLength(0);
  });

  it("says so plainly about unknown commands and flags", () => {
    expect(type(createHost(), ["docker frob"]).output[0]).toBe("docker: 'frob' is not a docker command.");
    expect(type(createHost(), ["docker run --wat nginx"]).output[0]).toBe("unknown flag: --wat");
    expect(type(createHost(), ["kubectl get pods"]).output[0]).toBe("bash: kubectl: command not found");
  });
});

describe("project files", () => {
  it("parses a Dockerfile, shell and exec forms", () => {
    const { instructions, errors } = parseDockerfile("FROM node:22 AS build\nWORKDIR /app\nRUN npm ci\nCMD npm start\nEXPOSE 3000", {});
    expect(errors).toEqual([]);
    expect(instructions.map((i) => i.op)).toEqual(["FROM", "WORKDIR", "RUN", "CMD", "EXPOSE"]);
    expect(instructions[3]).toMatchObject({ args: ["/bin/sh", "-c", "npm start"] });
    expect(parseDockerfile("FORM node").errors[0]).toMatch(/unknown instruction: FORM/);
  });

  it("reads a program's needs from its source", () => {
    expect(programFromSource(SERVER)).toEqual({ kind: "app", listens: 3000, needsEnv: ["DATABASE_URL"] });
    expect(programFromSource('console.log("done");\nprocess.exit(2);')).toEqual({ kind: "job", output: ["done"], exitCode: 2 });
  });

  it("parses compose lists and maps", () => {
    const r = parseCompose("services:\n  web:\n    image: nginx\n    ports: [\"8080:80\"]\n    depends_on: [api]\n  api:\n    image: acme/api\nvolumes:\n  data:", {});
    expect("file" in r && r.file.services.web).toEqual({ image: "nginx", ports: ["8080:80"], depends_on: ["api"] });
    expect("file" in r && r.file.volumes).toEqual(["data"]);
  });
});
