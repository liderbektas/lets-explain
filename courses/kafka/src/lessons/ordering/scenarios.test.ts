import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { partitionForKey } from "../../engine/murmur2";
import { base, violations, type OEvent } from "./model";
import { KEYED, KEYLESS, orderingCtx, scenarios } from "./scenarios";
import { applyO, orderingShell, replayO, type OBox } from "./shell";

const B = "--bootstrap-server localhost:9092";
const GROW = `kafka-topics.sh ${B} --alter --topic orders --partitions 4`;
const DESCRIBE = `kafka-consumer-groups.sh ${B} --describe --group shipping`;
const lines = (order: string, ...events: string[]) => `printf "${events.map((e) => `${order}:${e}`).join("\\n")}\\n"`;

const play = (start: OBox, typed: string[]) => {
  const r = typeLines(orderingShell, applyO, start, typed);
  return { ctx: orderingCtx(start, replayO(start, r.actions)), moves: r.moves, output: r.output };
};

/** What a reader would type: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "keep-order": [`${lines("1043", "created", "paid", "shipped")} | ${KEYED}`, "kill -CONT %1", "sleep 3"],
  reproduce: [`${lines("1042", "created", "paid", "shipped")} | ${KEYLESS}`, "sleep 1"],
  "grow-breaks": [GROW, `echo "1045:paid" | ${KEYED}`, "sleep 1"],
  "drain-then-grow": ["kill -CONT %2", "sleep 1", GROW, `${lines("1045", "paid", "shipped")} | ${KEYED}`, "sleep 3"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "keep-order": [["kill -CONT %1", `echo "1043:created" | ${KEYED}`, `echo "1043:paid" | ${KEYED}`, `echo "1043:shipped" | ${KEYED}`, "sleep 5"]],
  reproduce: [["jobs", `echo "1042:created" | ${KEYLESS}`, `echo "1042:paid" | ${KEYLESS}`, "sleep 2"]],
  "drain-then-grow": [["jobs", "kill -CONT %2", "sleep 2", DESCRIBE, GROW, `${lines("1045", "paid", "shipped")} | ${KEYED}`, "sleep 2", "sleep 2"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  // Without a key the slow instance falls behind and the others overtake it.
  "keep-order": [`${lines("1043", "created", "paid", "shipped")} | ${KEYLESS}`, "sleep 3", "kill -CONT %1", "sleep 3"],
  // With a key all three go to one partition: nothing overtakes anything.
  reproduce: [`${lines("1042", "created", "paid", "shipped")} | ${KEYED}`, "sleep 1"],
  // Same partition count, same partition: the key keeps the order.
  "grow-breaks": [`echo "1045:paid" | ${KEYED}`, "kill -CONT %2", "sleep 2"],
  // Growing first: paid lands in the new partition and overtakes created.
  "drain-then-grow": [GROW, `${lines("1045", "paid", "shipped")} | ${KEYED}`, "kill -CONT %2", "sleep 3"],
};

describe("ordering", () => {
  it("keys land where the scenarios say", () => {
    expect(partitionForKey("1043", 3)).toBe(0);
    expect(partitionForKey("1042", 3)).toBe(2);
    expect(partitionForKey("1045", 3)).toBe(1);
    expect(partitionForKey("1045", 4)).toBe(0);
  });

  it("sends a key to the same partition until the partition count changes", () => {
    const written = base.run.events.flat().filter((e): e is Extract<OEvent, { type: "written" }> => e.type === "written");
    expect(new Set(written.filter((e) => e.order === "1043").map((e) => e.partition)).size).toBe(1);
    const p1045 = written.filter((e) => e.order === "1045").map((e) => e.partition);
    // Two events before the fourth partition, one after.
    expect(p1045[0]).toBe(p1045[1]);
    expect(p1045[2]).not.toBe(p1045[0]);
  });

  it("the lesson's steps show the order breaking where the text says", () => {
    const at = (step: number) => base.run.states[base.ends[step]!]!;
    expect(violations(at(1))).toBe(0);
    expect(violations(at(2))).toBe(2);
    expect(violations(at(4))).toBe(2);
    expect(violations(at(5))).toBe(2);
    expect(violations(at(6))).toBe(3);
  });

  it("an event out of the real sequence is refused, like the order service would never write it", () => {
    const r = play(scenarios[0]!.start, [`echo "1043:paid" | ${KEYED}`]);
    expect(r.moves).toBe(0);
    expect(r.output[0]).toContain("1043's next event is created");
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
