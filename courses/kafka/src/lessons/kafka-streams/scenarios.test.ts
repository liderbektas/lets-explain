import { describe, expect, it } from "vitest";
import { setProp, typeApp } from "../shared/appShell";
import { base, overcount, tableOf, visible } from "./model";
import { scenarios } from "./scenarios";
import { lesson, shell } from "./shell";

const play = (id: string, lines: string[], edits: ((t: string) => string)[] = []) => {
  const s = scenarios.find((x) => x.id === id)!;
  return { s, r: typeApp(lesson, shell, s.start, lines, edits) };
};
const RESET = "kafka-streams-application-reset.sh --bootstrap-server localhost:9092 --application-id order-counter --input-topics orders";
const eos = (t: string) => setProp(t, "processing.guarantee", "exactly_once_v2");
type Play = { lines: string[]; edits?: ((t: string) => string)[] };

const solutions: Record<string, Play> = {
  "exactly-once": { lines: ["nano streams.properties", "./run-app.sh", "./run-app.sh"], edits: [eos] },
  recount: { lines: [RESET, "./run-app.sh"] },
  "izmir-branch": { lines: ["./place-order.sh İzmir", "./place-order.sh İzmir", "./run-app.sh"] },
  "lost-disk": { lines: ["./run-app.sh"] },
};

const alternatives: Record<string, Play[]> = {
  "izmir-branch": [{ lines: ["./place-order.sh izmir && ./place-order.sh izmir", "./run-app.sh"] }],
  recount: [{ lines: ["nano streams.properties", RESET, "./run-app.sh"], edits: [eos] }],
};

const wrong: Record<string, Play> = {
  "exactly-once": { lines: ["./run-app.sh", "./run-app.sh"] },
  recount: { lines: ["./run-app.sh"] },
  "izmir-branch": { lines: ["./place-order.sh İzmir", "./run-app.sh"] },
  "lost-disk": { lines: ["./place-order.sh Ankara"] },
};

describe("kafka-streams lesson", () => {
  it("tells the story the steps describe", () => {
    const at = (step: number) => base.run.states[base.ends[step]!]!;
    expect(at(3).store).toEqual({ İstanbul: 2, Ankara: 1 });
    expect(at(3).output).toHaveLength(3);
    expect(Object.keys(tableOf(at(3).output))).toHaveLength(2);
    expect(at(5).store).toEqual(at(4).store);
    expect(overcount(at(6))).toBe(2);
    expect(overcount(at(7))).toBe(0);
    expect(overcount(at(8))).toBe(0);
    expect(at(8).output.some((u) => u.status === "aborted")).toBe(true);
    expect(tableOf(at(8).output).Ankara).toBe(3);
    expect(visible(at(8).output).every((u) => u.status === "committed")).toBe(true);
  });

  it("refuses to reset a running app, like the real tool", () => {
    const { r } = play("izmir-branch", [RESET]);
    expect(r.output[0]).toContain("is still active");
  });

  it("reads the output topic with keys", () => {
    const { r } = play("izmir-branch", ["./place-order.sh İzmir", "./run-app.sh", "kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic orders-per-city --from-beginning --property print.key=true"]);
    expect(r.output).toContain("İzmir\t1");
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
