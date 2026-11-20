import { applyReplicated, createReplicated, type RAction, type REvent, type RState } from "../../engine/replication";
import { buildRun, type Model, type SandboxCtx } from "../cluster-kit/kit";

/** One topic with three partitions, one copy each (replication.factor = 1). */

export const SLUG = "brokers-and-clusters";
export const model: Model<RState, RAction, REvent> = { apply: applyReplicated };
export type Ctx = SandboxCtx<RState, RAction, REvent>;

/** Everything starts on a single broker. */
export const START = createReplicated({ brokers: 1, partitions: [[1], [1], [1]] });

let n = 1041;
const order = (partition?: number): RAction => ({ type: "produce", value: `order:${n++}`, partition });

export const stepActions: RAction[][] = [
  [order(0), order(1), order(2)],
  [{ type: "addBroker" }, { type: "addBroker" }, { type: "reassign", partition: 1, replicas: [2] }, { type: "reassign", partition: 2, replicas: [3] }],
  [order(2), order(2)],
  [],
  [order(), order(), order(), order(), order(), order()],
  [{ type: "addBroker" }],
  [{ type: "reassign", partition: 2, replicas: [4] }],
  [{ type: "crash", broker: 2 }, order(1), order(0)],
  [{ type: "restart", broker: 2 }, order(1)],
  [],
];

export const SANDBOX_STEP = stepActions.length - 1;
export const run = buildRun(model, START, stepActions);
export const sandboxStart = run.states[run.ends[SANDBOX_STEP]!]!;
