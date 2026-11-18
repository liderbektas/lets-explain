import { allRecords, createLog, simulateStorage, type StorageAction, type StorageLog } from "../../engine/storage";
import { l, type L } from "@lets-explain/core/i18n";
import { TINTS, type Tint } from "@lets-explain/core/iso/shapes";

/**
 * A compacted topic of user addresses: key = user, value = city. Segments hold 3 records,
 * nothing expires by time, and a tombstone outlives its first cleaning by 1 day
 * (delete.retention.ms, 24 hours by default).
 */

export const CONFIG = {
  segmentRecords: 3,
  segmentDays: null,
  retentionDays: null,
  retentionRecords: null,
  policy: "compact",
  deleteRetentionDays: 1,
} as const;

export interface Person {
  key: string;
  name: L;
  tint: Tint;
  shades: "order" | "payment" | "cancel";
}

export const ALI: Person = { key: "ali", name: l("Ali", "Ali"), tint: TINTS.mint, shades: "order" };
export const ECE: Person = { key: "ece", name: l("Ece", "Ece"), tint: TINTS.sky, shades: "payment" };
export const CAN: Person = { key: "can", name: l("Can", "Can"), tint: TINTS.coral, shades: "cancel" };
export const people = [ALI, ECE, CAN];
export const personFor = (key: string | null) => people.find((p) => p.key === key);

export const CITIES = ["İzmir", "Ankara", "Bursa", "Antalya", "Konya", "Eskişehir"];

export const put = (p: Person, city: string): StorageAction => ({ type: "append", key: p.key, value: city });
export const remove = (p: Person): StorageAction => ({ type: "append", key: p.key, value: null });
export const compact: StorageAction = { type: "compact" };
export const wait = (days: number): StorageAction => ({ type: "tick", days });

export type Beat = StorageAction | { type: "beat" };
const beat: Beat = { type: "beat" };

export const stepBeats: Beat[][] = [
  [put(ALI, "İzmir"), put(ECE, "Ankara"), put(CAN, "Bursa")],
  [beat],
  [put(ALI, "Ankara"), put(ECE, "Antalya"), put(ALI, "Bursa"), put(CAN, "Konya")],
  [compact],
  [put(ECE, "İzmir"), put(ALI, "İzmir"), put(CAN, "Bursa"), compact],
  [remove(ECE), put(ALI, "Konya"), put(CAN, "İzmir"), compact],
  [wait(2), compact],
  [beat],
  [beat],
  [],
];

export const SANDBOX_STEP = stepBeats.length - 1;

const START = createLog(CONFIG);
const asAction = (b: Beat): StorageAction => (b.type === "beat" ? { type: "tick", days: 0 } : b);

export const base = (() => {
  const flat = stepBeats.flat();
  const run = simulateStorage(flat.map(asAction), START);
  run.events = run.events.map((evs, i) => (flat[i]!.type === "beat" ? [] : evs));
  const ends: number[] = [];
  let n = 0;
  for (const beats of stepBeats) {
    n += beats.length;
    ends.push(n);
  }
  const startOf = (step: number) => (step === 0 ? 0 : ends[step - 1]!);
  return { run, ends, startOf };
})();

/** What a consumer reading the whole log from the start ends up with: the latest value per key. */
export function tableOf(log: StorageLog): Map<string, string> {
  const table = new Map<string, string>();
  for (const r of allRecords(log)) {
    if (r.key === null) continue;
    if (r.value === null) table.delete(r.key);
    else table.set(r.key, r.value);
  }
  return table;
}

/** The try-it step: one closed segment with a record per person, and Ali's newer address in the active one. */
export const sandboxStart: StorageLog = simulateStorage(
  [put(ALI, "İzmir"), put(ECE, "Ankara"), put(CAN, "Bursa"), put(ALI, "Ankara")],
  createLog(CONFIG),
).logs[4]!;

export type SandboxMove = "w-ali" | "w-ece" | "w-can" | "d-ali" | "d-ece" | "d-can" | "compact" | "wait";
export const MOVES: SandboxMove[] = ["w-ali", "w-ece", "w-can", "d-ali", "d-ece", "d-can", "compact", "wait"];

/** Turns a sandbox move into an action; a write's city depends on how many moves came before. */
export function moveAction(m: SandboxMove, index: number): StorageAction {
  if (m === "compact") return compact;
  if (m === "wait") return wait(2);
  const p = personFor(m.slice(2))!;
  return m.startsWith("w-") ? put(p, CITIES[(index + 3) % CITIES.length]!) : remove(p);
}
