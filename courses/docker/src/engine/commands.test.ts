import { describe, expect, it } from "vitest";
import { projectSetup } from "./cli";
import { createHost, findContainer } from "./docker";
import { hostAfter, typeInto } from "../lessons/shared/missionHelpers";

const machine = hostAfter([...projectSetup({ "notes.txt": "x", "keep.txt": "y" })], createHost({ pulled: ["alpine:3.20", "nginx:1.27"] }));

describe("a container's own command", () => {
  it("prints what the command prints and exits with its code", () => {
    expect(typeInto(machine, ["docker run alpine:3.20 echo hi"]).output).toEqual(["hi"]);
    expect(typeInto(machine, ["docker run --rm alpine:3.20 sh -c 'echo one && echo two'"]).output).toEqual(["one", "two"]);
    const failed = typeInto(machine, ["docker run --name job alpine:3.20 sh -c 'echo trying; exit 3'"]);
    expect(failed.output).toContain("trying");
    expect(findContainer(failed.ctx.state, "job")).toMatchObject({ state: "exited", exitCode: 3 });
  });

  it("a shell with no script and no terminal exits at once, as without -it", () => {
    expect(findContainer(typeInto(machine, ["docker run --name s alpine:3.20 sh"]).ctx.state, "s")).toMatchObject({ state: "exited", exitCode: 0 });
  });

  it("exec runs small scripts with redirects inside the container", () => {
    const r = typeInto(machine, ["docker run -d --name web nginx:1.27", "docker exec web sh -c 'echo a > /tmp/x && echo b >> /tmp/x'", "docker exec web cat /tmp/x"]);
    expect(r.output.at(-1)).toBe("a\nb");
  });

  it("ping and curl from a throwaway container read their target past the flags", () => {
    const r = typeInto(machine, ["docker network create shop", "docker run -d --name api --network shop nginx:1.27", "docker run --rm --network shop alpine:3.20 ping -c 1 api", "docker run --rm alpine:3.20 curl -s http://api"]);
    expect(r.output).toContain("PING api: 64 bytes from api");
    expect(r.output).toContain("curl: (6) Could not resolve host: api");
  });
});

describe("files in ~/project", () => {
  it("rm removes a file, and says so when it is not there", () => {
    const r = typeInto(machine, ["rm notes.txt", "ls"]);
    expect(r.output).toEqual(["keep.txt"]);
    expect(typeInto(machine, ["rm nope.txt"]).output).toEqual(["rm: cannot remove 'nope.txt': No such file or directory"]);
  });
});
