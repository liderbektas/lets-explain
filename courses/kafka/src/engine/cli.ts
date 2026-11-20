import type { CommandLine, ShellEditor, ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete as completeWord, lines, out, shellWords, splitCommands, type TermLine } from "@lets-explain/core/lib/terminal";
import { apply, createCluster } from "./cluster";
import { tp, type Action, type ClusterState, type Group, type SimEvent, type TP } from "./types";

/**
 * A command line on top of the cluster model: Kafka's own tools (kafka-topics.sh,
 * kafka-console-producer.sh, kafka-console-consumer.sh, kafka-consumer-groups.sh) plus a few
 * shell basics. What a reader types turns into the same actions the lessons play, and the
 * tools print what the real ones print. What it does not know, it says plainly.
 *
 * Sandbox rules (said in the output where they matter):
 * - A console consumer in the foreground stops once it has read everything there is, instead
 *   of waiting for Ctrl+C. One started with `&` keeps running: after every command it reads
 *   what is new, like a real background job, until `kill`.
 * - Only localhost:9092 answers.
 */

/** A console consumer running in the background (`... &`). */
export interface Job {
  id: number;
  pid: number;
  command: string;
  group: string;
  member: string;
  topic: string;
  processed: number;
  printKey: boolean;
  printPartition: boolean;
  printOffset: boolean;
  /** Started with `--consumer-property enable.auto.commit=false`: it reads but never commits. */
  noCommit?: boolean;
}

/** Everything the terminal works on: the cluster, background jobs and the files in ~/kafka. */
export interface KafkaBox {
  cluster: ClusterState;
  jobs: Job[];
  files: Record<string, string>;
  nextPid: number;
}

/** A cluster action, or a change to the shell around it. */
export type ShellAction = Action | { type: "$jobs"; jobs: Job[]; nextPid: number } | { type: "$file"; path: string; content: string | null };

export type KafkaResult = ShellResult<ShellAction, KafkaBox>;
export type KafkaEditor = ShellEditor<ShellAction, KafkaBox>;

export const BOOTSTRAP = "localhost:9092";

export function boxOf(cluster: ClusterState, files: Record<string, string> = {}): KafkaBox {
  return { cluster, jobs: [], files, nextPid: 4242 };
}

export const emptyBox = () => boxOf(createCluster());

/* ----------------------------------------------------------------- replay */

export function applyShell(box: KafkaBox, a: ShellAction): { box: KafkaBox; events: SimEvent[] } {
  if (a.type === "$jobs") return { box: { ...box, jobs: a.jobs, nextPid: a.nextPid }, events: [] };
  if (a.type === "$file") {
    const files = { ...box.files };
    if (a.content === null) delete files[a.path];
    else files[a.path] = a.content;
    return { box: { ...box, files }, events: [] };
  }
  const r = apply(box.cluster, a);
  return { box: { ...box, cluster: r.state }, events: r.events };
}

export interface ShellRun {
  /** Box after each action; boxes[0] is the start. */
  boxes: KafkaBox[];
  /** Events of each action. */
  events: SimEvent[][];
  /** The cluster actions among them, in order. */
  actions: Action[];
}

export function replayShell(start: KafkaBox, actions: ShellAction[]): ShellRun {
  const boxes = [start];
  const events: SimEvent[][] = [];
  const engine: Action[] = [];
  let box = start;
  for (const a of actions) {
    const r = applyShell(box, a);
    box = r.box;
    boxes.push(box);
    events.push(r.events);
    if (!a.type.startsWith("$")) engine.push(a as Action);
  }
  return { boxes, events, actions: engine };
}

export const applyAll = (box: KafkaBox, actions: ShellAction[]) => actions.reduce((b, a) => applyShell(b, a).box, box);

/* ------------------------------------------------------------------ entry */

interface Run {
  actions: ShellAction[];
  output: TermLine[];
  failed?: boolean;
  editor?: KafkaEditor;
  clear?: boolean;
}

const say = (text: string, tone: TermLine["tone"] = "out"): Run => ({ actions: [], output: text ? lines(text, tone) : [] });
const fail = (text: string): Run => ({ actions: [], output: lines(text, "err"), failed: true });

export function runLine(start: KafkaBox, line: string): KafkaResult {
  const result: KafkaResult = { actions: [], output: [], moves: 0 };
  let box = start;
  for (const words of splitCommands(shellWords(spacePipes(line)))) {
    const r = runPipeline(box, words);
    result.actions.push(...r.actions);
    result.output.push(...r.output);
    if (r.clear) {
      result.clear = true;
      result.output = [];
    }
    if (r.actions.some((a) => !a.type.startsWith("$"))) result.moves++;
    box = applyAll(box, r.actions);
    if (r.editor) {
      result.editor = r.editor;
      return result;
    }
    if (r.failed) break;
  }
  // Background consumers read what is new after every command, as running jobs do.
  const bg = backgroundTick(box);
  result.actions.push(...bg.actions);
  result.output.push(...bg.output);
  return result;
}

export function promptFor(box: KafkaBox): string {
  void box;
  return "~/kafka$";
}

const TOOLS = ["kafka-topics.sh", "kafka-console-producer.sh", "kafka-console-consumer.sh", "kafka-consumer-groups.sh"];
const SHELL = [...TOOLS, "echo", "printf", "cat", "ls", "nano", "jobs", "kill", "clear", "help"];
const FLAGS = [
  "--bootstrap-server", "--topic", "--create", "--describe", "--list", "--alter", "--partitions", "--replication-factor", "--group",
  "--from-beginning", "--max-messages", "--property", "--reset-offsets", "--to-earliest", "--to-latest", "--to-offset", "--shift-by",
  "--execute", "--dry-run", "--all-topics", "parse.key=true", "key.separator=:", "print.key=true", "print.partition=true", "print.offset=true",
];

export function completeLine(box: KafkaBox, input: string) {
  const words = input.trimStart().split(/\s+/);
  const candidates =
    words.length <= 1 || /[|&;]\s*\S*$/.test(input)
      ? SHELL
      : [...FLAGS, BOOTSTRAP, ...Object.keys(box.cluster.topics), ...Object.keys(box.cluster.groups), ...Object.keys(box.files)];
  return completeWord(input, candidates);
}

export const kafkaShell: CommandLine<ShellAction, KafkaBox> = { run: runLine, prompt: promptFor, complete: completeLine, title: "bash" };

/** `a|b` → `a | b`, outside quotes, so the shell words see the pipe. */
function spacePipes(line: string): string {
  let outLine = "";
  let quote: string | null = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      outLine += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      outLine += ch;
    } else if (ch === "|") outLine += " | ";
    else outLine += ch;
  }
  return outLine;
}

/* ------------------------------------------------------------------ shell */

function runPipeline(box: KafkaBox, words: string[]): Run {
  const background = words[words.length - 1] === "&";
  const all = background ? words.slice(0, -1) : words;
  const bar = all.indexOf("|");
  if (bar !== -1) {
    const left = all.slice(0, bar);
    const right = all.slice(bar + 1);
    const input = pipeSource(box, left);
    if (typeof input !== "object") return fail(input);
    const tool = toolName(right[0] ?? "");
    if (tool !== "kafka-console-producer") return fail(`(in this sandbox, a pipe goes into kafka-console-producer.sh)`);
    return producer(box, right.slice(1), input.lines);
  }
  const [cmd = "", ...args] = all;
  const tool = toolName(cmd);
  if (background && tool !== "kafka-console-consumer") return say(`(only a console consumer runs in the background here)`, "dim");
  switch (tool) {
    case "kafka-topics":
      return topics(box, args);
    case "kafka-console-producer":
      return say(
        `(this terminal is one line at a time: send messages through a pipe, e.g.\n echo "hello" | kafka-console-producer.sh --bootstrap-server ${BOOTSTRAP} --topic orders)`,
        "dim",
      );
    case "kafka-console-consumer":
      return consumer(box, args, background, all.join(" "));
    case "kafka-consumer-groups":
      return groups(box, args);
    case "kafka-delete-records":
      return deleteRecords(box, args);
    case "kafka-configs":
    case "kafka-reassign-partitions":
    case "kafka-get-offsets":
      return say(`(${cmd} is not in this sandbox yet)`, "dim");
  }
  switch (cmd) {
    case "clear":
      return { actions: [], output: [], clear: true };
    case "help":
      return say(HELP);
    case "ls":
      return say(Object.keys(box.files).sort().join("  "));
    case "pwd":
      return say("/home/you/kafka");
    case "cat": {
      if (!args.length) return fail("cat: missing file operand");
      const o: TermLine[] = [];
      for (const p of args) {
        if (!(p in box.files)) return { actions: [], output: [...o, out(`cat: ${p}: No such file or directory`, "err")], failed: true };
        o.push(...lines(box.files[p]!));
      }
      return { actions: [], output: o };
    }
    case "echo":
    case "printf": {
      const at = args.findIndex((a) => a === ">" || a === ">>");
      const text = textOf(cmd, at === -1 ? args : args.slice(0, at));
      if (at === -1) return say(text.replace(/\n$/, ""));
      const path = args[at + 1];
      if (!path) return fail("bash: syntax error near unexpected token `newline'");
      const old = box.files[path];
      const content = args[at] === ">>" && old ? `${old}\n${text.replace(/\n$/, "")}` : text.replace(/\n$/, "");
      return { actions: [{ type: "$file", path, content }], output: [] };
    }
    case "rm": {
      const paths = args.filter((a) => !a.startsWith("-"));
      for (const p of paths) if (!(p in box.files)) return fail(`rm: ${p}: No such file or directory`);
      return { actions: paths.map((p) => ({ type: "$file", path: p, content: null }) as ShellAction), output: [] };
    }
    case "nano":
    case "vim":
    case "vi":
    case "code": {
      const path = args.find((a) => !a.startsWith("-"));
      if (!path) return fail(`${cmd}: give the file to open, e.g. ${cmd} producer.properties`);
      return {
        actions: [],
        output: [],
        editor: {
          file: path,
          text: box.files[path] ?? "",
          save: (b, text) => {
            const content = text.replace(/\n+$/, "");
            if (b.files[path] === content) return { actions: [], output: [], moves: 0 };
            return { actions: [{ type: "$file", path, content }], output: [], moves: 0 };
          },
        },
      };
    }
    case "jobs":
      return say(box.jobs.map((j, i) => `[${j.id}]${i === box.jobs.length - 1 ? "+" : "-"}  Running                 ${j.command} &`).join("\n"));
    case "kill":
      return kill(box, args);
    case "cd":
      return say("cd: this sandbox stays in ~/kafka", "dim");
    default:
      return fail(`bash: ${cmd}: command not found`);
  }
}

/** `bin/kafka-topics.sh`, `kafka-topics.sh` and Confluent's `kafka-topics` are the same tool. */
function toolName(cmd: string): string {
  return cmd.replace(/^(\.\/)?(bin\/)?/, "").replace(/\.sh$/, "");
}

function textOf(cmd: string, args: string[]): string {
  if (cmd === "printf") return (args[0] ?? "").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  const escapes = args[0] === "-e";
  const text = (escapes ? args.slice(1) : args).join(" ");
  return escapes ? text.replace(/\\n/g, "\n").replace(/\\t/g, "\t") : text;
}

function pipeSource(box: KafkaBox, words: string[]): { lines: string[] } | string {
  const [cmd = "", ...args] = words;
  if (cmd === "echo" || cmd === "printf") return { lines: textOf(cmd, args).replace(/\n$/, "").split("\n") };
  if (cmd === "cat") {
    const path = args[0];
    if (!path || !(path in box.files)) return `cat: ${path ?? ""}: No such file or directory`;
    return { lines: box.files[path]!.split("\n").filter((l) => l !== "") };
  }
  return `(in this sandbox, a pipe starts with echo, printf or cat)`;
}

/* ------------------------------------------------------------- flag parsing */

interface Opts {
  flags: Map<string, string[]>;
  rest: string[];
}

/** Kafka's tools use long options only; `known` maps a flag to whether it takes a value. */
function parseOpts(args: string[], known: Record<string, boolean>): Opts | string {
  const o: Opts = { flags: new Map(), rest: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith("--")) {
      o.rest.push(a);
      continue;
    }
    const [flag, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    if (!(flag in known)) return `Exception in thread "main" joptsimple.UnrecognizedOptionException: ${flag.slice(2)} is not a recognized option`;
    let value = "";
    if (known[flag]) {
      const v = inline ?? args[++i];
      if (v === undefined || v.startsWith("--")) return `Exception in thread "main" joptsimple.OptionMissingRequiredArgumentException: Option ${flag} requires an argument`;
      value = v;
    }
    o.flags.set(flag, [...(o.flags.get(flag) ?? []), value]);
  }
  return o;
}

const one = (o: Opts, flag: string) => o.flags.get(flag)?.[0];

function needServer(o: Opts): string | null {
  const server = one(o, "--bootstrap-server");
  if (server === undefined) return 'Missing required argument "[bootstrap-server]"';
  if (!server.split(",").some((s) => s.trim() === BOOTSTRAP || s.trim() === "127.0.0.1:9092"))
    return `[AdminClient clientId=adminclient-1] Connection to node -1 (${server}) could not be established. Node may not be available.\n(in this sandbox the broker is at ${BOOTSTRAP})`;
  return null;
}

/** `--property key=value` pairs. */
function props(o: Opts): Record<string, string> {
  const p: Record<string, string> = {};
  for (const kv of o.flags.get("--property") ?? []) {
    const i = kv.indexOf("=");
    if (i > 0) p[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return p;
}

/* ------------------------------------------------------------ kafka-topics */

function topics(box: KafkaBox, args: string[]): Run {
  const o = parseOpts(args, {
    "--bootstrap-server": true, "--create": false, "--describe": false, "--list": false, "--alter": false, "--delete": false,
    "--topic": true, "--partitions": true, "--replication-factor": true, "--if-not-exists": false, "--config": true,
    "--under-replicated-partitions": false, "--exclude-internal": false,
  });
  if (typeof o === "string") return fail(o);
  const s = box.cluster;
  const actions = ["--create", "--describe", "--list", "--alter", "--delete"].filter((f) => o.flags.has(f));
  if (actions.length !== 1) return fail("Command must include exactly one action: --list, --describe, --create, --alter or --delete");
  const server = needServer(o);
  if (server) return fail(server);
  const name = one(o, "--topic");

  if (o.flags.has("--list")) return say(Object.keys(s.topics).sort().join("\n"));

  if (o.flags.has("--describe")) {
    const names = name ? [name] : Object.keys(s.topics).sort();
    if (name && !s.topics[name]) return fail(`Error while executing topic command : Topic '${name}' does not exist as expected`);
    const o2: TermLine[] = [];
    for (const n of names) {
      const t = s.topics[n]!;
      o2.push(out(`Topic: ${n}\tTopicId: ${topicId(n)}\tPartitionCount: ${t.partitions.length}\tReplicationFactor: 1\tConfigs: `, "hl"));
      for (const p of t.partitions) o2.push(out(`\tTopic: ${n}\tPartition: ${p.index}\tLeader: ${p.leader}\tReplicas: ${p.leader}\tIsr: ${p.leader}`));
    }
    return { actions: [], output: o2 };
  }

  if (!name) return fail("Missing required argument \"[topic]\"");

  if (o.flags.has("--create")) {
    if (s.topics[name]) {
      if (o.flags.has("--if-not-exists")) return say("");
      return fail(`Error while executing topic command : Topic '${name}' already exists.`);
    }
    const partitions = Number(one(o, "--partitions") ?? "1");
    const rf = Number(one(o, "--replication-factor") ?? "1");
    if (!Number.isInteger(partitions) || partitions < 1) return fail("Error while executing topic command : Number of partitions must be larger than 0.");
    const alive = s.brokers.filter((b) => b.alive).length;
    if (rf > alive) return fail(`Error while executing topic command : Replication factor: ${rf} larger than available brokers: ${alive}.`);
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) return fail(`Error while executing topic command : Topic name "${name}" is illegal, it contains a character other than ASCII alphanumerics, '.', '_' and '-'`);
    return runActions(box, [{ type: "createTopic", name, partitions }], [out(`Created topic ${name}.`)]);
  }

  if (o.flags.has("--alter")) {
    const t = s.topics[name];
    if (!t) return fail(`Error while executing topic command : Topic '${name}' does not exist as expected`);
    const raw = one(o, "--partitions");
    if (raw === undefined) return fail("(in this sandbox, --alter changes --partitions only)");
    const count = Number(raw);
    if (count <= t.partitions.length)
      return fail(`Error while executing topic command : Topic currently has ${t.partitions.length} partitions, which is higher than the requested ${count}.`);
    return runActions(box, [{ type: "addPartitions", topic: name, count }], []);
  }

  return say("(deleting topics is not in this sandbox)", "dim");
}

/** A stable stand-in for Kafka's random topic id. */
function topicId(name: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let h = 2166136261;
  let id = "";
  for (let i = 0; i < 22; i++) {
    h = Math.imul(h ^ (name.charCodeAt(i % name.length) + i), 16777619) >>> 0;
    id += chars[h % 64];
  }
  return id;
}

function runActions(box: KafkaBox, actions: Action[], ok: TermLine[]): Run {
  let b = box;
  const done: ShellAction[] = [];
  for (const a of actions) {
    const r = applyShell(b, a);
    const err = r.events.find((e) => e.type === "error");
    if (err && err.type === "error") return { actions: done, output: lines(`Error while executing command : ${err.message}`, "err"), failed: true };
    done.push(a);
    b = r.box;
  }
  return { actions: done, output: ok };
}

/* -------------------------------------------------------- console producer */

function producer(box: KafkaBox, args: string[], input: string[]): Run {
  const o = parseOpts(args, {
    "--bootstrap-server": true, "--broker-list": true, "--topic": true, "--property": true, "--producer-property": true,
    "--request-required-acks": true, "--compression-codec": true, "--sync": false,
  });
  if (typeof o === "string") return fail(o);
  if (!o.flags.has("--bootstrap-server") && o.flags.has("--broker-list")) o.flags.set("--bootstrap-server", o.flags.get("--broker-list")!);
  const server = needServer(o);
  if (server) return fail(server);
  const topic = one(o, "--topic");
  if (!topic) return fail('Missing required argument "[topic]"');
  if (!box.cluster.topics[topic])
    return fail(`[Producer clientId=console-producer] Error while fetching metadata with correlation id 1 : {${topic}=UNKNOWN_TOPIC_OR_PARTITION}\n(this cluster does not create topics automatically: create it with kafka-topics.sh --create)`);
  const p = props(o);
  const parseKey = p["parse.key"] === "true";
  const sep = p["key.separator"] ?? "\t";
  const actions: Action[] = [];
  for (const [i, line] of input.entries()) {
    if (!parseKey) {
      actions.push({ type: "produce", topic, value: line, key: null, producer: "console-producer" });
      continue;
    }
    const at = line.indexOf(sep);
    if (at === -1) return fail(`org.apache.kafka.common.KafkaException: No key separator found on line number ${i + 1}: '${line}'`);
    actions.push({ type: "produce", topic, value: line.slice(at + sep.length), key: line.slice(0, at), producer: "console-producer" });
  }
  const r = runActions(box, actions, [out(">".repeat(input.length + 1), "dim")]);
  return r;
}

/* -------------------------------------------------------- console consumer */

const pidMember = (pid: number) => `console-consumer-${pid}`;

function consumer(box: KafkaBox, args: string[], background: boolean, command: string): Run {
  const o = parseOpts(args, {
    "--bootstrap-server": true, "--topic": true, "--group": true, "--from-beginning": false, "--max-messages": true,
    "--property": true, "--partition": true, "--offset": true, "--timeout-ms": true, "--consumer-property": true, "--formatter": true,
  });
  if (typeof o === "string") return fail(o);
  const server = needServer(o);
  if (server) return fail(server);
  const topic = one(o, "--topic");
  if (!topic) return fail("Exactly one of include/topic is required.");
  const s = box.cluster;
  const t = s.topics[topic];
  if (!t) return fail(`[Consumer clientId=console-consumer] Error while fetching metadata with correlation id 2 : {${topic}=UNKNOWN_TOPIC_OR_PARTITION}`);
  const p = props(o);
  const fmt = { printKey: p["print.key"] === "true", printPartition: p["print.partition"] === "true", printOffset: p["print.offset"] === "true" };
  const max = one(o, "--max-messages") !== undefined ? Number(one(o, "--max-messages")) : Infinity;
  const group = one(o, "--group");
  const stopsByItself = Number.isFinite(max) || o.flags.has("--timeout-ms");
  // enable.auto.commit=false: the consumer reads but commits nothing, not even when it closes.
  const noCommit = (o.flags.get("--consumer-property") ?? []).some((kv) => kv.replace(/\s/g, "") === "enable.auto.commit=false");

  // Without a group: read straight from the partitions, commit nothing, change nothing.
  if (!group) {
    if (background) return say("(in this sandbox, a background consumer needs --group)", "dim");
    const partition = one(o, "--partition");
    const offset = one(o, "--offset");
    if (offset !== undefined && partition === undefined) return fail("The partition is required when offset is specified.");
    const parts = partition !== undefined ? t.partitions.filter((x) => x.index === Number(partition)) : t.partitions;
    if (!parts.length) return fail(`Partition ${partition} of ${topic} does not exist`);
    const from = (x: (typeof parts)[number]) =>
      offset === "earliest" || (offset === undefined && o.flags.has("--from-beginning"))
        ? x.logStartOffset
        : offset === undefined || offset === "latest"
          ? x.logEndOffset
          : Math.max(Number(offset), x.logStartOffset);
    const records = parts.flatMap((x) => x.records.filter((r) => r.offset >= from(x)).map((r) => ({ partition: x.index, r })));
    const shown = records.slice(0, max);
    const o2 = shown.map(({ partition: pi, r }) => out(format(fmt, pi, r.offset, r.key, r.value)));
    if (!stopsByItself) o2.push(out(waitNote, "dim"));
    o2.push(out(`Processed a total of ${shown.length} messages`));
    return { actions: [], output: o2 };
  }

  if (o.flags.has("--partition")) return fail("Options group and partition cannot be specified together.");
  const g = s.groups[group];
  if (g && !g.topics.includes(topic)) return say(`(in this sandbox, a group reads one topic: ${group} reads ${g.topics.join(", ")})`, "dim");
  const pid = box.nextPid;
  const member = pidMember(pid);
  const join: Action = { type: "joinGroup", group, member, topics: [topic], autoOffsetReset: o.flags.has("--from-beginning") ? "earliest" : "latest" };

  if (background) {
    const job: Job = { id: (box.jobs.at(-1)?.id ?? 0) + 1, pid, command, group, member, topic, processed: 0, ...fmt, ...(noCommit ? { noCommit: true } : {}) };
    const joined = runActions(box, [join], [out(`[${job.id}] ${pid}`)]);
    if (joined.failed) return joined;
    return { actions: [...joined.actions, { type: "$jobs", jobs: [...box.jobs, job], nextPid: pid + 1 }], output: joined.output };
  }

  // In the foreground: join, read until done (or --max-messages), commit, leave.
  const actions: ShellAction[] = [{ type: "$jobs", jobs: box.jobs, nextPid: pid + 1 }, join];
  let b = applyAll(box, actions);
  const err = applyShell(box, join).events.find((e) => e.type === "error");
  if (err && err.type === "error") return fail(err.message);
  const printed: TermLine[] = [];
  let read = 0;
  while (read < max) {
    const poll: Action = { type: "poll", group, member, max: Number.isFinite(max) ? max - read : undefined };
    const r = applyShell(b, poll);
    const delivered = r.events.filter((e) => e.type === "delivered");
    if (!delivered.length) break;
    actions.push(poll);
    b = r.box;
    for (const e of delivered) if (e.type === "delivered") printed.push(deliveredLine(b.cluster, e, fmt));
    read += delivered.length;
    if (!Number.isFinite(max)) break;
  }
  if (!noCommit) actions.push({ type: "commit", group, member });
  actions.push({ type: "leaveGroup", group, member });
  if (!stopsByItself) printed.push(out(waitNote, "dim"));
  printed.push(out(`Processed a total of ${read} messages`));
  return { actions, output: printed };
}

const waitNote = "(a real console consumer keeps waiting for new messages until Ctrl+C; this one stops when it has read everything)";

function format(f: { printKey: boolean; printPartition: boolean; printOffset: boolean }, partition: number, offset: number, key: string | null, value: string) {
  return `${f.printPartition ? `Partition:${partition}\t` : ""}${f.printOffset ? `Offset:${offset}\t` : ""}${f.printKey ? `${key ?? "null"}\t` : ""}${value}`;
}

function deliveredLine(s: ClusterState, e: Extract<SimEvent, { type: "delivered" }>, f: { printKey: boolean; printPartition: boolean; printOffset: boolean }): TermLine {
  const dash = e.tp.lastIndexOf("-");
  const partition = Number(e.tp.slice(dash + 1));
  const rec = s.topics[e.tp.slice(0, dash)]?.partitions[partition]?.records.find((r) => r.offset === e.offset);
  return out(format(f, partition, e.offset, rec?.key ?? null, rec?.value ?? ""));
}

/** Every background consumer reads what is new and commits, as auto-commit would. */
function backgroundTick(box: KafkaBox): Run {
  if (!box.jobs.length) return { actions: [], output: [] };
  let b = box;
  const actions: ShellAction[] = [];
  const printed: TermLine[] = [];
  const jobs = box.jobs.map((j) => ({ ...j }));
  for (const job of jobs) {
    const poll: Action = { type: "poll", group: job.group, member: job.member };
    const r = applyShell(b, poll);
    const delivered = r.events.filter((e) => e.type === "delivered");
    // An empty first poll still fixes where the consumer starts (auto.offset.reset): keep it.
    if (!delivered.length) {
      if (r.events.some((e) => e.type === "positionReset")) {
        actions.push(poll);
        b = r.box;
      }
      continue;
    }
    const commit: Action = { type: "commit", group: job.group, member: job.member };
    if (job.noCommit) {
      actions.push(poll);
      b = r.box;
    } else {
      actions.push(poll, commit);
      b = applyShell(r.box, commit).box;
    }
    for (const e of delivered) if (e.type === "delivered") printed.push(deliveredLine(b.cluster, e, job));
    job.processed += delivered.length;
  }
  if (actions.length) actions.push({ type: "$jobs", jobs, nextPid: box.nextPid });
  return { actions, output: printed };
}

function kill(box: KafkaBox, args: string[]): Run {
  const hard = args.includes("-9") || args.includes("-KILL") || args.includes("-SIGKILL");
  const target = args.find((a) => !a.startsWith("-"));
  if (!target) return fail("kill: usage: kill [-9] pid | %job");
  const job = target.startsWith("%") ? box.jobs.find((j) => j.id === Number(target.slice(1))) : box.jobs.find((j) => j.pid === Number(target));
  if (!job) return fail(`bash: kill: ${target}: no such ${target.startsWith("%") ? "job" : "process"}`);
  const rest = box.jobs.filter((j) => j !== job);
  const leave: Action = hard ? { type: "crashMember", group: job.group, member: job.member } : { type: "leaveGroup", group: job.group, member: job.member };
  const outLines = hard
    ? [out(`[${job.id}]+  Killed                  ${job.command}`)]
    : [out(`Processed a total of ${job.processed} messages`), out(`[${job.id}]+  Terminated              ${job.command}`)];
  return { actions: [leave, { type: "$jobs", jobs: rest, nextPid: box.nextPid }], output: outLines };
}

/* ---------------------------------------------------------- delete records */

/**
 * kafka-delete-records.sh: deletes every record before an offset, as retention would, from a
 * JSON file such as {"partitions":[{"topic":"orders","partition":0,"offset":4}],"version":1}.
 * An offset of -1 means the log end.
 */
function deleteRecords(box: KafkaBox, args: string[]): Run {
  const o = parseOpts(args, { "--bootstrap-server": true, "--offset-json-file": true, "--command-config": true });
  if (typeof o === "string") return fail(o);
  const server = needServer(o);
  if (server) return fail(server);
  const file = one(o, "--offset-json-file");
  if (!file) return fail('Missing required argument "[offset-json-file]"');
  if (!(file in box.files)) return fail(`Exception in thread "main" java.nio.file.NoSuchFileException: ${file}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(box.files[file]!);
  } catch {
    return fail(`Exception in thread "main" kafka.common.AdminCommandFailedException: Offset json file doesn't contain valid JSON data.\n(${file} is not valid JSON)`);
  }
  const list = (parsed as { partitions?: unknown })?.partitions;
  if (!Array.isArray(list) || !list.length) return fail(`Exception in thread "main" kafka.common.AdminCommandFailedException: Offset json file doesn't contain valid JSON data.\n(expected {"partitions":[{"topic":"…","partition":0,"offset":4}],"version":1})`);
  const actions: Action[] = [];
  const done: TermLine[] = [];
  for (const item of list as { topic?: unknown; partition?: unknown; offset?: unknown }[]) {
    const topic = String(item.topic ?? "");
    const partition = Number(item.partition);
    const p = box.cluster.topics[topic]?.partitions[partition];
    if (!p) return fail(`Records delete operation completed:\npartition: ${topic}-${item.partition}\terror: org.apache.kafka.common.errors.UnknownTopicOrPartitionException: This server does not host this topic-partition.`);
    const raw = Number(item.offset);
    if (!Number.isInteger(raw) || raw < -1) return fail(`Records delete operation completed:\npartition: ${topic}-${partition}\terror: org.apache.kafka.common.errors.OffsetOutOfRangeException: The requested offset is not within the range of offsets maintained by the server.`);
    const offset = raw === -1 ? p.logEndOffset : raw;
    if (offset > p.logEndOffset) return fail(`Records delete operation completed:\npartition: ${topic}-${partition}\terror: org.apache.kafka.common.errors.OffsetOutOfRangeException: The requested offset is not within the range of offsets maintained by the server.`);
    actions.push({ type: "deleteRecordsBefore", topic, partition, offset });
    done.push(out(`partition: ${topic}-${partition}\tlow_watermark: ${Math.max(offset, p.logStartOffset)}`));
  }
  return runActions(box, actions, [out("Executing records delete operation"), out("Records delete operation completed:"), ...done]);
}

/* -------------------------------------------------------- consumer groups */

function groups(box: KafkaBox, args: string[]): Run {
  const o = parseOpts(args, {
    "--bootstrap-server": true, "--list": false, "--describe": false, "--group": true, "--reset-offsets": false, "--topic": true,
    "--all-topics": false, "--to-earliest": false, "--to-latest": false, "--to-offset": true, "--shift-by": true, "--to-current": false,
    "--execute": false, "--dry-run": false, "--members": false, "--offsets": false, "--state": false, "--delete": false, "--all-groups": false,
  });
  if (typeof o === "string") return fail(o);
  const server = needServer(o);
  if (server) return fail(server);
  const s = box.cluster;
  if (o.flags.has("--list")) return say(Object.keys(s.groups).sort().join("\n"));
  const id = one(o, "--group");
  if (o.flags.has("--describe")) {
    const ids = o.flags.has("--all-groups") ? Object.keys(s.groups).sort() : id ? [id] : [];
    if (!ids.length) return fail("Option [describe] takes one of these options: [all-groups], [group]");
    const o2: TermLine[] = [];
    for (const gid of ids) {
      const g = s.groups[gid];
      if (!g) return fail(`Error: Consumer group '${gid}' does not exist.`);
      if (o.flags.has("--state")) {
        o2.push(out(""), out(`${"GROUP".padEnd(16)}${"COORDINATOR (ID)".padEnd(24)}${"ASSIGNMENT-STRATEGY".padEnd(21)}${"STATE".padEnd(16)}#MEMBERS`, "hl"));
        o2.push(out(`${gid.padEnd(16)}${"localhost:9092 (1)".padEnd(24)}${(g.members.length ? "range" : "").padEnd(21)}${(g.members.length ? "Stable" : "Empty").padEnd(16)}${g.members.length}`));
        continue;
      }
      if (o.flags.has("--members")) {
        o2.push(out(""), out(`${"GROUP".padEnd(16)}${"CONSUMER-ID".padEnd(34)}${"HOST".padEnd(14)}${"CLIENT-ID".padEnd(22)}#PARTITIONS`, "hl"));
        for (const m of g.members) o2.push(out(`${gid.padEnd(16)}${consumerId(m.id).padEnd(34)}${"/127.0.0.1".padEnd(14)}${m.id.padEnd(22)}${m.assigned.length}`));
        if (!g.members.length) o2.push(out(`Consumer group '${gid}' has no active members.`));
        continue;
      }
      o2.push(...describeGroup(s, g));
    }
    return { actions: [], output: o2 };
  }
  if (o.flags.has("--reset-offsets")) return resetOffsets(box, o, id);
  if (o.flags.has("--delete")) return say("(deleting groups is not in this sandbox)", "dim");
  return fail("Command must include exactly one action: --list, --describe, --delete, --reset-offsets, --delete-offsets");
}

const consumerId = (member: string) => `${member}-${topicId(member).slice(0, 8).toLowerCase()}`;

function describeGroup(s: ClusterState, g: Group): TermLine[] {
  const o: TermLine[] = [out("")];
  if (!g.members.length) o.push(out(`Consumer group '${g.id}' has no active members.`), out(""));
  o.push(
    out(
      `${"GROUP".padEnd(16)}${"TOPIC".padEnd(12)}${"PARTITION".padEnd(11)}${"CURRENT-OFFSET".padEnd(16)}${"LOG-END-OFFSET".padEnd(16)}${"LAG".padEnd(6)}${"CONSUMER-ID".padEnd(34)}${"HOST".padEnd(12)}CLIENT-ID`,
      "hl",
    ),
  );
  for (const name of g.topics) {
    for (const p of s.topics[name]?.partitions ?? []) {
      const key: TP = tp(name, p.index);
      const committed = g.committed[key];
      const owner = g.members.find((m) => m.assigned.includes(key));
      if (committed === undefined && !owner) continue;
      const lag = committed === undefined ? "-" : String(Math.max(0, p.logEndOffset - Math.max(committed, p.logStartOffset)));
      o.push(
        out(
          `${g.id.padEnd(16)}${name.padEnd(12)}${String(p.index).padEnd(11)}${(committed === undefined ? "-" : String(committed)).padEnd(16)}${String(p.logEndOffset).padEnd(16)}${lag.padEnd(6)}${(owner ? consumerId(owner.id) : "-").padEnd(34)}${(owner ? "/127.0.0.1" : "-").padEnd(12)}${owner ? owner.id : "-"}`,
        ),
      );
    }
  }
  return o;
}

function resetOffsets(box: KafkaBox, o: Opts, id: string | undefined): Run {
  const s = box.cluster;
  if (!id) return fail("Option [reset-offsets] takes one of these options: [all-groups], [group]");
  const g = s.groups[id];
  if (!g) return fail(`Error: Consumer group '${id}' does not exist.`);
  const topicArg = one(o, "--topic");
  if (!topicArg && !o.flags.has("--all-topics")) return fail("Option [reset-offsets] takes one of these options: [all-topics], [topic]");
  const [topicName, partList] = topicArg ? topicArg.split(":") : [undefined, undefined];
  const names = topicName ? [topicName] : g.topics;
  for (const n of names) if (!s.topics[n]) return fail(`Error: Topic '${n}' does not exist`);
  const how = ["--to-earliest", "--to-latest", "--to-offset", "--shift-by", "--to-current"].filter((f) => o.flags.has(f));
  if (how.length !== 1) return fail("Option [reset-offsets] takes exactly one of these options: [to-datetime], [by-duration], [to-earliest], [to-latest], [shift-by], [from-file], [to-current], [to-offset]");
  const offsets: Record<TP, number> = {};
  for (const n of names) {
    for (const p of s.topics[n]!.partitions) {
      if (partList && !partList.split(",").map(Number).includes(p.index)) continue;
      const key = tp(n, p.index);
      const current = g.committed[key] ?? p.logEndOffset;
      const target = o.flags.has("--to-earliest")
        ? p.logStartOffset
        : o.flags.has("--to-latest")
          ? p.logEndOffset
          : o.flags.has("--to-offset")
            ? Number(one(o, "--to-offset"))
            : o.flags.has("--shift-by")
              ? current + Number(one(o, "--shift-by"))
              : current;
      offsets[key] = Math.max(p.logStartOffset, Math.min(target, p.logEndOffset));
    }
  }
  const table = [
    out(""),
    out(`${"GROUP".padEnd(31)}${"TOPIC".padEnd(31)}${"PARTITION".padEnd(11)}NEW-OFFSET`, "hl"),
    ...Object.entries(offsets).map(([k, v]) => {
      const dash = k.lastIndexOf("-");
      return out(`${id.padEnd(31)}${k.slice(0, dash).padEnd(31)}${k.slice(dash + 1).padEnd(11)}${v}`);
    }),
  ];
  if (!o.flags.has("--execute")) {
    const warn = o.flags.has("--dry-run") ? [] : [out("WARN: No action will be performed as the --execute option is missing. You should add the --dry-run option explicitly if you are scripting this command and want to keep the current default behavior without prompting.", "dim")];
    return { actions: [], output: [...warn, ...table] };
  }
  if (g.members.length) return fail(`Error: Assignments can only be reset if the group '${id}' is inactive, but the current state is Stable.`);
  return runActions(box, [{ type: "resetOffsets", group: id, offsets }], table);
}

const HELP = `This sandbox understands Kafka's tools (bin/ and .sh are optional):
  kafka-topics.sh            --create, --list, --describe, --alter --partitions
  kafka-console-producer.sh  through a pipe:  echo "key:value" | kafka-console-producer.sh ...
  kafka-console-consumer.sh  --from-beginning, --group, --max-messages, --property print.key=true
                             add & at the end to keep it running in the background
  kafka-consumer-groups.sh   --list, --describe, --reset-offsets ... --execute
  kafka-delete-records.sh    --offset-json-file delete.json  (deletes records before an offset)
Every tool needs --bootstrap-server ${BOOTSTRAP}.
Shell: echo, printf, cat, ls, nano <file>, jobs, kill %1, clear.
Keys: ↑ ↓ for earlier commands, Tab to complete.`;

/* Helpers the other Kafka shells (replication, storage, KRaft) build on. */
export { parseOpts, one, needServer, props, toolName, textOf, spacePipes, topicId };
export type { Opts };
