import { simulate } from "../../engine/cluster";
import type { Action, ClusterState } from "../../engine/types";
import { l, type L } from "@lets-explain/core/i18n";
import { TINTS, type Tint } from "@lets-explain/core/iso/shapes";

/** The lesson's simulation: one topic, two readers, and the actions each step plays. */

export const TOPIC = "orders";
export const P = `${TOPIC}-0`;

export interface ConsumerDef {
  group: string;
  member: string;
  name: L;
  tint: Tint;
}

export const BILLING: ConsumerDef = { group: "billing", member: "billing-1", name: l("Fatura", "Billing"), tint: TINTS.coral };
export const ANALYTICS: ConsumerDef = { group: "analytics", member: "analytics-1", name: l("Analitik", "Analytics"), tint: TINTS.lilac };
export const consumers = [BILLING, ANALYTICS];

export const produce = (value: string): Action => ({ type: "produce", topic: TOPIC, value, producer: "orders-service" });
export const join = (c: ConsumerDef): Action => ({ type: "joinGroup", group: c.group, member: c.member, topics: [TOPIC], autoOffsetReset: "earliest" });
export const poll = (c: ConsumerDef, max?: number): Action => ({ type: "poll", group: c.group, member: c.member, max });
export const commit = (c: ConsumerDef): Action => ({ type: "commit", group: c.group, member: c.member });
export const crash = (c: ConsumerDef): Action => ({ type: "crashMember", group: c.group, member: c.member });
export const seek = (c: ConsumerDef, offset: number): Action => ({ type: "seek", group: c.group, member: c.member, tp: P, offset });
export const deleteOldest = (state: ClusterState, count = 2): Action => {
  const p = state.topics[TOPIC]!.partitions[0]!;
  return { type: "deleteRecordsBefore", topic: TOPIC, partition: 0, offset: Math.min(p.logStartOffset + count, p.logEndOffset) };
};

/** The lesson starts with the topic already there, so every step has a log to draw. */
const START = simulate([{ type: "createTopic", name: TOPIC, partitions: 1 }]).states[1]!;

/** What happens at each step. Every state is rebuilt by replaying these, so steps are exact. */
export const stepActions: Action[][] = [
  [],
  [produce("order:1041"), produce("order:1042"), produce("order:1043")],
  [produce("order:1044"), produce("order:1045")],
  [produce("cancel:1042")],
  [join(BILLING), poll(BILLING, 2), poll(BILLING, 2), poll(BILLING, 2)],
  [join(ANALYTICS), poll(ANALYTICS, 1), poll(ANALYTICS, 1)],
  [commit(BILLING), commit(ANALYTICS)],
  [produce("order:1046"), produce("order:1047"), produce("order:1048"), poll(BILLING), crash(BILLING)],
  [join(BILLING), poll(BILLING), commit(BILLING)],
  [seek(ANALYTICS, 0), poll(ANALYTICS, 3), poll(ANALYTICS, 3), poll(ANALYTICS, 3), commit(ANALYTICS)],
  [{ type: "deleteRecordsBefore", topic: TOPIC, partition: 0, offset: 4 }],
  [],
];

export const SANDBOX_STEP = stepActions.length - 1;

/** Built once: the whole lesson as one simulation, plus where each step ends in it. */
export const base = (() => {
  const run = simulate(stepActions.flat(), START);
  const ends: number[] = [];
  let n = 0;
  for (const actions of stepActions) {
    n += actions.length;
    ends.push(n);
  }
  const startOf = (step: number) => (step === 0 ? 0 : ends[step - 1]!);
  return { run, ends, startOf };
})();

/** Where the try-it step begins: the end of the lesson. */
export const sandboxStart = base.run.states[base.ends[SANDBOX_STEP]!]!;

/** The order number the sandbox writes next, given how many it has written. */
export const nextOrder = (written: number) => `order:${1049 + written}`;

export function readerFor(state: ClusterState, c: ConsumerDef) {
  const group = state.groups[c.group];
  if (!group) return null;
  const member = group.members.find((m) => m.id === c.member);
  return {
    alive: Boolean(member),
    position: member ? (member.positions[P] ?? group.committed[P]) : undefined,
    committed: group.committed[P],
  };
}
