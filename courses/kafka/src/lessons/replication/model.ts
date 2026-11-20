import { applyReplicated, createReplicated, type RAction, type REvent, type RState } from "../../engine/replication";
import { buildRun, type Model, type SandboxCtx } from "../cluster-kit/kit";

/** One partition, three brokers. It starts with a single copy and grows to three. */

export const SLUG = "replication";
export const model: Model<RState, RAction, REvent> = { apply: applyReplicated };
export type Ctx = SandboxCtx<RState, RAction, REvent>;

export const START = createReplicated({ brokers: 3, partitions: [[1]], config: { acks: "all", minIsr: 1 } });

let n = 1041;
const order = (): RAction => ({ type: "produce", value: `order:${n++}`, partition: 0 });

export const stepActions: RAction[][] = [
  [order(), order(), order()],
  [{ type: "reassign", partition: 0, replicas: [1, 2, 3] }],
  [order(), order()],
  [],
  [{ type: "setSlow", broker: 3, slow: true }, order(), order()],
  [{ type: "tick" }],
  [{ type: "setSlow", broker: 3, slow: false }],
  [{ type: "crash", broker: 1 }, order()],
  [{ type: "restart", broker: 1 }],
  [{ type: "setSlow", broker: 3, slow: true }, order(), { type: "tick" }, { type: "crash", broker: 2 }, { type: "crash", broker: 1 }],
  // Not shown: the try-it step starts from a healthy cluster again.
  [{ type: "restart", broker: 1 }, { type: "restart", broker: 2 }, { type: "setSlow", broker: 3, slow: false }],
];

export const SANDBOX_STEP = stepActions.length - 1;
export const run = buildRun(model, START, stepActions);
export const sandboxStart = run.states[run.ends[SANDBOX_STEP]!]!;
