import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { addShutdown, biggerLimit, closeCleanly, kickBadJson } from "./code";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Run = { lines: string[]; edits?: ((t: string) => string)[] };

const solutions: Record<string, Run> = {
  "graceful-deploy": { lines: ["nano server.js", "node server.js &", "node watch.js &", "pkill -f server.js"], edits: [addShutdown] },
  "kick-1008": { lines: ["nano server.js", "pkill -f server.js", "node server.js &", "wscat -c ws://localhost:9001 -x hello"], edits: [kickBadJson] },
  "clean-exit": { lines: ["nano report.js", "node report.js"], edits: [closeCleanly] },
  "too-big": { lines: ["nano server.js", "pkill -f server.js", "node server.js &", "node upload.js"], edits: [biggerLimit] },
};

const alternatives: Record<string, Run[]> = {
  "graceful-deploy": [{ lines: ["nano server.js", "node server.js &", "node watch.js &", "kill %1"], edits: [addShutdown] }],
  "kick-1008": [{ lines: ["nano server.js", "kill %1", "node server.js &", "wscat -c ws://localhost:9001", "not json"], edits: [kickBadJson] }],
  "clean-exit": [{ lines: ["nano report.js", "node report.js"], edits: [(t) => t.replace("  process.exit(0);", "  ws.close();").replace('console.log("report sent");', 'console.log("report sent");\n  ws.on("close", () => process.exit(0));').replace("ws.close();", "ws.close(1000);")] }],
  "too-big": [{ lines: ["nano server.js", "pkill -f server.js", "node server.js &", "node upload.js"], edits: [(t) => t.replace("maxPayload: 1024 * 1024", "maxPayload: 10 * 1024 * 1024")] }],
};

const wrong: Record<string, Run> = {
  // Without a handler SIGTERM just ends it: 1006.
  "graceful-deploy": { lines: ["node server.js &", "node watch.js &", "pkill -f server.js"] },
  // Closing with a code the browser would also read as normal hides the reason.
  "kick-1008": { lines: ["nano server.js", "pkill -f server.js", "node server.js &", "wscat -c ws://localhost:9001 -x hello"], edits: [(t) => t.replace("      return; // not JSON: ignore it", "      return ws.close(1000);")] },
  // Running it as it is: the server logs 1006 again.
  "clean-exit": { lines: ["node report.js"] },
  // Restarting without raising the limit: 1009 again.
  "too-big": { lines: ["pkill -f server.js", "node server.js &", "node upload.js"] },
};

describe("closing", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;

  it("the story: 1000, 1005, a half-open phone, and 1001 on a deploy", () => {
    expect(steps).toHaveLength(6);
    const by = (s: number, client: string) => at(s).conns.find((c) => c.client === client)!;
    expect([by(0, "browser").closeCode, by(0, "browser").serverCode]).toEqual([1000, 1000]);
    expect([by(1, "laptop").closeCode, by(1, "laptop").serverCode]).toEqual([1005, 1005]);
    expect(by(2, "phone").serverClosedAt).toBeNull();
    expect(by(3, "tablet").closeCode).toBe(1001);
    expect(by(3, "tablet").closeReason).toBe("server restarting");
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
