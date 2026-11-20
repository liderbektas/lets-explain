import { out, type TermLine } from "@lets-explain/core/lib/terminal";
import { fail, flags, makeAppShell, model, say, type AppAction, type AppBox, type AppLesson, type Program } from "../shared/appShell";
import { apply, MASKED, WORKERS, type Action, type ConnectEvent, type ConnectState, type WorkerId } from "./model";

/**
 * A docker-compose Connect setup: Postgres → `db-source` → topic `payments` → `search-sink` →
 * Elasticsearch, on two workers (`connect-worker-1`, `connect-worker-2`).
 * - `psql -c "INSERT INTO payments ..."` (or `./insert-payment.sh`) adds a row.
 * - Connector configs live in `db-source.json` and `search-sink.json`; a change goes live with
 *   `curl -X PUT ... --data @file localhost:8083/connectors/<name>/config`.
 * - `docker stop` shuts a worker down cleanly (its tasks commit their offsets first),
 *   `docker kill` crashes it, `docker start` / `docker restart` bring it back.
 * - `sleep 60` waits for the offset flush (`offset.flush.interval.ms`, 60 s by default).
 * Running tasks pick up new rows and records after every command, as they poll all the time.
 */

export type CBox = AppBox<ConnectState>;
export const SOURCE = "db-source.json";
export const SINK = "search-sink.json";
const CONNECT = "localhost:8083";
const NAME: Record<WorkerId, string> = { w1: "connect-worker-1", w2: "connect-worker-2" };
const workerOf = (name: string): WorkerId | null => (name === NAME.w1 ? "w1" : name === NAME.w2 ? "w2" : null);

export const SOURCE_PLAIN = `{
  "connector.class": "io.confluent.connect.jdbc.JdbcSourceConnector",
  "connection.url": "jdbc:postgresql://postgres:5432/shop",
  "table.whitelist": "payments",
  "mode": "incrementing",
  "incrementing.column.name": "id",
  "topic.prefix": ""
}`;

export const SOURCE_MASKED = SOURCE_PLAIN.replace(
  '"topic.prefix": ""',
  `"topic.prefix": "",
  "transforms": "mask",
  "transforms.mask.type": "org.apache.kafka.connect.transforms.MaskField$Value",
  "transforms.mask.fields": "card",
  "transforms.mask.replacement": "${MASKED}"`,
);

export const SINK_INSERT = `{
  "connector.class": "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector",
  "connection.url": "http://elasticsearch:9200",
  "topics": "payments",
  "key.ignore": "true",
  "write.method": "insert"
}`;

export const SINK_UPSERT = SINK_INSERT.replace('"key.ignore": "true"', '"key.ignore": "false"').replace('"write.method": "insert"', '"write.method": "upsert"');

type Config = Record<string, string>;

function readJson(text: string | undefined): Config | string {
  if (text === undefined) return "No such file";
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return "Expected a JSON object";
    const cfg = (v as { config?: unknown }).config ?? v;
    return Object.fromEntries(Object.entries(cfg as Record<string, unknown>).map(([k, x]) => [k, String(x)]));
  } catch (e) {
    return (e as Error).message;
  }
}

const masks = (c: Config) => {
  const names = (c["transforms"] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return names.some((n) => /MaskField\$Value$/.test(c[`transforms.${n}.type`] ?? "") && (c[`transforms.${n}.fields`] ?? "").split(",").map((x) => x.trim()).includes("card"));
};

/** What running tasks do on their own between commands: the source copies new rows, the sink new records. */
function tick(s: ConnectState, act: (a: Action) => void) {
  if (s.tasks.source && s.rows.some((r) => r.id > s.sourceSeen)) act({ type: "sourcePoll" });
}
function tickSink(s: ConnectState, act: (a: Action) => void) {
  if (s.tasks.sink && s.sinkPosition < s.topic.length) act({ type: "sinkPoll" });
}

/** Runs the command's own actions, then lets the tasks poll, and reports what happened in Connect's log. */
function withTick(box: CBox, own: Action[], output: TermLine[]): Program<Action> {
  const actions: AppAction<Action>[] = [];
  let s = box.model;
  const log: TermLine[] = [];
  const act = (a: Action) => {
    const r = apply(s, a);
    s = r.state;
    actions.push(model(a));
    for (const e of r.events) {
      if (e.type === "sourced" && e.again) log.push(out(`connect | db-source copied row ${e.rowId} again (its offset was never saved)`, "err"));
      if (e.type === "sunk" && e.duplicate) log.push(out(`connect | search-sink indexed row ${e.rowId} again as a new document`, "err"));
      if (e.type === "crashed" && e.moved.length) log.push(out(`connect | rebalance: ${e.moved.join(", ")} moved to the other worker`, "dim"));
    }
  };
  for (const a of own) act(a);
  tick(s, act);
  tickSink(s, act);
  return { actions, output: [...output, ...log] };
}

function status(s: ConnectState, name: string): Program<Action> {
  const task = name === "db-source" ? "source" : name === "search-sink" ? "sink" : null;
  if (!task) return say(`{"error_code":404,"message":"No status found for connector ${name}"}`, "err");
  const w = s.tasks[task];
  const anyUp = WORKERS.some((x) => s.workers[x]);
  const conn = anyUp ? `{"state":"RUNNING","worker_id":"${NAME[WORKERS.find((x) => s.workers[x])!]}:8083"}` : `{"state":"UNASSIGNED","worker_id":null}`;
  const tasks = w ? `[{"id":0,"state":"RUNNING","worker_id":"${NAME[w]}:8083"}]` : `[{"id":0,"state":"UNASSIGNED","worker_id":null}]`;
  if (!anyUp) return fail(`curl: (7) Failed to connect to ${CONNECT}: Connection refused`);
  return say(`{"name":"${name}","connector":${conn},"tasks":${tasks},"type":"${task}"}`);
}

function curl(box: CBox, args: string[]): Program<Action> {
  const f = flags(args, ["-X", "--request", "-H", "--header", "-d", "--data", "--data-raw"]);
  const data = f.values["-d"]?.[0] ?? f.values["--data"]?.[0] ?? f.values["--data-raw"]?.[0];
  const method = (f.values["-X"]?.[0] ?? f.values["--request"]?.[0] ?? (data ? "POST" : "GET")).toUpperCase();
  const url = f.rest[0];
  if (!url) return fail("curl: no URL specified!");
  const s = box.model;
  const es = /^(?:https?:\/\/)?localhost:9200(\/[^?\s]*)?/.exec(url);
  if (es) {
    const path = es[1] ?? "/";
    if (path === "/payments/_count") return say(`{"count":${s.index.length},"_shards":{"total":1,"successful":1,"skipped":0,"failed":0}}`);
    if (path === "/payments/_search") return say(s.index.map((d) => `{"_id":"…","_source":{"id":${d.rowId},"card":"${d.card}"}}`).join("\n") || "[]");
    return say(`{"error":{"type":"index_not_found_exception"},"status":404}`, "err");
  }
  const m = /^(?:https?:\/\/)?localhost:8083(\/[^?\s]*)?/.exec(url);
  if (!m) return fail(`curl: (7) Failed to connect to ${url.replace(/^https?:\/\//, "").split("/")[0]}: Connection refused`);
  if (!WORKERS.some((w) => s.workers[w])) return fail(`curl: (7) Failed to connect to ${CONNECT}: Connection refused`);
  const path = (m[1] ?? "/").replace(/\/$/, "") || "/";
  if (method === "GET" && path === "/connectors") return say('["db-source","search-sink"]');
  const st = /^\/connectors\/([\w-]+)\/status$/.exec(path);
  if (method === "GET" && st) return status(s, st[1]!);
  const cfg = /^\/connectors\/([\w-]+)\/config$/.exec(path);
  if (cfg && method === "PUT") {
    const name = cfg[1]!;
    if (name !== "db-source" && name !== "search-sink") return say(`{"error_code":404,"message":"Connector ${name} not found"}`, "err");
    if (!data) return say(`{"error_code":500,"message":"Request body is empty"}`, "err");
    const text = data.startsWith("@") ? box.files[data.slice(1)] : data;
    if (text === undefined) return fail(`Warning: Couldn't read data from file "${data.slice(1)}", this makes an empty POST.`);
    const c = readJson(text);
    if (typeof c === "string") return say(`{"error_code":500,"message":"Unexpected character: ${c.replace(/"/g, "'")}"}`, "err");
    const own: Action[] = [];
    if (name === "db-source" && masks(c) !== s.mask) own.push({ type: "toggleMask" });
    if (name === "search-sink") {
      const mode = c["write.method"] === "upsert" ? "upsert" : "insert";
      if (mode === "upsert" && c["key.ignore"] !== "false")
        return say(`{"error_code":400,"message":"Connector configuration is invalid and contains the following 1 error(s):\\nUpsert requires 'key.ignore' to be false\\n"}`, "err");
      if (mode !== s.sinkMode) own.push({ type: "setSinkMode", mode });
    }
    return withTick(box, own, [out(`{"name":"${name}","config":{…},"tasks":[{"connector":"${name}","task":0}],"type":"${name === "db-source" ? "source" : "sink"}"}`)]);
  }
  if (method === "POST" && path === "/connectors") {
    let name = "db-source";
    try {
      name = (JSON.parse((data?.startsWith("@") ? box.files[data.slice(1)] : data) ?? "{}") as { name?: string }).name ?? name;
    } catch {
      // keep the default name
    }
    return say(`{"error_code":409,"message":"Connector ${name} already exists"}`, "err");
  }
  return say(`{"error_code":404,"message":"HTTP 404 Not Found"}`, "err");
}

function docker(box: CBox, args: string[]): Program<Action> {
  const [sub, ...rest] = args;
  const s = box.model;
  if (sub === "ps") {
    const row = (w: WorkerId) => `${NAME[w].padEnd(18)} confluentinc/cp-kafka-connect   ${s.workers[w] ? "Up 2 hours" : "Exited (137)"}`;
    return say(`NAMES              IMAGE                            STATUS\n${row("w1")}\n${row("w2")}`);
  }
  if (sub !== "stop" && sub !== "kill" && sub !== "start" && sub !== "restart") return say(`(this project's workers: docker ps | stop | kill | start | restart ${NAME.w1} ${NAME.w2})`, "dim");
  const names = rest.filter((a) => !a.startsWith("-"));
  if (!names.length) return fail(`"docker ${sub}" requires at least 1 argument.`);
  const own: Action[] = [];
  const output: TermLine[] = [];
  let cur = s;
  const push = (a: Action) => {
    own.push(a);
    cur = apply(cur, a).state;
  };
  for (const n of names) {
    const w = workerOf(n);
    if (!w) return fail(`Error response from daemon: No such container: ${n}`);
    const up = cur.workers[w];
    if (sub === "stop" || sub === "restart") {
      if (up) {
        // A clean shutdown: tasks on this worker stop and commit their offsets first.
        if (cur.tasks.source === w && cur.sourceSaved !== cur.sourceSeen) push({ type: "sourceFlush" });
        if (cur.tasks.sink === w && cur.sinkCommitted !== cur.sinkPosition) push({ type: "sinkCommit" });
        push({ type: "crash", worker: w });
      }
      if (sub === "restart") push({ type: "restart", worker: w });
    } else if (sub === "kill") {
      if (!up) return fail(`Error response from daemon: cannot kill container: ${n}: container is not running`);
      push({ type: "crash", worker: w });
    } else if (!up) push({ type: "restart", worker: w });
    output.push(out(n));
  }
  return withTick(box, own, output);
}

export const lesson: AppLesson<ConnectState, Action, ConnectEvent> = {
  dir: "payments-pipeline",
  step: apply,
  names: ["curl", "docker", "psql", "./insert-payment.sh", "sleep"],
  help: `Postgres → db-source → topic payments → search-sink → Elasticsearch, on two Connect workers:
  ./insert-payment.sh                                  add a row to the payments table
  nano db-source.json / nano search-sink.json          the connectors' configs
  curl -X PUT -H "Content-Type: application/json" --data @search-sink.json ${CONNECT}/connectors/search-sink/config
  curl ${CONNECT}/connectors/search-sink/status          where each task runs
  curl localhost:9200/payments/_count                  documents in the search index
  docker stop | kill | start | restart connect-worker-1
  sleep 60                                             wait for the offset flush`,
  command(box, words) {
    const [cmd, ...args] = words;
    if (cmd === "curl") return curl(box, args);
    if (cmd === "docker") return docker(box, args);
    if (cmd === "./insert-payment.sh" || (cmd === "psql" && /insert\s+into\s+payments/i.test(args.join(" ")))) {
      return withTick(box, [{ type: "insertRow" }], [out("INSERT 0 1")]);
    }
    if (cmd === "psql") return say("(this sandbox's psql only runs INSERT INTO payments ...)", "dim");
    if (cmd === "sleep") {
      const n = Number(args[0]);
      if (!Number.isFinite(n)) return fail("usage: sleep seconds");
      const s = box.model;
      const own: Action[] = [];
      if (n >= 60) {
        if (s.tasks.source && s.sourceSaved !== s.sourceSeen) own.push({ type: "sourceFlush" });
        if (s.tasks.sink && s.sinkCommitted !== s.sinkPosition) own.push({ type: "sinkCommit" });
      }
      return withTick(box, own, n >= 60 ? [] : [out("(offsets are flushed every 60 s: nothing was saved yet)", "dim")]);
    }
    return null;
  },
};

export const shell = makeAppShell(lesson);

export const boxOf = (s: ConnectState): CBox => ({
  model: s,
  files: {
    [SOURCE]: s.mask ? SOURCE_MASKED : SOURCE_PLAIN,
    [SINK]: s.sinkMode === "upsert" ? SINK_UPSERT : SINK_INSERT,
    "insert-payment.sh": "#!/bin/sh\npsql -h localhost -U shop -c \"INSERT INTO payments (card) VALUES ('$CARD')\"",
    "docker-compose.yml": "services:\n  postgres: …\n  kafka: …\n  connect-worker-1: …\n  connect-worker-2: …\n  elasticsearch: …",
  },
});
