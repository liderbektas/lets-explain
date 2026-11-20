import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { applyAll, kafkaShell, replayShell, type KafkaBox } from "../../engine/cli";
import { partitionForKey } from "../../engine/murmur2";
import { kafkaCtx } from "../shared/TopicLessonScene";
import { scenarios } from "./scenarios";

const B = "--bootstrap-server localhost:9092";
const KEYED = (topic: string, sep = ":") => `kafka-console-producer.sh ${B} --topic ${topic} --property parse.key=true --property key.separator=${sep}`;

const play = (start: KafkaBox, typed: string[]) => {
  const r = typeLines(kafkaShell, applyAll, start, typed);
  return { ctx: kafkaCtx(start, replayShell(start, r.actions)), moves: r.moves, output: r.output };
};

/** What a reader would type: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "keep-order": [`printf "ali:order\\nali:address\\nali:cancel\\n" | ${KEYED("orders")}`],
  "logins-file": [`cat logins.txt | ${KEYED("logins", ",")}`],
  "payments-topic": [`kafka-topics.sh ${B} --create --topic payments --partitions 4`, `printf "mehmet:paid\\nmehmet:refund\\n" | ${KEYED("payments")}`],
  "grow-moves-keys": [`kafka-topics.sh ${B} --alter --topic orders --partitions 4`, `echo "ali:order" | ${KEYED("orders")}`],
  neighbours: [`printf "can:order\\nali:order\\n" | ${KEYED("orders")}`],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "keep-order": [
    [`echo "ali:order" | ${KEYED("orders")}`, `echo "ali:address" | ${KEYED("orders")}`, `echo "ali:cancel" | ${KEYED("orders")}`],
    [`printf "ali\\torder\\nali\\taddress\\nali\\tcancel\\n" | bin/kafka-console-producer.sh ${B} --topic orders --property parse.key=true`],
  ],
  "payments-topic": [[`kafka-topics ${B} --create --topic payments --partitions 4 --replication-factor 3`, `echo "mehmet:paid" | ${KEYED("payments")}`, `echo "mehmet:refund" | ${KEYED("payments")}`]],
  neighbours: [[`echo "can:order" | ${KEYED("orders")} && echo "ali:order" | ${KEYED("orders")}`]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "keep-order": [`printf "ali:order\\nali:address\\nali:cancel\\n" | kafka-console-producer.sh ${B} --topic orders`],
  "logins-file": [`cat logins.txt | ${KEYED("logins")}`],
  "payments-topic": [`kafka-topics.sh ${B} --create --topic payments --partitions 1`, `printf "mehmet:paid\\nmehmet:refund\\n" | ${KEYED("payments")}`],
  "grow-moves-keys": [`echo "ali:order" | ${KEYED("orders")}`, `kafka-topics.sh ${B} --alter --topic orders --partitions 4`],
  neighbours: [`printf "can:order\\nmehmet:order\\n" | ${KEYED("orders")}`],
};

describe("producers-and-keys scenarios", () => {
  it("keys land where the scenarios say", () => {
    expect(["ali", "mehmet", "zeynep", "can"].map((k) => partitionForKey(k, 3))).toEqual([0, 1, 2, 0]);
    expect(partitionForKey("ali", 4)).toBe(3);
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
