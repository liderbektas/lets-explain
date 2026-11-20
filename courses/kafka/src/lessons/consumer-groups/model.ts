import type { Action, ClusterState } from "../../engine/types";
import { l, type L } from "@lets-explain/core/i18n";
import { TINTS, type Tint } from "@lets-explain/core/iso/shapes";
import { runMoves, stateAfter } from "../shared/topicSim";

/** One 3-partition topic read by the billing group (up to 4 members) and, later, the analytics group. */

export const TOPIC = "orders";
export const BILLING = "billing";
export const ANALYTICS = "analytics";

export interface MemberDef {
  id: string;
  group: string;
  name: L;
  tint: Tint;
}

const PEACH: Tint = { body: "var(--peach)", deep: "var(--peach-deep)", soft: "#fff0e0" };

export const MEMBERS: MemberDef[] = [
  { id: "billing-1", group: BILLING, name: l("Fatura 1", "Billing 1"), tint: TINTS.coral },
  { id: "billing-2", group: BILLING, name: l("Fatura 2", "Billing 2"), tint: TINTS.lilac },
  { id: "billing-3", group: BILLING, name: l("Fatura 3", "Billing 3"), tint: TINTS.sun },
  { id: "billing-4", group: BILLING, name: l("Fatura 4", "Billing 4"), tint: PEACH },
  { id: "analytics-1", group: ANALYTICS, name: l("Analitik", "Analytics"), tint: TINTS.mint },
];
export const memberDef = (id: string) => MEMBERS.find((m) => m.id === id) ?? MEMBERS[0]!;

let order = 5000;
const produce = (): Action => ({ type: "produce", topic: TOPIC, value: `order:${++order}`, producer: "orders-service" });
const producing = (n: number) => Array.from({ length: n }, produce);
export const join = (id: string): Action => ({
  type: "joinGroup",
  group: memberDef(id).group,
  member: id,
  topics: [TOPIC],
  autoOffsetReset: "earliest",
});
export const crash = (id: string): Action => ({ type: "crashMember", group: memberDef(id).group, member: id });
export const poll = (id: string, max?: number): Action => ({ type: "poll", group: memberDef(id).group, member: id, max });
export const commit = (id: string): Action => ({ type: "commit", group: memberDef(id).group, member: id });

/** The topic already holds six orders, two per partition. */
const START = (() => {
  order = 5000;
  return stateAfter([{ type: "createTopic", name: TOPIC, partitions: 3 }, ...producing(6)], 3);
})();

export const stepActions: Action[][] = (() => {
  order = 5006;
  return [
    // 0: one member owns everything.
    [join("billing-1"), poll("billing-1"), commit("billing-1")],
    // 1: a second member joins; the partitions are shared out.
    [...producing(3), join("billing-2"), poll("billing-1"), poll("billing-2"), commit("billing-1"), commit("billing-2")],
    // 2: billing-2 reads without committing and crashes; billing-1 takes over P2 from the commit.
    [...producing(6), poll("billing-2"), crash("billing-2"), poll("billing-1"), commit("billing-1")],
    // 3: a second group reads the same topic from the start, on its own.
    [join("analytics-1"), poll("analytics-1"), commit("analytics-1")],
    // 4: billing-2 comes back; nothing is read twice because billing-1 committed.
    [...producing(3), join("billing-2"), poll("billing-1"), poll("billing-2"), commit("billing-1"), commit("billing-2")],
    // 5: a third member joins: one partition each.
    [join("billing-3"), ...producing(3), poll("billing-1"), poll("billing-2"), poll("billing-3"), commit("billing-1"), commit("billing-2"), commit("billing-3")],
    // 6: a fourth member waits idle, then takes over when billing-1 crashes.
    [
      join("billing-4"),
      crash("billing-1"),
      ...producing(3),
      poll("billing-2"),
      poll("billing-3"),
      poll("billing-4"),
      commit("billing-2"),
      commit("billing-3"),
      commit("billing-4"),
    ],
    // 7: who keeps track: nothing new happens.
    [],
    // 8: sandbox.
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
export const sandboxStart: ClusterState = (() => {
  order = 6000;
  return stateAfter(
    [{ type: "createTopic", name: TOPIC, partitions: 3 }, ...producing(6), join("billing-1"), join("billing-2")],
    3,
  );
})();
