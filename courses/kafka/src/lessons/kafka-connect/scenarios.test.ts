import { describe, expect, it } from "vitest";
import { typeApp } from "../shared/appShell";
import { base, indexDuplicates, topicDuplicates } from "./model";
import { scenarios } from "./scenarios";
import { lesson, shell, SINK_UPSERT, SOURCE_MASKED } from "./shell";

const play = (id: string, lines: string[], edits: ((t: string) => string)[] = []) => {
  const s = scenarios.find((x) => x.id === id)!;
  return { s, r: typeApp(lesson, shell, s.start, lines, edits) };
};
const PUT_SOURCE = 'curl -X PUT -H "Content-Type: application/json" --data @db-source.json localhost:8083/connectors/db-source/config';
const PUT_SINK = 'curl -X PUT -H "Content-Type: application/json" --data @search-sink.json localhost:8083/connectors/search-sink/config';
type Play = { lines: string[]; edits?: ((t: string) => string)[] };

const solutions: Record<string, Play> = {
  "mask-cards": { lines: ["nano db-source.json", PUT_SOURCE, "./insert-payment.sh"], edits: [() => SOURCE_MASKED] },
  "oom-sink": { lines: ["nano search-sink.json", PUT_SINK, "docker kill connect-worker-2"], edits: [() => SINK_UPSERT] },
  "patch-night": { lines: ["docker restart connect-worker-1"] },
  "power-cut": { lines: ["docker start connect-worker-1 connect-worker-2"] },
};

const alternatives: Record<string, Play[]> = {
  "mask-cards": [{ lines: ["nano db-source.json", PUT_SOURCE, `psql -h localhost -U shop -c "INSERT INTO payments (card) VALUES ('4111 1111')"`], edits: [() => SOURCE_MASKED] }],
  "patch-night": [{ lines: ["docker stop connect-worker-1", "docker start connect-worker-1"] }, { lines: ["sleep 60", "docker kill connect-worker-1", "docker start connect-worker-1"] }],
  "power-cut": [{ lines: ["docker ps", "docker start connect-worker-1", "docker start connect-worker-2"] }],
};

const wrong: Record<string, Play> = {
  "mask-cards": { lines: ["nano db-source.json", "./insert-payment.sh"], edits: [() => SOURCE_MASKED] },
  "oom-sink": { lines: ["docker kill connect-worker-2"] },
  "patch-night": { lines: ["docker kill connect-worker-1", "docker start connect-worker-1"] },
  "power-cut": { lines: ["./insert-payment.sh"] },
};

describe("kafka-connect lesson", () => {
  it("tells the story the steps describe", () => {
    const at = (step: number) => base.run.states[base.ends[step]!]!;
    expect(at(2).topic).toHaveLength(3);
    expect(at(3).index).toHaveLength(3);
    expect(at(4).topic[3]!.card).toBe("**** ****");
    expect(topicDuplicates(at(6))).toBe(2);
    expect(at(6).tasks.source).toBe("w2");
    expect(at(7).tasks).toEqual({ source: "w1", sink: "w2" });
    expect(indexDuplicates(at(8))).toBe(0);
    expect(at(8).index).toHaveLength(6);
  });

  it("refuses upsert without a key, as the Elasticsearch sink does", () => {
    const { r } = play("oom-sink", ["nano search-sink.json", PUT_SINK], [(t) => t.replace('"write.method": "insert"', '"write.method": "upsert"')]);
    expect(r.output.at(-1)).toContain("Upsert requires 'key.ignore' to be false");
  });

  it("a killed worker repeats what it had not saved", () => {
    const { r } = play("patch-night", ["docker kill connect-worker-1"]);
    expect(topicDuplicates(r.ctx.state)).toBeGreaterThan(topicDuplicates(r.ctx.start));
    expect(r.output).toContain("connect-worker-1");
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
