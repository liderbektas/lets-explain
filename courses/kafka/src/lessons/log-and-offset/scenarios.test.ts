import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { groupStats } from "../../engine/cluster";
import { applyAll, kafkaShell, replayShell, type KafkaBox } from "../../engine/cli";
import { kafkaCtx } from "../shared/TopicLessonScene";
import { DELETE, scenarios } from "./scenarios";
import { base, SANDBOX_STEP } from "./model";

const B = "--bootstrap-server localhost:9092";
const READ = (group: string, extra = "") => `kafka-console-consumer.sh ${B} --topic orders --group ${group}${extra}`;
const WRITE = (...values: string[]) => `printf "${values.join("\\n")}\\n" | kafka-console-producer.sh ${B} --topic orders`;
const RESET = (how: string) => `kafka-consumer-groups.sh ${B} --group analytics --reset-offsets ${how} --topic orders --execute`;
const NO_AUTO = " --consumer-property enable.auto.commit=false";

const play = (start: KafkaBox, typed: string[]) => {
  const r = typeLines(kafkaShell, applyAll, start, typed);
  return { ctx: kafkaCtx(start, replayShell(start, r.actions)), moves: r.moves, output: r.output };
};
const start = (id: string) => scenarios.find((s) => s.id === id)!.start;

/** What a reader would type: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "where-left": [READ("billing")],
  double: [`${READ("billing", NO_AUTO)} &`, WRITE("order:1049", "order:1050"), "kill -9 %1", READ("billing")],
  replay: [RESET("--to-earliest"), READ("analytics")],
  "safe-delete": [READ("analytics"), DELETE],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "where-left": [[`kafka-consumer-groups.sh ${B} --describe --group billing`, `${READ("billing")} --max-messages 3`]],
  // A clean stop does not commit either when auto commit is off.
  double: [[`${READ("billing", NO_AUTO)} &`, WRITE("order:1049", "order:1050"), "kill %1", READ("billing")]],
  replay: [
    [RESET("--to-offset 0"), READ("analytics")],
    [RESET("--shift-by -5"), READ("analytics", " --from-beginning")],
  ],
  "safe-delete": [[`kafka-consumer-groups.sh ${B} --describe --group analytics`, READ("analytics"), "cat delete.json", DELETE]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  // Reading without the group commits nothing: the lag stays.
  "where-left": [`kafka-console-consumer.sh ${B} --topic orders --from-beginning`],
  // With auto commit on, the reader commits what it read: nothing is read twice.
  double: [`${READ("billing")} &`, WRITE("order:1049", "order:1050"), "kill -9 %1", READ("billing")],
  replay: [READ("analytics", " --from-beginning")],
  "safe-delete": [DELETE, READ("analytics")],
};

describe("log-and-offset scenarios", () => {
  it("every lesson step runs without an error", () => {
    const errors = base.run.events.slice(0, base.ends[SANDBOX_STEP]).flat().filter((e) => e.type === "error");
    expect(errors).toEqual([]);
  });

  it("starts where the stories say", () => {
    expect(start("where-left").cluster.groups.billing!.committed["orders-0"]).toBe(5);
    expect(start("replay").cluster.topics.orders!.partitions[0]!.logStartOffset).toBe(4);
    expect(groupStats(start("safe-delete").cluster, "analytics").lag).toBe(7);
  });

  it("delete-records prints what Kafka prints", () => {
    const r = play(start("safe-delete"), [DELETE]);
    expect(r.output).toEqual(["Executing records delete operation", "Records delete operation completed:", "partition: orders-0\tlow_watermark: 4"]);
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
