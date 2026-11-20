import { describe, expect, it } from "vitest";
import { playS } from "../../engine/storageCli";
import { sandboxStart } from "./model";
import { scenarios } from "./scenarios";

const B = "--bootstrap-server localhost:9092";
const PRODUCE = `kafka-console-producer.sh ${B} --topic orders`;
const CONFIG = (kv: string) => `kafka-configs.sh ${B} --alter --entity-type topics --entity-name orders --add-config ${kv}`;

/** The intended commands, in exactly par. */
const solutions: Record<string, string[]> = {
  roll: [`printf "order:1\\norder:2\\norder:3\\n" | ${PRODUCE}`],
  "start-at-3": ["sleep 5d", `echo "order:9" | ${PRODUCE}`, "sleep 3d"],
  "old-survivor": ["sleep 6d", `printf "order:1\\norder:2\\norder:3\\n" | ${PRODUCE}`, "sleep 2d"],
  "disk-full": [CONFIG("retention.ms=259200000")],
  "size-cap": [CONFIG("retention.bytes=4096")],
};

/** Other ways people really do it. */
const alternatives: Record<string, string[][]> = {
  roll: [[`echo "order:1" | ${PRODUCE}`, `echo "order:2" | ${PRODUCE}`, `echo "order:3" | ${PRODUCE}`], [CONFIG("segment.bytes=1024"), `echo "order:1" | ${PRODUCE}`]],
  "start-at-3": [["sleep 3d", `echo "order:9" | ${PRODUCE}`, CONFIG("retention.ms=172800000")]],
  "old-survivor": [["sleep 3d", `echo "order:1" | ${PRODUCE}`, "sleep 6d", `echo "order:2" | ${PRODUCE}`]],
  "disk-full": [[`kafka-configs.sh ${B} --alter --topic orders --add-config retention.ms=259200000`]],
  "size-cap": [[CONFIG("retention.bytes=4500")]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  roll: ["sleep 8d"],
  "start-at-3": ["sleep 8d"],
  "old-survivor": ["sleep 8d", `printf "order:1\\norder:2\\norder:3\\n" | ${PRODUCE}`],
  "disk-full": [CONFIG("retention.ms=3")],
  "size-cap": [CONFIG("retention.bytes=4")],
};

describe("segments-and-retention", () => {
  it("starts with one closed segment and an active one", () => {
    expect(sandboxStart.segments.map((s) => s.base)).toEqual([0, 3]);
  });

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

  it("letting everything expire empties the log instead of starting it at 3", () => {
    const r = playS(scenarios[1]!.start, ["sleep 9d", `kafka-get-offsets.sh ${B} --topic orders --time -2`]);
    expect(r.ctx.log.logStartOffset).toBe(4);
    expect(r.output.at(-1)).toBe("orders:0:4");
  });
});
