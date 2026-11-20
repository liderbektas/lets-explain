import { typeLines, type CommandLine, type ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete as completeWord, out, type TermLine } from "@lets-explain/core/lib/terminal";
import { BOOTSTRAP, needServer, one, parseOpts, props, toolName, topicId } from "./cli";
import { partitionForKey } from "./murmur2";
import { applyReplicated, leaderLog, type Acks, type RAction, type REvent, type RState } from "./replication";
import {
  applyFile,
  containerId,
  dockerPs,
  fail,
  fileCommand,
  isFileAction,
  logTime,
  makeRunner,
  noContainer,
  pipeLines,
  say,
  sleepSeconds,
  type Container,
  type FileAction,
  type Run,
} from "./shellKit";

/**
 * A command line on the replication model: a docker-compose dev cluster where broker N runs in
 * container `kafka-N`. Brokers stop and start with docker (`docker stop kafka-2`); a paused
 * container (`docker pause kafka-3`) stops copying, the way a slow disk or network looks to
 * the leader; `sleep 30` lets replica.lag.time.max.ms (30 s) pass. Kafka's own tools describe
 * the topic, change its configs, move partitions, produce with a chosen `acks` and read.
 *
 * Sandbox rules (said in the output where they matter):
 * - The cluster has one topic.
 * - The console producer's `acks` is per run, as in real life: every run sets it (default all).
 * - A producer waiting for acks returns at once here; a real one would block until they come.
 */

export interface RBox {
  state: RState;
  topic: string;
  files: Record<string, string>;
}

export type RShellAction = RAction | FileAction;
export type RResult = ShellResult<RShellAction, RBox>;
type R = Run<RShellAction, RBox>;

export const rBox = (state: RState, topic = "orders", files: Record<string, string> = {}): RBox => ({ state, topic, files });

/* ----------------------------------------------------------------- replay */

export interface RBoxRun {
  boxes: RBox[];
  events: REvent[][];
  /** The engine actions among them, in order. */
  actions: RAction[];
  /** Events of the engine actions only, aligned with `actions`. */
  engineEvents: REvent[][];
}

/** What a replication scenario's check sees: the old mission context, plus the shell around it. */
export interface RCtx {
  start: RState;
  state: RState;
  actions: RAction[];
  events: REvent[][];
  startBox: RBox;
  box: RBox;
}

export function rCtx(startBox: RBox, run: RBoxRun): RCtx {
  const box = run.boxes[run.boxes.length - 1]!;
  return { start: startBox.state, state: box.state, actions: run.actions, events: run.engineEvents, startBox, box };
}

export function applyR(box: RBox, a: RShellAction): { box: RBox; events: REvent[] } {
  if (isFileAction(a)) return { box: applyFile(box, a), events: [] };
  const r = applyReplicated(box.state, a);
  return { box: { ...box, state: r.state }, events: r.events };
}

export function replayR(start: RBox, actions: RShellAction[]): RBoxRun {
  const boxes = [start];
  const events: REvent[][] = [];
  const engine: RAction[] = [];
  const engineEvents: REvent[][] = [];
  let box = start;
  for (const a of actions) {
    const r = applyR(box, a);
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

export const applyAllR = (box: RBox, actions: RShellAction[]) => actions.reduce((b, a) => applyR(b, a).box, box);

/* ------------------------------------------------------------------ shell */

const HOME = "~/kafka-cluster";
const container = (id: number) => `kafka-${id}`;
const brokerOf = (box: RBox, name: string) => {
  const m = /^kafka-(\d+)$/.exec(name);
  return m ? box.state.brokers.find((b) => b.id === Number(m[1])) : undefined;
};
/** The stage has room for four brokers. */
const MAX_BROKERS = 4;

function pipeline(box: RBox, words: string[]): R {
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
    case "kafka-topics":
      return topics(box, args);
    case "kafka-configs":
      return configs(box, args);
    case "kafka-console-producer":
      return say(`(this terminal is one line at a time: send records through a pipe, e.g.\n echo "order:2001" | kafka-console-producer.sh --bootstrap-server ${BOOTSTRAP} --topic ${box.topic})`, "dim");
    case "kafka-console-consumer":
      return consumer(box, args);
    case "kafka-reassign-partitions":
      return reassign(box, args);
    case "kafka-get-offsets":
      return offsets(box, args);
  }
  if (cmd === "docker") return docker(box, args);
  if (cmd === "sleep") {
    const secs = sleepSeconds(args);
    if (secs === null) return fail(`sleep: invalid time interval '${args.join(" ")}'`);
    // replica.lag.time.max.ms is 30 s: after that, followers still behind leave the ISR.
    return secs >= 30 ? { actions: [{ type: "tick" }], output: [] } : { actions: [], output: [] };
  }
  if (cmd === "ls") return say(Object.keys(box.files).sort().concat("docker-compose.yml").sort().join("  "));
  const basic = fileCommand<RShellAction, RBox>(box, cmd, args, { home: `/home/you/kafka-cluster`, help: HELP, extraFiles: (p) => (p === "docker-compose.yml" ? compose(box) : null) });
  if (basic) return basic;
  return fail(`bash: ${cmd}: command not found`);
}

/**
 * A producer still waiting for acks hears back during a later command (a broker stops, 30 s
 * pass): print what it would print then.
 */
function withOutcomes(box: RBox, words: string[]): R {
  const r = pipeline(box, words);
  if (!r.actions.length || words.includes("|")) return r;
  const waiting = box.state.sends.filter((x) => x.status === "pending");
  if (!waiting.length) return r;
  const after = applyAllR(box, r.actions).state;
  const o: TermLine[] = [];
  for (const w of waiting) {
    const now = after.sends.find((x) => x.id === w.id)!;
    if (now.status === "acked") o.push(out(`(the producer waiting on ${w.value} got its ack: offset ${now.offset})`, "dim"));
    if (now.status === "failed") {
      o.push(out(`${logTime(after.time)} ERROR Error when sending message to topic ${box.topic} with key: null, value: ${w.value.length} bytes with error: (org.apache.kafka.clients.producer.internals.ErrorLoggingCallback)`, "err"));
      o.push(
        now.reason === "notEnoughReplicasAfterAppend"
          ? out("org.apache.kafka.common.errors.NotEnoughReplicasAfterAppendException: Messages are written to the log, but to fewer in-sync replicas than required.", "err")
          : out(`org.apache.kafka.common.errors.NotLeaderOrFollowerException: For requests intended only for the leader, this error indicates that the broker is not the current leader.`, "err"),
      );
    }
  }
  return { ...r, output: [...r.output, ...o] };
}

const runLine = makeRunner<RShellAction, RBox>({ pipeline: withOutcomes, apply: applyAllR });

export function promptFor(box: RBox): string {
  void box;
  return `${HOME}$`;
}

const TOOLS = ["kafka-topics.sh", "kafka-configs.sh", "kafka-console-producer.sh", "kafka-console-consumer.sh", "kafka-reassign-partitions.sh", "kafka-get-offsets.sh"];
const FLAGS = [
  "--bootstrap-server", "--topic", "--describe", "--list", "--alter", "--entity-type", "--entity-name", "--add-config", "--delete-config",
  "--producer-property", "--producer.config", "--from-beginning", "--reassignment-json-file", "--execute", "--verify",
  "--under-replicated-partitions", "acks=all", "acks=1", "acks=0", "min.insync.replicas=", "unclean.leader.election.enable=true", "topics",
];

export function completeLine(box: RBox, input: string) {
  const words = input.trimStart().split(/\s+/);
  const candidates =
    words.length <= 1 || /[|&;]\s*\S*$/.test(input)
      ? [...TOOLS, "docker", "sleep", "echo", "printf", "cat", "ls", "nano", "clear", "help"]
      : words[0] === "docker" && words.length === 2
        ? ["ps", "stop", "start", "kill", "restart", "pause", "unpause", "compose"]
        : [...FLAGS, BOOTSTRAP, box.topic, ...box.state.brokers.map((b) => container(b.id)), ...Object.keys(box.files)];
  return completeWord(input, candidates);
}

export const replicationShell: CommandLine<RShellAction, RBox> = { run: runLine, prompt: promptFor, complete: completeLine, title: "bash" };

/* ------------------------------------------------------------------ docker */

function containers(box: RBox): Container[] {
  return box.state.brokers.map((b, i) => ({
    name: container(b.id),
    image: "apache/kafka:3.9.0",
    state: !b.alive ? "exited" : b.slow ? "paused" : "running",
    ports: i === 0 ? "0.0.0.0:9092->9092/tcp" : `9092/tcp`,
  }));
}

function docker(box: RBox, args: string[]): R {
  const [sub = "", ...rest] = args;
  if (sub === "ps") return { actions: [], output: dockerPs(containers(box), rest.includes("-a") || rest.includes("--all")) };
  if (sub === "compose") return compose_(box, rest);
  const names = rest.filter((a) => !a.startsWith("-"));
  if (!["stop", "start", "kill", "restart", "pause", "unpause"].includes(sub)) return fail(`docker: '${sub}' is not a docker command.\nSee 'docker --help'`);
  if (!names.length) return fail(`"docker ${sub}" requires at least 1 argument.`);
  const actions: RShellAction[] = [];
  const output: TermLine[] = [];
  let state = box.state;
  for (const name of names) {
    const b = brokerOf({ ...box, state }, name);
    if (!b) return { actions, output: [...output, out(noContainer(name), "err")], failed: true };
    const step = (a: RAction) => {
      actions.push(a);
      state = applyReplicated(state, a).state;
    };
    switch (sub) {
      case "stop":
      case "kill":
        if (b.alive) step({ type: "crash", broker: b.id });
        output.push(out(name));
        break;
      case "start":
        if (!b.alive) step({ type: "restart", broker: b.id });
        output.push(out(name));
        break;
      case "restart":
        if (b.alive) step({ type: "crash", broker: b.id });
        step({ type: "restart", broker: b.id });
        output.push(out(name));
        break;
      case "pause": {
        if (!b.alive) return { actions, output: [...output, out(`Error response from daemon: Container ${containerIdOf(name)} is not running`, "err")], failed: true };
        if (b.slow) return { actions, output: [...output, out(`Error response from daemon: Container ${containerIdOf(name)} is already paused`, "err")], failed: true };
        const leads = state.partitions.some((p) => p.leader === b.id && p.replicas.length > 1);
        if (leads) {
          output.push(out(name), out(`(${name} leads a partition: pausing a leader is not modelled here, pause a follower)`, "dim"));
          break;
        }
        step({ type: "setSlow", broker: b.id, slow: true });
        output.push(out(name));
        break;
      }
      case "unpause":
        if (!b.slow) return { actions, output: [...output, out(`Error response from daemon: Container ${containerIdOf(name)} is not paused`, "err")], failed: true };
        step({ type: "setSlow", broker: b.id, slow: false });
        output.push(out(name));
        break;
    }
  }
  return { actions, output };
}

const containerIdOf = (name: string) => containerId(name);

/** `docker compose up -d kafka-4` starts the next broker; the rest of compose maps to docker. */
function compose_(box: RBox, args: string[]): R {
  const [sub = "", ...rest] = args;
  const names = rest.filter((a) => !a.startsWith("-"));
  if (sub === "ps") return { actions: [], output: dockerPs(containers(box), true) };
  if (sub === "stop" || sub === "start" || sub === "restart" || sub === "pause" || sub === "unpause" || sub === "kill") {
    const r = docker(box, [sub, ...names]);
    return r.failed ? r : { ...r, output: names.map((n) => out(` ✔ Container ${n}  ${sub === "stop" ? "Stopped" : sub === "kill" ? "Killed" : sub === "pause" ? "Paused" : sub === "unpause" ? "Unpaused" : "Started"}`)) };
  }
  if (sub === "up") {
    const actions: RShellAction[] = [];
    const output: TermLine[] = [];
    let state = box.state;
    for (const name of names) {
      const b = brokerOf({ ...box, state }, name);
      if (b) {
        if (!b.alive) {
          actions.push({ type: "restart", broker: b.id });
          state = applyReplicated(state, { type: "restart", broker: b.id }).state;
        }
        output.push(out(` ✔ Container ${name}  ${b.alive ? "Running" : "Started"}`));
        continue;
      }
      const next = Math.max(0, ...state.brokers.map((x) => x.id)) + 1;
      if (name !== container(next)) return fail(`no such service: ${name}`);
      if (state.brokers.length >= MAX_BROKERS) return fail(`(the stage has room for ${MAX_BROKERS} brokers)`);
      actions.push({ type: "addBroker" });
      state = applyReplicated(state, { type: "addBroker" }).state;
      output.push(out(` ✔ Container ${name}  Started`));
    }
    if (!names.length) return say("(name the broker to start, e.g. docker compose up -d kafka-2)", "dim");
    return { actions, output };
  }
  return fail(`unknown docker command: "compose ${sub}"`);
}

/** The project's docker-compose.yml, as `cat` shows it (abridged). */
function compose(box: RBox): string {
  const ids = [...box.state.brokers.map((b) => b.id)];
  const next = Math.max(...ids) + 1;
  const all = next <= MAX_BROKERS ? [...ids, next] : ids;
  return [
    "services:",
    ...all.flatMap((id) => [
      `  kafka-${id}:`,
      "    image: apache/kafka:3.9.0",
      `    environment:`,
      `      KAFKA_NODE_ID: ${id}`,
      `      KAFKA_PROCESS_ROLES: broker`,
      `      KAFKA_REPLICA_LAG_TIME_MAX_MS: 30000`,
      ...(id === next ? ["    # not started yet: docker compose up -d kafka-" + id] : []),
    ]),
    "  # controllers (KRaft) left out here",
  ].join("\n");
}

/* ------------------------------------------------------------ kafka-topics */

function configsLine(s: RState): string {
  const c: string[] = [];
  if (s.config.minIsr !== 1) c.push(`min.insync.replicas=${s.config.minIsr}`);
  if (s.config.unclean) c.push("unclean.leader.election.enable=true");
  return c.join(",");
}

function noBroker(box: RBox): string | null {
  return box.state.brokers.some((b) => b.alive) ? null : `[AdminClient clientId=adminclient-1] Connection to node -1 (${BOOTSTRAP}) could not be established. Node may not be available.`;
}

function topics(box: RBox, args: string[]): R {
  const o = parseOpts(args, {
    "--bootstrap-server": true, "--describe": false, "--list": false, "--create": false, "--alter": false, "--delete": false, "--topic": true,
    "--under-replicated-partitions": false, "--unavailable-partitions": false, "--partitions": true, "--replication-factor": true,
  });
  if (typeof o === "string") return fail(o);
  const server = needServer(o) ?? noBroker(box);
  if (server) return fail(server);
  const s = box.state;
  const name = one(o, "--topic");
  if (o.flags.has("--list")) return say(box.topic);
  if (o.flags.has("--create")) {
    if (name === box.topic) return fail(`Error while executing topic command : Topic '${name}' already exists.`);
    return say("(this sandbox has one topic; use it)", "dim");
  }
  if (o.flags.has("--alter") || o.flags.has("--delete")) return say("(in this lesson the topic stays as it is: move partitions with kafka-reassign-partitions.sh)", "dim");
  if (!o.flags.has("--describe")) return fail("Command must include exactly one action: --list, --describe, --create, --alter or --delete");
  if (name && name !== box.topic) return fail(`Error while executing topic command : Topic '${name}' does not exist as expected`);
  let parts = s.partitions;
  if (o.flags.has("--under-replicated-partitions")) parts = parts.filter((p) => p.leader !== null && p.isr.length < p.replicas.length);
  if (o.flags.has("--unavailable-partitions")) parts = parts.filter((p) => p.leader === null);
  const filtered = o.flags.has("--under-replicated-partitions") || o.flags.has("--unavailable-partitions");
  const rows: TermLine[] = [];
  if (!filtered) rows.push(out(`Topic: ${box.topic}\tTopicId: ${topicId(box.topic)}\tPartitionCount: ${s.partitions.length}\tReplicationFactor: ${s.partitions[0]?.replicas.length ?? 1}\tConfigs: ${configsLine(s)}`, "hl"));
  for (const p of parts) {
    rows.push(out(`\tTopic: ${box.topic}\tPartition: ${p.index}\tLeader: ${p.leader ?? "none"}\tReplicas: ${p.replicas.join(",")}\tIsr: ${p.isr.join(",")}`, p.leader === null ? "err" : p.isr.length < p.replicas.length ? "del" : "out"));
  }
  return { actions: [], output: rows };
}

/* ------------------------------------------------------------ kafka-configs */

function configs(box: RBox, args: string[]): R {
  const o = parseOpts(args, {
    "--bootstrap-server": true, "--alter": false, "--describe": false, "--entity-type": true, "--entity-name": true, "--topic": true,
    "--add-config": true, "--delete-config": true, "--all": false,
  });
  if (typeof o === "string") return fail(o);
  const server = needServer(o) ?? noBroker(box);
  if (server) return fail(server);
  const type = one(o, "--entity-type") ?? (o.flags.has("--topic") ? "topics" : undefined);
  const name = one(o, "--entity-name") ?? one(o, "--topic");
  if (!type) return fail("an entity-type must be specified with --alter or --describe");
  if (type === "brokers") return say("(in this lesson the settings live on the topic: --entity-type topics)", "dim");
  if (type !== "topics") return fail(`--entity-type must include only valid entity types: topics, clients, users, brokers, broker-loggers, ips`);
  if (!name) return fail("an entity name must be specified with --alter of topics");
  if (name !== box.topic) return fail(`Error while executing config command with args '${args.join(" ")}'\njava.util.concurrent.ExecutionException: org.apache.kafka.common.errors.UnknownTopicOrPartitionException: The topic '${name}' does not exist.`);
  const s = box.state;

  if (o.flags.has("--describe")) {
    const c = configsLine(s);
    return {
      actions: [],
      output: [
        out(`Dynamic configs for topic ${name} are:`),
        ...(c
          ? c.split(",").map((kv) => out(`  ${kv} sensitive=false synonyms={DYNAMIC_TOPIC_CONFIG:${kv}, DEFAULT_CONFIG:${kv.startsWith("min") ? "min.insync.replicas=1" : "unclean.leader.election.enable=false"}}`))
          : []),
      ],
    };
  }
  if (!o.flags.has("--alter")) return fail("Command must include exactly one action: --describe, --alter");

  const actions: RAction[] = [];
  const add = one(o, "--add-config");
  const del = one(o, "--delete-config");
  if (!add && !del) return fail("At least one of --add-config or --delete-config must be specified with --alter");
  const pairs = (add ?? "").split(",").filter(Boolean).map((kv) => kv.split("=") as [string, string | undefined]);
  for (const [k, v] of pairs) {
    if (v === undefined) return fail(`requirement failed: Invalid entity config: all configs to be added must be in the format "key=val".`);
    if (k === "min.insync.replicas") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) return fail(`Error while executing config command with args '${args.join(" ")}'\norg.apache.kafka.common.errors.InvalidConfigurationException: Invalid value ${v} for configuration min.insync.replicas: Value must be at least 1`);
      if (n !== s.config.minIsr) actions.push({ type: "setMinIsr", value: n });
    } else if (k === "unclean.leader.election.enable") {
      if (v !== "true" && v !== "false") return fail(`Error while executing config command with args '${args.join(" ")}'\norg.apache.kafka.common.errors.InvalidConfigurationException: Invalid value ${v} for configuration unclean.leader.election.enable: Expected value to be either true or false`);
      if ((v === "true") !== s.config.unclean) actions.push({ type: "setUnclean", value: v === "true" });
    } else if (["retention.ms", "retention.bytes", "segment.bytes", "cleanup.policy"].includes(k)) {
      return say(`(${k} is about storage, which this lesson leaves out)`, "dim");
    } else {
      return fail(`Error while executing config command with args '${args.join(" ")}'\norg.apache.kafka.common.errors.InvalidConfigurationException: Unknown topic config name: ${k}`);
    }
  }
  for (const k of (del ?? "").split(",").filter(Boolean)) {
    if (k === "min.insync.replicas" && s.config.minIsr !== 1) actions.push({ type: "setMinIsr", value: 1 });
    else if (k === "unclean.leader.election.enable" && s.config.unclean) actions.push({ type: "setUnclean", value: false });
    else if (k !== "min.insync.replicas" && k !== "unclean.leader.election.enable") return fail(`Error while executing config command with args '${args.join(" ")}'\norg.apache.kafka.common.errors.InvalidConfigurationException: Unknown topic config name: ${k}`);
  }
  return { actions, output: [out(`Completed updating config for topic ${name}.`)] };
}

/* ----------------------------------------------------------------- producer */

function acksOf(raw: string | undefined): Acks | null {
  if (raw === undefined) return null;
  if (raw === "all" || raw === "-1") return "all";
  if (raw === "1") return 1;
  if (raw === "0") return 0;
  return null;
}

function producer(box: RBox, args: string[], input: string[]): R {
  const o = parseOpts(args, {
    "--bootstrap-server": true, "--topic": true, "--property": true, "--producer-property": true, "--producer.config": true,
    "--request-required-acks": true, "--sync": false, "--reader-property": true,
  });
  if (typeof o === "string") return fail(o);
  const server = needServer(o);
  if (server) return fail(server);
  const topic = one(o, "--topic");
  if (!topic) return fail('Missing required argument "[topic]"');
  if (!box.state.brokers.some((b) => b.alive)) return fail(`${logTime(box.state.time)} WARN [Producer clientId=console-producer] Connection to node -1 (${BOOTSTRAP}) could not be established. Node may not be available.`);
  if (topic !== box.topic)
    return fail(`${logTime(box.state.time)} WARN [Producer clientId=console-producer] Error while fetching metadata with correlation id 1 : {${topic}=UNKNOWN_TOPIC_OR_PARTITION}`);

  // acks: --producer-property wins over --producer.config, which wins over --request-required-acks; the default is all.
  let acks: Acks = "all";
  const fromOpt = acksOf(one(o, "--request-required-acks"));
  if (one(o, "--request-required-acks") !== undefined && fromOpt === null) return fail(`Invalid value ${one(o, "--request-required-acks")} for configuration acks: String must be one of: all, -1, 0, 1`);
  if (fromOpt !== null) acks = fromOpt;
  const file = one(o, "--producer.config");
  if (file !== undefined) {
    if (!(file in box.files)) return fail(`Exception in thread "main" java.nio.file.NoSuchFileException: ${file}`);
    const line = box.files[file]!.split("\n").map((l) => l.trim()).find((l) => /^acks\s*=/.test(l));
    if (line) {
      const v = line.split("=")[1]!.trim();
      const a = acksOf(v);
      if (a === null) return fail(`Exception in thread "main" org.apache.kafka.common.config.ConfigException: Invalid value ${v} for configuration acks: String must be one of: all, -1, 0, 1`);
      acks = a;
    }
  }
  for (const kv of o.flags.get("--producer-property") ?? []) {
    const [k, v] = kv.split("=");
    if (k === "acks") {
      const a = acksOf(v);
      if (a === null) return fail(`Exception in thread "main" org.apache.kafka.common.config.ConfigException: Invalid value ${v} for configuration acks: String must be one of: all, -1, 0, 1`);
      acks = a;
    }
  }

  const p = props(o);
  const parseKey = p["parse.key"] === "true";
  const sep = p["key.separator"] ?? "\t";
  const actions: RAction[] = [];
  let state = box.state;
  if (state.config.acks !== acks) {
    actions.push({ type: "setAcks", acks });
    state = applyReplicated(state, { type: "setAcks", acks }).state;
  }
  const output: TermLine[] = [];
  for (const line of input) {
    let key: string | null = null;
    let value = line;
    if (parseKey) {
      const i = line.indexOf(sep);
      if (i === -1) return { actions, output: [...output, out(`org.apache.kafka.common.KafkaException: No key separator found on line number 1: '${line}'`, "err")], failed: true };
      key = line.slice(0, i);
      value = line.slice(i + sep.length);
    }
    const partition = key === null ? undefined : partitionForKey(key, state.partitions.length);
    const a: RAction = { type: "produce", value, partition };
    const r = applyReplicated(state, a);
    actions.push(a);
    state = r.state;
    output.push(...produceErrors(r.events, state, key, value, box.topic));
  }
  const waiting = state.sends.filter((x) => x.status === "pending").length - box.state.sends.filter((x) => x.status === "pending").length;
  if (waiting > 0) output.push(out(`(the producer is still waiting for the in-sync replicas to copy ${waiting === 1 ? "it" : "them"}: a real one would block here)`, "dim"));
  return { actions, output };
}

function produceErrors(events: REvent[], s: RState, key: string | null, value: string, topic: string): TermLine[] {
  const o: TermLine[] = [];
  const head = (bytes: number) =>
    out(`${logTime(s.time)} ERROR Error when sending message to topic ${topic} with key: ${key === null ? "null" : `${key.length} bytes`}, value: ${bytes} bytes with error: (org.apache.kafka.clients.producer.internals.ErrorLoggingCallback)`, "err");
  for (const e of events) {
    if (e.type !== "rejected") continue;
    if (s.config.acks === 0) continue; // fire and forget: the producer never hears about it
    o.push(head(value.length));
    o.push(
      e.reason === "notEnoughReplicas"
        ? out("org.apache.kafka.common.errors.NotEnoughReplicasException: Messages are rejected since there are fewer in-sync replicas than required.", "err")
        : out(`org.apache.kafka.common.errors.TimeoutException: Expiration of 1 record(s) for ${topic}-${e.partition}:120000 ms has passed since batch creation`, "err"),
    );
  }
  return o;
}

/* ----------------------------------------------------------------- consumer */

function consumer(box: RBox, args: string[]): R {
  const o = parseOpts(args, {
    "--bootstrap-server": true, "--topic": true, "--from-beginning": false, "--partition": true, "--max-messages": true, "--property": true, "--group": true, "--timeout-ms": true,
  });
  if (typeof o === "string") return fail(o);
  const server = needServer(o) ?? noBroker(box);
  if (server) return fail(server);
  const topic = one(o, "--topic");
  if (!topic) return fail("Exactly one of whitelist/topic is required.");
  if (topic !== box.topic) return fail(`${logTime(box.state.time)} WARN [Consumer clientId=console-consumer] Error while fetching metadata with correlation id 2 : {${topic}=UNKNOWN_TOPIC_OR_PARTITION}`);
  if (!o.flags.has("--from-beginning")) return { actions: [], output: [out("Processed a total of 0 messages"), out("(without --from-beginning a new consumer starts at the end and waits for new records; add --from-beginning to read what is there)", "dim")] };
  const only = one(o, "--partition");
  const max = one(o, "--max-messages");
  const p = props(o);
  const output: TermLine[] = [];
  let n = 0;
  for (const part of box.state.partitions) {
    if (only !== undefined && part.index !== Number(only)) continue;
    if (part.leader === null) {
      output.push(out(`${logTime(box.state.time)} WARN [Consumer clientId=console-consumer] ${topic}-${part.index}: LEADER_NOT_AVAILABLE`, "err"));
      continue;
    }
    // Consumers read only up to the high watermark: what every in-sync copy has.
    for (const r of leaderLog(part).slice(0, part.hw)) {
      if (max !== undefined && n >= Number(max)) break;
      const prefix = `${p["print.partition"] === "true" ? `Partition:${part.index}\t` : ""}${p["print.offset"] === "true" ? `Offset:${r.offset}\t` : ""}`;
      output.push(out(prefix + r.value));
      n++;
    }
  }
  output.push(out(`Processed a total of ${n} messages`));
  return { actions: [], output };
}

/* ------------------------------------------------------ reassign / offsets */

function reassign(box: RBox, args: string[]): R {
  const o = parseOpts(args, {
    "--bootstrap-server": true, "--reassignment-json-file": true, "--execute": false, "--verify": false, "--generate": false, "--topics-to-move-json-file": true, "--broker-list": true,
  });
  if (typeof o === "string") return fail(o);
  const server = needServer(o) ?? noBroker(box);
  if (server) return fail(server);
  if (o.flags.has("--generate")) return say("(write the plan yourself: nano move.json, then --execute)", "dim");
  const file = one(o, "--reassignment-json-file");
  if (!file) return fail("Missing required argument \"[reassignment-json-file]\"");
  if (!(file in box.files)) return fail(`Exception in thread "main" java.nio.file.NoSuchFileException: ${file}`);
  let plan: { partitions?: { topic?: string; partition?: number; replicas?: number[] }[] };
  try {
    plan = JSON.parse(box.files[file]!);
  } catch {
    return fail(`Error: ${file} is not valid JSON.\nExample: {"version":1,"partitions":[{"topic":"${box.topic}","partition":0,"replicas":[3]}]}`);
  }
  const items = plan.partitions ?? [];
  if (!items.length) return fail("Error: Partition reassignment list cannot be empty");
  const s = box.state;
  for (const it of items) {
    if (it.topic !== box.topic || typeof it.partition !== "number" || !s.partitions[it.partition])
      return fail(`Error: org.apache.kafka.common.errors.UnknownTopicOrPartitionException: Topic ${it.topic}-${it.partition} not found.`);
    if (!Array.isArray(it.replicas) || !it.replicas.length) return fail(`Error: Partition ${it.topic}-${it.partition} has no replicas in the plan.`);
    const unknown = it.replicas.filter((r) => !s.brokers.some((b) => b.id === r));
    if (unknown.length) return fail(`Error: org.apache.kafka.common.errors.InvalidReplicaAssignmentException: Unknown broker id(s) ${unknown.join(", ")}.`);
  }
  if (o.flags.has("--verify")) {
    return {
      actions: [],
      output: [
        out("Status of partition reassignment:"),
        ...items.map((it) => {
          const done = s.partitions[it.partition!]!.replicas.join() === it.replicas!.join();
          return out(done ? `Reassignment of partition ${box.topic}-${it.partition} is completed.` : `Reassignment of partition ${box.topic}-${it.partition} is not in progress.`);
        }),
      ],
    };
  }
  if (!o.flags.has("--execute")) return fail("Command must include exactly one action: --generate, --execute, --verify, --cancel or --list");
  const current = { version: 1, partitions: items.map((it) => ({ topic: box.topic, partition: it.partition, replicas: s.partitions[it.partition!]!.replicas, log_dirs: s.partitions[it.partition!]!.replicas.map(() => "any") })) };
  const actions: RAction[] = [];
  const output: TermLine[] = [out("Current partition replica assignment"), out(""), out(JSON.stringify(current)), out(""), out("Save this to use as the --reassignment-json-file option during rollback")];
  let state = s;
  for (const it of items) {
    const a: RAction = { type: "reassign", partition: it.partition!, replicas: it.replicas! };
    const r = applyReplicated(state, a);
    const err = r.events.find((e) => e.type === "error");
    if (err && err.type === "error") {
      const why = err.message.includes("offline")
        ? `org.apache.kafka.common.errors.LeaderNotAvailableException: ${box.topic}-${it.partition} has no leader to copy from.`
        : err.message.includes("down")
          ? `org.apache.kafka.common.errors.ReplicaNotAvailableException: A target broker for ${box.topic}-${it.partition} is not available.`
          : err.message;
      return { actions, output: [...output, out(`Error reassigning partition(s):\n${box.topic}-${it.partition}: ${why}`, "err")], failed: true };
    }
    if (r.state.partitions[it.partition!]!.replicas.join() !== s.partitions[it.partition!]!.replicas.join()) actions.push(a);
    state = r.state;
  }
  output.push(out(`Successfully started partition reassignment${items.length > 1 ? "s" : ""} for ${items.map((it) => `${box.topic}-${it.partition}`).join(",")}`));
  return { actions, output };
}

function offsets(box: RBox, args: string[]): R {
  const o = parseOpts(args, { "--bootstrap-server": true, "--topic": true, "--time": true, "--partitions": true });
  if (typeof o === "string") return fail(o);
  const server = needServer(o) ?? noBroker(box);
  if (server) return fail(server);
  const topic = one(o, "--topic") ?? box.topic;
  if (topic !== box.topic) return say("");
  const time = one(o, "--time") ?? "-1";
  return say(box.state.partitions.map((p) => `${topic}:${p.index}:${time === "-2" || time === "earliest" ? 0 : p.hw}`).join("\n"));
}

const HELP = `This sandbox is a docker-compose dev cluster: broker N runs in container kafka-N.
  docker ps                         the containers and their state
  docker stop kafka-2 / start       stop or start a broker
  docker pause kafka-3 / unpause    freeze a broker: it stops copying (a slow disk, a bad network)
  sleep 30                          let replica.lag.time.max.ms (30 s) pass
  kafka-topics.sh --describe        Leader, Replicas and Isr of every partition
  kafka-configs.sh --alter --entity-type topics --entity-name orders --add-config min.insync.replicas=2
  echo "order:1" | kafka-console-producer.sh --topic orders --producer-property acks=all
  kafka-console-consumer.sh --topic orders --from-beginning
  kafka-reassign-partitions.sh --reassignment-json-file move.json --execute
Every Kafka tool also needs --bootstrap-server ${BOOTSTRAP}. Files: cat, ls, echo > file, nano, rm.
Keys: ↑ ↓ for earlier commands, Tab to complete.`;


/** Types lines into a scenario the way a reader would; for tests. */
export function playR(start: RBox, typed: string[], edits: ((text: string) => string)[] = []) {
  const r = typeLines(replicationShell, applyAllR, start, typed, edits);
  return { ctx: rCtx(start, replayR(start, r.actions)), moves: r.moves, output: r.output };
}
