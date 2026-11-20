import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { assignment, HOT_PARTITION, KEEP, lagOf, steps, SANDBOX_STEP, totalLag } from "./model";
import { DESCRIBE, lagCtx, RUN, scenarios } from "./scenarios";
import { applyLag, lagShell, replayLag, type LagBox } from "./shell";

const threads2 = (text: string) => text.replace("processing.threads=1", "processing.threads=2");
const byUser = (text: string) => text.replace("key.field=city", "key.field=user");

const play = (start: LagBox, typed: string[], edits: ((t: string) => string)[] = []) => {
  const r = typeLines(lagShell, applyLag, start, typed, edits);
  return { ctx: lagCtx(start, replayLag(start, r.actions)), moves: r.moves, output: r.output };
};

interface Way {
  typed: string[];
  edits?: ((t: string) => string)[];
}

/** What a reader would type: the intended way, in exactly par commands. */
const solutions: Record<string, Way> = {
  "catch-up": { typed: [RUN, RUN, "sleep 3"] },
  "one-server": { typed: ["nano analytics.properties", "kill %1", RUN, "sleep 10"], edits: [threads2] },
  "no-loss": { typed: [RUN, RUN, RUN, "sleep 10"] },
  "hot-key": { typed: ["nano clicks-producer.properties", "./deploy-clicks.sh", "sleep 10"], edits: [byUser] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  "catch-up": [{ typed: [DESCRIBE, RUN, RUN, RUN, "sleep 5", DESCRIBE] }],
  // A rolling restart: the new instance first, then the old one goes.
  "one-server": [{ typed: ["cat analytics.properties", "nano analytics.properties", RUN, "kill %1", "sleep 10"], edits: [threads2] }],
  "no-loss": [{ typed: [RUN, RUN, RUN, "sleep 3", DESCRIBE, "sleep 5"] }],
  "hot-key": [{ typed: [DESCRIBE, "nano clicks-producer.properties", "./deploy-clicks.sh", "sleep 5", "sleep 5"], edits: [byUser] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  "catch-up": { typed: ["sleep 10"] },
  // A second instance breaks "no new servers".
  "one-server": { typed: [RUN, "sleep 10"] },
  // One instance is too slow: retention gets there first.
  "no-loss": { typed: [RUN, "sleep 6", RUN, RUN, "sleep 5"] },
  // More readers can't share one hot partition.
  "hot-key": { typed: [RUN, "sleep 5"] },
};

describe("consumer-lag", () => {
  const at = (step: number) => {
    const run = steps[step]!.run;
    return run.states[run.states.length - 1]!;
  };

  it("every lesson step runs", () => {
    expect(steps).toHaveLength(SANDBOX_STEP + 1);
  });

  it("lag is log-end offset minus committed offset", () => {
    const s = at(0);
    expect(s.partitions[0]!.logEnd).toBe(6);
    expect(s.partitions[0]!.committed).toBe(2);
    expect(totalLag(s)).toBe(4);
    expect(totalLag(at(1))).toBe(4);
    expect(totalLag(at(2))).toBe(7);
  });

  it("one consumer falls behind on three partitions, three catch up; a fourth gets nothing", () => {
    expect(totalLag(at(3))).toBe(12);
    expect(totalLag(at(4))).toBe(3);
    expect(totalLag(at(5))).toBe(0);
    const s = at(5);
    expect(assignment(s)[s.members[3]!]).toEqual([]);
  });

  it("the hot partition keeps growing until the code gets faster; retention deletes what nobody read", () => {
    expect(lagOf(at(6).partitions[HOT_PARTITION]!)).toBe(4);
    expect(totalLag(at(7))).toBe(1);
    expect(at(8).missed).toBe(3);
  });

  it("the hot scenario starts with the lag on the hot partition", () => {
    const hot = scenarios.find((s) => s.id === "hot-key")!.start.lag;
    expect(hot.partitions[HOT_PARTITION]!.logEnd).toBe(KEEP);
  });

  it("describe prints the real columns", () => {
    const r = play(scenarios[0]!.start, [DESCRIBE]);
    expect(r.output[1]).toMatch(/^GROUP\s+TOPIC\s+PARTITION\s+CURRENT-OFFSET\s+LOG-END-OFFSET\s+LAG\s+CONSUMER-ID\s+CLIENT-ID$/);
    expect(r.output[2]).toMatch(/^analytics\s+clicks\s+0\s+0\s+2\s+2\s/);
  });

  it("an instance keeps the setting it started with", () => {
    const r = play(scenarios[1]!.start, ["nano analytics.properties", "sleep 10"], [threads2]);
    expect(totalLag(r.ctx.state)).toBeGreaterThan(0);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(play(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const way = solutions[s.id]!;
      const r = play(s.start, way.typed, [...(way.edits ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.typed.join(" ; ").slice(0, 60)}…`, () => {
        expect(s.check(play(s.start, alt.typed, [...(alt.edits ?? [])]).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const way = wrong[s.id]!;
      expect(s.check(play(s.start, way.typed, [...(way.edits ?? [])]).ctx)).toBe(false);
    });
  }
});
