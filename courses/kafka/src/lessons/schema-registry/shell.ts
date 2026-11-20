import { out, type TermLine } from "@lets-explain/core/lib/terminal";
import { fail, flags, makeAppShell, model, say, type AppAction, type AppBox, type AppLesson, type Program } from "../shared/appShell";
import { apply, incompatibility, MODES, sameSchema, type Action, type Mode, type Schema, type SREvent, type SRState } from "./model";

/**
 * The orders project with Avro and a Schema Registry at localhost:8081:
 * - `order.avsc` is the producer's schema; `./produce-order.sh` writes one order with it
 *   (the serializer registers a new schema on first use, as `auto.register.schemas` does).
 * - `billing/order.avsc` is the schema the billing consumer was built with;
 *   `./run-billing.sh` (re)starts billing, which reads every order waiting.
 * - `curl` talks to the registry's REST API: subjects, versions, the subject's
 *   compatibility (`/config/orders-value`), and `./check-compat.sh` asks whether
 *   order.avsc would be accepted.
 * Only field names and defaults matter here, as in the lesson's model.
 */

export type SBox = AppBox<SRState>;
export const PRODUCER = "order.avsc";
export const READER = "billing/order.avsc";
const REGISTRY = "http://localhost:8081";
const SUBJECT = "orders-value";

const TYPES: Record<string, string> = { id: '"long"', total: '"double"', amount: '"double"', coupon: '["null", "string"]', currency: '"string"' };

/** An Avro record schema with these fields, written the way people write .avsc files. */
export function avsc(schema: Schema): string {
  const fields = schema.map((f) => {
    const type = TYPES[f.name] ?? '"string"';
    const def = f.def ? `, "default": ${type.startsWith("[") ? "null" : '""'}` : "";
    return `    {"name": "${f.name}", "type": ${type}${def}}`;
  });
  return `{\n  "type": "record",\n  "name": "Order",\n  "namespace": "shop",\n  "fields": [\n${fields.join(",\n")}\n  ]\n}`;
}

/** Reads an .avsc: field names, and whether each has a default. */
export function readAvsc(text: string | undefined, path: string): Schema | string {
  if (text === undefined) return `java.io.FileNotFoundException: ${path} (No such file or directory)`;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return `org.apache.avro.SchemaParseException: com.fasterxml.jackson.core.JsonParseException: ${(e as Error).message}`;
  }
  const rec = json as { type?: unknown; fields?: unknown };
  if (rec.type !== "record" || !Array.isArray(rec.fields)) return `org.apache.avro.SchemaParseException: No type: ${JSON.stringify(json).slice(0, 60)}`;
  const out: Schema = [];
  for (const f of rec.fields as { name?: unknown; type?: unknown }[]) {
    if (typeof f?.name !== "string") return "org.apache.avro.SchemaParseException: No field name";
    if (f.type === undefined) return `org.apache.avro.SchemaParseException: No field type: ${f.name}`;
    if (out.some((g) => g.name === f.name)) return `org.apache.avro.SchemaParseException: Duplicate field ${f.name} in record shop.Order`;
    out.push({ name: f.name, def: Object.prototype.hasOwnProperty.call(f, "default") });
  }
  return out;
}

const latestOf = (s: SRState) => s.versions[s.versions.length - 1];

function produceOrder(box: SBox): Program<Action> {
  const schema = readAvsc(box.files[PRODUCER], PRODUCER);
  if (typeof schema === "string") return fail(schema);
  const actions: AppAction<Action>[] = [];
  let s = box.model;
  if (!sameSchema(s.producer, schema)) {
    actions.push(model({ type: "setSchema", schema }));
    s = apply(s, { type: "setSchema", schema }).state;
  }
  const r = apply(s, { type: "produce" });
  actions.push(model({ type: "produce" }));
  const output: TermLine[] = [];
  for (const e of r.events) {
    if (e.type === "registered") output.push(out(`registered a new schema for subject ${SUBJECT}: version ${e.version}, id ${e.id}`, "dim"));
    if (e.type === "produced") output.push(out(`produced order ${e.order} → orders, offset ${e.offset}${e.schemaId !== null ? ` (schema id ${e.schemaId})` : ""}`));
    if (e.type === "rejected")
      output.push(
        out(`org.apache.kafka.common.errors.SerializationException: Error registering Avro schema{"type":"record","name":"Order",...}`, "err"),
        out(
          `Caused by: io.confluent.kafka.schemaregistry.client.rest.exceptions.RestClientException: Schema being registered is incompatible with an earlier schema for subject "${SUBJECT}", details: [{errorType:'READER_FIELD_MISSING_DEFAULT_VALUE', description:'The field '${e.reason}' at path '/fields/${e.reason}' in the ${e.mode === "FORWARD" ? "old" : "new"} schema has no default value and is missing in the ${e.mode === "FORWARD" ? "new" : "old"} schema'}, {compatibility: '${e.mode}'}]; error code: 409`,
          "err",
        ),
        out("(nothing was written to the topic)", "dim"),
      );
  }
  return { actions, output, failed: r.events.some((e) => e.type === "rejected") };
}

function runBilling(box: SBox): Program<Action> {
  const schema = readAvsc(box.files[READER], READER);
  if (typeof schema === "string") return fail(`Exception in thread "main" ${schema}`);
  const actions: AppAction<Action>[] = [];
  const output: TermLine[] = [out("billing | started")];
  let s = box.model;
  const act = (a: Action) => {
    actions.push(model(a));
    const r = apply(s, a);
    s = r.state;
    return r.events;
  };
  if (!sameSchema(s.reader.schema, schema)) act({ type: "setReader", schema });
  if (s.reader.position >= s.records.length) output.push(out("billing | no new orders", "dim"));
  while (s.reader.position < s.records.length) {
    for (const e of act({ type: "poll" }) as SREvent[]) {
      if (e.type === "fetched") output.push(out(`billing | fetched schema id ${e.id} from ${REGISTRY}`, "dim"));
      if (e.type === "read") output.push(out(`billing | invoiced order at offset ${e.offset}`));
      if (e.type === "failed")
        output.push(
          out(`billing | ERROR org.apache.kafka.common.errors.SerializationException: Error deserializing Avro message at offset ${e.offset}`, "err"),
          out(`billing | Caused by: org.apache.avro.AvroTypeException: Found shop.Order, expecting shop.Order, missing required field ${e.missing}`, "err"),
        );
    }
  }
  output.push(out("(a real consumer keeps running; the sandbox gives the prompt back)", "dim"));
  return { actions, output };
}

function checkCompat(box: SBox): Program<Action> {
  const schema = readAvsc(box.files[PRODUCER], PRODUCER);
  if (typeof schema === "string") return say(`{"error_code":42201,"message":"Invalid schema: ${schema.replace(/"/g, "'")}"}`, "err");
  const latest = latestOf(box.model);
  if (!latest) return say(`{"error_code":40401,"message":"Subject '${SUBJECT}' not found."}`, "err");
  const reason = incompatibility(box.model.mode, latest.schema, schema);
  return say(reason ? `{"is_compatible":false,"messages":["READER_FIELD_MISSING_DEFAULT_VALUE: ${reason}"]}` : `{"is_compatible":true}`, reason ? "err" : "out");
}

const versionJson = (v: SRState["versions"][number]) =>
  JSON.stringify({ subject: SUBJECT, version: v.version, id: v.id, schema: avsc(v.schema).replace(/\s+/g, "") });

function curl(box: SBox, args: string[]): Program<Action> {
  const f = flags(args, ["-X", "--request", "-H", "--header", "-d", "--data", "--data-raw"]);
  const method = (f.values["-X"]?.[0] ?? f.values["--request"]?.[0] ?? (f.values["-d"] || f.values["--data"] || f.values["--data-raw"] ? "POST" : "GET")).toUpperCase();
  const url = f.rest[0];
  if (!url) return fail("curl: no URL specified!");
  const m = /^(?:https?:\/\/)?localhost:8081(\/[^?\s]*)?/.exec(url);
  if (!m) return fail(`curl: (7) Failed to connect to ${url.replace(/^https?:\/\//, "").split("/")[0]}: Connection refused`);
  const path = (m[1] ?? "/").replace(/\/$/, "") || "/";
  const s = box.model;
  const body = f.values["-d"]?.[0] ?? f.values["--data"]?.[0] ?? f.values["--data-raw"]?.[0];

  if (method === "GET" && path === "/subjects") return say(s.versions.length ? `["${SUBJECT}"]` : "[]");
  if (method === "GET" && path === `/subjects/${SUBJECT}/versions`) {
    if (!s.versions.length) return say(`{"error_code":40401,"message":"Subject '${SUBJECT}' not found."}`, "err");
    return say(JSON.stringify(s.versions.map((v) => v.version)));
  }
  const ver = new RegExp(`^/subjects/${SUBJECT}/versions/(latest|\\d+)$`).exec(path);
  if (method === "GET" && ver) {
    const v = ver[1] === "latest" ? latestOf(s) : s.versions.find((x) => x.version === Number(ver[1]));
    if (!v) return say(`{"error_code":40402,"message":"Version ${ver[1]} not found."}`, "err");
    return say(versionJson(v));
  }
  if (path === `/config/${SUBJECT}` || path === "/config") {
    if (method === "GET") return say(`{"compatibilityLevel":"${s.mode}"}`);
    if (method === "PUT") {
      let mode: string | undefined;
      try {
        mode = (JSON.parse(body ?? "") as { compatibility?: string }).compatibility;
      } catch {
        return say(`{"error_code":50005,"message":"Unexpected character in the request body"}`, "err");
      }
      if (!mode || !MODES.includes(mode as Mode)) return say(`{"error_code":42203,"message":"Invalid compatibility level. Valid values are none, backward, forward, full, backward_transitive, forward_transitive, and full_transitive"}`, "err");
      return { actions: [model({ type: "setMode", mode: mode as Mode })], output: [out(`{"compatibility":"${mode}"}`)] };
    }
  }
  if (path.startsWith(`/compatibility/subjects/${SUBJECT}`)) return say("(post a schema here with ./check-compat.sh: it wraps order.avsc in the JSON the API wants)", "dim");
  return say(`{"error_code":404,"message":"HTTP 404 Not Found"}`, "err");
}

export const lesson: AppLesson<SRState, Action, SREvent> = {
  dir: "orders",
  step: apply,
  names: ["./produce-order.sh", "./run-billing.sh", "./check-compat.sh", "curl"],
  help: `This project writes orders in Avro, with a Schema Registry at ${REGISTRY}:
  nano order.avsc            the producer's schema
  ./produce-order.sh         write one order with order.avsc
  nano billing/order.avsc    the schema billing's code was built with
  ./run-billing.sh           (re)start billing; it reads every order waiting
  ./check-compat.sh          would the registry accept order.avsc?
  curl ${REGISTRY}/subjects/${SUBJECT}/versions
  curl ${REGISTRY}/config/${SUBJECT}
  curl -X PUT -H "Content-Type: application/vnd.schemaregistry.v1+json" \\
       --data '{"compatibility": "FORWARD"}' ${REGISTRY}/config/${SUBJECT}`,
  command(box, words) {
    const [cmd, ...args] = words;
    if (cmd === "./produce-order.sh") return produceOrder(box);
    if (cmd === "./run-billing.sh") return runBilling(box);
    if (cmd === "./check-compat.sh") return checkCompat(box);
    if (cmd === "curl") return curl(box, args);
    return null;
  },
};

export const shell = makeAppShell(lesson);

export const boxOf = (s: SRState): SBox => ({
  model: s,
  files: {
    [PRODUCER]: avsc(s.producer),
    [READER]: avsc(s.reader.schema),
    "produce-order.sh": `#!/bin/sh\necho "$ORDER_JSON" | kafka-avro-console-producer --bootstrap-server localhost:9092 --topic orders \\\n  --property schema.registry.url=${REGISTRY} --property value.schema.file=order.avsc`,
    "check-compat.sh": `#!/bin/sh\njq -n --rawfile s order.avsc '{schema: $s}' | curl -s -X POST -H "Content-Type: application/vnd.schemaregistry.v1+json" \\\n  --data @- ${REGISTRY}/compatibility/subjects/${SUBJECT}/versions/latest`,
  },
});

