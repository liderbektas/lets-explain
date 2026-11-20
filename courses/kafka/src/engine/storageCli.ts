import { typeLines, type CommandLine, type ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete as completeWord, out, type TermLine } from "@lets-explain/core/lib/terminal";
import { BOOTSTRAP, needServer, one, parseOpts, props, toolName, topicId } from "./cli";
import {
  activeSegment,
  allRecords,
  applyStorage,
  DEFAULT_CONFIG,
  fileName,
  type StorageAction,
  type StorageConfig,
  type StorageEvent,
  type StorageLog,
} from "./storage";
import { applyFile, fail, fileCommand, isFileAction, logTime, makeRunner, pipeLines, say, sleepSeconds, type FileAction, type Run } from "./shellKit";

/**
 * A command line on the storage model, on the broker's host: one partition of one topic, its
 * files under /var/lib/kafka/data, and Kafka's tools to change the topic's retention and
 * compaction configs, produce (keys and tombstones), read and dump the log.
 *
 * Sandbox rules (said where they matter):
 * - Every record is 1 KiB, so segment.bytes=3072 means three records per segment.
 * - Time moves only with `sleep` (GNU suffixes: 30s, 5m, 2h, 3d). The broker's retention check
 *   runs when the clock moves; on a compacted topic the cleaner runs too.
 */

export interface SBox {
  log: StorageLog;
  topic: string;
  files: Record<string, string>;
}

export type SShellAction = StorageAction | FileAction;
export type SResult = ShellResult<SShellAction, SBox>;
type R = Run<SShellAction, SBox>;

export const sBox = (log: StorageLog, topic: string, files: Record<string, string> = {}): SBox => ({ log, topic, files });

export const RECORD_BYTES = 1024;
const DAY_MS = 86_400_000;
const DATA = "/var/lib/kafka/data";
/** The broker's clock at day 0 of the lesson. */
const EPOCH_MS = Date.UTC(2026, 10, 20, 10, 0, 0);

/* ----------------------------------------------------------------- replay */

export interface SBoxRun {
  boxes: SBox[];
  events: StorageEvent[][];
  actions: StorageAction[];
  /** Events of the engine actions only, aligned with `actions`. */
  engineEvents: StorageEvent[][];
}

/** What a storage scenario's check sees: the old mission context, plus the shell around it. */
export interface SCtx {
  start: StorageLog;
  log: StorageLog;
  actions: StorageAction[];
  events: StorageEvent[][];
  startBox: SBox;
  box: SBox;
}

export function sCtx(startBox: SBox, run: SBoxRun): SCtx {
  const box = run.boxes[run.boxes.length - 1]!;
  return { start: startBox.log, log: box.log, actions: run.actions, events: run.engineEvents, startBox, box };
}

export function applyS(box: SBox, a: SShellAction): { box: SBox; events: StorageEvent[] } {
  if (isFileAction(a)) return { box: applyFile(box, a), events: [] };
  const r = applyStorage(box.log, a);
  return { box: { ...box, log: r.log }, events: r.events };
}

export function replayS(start: SBox, actions: SShellAction[]): SBoxRun {
  const boxes = [start];
  const events: StorageEvent[][] = [];
  const engine: StorageAction[] = [];
  const engineEvents: StorageEvent[][] = [];
  let box = start;
  for (const a of actions) {
    const r = applyS(box, a);
    box = r.box;
    boxes.push(box);
    events.push(r.events);
    if (!isFileAction(a)) {
      engine.push(a);
      engineEvents.push(r.events);
    }
  }
  return { boxes, events, actions: engine, engineEvents };
}

export const applyAllS = (box: SBox, actions: SShellAction[]) => actions.reduce((b, a) => applyS(b, a).box, box);

/* ------------------------------------------------------------------ shell */

const partDir = (box: SBox) => `${DATA}/${box.topic}-0`;

function pipeline(box: SBox, words: string[]): R {
  const bar = words.indexOf("|");
  if (bar !== -1) {
    const input = pipeLines(box.files, words.slice(0, bar));
    if (typeof input === "string") return fail(input);
    const right = words.slice(bar + 1);
    if (toolName(right[0] ?? "") !== "kafka-console-producer") return fail("(in this sandbox, a pipe goes into kafka-console-producer.sh)");
    return producer(box, right.slice(1), input);
  }
  const [cmd = "", ...args] = words;
  switch (toolName(cmd)) {
    case "kafka-configs":
      return configs(box, args);
    case "kafka-topics":
      return topics(box, args);
    case "kafka-console-producer":
      return say(`(this terminal is one line at a time: send records through a pipe, e.g.\n echo "hello" | kafka-console-producer.sh --bootstrap-server ${BOOTSTRAP} --topic ${box.topic})`, "dim");
    case "kafka-console-consumer":
      return consumer(box, args);
    case "kafka-get-offsets":
      return offsets(box, args);
    case "kafka-dump-log":
      return dump(box, args);
  }
  if (cmd === "sleep") {
    const secs = sleepSeconds(args);
    if (secs === null) return fail(`sleep: invalid time interval '${args.join(" ")}'`);
    const actions: StorageAction[] = [{ type: "tick", days: secs / 86400 }];
    // The log cleaner wakes up every 15 s (log.cleaner.backoff.ms) on its own.
    if (box.log.config.policy === "compact" && secs >= 15) actions.push({ type: "compact" });
    return { actions, output: [] };
  }
  if (cmd === "date") return say(dateText(box.log.time));
  if (cmd === "ls") return ls(box, args);
  const basic = fileCommand<SShellAction, SBox>(box, cmd, args, { home: "/home/appuser", help: help(box) });
  if (basic) return basic;
  return fail(`bash: ${cmd}: command not found`);
}

const runLine = makeRunner<SShellAction, SBox>({ pipeline, apply: applyAllS });

export function promptFor(box: SBox): string {
  void box;
  return "[appuser@kafka-1 ~]$";
}

const TOOLS = ["kafka-configs.sh", "kafka-topics.sh", "kafka-console-producer.sh", "kafka-console-consumer.sh", "kafka-get-offsets.sh", "kafka-dump-log.sh"];
const FLAGS = [
  "--bootstrap-server", "--topic", "--alter", "--describe", "--entity-type", "--entity-name", "--add-config", "--delete-config", "--from-beginning",
  "--property", "--time", "--files", "--print-data-log", "--offset", "--partition", "topics", "parse.key=true", "key.separator=:", "null.marker=NULL",
  "print.key=true", "print.offset=true", "retention.ms=", "retention.bytes=", "segment.bytes=", "segment.ms=", "cleanup.policy=compact", "cleanup.policy=delete", "delete.retention.ms=",
];

export function completeLine(box: SBox, input: string) {
  const words = input.trimStart().split(/\s+/);
  const candidates =
    words.length <= 1 || /[|&;]\s*\S*$/.test(input)
      ? [...TOOLS, "sleep", "date", "echo", "printf", "cat", "ls", "nano", "clear", "help"]
      : [...FLAGS, BOOTSTRAP, box.topic, DATA, partDir(box), ...box.log.segments.map((s) => `${partDir(box)}/${fileName(s.base)}`), ...Object.keys(box.files)];
  return completeWord(input, candidates);
}

export const storageShell: CommandLine<SShellAction, SBox> = { run: runLine, prompt: promptFor, complete: completeLine, title: "kafka-1" };

/* ------------------------------------------------------------------- files */

function dateText(days: number): string {
  const d = new Date(EPOCH_MS + days * DAY_MS);
  return d.toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) ([\d:]+) GMT$/, (_m, wd: string, day: string, mon: string, year: string, time: string) => `${wd} ${mon} ${day.padStart(2, " ")} ${time} UTC ${year}`);
}

function lsTime(days: number): string {
  const d = new Date(EPOCH_MS + days * DAY_MS);
  const mon = d.toUTCString().split(" ")[2]!;
  return `${mon} ${String(d.getUTCDate()).padStart(2, " ")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** The files of the partition directory, as `ls` lists them: per segment .index, .log, .timeindex. */
function partitionFiles(box: SBox): { name: string; size: number; time: number }[] {
  const log = box.log;
  const active = activeSegment(log);
  const files: { name: string; size: number; time: number }[] = [];
  for (const seg of log.segments) {
    const isActive = seg === active;
    const last = seg.records.length ? Math.max(...seg.records.map((r) => r.time)) : seg.created;
    files.push({ name: fileName(seg.base, "index"), size: isActive ? 10485760 : 8 * seg.records.length, time: last });
    files.push({ name: fileName(seg.base, "log"), size: seg.records.length * RECORD_BYTES, time: last });
    files.push({ name: fileName(seg.base, "timeindex"), size: isActive ? 10485756 : 12 * Math.max(1, seg.records.length), time: last });
  }
  files.push({ name: "leader-epoch-checkpoint", size: 8, time: 0 }, { name: "partition.metadata", size: 43, time: 0 });
  return files.sort((a, b) => (a.name < b.name ? -1 : 1));
}

function ls(box: SBox, args: string[]): R {
  const long = args.some((a) => /^-\w*l/.test(a));
  const path = (args.find((a) => !a.startsWith("-")) ?? "").replace(/\/$/, "");
  if (!path || path === "." || path === "~") return say(Object.keys(box.files).sort().join("  "));
  if (path === DATA) {
    const names = [`${box.topic}-0`, "cleaner-offset-checkpoint", "log-start-offset-checkpoint", "meta.properties", "recovery-point-offset-checkpoint", "replication-offset-checkpoint"];
    return say(long ? names.map((n) => `${n.endsWith("-0") ? "drwxr-xr-x" : "-rw-r--r--"} 1 appuser appuser ${n.endsWith("-0") ? "4096" : "  64"} ${lsTime(box.log.time)} ${n}`).join("\n") : names.join("  "));
  }
  if (path === partDir(box)) {
    const files = partitionFiles(box);
    if (!long) return say(files.map((f) => f.name).join("\n"));
    return say([`total ${Math.ceil(files.reduce((n, f) => n + f.size, 0) / 1024)}`, ...files.map((f) => `-rw-r--r-- 1 appuser appuser ${String(f.size).padStart(8)} ${lsTime(f.time)} ${f.name}`)].join("\n"));
  }
  if (path in box.files) return say(path);
  return fail(`ls: cannot access '${path}': No such file or directory`);
}

/* ---------------------------------------------------------------- configs */

/** The topic's configs in Kafka's units: ms and bytes. */
export function configValues(c: StorageConfig): Record<string, string> {
  return {
    "cleanup.policy": c.policy,
    "delete.retention.ms": String(c.deleteRetentionDays * DAY_MS),
    "retention.bytes": c.retentionRecords === null ? "-1" : String(c.retentionRecords * RECORD_BYTES),
    "retention.ms": c.retentionDays === null ? "-1" : String(Math.round(c.retentionDays * DAY_MS)),
    "segment.bytes": String(c.segmentRecords * RECORD_BYTES),
    "segment.ms": c.segmentDays === null ? "9223372036854775807" : String(Math.round(c.segmentDays * DAY_MS)),
  };
}

function noServer(o: Parameters<typeof needServer>[0]): string | null {
  return needServer(o);
}

function configs(box: SBox, args: string[]): R {
  const o = parseOpts(args, {
    "--bootstrap-server": true, "--alter": false, "--describe": false, "--entity-type": true, "--entity-name": true, "--topic": true,
    "--add-config": true, "--delete-config": true, "--all": false,
  });
  if (typeof o === "string") return fail(o);
  const server = noServer(o);
  if (server) return fail(server);
  const type = one(o, "--entity-type") ?? (o.flags.has("--topic") ? "topics" : undefined);
  const name = one(o, "--entity-name") ?? one(o, "--topic");
  if (!type) return fail("an entity-type must be specified with --alter or --describe");
  if (type === "brokers") return say("(here the settings live on the topic: --entity-type topics)", "dim");
  if (type !== "topics") return fail("--entity-type must include only valid entity types: topics, clients, users, brokers, broker-loggers, ips");
  if (!name) return fail("an entity name must be specified with --alter of topics");
  if (name !== box.topic) return fail(`Error while executing config command with args '${args.join(" ")}'\njava.util.concurrent.ExecutionException: org.apache.kafka.common.errors.UnknownTopicOrPartitionException: The topic '${name}' does not exist.`);
  const c = box.log.config;

  if (o.flags.has("--describe")) {
    const v = configValues(c);
    return { actions: [], output: [out(`Dynamic configs for topic ${name} are:`), ...Object.entries(v).map(([k, x]) => out(`  ${k}=${x} sensitive=false synonyms={DYNAMIC_TOPIC_CONFIG:${k}=${x}}`))] };
  }
  if (!o.flags.has("--alter")) return fail("Command must include exactly one action: --describe, --alter");
  const add = one(o, "--add-config");
  const del = one(o, "--delete-config");
  if (!add && !del) return fail("At least one of --add-config or --delete-config must be specified with --alter");
  const bad = (k: string, v: string, why: string): R =>
    fail(`Error while executing config command with args '${args.join(" ")}'\norg.apache.kafka.common.errors.InvalidConfigurationException: Invalid value ${v} for configuration ${k}: ${why}`);

  const next: Partial<StorageConfig> = {};
  const notes: TermLine[] = [];
  // Kafka splits --add-config on commas; a list value goes in brackets: cleanup.policy=[compact,delete].
  const pairs = (add ?? "").match(/[^,[\]]+=(\[[^\]]*\]|[^,]*)/g) ?? [];
  for (const kv of pairs) {
    const [k, raw = ""] = [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)];
    const v = raw.replace(/^\[|\]$/g, "");
    const n = Number(v);
    switch (k) {
      case "retention.ms":
        if (!Number.isFinite(n) || (n < 0 && n !== -1)) return bad(k, v, "Value must be at least -1");
        next.retentionDays = n === -1 ? null : n / DAY_MS;
        break;
      case "segment.ms":
        if (!Number.isFinite(n) || n < 1) return bad(k, v, "Value must be at least 1");
        next.segmentDays = n / DAY_MS;
        break;
      case "delete.retention.ms":
        if (!Number.isFinite(n) || n < 0) return bad(k, v, "Value must be at least 0");
        next.deleteRetentionDays = n / DAY_MS;
        break;
      case "segment.bytes":
        if (!Number.isFinite(n) || n < 14) return bad(k, v, "Value must be at least 14");
        next.segmentRecords = Math.max(1, Math.floor(n / RECORD_BYTES));
        if (n % RECORD_BYTES) notes.push(out(`(every record here is ${RECORD_BYTES} bytes: a segment now holds ${next.segmentRecords})`, "dim"));
        break;
      case "retention.bytes":
        if (!Number.isFinite(n) || (n < 0 && n !== -1)) return bad(k, v, "Value must be at least -1");
        next.retentionRecords = n === -1 ? null : Math.floor(n / RECORD_BYTES);
        break;
      case "cleanup.policy": {
        const parts = v.split(",").map((x) => x.trim());
        if (parts.some((x) => x !== "delete" && x !== "compact")) return bad(k, v, "String must be one of: compact, delete");
        if (parts.length > 1) return say("(compact,delete together is not in this sandbox: pick one)", "dim");
        next.policy = parts[0] as "delete" | "compact";
        break;
      }
      default:
        return fail(`Error while executing config command with args '${args.join(" ")}'\norg.apache.kafka.common.errors.InvalidConfigurationException: Unknown topic config name: ${k}`);
    }
  }
  for (const k of (del ?? "").split(",").filter(Boolean)) {
    const d = DEFAULT_CONFIG;
    const map: Record<string, Partial<StorageConfig>> = {
      "retention.ms": { retentionDays: d.retentionDays },
      "segment.ms": { segmentDays: d.segmentDays },
      "delete.retention.ms": { deleteRetentionDays: d.deleteRetentionDays },
      "segment.bytes": { segmentRecords: d.segmentRecords },
      "retention.bytes": { retentionRecords: d.retentionRecords },
      "cleanup.policy": { policy: d.policy },
    };
    if (!map[k]) return fail(`Error while executing config command with args '${args.join(" ")}'\norg.apache.kafka.common.errors.InvalidConfigurationException: Unknown topic config name: ${k}`);
    Object.assign(next, map[k]);
  }
  const changed = (Object.keys(next) as (keyof StorageConfig)[]).some((k) => next[k] !== c[k]);
  return { actions: changed ? [{ type: "configure", config: next }] : [], output: [out(`Completed updating config for topic ${name}.`), ...notes] };
}

/* ------------------------------------------------------------ kafka-topics */

function topics(box: SBox, args: string[]): R {
  const o = parseOpts(args, { "--bootstrap-server": true, "--describe": false, "--list": false, "--create": false, "--alter": false, "--delete": false, "--topic": true, "--partitions": true, "--config": true });
  if (typeof o === "string") return fail(o);
  const server = noServer(o);
  if (server) return fail(server);
  if (o.flags.has("--list")) return say(box.topic);
  if (!o.flags.has("--describe")) return say("(this sandbox has one topic with one partition; change it with kafka-configs.sh)", "dim");
  const name = one(o, "--topic");
  if (name && name !== box.topic) return fail(`Error while executing topic command : Topic '${name}' does not exist as expected`);
  const v = configValues(box.log.config);
  const cfg = Object.entries(v).map(([k, x]) => `${k}=${x}`).join(",");
  return {
    actions: [],
    output: [
      out(`Topic: ${box.topic}\tTopicId: ${topicId(box.topic)}\tPartitionCount: 1\tReplicationFactor: 1\tConfigs: ${cfg}`, "hl"),
      out(`\tTopic: ${box.topic}\tPartition: 0\tLeader: 1\tReplicas: 1\tIsr: 1`),
    ],
  };
}

/* ----------------------------------------------------------------- producer */

function producer(box: SBox, args: string[], input: string[]): R {
  const o = parseOpts(args, { "--bootstrap-server": true, "--topic": true, "--property": true, "--producer-property": true, "--reader-property": true });
  if (typeof o === "string") return fail(o);
  const server = noServer(o);
  if (server) return fail(server);
  const topic = one(o, "--topic");
  if (!topic) return fail('Missing required argument "[topic]"');
  if (topic !== box.topic) return fail(`${logTime(Math.round(box.log.time * 10))} WARN [Producer clientId=console-producer] Error while fetching metadata with correlation id 1 : {${topic}=UNKNOWN_TOPIC_OR_PARTITION}`);
  const p = { ...props(o), ...Object.fromEntries((o.flags.get("--reader-property") ?? []).map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)])) };
  const parseKey = p["parse.key"] === "true";
  const sep = p["key.separator"] ?? "\t";
  const nullMarker = p["null.marker"];
  const actions: StorageAction[] = [];
  let log = box.log;
  for (const [i, line] of input.entries()) {
    let key: string | null = null;
    let value: string | null = line;
    if (parseKey) {
      const at = line.indexOf(sep);
      if (at === -1) return { actions, output: [out(`org.apache.kafka.common.KafkaException: No key separator found on line number ${i + 1}: '${line}'`, "err")], failed: true };
      key = line.slice(0, at);
      value = line.slice(at + sep.length);
    }
    if (nullMarker !== undefined) {
      if (key === nullMarker) key = null;
      if (value === nullMarker) value = null;
    }
    const a: StorageAction = { type: "append", key, value };
    const r = applyStorage(log, a);
    if (r.events.some((e) => e.type === "error")) {
      return {
        actions,
        output: [
          out(`${logTime(Math.round(log.time * 10))} ERROR Error when sending message to topic ${topic} with key: null, value: ${(value ?? "").length} bytes with error: (org.apache.kafka.clients.producer.internals.ErrorLoggingCallback)`, "err"),
          out(`org.apache.kafka.common.InvalidRecordException: One or more records have been rejected due to 1 record errors in total, and only showing the first three errors at most: [RecordError(batchIndex=0, message='Compacted topic cannot accept message without key in topic partition ${topic}-0.')]`, "err"),
        ],
        failed: true,
      };
    }
    actions.push(a);
    log = r.log;
  }
  return { actions, output: [] };
}

/* ----------------------------------------------------------------- consumer */

function consumer(box: SBox, args: string[]): R {
  const o = parseOpts(args, { "--bootstrap-server": true, "--topic": true, "--from-beginning": false, "--partition": true, "--offset": true, "--max-messages": true, "--property": true, "--timeout-ms": true });
  if (typeof o === "string") return fail(o);
  const server = noServer(o);
  if (server) return fail(server);
  const topic = one(o, "--topic");
  if (!topic) return fail("Exactly one of whitelist/topic is required.");
  if (topic !== box.topic) return fail(`WARN Error while fetching metadata with correlation id 2 : {${topic}=UNKNOWN_TOPIC_OR_PARTITION}`);
  const log = box.log;
  const offsetArg = one(o, "--offset");
  let from: number;
  if (offsetArg !== undefined) {
    if (one(o, "--partition") === undefined) return fail("The partition is required when offset is specified.");
    if (offsetArg === "earliest") from = log.logStartOffset;
    else if (offsetArg === "latest") from = log.logEndOffset;
    else {
      from = Number(offsetArg);
      if (from < log.logStartOffset || from > log.logEndOffset) {
        return {
          actions: [],
          output: [
            out(`${logTime(Math.round(log.time * 10))} INFO [Consumer clientId=console-consumer] Fetch position FetchPosition{offset=${from}} is out of range for partition ${topic}-0, resetting offset`),
            out("Processed a total of 0 messages"),
            out(`(offset ${from} is gone: the log now starts at ${log.logStartOffset}, so the consumer jumped to the end)`, "dim"),
          ],
        };
      }
    }
  } else if (o.flags.has("--from-beginning")) from = log.logStartOffset;
  else return { actions: [], output: [out("Processed a total of 0 messages"), out("(without --from-beginning a new consumer starts at the end; add --from-beginning to read what is there)", "dim")] };
  const p = props(o);
  const max = one(o, "--max-messages");
  const output: TermLine[] = [];
  let n = 0;
  for (const r of allRecords(log)) {
    if (r.offset < from) continue;
    if (max !== undefined && n >= Number(max)) break;
    const parts = [
      p["print.partition"] === "true" ? "Partition:0" : null,
      p["print.offset"] === "true" ? `Offset:${r.offset}` : null,
      p["print.key"] === "true" ? (r.key ?? "null") : null,
      r.value ?? "null",
    ].filter((x): x is string => x !== null);
    output.push(out(parts.join("\t")));
    n++;
  }
  output.push(out(`Processed a total of ${n} messages`));
  return { actions: [], output };
}

function offsets(box: SBox, args: string[]): R {
  const o = parseOpts(args, { "--bootstrap-server": true, "--topic": true, "--time": true, "--partitions": true });
  if (typeof o === "string") return fail(o);
  const server = noServer(o);
  if (server) return fail(server);
  const topic = one(o, "--topic") ?? box.topic;
  if (topic !== box.topic) return say("");
  const time = one(o, "--time") ?? "-1";
  const at = time === "-2" || time === "earliest" ? box.log.logStartOffset : box.log.logEndOffset;
  return say(`${topic}:0:${at}`);
}

/* -------------------------------------------------------------- dump-log */

function dump(box: SBox, args: string[]): R {
  const o = parseOpts(args, { "--files": true, "--print-data-log": false, "--deep-iteration": false });
  if (typeof o === "string") return fail(o);
  const path = one(o, "--files");
  if (!path) return fail('Missing required argument "[files]"');
  const name = path.split("/").pop()!;
  const seg = box.log.segments.find((s) => fileName(s.base) === name);
  if (!seg || !path.startsWith(partDir(box))) return fail(`Exception in thread "main" java.nio.file.NoSuchFileException: ${path}`);
  const output: TermLine[] = [out(`Dumping ${path}`), out(`Log starting offset: ${seg.base}`)];
  let position = 0;
  for (const r of seg.records) {
    const t = EPOCH_MS + Math.round(r.time * DAY_MS);
    output.push(out(`baseOffset: ${r.offset} lastOffset: ${r.offset} count: 1 baseSequence: -1 lastSequence: -1 producerId: -1 isTransactional: false isControl: false position: ${position} CreateTime: ${t} size: ${RECORD_BYTES} magic: 2 compresscodec: none crc: ${(r.offset * 2654435761) >>> 0} isvalid: true`));
    if (o.flags.has("--print-data-log"))
      output.push(out(`| offset: ${r.offset} CreateTime: ${t} keySize: ${r.key === null ? -1 : r.key.length} valueSize: ${r.value === null ? -1 : r.value.length} sequence: -1 headerKeys: []${r.key === null ? "" : ` key: ${r.key}`}${r.value === null ? "" : ` payload: ${r.value}`}`, r.value === null ? "dim" : "out"));
    position += RECORD_BYTES;
  }
  return { actions: [], output };
}

function help(box: SBox): string {
  return `This sandbox is a shell on broker kafka-1. Topic ${box.topic} has one partition, stored in ${partDir(box)}.
Every record here is ${RECORD_BYTES} bytes, so segment.bytes=3072 means three records per segment.
  ls -l ${partDir(box)}         the segment files
  kafka-configs.sh --alter --entity-type topics --entity-name ${box.topic} --add-config retention.ms=259200000
  kafka-configs.sh --describe --entity-type topics --entity-name ${box.topic}
  echo "a:b" | kafka-console-producer.sh --topic ${box.topic} --property parse.key=true --property key.separator=:
      (add --property null.marker=NULL to send NULL as a tombstone)
  kafka-console-consumer.sh --topic ${box.topic} --from-beginning --property print.key=true
  kafka-get-offsets.sh --topic ${box.topic} --time -2     where the log starts (-1: where it ends)
  kafka-dump-log.sh --files <segment .log file> --print-data-log
  sleep 3d                      let time pass (retention checks; on a compacted topic the cleaner runs)
  date                          the broker's clock
Every Kafka tool except kafka-dump-log.sh needs --bootstrap-server ${BOOTSTRAP}. Files: cat, echo > file, nano.`;
}

/** Types lines into a scenario the way a reader would; for tests. */
export function playS(start: SBox, typed: string[], edits: ((text: string) => string)[] = []) {
  const r = typeLines(storageShell, applyAllS, start, typed, edits);
  return { ctx: sCtx(start, replayS(start, r.actions)), moves: r.moves, output: r.output };
}
