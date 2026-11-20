import { describe, expect, it } from "vitest";
import { playR } from "../../engine/replicationCli";
import { run, SANDBOX_STEP, sandboxStart } from "./model";
import { MOVE_JSON, scenarios } from "./scenarios";

const B = "--bootstrap-server localhost:9092";
const EXECUTE = `kafka-reassign-partitions.sh ${B} --reassignment-json-file move.json --execute`;
const plan = (p: number, b: number) => () => MOVE_JSON(p, b);

/** The intended commands, in exactly par, and the editor saves they need. */
const solutions: Record<string, { typed: string[]; edits?: (() => string)[] }> = {
  "idle-broker": { typed: ["nano move.json", EXECUTE], edits: [plan(0, 3)] },
  maintenance: { typed: ["nano move.json", EXECUTE, "docker stop kafka-1"], edits: [plan(0, 3)] },
  outage: { typed: ["docker start kafka-2", `printf "order:1\\norder:2\\norder:3\\n" | kafka-console-producer.sh ${B} --topic orders`] },
  "new-server": { typed: ["docker compose up -d kafka-4", "nano move.json", EXECUTE], edits: [plan(2, 4)] },
};

/** Other ways people really do it. */
const alternatives: Record<string, { typed: string[]; edits?: (() => string)[] }[]> = {
  "idle-broker": [{ typed: [`echo '${MOVE_JSON(0, 3)}' > move.json`, `kafka-topics.sh ${B} --describe`, EXECUTE] }],
  maintenance: [{ typed: [`echo '${MOVE_JSON(0, 3)}' > move.json && ${EXECUTE} && docker stop kafka-1`] }],
  outage: [{ typed: ["docker compose up -d kafka-2", `echo "mehmet:order" | kafka-console-producer.sh ${B} --topic orders --property parse.key=true --property key.separator=:`] }],
  "new-server": [{ typed: ["docker compose up -d kafka-4", `echo '${MOVE_JSON(2, 4)}' > move.json`, `kafka-reassign-partitions.sh ${B} --reassignment-json-file move.json --execute`] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, { typed: string[]; edits?: (() => string)[] }> = {
  "idle-broker": { typed: ["nano move.json", EXECUTE], edits: [plan(1, 3)] },
  maintenance: { typed: ["docker stop kafka-1", "nano move.json", EXECUTE], edits: [plan(0, 3)] },
  outage: { typed: [`printf "order:1\\norder:2\\norder:3\\n" | kafka-console-producer.sh ${B} --topic orders`, "docker start kafka-2"] },
  "new-server": { typed: ["nano move.json", EXECUTE, "docker compose up -d kafka-4"], edits: [plan(2, 4)] },
};

describe("brokers-and-clusters", () => {
  it("lays the lesson out as expected", () => {
    const s = sandboxStart;
    expect(s.brokers.map((b) => b.id)).toEqual([1, 2, 3, 4]);
    expect(s.partitions.map((p) => p.leader)).toEqual([1, 2, 4]);
    // The crash step: P1 rejected a write while broker 2 was down.
    const crashStep = run.events.slice(run.startOf(7), run.ends[7]).flat();
    expect(crashStep.some((e) => e.type === "rejected" && e.partition === 1)).toBe(true);
    expect(SANDBOX_STEP).toBe(9);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(playR(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const sol = solutions[s.id]!;
      const r = playR(s.start, sol.typed, [...(sol.edits ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.typed.join(" ; ")}`, () => {
        expect(s.check(playR(s.start, alt.typed, [...(alt.edits ?? [])]).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const w = wrong[s.id]!;
      expect(s.check(playR(s.start, w.typed, [...(w.edits ?? [])]).ctx)).toBe(false);
    });
  }

  it("refuses to move a partition off a stopped broker, as Kafka does", () => {
    const r = playR(scenarios[1]!.start, ["docker stop kafka-1", "nano move.json", EXECUTE], [plan(0, 3)]);
    expect(r.output.at(-1)).toContain("has no leader to copy from");
  });
});
