import type { Action, ClusterState } from "../../engine/types";
import { l, type L } from "@lets-explain/core/i18n";
import { KEY_SHADES } from "../../iso/TopicStage";
import { TINTS, type Shades, type Tint } from "@lets-explain/core/iso/shapes";
import { runMoves, stateAfter } from "../shared/topicSim";

/**
 * One 3-partition topic, written by the order service with customer ids as keys.
 * With 3 partitions murmur2 sends ali → P0, mehmet → P1, zeynep → P2, can → P0.
 * With 4 partitions: ali → P3, mehmet → P2, zeynep → P3, can → P0 (nobody → P1).
 * The tests check these, so the text can rely on them.
 */

export const TOPIC = "orders";
export const GROUP = "shipping";

export interface Customer {
  key: string;
  name: L;
  /** Possessive form: Turkish suffixes depend on the name (Ali'nin, Can'ın). */
  of: L;
  shades: Shades;
}

export const CUSTOMERS: Customer[] = [
  { key: "ali", name: l("Ali", "Ali"), of: l("Ali'nin", "Ali's"), shades: KEY_SHADES[0]! },
  { key: "mehmet", name: l("Mehmet", "Mehmet"), of: l("Mehmet'in", "Mehmet's"), shades: KEY_SHADES[1]! },
  { key: "zeynep", name: l("Zeynep", "Zeynep"), of: l("Zeynep'in", "Zeynep's"), shades: KEY_SHADES[2]! },
  { key: "can", name: l("Can", "Can"), of: l("Can'ın", "Can's"), shades: KEY_SHADES[3]! },
];

export const customerOf = (value: string) => CUSTOMERS.find((c) => value.startsWith(`${c.key}:`));

export const READERS: { id: string; name: L; tint: Tint }[] = [
  { id: "shipping-1", name: l("Kargo 1", "Shipping 1"), tint: TINTS.coral },
  { id: "shipping-2", name: l("Kargo 2", "Shipping 2"), tint: TINTS.lilac },
  { id: "shipping-3", name: l("Kargo 3", "Shipping 3"), tint: TINTS.sun },
];
export const readerDef = (id: string) => READERS.find((r) => r.id === id) ?? READERS[0]!;

/** Writes an event. `key` undefined means no key; `partition` picks one by hand. */
export const write = (value: string, key?: string, partition?: number): Action => ({
  type: "produce",
  topic: TOPIC,
  value,
  key: key ?? null,
  partition,
  producer: "orders-service",
});
const join = (id: string): Action => ({ type: "joinGroup", group: GROUP, member: id, topics: [TOPIC], autoOffsetReset: "earliest" });
const poll = (id: string, max?: number): Action => ({ type: "poll", group: GROUP, member: id, max });
const commit = (id: string): Action => ({ type: "commit", group: GROUP, member: id });
export const grow = (count: number): Action => ({ type: "addPartitions", topic: TOPIC, count });

const START = stateAfter([{ type: "createTopic", name: TOPIC, partitions: 3 }], 3);

const readAll = (id: string) => [poll(id, 2), poll(id, 2), commit(id)];

export const stepActions: Action[][] = [
  [write("order:3001"), write("order:3002"), write("order:3003")],
  [write("ali:order"), write("ali:address"), write("ali:cancel")],
  [write("ali:order", "ali"), write("ali:address", "ali"), write("ali:cancel", "ali")],
  [write("mehmet:order", "mehmet"), write("zeynep:order", "zeynep"), write("mehmet:address", "mehmet")],
  [write("can:order", "can")],
  [
    join("shipping-1"),
    join("shipping-2"),
    join("shipping-3"),
    write("can:order", "can"),
    write("can:order", "can"),
    write("can:order", "can"),
    write("can:order", "can"),
    write("can:order", "can"),
    ...readAll("shipping-1"),
    ...readAll("shipping-2"),
    ...readAll("shipping-3"),
  ],
  [grow(4), write("ali:order", "ali")],
  [write("mehmet:gift", "mehmet", 0)],
  [],
];

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

export const sandboxStart: ClusterState = stateAfter([{ type: "createTopic", name: TOPIC, partitions: 3 }], 3);
