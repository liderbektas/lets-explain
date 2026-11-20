import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { applyAll, kafkaShell, replayShell, type KafkaBox } from "../../engine/cli";
import { kafkaCtx } from "../shared/TopicLessonScene";
import { scenarios } from "./scenarios";

const B = "--bootstrap-server localhost:9092";
const READER = `kafka-console-consumer.sh ${B} --topic orders --group billing &`;

const play = (start: KafkaBox, typed: string[]) => {
  const r = typeLines(kafkaShell, applyAll, start, typed);
  return { ctx: kafkaCtx(start, replayShell(start, r.actions)), moves: r.moves, output: r.output };
};

/** What a reader would type: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "first-topic": [`kafka-topics.sh ${B} --create --topic orders --partitions 3`],
  grow: [`kafka-topics.sh ${B} --alter --topic orders --partitions 3`],
  "three-readers": [READER, READER, READER],
  bench: [READER],
  "put-to-work": [`kafka-topics.sh ${B} --alter --topic orders --partitions 4`],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "first-topic": [[`kafka-topics ${B} --create --topic orders --partitions 3 --replication-factor 3`], [`bin/kafka-topics.sh ${B} --create --topic orders --partitions 4`]],
  grow: [[`kafka-topics.sh ${B} --describe --topic orders`, `kafka-topics.sh ${B} --alter --topic orders --partitions=3`]],
  "three-readers": [[`${READER.replace(" &", " --from-beginning &")}`, READER, `kafka-consumer-groups.sh ${B} --describe --group billing --members`, READER]],
  bench: [[`kafka-consumer-groups.sh ${B} --describe --group billing --members`, READER]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "first-topic": [`kafka-topics.sh ${B} --create --topic orders`],
  grow: [`kafka-topics.sh ${B} --create --topic orders-v2 --partitions 3`],
  // In the foreground a console consumer joins, reads, and leaves again.
  "three-readers": [READER.replace(" &", ""), READER.replace(" &", ""), READER.replace(" &", "")],
  bench: [`kafka-topics.sh ${B} --alter --topic orders --partitions 4`, READER],
  "put-to-work": ["kill %4"],
};

describe("topics-and-partitions scenarios", () => {
  it("the bench scenarios start with three and four running readers", () => {
    const bench = scenarios.find((s) => s.id === "bench")!.start;
    const four = scenarios.find((s) => s.id === "put-to-work")!.start;
    expect(bench.jobs).toHaveLength(3);
    expect(four.cluster.groups.billing!.members.filter((m) => m.assigned.length === 0)).toHaveLength(1);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(play(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = play(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" ; ").slice(0, 60)}…`, () => {
        expect(s.check(play(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(play(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
