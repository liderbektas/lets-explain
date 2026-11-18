import { applyReplicated, createReplicated, type RAction, type REvent, type RState } from "../../engine/replication";
import { buildRun, type ControlRow, type Model, type SandboxCtx } from "../cluster-kit/kit";

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

export const sandboxOrder = (written: number): RAction => ({ type: "produce", value: `order:${2000 + written}`, partition: 0 });
export const writtenIn = (actions: RAction[]) => actions.filter((a) => a.type === "produce").length;

export function controls(s: RState, written: number): ControlRow<RAction>[] {
  const p = s.partitions[0]!;
  return [
    {
      key: "producer",
      name: { tr: "Producer", en: "Producer" },
      dot: "var(--sky)",
      buttons: [
        { key: "write", label: { tr: "Sipariş yaz", en: "Write order" }, action: sandboxOrder(written), tone: "producer" },
        { key: "tick", label: { tr: "30 sn geçsin", en: "Let 30 s pass" }, action: { type: "tick" } },
        {
          key: "unclean",
          label: s.config.unclean ? { tr: "Unclean: kapat", en: "Unclean: off" } : { tr: "Unclean: aç", en: "Unclean: on" },
          action: { type: "setUnclean", value: !s.config.unclean },
          tone: s.config.unclean ? "ok" : "danger",
        },
      ],
    },
    ...s.brokers.map((b) => ({
      key: `b${b.id}`,
      name: { tr: `Broker ${b.id}`, en: `Broker ${b.id}` },
      dot: b.alive ? "var(--sky)" : "#d8d2dc",
      buttons: [
        {
          key: "crash",
          label: b.alive ? { tr: "Çökert", en: "Crash" } : { tr: "Başlat", en: "Start" },
          action: (b.alive ? { type: "crash", broker: b.id } : { type: "restart", broker: b.id }) as RAction,
          tone: b.alive ? ("danger" as const) : ("ok" as const),
        },
        {
          key: "slow",
          label: b.slow ? { tr: "Hızlandır", en: "Speed up" } : { tr: "Yavaşlat", en: "Slow down" },
          // Only followers can fall behind; a leader is the one being copied.
          action: b.alive && (b.slow || p.leader !== b.id) ? ({ type: "setSlow", broker: b.id, slow: !b.slow } as RAction) : null,
        },
      ],
    })),
  ];
}
