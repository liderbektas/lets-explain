import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { broadcast, onlineCount, welcome } from "./code";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Run = { lines: string[]; edits?: ((t: string) => string)[] };

const solutions: Record<string, Run> = {
  "run-it": { lines: ["node server.js &", "wscat -c ws://localhost:9001 -x hello"] },
  welcome: { lines: ["nano server.js", "pkill -f server.js", "node server.js &", "wscat -c ws://localhost:9001"], edits: [welcome] },
  broadcast: { lines: ["nano server.js", "pkill -f server.js", "node server.js &", "node bots.js &", "wscat -c ws://localhost:9001 -x hello"], edits: [broadcast] },
  "online-count": { lines: ["nano server.js", "pkill -f server.js", "node server.js &", "node bots.js &", "wscat -c ws://localhost:9001"], edits: [onlineCount] },
};

const alternatives: Record<string, Run[]> = {
  "run-it": [{ lines: ["node server.js", "wscat -c ws://localhost:9001", "hi there", "^C"] }],
  welcome: [{ lines: ["nano server.js", "kill %1", "node server.js &", "wscat -c ws://localhost:9001 -x hi"], edits: [welcome] }],
  broadcast: [
    {
      lines: ["nano server.js", "pkill -f server.js", "node server.js &", "node bots.js &", "wscat -c ws://localhost:9001", "hello all"],
      edits: [(t) => t.replace("    // For now: send the message back to whoever sent it.\n    ws.send(`echo: ${data}`);", "    wss.clients.forEach((c) => c.send(`${data}`));")],
    },
  ],
};

const wrong: Record<string, Run> = {
  // Never started: nothing to answer.
  "run-it": { lines: ["wscat -c ws://localhost:9001 -x hello"] },
  // Edited, not restarted: the old code still runs.
  welcome: { lines: ["nano server.js", "wscat -c ws://localhost:9001 -x hi"], edits: [welcome] },
  // The fix, but the bots were not brought back after the restart.
  broadcast: { lines: ["nano server.js", "pkill -f server.js", "node server.js &", "wscat -c ws://localhost:9001 -x hello"], edits: [broadcast] },
  // A count that never changes is not the count.
  "online-count": {
    lines: ["nano server.js", "pkill -f server.js", "node server.js &", "node bots.js &", "wscat -c ws://localhost:9001"],
    edits: [(t) => t.replace('  console.log("new client from", req.socket.remoteAddress);\n', '  console.log("new client from", req.socket.remoteAddress);\n  ws.send(JSON.stringify({ type: "online", count: 1 }));\n')],
  },
};

describe("first-server", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;

  it("the story: an echo for each, then a broadcast that reaches both", () => {
    expect(steps).toHaveLength(5);
    expect(at(0).conns[0]!.msgs.map((m) => m.text)).toEqual(["hello", "echo: hello"]);
    const laptop = at(2).conns.filter((c) => c.client === "laptop").at(-1)!;
    expect(laptop.msgs.some((m) => m.dir === "in" && m.text === "lunch at 12?")).toBe(true);
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
