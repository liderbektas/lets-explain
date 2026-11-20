import { describe, expect, it } from "vitest";
import { applyReplicated, createReplicated, simulateReplicated, type RAction, type RState } from "../../engine/replication";
import { toStage } from "./kit";

const rf3 = () => createReplicated({ brokers: 3, partitions: [[1, 2, 3]], config: {} });
const after = (actions: RAction[], start: RState) => simulateReplicated(actions, start).states.at(-1)!;
const name = (id: number) => `B${id}`;

/** Which way each record on each broker arrived in the latest action, for partition 0. */
function arrivals(state: RState, action: RAction) {
  const r = applyReplicated(state, action);
  const stage = toStage(r.state, { brokerName: name, events: r.events });
  return Object.fromEntries(
    stage.partitions[0]!.replicas.map((rep) => [rep.broker, rep.records.filter((x) => x.arrived).map((x) => `${x.offset}:${x.arrived}`)]),
  );
}

describe("toStage arrivals: new records travel the way the engine says they came", () => {
  it("a write lands on the leader from the producer and the followers copy it from the leader", () => {
    expect(arrivals(rf3(), { type: "produce", value: "a" })).toEqual({ 1: ["0:producer"], 2: ["0:copy"], 3: ["0:copy"] });
  });

  it("nothing is marked when no record moved", () => {
    const s = after([{ type: "produce", value: "a" }], rf3());
    expect(arrivals(s, { type: "setAcks", acks: 1 })).toEqual({ 1: [], 2: [], 3: [] });
  });

  it("a follower that comes back copies exactly the records it missed", () => {
    const s = after([{ type: "produce", value: "a" }, { type: "crash", broker: 3 }, { type: "produce", value: "b" }, { type: "produce", value: "c" }], rf3());
    expect(arrivals(s, { type: "restart", broker: 3 })).toEqual({ 1: [], 2: [], 3: ["1:copy", "2:copy"] });
  });

  it("a write that is rejected moves nothing", () => {
    const s = after([{ type: "crash", broker: 1 }, { type: "crash", broker: 2 }, { type: "crash", broker: 3 }], rf3());
    expect(arrivals(s, { type: "produce", value: "a" })).toEqual({ 1: [], 2: [], 3: [] });
  });

  it("a reassignment copies the whole log onto the broker it adds", () => {
    const s = after([{ type: "addBroker" }, { type: "produce", value: "a" }, { type: "produce", value: "b" }], rf3());
    const moved = arrivals(s, { type: "reassign", partition: 0, replicas: [1, 2, 4] });
    expect(moved[4]).toEqual(["0:copy", "1:copy"]);
    expect(moved[1]).toEqual([]);
  });
});
