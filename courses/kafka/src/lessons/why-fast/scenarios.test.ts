import { describe, expect, it } from "vitest";
import { setProp, typeApp } from "../shared/appShell";
import { measure } from "./model";
import { PERF, scenarios } from "./scenarios";
import { lesson, shell } from "./shell";

const play = (id: string, lines: string[], edits: ((t: string) => string)[] = []) => {
  const s = scenarios.find((x) => x.id === id)!;
  return { s, r: typeApp(lesson, shell, s.start, lines, edits) };
};
const batch = (bytes: number) => (t: string) => setProp(t, "batch.size", String(bytes));
const lz4 = (t: string) => setProp(batch(1024000)(t), "compression.type", "lz4");
const PARTS = "kafka-topics.sh --bootstrap-server localhost:9092 --alter --topic events --partitions 4";
const SCALE = "docker compose up -d --scale processor=4";
type Play = { lines: string[]; edits?: ((t: string) => string)[] };

const solutions: Record<string, Play> = {
  fifty: { lines: ["nano producer.properties", PERF], edits: [batch(102400)] },
  "few-requests": { lines: ["nano producer.properties", PERF], edits: [batch(1024000)] },
  "beat-network": { lines: ["nano producer.properties", PERF], edits: [lz4] },
  "read-fast": { lines: ["nano producer.properties", PARTS, SCALE, PERF], edits: [batch(102400)] },
};

const alternatives: Record<string, Play[]> = {
  fifty: [{ lines: ["nano producer.properties", PERF], edits: [lz4] }],
  "read-fast": [{ lines: ["nano producer.properties", "kafka-topics.sh --bootstrap-server localhost:9092 --alter --topic events --partitions 8", "docker compose up -d --scale processor=8", PERF], edits: [lz4] }],
};

const wrong: Record<string, Play> = {
  fifty: { lines: ["nano producer.properties", PERF], edits: [(t) => setProp(t, "linger.ms", "20")] },
  "few-requests": { lines: ["nano producer.properties", PERF], edits: [batch(102400)] },
  "beat-network": { lines: ["nano producer.properties", PERF], edits: [batch(1024000)] },
  "read-fast": { lines: ["nano producer.properties", "docker compose up -d --scale processor=8", PERF], edits: [batch(102400)] },
};

describe("why-fast model", () => {
  it("gives the round numbers the lesson quotes", () => {
    expect(measure({ batch: 1, compression: "none", partitions: 1, consumers: 1 }).produce).toBe(990);
    expect(measure({ batch: 100, compression: "none", partitions: 1, consumers: 1 }).produce).toBe(50_000);
    expect(measure({ batch: 100, compression: "none", partitions: 4, consumers: 4 }).produce).toBe(100_000);
    expect(measure({ batch: 100, compression: "lz4", partitions: 4, consumers: 5 })).toMatchObject({ working: 4, idle: 1 });
  });

  it("tell the numbers the text quotes", async () => {
    const { steps } = await import("./model");
    const at = (i: number, which: "before" | "after") => measure(steps[i]![which]);
    expect(at(4, "before").produce).toBe(7_920);
    expect(at(4, "after")).toMatchObject({ produce: 100_000, networkBound: true, consume: 100_000 });
    expect(at(5, "after")).toMatchObject({ produce: 200_000, consume: 200_000 });
    expect(at(6, "before")).toMatchObject({ produce: 50_000, consume: 25_000 });
    expect(at(6, "after")).toMatchObject({ produce: 100_000, consume: 100_000, idle: 1 });
  });
});

describe("why-fast scenarios", () => {
  it("prints the perf test the way the real tool does", () => {
    const { r } = play("fifty", [PERF]);
    expect(r.output[0]).toBe("1000000 records sent, 990.0 records/sec (0.97 MB/sec), 2.0 ms avg latency");
  });

  it("refuses to shrink a topic, like Kafka", () => {
    const { r } = play("read-fast", [PARTS, "kafka-topics.sh --bootstrap-server localhost:9092 --alter --topic events --partitions 2"]);
    expect(r.output.at(-1)).toContain("can only be increased");
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
