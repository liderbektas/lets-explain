import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { fixLogs } from "./code";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Run = { lines: string[]; edits?: ((t: string) => string)[] };

const UNMASK = `node -e "const k = Buffer.from('37fa213d', 'hex'); const m = Buffer.from('7f9f4d5158', 'hex'); console.log(m.map((b, i) => b ^ k[i % 4]).toString())"`;

const solutions: Record<string, Run> = {
  "masks-differ": { lines: ["sudo tshark -i lo -Y websocket -O websocket &", "wscat -c ws://localhost:9001 -x hello", "wscat -c ws://localhost:9001 -x hello"] },
  unmask: { lines: [UNMASK] },
  "one-message": { lines: ["nano logs.js", "pkill -f logs.js", "node logs.js &", "wscat -c ws://localhost:9002"], edits: [fixLogs] },
  "see-fragments": { lines: ["sudo tshark -i lo -Y websocket &", "wscat -c ws://localhost:9003"] },
};

const alternatives: Record<string, Run[]> = {
  "masks-differ": [{ lines: ["sudo tshark -i lo -Y websocket -O websocket &", "wscat -c ws://localhost:9001", "hello", "hello"] }],
  unmask: [{ lines: [`node -e "const k=[0x37,0xfa,0x21,0x3d]; const m=Buffer.from('7f9f4d5158','hex'); let s=''; for (let i=0;i<m.length;i++) s+=String.fromCharCode(m[i]^k[i%4]); console.log(s)"`] }],
  "one-message": [{ lines: ["nano logs.js", "kill %2", "node logs.js &", "wscat -c ws://localhost:9002"], edits: [(t) => t.replace("ws.send(part);", "ws.send(part, { fin: part === parts[parts.length - 1] });")] }],
};

const wrong: Record<string, Run> = {
  // One frame only: nothing to compare.
  "masks-differ": { lines: ["sudo tshark -i lo -Y websocket -O websocket &", "wscat -c ws://localhost:9001 -x hello"] },
  // Turning the masked hex into bytes does not unmask it.
  unmask: { lines: ["echo 7f9f4d5158 | xxd -r -p"] },
  // Fixed on disk, still running the old code.
  "one-message": { lines: ["nano logs.js", "wscat -c ws://localhost:9002"], edits: [fixLogs] },
  // The log server sends whole messages: no continuation frames.
  "see-fragments": { lines: ["sudo tshark -i lo -Y websocket &", "wscat -c ws://localhost:9002"] },
};

describe("masking-and-fragments", () => {
  it("the story: two masks for one text, then three frames and one message", () => {
    expect(steps).toHaveLength(6);
    const s1 = scene.run.states[scene.stepEnd(1)]!;
    const outs = s1.conns[0]!.frames.filter((f) => f.dir === "out");
    expect(outs).toHaveLength(2);
    expect(outs[0]!.mask).not.toBe(outs[1]!.mask);
    const laptop = scene.run.states[scene.stepEnd(3)]!.conns.find((c) => c.client === "laptop")!;
    expect(laptop.frames.map((f) => [f.opcode, f.fin])).toEqual([
      [1, false],
      [0, false],
      [0, true],
    ]);
    expect(laptop.msgs).toHaveLength(1);
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
