import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { addSocketPath, fixTypo, passUpgrade } from "./code";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

type Run = { lines: string[]; edits?: ((t: string) => string)[] };
const CONF = "/etc/nginx/conf.d/chat.conf";

const solutions: Record<string, Run> = {
  "pass-upgrade": { lines: [`sudo nano ${CONF}`, "sudo nginx -s reload", "wscat -c ws://localhost/ws"], edits: [passUpgrade] },
  typo: { lines: ["sudo nginx -t", `sudo nano ${CONF}`, "sudo nginx -s reload", "wscat -c ws://localhost/ws"], edits: [fixTypo] },
  "new-path": { lines: [`sudo nano ${CONF}`, "sudo nginx -s reload", "wscat -c ws://localhost/socket"], edits: [addSocketPath] },
  "bad-gateway": { lines: ["node server.js &", "wscat -c ws://localhost/ws"] },
};

const alternatives: Record<string, Run[]> = {
  "pass-upgrade": [{ lines: [`sudo nano ${CONF}`, "sudo nginx -t", "sudo systemctl reload nginx", "wscat -c ws://localhost/ws -x hi"], edits: [passUpgrade] }],
  "bad-gateway": [{ lines: ["curl -i localhost:9001", "node server.js &", "wscat -c ws://localhost/ws"] }],
};

const wrong: Record<string, Run> = {
  // Edited but not reloaded: nginx still runs the old config.
  "pass-upgrade": { lines: [`sudo nano ${CONF}`, "wscat -c ws://localhost/ws"], edits: [passUpgrade] },
  // Reloading the broken file fails; the old config stays.
  typo: { lines: ["sudo nginx -s reload", "wscat -c ws://localhost/ws"] },
  // Going around nginx is not the fix.
  "new-path": { lines: ["wscat -c ws://localhost:8081/socket"] },
  // Reloading nginx doesn't start the server behind it.
  "bad-gateway": { lines: ["sudo nginx -s reload", "wscat -c ws://localhost/ws"] },
};

describe("behind-nginx", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;

  it("the story: 426 through a plain proxy, the upstream request without Upgrade, then 101", () => {
    expect(steps).toHaveLength(5);
    const browserEx = at(0).exchanges.find((e) => e.client === "browser")!;
    expect(browserEx.status).toBe(426);
    const up = at(0).exchanges.find((e) => e.client === "nginx")!;
    expect(up.httpVersion).toBe("1.0");
    expect(up.headers.find(([k]) => k === "Connection")?.[1]).toBe("close");
    expect(up.headers.some(([k]) => k === "Upgrade")).toBe(false);
    expect(at(2).conns.some((c) => c.client === "browser" && c.via === 80)).toBe(true);
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
