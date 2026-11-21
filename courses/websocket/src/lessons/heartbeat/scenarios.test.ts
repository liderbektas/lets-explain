import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { HEARTBEAT } from "./code";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Run = { lines: string[]; edits?: ((t: string) => string)[] };

const pingOnly = (t: string) => t.replace('console.log("chat on :9001");', 'setInterval(() => {\n  for (const ws of wss.clients) ws.ping();\n}, 30000);\n\nconsole.log("chat on :9001");');
const heartbeat = () => HEARTBEAT;
const longer = (t: string) => t.replace('proxy_set_header Connection "upgrade";', 'proxy_set_header Connection "upgrade";\n        proxy_read_timeout 1h;');

const solutions: Record<string, Run> = {
  "ping-fix": { lines: ["nano server.js", "pkill -f server.js", "node server.js &", "node watch.js &", "sleep 120"], edits: [pingOnly] },
  "dead-phones": { lines: ["nano server.js", "pkill -f server.js", "node server.js &", "sleep 160"], edits: [heartbeat] },
  "see-heartbeat": { lines: ["sudo tshark -i lo -Y websocket &", "sleep 35"] },
  "longer-timeout": { lines: ["sudo nano /etc/nginx/conf.d/chat.conf", "sudo nginx -s reload", "node watch.js &", "sleep 120"], edits: [longer] },
};

const alternatives: Record<string, Run[]> = {
  "ping-fix": [{ lines: ["nano server.js", "kill %1", "node server.js &", "node watch.js &", "sleep 60", "sleep 70"], edits: [heartbeat] }],
  "dead-phones": [{ lines: ["nano server.js", "kill 4242", "node server.js &", "sleep 100", "sleep 60"], edits: [heartbeat] }],
  "longer-timeout": [{ lines: ["sudo nano /etc/nginx/conf.d/chat.conf", "sudo nginx -t", "sudo systemctl reload nginx", "node watch.js &", "sleep 150"], edits: [(t) => t.replace('proxy_set_header Connection "upgrade";', 'proxy_set_header Connection "upgrade";\n        proxy_read_timeout 600s;')] }],
};

const wrong: Record<string, Run> = {
  // Restarting the same code: still cut at 60 s.
  "ping-fix": { lines: ["pkill -f server.js", "node server.js &", "node watch.js &", "sleep 120"] },
  // Pinging without checking for pongs keeps the dead phone on the books.
  "dead-phones": { lines: ["nano server.js", "pkill -f server.js", "node server.js &", "sleep 160"], edits: [pingOnly] },
  // Too short a wait: no ping yet.
  "see-heartbeat": { lines: ["sudo tshark -i lo -Y websocket &", "sleep 5"] },
  // Edited but never reloaded: nginx still runs the old config.
  "longer-timeout": { lines: ["sudo nano /etc/nginx/conf.d/chat.conf", "node watch.js &", "sleep 120"], edits: [longer] },
};

describe("heartbeat", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;

  it("the story: cut at 60 s; alive at 95 s with pings; a dead phone let go", () => {
    expect(steps).toHaveLength(5);
    const first = at(0).conns[0]!;
    expect(first.closeCode).toBe(1006);
    expect(first.closedAt! - first.openedAt).toBe(60_000);
    const second = at(1).conns.at(-1)!;
    expect(second.closedAt).toBeNull();
    expect(second.frames.some((f) => f.opcode === 9)).toBe(true);
    const phone = at(2).conns.find((c) => c.client === "phone")!;
    expect(phone.serverCode).toBe(1006);
    expect(phone.closedAt).toBeNull();
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
