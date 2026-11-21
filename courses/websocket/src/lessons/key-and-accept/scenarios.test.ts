import { describe, expect, it } from "vitest";
import { acceptFor } from "../../engine/bytes";
import { typeInto } from "../shared/testing";
import { FREE, scenarios, WIKI_KEY } from "./scenarios";
import { scene, steps } from "./Scene";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const UP = "-H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13'";
const addGuid = (t: string) => t.replace(".update(key)", ".update(key + GUID)");
const toBase64 = (t: string) => t.replace('digest("hex")', 'digest("base64")');

const solutions: Record<string, string[]> = {
  "by-hand": [`printf '%s' '${WIKI_KEY}${GUID}' | openssl sha1 -binary | base64`],
  "check-the-server": [
    "KEY=$(openssl rand -base64 16)",
    `printf '%s' "\${KEY}${GUID}" | openssl sha1 -binary | base64`,
    `curl -i ${UP} -H "Sec-WebSocket-Key: $KEY" localhost:8081`,
  ],
  "forgot-the-guid": ["nano server.js", "pkill -f server.js", "node server.js &", "wscat -c ws://localhost:9000"],
  "hex-digest": ["nano server.js", "pkill -f server.js", "node server.js &", "wscat -c ws://localhost:9000"],
};
const edits: Record<string, ((t: string) => string)[]> = { "forgot-the-guid": [addGuid], "hex-digest": [toBase64] };

const alternatives: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }[]> = {
  "by-hand": [
    { lines: [`echo -n '${WIKI_KEY}${GUID}' | openssl dgst -sha1 -binary | openssl base64`] },
    { lines: [`KEY=${WIKI_KEY}`, `printf '%s' "\${KEY}${GUID}" | openssl sha1 -binary | base64`] },
  ],
  "check-the-server": [],
  "forgot-the-guid": [
    { lines: ["cat server.js", "nano server.js", "kill 4242", "node server.js", "wscat -c ws://localhost:9000 -x hello"], edits: [addGuid] },
  ],
  "hex-digest": [{ lines: ["curl -i -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:9000", "nano server.js", "kill %1", "node server.js &", "wscat -c ws://localhost:9000"], edits: [toBase64] }],
};

const wrong: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }> = {
  // Base64 of the hex text, not of the bytes.
  "by-hand": { lines: [`printf '%s' '${WIKI_KEY}${GUID}' | openssl sha1 | base64`] },
  // $KEY258EAFA5 is another, empty variable: the sum is of the GUID alone.
  "check-the-server": { lines: ["KEY=$(openssl rand -base64 16)", `printf '%s' "$KEY${GUID}" | openssl sha1 -binary | base64`, `curl -i ${UP} -H "Sec-WebSocket-Key: $KEY" localhost:8081`] },
  // Fixed on disk, but the running process still has the old code.
  "forgot-the-guid": { lines: ["nano server.js", "wscat -c ws://localhost:9000"], edits: [addGuid] },
  // Restarting the same broken code changes nothing.
  "hex-digest": { lines: ["pkill -f server.js", "node server.js &", "wscat -c ws://localhost:9000"] },
};

describe("key-and-accept", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;

  it("the Wikipedia example key gives its well-known accept", () => {
    expect(acceptFor(WIKI_KEY)).toBe("HSmrc0sMlYUkAGmm5OPpG2HaGWk=");
  });

  it("the story: the RFC's accept, the same accept twice, and a browser refusing a server without the GUID", () => {
    expect(steps).toHaveLength(6);
    expect(at(0).exchanges[0]!.respHeaders).toContainEqual(["Sec-WebSocket-Accept", "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="]);
    const [a, b, browser] = at(2).exchanges;
    expect(b!.respHeaders).toEqual(a!.respHeaders);
    expect(browser!.status).toBe(101);
    expect(at(4).conns.some((c) => c.port === 9000)).toBe(false);
    expect(at(4).exchanges.at(-1)!.status).toBe(101);
  });

  it("free play starts with the broken server on disk, not running", () => {
    expect(FREE.procs).toEqual([]);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = typeInto(s.start, solutions[s.id]!, [...(edits[s.id] ?? [])]);
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
