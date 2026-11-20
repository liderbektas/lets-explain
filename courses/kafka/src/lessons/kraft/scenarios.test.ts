import { describe, expect, it } from "vitest";
import { playK } from "./cli";
import { applyKraft, createKraft, run, sandboxStart, stranded } from "./model";
import { scenarios } from "./scenarios";

const B = "--bootstrap-server localhost:9092";

/** The intended commands, in exactly par. */
const solutions: Record<string, string[]> = {
  "new-active": ["docker stop controller-1", `kafka-topics.sh ${B} --create --topic invoices`],
  frozen: ["docker stop controller-1 controller-2", `kafka-topics.sh ${B} --create --topic invoices`],
  stranded: ["docker stop controller-1 controller-2", "docker stop kafka-2"],
  rescue: ["docker start controller-1"],
  "welcome-back": ["docker start kafka-3"],
};

/** Other ways people really do it. */
const alternatives: Record<string, string[][]> = {
  "new-active": [[`kafka-metadata-quorum.sh ${B} describe --status`, "docker kill controller-1", `kafka-topics.sh ${B} --create --topic audit --partitions 3`]],
  frozen: [["docker stop controller-2", "docker stop controller-3", `kafka-topics.sh ${B} --create --topic invoices`]],
  stranded: [["docker stop controller-3 controller-1", "docker stop kafka-1"]],
  rescue: [["docker start controller-2"], ["docker start kafka-2", "docker start controller-1"]],
  "welcome-back": [["docker restart kafka-3"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  "new-active": [`kafka-topics.sh ${B} --create --topic invoices`, "docker stop controller-1"],
  frozen: ["docker stop controller-1", `kafka-topics.sh ${B} --create --topic invoices`],
  stranded: ["docker stop kafka-2", "docker stop controller-1 controller-2"],
  rescue: ["docker start kafka-2"],
  "welcome-back": ["docker restart controller-1"],
};

describe("KRaft model", () => {
  it("moves leadership off a crashed broker through the metadata log", () => {
    const r = applyKraft(createKraft(), { type: "crashBroker", id: 2 });
    expect(r.state.partitions[1]!.leader).toBe(3);
    expect(r.state.controllers.every((c) => c.log.length === r.state.committed)).toBe(true);
  });

  it("elects a new active controller while a majority is up, and freezes without one", () => {
    let s = applyKraft(createKraft(), { type: "crashController", id: 1 }).state;
    expect(s.active).toBe(2);
    s = applyKraft(s, { type: "crashController", id: 2 }).state;
    expect(s.active).toBeNull();
    const r = applyKraft(s, { type: "crashBroker", id: 3 });
    expect(stranded(r.state).map((p) => p.index)).toEqual([2]);
  });

  it("tells the story the steps describe", () => {
    const end = (step: number) => run.states[run.ends[step]!]!;
    expect(end(4).partitions[1]!.leader).toBe(3);
    expect(end(6).active).toBe(2);
    expect(end(7).active).toBeNull();
    expect(stranded(end(7)).length).toBeGreaterThan(0);
    expect(end(8).active).not.toBeNull();
    expect(stranded(end(8))).toHaveLength(0);
    expect(sandboxStart.controllers.every((c) => c.alive)).toBe(true);
    expect(sandboxStart.active).toBe(1);
    expect(sandboxStart.brokers.every((b) => b.alive && !b.fenced)).toBe(true);
  });
});

describe("kraft scenarios", () => {
  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(playK(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = playK(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" ; ")}`, () => {
        expect(s.check(playK(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(playK(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }

  it("prints the quorum like kafka-metadata-quorum, and times out without one", () => {
    const ok = playK(scenarios[0]!.start, [`kafka-metadata-quorum.sh ${B} describe --status`]).output;
    expect(ok[1]).toBe("LeaderId:               1");
    expect(ok.at(-1)).toBe("CurrentVoters:          [1,2,3]");
    const frozen = playK(scenarios[3]!.start, [`kafka-metadata-quorum.sh ${B} describe --status`]).output;
    expect(frozen[0]).toContain("TimeoutException");
    const stale = playK(scenarios[3]!.start, [`kafka-topics.sh ${B} --describe --topic orders`]).output;
    expect(stale[2]).toContain("Leader: 2");
  });
});
