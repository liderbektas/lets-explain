/**
 * A small, deterministic model of a producer, a consumer and a Schema Registry
 * for one subject (`orders-value`). Schemas are reduced to a list of fields, each
 * with or without a default value, which is enough to show Avro-style compatibility.
 *
 * Simplifications (each one is named in a "Gerçekte" note in the lesson):
 * - Compatibility is checked against the latest version only (the non-transitive modes).
 * - A record the consumer cannot decode is counted as failed and skipped. A real consumer
 *   throws a SerializationException and stays on that offset until you handle it.
 * - The serializer registers a new schema the first time it writes with it
 *   (`auto.register.schemas=true`, the client default).
 */

export interface Field {
  name: string;
  /** True when the field has a default value, so a reader can fill it in when it is missing. */
  def: boolean;
}

export type Schema = Field[];
export type Mode = "BACKWARD" | "FORWARD" | "FULL" | "NONE";
export const MODES: Mode[] = ["BACKWARD", "FORWARD", "FULL", "NONE"];

export interface Version {
  version: number;
  id: number;
  schema: Schema;
}

export interface Rec {
  offset: number;
  order: number;
  /** Schema id carried in the message, or null for plain JSON written without the registry. */
  schemaId: number | null;
  fields: string[];
}

export interface Reader {
  /** The schema the consumer's code was built with. */
  schema: Schema;
  position: number;
  ok: number;
  failed: number;
  /** Schema ids the deserializer has already fetched. */
  cache: number[];
}

export interface SRState {
  registry: boolean;
  mode: Mode;
  versions: Version[];
  nextId: number;
  producer: Schema;
  records: Rec[];
  reader: Reader;
  nextOrder: number;
}

export type Edit = "addCoupon" | "addCouponRequired" | "removeTotal" | "renameTotal" | "v1";

export type Action =
  | { type: "produce" }
  | { type: "edit"; edit: Edit }
  | { type: "setSchema"; schema: Schema }
  | { type: "enableRegistry" }
  | { type: "setMode"; mode: Mode }
  | { type: "poll" }
  | { type: "upgradeReader" }
  /** The consumer is rebuilt with a schema of its own (copied from the producer's .avsc). */
  | { type: "setReader"; schema: Schema };

export type SREvent =
  | { type: "produced"; offset: number; order: number; schemaId: number | null }
  | { type: "registered"; version: number; id: number }
  | { type: "rejected"; mode: Mode; reason: string }
  | { type: "edited"; schema: Schema }
  | { type: "registryOn" }
  | { type: "modeSet"; mode: Mode }
  | { type: "fetched"; id: number }
  | { type: "read"; offset: number; schemaId: number | null }
  | { type: "failed"; offset: number; missing: string }
  | { type: "readerUpgraded"; version: number }
  | { type: "nothing" };

export const V1: Schema = [
  { name: "id", def: false },
  { name: "total", def: false },
];

export function emptyState(): SRState {
  return {
    registry: false,
    mode: "BACKWARD",
    versions: [],
    nextId: 1,
    producer: V1,
    records: [],
    reader: { schema: V1, position: 0, ok: 0, failed: 0, cache: [] },
    nextOrder: 1041,
  };
}

export const sameSchema = (a: Schema, b: Schema) =>
  a.length === b.length && a.every((f) => b.some((g) => g.name === f.name && g.def === f.def));

/** The first reader field without a default that the writer does not have, if any. */
export function missingFor(reader: Schema, writer: string[]): string | null {
  return reader.find((f) => !f.def && !writer.includes(f.name))?.name ?? null;
}

const names = (s: Schema) => s.map((f) => f.name);

/** Can a new schema be registered after `latest` under `mode`? Returns why not, or null. */
export function incompatibility(mode: Mode, latest: Schema, next: Schema): string | null {
  // BACKWARD: code using the new schema must read data written with the old one.
  const backward = missingFor(next, names(latest));
  // FORWARD: code still using the old schema must read data written with the new one.
  const forward = missingFor(latest, names(next));
  if ((mode === "BACKWARD" || mode === "FULL") && backward) return backward;
  if ((mode === "FORWARD" || mode === "FULL") && forward) return forward;
  return null;
}

export function editSchema(schema: Schema, edit: Edit): Schema {
  const without = (name: string) => schema.filter((f) => f.name !== name);
  switch (edit) {
    case "addCoupon":
      return [...without("coupon"), { name: "coupon", def: true }];
    case "addCouponRequired":
      return [...without("coupon"), { name: "coupon", def: false }];
    case "removeTotal":
      return without("total");
    case "renameTotal":
      return schema.some((f) => f.name === "total")
        ? schema.map((f) => (f.name === "total" ? { name: "amount", def: false } : f))
        : schema;
    case "v1":
      return V1;
  }
}

/** Whether an edit would change the producer's schema at all (the sandbox disables no-op buttons). */
export const editChanges = (schema: Schema, edit: Edit) => !sameSchema(schema, editSchema(schema, edit));

export function apply(prev: SRState, action: Action): { state: SRState; events: SREvent[] } {
  const s: SRState = structuredClone(prev);
  const events: SREvent[] = [];

  switch (action.type) {
    case "edit":
    case "setSchema": {
      s.producer = action.type === "edit" ? editSchema(s.producer, action.edit) : action.schema;
      events.push({ type: "edited", schema: s.producer });
      break;
    }
    case "enableRegistry":
      s.registry = true;
      events.push({ type: "registryOn" });
      break;
    case "setMode":
      s.mode = action.mode;
      events.push({ type: "modeSet", mode: action.mode });
      break;
    case "produce": {
      let schemaId: number | null = null;
      if (s.registry) {
        const known = s.versions.find((v) => sameSchema(v.schema, s.producer));
        if (known) schemaId = known.id;
        else {
          const latest = s.versions[s.versions.length - 1];
          const reason = latest ? incompatibility(s.mode, latest.schema, s.producer) : null;
          if (reason) {
            // The serializer throws: nothing reaches Kafka.
            events.push({ type: "rejected", mode: s.mode, reason });
            break;
          }
          const v: Version = { version: s.versions.length + 1, id: s.nextId, schema: s.producer };
          s.nextId += 1;
          s.versions.push(v);
          schemaId = v.id;
          events.push({ type: "registered", version: v.version, id: v.id });
        }
      }
      const rec: Rec = { offset: s.records.length, order: s.nextOrder, schemaId, fields: names(s.producer) };
      s.nextOrder += 1;
      s.records.push(rec);
      events.push({ type: "produced", offset: rec.offset, order: rec.order, schemaId });
      break;
    }
    case "poll": {
      const rec = s.records[s.reader.position];
      if (!rec) {
        events.push({ type: "nothing" });
        break;
      }
      let writer = rec.fields;
      if (rec.schemaId !== null) {
        if (!s.reader.cache.includes(rec.schemaId)) {
          s.reader.cache.push(rec.schemaId);
          events.push({ type: "fetched", id: rec.schemaId });
        }
        writer = names(s.versions.find((v) => v.id === rec.schemaId)!.schema);
      }
      const missing = missingFor(s.reader.schema, writer);
      s.reader.position += 1;
      if (missing) {
        s.reader.failed += 1;
        events.push({ type: "failed", offset: rec.offset, missing });
      } else {
        s.reader.ok += 1;
        events.push({ type: "read", offset: rec.offset, schemaId: rec.schemaId });
      }
      break;
    }
    case "setReader": {
      s.reader.schema = action.schema;
      const known = s.versions.find((v) => sameSchema(v.schema, action.schema));
      events.push({ type: "readerUpgraded", version: known?.version ?? 0 });
      break;
    }
    case "upgradeReader": {
      const latest = s.versions[s.versions.length - 1];
      if (!latest) {
        events.push({ type: "nothing" });
        break;
      }
      s.reader.schema = latest.schema;
      events.push({ type: "readerUpgraded", version: latest.version });
      break;
    }
  }
  return { state: s, events };
}

export function simulate(actions: Action[], start: SRState) {
  const states = [start];
  const events: SREvent[][] = [];
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

const produce: Action = { type: "produce" };
const poll: Action = { type: "poll" };
const edit = (e: Edit): Action => ({ type: "edit", edit: e });

export const stepActions: Action[][] = [
  [produce, produce, produce, poll, poll, poll],
  [edit("renameTotal"), produce, produce, poll, poll],
  [edit("v1")],
  [{ type: "enableRegistry" }, produce],
  [produce, produce],
  [poll, poll, poll],
  [edit("addCoupon"), produce, poll],
  [edit("renameTotal"), produce],
  [{ type: "setSchema", schema: [{ name: "id", def: false }, { name: "coupon", def: true }] }, produce, poll],
  [{ type: "upgradeReader" }, produce, poll],
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

/** The try-it step starts clean: registry on, BACKWARD, one schema version, a reader that is up to date. */
export const sandboxStart: SRState = simulate(
  [{ type: "enableRegistry" }, produce, produce, poll, poll],
  emptyState(),
).states[5]!;

/** Every move the sandbox buttons allow in a state, in button order. */
export function movesIn(s: SRState): Action[] {
  const out: Action[] = [produce];
  for (const e of ["addCoupon", "addCouponRequired", "removeTotal"] as Edit[]) {
    if (editChanges(s.producer, e)) out.push(edit(e));
  }
  for (const m of MODES) if (m !== s.mode) out.push({ type: "setMode", mode: m });
  if (s.reader.position < s.records.length) out.push(poll);
  const latest = s.versions[s.versions.length - 1];
  if (latest && !sameSchema(latest.schema, s.reader.schema)) out.push({ type: "upgradeReader" });
  return out;
}

export const fieldLabel = (f: Field) => (f.def ? `${f.name}?` : f.name);
