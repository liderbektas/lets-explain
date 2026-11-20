import { typeLines, type CommandLine, type ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete as completeWord, out, type TermLine } from "@lets-explain/core/lib/terminal";
import { BOOTSTRAP, needServer, one, parseOpts, toolName, topicId } from "../../engine/cli";
import {
  applyFile,

  dockerPs,
  fail,
  fileCommand,
  isFileAction,
  makeRunner,
  noContainer,
  say,
  type Container,
  type FileAction,
  type Run,
} from "../../engine/shellKit";
import { applyKraft, type KAction, type KEvent, type KState } from "./model";

/**
 * A command line on the KRaft model: a docker-compose cluster with three controllers
 * (`controller-1..3`, node ids 1–3) and three brokers (`kafka-1..3`). Containers stop and start
 * with docker; kafka-metadata-quorum.sh shows the Raft quorum; kafka-topics.sh creates topics
 * (which needs an active controller) and shows partition leaders as the brokers know them.
 */

export interface KBox {
  state: KState;
  files: Record<string, string>;
}

export type KShellAction = KAction | FileAction;
export type KResult = ShellResult<KShellAction, KBox>;
type R = Run<KShellAction, KBox>;

export const kBox = (state: KState): KBox => ({ state, files: {} });

export interface KBoxRun {
  boxes: KBox[];
  events: KEvent[][];
  actions: KAction[];
  engineEvents: KEvent[][];
}

/** What a KRaft scenario's check sees: the old mission context, plus the shell around it. */
export interface KCtx {
  start: KState;
  state: KState;
  actions: KAction[];
  events: KEvent[][];
  startBox: KBox;
  box: KBox;
}

export function kCtx(startBox: KBox, run: KBoxRun): KCtx {
  const box = run.boxes[run.boxes.length - 1]!;
  return { start: startBox.state, state: box.state, actions: run.actions, events: run.engineEvents, startBox, box };
}

export function applyK(box: KBox, a: KShellAction): { box: KBox; events: KEvent[] } {
  if (isFileAction(a)) return { box: applyFile(box, a), events: [] };
  const r = applyKraft(box.state, a);
  return { box: { ...box, state: r.state }, events: r.events };
}

export function replayK(start: KBox, actions: KShellAction[]): KBoxRun {
  const boxes = [start];
  const events: KEvent[][] = [];
  const engine: KAction[] = [];
  const engineEvents: KEvent[][] = [];
  let box = start;
  for (const a of actions) {
    const r = applyK(box, a);
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

export const applyAllK = (box: KBox, actions: KShellAction[]) => actions.reduce((b, a) => applyK(b, a).box, box);

/* ------------------------------------------------------------------ shell */

function pipeline(box: KBox, words: string[]): R {
  if (words.includes("|")) return fail("(pipes are not needed in this lesson)");
  const [cmd = "", ...args] = words;
  switch (toolName(cmd)) {
    case "kafka-metadata-quorum":
      return quorum(box, args);
    case "kafka-topics":
      return topics(box, args);
  }
  if (cmd === "docker") return docker(box, args);
  if (cmd === "ls") return say(["docker-compose.yml", ...Object.keys(box.files)].sort().join("  "));
  const basic = fileCommand<KShellAction, KBox>(box, cmd, args, { home: "/home/you/kafka-cluster", help: HELP, extraFiles: (p) => (p === "docker-compose.yml" ? COMPOSE : null) });
  if (basic) return basic;
  return fail(`bash: ${cmd}: command not found`);
}

const runLine = makeRunner<KShellAction, KBox>({ pipeline, apply: applyAllK });

export const promptFor = (box: KBox) => {
  void box;
  return "~/kafka-cluster$";
};

export function completeLine(box: KBox, input: string) {
  const words = input.trimStart().split(/\s+/);
  const candidates =
    words.length <= 1
      ? ["kafka-metadata-quorum.sh", "kafka-topics.sh", "docker", "cat", "ls", "clear", "help"]
      : words[0] === "docker" && words.length === 2
        ? ["ps", "stop", "start", "kill", "restart"]
        : [
            "--bootstrap-server", BOOTSTRAP, "describe", "--status", "--replication", "--create", "--describe", "--list", "--topic", "--partitions",
            ...box.state.controllers.map((c) => `controller-${c.id}`), ...box.state.brokers.map((b) => `kafka-${b.id}`), ...box.state.topics,
          ];
  return completeWord(input, candidates);
}

export const kraftShell: CommandLine<KShellAction, KBox> = { run: runLine, prompt: promptFor, complete: completeLine, title: "bash" };

/* ------------------------------------------------------------------ docker */

function containers(s: KState): Container[] {
  return [
    ...s.controllers.map((c) => ({ name: `controller-${c.id}`, image: "apache/kafka:3.9.0", state: c.alive ? ("running" as const) : ("exited" as const), ports: "9093/tcp" })),
    ...s.brokers.map((b, i) => ({ name: `kafka-${b.id}`, image: "apache/kafka:3.9.0", state: b.alive ? ("running" as const) : ("exited" as const), ports: i === 0 ? "0.0.0.0:9092->9092/tcp" : "9092/tcp" })),
  ];
}

function docker(box: KBox, args: string[]): R {
  const [sub = "", ...rest] = args;
  if (sub === "ps") return { actions: [], output: dockerPs(containers(box.state), rest.includes("-a") || rest.includes("--all")) };
  if (sub === "pause" || sub === "unpause") return say("(pausing is not part of this lesson: stop and start containers)", "dim");
  if (!["stop", "start", "kill", "restart"].includes(sub)) return fail(`docker: '${sub}' is not a docker command.\nSee 'docker --help'`);
  const names = rest.filter((a) => !a.startsWith("-"));
  if (!names.length) return fail(`"docker ${sub}" requires at least 1 argument.`);
  const actions: KAction[] = [];
  const output: TermLine[] = [];
  let s = box.state;
  const step = (a: KAction) => {
    actions.push(a);
    s = applyKraft(s, a).state;
  };
  for (const name of names) {
    const c = /^controller-(\d+)$/.exec(name);
    const b = /^kafka-(\d+)$/.exec(name);
    const ctrl = c ? s.controllers.find((x) => x.id === Number(c[1])) : undefined;
    const brk = b ? s.brokers.find((x) => x.id === Number(b[1])) : undefined;
    if (!ctrl && !brk) return { actions, output: [...output, out(noContainer(name), "err")], failed: true };
    const alive = ctrl ? ctrl.alive : brk!.alive;
    const down: KAction = ctrl ? { type: "crashController", id: ctrl.id } : { type: "crashBroker", id: brk!.id };
    const up: KAction = ctrl ? { type: "restartController", id: ctrl.id } : { type: "restartBroker", id: brk!.id };
    if ((sub === "stop" || sub === "kill") && alive) step(down);
    if (sub === "start" && !alive) step(up);
    if (sub === "restart") {
      if (alive) step(down);
      step(up);
    }
    output.push(out(name));
  }
  return { actions, output };
}

const COMPOSE = `services:
  controller-1:   # KAFKA_NODE_ID: 1, KAFKA_PROCESS_ROLES: controller
  controller-2:   # KAFKA_NODE_ID: 2
  controller-3:   # KAFKA_NODE_ID: 3
    # KAFKA_CONTROLLER_QUORUM_VOTERS: 1@controller-1:9093,2@controller-2:9093,3@controller-3:9093
  kafka-1:        # KAFKA_PROCESS_ROLES: broker
  kafka-2:
  kafka-3:`;

/* --------------------------------------------------------- metadata quorum */

const noBroker = (s: KState) =>
  s.brokers.some((b) => b.alive) ? null : `[AdminClient clientId=adminclient-1] Connection to node -1 (${BOOTSTRAP}) could not be established. Node may not be available.`;

function quorum(box: KBox, args: string[]): R {
  const o = parseOpts(args, { "--bootstrap-server": true, "--bootstrap-controller": true, "--status": false, "--replication": false, "--human-readable": false });
  if (typeof o === "string") return fail(o);
  if (!o.flags.has("--bootstrap-controller")) {
    const server = needServer(o) ?? noBroker(box.state);
    if (server) return fail(server);
  }
  if (o.rest[0] !== "describe") return fail("usage: kafka-metadata-quorum [-h] --bootstrap-server ... {describe} ...");
  const s = box.state;
  if (s.active === null)
    return fail("Error while executing describe: org.apache.kafka.common.errors.TimeoutException: Timed out waiting for a node assignment. Call: describeMetadataQuorum\n(no controller is active: there is no majority to elect one)");
  const leader = s.controllers.find((c) => c.id === s.active)!;
  if (o.flags.has("--replication")) {
    const rows = s.controllers.map((c) => {
      const lag = leader.log.length - c.log.length;
      return `${String(c.id).padEnd(8)}${String(c.log.length).padEnd(14)}${String(lag).padEnd(6)}${c.id === s.active ? "Leader" : c.alive ? "Follower" : "Follower (down)"}`;
    });
    return { actions: [], output: [out("NodeId  LogEndOffset  Lag   Status", "hl"), ...rows.map((r) => out(r))] };
  }
  if (!o.flags.has("--status")) return fail("One of --status or --replication must be specified with describe");
  const lag = Math.max(...s.controllers.map((c) => leader.log.length - c.log.length));
  return {
    actions: [],
    output: [
      `ClusterId:              ${topicId("cluster").slice(0, 22)}`,
      `LeaderId:               ${s.active}`,
      `LeaderEpoch:            ${s.epoch}`,
      `HighWatermark:          ${s.committed}`,
      `MaxFollowerLag:         ${lag}`,
      `MaxFollowerLagTimeMs:   ${lag > 0 ? 18000 : 0}`,
      `CurrentVoters:          [${s.controllers.map((c) => c.id).join(",")}]`,
    ].map((t) => out(t)),
  };
}

/* ------------------------------------------------------------ kafka-topics */

function topics(box: KBox, args: string[]): R {
  const o = parseOpts(args, {
    "--bootstrap-server": true, "--create": false, "--describe": false, "--list": false, "--alter": false, "--delete": false, "--topic": true,
    "--partitions": true, "--replication-factor": true, "--if-not-exists": false,
  });
  if (typeof o === "string") return fail(o);
  const s = box.state;
  const server = needServer(o) ?? noBroker(s);
  if (server) return fail(server);
  const name = one(o, "--topic");
  if (o.flags.has("--list")) return say(s.topics.join("\n"));
  if (o.flags.has("--create")) {
    if (!name) return fail('Missing required argument "[topic]"');
    if (s.topics.includes(name)) return o.flags.has("--if-not-exists") ? say("") : fail(`Error while executing topic command : Topic '${name}' already exists.`);
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) return fail(`Error while executing topic command : Topic name "${name}" is illegal, it contains a character other than ASCII alphanumerics, '.', '_' and '-'`);
    const a: KAction = { type: "createTopic", name };
    const r = applyKraft(s, a);
    if (r.events.some((e) => e.type === "rejected"))
      return { actions: [a], output: [out("Error while executing topic command : Timed out waiting for a node assignment. Call: createTopics", "err"), out("(no active controller: nobody can write the new topic into the metadata log)", "dim")], failed: true };
    return { actions: [a], output: [out(`Created topic ${name}.`)] };
  }
  if (o.flags.has("--describe")) {
    const target = name ?? "orders";
    if (!s.topics.includes(target)) return fail(`Error while executing topic command : Topic '${target}' does not exist as expected`);
    if (target !== "orders") return say(`Topic: ${target}\tTopicId: ${topicId(target)}\tPartitionCount: 1\tReplicationFactor: 3\tConfigs: \n\t(this lesson draws only orders' partitions)`);
    const usable = (id: number) => !s.brokers.find((b) => b.id === id)!.fenced;
    return {
      actions: [],
      output: [
        out(`Topic: orders\tTopicId: ${topicId("orders")}\tPartitionCount: ${s.partitions.length}\tReplicationFactor: 3\tConfigs: `, "hl"),
        // The brokers answer from the metadata they last applied: with no active controller, a dead leader stays listed.
        ...s.partitions.map((p) => out(`\tTopic: orders\tPartition: ${p.index}\tLeader: ${p.leader ?? "none"}\tReplicas: ${p.replicas.join(",")}\tIsr: ${p.replicas.filter(usable).join(",")}`)),
      ],
    };
  }
  return say("(in this lesson topics are only created and described)", "dim");
}

const HELP = `This sandbox is a docker-compose KRaft cluster:
controllers controller-1..3 (node ids 1–3) and brokers kafka-1..3.
  docker ps -a                                  the containers and their state
  docker stop controller-1 / docker start ...   stop or start a controller or a broker
  kafka-metadata-quorum.sh --bootstrap-server ${BOOTSTRAP} describe --status
  kafka-metadata-quorum.sh --bootstrap-server ${BOOTSTRAP} describe --replication
  kafka-topics.sh --bootstrap-server ${BOOTSTRAP} --create --topic payments
  kafka-topics.sh --bootstrap-server ${BOOTSTRAP} --describe --topic orders
Keys: ↑ ↓ for earlier commands, Tab to complete.`;



/** Types lines into a scenario the way a reader would; for tests. */
export function playK(start: KBox, typed: string[]) {
  const r = typeLines(kraftShell, applyAllK, start, typed);
  return { ctx: kCtx(start, replayK(start, r.actions)), moves: r.moves, output: r.output };
}
