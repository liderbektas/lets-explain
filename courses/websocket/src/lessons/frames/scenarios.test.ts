import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

const toBinary = (t: string) => t.replace("ws.send(JSON.stringify(reading));", "ws.send(Buffer.from([0x00, 0xd7]));");

const solutions: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }> = {
  "watch-a-frame": { lines: ["sudo tshark -i lo -Y websocket -O websocket &", "wscat -c ws://localhost:9001 -x merhaba"] },
  fixture: { lines: ["printf '\\x81\\x02hi' > hi.bin"] },
  "long-header": { lines: ["printf '\\x81\\x7e\\x01\\x2c' > head.bin"] },
  "binary-reading": { lines: ["nano sensor.js", "node sensor.js"], edits: [toBinary] },
};

const alternatives: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }[]> = {
  "watch-a-frame": [{ lines: ["sudo tshark -i lo -Y websocket &", "wscat -c ws://localhost:9001", "merhaba", "^C", "kill %2"] }],
  fixture: [{ lines: ["echo -n 8102 | xxd -r -p > hi.bin", "printf 'hi' >> hi.bin", "xxd hi.bin"] }, { lines: ["echo -ne '\\x81\\x02hi' > hi.bin"] }],
  "long-header": [{ lines: ["echo 817e012c | xxd -r -p > head.bin"] }],
  "binary-reading": [{ lines: ["nano sensor.js", "node sensor.js"], edits: [(t) => t.replace("ws.send(JSON.stringify(reading));", "ws.send(new Uint8Array([0, 215]));")] }],
};

const wrong: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }> = {
  // Sent with nothing listening: no capture.
  "watch-a-frame": { lines: ["wscat -c ws://localhost:9001 -x merhaba"] },
  // echo adds a newline after the frame.
  fixture: { lines: ["echo -e '\\x81\\x02hi' > hi.bin"] },
  // Little-endian: the bytes of 300 the wrong way round.
  "long-header": { lines: ["printf '\\x81\\x7e\\x2c\\x01' > head.bin"] },
  // A number as text is still a text frame.
  "binary-reading": { lines: ["nano sensor.js", "node sensor.js"], edits: [(t) => t.replace("ws.send(JSON.stringify(reading));", "ws.send(String(215));")] },
};

describe("frames", () => {
  it("the story: 13 bytes up, 9 bytes back, binary, a 126 length, a close", () => {
    expect(steps).toHaveLength(6);
    const c = scene.run.states[scene.stepEnd(4)]!.conns[0]!;
    const [up, back, bin, long] = c.frames;
    expect(up).toMatchObject({ dir: "out", wire: 13, masked: true });
    expect(back).toMatchObject({ dir: "in", wire: 9, masked: false });
    expect(c.frames.find((f) => f.opcode === 2 && f.dir === "out")!.size).toBe(4);
    expect(c.frames.find((f) => f.size === 300 && f.dir === "out")!.wire).toBe(308);
    expect(c.frames.some((f) => f.opcode === 8 && f.text === "1000 bye")).toBe(true);
    void bin;
    void long;
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
