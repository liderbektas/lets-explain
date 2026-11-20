import type { Action, ClusterState } from "../../engine/types";
import { l, type L } from "@lets-explain/core/i18n";
import { TINTS, type Tint } from "@lets-explain/core/iso/shapes";
import { runMoves, stateAfter } from "../shared/topicSim";

/** One topic that grows from one partition to three, read by the billing group. */

export const TOPIC = "orders";
export const GROUP = "billing";

export interface ReaderDef {
  id: string;
  name: L;
  tint: Tint;
}

export const READERS: ReaderDef[] = [
  { id: "billing-1", name: l("Fatura 1", "Billing 1"), tint: TINTS.coral },
  { id: "billing-2", name: l("Fatura 2", "Billing 2"), tint: TINTS.lilac },
  { id: "billing-3", name: l("Fatura 3", "Billing 3"), tint: TINTS.sun },
  { id: "billing-4", name: l("Fatura 4", "Billing 4"), tint: TINTS.mint },
];

export const readerDef = (id: string) => READERS.find((r) => r.id === id) ?? READERS[0]!;

let order = 1100;
const produce = (): Action => ({ type: "produce", topic: TOPIC, value: `order:${order++}`, producer: "orders-service" });
export const produceValue = (value: string): Action => ({ type: "produce", topic: TOPIC, value, producer: "orders-service" });
export const join = (id: string): Action => ({ type: "joinGroup", group: GROUP, member: id, topics: [TOPIC], autoOffsetReset: "earliest" });
export const poll = (id: string, max?: number): Action => ({ type: "poll", group: GROUP, member: id, max });
export const grow = (count: number): Action => ({ type: "addPartitions", topic: TOPIC, count });
export const commit = (id: string): Action => ({ type: "commit", group: GROUP, member: id });

/** Three brokers, so step 7 can show partitions spread over them. */
const START = stateAfter([{ type: "createTopic", name: TOPIC, partitions: 1 }], 3);

/** Each step's actions. Built once at load; nothing here can throw. */
export const stepActions: Action[][] = (() => {
  order = 1100;
  return [
    [produce(), produce(), produce()],
    [join("billing-1"), poll("billing-1", 1), produce(), produce(), poll("billing-1", 1), produce(), produce(), commit("billing-1")],
    [grow(3)],
    [produce(), produce(), produce(), produce(), produce(), produce()],
    [poll("billing-1", 3), poll("billing-1", 3), commit("billing-1")],
    [
      produce(),
      produce(),
      produce(),
      produce(),
      produce(),
      produce(),
      join("billing-2"),
      join("billing-3"),
      poll("billing-1", 2),
      poll("billing-2", 2),
      poll("billing-3", 2),
      commit("billing-1"),
      commit("billing-2"),
      commit("billing-3"),
    ],
    [],
    [join("billing-4"), poll("billing-4")],
    [],
  ];
})();

export const SANDBOX_STEP = stepActions.length - 1;

export const base = (() => {
  const run = runMoves(START, stepActions.flat().map((a) => [a]));
  const ends: number[] = [];
  let n = 0;
  for (const actions of stepActions) {
    n += actions.length;
    ends.push(n);
  }
  const startOf = (step: number) => (step === 0 ? 0 : ends[step - 1]!);
  return { run, ends, startOf };
})();

/* ------------------------------------------------------------- sandbox */

/** Where the button sandbox used to start; the typed scenarios bring their own states. */
export const sandboxStart: ClusterState = stateAfter(
  [
    { type: "createTopic", name: TOPIC, partitions: 1 },
    produceValue("order:2001"),
    produceValue("order:2002"),
    produceValue("order:2003"),
    produceValue("order:2004"),
    join("billing-1"),
  ],
  3,
);
