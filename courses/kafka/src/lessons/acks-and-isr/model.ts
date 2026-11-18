import { applyReplicated, createReplicated, type Acks, type RAction, type REvent, type RState } from "../../engine/replication";
import { buildRun, type ControlRow, type Model, type SandboxCtx } from "../cluster-kit/kit";

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

export const sandboxOrder = (written: number): RAction => ({ type: "produce", value: `order:${2000 + written}`, partition: 0 });
export const writtenIn = (actions: RAction[]) => actions.filter((a) => a.type === "produce").length;

const ACKS: Acks[] = [0, 1, "all"];

export function controls(s: RState, written: number): ControlRow<RAction>[] {
  const p = s.partitions[0]!;
  return [
    {
      key: "producer",
      name: { tr: "Producer", en: "Producer" },
      dot: "var(--sky)",
      buttons: [
        { key: "write", label: { tr: "Sipariş yaz", en: "Write order" }, action: sandboxOrder(written), tone: "producer" },
        ...ACKS.map((a) => ({
          key: `acks-${a}`,
          label: { tr: `acks=${a}`, en: `acks=${a}` },
          action: s.config.acks === a ? null : ({ type: "setAcks", acks: a } as RAction),
        })),
      ],
    },
    {
      key: "cluster",
      name: { tr: "Ayar", en: "Settings" },
      dot: "var(--sun)",
      buttons: [
        ...[1, 2, 3].map((v) => ({
          key: `min-${v}`,
          label: { tr: `min.insync=${v}`, en: `min.insync=${v}` },
          action: s.config.minIsr === v ? null : ({ type: "setMinIsr", value: v } as RAction),
        })),
        { key: "tick", label: { tr: "30 sn geçsin", en: "Let 30 s pass" }, action: { type: "tick" } },
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
          action: b.alive && (b.slow || p.leader !== b.id) ? ({ type: "setSlow", broker: b.id, slow: !b.slow } as RAction) : null,
        },
      ],
    })),
  ];
}
