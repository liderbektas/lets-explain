import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { groupStats } from "../../engine/cluster";
import { applyAll, kafkaShell, replayShell, type KafkaBox } from "../../engine/cli";
import { kafkaCtx } from "../shared/TopicLessonScene";
import { scenarios } from "./scenarios";

const B = "--bootstrap-server localhost:9092";
const READ = (group: string, extra = "") => `kafka-console-consumer.sh ${B} --topic orders --group ${group}${extra}`;
const READER = `${READ("billing")} &`;
const RESET = `kafka-consumer-groups.sh ${B} --group billing --reset-offsets --to-earliest --topic orders --execute`;

const play = (start: KafkaBox, typed: string[]) => {
  const r = typeLines(kafkaShell, applyAll, start, typed);
  return { ctx: kafkaCtx(start, replayShell(start, r.actions)), moves: r.moves, output: r.output };
};
const start = (id: string) => scenarios.find((s) => s.id === id)!.start;

/** What a reader would type: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "second-team": [READ("analytics", " --from-beginning")],
  "catch-up": [READ("billing")],
  replay: [RESET, READ("billing")],
  team: [READER, READER, `printf "order:6001\\norder:6002\\norder:6003\\n" | kafka-console-producer.sh ${B} --topic orders`],
  stuck: ["kill -9 %2", `echo "order:7001" | kafka-console-producer.sh ${B} --topic orders`],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "second-team": [[`${READ("analytics", " --from-beginning")} &`]],
  "catch-up": [[`kafka-consumer-groups.sh ${B} --describe --group billing`, `${READ("billing")} --max-messages 4`]],
  replay: [
    [RESET.replace("--to-earliest", "--to-offset 0"), READ("billing")],
    [RESET.replace(" --execute", ""), RESET, READ("billing", " --from-beginning")],
  ],
  team: [[READER, READER, `echo "order:6001" | kafka-console-producer.sh ${B} --topic orders`, `echo "order:6002" | kafka-console-producer.sh ${B} --topic orders`, `echo "order:6003" | kafka-console-producer.sh ${B} --topic orders`]],
  stuck: [["jobs", "kill -9 %2", `echo "order:7001" | kafka-console-producer.sh ${B} --topic orders`]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  // Billing already committed: --from-beginning changes nothing for it, and analytics never reads.
  "second-team": [READ("billing", " --from-beginning")],
  // Without a group, nothing is committed: the lag stays.
  "catch-up": [`kafka-console-consumer.sh ${B} --topic orders --from-beginning`],
  // --from-beginning does not apply to a group that has commits.
  replay: [READ("billing", " --from-beginning")],
  team: [READ("billing"), READ("billing"), `printf "order:6001\\norder:6002\\norder:6003\\n" | kafka-console-producer.sh ${B} --topic orders`],
  stuck: ["kill -9 %1", "kill -9 %2", "kill -9 %3", `echo "order:7001" | kafka-console-producer.sh ${B} --topic orders`],
};

describe("consumer-groups scenarios", () => {
  it("starts where the stories say", () => {
    expect(groupStats(start("second-team").cluster, "billing").lag).toBe(0);
    expect(groupStats(start("catch-up").cluster, "billing").lag).toBe(4);
    expect(start("stuck").jobs).toHaveLength(3);
  });

  it("a reset without --execute only shows the plan", () => {
    const r = play(start("replay"), [RESET.replace(" --execute", "")]);
    expect(r.output.some((l) => l.startsWith("WARN: No action will be performed"))).toBe(true);
    expect(r.moves).toBe(0);
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
