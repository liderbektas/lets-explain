import type { CommandLine, ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete as completeWord, lines, out, shellWords, splitCommands, type TermLine } from "@lets-explain/core/lib/terminal";
import { apply, assignment, CONSUMER_POOL, GROUP, lagOf, SPEED, TOPIC, type LAction, type LEvent, type LState } from "./model";

/**
 * The terminal for the lag lesson. Its model ticks in seconds, so the commands are the ones an
 * operator really uses around a lagging consumer group:
 * - `./run-analytics.sh &` starts an instance of the analytics app; `jobs`, `kill %1` stop it.
 *   An instance reads `analytics.properties` when it starts.
 * - `sleep 5` lets five seconds pass: the producer writes, every instance handles what it can.
 * - `kafka-consumer-groups.sh --describe --group analytics` prints the real LAG table.
 * - `./deploy-clicks.sh` redeploys the clicks service with `clicks-producer.properties`.
 */

export interface Instance {
  id: number;
  pid: number;
  member: string;
}

export interface LagBox {
  lag: LState;
  files: Record<string, string>;
  jobs: Instance[];
  nextPid: number;
}

export type LagAction = LAction | { type: "$file"; path: string; content: string } | { type: "$jobs"; jobs: Instance[]; nextPid: number };

export const APP_CONFIG = "analytics.properties";
export const PRODUCER_CONFIG = "clicks-producer.properties";

export const appConfig = (threads = 1) =>
  `# The analytics app reads this when an instance starts.\nbootstrap.servers=localhost:9092\ngroup.id=${GROUP}\n# Threads that handle records; each one handles ${SPEED} records a second.\nprocessing.threads=${threads}`;

export const producerConfig = (key: "city" | "user") =>
  `# The clicks service reads this when it is deployed.\nbootstrap.servers=localhost:9092\n# Which field of a click becomes the record key: city or user\nkey.field=${key}`;

/** A box around a lag state. Running members become jobs, as if started with ./run-analytics.sh &. */
export function lagBox(lag: LState, opts: { threads?: number; key?: "city" | "user" } = {}): LagBox {
  let pid = 5120;
  const jobs = lag.members.map((member, i) => ({ id: i + 1, pid: pid++, member }));
  return { lag, files: { [APP_CONFIG]: appConfig(opts.threads ?? 1), [PRODUCER_CONFIG]: producerConfig(opts.key ?? (lag.hot ? "city" : "user")) }, jobs, nextPid: pid };
}

export function replayLag(start: LagBox, actions: LagAction[]) {
  const boxes = [start];
  const events: LEvent[][] = [];
  let box = start;
  for (const a of actions) {
    if (a.type === "$file") box = { ...box, files: { ...box.files, [a.path]: a.content } };
    else if (a.type === "$jobs") box = { ...box, jobs: a.jobs, nextPid: a.nextPid };
    else {
      const r = apply(box.lag, a);
      box = { ...box, lag: r.state };
      events.push(r.events);
      boxes.push(box);
      continue;
    }
    events.push([]);
    boxes.push(box);
  }
  return { boxes, events, actions };
}

export const applyLag = (box: LagBox, actions: LagAction[]) => replayLag(box, actions).boxes.at(-1)!;

type Result = ShellResult<LagAction, LagBox>;
interface Run {
  actions: LagAction[];
  output: TermLine[];
  failed?: boolean;
  editor?: Result["editor"];
  clear?: boolean;
}

const say = (text: string, tone: TermLine["tone"] = "out"): Run => ({ actions: [], output: text ? lines(text, tone) : [] });
const fail = (text: string): Run => ({ actions: [], output: lines(text, "err"), failed: true });

export function runLag(start: LagBox, line: string): Result {
  const result: Result = { actions: [], output: [], moves: 0 };
  let box = start;
  for (const words of splitCommands(shellWords(line))) {
    const r = command(box, words);
    result.actions.push(...r.actions);
    result.output.push(...r.output);
    if (r.clear) {
      result.clear = true;
      result.output = [];
    }
    if (r.actions.some((a) => !a.type.startsWith("$"))) result.moves++;
    box = applyLag(box, r.actions);
    if (r.editor) {
      result.editor = r.editor;
      return result;
    }
    if (r.failed) break;
  }
  return result;
}

const SHELL = ["./run-analytics.sh", "./deploy-clicks.sh", "kafka-consumer-groups.sh", "sleep", "jobs", "kill", "nano", "cat", "ls", "clear", "help"];

export const lagShell: CommandLine<LagAction, LagBox> = {
  run: runLag,
  prompt: () => "~/analytics$",
  complete: (box, input) => {
    const words = input.trimStart().split(/\s+/);
    const candidates = words.length <= 1 ? SHELL : ["--bootstrap-server", "localhost:9092", "--describe", "--group", GROUP, "--list", ...Object.keys(box.files)];
    return completeWord(input, candidates);
  },
  title: "bash",
};

function command(box: LagBox, words: string[]): Run {
  const background = words[words.length - 1] === "&";
  const [cmd = "", ...args] = background ? words.slice(0, -1) : words;
  switch (cmd.replace(/^\.\//, "")) {
    case "run-analytics.sh":
      return start(box, background);
    case "deploy-clicks.sh":
      return deploy(box);
    case "kafka-consumer-groups.sh":
    case "kafka-consumer-groups":
    case "bin/kafka-consumer-groups.sh":
      return groups(box, args);
  }
  if (background) return say(`(only ./run-analytics.sh runs in the background here)`, "dim");
  switch (cmd) {
    case "sleep": {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 1) return fail("usage: sleep seconds");
      if (n > 60) return say("(in this sandbox, sleep at most 60 seconds at a time)", "dim");
      return { actions: Array.from({ length: n }, () => ({ type: "tick" }) as LAction), output: [] };
    }
    case "jobs":
      return say(box.jobs.map((j, i) => `[${j.id}]${i === box.jobs.length - 1 ? "+" : "-"}  Running                 ./run-analytics.sh &`).join("\n"));
    case "kill":
      return kill(box, args);
    case "cat": {
      const o: TermLine[] = [];
      for (const p of args) {
        if (!(p in box.files)) return { actions: [], output: [...o, out(`cat: ${p}: No such file or directory`, "err")], failed: true };
        o.push(...lines(box.files[p]!));
      }
      return { actions: [], output: o };
    }
    case "ls":
      return say(["deploy-clicks.sh", "run-analytics.sh", ...Object.keys(box.files)].sort().join("  "));
    case "nano":
    case "vim":
    case "vi":
    case "code": {
      const path = args.find((a) => !a.startsWith("-"));
      if (!path) return fail(`${cmd}: give the file to open, e.g. ${cmd} ${APP_CONFIG}`);
      if (path.endsWith(".sh")) return say(`(${path} is a script you run, not a file to edit here)`, "dim");
      return {
        actions: [],
        output: [],
        editor: {
          file: path,
          text: box.files[path] ?? "",
          save: (_b, text) => ({ actions: [{ type: "$file", path, content: text.replace(/\n+$/, "") }], output: [], moves: 0 }),
        },
      };
    }
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

/** A setting from a properties file, or null when it is missing. */
function setting(text: string | undefined, key: string): string | null {
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.search(/[=:]/);
    if (at > 0 && line.slice(0, at).trim() === key) return line.slice(at + 1).trim();
  }
  return null;
}

function start(box: LagBox, background: boolean): Run {
  if (!background) return say("(the analytics app runs until you stop it: start it in the background with ./run-analytics.sh &)", "dim");
  const raw = setting(box.files[APP_CONFIG], "processing.threads") ?? "1";
  const threads = Number(raw);
  if (!Number.isInteger(threads) || threads < 1 || threads > 2)
    return fail(`Exception in thread "main" java.lang.IllegalArgumentException: processing.threads must be 1 or 2, got '${raw}'\n(in this sandbox an instance runs 1 or 2 threads)`);
  const free = CONSUMER_POOL.find((c) => !box.lag.members.includes(c.id));
  if (!free) return say(`(this sandbox runs at most ${CONSUMER_POOL.length} analytics instances)`, "dim");
  const id = (box.jobs.at(-1)?.id ?? 0) + 1;
  const job: Instance = { id, pid: box.nextPid, member: free.id };
  return {
    actions: [{ type: "startMember", member: free.id, speed: SPEED * threads }, { type: "$jobs", jobs: [...box.jobs, job], nextPid: box.nextPid + 1 }],
    output: [out(`[${id}] ${job.pid}`)],
  };
}

function kill(box: LagBox, args: string[]): Run {
  const targets = args.filter((a) => !a.startsWith("-"));
  if (!targets.length) return fail("kill: usage: kill [-9] pid | %job ...");
  const actions: LagAction[] = [];
  const o: TermLine[] = [];
  let jobs = box.jobs;
  for (const t of targets) {
    const job = t.startsWith("%") ? jobs.find((j) => j.id === Number(t.slice(1))) : jobs.find((j) => j.pid === Number(t));
    if (!job) return { actions, output: [...o, out(`bash: kill: ${t}: no such ${t.startsWith("%") ? "job" : "process"}`, "err")], failed: true };
    jobs = jobs.filter((j) => j !== job);
    actions.push({ type: "stopMember", member: job.member });
    o.push(out(`[${job.id}]+  ${args.includes("-9") ? "Killed    " : "Terminated"}              ./run-analytics.sh`));
  }
  actions.push({ type: "$jobs", jobs, nextPid: box.nextPid });
  return { actions, output: o };
}

function deploy(box: LagBox): Run {
  const key = setting(box.files[PRODUCER_CONFIG], "key.field");
  if (key !== "city" && key !== "user") return fail(`deploy failed: key.field must be city or user, got '${key ?? ""}'`);
  const hot = key === "city";
  return {
    actions: hot === box.lag.hot ? [] : [{ type: "setHot", on: hot }],
    output: [out("Deploying clicks service..."), out(`clicks service is up (record key: ${key})`)],
  };
}

const hash = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
};

function groups(box: LagBox, args: string[]): Run {
  const at = args.indexOf("--bootstrap-server");
  if (at === -1) return fail('Missing required argument "[bootstrap-server]"');
  if (args[at + 1] !== "localhost:9092") return fail(`Connection to node -1 (${args[at + 1] ?? ""}) could not be established.\n(in this sandbox the broker is at localhost:9092)`);
  if (args.includes("--list")) return say(GROUP);
  if (!args.includes("--describe")) return say("(in this lesson's sandbox: --list, or --describe --group analytics)", "dim");
  const g = args[args.indexOf("--group") + 1];
  if (!args.includes("--group") || !g) return fail("Option [describe] takes one of these options: [all-groups], [group]");
  if (g !== GROUP) return fail(`Error: Consumer group '${g}' does not exist.`);
  const s = box.lag;
  const owners = new Map<number, string>();
  for (const [m, ps] of Object.entries(assignment(s))) for (const p of ps) owners.set(p, m);
  const o: TermLine[] = [out("")];
  if (!s.members.length) o.push(out(`Consumer group '${GROUP}' has no active members.`), out(""));
  o.push(out(`${"GROUP".padEnd(11)}${"TOPIC".padEnd(8)}${"PARTITION".padEnd(11)}${"CURRENT-OFFSET".padEnd(16)}${"LOG-END-OFFSET".padEnd(16)}${"LAG".padEnd(6)}${"CONSUMER-ID".padEnd(36)}CLIENT-ID`, "hl"));
  s.partitions.forEach((p, i) => {
    const m = owners.get(i);
    const client = m ? `consumer-${GROUP}-${s.members.indexOf(m) + 1}` : "-";
    o.push(out(`${GROUP.padEnd(11)}${TOPIC.padEnd(8)}${String(i).padEnd(11)}${String(p.committed).padEnd(16)}${String(p.logEnd).padEnd(16)}${String(lagOf(p)).padEnd(6)}${(m ? `${client}-${hash(m)}` : "-").padEnd(36)}${client}`));
  });
  return { actions: [], output: o };
}

const HELP = `This sandbox understands:
  ./run-analytics.sh &        start an analytics instance (reads ${APP_CONFIG})
  jobs, kill %1               list and stop instances
  sleep 5                     let 5 seconds pass
  kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group ${GROUP}
  nano <file>, cat, ls        the config files
  ./deploy-clicks.sh          redeploy the clicks service with ${PRODUCER_CONFIG}
Keys: ↑ ↓ for earlier commands, Tab to complete.`;
