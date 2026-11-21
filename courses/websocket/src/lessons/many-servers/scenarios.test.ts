import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { fixDouble, withRedis } from "./code";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Run = { lines: string[]; edits?: ((t: string) => string)[] };

const restart = ["pkill -f server.js", "PORT=8082 node server.js &", "PORT=8083 node server.js &", "node bots.js &", "wscat -c ws://localhost:8082 -x hello"];

const solutions: Record<string, Run> = {
  across: { lines: ["nano server.js", ...restart], edits: [withRedis] },
  twice: { lines: ["nano server.js", ...restart], edits: [fixDouble] },
  "third-copy": { lines: ["PORT=8084 node server.js &", "PORT=8084 node listen.js"] },
  announce: { lines: ['redis-cli PUBLISH chat "maintenance at 22:00"'] },
};

const alternatives: Record<string, Run[]> = {
  announce: [{ lines: ["redis-cli PING", "redis-cli PUBLISH chat 'Maintenance tonight'"] }],
};

const wrong: Record<string, Run> = {
  // Restarting the copies changes nothing: still two separate chats.
  across: { lines: restart },
  // Unchanged: Ayşe still gets it twice.
  twice: { lines: restart },
  // Listening on an old copy proves nothing about the new one.
  "third-copy": { lines: ["PORT=8083 node listen.js"] },
  // A channel nobody subscribes to: Redis answers (integer) 0.
  announce: { lines: ['redis-cli PUBLISH announcements "maintenance at 22:00"'] },
};

describe("many-servers", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
  const got = (step: number, client: string) => at(step).conns.filter((c) => c.client === client).some((c) => c.msgs.some((m) => m.dir === "in" && m.text === "lunch at 12?"));

  it("the story: the other copy hears nothing; with Redis it does", () => {
    expect(steps).toHaveLength(5);
    expect([got(0, "laptop"), got(0, "phone")]).toEqual([true, false]);
    expect(got(2, "phone")).toBe(true);
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
