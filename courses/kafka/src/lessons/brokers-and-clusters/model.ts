import { applyReplicated, createReplicated, type RAction, type REvent, type RState } from "../../engine/replication";
import { buildRun, type ControlRow, type Model, type SandboxCtx } from "../cluster-kit/kit";
import { partitionTint } from "../cluster-kit/kit";

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

/** Sandbox orders continue the numbering after the lesson's last one. */
export const sandboxOrder = (written: number, partition: number): RAction => ({
  type: "produce",
  value: `order:${2000 + written}`,
  partition,
});

/** The stage fits four buildings side by side. */
const MAX_BROKERS = 4;

/** The try-it buttons for a state. Disabled buttons have no action. */
export function controls(s: RState, written: number): ControlRow<RAction>[] {
  const rows: ControlRow<RAction>[] = s.partitions.map((p) => ({
    key: `p${p.index}`,
    name: { tr: `P${p.index}`, en: `P${p.index}` },
    dot: partitionTint(p.index).body,
    buttons: [
      { key: "write", label: { tr: "Yaz", en: "Write" }, action: sandboxOrder(written, p.index), tone: "producer" as const },
      ...s.brokers.map((b) => ({
        key: `move-${b.id}`,
        label: { tr: `→ B${b.id}`, en: `→ B${b.id}` },
        action:
          p.leader !== null && b.alive && !p.replicas.includes(b.id)
            ? ({ type: "reassign", partition: p.index, replicas: [b.id] } as RAction)
            : null,
      })),
    ],
  }));
  rows.push({
    key: "brokers",
    name: { tr: "Broker", en: "Brokers" },
    dot: "var(--ink-3)",
    buttons: [
      ...s.brokers.map((b) => ({
        key: `b${b.id}`,
        label: b.alive ? { tr: `B${b.id} çökert`, en: `Crash B${b.id}` } : { tr: `B${b.id} başlat`, en: `Start B${b.id}` },
        action: (b.alive ? { type: "crash", broker: b.id } : { type: "restart", broker: b.id }) as RAction,
        tone: b.alive ? ("danger" as const) : ("ok" as const),
      })),
      { key: "add", label: { tr: "+ Broker", en: "+ Broker" }, action: s.brokers.length < MAX_BROKERS ? { type: "addBroker" } : null, tone: "ok" },
    ],
  });
  return rows;
}

export const writtenIn = (actions: RAction[]) => actions.filter((a) => a.type === "produce").length;
