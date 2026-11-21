import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { cleanup, leaveOld, roomOnly, safeParse } from "./code";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Run = { lines: string[]; edits?: ((t: string) => string)[] };

const JOIN = '{"type":"join","room":"genel"}';
const CHAT = '{"type":"chat","text":"standup in 5"}';

const solutions: Record<string, Run> = {
  "room-only": { lines: ["nano server.js", "node server.js &", "node bots.js &", "wscat -c ws://localhost:9001", JOIN, CHAT], edits: [roomOnly] },
  "bad-json": { lines: ["nano server.js", "node server.js &", "wscat -c ws://localhost:9001 -x hello"], edits: [safeParse] },
  "switch-rooms": { lines: ["nano server.js", "node server.js &", "node bots.js &", "node switch.js"], edits: [leaveOld] },
  cleanup: { lines: ["nano server.js", "node server.js &", "node switch.js", "node switch.js"], edits: [cleanup] },
};

const alternatives: Record<string, Run[]> = {
  "room-only": [
    {
      lines: ["nano server.js", "node server.js &", "node bots.js &", "wscat -c ws://localhost:9001", JOIN, CHAT, "^C"],
      edits: [(t) => t.replace("      for (const client of wss.clients) client.send(out);", "      rooms.get(ws.room).forEach((c) => c.send(out));")],
    },
  ],
  "bad-json": [{ lines: ["nano server.js", "node server.js &", "wscat -c ws://localhost:9001", "not json at all"], edits: [safeParse] }],
};

const wrong: Record<string, Run> = {
  // The old code: Mert in #ops hears #genel.
  "room-only": { lines: ["node server.js &", "node bots.js &", "wscat -c ws://localhost:9001", JOIN, CHAT] },
  // No try/catch: the server goes down.
  "bad-json": { lines: ["node server.js &", "wscat -c ws://localhost:9001 -x hello"] },
  // The old code: #genel keeps talking to the switcher.
  "switch-rooms": { lines: ["node server.js &", "node bots.js &", "node switch.js"] },
  // Without cleanup the second run finds a ghost in #ops.
  cleanup: { lines: ["node server.js &", "node switch.js", "node switch.js"] },
};

describe("rooms", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;

  it("the story: a #genel chat reaches the browser and the phone, not the laptop; bad JSON gets an error", () => {
    expect(steps).toHaveLength(6);
    const got = (client: string) => at(2).conns.find((c) => c.client === client)!.msgs.some((m) => m.dir === "in" && m.text.includes("standup in 5"));
    expect([got("browser"), got("phone"), got("laptop")]).toEqual([true, true, false]);
    expect(at(3).conns.find((c) => c.client === "laptop")!.msgs.some((m) => m.text.includes('"type":"error"'))).toBe(true);
    expect(at(3).procs[0]!.alive).toBe(true);
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
