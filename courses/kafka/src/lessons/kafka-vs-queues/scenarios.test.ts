import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { applyAll, kafkaShell, replayShell, type KafkaBox } from "../../engine/cli";
import { kafkaCtx } from "../shared/TopicLessonScene";
import { ANALYTICS, base, BILLING, inQueue, kafkaSeen } from "./model";
import { scenarios } from "./scenarios";

const B = "--bootstrap-server localhost:9092";
const READ = (group: string, extra = "") => `kafka-console-consumer.sh ${B} --topic orders --group ${group}${extra}`;
const WRITE = (...values: string[]) => `printf "${values.join("\\n")}\\n" | kafka-console-producer.sh ${B} --topic orders`;
const RESET = (how: string) => `kafka-consumer-groups.sh ${B} --group billing --reset-offsets ${how} --topic orders --execute`;
const NO_AUTO = " --consumer-property enable.auto.commit=false";

const play = (start: KafkaBox, typed: string[]) => {
  const r = typeLines(kafkaShell, applyAll, start, typed);
  return { ctx: kafkaCtx(start, replayShell(start, r.actions)), moves: r.moves, output: r.output };
};

/** What a reader would type: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "late-joiner": [READ("analytics", " --from-beginning")],
  replay: [RESET("--to-earliest"), READ("billing")],
  "own-pace": [READ("billing")],
  redeliver: [`${READ("billing", NO_AUTO)} &`, WRITE("order:1047", "order:1048"), "kill -9 %1", READ("billing")],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "late-joiner": [[`${READ("analytics", " --from-beginning")} &`]],
  replay: [[RESET("--to-offset 0"), READ("billing")], [RESET("--shift-by -6"), READ("billing")]],
  "own-pace": [[`kafka-consumer-groups.sh ${B} --describe --all-groups`, `${READ("billing")} --max-messages 2`]],
  redeliver: [["jobs", `${READ("billing", NO_AUTO)} &`, WRITE("order:1047", "order:1048"), "kill -9 %1", `${READ("billing")} &`]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  // Billing has commits, so --from-beginning reads nothing and analytics never starts.
  "late-joiner": [READ("billing", " --from-beginning")],
  replay: [READ("billing", " --from-beginning")],
  // Reading with both groups moves analytics too.
  "own-pace": [READ("billing"), READ("analytics")],
  // With auto commit on, what was read is committed: nothing comes twice.
  redeliver: [`${READ("billing")} &`, WRITE("order:1047", "order:1048"), "kill -9 %1", READ("billing")],
};

describe("kafka-vs-queues", () => {
  const at = (i: number) => base.run.states[base.ends[i]!]!;

  it("tells the story the steps describe", () => {
    expect(inQueue(at(1).queue)).toEqual([1, 2]);
    expect(inQueue(at(2).queue)).toEqual([]);
    // Analytics joined the queue late and found nothing.
    expect(base.run.events[base.ends[3]! - 1]![0]!.type).toBe("empty");
    // The crashed worker's message went to B.
    expect(at(4).queue.acked[5]).toBe("b");
    // Kafka kept every record; both groups read all six.
    const k6 = at(6);
    expect(k6.kafka.topics.orders!.partitions[0]!.records).toHaveLength(6);
    expect(kafkaSeen(k6, BILLING).size).toBe(6);
    expect(kafkaSeen(k6, ANALYTICS).size).toBe(6);
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
