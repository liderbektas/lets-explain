import { describe, expect, it } from "vitest";
import { playR } from "../../engine/replicationCli";
import { run, sandboxStart } from "./model";
import { scenarios } from "./scenarios";

const B = "--bootstrap-server localhost:9092";
const PRODUCE = `kafka-console-producer.sh ${B} --topic orders`;
const UNCLEAN = `kafka-configs.sh ${B} --alter --entity-type topics --entity-name orders --add-config unclean.leader.election.enable=true`;

/** The intended commands, in exactly par. */
const solutions: Record<string, string[]> = {
  "leader-down": ["docker stop kafka-1", `echo "order:5001" | ${PRODUCE}`],
  "slow-follower": ["docker pause kafka-3", `echo "order:5002" | ${PRODUCE}`, "sleep 30"],
  "back-in-sync": ["docker unpause kafka-3"],
  "invisible-order": ["docker unpause kafka-3"],
  "unclean-loss": ["docker pause kafka-3", `echo "order:5003" | ${PRODUCE}`, "sleep 30", "docker stop kafka-1 kafka-2", UNCLEAN],
};

/** Other ways people really do it. */
const alternatives: Record<string, string[][]> = {
  "leader-down": [["docker kill kafka-1", `kafka-topics.sh ${B} --describe`, `echo "order:5001" | ${PRODUCE} --producer-property acks=1`]],
  "slow-follower": [[`docker pause kafka-3 && echo "order:5002" | ${PRODUCE} --producer-property acks=1 && sleep 1m`]],
  "back-in-sync": [["docker restart kafka-3"]],
  "invisible-order": [["sleep 30"]],
  "unclean-loss": [["docker pause kafka-3", `echo "order:5003" | ${PRODUCE} --producer-property acks=1`, "sleep 30", "docker stop kafka-2", "docker stop kafka-1", UNCLEAN]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "leader-down": [`echo "order:5001" | ${PRODUCE}`, "docker stop kafka-1"],
  "slow-follower": ["docker stop kafka-3"],
  "back-in-sync": ["sleep 30"],
  "invisible-order": ["docker stop kafka-3"],
  "unclean-loss": ["docker stop kafka-1 kafka-2", `echo "order:5003" | ${PRODUCE}`, UNCLEAN],
};

describe("replication", () => {
  it("tells the story the steps describe", () => {
    const at = (step: number) => run.states[run.ends[step]!]!.partitions[0]!;
    expect(at(1).isr).toEqual([1, 2, 3]);
    expect(at(4)).toMatchObject({ hw: 5 });
    expect(at(5)).toMatchObject({ hw: 7, isr: [1, 2] });
    expect(at(6).isr).toEqual([1, 2, 3]);
    expect(at(7).leader).toBe(2);
    expect(at(9).leader).toBeNull();
    expect(sandboxStart.partitions[0]).toMatchObject({ leader: 1, isr: [1, 2, 3] });
    expect(sandboxStart.sends.every((x) => x.status !== "lost")).toBe(true);
    expect(sandboxStart.brokers.every((b) => b.alive && !b.slow)).toBe(true);
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
        expect(s.check(playR(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(playR(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }

  it("the producer hears about a late ack in a later command", () => {
    const r = playR(scenarios[1]!.start, solutions["slow-follower"]!);
    expect(r.output.some((l) => l.includes("got its ack"))).toBe(true);
  });
});
