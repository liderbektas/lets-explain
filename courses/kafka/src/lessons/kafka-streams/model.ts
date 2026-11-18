/**
 * A small, deterministic model of a Kafka Streams app that counts orders per city:
 *   orders  →  groupBy(city)  →  count()  →  orders-per-city
 * with a local state store backed by a changelog topic, under either processing guarantee.
 *
 * Simplifications (each one is named in a "Gerçekte" note in the lesson):
 * - One input partition and one app instance; the repartition step is described, not drawn.
 * - The app commits when you press commit. Real apps commit every `commit.interval.ms`
 *   (30 s with at_least_once, 100 ms with exactly_once_v2).
 * - A crash always loses the local disk, so the store is rebuilt from the changelog on restart.
 *   With a surviving disk, Kafka Streams would reuse its local store and only catch up.
 */

export type City = "İstanbul" | "Ankara" | "İzmir";
export const CITIES: City[] = ["İstanbul", "Ankara", "İzmir"];
export type Guarantee = "at_least_once" | "exactly_once_v2";

/** A changelog or output entry. Under exactly_once_v2 it belongs to a transaction. */
export interface Update {
  city: City;
  count: number;
  /** Whether a read_committed reader can see it. */
  status: "committed" | "open" | "aborted";
}

export interface StreamsState {
  input: { offset: number; city: City }[];
  alive: boolean;
  /** Next input offset to process, in the app's memory. */
  position: number;
  committed: number;
  store: Partial<Record<City, number>>;
  changelog: Update[];
  output: Update[];
  guarantee: Guarantee;
  /** For the counters only, not part of the app: one past the furthest offset ever processed. */
  seen: number;
}

export type Action =
  | { type: "order"; city: City }
  | { type: "process" }
  | { type: "processAll" }
  | { type: "resetApp" }
  | { type: "commit" }
  | { type: "crash" }
  | { type: "restart" }
  | { type: "setGuarantee"; guarantee: Guarantee };

export type StreamsEvent =
  | { type: "ordered"; offset: number; city: City }
  | { type: "processed"; offset: number; city: City; count: number; again: boolean }
  | { type: "committed"; offset: number; transaction: boolean }
  | { type: "crashed"; uncommitted: number; aborted: number }
  | { type: "restored"; entries: number; store: Partial<Record<City, number>> }
  | { type: "guaranteeSet"; guarantee: Guarantee }
  | { type: "reset" }
  | { type: "nothing" };

export function emptyState(): StreamsState {
  return {
    input: [],
    alive: true,
    position: 0,
    committed: 0,
    store: {},
    changelog: [],
    output: [],
    guarantee: "at_least_once",
    seen: 0,
  };
}

/** What a read_committed reader sees: everything outside open or aborted transactions. */
export const visible = (updates: Update[]) => updates.filter((u) => u.status === "committed");

/** The latest value per city in a changelog: what rebuilding the store from it gives. */
export function tableOf(updates: Update[]): Partial<Record<City, number>> {
  const out: Partial<Record<City, number>> = {};
  for (const u of visible(updates)) out[u.city] = u.count;
  return out;
}

/** The right answer: orders per city among the input records processed so far. */
export function trueCounts(s: StreamsState): Partial<Record<City, number>> {
  const out: Partial<Record<City, number>> = {};
  for (const r of s.input.slice(0, s.position)) out[r.city] = (out[r.city] ?? 0) + 1;
  return out;
}

/** How many orders are counted more than once in the store. */
export function overcount(s: StreamsState): number {
  const right = trueCounts(s);
  let extra = 0;
  for (const c of CITIES) extra += Math.max(0, (s.store[c] ?? 0) - (right[c] ?? 0));
  return extra;
}

export function apply(prev: StreamsState, action: Action): { state: StreamsState; events: StreamsEvent[] } {
  const s: StreamsState = structuredClone(prev);
  const events: StreamsEvent[] = [];
  const eos = s.guarantee === "exactly_once_v2";
  switch (action.type) {
    case "order": {
      const rec = { offset: s.input.length, city: action.city };
      s.input.push(rec);
      events.push({ type: "ordered", ...rec });
      break;
    }
    case "process":
    case "processAll": {
      if (!s.alive || s.position >= s.input.length) {
        events.push({ type: "nothing" });
        break;
      }
      const until = action.type === "process" ? s.position + 1 : s.input.length;
      while (s.position < until) {
        const rec = s.input[s.position]!;
        const count = (s.store[rec.city] ?? 0) + 1;
        s.store[rec.city] = count;
        const status = eos ? "open" : "committed";
        s.changelog.push({ city: rec.city, count, status });
        s.output.push({ city: rec.city, count, status });
        s.position += 1;
        const again = rec.offset < s.seen;
        s.seen = Math.max(s.seen, s.position);
        events.push({ type: "processed", offset: rec.offset, city: rec.city, count, again });
      }
      break;
    }
    case "resetApp":
      // The application reset tool: back to offset 0, internal topics and local state wiped.
      // The output topic is the user's own and is left alone.
      s.position = 0;
      s.committed = 0;
      s.store = {};
      s.changelog = [];
      s.seen = 0;
      events.push({ type: "reset" });
      break;
    case "commit": {
      if (!s.alive) break;
      s.committed = s.position;
      if (eos) {
        for (const u of s.changelog) if (u.status === "open") u.status = "committed";
        for (const u of s.output) if (u.status === "open") u.status = "committed";
      }
      events.push({ type: "committed", offset: s.committed, transaction: eos });
      break;
    }
    case "crash": {
      if (!s.alive) break;
      s.alive = false;
      let aborted = 0;
      for (const u of [...s.changelog, ...s.output]) {
        if (u.status === "open") {
          u.status = "aborted";
          aborted += 1;
        }
      }
      events.push({ type: "crashed", uncommitted: s.position - s.committed, aborted: aborted / 2 });
      s.store = {};
      s.position = s.committed;
      break;
    }
    case "restart": {
      if (s.alive) break;
      s.alive = true;
      s.store = tableOf(s.changelog);
      s.position = s.committed;
      events.push({ type: "restored", entries: visible(s.changelog).length, store: { ...s.store } });
      break;
    }
    case "setGuarantee":
      s.guarantee = action.guarantee;
      events.push({ type: "guaranteeSet", guarantee: action.guarantee });
      break;
  }
  return { state: s, events };
}

export function simulate(actions: Action[], start: StreamsState) {
  const states = [start];
  const events: StreamsEvent[][] = [];
  let cur = start;
  for (const a of actions) {
    const r = apply(cur, a);
    cur = r.state;
    states.push(cur);
    events.push(r.events);
  }
  return { states, events };
}

/* ------------------------------------------------------------ the lesson */

const order = (city: City): Action => ({ type: "order", city });
const process: Action = { type: "process" };
const commit: Action = { type: "commit" };

export const stepActions: Action[][] = [
  [order("İstanbul"), order("Ankara"), order("İstanbul")],
  [],
  [process, process],
  [process],
  [order("İzmir"), order("İstanbul"), process, process, commit],
  [{ type: "crash" }, { type: "restart" }],
  [order("İstanbul"), order("İstanbul"), process, process, { type: "crash" }, { type: "restart" }, process, process],
  [{ type: "resetApp" }, { type: "setGuarantee", guarantee: "exactly_once_v2" }, { type: "processAll" }, commit],
  [order("Ankara"), order("Ankara"), process, process, { type: "crash" }, { type: "restart" }, process, process, commit],
  [],
  [],
];

export const SANDBOX_STEP = stepActions.length - 1;

export const base = (() => {
  const run = simulate(stepActions.flat(), emptyState());
  const ends: number[] = [];
  let n = 0;
  for (const a of stepActions) {
    n += a.length;
    ends.push(n);
  }
  const startOf = (step: number) => (step === 0 ? 0 : ends[step - 1]!);
  return { run, ends, startOf };
})();

/** The try-it step starts clean: two orders counted and committed, at_least_once. */
export const sandboxStart: StreamsState = (() => {
  const r = simulate([order("İstanbul"), order("Ankara"), process, process, commit], emptyState());
  return r.states[r.states.length - 1]!;
})();

export const SANDBOX_CITIES: City[] = ["İstanbul", "Ankara"];

/** Every move the sandbox buttons allow in a state, in button order. */
export function movesIn(s: StreamsState): Action[] {
  const out: Action[] = SANDBOX_CITIES.map(order);
  if (s.alive) {
    if (s.position < s.input.length) out.push(process);
    if (s.position !== s.committed || s.changelog.some((u) => u.status === "open")) out.push(commit);
    out.push({ type: "crash" });
  } else {
    out.push({ type: "restart" });
  }
  out.push({ type: "setGuarantee", guarantee: s.guarantee === "at_least_once" ? "exactly_once_v2" : "at_least_once" });
  return out;
}
