import type { CommandLine, ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete as completeWord, lines, out, shellWords, splitCommands, type TermLine } from "@lets-explain/core/lib/terminal";
import { apply, CONSUMERS, MAX_PARTITIONS, nextOffset, STAGES, type OAction, type OEvent, type OState } from "./model";

/**
 * The terminal for the ordering lesson. The three shipping instances already run in the
 * background as jobs %1–%3; each handles one record a second. What the reader types:
 * - the console producer through a pipe, with or without a key (`1043:created` lines),
 * - `sleep 3`: three seconds pass and every running instance handles a record each second,
 * - `kill -STOP %1` / `kill -CONT %1`: pause and resume an instance, as a slow or stuck
 *   consumer would be (a long GC pause, a slow database call),
 * - `kafka-topics.sh --alter --partitions 4`, and `--describe` for the topic and the group.
 */

export interface OBox {
  o: OState;
  /** Consumers that are paused (kill -STOP). */
  paused: string[];
}

export type OShellAction = OAction | { type: "pause"; consumer: string } | { type: "resume"; consumer: string };

export const EVENTS = ["created", "paid", "shipped"] as const;
const PID = 6101;
const B = "localhost:9092";

export const oBox = (o: OState, paused: string[] = []): OBox => ({ o, paused });

export function replayO(start: OBox, actions: OShellAction[]) {
  const boxes = [start];
  const events: OEvent[][] = [];
  let box = start;
  for (const a of actions) {
    if (a.type === "pause" || a.type === "resume") {
      const paused = a.type === "pause" ? [...new Set([...box.paused, a.consumer])] : box.paused.filter((c) => c !== a.consumer);
      box = { ...box, paused };
      events.push([]);
    } else {
      const r = apply(box.o, a);
      box = { ...box, o: r.state };
      events.push(r.events);
    }
    boxes.push(box);
  }
  return { boxes, events, actions };
}

export const applyO = (box: OBox, actions: OShellAction[]) => replayO(box, actions).boxes.at(-1)!;

type Result = ShellResult<OShellAction, OBox>;
interface Run {
  actions: OShellAction[];
  output: TermLine[];
  failed?: boolean;
  clear?: boolean;
}

const say = (text: string, tone: TermLine["tone"] = "out"): Run => ({ actions: [], output: text ? lines(text, tone) : [] });
const fail = (text: string): Run => ({ actions: [], output: lines(text, "err"), failed: true });

export function runO(start: OBox, line: string): Result {
  const result: Result = { actions: [], output: [], moves: 0 };
  let box = start;
  for (const words of splitCommands(shellWords(line.replace(/\|/g, " | ")))) {
    const r = command(box, words);
    result.actions.push(...r.actions);
    result.output.push(...r.output);
    if (r.clear) {
      result.clear = true;
      result.output = [];
    }
    if (r.actions.length) result.moves++;
    box = applyO(box, r.actions);
    if (r.failed) break;
  }
  return result;
}

const SHELL = ["kafka-console-producer.sh", "kafka-topics.sh", "kafka-consumer-groups.sh", "printf", "echo", "sleep", "jobs", "kill", "clear", "help"];

export const orderingShell: CommandLine<OShellAction, OBox> = {
  run: runO,
  prompt: () => "~/shop$",
  complete: (_box, input) => {
    const words = input.trimStart().split(/\s+/);
    const candidates =
      words.length <= 1 || /[|;]\s*\S*$/.test(input)
        ? SHELL
        : ["--bootstrap-server", B, "--topic", "orders", "--property", "parse.key=true", "key.separator=:", "--alter", "--partitions", "--describe", "--group", "shipping", "-STOP", "-CONT", "%1", "%2", "%3"];
    return completeWord(input, candidates);
  },
  title: "bash",
};

const tool = (cmd: string) => cmd.replace(/^(\.\/)?(bin\/)?/, "").replace(/\.sh$/, "");

function command(box: OBox, words: string[]): Run {
  const bar = words.indexOf("|");
  if (bar !== -1) {
    const [src = "", ...srcArgs] = words.slice(0, bar);
    const right = words.slice(bar + 1);
    if (tool(right[0] ?? "") !== "kafka-console-producer") return fail("(in this sandbox, a pipe goes into kafka-console-producer.sh)");
    if (src !== "echo" && src !== "printf") return fail("(in this sandbox, a pipe starts with echo or printf)");
    const text = src === "printf" ? (srcArgs[0] ?? "").replace(/\\n/g, "\n") : srcArgs.filter((a) => a !== "-e").join(" ").replace(/\\n/g, srcArgs[0] === "-e" ? "\n" : "\\n");
    return produce(box, right.slice(1), text.split("\n").filter((x) => x !== ""));
  }
  const [cmd = "", ...args] = words;
  switch (tool(cmd)) {
    case "kafka-console-producer":
      return say(`(send events through a pipe, e.g.\n echo "1043:created" | kafka-console-producer.sh --bootstrap-server ${B} --topic orders --property parse.key=true --property key.separator=:)`, "dim");
    case "kafka-topics":
      return topics(box, args);
    case "kafka-consumer-groups":
      return groups(box, args);
  }
  switch (cmd) {
    case "sleep": {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 1) return fail("usage: sleep seconds");
      if (n > 30) return say("(in this sandbox, sleep at most 30 seconds at a time)", "dim");
      return { actions: rounds(box, n), output: [] };
    }
    case "jobs":
      return say(CONSUMERS.map((c, i) => `[${i + 1}]${i === 2 ? "+" : "-"}  ${box.paused.includes(c.id) ? "Stopped" : "Running"}                 ./run-shipping.sh &`).join("\n"));
    case "kill":
      return kill(box, args);
    case "echo":
      return say(args.join(" "));
    case "clear":
      return { actions: [], output: [], clear: true };
    case "help":
      return say(HELP);
    case "":
      return say("");
    default:
      return fail(`bash: ${cmd}: command not found`);
  }
}

/** n seconds: every running instance handles one record a second, in job order. */
function rounds(box: OBox, n: number): OShellAction[] {
  const actions: OShellAction[] = [];
  let o = box.o;
  for (let s = 0; s < n; s++) {
    for (const c of CONSUMERS) {
      if (box.paused.includes(c.id)) continue;
      const r = apply(o, { type: "read", consumer: c.id });
      if (r.events.some((e) => e.type === "processed")) {
        actions.push({ type: "read", consumer: c.id });
        o = r.state;
      }
    }
  }
  return actions;
}

function kill(box: OBox, args: string[]): Run {
  const signal = args.find((a) => a.startsWith("-"));
  const targets = args.filter((a) => !a.startsWith("-"));
  if (!targets.length) return fail("kill: usage: kill [-STOP | -CONT] %job ...");
  const stop = signal === "-STOP" || signal === "-19" || signal === "-SIGSTOP";
  const cont = signal === "-CONT" || signal === "-18" || signal === "-SIGCONT";
  if (!stop && !cont) return say("(in this sandbox the shipping instances keep running: pause one with kill -STOP %1, resume it with kill -CONT %1)", "dim");
  const actions: OShellAction[] = [];
  const o: TermLine[] = [];
  for (const t of targets) {
    const i = t.startsWith("%") ? Number(t.slice(1)) - 1 : Number(t) - PID;
    const c = CONSUMERS[i];
    if (!c) return { actions, output: [...o, out(`bash: kill: ${t}: no such ${t.startsWith("%") ? "job" : "process"}`, "err")], failed: true };
    if (stop && !box.paused.includes(c.id)) {
      actions.push({ type: "pause", consumer: c.id });
      o.push(out(`[${i + 1}]+  Stopped                 ./run-shipping.sh`));
    }
    if (cont && box.paused.includes(c.id)) actions.push({ type: "resume", consumer: c.id });
  }
  return { actions, output: o };
}

function needServer(args: string[]): string | null {
  const at = args.indexOf("--bootstrap-server");
  if (at === -1) return 'Missing required argument "[bootstrap-server]"';
  if (args[at + 1] !== B) return `Connection to node -1 (${args[at + 1] ?? ""}) could not be established.\n(in this sandbox the broker is at ${B})`;
  return null;
}

const prop = (args: string[], key: string) => {
  for (let i = 0; i < args.length; i++) if (args[i] === "--property" && args[i + 1]?.startsWith(`${key}=`)) return args[i + 1]!.slice(key.length + 1);
  return undefined;
};

function produce(box: OBox, args: string[], input: string[]): Run {
  const server = needServer(args);
  if (server) return fail(server);
  const topic = args[args.indexOf("--topic") + 1];
  if (!args.includes("--topic") || !topic) return fail('Missing required argument "[topic]"');
  if (topic !== "orders") return fail(`[Producer clientId=console-producer] Error while fetching metadata with correlation id 1 : {${topic}=UNKNOWN_TOPIC_OR_PARTITION}`);
  const keyed = prop(args, "parse.key") === "true";
  const sep = prop(args, "key.separator") ?? "\t";
  const actions: OShellAction[] = [];
  const written = { ...box.o.written };
  for (const [i, line] of input.entries()) {
    const at = line.indexOf(keyed ? sep : ":");
    if (keyed && at === -1) return fail(`org.apache.kafka.common.KafkaException: No key separator found on line number ${i + 1}: '${line}'`);
    const order = at === -1 ? "" : line.slice(0, at);
    const event = at === -1 ? line : line.slice(at + (keyed ? sep.length : 1));
    if (!/^\d{4}$/.test(order) || !EVENTS.includes(event as (typeof EVENTS)[number]))
      return fail(`(in this sandbox an event line is <order>:<created|paid|shipped>, e.g. 1043:created; got '${line}')`);
    const next = (written[order] ?? 0) + 1;
    if (next > STAGES) return fail(`(order ${order} already has all three events)`);
    if (event !== EVENTS[next - 1]) return fail(`(the order service writes an order's events in their real order: ${order}'s next event is ${EVENTS[next - 1]})`);
    written[order] = next;
    actions.push({ type: "write", order, keyed });
  }
  return { actions, output: [out(">".repeat(input.length + 1), "dim")] };
}

function topics(box: OBox, args: string[]): Run {
  const server = needServer(args);
  if (server) return fail(server);
  const n = box.o.partitions.length;
  if (args.includes("--describe")) {
    const o = [out(`Topic: orders\tPartitionCount: ${n}\tReplicationFactor: 1\tConfigs: `, "hl")];
    for (let p = 0; p < n; p++) o.push(out(`\tTopic: orders\tPartition: ${p}\tLeader: 1\tReplicas: 1\tIsr: 1`));
    return { actions: [], output: o };
  }
  if (args.includes("--list")) return say("orders");
  if (args.includes("--create")) return fail("Error while executing topic command : Topic 'orders' already exists.");
  if (args.includes("--alter")) {
    const count = Number(args[args.indexOf("--partitions") + 1]);
    if (!args.includes("--partitions") || !Number.isInteger(count)) return fail("(in this sandbox, --alter changes --partitions only)");
    if (count <= n) return fail(`Error while executing topic command : Topic currently has ${n} partitions, which is higher than the requested ${count}.`);
    if (count > MAX_PARTITIONS) return say(`(this lesson's picture fits up to ${MAX_PARTITIONS} partitions)`, "dim");
    return { actions: Array.from({ length: count - n }, () => ({ type: "addPartition" }) as OAction), output: [] };
  }
  return fail("Command must include exactly one action: --list, --describe, --create, --alter or --delete");
}

function groups(box: OBox, args: string[]): Run {
  const server = needServer(args);
  if (server) return fail(server);
  if (args.includes("--list")) return say("shipping");
  const g = args[args.indexOf("--group") + 1];
  if (!args.includes("--describe") || !g) return say("(in this lesson's sandbox: --list, or --describe --group shipping)", "dim");
  if (g !== "shipping") return fail(`Error: Consumer group '${g}' does not exist.`);
  const o = [out(""), out(`${"GROUP".padEnd(10)}${"TOPIC".padEnd(8)}${"PARTITION".padEnd(11)}${"CURRENT-OFFSET".padEnd(16)}${"LOG-END-OFFSET".padEnd(16)}${"LAG".padEnd(6)}CLIENT-ID`, "hl")];
  box.o.partitions.forEach((records, p) => {
    const owner = box.o.consumers.find((c) => c.assigned.includes(p));
    const at = nextOffset(box.o, p);
    o.push(out(`${"shipping".padEnd(10)}${"orders".padEnd(8)}${String(p).padEnd(11)}${String(at).padEnd(16)}${String(records.length).padEnd(16)}${String(records.length - at).padEnd(6)}${owner ? `shipping-${owner.id.slice(1)}` : "-"}`));
  });
  return { actions: [], output: o };
}

const HELP = `This sandbox understands:
  printf "1043:created\\n1043:paid\\n" | kafka-console-producer.sh --bootstrap-server ${B} --topic orders \\
      [--property parse.key=true --property key.separator=:]
  sleep 3                 three seconds pass: each running shipping instance handles a record a second
  jobs                    the shipping instances (%1, %2, %3)
  kill -STOP %1           pause an instance (a slow or stuck consumer); kill -CONT %1 resumes it
  kafka-topics.sh --bootstrap-server ${B} --describe | --alter --topic orders --partitions 4
  kafka-consumer-groups.sh --bootstrap-server ${B} --describe --group shipping
Keys: ↑ ↓ for earlier commands, Tab to complete.`;
