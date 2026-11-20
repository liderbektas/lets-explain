import { describe, expect, it } from "vitest";
import { allRecords } from "../../engine/storage";
import { playS } from "../../engine/storageCli";
import { base, stepBeats, tableOf } from "./model";
import { KEYED, scenarios, TOPIC } from "./scenarios";

const B = "--bootstrap-server localhost:9092";
const CONFIG = (kv: string) => `kafka-configs.sh ${B} --alter --entity-type topics --entity-name ${TOPIC} --add-config ${kv}`;

/** The intended commands, in exactly par. */
const solutions: Record<string, string[]> = {
  "only-ali": [`printf "ece:NULL\\ncan:NULL\\n" | ${KEYED}`],
  clean: [`printf "ece:Bursa\\ncan:Konya\\nali:Konya\\n" | ${KEYED}`, "sleep 1m"],
  "forget-ece": [`printf "ece:NULL\\ncan:Konya\\nali:Bursa\\n" | ${KEYED}`, "sleep 1m", "sleep 2d"],
  "with-key": [`echo "can:Eskişehir" | ${KEYED}`],
  "turn-on": [CONFIG("cleanup.policy=compact")],
};

/** Other ways people really do it. */
const alternatives: Record<string, string[][]> = {
  "only-ali": [[`echo "ece:NULL" | ${KEYED}`, `echo "can:NULL" | ${KEYED}`]],
  clean: [[CONFIG("segment.bytes=1024"), `echo "ali:Konya" | ${KEYED}`, "sleep 30"]],
  "forget-ece": [[`printf "ece:NULL\\ncan:Konya\\nali:Bursa\\n" | ${KEYED}`, "sleep 2d", "sleep 2d"]],
  "with-key": [[`echo "can,Eskişehir" | kafka-console-producer.sh ${B} --topic ${TOPIC} --property parse.key=true --property key.separator=,`]],
  "turn-on": [[`kafka-configs.sh ${B} --alter --topic ${TOPIC} --add-config cleanup.policy=compact`]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "only-ali": [`printf "ece:\\ncan:\\n" | kafka-console-producer.sh ${B} --topic ${TOPIC} --property parse.key=true --property key.separator=:`],
  clean: ["sleep 1m"],
  "forget-ece": [`printf "ece:NULL\\ncan:Konya\\nali:Bursa\\n" | ${KEYED}`, "sleep 1m"],
  "with-key": [`echo "Eskişehir" | kafka-console-producer.sh ${B} --topic ${TOPIC}`],
  "turn-on": [CONFIG("retention.ms=-1")],
};

describe("log-compaction lesson", () => {
  const offsets = (step: number) => base.run.logs[base.ends[step]!]!.segments.map((s) => `${s.base}:${s.records.map((r) => r.offset).join(",")}`);

  it("plays the story the text tells", () => {
    expect(offsets(3)).toEqual(["0:2,4,5", "6:6"]);
    expect(offsets(4)).toEqual(["0:6,7,8", "9:9"]);
    expect(offsets(5)).toEqual(["0:9,10,11", "12:12"]);
    expect(offsets(6)).toEqual(["0:9,11", "12:12"]);
    expect([...tableOf(base.run.logs[base.ends[6]!]!).entries()]).toEqual([
      ["can", "İzmir"],
      ["ali", "Konya"],
    ]);
    expect(stepBeats).toHaveLength(10);
  });
});

describe("log-compaction scenarios", () => {
  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(playS(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = playS(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" ; ")}`, () => {
        expect(s.check(playS(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(playS(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }

  it("the cleaner removes nothing while the newer value sits in the active segment", () => {
    const r = playS(scenarios[1]!.start, ["sleep 1m"]);
    expect(allRecords(r.ctx.log).map((x) => x.offset)).toEqual([0, 1, 2, 3]);
  });
});
