import { describe, expect, it } from "vitest";
import { setProp, typeApp } from "../shared/appShell";
import { abortedSeenBy, base, duplicateOrders, lastStable, sandboxStart } from "./model";
import { scenarios } from "./scenarios";
import { lesson, shell, TRANSACTIONAL } from "./shell";

const play = (id: string, lines: string[], edits: ((t: string) => string)[] = []) => {
  const s = scenarios.find((x) => x.id === id)!;
  return { s, r: typeApp(lesson, shell, s.start, lines, edits) };
};
const RUN = "./run-billing.sh";
const RC = "kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic invoices --from-beginning --isolation-level read_committed";
const RU = "kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic invoices --from-beginning";
const idemOn = (t: string) => setProp(t, "enable.idempotence", "true");
const txOn = (t: string) => setProp(t, "transactional.id", "billing-1");

const solutions: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }> = {
  "lost-ack": { lines: ["nano billing.properties", RUN], edits: [idemOn] },
  "crash-between": { lines: ["nano billing.properties", RUN, RUN], edits: [txOn] },
  "accounting-reads": { lines: [RC] },
  "stuck-reader": { lines: [RUN, RC] },
};

const alternatives: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }[]> = {
  "lost-ack": [{ lines: ["nano billing.properties", RUN], edits: [() => TRANSACTIONAL] }],
  "crash-between": [{ lines: ["nano billing.properties", "cat billing.properties", RUN, RUN], edits: [() => TRANSACTIONAL] }],
};

const wrong: Record<string, { lines: string[]; edits?: ((t: string) => string)[] }> = {
  "lost-ack": { lines: [RUN] },
  "crash-between": { lines: [RUN, RUN] },
  "accounting-reads": { lines: [RU] },
  "stuck-reader": { lines: [RC] },
};

describe("idempotence-and-transactions lesson", () => {
  const at = (i: number) => base.run.states[base.ends[i]!]!;

  it("tells the story the steps describe", () => {
    expect(duplicateOrders(at(1))).toBe(1);
    expect(at(2).dropped).toBe(1);
    expect(duplicateOrders(at(2))).toBe(1);
    expect(duplicateOrders(at(4))).toBe(2);
    expect(at(5).log.at(-1)!.kind).toBe("commit");
    expect(at(6).log.filter((r) => r.kind === "abort")).toHaveLength(1);
    expect(abortedSeenBy(at(7), "rc")).toBe(0);
    expect(abortedSeenBy(at(7), "ru")).toBe(1);
    expect(sandboxStart.idempotent).toBe(false);
    expect(sandboxStart.transactional).toBe(false);
  });

  it("refuses a transactional.id with idempotence off, like the real client", () => {
    const { r } = play("lost-ack", ["nano billing.properties", RUN], [txOn]);
    expect(r.output.at(-1)).toContain("Cannot set a transactional.id without also enabling idempotence.");
  });

  it("shows read_committed waiting at an open transaction", () => {
    const { r } = play("stuck-reader", [RC]);
    expect(r.output.some((x) => x.includes("read_committed stops at offset"))).toBe(true);
    expect(r.ctx.state.rc.pos).toBe(lastStable(r.ctx.state));
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
