import { applyReplicated, createReplicated, type RAction, type REvent, type RState } from "../../engine/replication";
import { buildRun, type Model, type SandboxCtx } from "../cluster-kit/kit";

/** One partition on three brokers; the lesson turns the acks and min.insync.replicas knobs. */

export const SLUG = "acks-and-isr";
export const model: Model<RState, RAction, REvent> = { apply: applyReplicated };
export type Ctx = SandboxCtx<RState, RAction, REvent>;

export const START = createReplicated({ brokers: 3, partitions: [[1, 2, 3]], config: { acks: "all", minIsr: 1 } });

let n = 1041;
const order = (): RAction => ({ type: "produce", value: `order:${n++}`, partition: 0 });
const slow = (broker: number, on = true): RAction => ({ type: "setSlow", broker, slow: on });

export const stepActions: RAction[][] = [
  [order(), order()],
  [{ type: "setAcks", acks: 0 }, order(), order()],
  [{ type: "setAcks", acks: 1 }, slow(2), slow(3), order()],
  [{ type: "crash", broker: 1 }],
  [slow(2, false), slow(3, false), { type: "restart", broker: 1 }, { type: "setAcks", acks: "all" }, order()],
  [slow(3), order(), { type: "tick" }],
  [slow(1), order(), { type: "tick" }],
  [{ type: "setMinIsr", value: 2 }, order()],
  [slow(1, false), slow(3, false), { type: "crash", broker: 3 }, order(), { type: "crash", broker: 1 }, order()],
  [],
  // Not shown: the try-it step starts with every broker back.
  [{ type: "restart", broker: 3 }, { type: "restart", broker: 1 }],
];

export const SANDBOX_STEP = stepActions.length - 1;
export const run = buildRun(model, START, stepActions);
export const sandboxStart = run.states[run.ends[SANDBOX_STEP]!]!;
