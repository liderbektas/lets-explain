import { describe, expect, it } from "vitest";
import { typeApp } from "../shared/appShell";
import { run } from "./model";
import { scenarios } from "./scenarios";
import { HTTP_ENV, KAFKA_ENV, lesson, shell } from "./shell";

const play = (id: string, lines: string[], edits: ((t: string) => string)[] = []) => {
  const s = scenarios.find((x) => x.id === id)!;
  return { s, r: typeApp(lesson, shell, s.start, lines, edits) };
};
type Play = { lines: string[]; edits?: ((t: string) => string)[] };
const toKafka = () => KAFKA_ENV;

const solutions: Record<string, Play> = {
  reproduce: { lines: ["docker stop email-service", "./place-order.sh", "docker start email-service"] },
  maintenance: { lines: ["nano order-service.env", "docker compose up -d order-service", "docker stop email-service", "./place-order.sh", "docker start email-service"], edits: [toKafka] },
  "catch-up": { lines: ["docker start email-service"] },
  "new-team": { lines: ["docker compose up -d analytics-service"] },
};

const alternatives: Record<string, Play[]> = {
  reproduce: [{ lines: ["docker kill email-service", "./place-order.sh", "docker compose up -d email-service"] }],
  maintenance: [{ lines: ["nano order-service.env", "docker compose up -d order-service", "docker stop email-service", "./place-order.sh", "./place-order.sh", "docker start email-service"], edits: [(t) => t.replace("NOTIFY_MODE=http", "NOTIFY_MODE=kafka")] }],
  "catch-up": [{ lines: ["kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group email-service", "docker compose up -d email-service"] }],
};

const wrong: Record<string, Play> = {
  reproduce: { lines: ["./place-order.sh"] },
  maintenance: { lines: ["docker stop email-service", "./place-order.sh", "docker start email-service"] },
  "catch-up": { lines: ["./place-order.sh"] },
  "new-team": { lines: ["nano order-service.env", "docker compose up -d order-service", "docker compose up -d analytics-service"], edits: [() => HTTP_ENV] },
};

describe("why-kafka", () => {
  it("orders during an outage are lost without Kafka", () => {
    const s = run([{ type: "crashEmail" }, { type: "order" }, { type: "order" }, { type: "startEmail" }]).states.at(-1)!;
    expect(s.lost).toBe(2);
    expect(s.sent).toBe(0);
  });

  it("shows the email service's lag while it is down", () => {
    const { r } = play("catch-up", ["kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group email-service"]);
    expect(r.output.at(-1)).toMatch(/^email-service\s+orders\s+0\s+0\s+3\s+3$/);
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
