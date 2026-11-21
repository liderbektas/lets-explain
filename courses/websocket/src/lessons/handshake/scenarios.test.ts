import { describe, expect, it } from "vitest";
import { FREE } from "./scenarios";
import { typeInto } from "../shared/testing";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

const UP = "-H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13'";
const FULL = `curl -i ${UP} -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:8081`;
const ECE = "curl -i -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:8081";

const solutions: Record<string, string[]> = {
  "by-hand": [FULL],
  "the-426": [ECE, `${ECE.replace("curl -i", "curl -i -H 'Connection: Upgrade'")}`],
  // Make a key, then paste it into the header, as a reader would.
  "fresh-key": (() => {
    const key = typeInto(FREE, ["openssl rand -base64 16"]).output[0]!;
    return ["openssl rand -base64 16", `curl -i ${UP} -H 'Sec-WebSocket-Key: ${key}' localhost:8081`];
  })(),
  "three-answers": ["curl -i localhost:8081", FULL, `curl -i ${UP} -H 'Sec-WebSocket-Key: abc123' localhost:8081`],
};

const alternatives: Record<string, string[][]> = {
  "by-hand": [[FULL.replace("curl -i", "curl -v")], [FULL.replace("localhost:8081", "http://127.0.0.1:8081/chat")]],
  "the-426": [[ECE, `curl -i -H 'Connection: upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:8081`]],
  "fresh-key": [
    [`curl -i ${UP} -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" localhost:8081`],
    ["KEY=$(openssl rand -base64 16)", `curl -i ${UP} -H "Sec-WebSocket-Key: $KEY" localhost:8081`],
  ],
  "three-answers": [[`curl -i ${UP} -H 'Sec-WebSocket-Version: 7' localhost:8081`, "curl -s -i localhost:8081/", FULL]],
};

const wrong: Record<string, string[]> = {
  // Without the upgrade headers it's just a plain request.
  "by-hand": ["curl -i localhost:8081"],
  // Fixing it without seeing the problem first: no 426 on record.
  "the-426": [FULL],
  // A key that is valid but the same every time: nothing random about it.
  "fresh-key": [FULL],
  // Two 101s and a 426, but no 400.
  "three-answers": [FULL, FULL, "curl -i localhost:8081"],
};

describe("handshake", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;

  it("the story: 101 for the browser, then 426, two 400s, and a dropped request on :8080", () => {
    expect(steps).toHaveLength(6);
    expect(at(0).exchanges[0]!.status).toBe(101);
    expect(at(2).exchanges.at(-1)!.status).toBe(426);
    const [badKey, badVersion] = at(3).exchanges.slice(-2);
    expect(badKey!.respBody).toBe("Missing or invalid Sec-WebSocket-Key header");
    expect(badVersion!.respHeaders).toContainEqual(["Sec-WebSocket-Version", "13, 8"]);
    expect(at(4).exchanges.at(-1)!.end).toBe("dropped");
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = typeInto(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" ; ")}`, () => {
        expect(s.check(typeInto(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
