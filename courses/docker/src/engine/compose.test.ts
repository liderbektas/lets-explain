import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { dockerShell, projectSetup } from "./cli";
import { createHost, findContainer, simulate, type DockerAction, type Host } from "./docker";

const after = (h: Host, actions: DockerAction[]) => simulate(actions, h).states.at(-1)!;
const type = (h: Host, lines: string[], edits: ((t: string) => string)[] = []) => typeLines(dockerShell, after, h, lines, edits);
const project = (files: Record<string, string>) => after(createHost(), projectSetup(files));

const WEB = `name: shop
services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"
`;

describe("docker compose", () => {
  it("names the project from `name:` and leaves an unchanged service running", () => {
    const up = type(project({ "compose.yaml": WEB }), ["docker compose up -d"]);
    const web = findContainer(up.state, "shop-web-1")!;
    expect(web.state).toBe("running");
    const again = type(up.state, ["docker compose up -d"]);
    expect(findContainer(again.state, "shop-web-1")!.id).toBe(web.id);
    expect(again.output).toContain(" ✔ Container shop-web-1  Running");
  });

  it("recreates a service whose settings changed", () => {
    const up = type(project({ "compose.yaml": WEB }), ["docker compose up -d"]).state;
    const edited = type(up, ["nano compose.yaml", "docker compose up -d"], [(t) => t.replace("8080:80", "9090:80")]);
    expect(edited.output).toContain(" ✔ Container shop-web-1  Recreated");
    expect(findContainer(edited.state, "shop-web-1")!.ports).toEqual([{ host: 9090, container: 80 }]);
  });

  it("starts profile services only when asked, reads env_file, merges -f files", () => {
    const files = {
      "compose.yaml": `name: shop\nservices:\n  web:\n    image: nginx:1.27\n  debug:\n    image: alpine:3.20\n    profiles: ["debug"]\n    env_file: tools.env\n`,
      "tools.env": "LEVEL=trace",
      "compose.prod.yaml": `services:\n  web:\n    restart: always\n`,
    };
    const plain = type(project(files), ["docker compose up -d"]).state;
    expect(findContainer(plain, "shop-debug-1")).toBeUndefined();
    const withProfile = type(project(files), ["docker compose --profile debug up -d"]).state;
    expect(findContainer(withProfile, "shop-debug-1")!.env.LEVEL).toBe("trace");
    const prod = type(project(files), ["docker compose -f compose.yaml -f compose.prod.yaml up -d"]).state;
    expect(findContainer(prod, "shop-web-1")!.restart).toBe("always");
  });

  it("fills variables from .env and the command line, and warns about unset ones", () => {
    const files = { "compose.yaml": `name: shop\nservices:\n  web:\n    image: nginx:\${TAG:-1.27}\n    environment:\n      GREETING: \${GREETING}\n` };
    const r = type(project(files), ["docker compose config"]);
    expect(r.output[0]).toBe('WARN[0000] The "GREETING" variable is not set. Defaulting to a blank string.');
    expect(r.output).toContain("    image: nginx:1.27");
    expect(type(project({ ...files, ".env": "GREETING=hi" }), ["TAG=1.27 docker compose config"]).output).toContain("      GREETING: hi");
  });

  it("runs a command in a service with exec, and waits for health with --wait", () => {
    const files = { "compose.yaml": `name: shop\nservices:\n  web:\n    image: nginx:1.27\n  db:\n    image: postgres:17\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready"]\n` };
    const up = type(project(files), ["docker compose up -d --wait"]);
    expect(findContainer(up.state, "shop-db-1")!.health).toBe("healthy");
    const ping = type(up.state, ["docker compose exec web ping db"]);
    expect(ping.output.join("\n")).toMatch(/bytes from|PING/);
    expect(type(up.state, ["docker compose exec cache ping db"]).output[0]).toBe('service "cache" is not running');
  });
});

describe("registry login", () => {
  const built = after(createHost(), [{ type: "pull", ref: "nginx:1.27" }, { type: "tag", source: "nginx:1.27", target: "ghcr.io/ada/web:1.0" }]);

  it("refuses a push until docker login, then pushes", () => {
    expect(type(built, ["docker push ghcr.io/ada/web:1.0"]).output.join("\n")).toContain("unauthorized: unauthenticated");
    const r = type(built, ["echo $GITHUB_TOKEN | docker login ghcr.io -u ada --password-stdin", "docker push ghcr.io/ada/web:1.0"]);
    expect(r.output[0]).toBe("Login Succeeded");
    expect(r.state.registry.tags["ghcr.io/ada/web:1.0"]).toBeDefined();
  });

  it("can't answer a password prompt, and says how to pipe the token in", () => {
    expect(type(built, ["docker login ghcr.io"]).output.join("\n")).toContain("--password-stdin");
    expect(type(built, ["docker login ghcr.io -u ada --password-stdin"]).output[0]).toBe("Error: Cannot perform an interactive login from a non TTY device");
  });

  it("logs out", () => {
    const r = type(built, ["echo t | docker login ghcr.io -u ada --password-stdin", "docker logout ghcr.io", "docker push ghcr.io/ada/web:1.0"]);
    expect(r.output).toContain("Removing login credentials for ghcr.io");
    expect(r.output.join("\n")).toContain("unauthorized");
  });
});
