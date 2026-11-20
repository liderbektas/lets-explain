import { describe, expect, it } from "vitest";
import { playR } from "../../engine/replicationCli";
import { run, sandboxStart } from "./model";
import { scenarios } from "./scenarios";

const B = "--bootstrap-server localhost:9092";
const PRODUCE = `kafka-console-producer.sh ${B} --topic orders`;
const CONFIG = (kv: string) => `kafka-configs.sh ${B} --alter --entity-type topics --entity-name orders --add-config ${kv}`;

/** The intended commands, in exactly par. */
const solutions: Record<string, string[]> = {
  "payments-safe": [CONFIG("min.insync.replicas=2"), `echo "payment:7001" | ${PRODUCE} --producer-property acks=all`],
  "acked-loss": ["docker pause kafka-1 kafka-3", `echo "order:7002" | ${PRODUCE} --producer-property acks=1`, "docker stop kafka-2"],
  "door-closed": ["docker stop kafka-1 kafka-3", `echo "order:7003" | ${PRODUCE}`],
  "keep-taking": [CONFIG("min.insync.replicas=1"), "docker stop kafka-1 kafka-3", `echo "order:7004" | ${PRODUCE}`],
  "after-append": ["docker pause kafka-1 kafka-3", `echo "order:7005" | ${PRODUCE}`, "sleep 30"],
};

/** Other ways people really do it. */
const alternatives: Record<string, string[][]> = {
  "payments-safe": [[CONFIG("min.insync.replicas=2"), `echo "payment:7001" | ${PRODUCE}`], [CONFIG("min.insync.replicas=2"), "nano producer.properties", `echo "payment:7001" | ${PRODUCE} --producer.config producer.properties`]],
  "acked-loss": [["docker pause kafka-1", "docker pause kafka-3", `echo "order:7002" | ${PRODUCE} --request-required-acks 1`, "docker kill kafka-2"]],
  "door-closed": [["docker stop kafka-2", "docker stop kafka-3", `echo "order:7003" | ${PRODUCE}`]],
  "keep-taking": [["docker stop kafka-2 kafka-3", CONFIG("min.insync.replicas=1"), `echo "order:7004" | ${PRODUCE}`]],
  "after-append": [["docker pause kafka-3", "docker pause kafka-1", `echo "order:7005" | ${PRODUCE} --producer-property acks=all`, "sleep 1m"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "payments-safe": [CONFIG("min.insync.replicas=2"), `echo "payment:7001" | ${PRODUCE} --producer-property acks=1`],
  "acked-loss": ["docker pause kafka-1 kafka-3", `echo "order:7002" | ${PRODUCE}`, "docker stop kafka-2"],
  "door-closed": ["docker stop kafka-1 kafka-3", `echo "order:7003" | ${PRODUCE} --producer-property acks=1`],
  "keep-taking": ["docker stop kafka-1 kafka-3", `echo "order:7004" | ${PRODUCE} --producer-property acks=1`],
  "after-append": ["docker stop kafka-1 kafka-3", `echo "order:7005" | ${PRODUCE}`],
};

/** A producer.properties with acks=all, for the alternative that reads it. */
const edits: Record<string, (() => string)[]> = { "payments-safe": [() => "acks=all"] };

describe("acks-and-isr lesson", () => {
  it("tells the story the steps describe", () => {
    const end = (step: number) => run.states[run.ends[step]!]!;
    const statusOf = (step: number) => end(step).sends.map((x) => x.status);
    expect(statusOf(0)).toEqual(["acked", "acked"]);
    expect(statusOf(1).slice(2)).toEqual(["sent", "sent"]);
    expect(statusOf(2)[4]).toBe("acked");
    expect(statusOf(3)[4]).toBe("lost");
    expect(end(5).sends[6]!.status).toBe("acked");
    expect(end(6).partitions[0]!.isr).toEqual([2]);
    expect(end(6).sends[7]!.status).toBe("acked");
    expect(end(7).sends[8]).toMatchObject({ status: "failed", reason: "notEnoughReplicas" });
    expect(end(8).sends.slice(9).map((x) => x.status)).toEqual(["acked", "failed"]);
    expect(sandboxStart.partitions[0]).toMatchObject({ leader: 2, isr: [1, 2, 3] });
    expect(sandboxStart.config).toMatchObject({ acks: "all", minIsr: 2 });
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(playR(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = playR(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" ; ")}`, () => {
        expect(s.check(playR(s.start, alt, [...(edits[s.id] ?? [])]).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(playR(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }

  it("prints Kafka's errors where the reader meets them", () => {
    expect(playR(scenarios[2]!.start, solutions["door-closed"]!).output.at(-1)).toContain("NotEnoughReplicasException");
    expect(playR(scenarios[4]!.start, solutions["after-append"]!).output.at(-1)).toContain("NotEnoughReplicasAfterAppendException");
  });
});
