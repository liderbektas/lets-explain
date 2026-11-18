import { describe, expect, it } from "vitest";
import { groupStats } from "../../engine/cluster";
import { base, GROUP, TOPIC } from "./model";

const after = (step: number) => base.run.states[base.ends[step]!]!;
const produced = (step: number) =>
  base.run.events.slice(base.startOf(step), base.ends[step]!).flat().flatMap((e) => (e.type === "produced" ? [[e.partition, e.offset]] : []));

describe("producers-and-keys steps match the text", () => {
  it("step 2: keyless Ali events go to three partitions", () => {
    expect(produced(1).map((p) => p[0])).toEqual([0, 1, 2]);
  });
  it("step 3: keyed Ali events all go to P0", () => {
    expect(produced(2)).toEqual([[0, 2], [0, 3], [0, 4]]);
  });
  it("step 4: mehmet → P1, zeynep → P2", () => {
    expect(produced(3).map((p) => p[0])).toEqual([1, 2, 1]);
  });
  it("step 5: can shares P0", () => {
    expect(produced(4)).toEqual([[0, 5]]);
  });
  it("step 6: P0 is the hot partition and lags", () => {
    const s = after(5);
    expect(s.topics[TOPIC]!.partitions.map((p) => p.records.length)).toEqual([11, 4, 3]);
    expect(groupStats(s, GROUP).lag).toBe(7);
    expect(groupStats(s, GROUP).duplicates).toBe(0);
  });
  it("step 7: after growing, Ali's new order goes to P3", () => {
    expect(produced(6)).toEqual([[3, 0]]);
  });
  it("step 8: an explicit partition beats the key", () => {
    expect(produced(7)).toEqual([[0, 11]]);
  });
});
