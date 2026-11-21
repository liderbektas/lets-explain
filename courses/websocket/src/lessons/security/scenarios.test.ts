import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { checkOrigin, limitOnly, limitSize, rateLimit, requireAuth, TOKEN } from "./code";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Run = { lines: string[]; edits?: ((t: string) => string)[] };
const restart = ["pkill -f server.js", "node server.js &"];

const solutions: Record<string, Run> = {
  origin: { lines: ["nano server.js", ...restart, "wscat -c ws://localhost:9001 -o https://evil.example", "wscat -c ws://localhost:9001 -o http://localhost:8080 -x hi"], edits: [checkOrigin] },
  size: { lines: ["nano server.js", ...restart, "node flood.js"], edits: [limitSize] },
  auth: { lines: ["nano server.js", ...restart, "wscat -c ws://localhost:9001 -x hello", `wscat -c ws://localhost:9001 -x '{"type":"auth","token":"${TOKEN}"}'`], edits: [requireAuth] },
  rate: { lines: ["nano server.js", ...restart, "node spam.js"], edits: [rateLimit] },
};

const alternatives: Record<string, Run[]> = {
  origin: [
    {
      lines: ["nano server.js", ...restart, "wscat -c ws://localhost:9001 -H 'Origin: https://evil.example'", "wscat -c ws://localhost:9001 -o http://localhost:8080", "^C"],
      edits: [(t) => t.replace("const wss = new WebSocketServer({ port: 9001 });", 'const allowed = ["http://localhost:8080"];\nconst wss = new WebSocketServer({ port: 9001, verifyClient: (info, done) => done(allowed.includes(info.origin), 403) });')],
    },
  ],
};

const wrong: Record<string, Run> = {
  // Unchanged: evil.example walks in.
  origin: { lines: [...restart, "wscat -c ws://localhost:9001 -o https://evil.example", "wscat -c ws://localhost:9001 -o http://localhost:8080 -x hi"] },
  // The limit without an error listener: the 'error' it raises crashes the server.
  size: { lines: ["nano server.js", ...restart, "node flood.js"], edits: [limitOnly] },
  // Unchanged: the stranger is never closed.
  auth: { lines: [...restart, "wscat -c ws://localhost:9001 -x hello", `wscat -c ws://localhost:9001 -x '{"type":"auth","token":"${TOKEN}"}'`] },
  // Unchanged: the flood gets through.
  rate: { lines: [...restart, "node spam.js"] },
};

describe("security", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;

  it("the story: evil.example reads the reset code; the Origin check turns it away; the size limit holds", () => {
    expect(steps).toHaveLength(6);
    const evil0 = at(0).conns.find((c) => c.client === "evil")!;
    expect(evil0.msgs.some((m) => m.text.includes("4411"))).toBe(true);
    const evilTries = at(1).exchanges.filter((e) => e.client === "evil");
    expect(evilTries.at(-1)!.status).toBe(401);
    expect(at(3).conns.some((c) => c.serverCode === 1009)).toBe(true);
    expect(at(3).procs.some((p) => p.file === "server.js" && p.alive)).toBe(true);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });
    it(`${s.id}: the intended commands win in exactly par`, () => {
      const sol = solutions[s.id]!;
      const r = typeInto(s.start, sol.lines, [...(sol.edits ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });
    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.lines.join(" ; ")}`, () => {
        expect(s.check(typeInto(s.start, alt.lines, [...(alt.edits ?? [])]).ctx)).toBe(true);
      });
    }
    it(`${s.id}: a tempting wrong move does not win`, () => {
      const w = wrong[s.id]!;
      expect(s.check(typeInto(s.start, w.lines, [...(w.edits ?? [])]).ctx)).toBe(false);
    });
  }
});
