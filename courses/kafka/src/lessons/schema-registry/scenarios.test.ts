import { describe, expect, it } from "vitest";
import { typeApp } from "../shared/appShell";
import { base, SANDBOX_STEP } from "./model";
import { scenarios } from "./scenarios";
import { lesson, shell } from "./shell";

const play = (id: string, lines: string[], edits: ((t: string) => string)[] = []) => {
  const s = scenarios.find((x) => x.id === id)!;
  return { s, r: typeApp(lesson, shell, s.start, lines, edits) };
};

const addField = (field: string) => (t: string) => t.replace(/\n  \]/, `,\n    ${field}\n  ]`);
const couponDefault = addField('{"name": "coupon", "type": ["null", "string"], "default": null}');
const couponRequired = addField('{"name": "coupon", "type": "string"}');
const currency = addField('{"name": "currency", "type": "string"}');
const rename = (t: string) => t.replace('"name": "total"', '"name": "amount"');
const dropTotal = (t: string) => t.replace(/,\n\s*\{"name": "total"[^}]*\}/, "");
const FORWARD = `curl -X PUT -H "Content-Type: application/vnd.schemaregistry.v1+json" --data '{"compatibility": "FORWARD"}' http://localhost:8081/config/orders-value`;

type Play = { lines: string[]; edits?: ((t: string) => string)[] };

const solutions: Record<string, Play> = {
  "add-coupon": { lines: ["nano order.avsc", "./produce-order.sh", "./run-billing.sh"], edits: [couponDefault] },
  "rename-pr": { lines: ["nano order.avsc", "./produce-order.sh"], edits: [rename] },
  "drop-total": { lines: ["nano order.avsc", "cp order.avsc billing/order.avsc", "./produce-order.sh", "./run-billing.sh"], edits: [dropTotal] },
  forward: { lines: [FORWARD, "nano order.avsc", "./produce-order.sh", "./run-billing.sh"], edits: [currency] },
};

const alternatives: Record<string, Play[]> = {
  "add-coupon": [{ lines: ["nano order.avsc", "./check-compat.sh", "./produce-order.sh", "./run-billing.sh"], edits: [couponDefault] }],
  "drop-total": [{ lines: ["nano order.avsc", "nano billing/order.avsc", "./run-billing.sh", "./produce-order.sh", "./run-billing.sh"], edits: [dropTotal, dropTotal] }],
};

const wrong: Record<string, Play> = {
  "add-coupon": { lines: ["nano order.avsc", "./produce-order.sh", "./run-billing.sh"], edits: [couponRequired] },
  "rename-pr": { lines: ["./check-compat.sh"] },
  "drop-total": { lines: ["nano order.avsc", "./produce-order.sh", "./run-billing.sh"], edits: [dropTotal] },
  forward: { lines: ["nano order.avsc", "./produce-order.sh", "./run-billing.sh"], edits: [currency] },
};

describe("schema-registry lesson", () => {
  it("tells the story the steps describe", () => {
    const at = (step: number) => base.run.states[base.ends[step]!]!;
    expect(at(1).reader.failed).toBe(2);
    expect(at(6).versions.map((v) => v.id)).toEqual([1, 2]);
    expect(at(7).versions).toHaveLength(2);
    expect(at(7).records).toHaveLength(at(6).records.length);
    expect(at(8).reader.failed).toBe(3);
    expect(at(9).reader.failed).toBe(3);
    expect(at(SANDBOX_STEP - 1).reader.ok).toBe(at(8).reader.ok + 1);
  });

  it("answers the registry's REST calls", () => {
    const { r } = play("forward", ["curl http://localhost:8081/subjects/orders-value/versions", "curl http://localhost:8081/config/orders-value", FORWARD, "./check-compat.sh"]);
    expect(r.output).toEqual(["[1]", '{"compatibilityLevel":"BACKWARD"}', '{"compatibility":"FORWARD"}', '{"is_compatible":true}']);
  });

  it("refuses an incompatible schema with the registry's 409", () => {
    const { r } = play("rename-pr", ["nano order.avsc", "./produce-order.sh"], [rename]);
    expect(r.output.some((x) => x.includes("error code: 409"))).toBe(true);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeApp(lesson, shell, s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const sol = solutions[s.id]!;
      const { r } = play(s.id, sol.lines, sol.edits);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.lines.join(" && ")}`, () => {
        expect(s.check(play(s.id, alt.lines, alt.edits).r.ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const w = wrong[s.id]!;
      expect(s.check(play(s.id, w.lines, w.edits).r.ctx)).toBe(false);
    });
  }
});
