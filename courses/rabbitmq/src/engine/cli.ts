import type { CommandLine, ShellEditor, ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete as completeWord, lines, out, shellWords, splitCommands, type TermLine } from "@lets-explain/core/lib/terminal";
import {
  apply as applyBroker,
  DEFAULT_EXCHANGE,
  depth,
  nodeAlive,
  policyFor,
  queueAvailable,
  type Broker,
  type BrokerAction,
  type BrokerEvent,
  type ExchangeType,
  type Overflow,
  type Policy,
  type QueueArgs,
  type QueueType,
} from "./broker";
import {
  calleeName,
  childExprs,
  ExitSignal,
  Fn,
  formatLog,
  HostObj,
  inspect,
  Interp,
  isHost,
  jsErr,
  JsSyntaxError,
  JsThrow,
  jsStr,
  makeBuffer,
  makeError,
  Native,
  NODE_VERSION,
  parse,
  SandboxError,
  Scope,
  stmtParts,
  walkExprs,
  type Expr,
  type Stmt,
  type Val,
} from "./js";

/**
 * A terminal on a small project that talks to the model broker. The project has Node.js files
 * using amqplib (`nano publisher.js`, `node publisher.js`); running one turns its amqplib calls
 * into broker actions. `rabbitmqctl` (also as `docker exec rabbitmq rabbitmqctl …`, the way the
 * lessons write it) reads the broker and prints what the real tool prints.
 *
 * Workers (`node worker.js` with a `ch.consume(…)`) keep running in the background, as if in a
 * second terminal, and handle each message the moment it arrives, the way their callback says:
 * ack it, reject it, or hold it. Time passes only with `sleep N` (one tick a second), which is
 * what TTLs and slow workers (`await sleep(n)` in the callback) need.
 */

export type Files = Record<string, string>;

/** What a worker's callback does with a message. */
export type Verdict = "ack" | "requeue" | "drop" | "none";

export interface Worker {
  script: string;
  /** First matching rule wins; `match` is a body (exact) or a piece of it. */
  rules: { match: string; exact: boolean; verdict: Verdict }[];
  verdict: Verdict;
  /** Seconds a message takes (a sleep or setTimeout in the callback); 0 = at once. */
  slow: number;
  /** Lines the callback prints per message, with {text}, {buffer}, {key}, {replyTo} and {corr} filled in. */
  prints: string[];
  /**
   * The callback publishes an answer: an RPC server. `to` is a fixed queue, or null for the
   * request's `msg.properties.replyTo`; `corr` says whether it copies the correlation id. `body` is the
   * answer when the code gives it literally; otherwise the request's own body goes back.
   */
  reply?: { body: string | null; to: string | null; corr: boolean };
}

export interface Project {
  broker: Broker;
  files: Files;
  workers: Record<string, Worker>;
  /** Counter for server-named queues (amq.gen-…). */
  gen: number;
}

export type ProjectAction =
  | BrokerAction
  | { type: "writeFile"; path: string; content: string }
  | { type: "removeFile"; path: string }
  | { type: "startWorker"; tag: string; worker: Worker }
  | { type: "stopWorker"; tag: string }
  | { type: "nextGen" };

export type RabbitResult = ShellResult<ProjectAction, Project>;
export type RabbitEditor = ShellEditor<ProjectAction, Project>;

export const PROJECT = "shop";

export function project(broker: Broker, files: Files = {}): Project {
  return { broker, files, workers: {}, gen: 1 };
}

const isBrokerAction = (a: ProjectAction): a is BrokerAction =>
  !["writeFile", "removeFile", "startWorker", "stopWorker", "nextGen"].includes(a.type);

export function applyProject(p: Project, a: ProjectAction): { state: Project; events: BrokerEvent[] } {
  if (isBrokerAction(a)) {
    const r = applyBroker(p.broker, a);
    if (r.state === p.broker) return { state: p, events: r.events };
    // A restart closes every connection: workers die with it.
    const workers = a.type === "restart" ? {} : Object.fromEntries(Object.entries(p.workers).filter(([tag]) => r.state.consumers[tag]));
    return { state: { ...p, broker: r.state, workers }, events: r.events };
  }
  switch (a.type) {
    case "writeFile":
      return { state: { ...p, files: { ...p.files, [a.path]: a.content } }, events: [] };
    case "removeFile": {
      const files = { ...p.files };
      delete files[a.path];
      return { state: { ...p, files }, events: [] };
    }
    case "startWorker":
      return { state: { ...p, workers: { ...p.workers, [a.tag]: a.worker } }, events: [] };
    case "stopWorker": {
      const workers = { ...p.workers };
      delete workers[a.tag];
      return { state: { ...p, workers }, events: [] };
    }
    case "nextGen":
      return { state: { ...p, gen: p.gen + 1 }, events: [] };
  }
}

/** Plays actions from a start, keeping every state: what the scene draws and checks read. */
export function replayProject(start: Project, actions: ProjectAction[]) {
  const projects = [start];
  const states = [start.broker];
  const events: BrokerEvent[][] = [];
  let cur = start;
  for (const a of actions) {
    const r = applyProject(cur, a);
    cur = r.state;
    projects.push(cur);
    states.push(cur.broker);
    events.push(r.events);
  }
  return { projects, states, events, project: cur };
}

export const applyAll = (p: Project, actions: ProjectAction[]) => actions.reduce((s, a) => applyProject(s, a).state, p);

/* ------------------------------------------------------------------ shell */

interface Run {
  actions: ProjectAction[];
  output: TermLine[];
  failed?: boolean;
  editor?: RabbitEditor;
  clear?: boolean;
}

const say = (text: string, tone: TermLine["tone"] = "out"): Run => ({ actions: [], output: lines(text, tone) });
const fail = (text: string): Run => ({ actions: [], output: lines(text, "err"), failed: true });

export function runLine(start: Project, line: string): RabbitResult {
  const result: RabbitResult = { actions: [], output: [], moves: 0 };
  let p = start;
  for (const words of splitCommands(shellWords(line))) {
    const r = command(p, words);
    // Workers in the background handle whatever the command sent them.
    const after = applyAll(p, r.actions);
    const bg = settle(after);
    result.actions.push(...r.actions, ...bg.actions);
    result.output.push(...r.output, ...bg.output);
    if (r.clear) {
      result.clear = true;
      result.output = [];
    }
    if (r.actions.some((a) => a.type !== "nextGen")) result.moves++;
    p = applyAll(after, bg.actions);
    if (r.editor) {
      result.editor = r.editor;
      break;
    }
    if (r.failed) break;
  }
  return result;
}

export const promptFor = (_p: Project) => `~/${PROJECT}$`;

const COMMANDS = ["node", "npm", "rabbitmqctl", "docker", "nano", "cat", "ls", "echo", "sleep", "jobs", "pkill", "kill", "clear", "help", "rabbitmq-diagnostics", "rabbitmq-queues"];
const CTL_SUB = ["list_queues", "list_exchanges", "list_bindings", "list_consumers", "purge_queue", "delete_queue", "set_policy", "list_policies", "clear_policy", "cluster_status"];

export function completeLine(p: Project, input: string) {
  const words = input.trimStart().split(/\s+/);
  const last = words[words.length - 2];
  let candidates: string[];
  if (words.length <= 1) candidates = COMMANDS;
  else if (last === "rabbitmqctl") candidates = CTL_SUB;
  else if (last === "rabbitmq" && words.includes("exec")) candidates = ["rabbitmqctl"];
  else
    candidates = [
      ...Object.keys(p.files),
      ...Object.keys(p.broker.queues),
      ...["name", "messages", "messages_ready", "messages_unacknowledged", "consumers", "durable", "type", "arguments"],
    ];
  return completeWord(input, candidates);
}

export const rabbitShell: CommandLine<ProjectAction, Project> = { run: runLine, prompt: promptFor, complete: completeLine, title: "bash" };

function command(p: Project, words: string[]): Run {
  const [cmd, ...args] = words;
  switch (cmd) {
    case "clear":
      return { actions: [], output: [], clear: true };
    case "help":
      return say(HELP);
    case "ls":
      return say(Object.keys(p.files).sort().join("  "));
    case "pwd":
      return say(`/home/you/${PROJECT}`);
    case "cat": {
      if (!args.length) return fail("cat: missing file operand");
      const o: TermLine[] = [];
      for (const f of args) {
        if (!(f in p.files)) return { actions: [], output: [...o, out(`cat: ${f}: No such file or directory`, "err")], failed: true };
        o.push(...lines(p.files[f]!));
      }
      return { actions: [], output: o };
    }
    case "echo": {
      const at = args.findIndex((a) => a === ">" || a === ">>");
      if (at === -1) return say(args.join(" "));
      const path = args[at + 1];
      if (!path) return fail("bash: syntax error near unexpected token `newline'");
      const text = args.slice(0, at).join(" ");
      const old = p.files[path];
      return { actions: [{ type: "writeFile", path, content: args[at] === ">>" && old ? `${old}\n${text}` : text }], output: [] };
    }
    case "rm": {
      const files = args.filter((a) => !a.startsWith("-"));
      for (const f of files) if (!(f in p.files)) return fail(`rm: ${f}: No such file or directory`);
      return { actions: files.map((path) => ({ type: "removeFile", path }) as ProjectAction), output: [] };
    }
    case "nano":
    case "vim":
    case "vi":
    case "code": {
      const path = args.find((a) => !a.startsWith("-"));
      if (!path) return fail(`${cmd}: give the file to open, e.g. ${cmd} publisher.js`);
      return {
        actions: [],
        output: [],
        editor: {
          file: path,
          text: p.files[path] ?? "",
          save: (state, text) => {
            const content = text.replace(/\n+$/, "");
            if (state.files[path] === content) return { actions: [], output: [], moves: 0 };
            return { actions: [{ type: "writeFile", path, content }], output: [], moves: 1 };
          },
        },
      };
    }
    case "node": {
      if (args.includes("-v") || args.includes("--version")) return say(NODE_VERSION);
      const file = args.find((a) => !a.startsWith("-"))?.replace(/^\.\//, "");
      if (!file) return say("(an interactive Node.js shell is not in this sandbox: run a file, e.g. node publisher.js)", "dim");
      if (!(file in p.files))
        return fail(`node:internal/modules/cjs/loader:1228\n  throw err;\n  ^\n\nError: Cannot find module '/home/you/${PROJECT}/${file}'\n  code: 'MODULE_NOT_FOUND'\n\nNode.js ${NODE_VERSION}`);
      return runScript(p, file);
    }
    case "sleep": {
      const n = Math.max(1, Math.min(600, Math.round(Number(args[0] ?? "1")) || 1));
      return passTime(p, n);
    }
    case "jobs":
    case "ps": {
      const tags = Object.keys(p.workers);
      if (!tags.length) return { actions: [], output: [] };
      return { actions: [], output: tags.map((tag, i) => out(`[${i + 1}]${i === tags.length - 1 ? "+" : "-"}  Running                 node ${p.workers[tag]!.script} &  (consumer ${tag})`)) };
    }
    case "pkill":
    case "kill": {
      const hard = args.includes("-9") || args.includes("-KILL");
      const target = args.filter((a) => !a.startsWith("-")).pop();
      if (!target) return fail(`${cmd}: usage: ${cmd} [-9] -f <script>`);
      const tags = Object.keys(p.workers).filter((tag) => tag === target || p.workers[tag]!.script === target || `%${Object.keys(p.workers).indexOf(tag) + 1}` === target);
      if (!tags.length) return cmd === "pkill" ? { actions: [], output: [], failed: true } : fail(`bash: kill: ${target}: no such job`);
      const actions: ProjectAction[] = tags.flatMap((tag): ProjectAction[] => [{ type: hard ? "crashConsumer" : "cancel", tag }, { type: "stopWorker", tag }]);
      return { actions, output: tags.map((tag) => out(`[${Object.keys(p.workers).indexOf(tag) + 1}]   ${hard ? "Killed" : "Terminated"}              node ${p.workers[tag]!.script}`, "dim")) };
    }
    case "docker":
      return docker(p, args);
    case "rabbitmqctl":
      return rabbitmqctl(p, args);
    case "rabbitmq-queues":
      return rabbitmqQueues(p, args);
    case "rabbitmq-diagnostics":
      if (args[0] === "check_running" || args[0] === "ping" || args[0] === "status")
        return say(`Checking if RabbitMQ is running on node rabbit@1 ...\nRabbitMQ on node rabbit@1 is fully booted and running`);
      return say(`(rabbitmq-diagnostics ${args[0] ?? ""} is not in this sandbox)`, "dim");
    case "npm":
      if (args[0] === "install" || args[0] === "i" || args[0] === "add") return say("\nup to date, audited 3 packages in 412ms\n\nfound 0 vulnerabilities");
      return say(`(npm ${args[0] ?? ""} is not in this sandbox; amqplib is already installed: npm install amqplib)`, "dim");
    default:
      return fail(`bash: ${cmd}: command not found`);
  }
}

/** Runs broker actions in order, printing errors; stops at the first one. */
function runActions(p: Project, actions: ProjectAction[]): Run {
  let cur = p;
  const done: ProjectAction[] = [];
  for (const a of actions) {
    const r = applyProject(cur, a);
    const err = r.events.find((e) => e.type === "error");
    if (err && err.type === "error") return { actions: done, output: [out(`Error: ${err.message}`, "err")], failed: true };
    done.push(a);
    cur = r.state;
  }
  return { actions: done, output: [] };
}

/* ------------------------------------------------------------- workers */

const verdictFor = (w: Worker, body: string): Verdict => w.rules.find((r) => (r.exact ? body === r.match : body.includes(r.match)))?.verdict ?? w.verdict;

function handle(cur: Project, tag: string): ProjectAction | null {
  const w = cur.workers[tag];
  const c = cur.broker.consumers[tag];
  if (!w || !c || c.autoAck || !c.unacked.length) return null;
  const v = verdictFor(w, c.unacked[0]!.body);
  if (v === "ack") return { type: "ack", tag };
  if (v === "drop") return { type: "nack", tag, requeue: false };
  if (v === "requeue") return { type: "nack", tag, requeue: true };
  return null;
}

/** An RPC server's answer to the request it holds, sent before it settles the request. */
function replyFor(cur: Project, tag: string): ProjectAction | null {
  const w = cur.workers[tag];
  const m = cur.broker.consumers[tag]?.unacked[0];
  if (!w?.reply || !m) return null;
  const to = w.reply.to ?? m.replyTo;
  if (!to) return null;
  return { type: "publish", exchange: "", routingKey: to, body: w.reply.body ?? m.body, correlationId: w.reply.corr ? m.correlationId : undefined };
}

/** What a worker does with the message it holds: answer it (RPC), then ack, reject or requeue it. */
function work(cur: Project, tag: string): { actions: ProjectAction[]; state: Project } | null {
  const a = handle(cur, tag);
  if (!a) return null;
  let state = cur;
  const actions: ProjectAction[] = [];
  const r = replyFor(cur, tag);
  if (r) {
    const after = applyProject(state, r);
    if (!after.events.some((e) => e.type === "error")) {
      actions.push(r);
      state = after.state;
    }
  }
  actions.push(a);
  state = applyProject(state, a).state;
  return { actions, state };
}

/** The callback's console.log lines for one message: its body, routing key and reply properties filled in. */
function printsFor(w: Worker, m: { body: string; routingKey: string; replyTo?: string; correlationId?: string }): TermLine[] {
  const fill: Record<string, string> = {
    text: m.body,
    buffer: inspect(makeBuffer(m.body)),
    key: m.routingKey,
    replyTo: m.replyTo ?? "undefined",
    corr: m.correlationId ?? "undefined",
  };
  return w.prints.map((t) => out(t.replace(/\{(text|buffer|key|replyTo|corr)\}/g, (_, k: string) => fill[k]!)));
}

/** Fast workers handle everything they hold, as many rounds as it takes (capped, so a requeue loop shows). */
function settle(p: Project): Run {
  let cur = p;
  const actions: ProjectAction[] = [];
  const output: TermLine[] = [];
  let requeued = false;
  for (let round = 0; round < 400; round++) {
    let moved = false;
    requeued = false;
    for (const tag of Object.keys(cur.workers)) {
      if (cur.workers[tag]!.slow > 0) continue;
      const c = cur.broker.consumers[tag];
      const done = work(cur, tag);
      if (!done || !c) continue;
      output.push(...printsFor(cur.workers[tag]!, c.unacked[0]!));
      actions.push(...done.actions);
      cur = done.state;
      moved = true;
      const a = done.actions[done.actions.length - 1]!;
      if (a.type === "nack" && a.requeue) requeued = true;
    }
    if (!moved) return { actions, output };
  }
  if (requeued) output.push(out("(the same messages keep coming back: a worker requeues what it cannot handle, so the loop never ends)", "dim"));
  return { actions, output };
}

/** `sleep n`: n ticks. Slow workers finish one message every `slow` seconds; TTLs count down. */
function passTime(p: Project, n: number): Run {
  let cur = p;
  const actions: ProjectAction[] = [];
  const output: TermLine[] = [];
  for (let t = 1; t <= n; t++) {
    for (const tag of Object.keys(cur.workers)) {
      const w = cur.workers[tag]!;
      if (w.slow <= 0 || (cur.broker.time + 1) % w.slow !== 0) continue;
      const c = cur.broker.consumers[tag];
      const done = work(cur, tag);
      if (!done || !c) continue;
      output.push(...printsFor(w, c.unacked[0]!));
      actions.push(...done.actions);
      cur = done.state;
    }
    const tick: ProjectAction = { type: "tick" };
    actions.push(tick);
    cur = applyProject(cur, tick).state;
    const bg = settle(cur);
    actions.push(...bg.actions);
    output.push(...bg.output);
    cur = applyAll(cur, bg.actions);
  }
  return { actions, output };
}

/* -------------------------------------------------------------- scripts */

/** AMQP reply codes as amqplib names them in its errors. */
const AMQP_NAMES: Record<number, string> = { 403: "ACCESS-REFUSED", 404: "NOT-FOUND", 405: "RESOURCE-LOCKED", 406: "PRECONDITION-FAILED", 503: "COMMAND-INVALID", 530: "NOT-ALLOWED" };

/** What a consumer callback sees as `msg.properties.replyTo` / `correlationId` while it is read. */
const REPLY_TO = "{replyTo}";
const CORR = "{corr}";

/** A plain object argument (amqplib's options), or an empty one. */
const optsOf = (v: Val): Record<string, Val> => (v && typeof v === "object" && !(v instanceof HostObj) && !Array.isArray(v) ? (v as Record<string, Val>) : {});

/** A queue or exchange name as amqplib checks it. */
function nameArg(v: Val, field: string, fallback?: string): string {
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "string") throw jsErr("TypeError", `Field '${field}' is the wrong type; must be a string (up to 255 chars)`);
  return v;
}

/** The message object amqplib hands a `return` listener. */
function returnedMessage(m: { body: string; exchange: string; routingKey: string; headers?: Record<string, string>; replyTo?: string; correlationId?: string }): HostObj {
  return new HostObj("Message", {
    content: makeBuffer(m.body),
    fields: { replyCode: 312, replyText: "NO_ROUTE", exchange: m.exchange, routingKey: m.routingKey },
    properties: { headers: { ...m.headers }, replyTo: m.replyTo, correlationId: m.correlationId },
  });
}

interface Chan {
  obj: HostObj;
  closed: boolean;
  confirm: boolean;
  qos: number;
  /** A message was nacked since the last waitForConfirms. */
  nacked: boolean;
  returns: Val[];
  errors: Val[];
}

/** Runs a Node.js file: its amqplib calls become broker actions, in order, until it ends or fails. */
function runScript(p: Project, file: string): Run {
  const source = p.files[file]!;
  const path = `/home/you/${PROJECT}/${file}`;
  let cur = p;
  const actions: ProjectAction[] = [];
  const output: TermLine[] = [];
  /** Consumers this run started that are still there, and the channel each is on. */
  const live: { tag: string; chan: Chan }[] = [];
  let connClosed = false;

  let stmts: Stmt[];
  try {
    stmts = parse(source);
  } catch (e) {
    if (!(e instanceof JsSyntaxError)) throw e;
    const src = source.split("\n")[e.line - 1] ?? "";
    return { actions: [], output: lines(`${path}:${e.line}\n${src}\n\nSyntaxError: ${e.message}\n\nNode.js ${NODE_VERSION}`, "err"), failed: true };
  }

  const it = new Interp({ module: (name) => moduleFor(name), log: (text) => output.push(...lines(text)) }, file, source);

  const doAction = (a: ProjectAction) => {
    const r = applyProject(cur, a);
    const err = r.events.find((e) => e.type === "error");
    if (err && err.type === "error") throw new BrokerError(err.message, a);
    actions.push(a);
    cur = r.state;
    return r.events;
  };

  const closeText = (e: BrokerError) => `${e.code} (${AMQP_NAMES[e.code] ?? "INTERNAL-ERROR"}) with message "${e.message}"`;

  /** An RPC on the channel (assertQueue…): a refusal closes the channel and rejects with "Operation failed". */
  const rpc = <T>(chan: Chan, method: string, f: () => T): HostObj => {
    if (chan.closed) throw jsErr("IllegalOperationError", "Channel closed");
    try {
      return it.promise("fulfilled", f() as Val);
    } catch (e) {
      if (!(e instanceof BrokerError)) throw e;
      chan.closed = true;
      throw jsErr("Error", `Operation failed: ${method}; ${closeText(e)}`, 0, { code: e.code });
    }
  };

  /** Stops consumers this run started (on one channel, or all): cleanly, or as a crash. */
  const stopConsumers = (chan: Chan | null, crash: boolean) => {
    for (const c of [...live]) {
      if (chan && c.chan !== chan) continue;
      live.splice(live.indexOf(c), 1);
      if (!cur.broker.consumers[c.tag]) continue;
      doAction({ type: crash ? "crashConsumer" : "cancel", tag: c.tag });
      doAction({ type: "stopWorker", tag: c.tag });
    }
  };

  const fn = (name: string, f: (args: Val[]) => Val) => new Native(name, f, true);
  const notHere = (name: string, why = "") => fn(name, () => {
    throw new SandboxError(`ch.${name}()${why}`);
  });

  const makeChannel = (confirm: boolean): HostObj => {
    const chan: Chan = { obj: new HostObj(confirm ? "ConfirmChannel" : "Channel"), closed: false, confirm, qos: 0, nacked: false, returns: [], errors: [] };
    const publish = (exchange: string, routingKey: string, content: Val, options: Val, cb: Val): boolean => {
      if (chan.closed) throw jsErr("IllegalOperationError", "Channel closed");
      if (!isHost(content, "Buffer")) throw jsErr("TypeError", "content is not a buffer");
      const o = optsOf(options);
      const headers = optsOf(o.headers);
      const mandatory = o.mandatory === true;
      let events: BrokerEvent[];
      try {
        if (exchange !== DEFAULT_EXCHANGE && !cur.broker.exchanges[exchange]) throw new BrokerError(`NOT_FOUND - no exchange '${exchange}' in vhost '/'`, null, 404);
        events = doAction({
          type: "publish",
          exchange,
          routingKey,
          body: String(content.props.text),
          persistent: o.persistent === true || o.deliveryMode === 2 || o.deliveryMode === true,
          headers: Object.keys(headers).length ? Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, jsStr(v)])) : undefined,
          ttl: o.expiration !== undefined ? Math.max(1, Math.ceil(Number(o.expiration) / 1000)) : undefined,
          replyTo: o.replyTo !== undefined ? jsStr(o.replyTo) : undefined,
          correlationId: o.correlationId !== undefined ? jsStr(o.correlationId) : undefined,
          mandatory,
        });
      } catch (e) {
        if (!(e instanceof BrokerError)) throw e;
        // A publish has no reply: the broker closes the channel, which emits 'error'.
        chan.closed = true;
        const err = makeError("Error", `Channel closed by server: ${closeText(e)}`, { code: e.code });
        if (!chan.errors.length) throw new JsThrow(err, 0);
        for (const f of chan.errors) it.call(f, [err]);
        return true;
      }
      for (const e of events) if (e.type === "unroutable" && e.returned) for (const f of chan.returns) it.call(f, [returnedMessage(e.message)]);
      if (chan.confirm) {
        const nack = events.some((e) => e.type === "confirmed" && !e.ok);
        if (nack) chan.nacked = true;
        if (cb instanceof Fn || cb instanceof Native) it.call(cb, [nack ? makeError("Error", "message nacked") : null]);
      }
      return true;
    };
    Object.assign(chan.obj.props, {
      assertExchange: fn("assertExchange", ([n, t, options]) =>
        rpc(chan, "ExchangeDeclare", () => {
          const name = nameArg(n, "exchange");
          const kind = t === undefined ? "direct" : jsStr(t);
          const o = optsOf(options);
          if (!["direct", "fanout", "topic", "headers"].includes(kind)) throw new BrokerError(`COMMAND_INVALID - unknown exchange type '${kind}'`, null, 503);
          const durable = o.durable === undefined ? true : o.durable === true;
          const alt = o.alternateExchange ?? optsOf(o.arguments)["alternate-exchange"];
          const alternate = alt === undefined || alt === null ? undefined : jsStr(alt);
          const existing = cur.broker.exchanges[name];
          if (existing && existing.durable !== durable)
            throw new BrokerError(`PRECONDITION_FAILED - inequivalent arg 'durable' for exchange '${name}' in vhost '/': received '${durable}' but current is '${existing.durable}'`, null, 406);
          // Arguments are part of an exchange's identity: redeclaring with another alternate is refused.
          if (existing && (existing.alternate ?? undefined) !== alternate) {
            const v = (x: string | undefined) => (x === undefined ? "none" : `the value '${x}' of type 'longstr'`);
            throw new BrokerError(`PRECONDITION_FAILED - inequivalent arg 'alternate-exchange' for exchange '${name}' in vhost '/': received ${v(alternate)} but current is ${v(existing.alternate)}`, null, 406);
          }
          doAction({ type: "declareExchange", name, kind: kind as ExchangeType, durable, alternate });
          return { exchange: name };
        }),
      ),
      checkExchange: fn("checkExchange", ([n]) =>
        rpc(chan, "ExchangeDeclare", () => {
          const name = nameArg(n, "exchange");
          if (!cur.broker.exchanges[name]) throw new BrokerError(`NOT_FOUND - no exchange '${name}' in vhost '/'`, null, 404);
          return { exchange: name };
        }),
      ),
      assertQueue: fn("assertQueue", ([n, options]) =>
        rpc(chan, "QueueDeclare", () => {
          let name = nameArg(n, "queue", "");
          if (!name) {
            name = `amq.gen-${String(cur.gen).padStart(4, "0")}`;
            doAction({ type: "nextGen" });
          }
          const o = optsOf(options);
          // amqplib's named options win over the same key in `arguments`.
          const a: Record<string, Val> = { ...optsOf(o.arguments) };
          const named: [string, string][] = [["messageTtl", "x-message-ttl"], ["deadLetterExchange", "x-dead-letter-exchange"], ["deadLetterRoutingKey", "x-dead-letter-routing-key"], ["maxLength", "x-max-length"], ["expires", "x-expires"], ["maxPriority", "x-max-priority"]];
          for (const [k, x] of named) if (o[k] !== undefined) a[x] = o[k];
          const durable = o.durable === undefined ? true : o.durable === true;
          const qtype = (a["x-queue-type"] !== undefined ? jsStr(a["x-queue-type"]) : "classic") as QueueType;
          const args: QueueArgs = {};
          if (a["x-dead-letter-exchange"] !== undefined) args.dlx = jsStr(a["x-dead-letter-exchange"]);
          if (a["x-dead-letter-routing-key"] !== undefined) args.dlxKey = jsStr(a["x-dead-letter-routing-key"]);
          if (a["x-message-ttl"] !== undefined) args.ttl = Math.max(1, Math.ceil(Number(a["x-message-ttl"]) / 1000));
          if (a["x-max-length"] !== undefined) args.maxLength = Number(a["x-max-length"]);
          if (a["x-overflow"] !== undefined) args.overflow = jsStr(a["x-overflow"]) as Overflow;
          if (a["x-delivery-limit"] !== undefined) args.deliveryLimit = Number(a["x-delivery-limit"]);
          const existing = cur.broker.queues[name];
          if (existing) {
            if (existing.durable !== durable)
              throw new BrokerError(`PRECONDITION_FAILED - inequivalent arg 'durable' for queue '${name}' in vhost '/': received '${durable}' but current is '${existing.durable}'`, null, 406);
            if (existing.type !== qtype)
              throw new BrokerError(`PRECONDITION_FAILED - inequivalent arg 'x-queue-type' for queue '${name}' in vhost '/': received '${qtype}' but current is '${existing.type}'`, null, 406);
            for (const [k, label] of [["dlx", "x-dead-letter-exchange"], ["dlxKey", "x-dead-letter-routing-key"], ["ttl", "x-message-ttl"], ["maxLength", "x-max-length"], ["overflow", "x-overflow"]] as const) {
              if (existing.args[k] !== args[k])
                throw new BrokerError(`PRECONDITION_FAILED - inequivalent arg '${label}' for queue '${name}' in vhost '/': received ${args[k] === undefined ? "none" : `'${args[k]}'`} but current is ${existing.args[k] === undefined ? "none" : `'${existing.args[k]}'`}`, null, 406);
            }
          } else doAction({ type: "declareQueue", name, durable, queueType: qtype, args });
          const d = depth(cur.broker, name);
          return { queue: name, messageCount: d.ready, consumerCount: Object.values(cur.broker.consumers).filter((c) => c.queue === name).length };
        }),
      ),
      checkQueue: fn("checkQueue", ([n]) =>
        rpc(chan, "QueueDeclare", () => {
          const name = nameArg(n, "queue");
          if (!cur.broker.queues[name]) throw new BrokerError(`NOT_FOUND - no queue '${name}' in vhost '/'`, null, 404);
          return { queue: name, messageCount: depth(cur.broker, name).ready, consumerCount: Object.values(cur.broker.consumers).filter((c) => c.queue === name).length };
        }),
      ),
      bindQueue: fn("bindQueue", ([q, ex, pattern, argt]) =>
        rpc(chan, "QueueBind", () => {
          const queue = nameArg(q, "queue", "");
          const exchange = nameArg(ex, "exchange");
          // amqplib sends an empty routing key when no pattern is given.
          const key = pattern === undefined || pattern === null ? "" : jsStr(pattern);
          const a = optsOf(argt);
          if (!cur.broker.exchanges[exchange] || exchange === DEFAULT_EXCHANGE) throw new BrokerError(`NOT_FOUND - no exchange '${exchange}' in vhost '/'`, null, 404);
          if (!cur.broker.queues[queue]) throw new BrokerError(`NOT_FOUND - no queue '${queue}' in vhost '/'`, null, 404);
          const headers = Object.fromEntries(Object.entries(a).filter(([k]) => k !== "x-match").map(([k, v]) => [k, jsStr(v)]));
          doAction({
            type: "bind",
            exchange,
            queue,
            key,
            headers: Object.keys(headers).length ? headers : undefined,
            match: a["x-match"] !== undefined ? (jsStr(a["x-match"]) as "all" | "any") : undefined,
          });
          return {};
        }),
      ),
      unbindQueue: fn("unbindQueue", ([q, ex, pattern]) =>
        rpc(chan, "QueueUnbind", () => {
          const queue = nameArg(q, "queue", "");
          const exchange = nameArg(ex, "exchange");
          const key = pattern === undefined || pattern === null ? "" : jsStr(pattern);
          if (!cur.broker.exchanges[exchange] || exchange === DEFAULT_EXCHANGE) throw new BrokerError(`NOT_FOUND - no exchange '${exchange}' in vhost '/'`, null, 404);
          if (!cur.broker.queues[queue]) throw new BrokerError(`NOT_FOUND - no queue '${queue}' in vhost '/'`, null, 404);
          if (cur.broker.bindings.some((b) => b.exchange === exchange && b.queue === queue && b.key === key)) doAction({ type: "unbind", exchange, queue, key });
          return {};
        }),
      ),
      publish: fn("publish", ([ex, key, content, options, cb]) => publish(nameArg(ex, "exchange"), key === undefined ? "" : jsStr(key), content, options, cb)),
      sendToQueue: fn("sendToQueue", ([q, content, options, cb]) => publish("", nameArg(q, "routingKey"), content, options, cb)),
      prefetch: fn("prefetch", ([count]) => rpc(chan, "BasicQos", () => {
        chan.qos = Number(count ?? 0);
        return {};
      })),
      consume: fn("consume", ([q, callback, options]) =>
        rpc(chan, "BasicConsume", () => {
          const queue = nameArg(q, "queue");
          const o = optsOf(options);
          const autoAck = o.noAck === true;
          if (!cur.broker.queues[queue]) throw new BrokerError(`NOT_FOUND - no queue '${queue}' in vhost '/'`, null, 404);
          const isStream = cur.broker.queues[queue]!.type === "stream";
          if (isStream && autoAck) throw new BrokerError(`PRECONDITION_FAILED - Stream consumers must use manual acknowledgements`, null, 406);
          if (isStream && chan.qos === 0) throw new BrokerError(`PRECONDITION_FAILED - consumer prefetch count is not set for stream queue '${queue}' in vhost '/'`, null, 406);
          const rawOffset = optsOf(o.arguments)["x-stream-offset"];
          let offset: "first" | "last" | "next" | number | undefined;
          if (rawOffset !== undefined) {
            if (typeof rawOffset === "number") offset = rawOffset;
            else if (["first", "last", "next"].includes(jsStr(rawOffset))) offset = jsStr(rawOffset) as "first" | "last" | "next";
            else throw new BrokerError(`PRECONDITION_FAILED - invalid x-stream-offset '${jsStr(rawOffset)}'`, null, 406);
          }
          const base = file.replace(/\.[cm]?js$/, "");
          let tag = o.consumerTag !== undefined ? jsStr(o.consumerTag) : base;
          for (let k = 2; cur.broker.consumers[tag]; k++) tag = `${base}-${k}`;
          const worker = analyse(it, callback, file);
          doAction({ type: "consume", tag, queue, prefetch: chan.qos, autoAck, speed: autoAck ? 1 : 0, offset });
          doAction({ type: "startWorker", tag, worker });
          live.push({ tag, chan });
          return { consumerTag: tag };
        }),
      ),
      cancel: fn("cancel", ([t]) =>
        rpc(chan, "BasicCancel", () => {
          const c = live.find((x) => x.tag === jsStr(t));
          if (c) {
            live.splice(live.indexOf(c), 1);
            doAction({ type: "cancel", tag: c.tag });
            doAction({ type: "stopWorker", tag: c.tag });
          }
          return { consumerTag: jsStr(t) };
        }),
      ),
      purgeQueue: fn("purgeQueue", ([q]) =>
        rpc(chan, "QueuePurge", () => {
          const queue = nameArg(q, "queue");
          const n = cur.broker.queues[queue] ? depth(cur.broker, queue).ready : 0;
          doAction({ type: "purge", queue });
          return { messageCount: n };
        }),
      ),
      deleteQueue: fn("deleteQueue", ([q]) =>
        rpc(chan, "QueueDelete", () => {
          const name = nameArg(q, "queue");
          const n = cur.broker.queues[name] ? depth(cur.broker, name).ready : 0;
          doAction({ type: "deleteQueue", name });
          return { messageCount: n };
        }),
      ),
      ack: notHere("ack", " outside a consume callback"),
      nack: notHere("nack", " outside a consume callback"),
      reject: notHere("reject", " outside a consume callback"),
      ackAll: notHere("ackAll", " outside a consume callback"),
      nackAll: notHere("nackAll", " outside a consume callback"),
      get: notHere("get"),
      recover: notHere("recover"),
      bindExchange: notHere("bindExchange"),
      unbindExchange: notHere("unbindExchange"),
      deleteExchange: notHere("deleteExchange"),
      close: fn("close", () => {
        stopConsumers(chan, false);
        chan.closed = true;
        return it.promise("fulfilled");
      }),
      on: fn("on", ([event, f]) => {
        if (event === "return") chan.returns.push(f);
        if (event === "error") chan.errors.push(f);
        return chan.obj;
      }),
    });
    chan.obj.props.once = chan.obj.props.on;
    chan.obj.props.addListener = chan.obj.props.on;
    if (confirm)
      chan.obj.props.waitForConfirms = fn("waitForConfirms", () => {
        if (!chan.nacked) return it.promise("fulfilled", []);
        chan.nacked = false;
        const rejected = it.promise("rejected", makeError("Error", "message nacked"));
        rejected.props.line = it.current?.line ?? 0;
        return rejected;
      });
    return chan.obj;
  };

  const connection = new HostObj("ChannelModel", {
    createChannel: fn("createChannel", () => it.promise("fulfilled", makeChannel(false))),
    createConfirmChannel: fn("createConfirmChannel", () => it.promise("fulfilled", makeChannel(true))),
    close: fn("close", () => {
      stopConsumers(null, false);
      connClosed = true;
      return it.promise("fulfilled");
    }),
    on: fn("on", () => connection),
    once: fn("once", () => connection),
  });
  const connect = fn("connect", () => it.promise("fulfilled", connection));
  const amqplib = { connect, default: { connect } };
  const moduleFor = (name: string): Val | undefined => {
    if (name === "amqplib") return amqplib;
    if (name.startsWith("amqplib/")) throw new SandboxError(`${name} (this sandbox runs amqplib's promise API: import amqp from "amqplib")`);
    return undefined;
  };

  const where = () => {
    const st = it.current;
    return st ? `${path}:${st.line}\n${source.split("\n")[st.line - 1] ?? ""}\n` : "";
  };

  try {
    it.run(stmts);
  } catch (e) {
    if (e instanceof ExitSignal) {
      stopConsumers(null, true);
      return { actions, output, failed: e.code !== 0 };
    }
    if (e instanceof SandboxError) {
      stopConsumers(null, true);
      return {
        actions,
        output: [...output, ...lines(`${where()}(this sandbox runs the amqplib calls from the lessons with const/let, if, for loops, functions and console.log; it cannot run: ${e.message})`, "dim")],
        failed: true,
      };
    }
    if (e instanceof JsThrow) {
      stopConsumers(null, true);
      const line = e.line || it.current?.line || 0;
      const head = line ? `${path}:${line}\n${source.split("\n")[line - 1] ?? ""}\n^\n\n` : "";
      const v = e.value;
      const text = v instanceof HostObj && v.kind === "Error" ? `${jsStr(v.props.name)}: ${jsStr(v.props.message)}` : `Uncaught ${inspect(v, true)}`;
      return { actions, output: [...output, ...lines(`${head}${text}\n\nNode.js ${NODE_VERSION}`, "err")], failed: true };
    }
    throw e;
  }
  if (live.length && !connClosed) output.push(out(`(node keeps running and would hold this terminal; here it runs in the background, as with &. Stop it with: pkill -f ${file})`, "dim"));
  return { actions, output };
}

class BrokerError extends Error {
  readonly code: number;
  constructor(message: string, readonly action: ProjectAction | null, code?: number) {
    const real = message.replace(/^NOT_FOUND: no (queue|exchange) '(.*)'$/, "NOT_FOUND - no $1 '$2' in vhost '/'").replace(/^PRECONDITION_FAILED: /, "PRECONDITION_FAILED - ");
    super(real);
    this.code = code ?? (real.startsWith("NOT_FOUND") ? 404 : real.startsWith("PRECONDITION_FAILED") ? 406 : real.startsWith("ACCESS_REFUSED") ? 403 : 406);
  }
}

/* ----------------------------------------------------------- callbacks */

/** Swallows whatever reading a piece of a callback throws: that piece just tells nothing. */
function quiet<T>(f: () => T): T | undefined {
  try {
    return f();
  } catch {
    return undefined;
  }
}

/**
 * Reads a consume callback without running it: what it does with each message (ack, nack,
 * reject…, and on which bodies), how slowly, what it prints and what it answers (RPC).
 * Its `const`s and `console.log` arguments are worked out with a stand-in message whose body
 * prints as {text}; library calls are never made.
 */
function analyse(it: Interp, callback: Val, script: string): Worker {
  const w: Worker = { script, rules: [], verdict: "none", slow: 0, prints: [] };
  if (!(callback instanceof Fn)) return w;
  const def = callback.def;
  const scope = new Scope(callback.scope);
  const msg = new HostObj("Message", {
    content: makeBuffer("{text}", true),
    fields: { deliveryTag: 1, redelivered: false, exchange: "", routingKey: "{key}", consumerTag: "" },
    properties: { headers: {}, replyTo: REPLY_TO, correlationId: CORR },
  });
  const body: Stmt[] = Array.isArray(def.body) ? def.body : [{ k: "expr", e: def.body, at: def.body.at, to: def.body.to, line: 0 }];
  const ev = (e: Expr) => quiet(() => it.eval(e, scope));

  /** What a call does with the message: ch.ack, ch.nack(msg, false, false), ch.reject(msg, false)… */
  const settles = (e: Expr): Verdict | null => {
    if (e.k !== "call") return null;
    const n = calleeName(e);
    if (n === "ack" || n === "ackAll") return "ack";
    const at = n === "nack" ? 2 : n === "reject" ? 1 : n === "nackAll" ? 0 : -1;
    if (at < 0) return null;
    const arg = e.args[at];
    return arg && ev(arg) === false ? "drop" : "requeue";
  };
  const verdictIn = (stmts: Stmt[]): Verdict | null => {
    let v: Verdict | null = null;
    walkExprs(stmts, (e) => {
      v ??= settles(e);
    });
    return v;
  };

  const onCall = (e: Extract<Expr, { k: "call" }>) => {
    const n = calleeName(e);
    if (e.callee.k === "mem" && e.callee.obj.k === "id" && e.callee.obj.name === "console" && n && ["log", "info", "warn", "error", "debug"].includes(n)) {
      const args = quiet(() => e.args.map((a) => it.eval(a, scope)));
      if (args) w.prints.push(formatLog(args));
      return;
    }
    const v = settles(e);
    if (v) {
      if (w.verdict === "none") w.verdict = v;
      return;
    }
    if (n === "setTimeout" || n === "sleep" || n === "delay" || n === "wait") {
      // setTimeout(fn, ms) or, from timers/promises, setTimeout(ms) like sleep(ms).
      const msArg = n === "setTimeout" && e.args.length >= 2 ? e.args[1] : e.args[0];
      const ms = msArg ? ev(msArg) : undefined;
      if (typeof ms === "number" && ms > 0) w.slow = Math.max(1, Math.round(ms / 1000));
      return;
    }
    if (n === "sendToQueue" || n === "publish") {
      const [toArg, bodyArg, optArg] = n === "sendToQueue" ? e.args : e.args.slice(1);
      const to = toArg ? ev(toArg) : undefined;
      if (typeof to !== "string" || (to !== REPLY_TO && /\{\w+\}/.test(to))) return;
      // A literal answer (Buffer.from("42")); anything worked out from the request sends its body back.
      const lit = bodyArg && bodyArg.k === "call" && calleeName(bodyArg) === "from" && bodyArg.args.length === 1 && (bodyArg.args[0]!.k === "lit" || (bodyArg.args[0]!.k === "tpl" && !bodyArg.args[0]!.exprs.length)) ? jsStr(ev(bodyArg.args[0]!)) : null;
      const o = optArg ? ev(optArg) : undefined;
      w.reply = { body: lit, to: to === REPLY_TO ? null : to, corr: optsOf(o).correlationId === CORR };
    }
  };

  const visit = (e: Expr): void => {
    if (e.k === "fn") {
      if (Array.isArray(e.fn.body)) walk(e.fn.body);
      else visit(e.fn.body);
      return;
    }
    if (e.k === "call") onCall(e);
    childExprs(e).forEach(visit);
  };

  const walk = (stmts: Stmt[]) => {
    for (const st of stmts) {
      if (st.k === "if") {
        // if / else if: a rule for each body test; a final else is what happens to the rest.
        let s: Stmt | undefined = st;
        while (s && s.k === "if") {
          const cond = it.text(s.test);
          const exact = /(?:^|[^!=<>])===?\s*(["'`])(.*?)\1/.exec(cond) ?? /(["'`])(.*?)\1\s*===?(?!=)/.exec(cond);
          const part = /\.includes\(\s*(["'`])(.*?)\1\s*\)/.exec(cond);
          if (exact || part) {
            const v = verdictIn(s.yes);
            if (v) w.rules.push({ match: (exact ?? part)![2]!, exact: Boolean(exact), verdict: v });
          } else walk(s.yes); // A guard such as `if (msg !== null)`: its body is the callback's own work.
          const no: Stmt[] | undefined = s.no;
          if (no && no.length === 1 && no[0]!.k === "if") s = no[0];
          else {
            const ev2 = no ? verdictIn(no) : null;
            if (ev2) w.verdict = ev2;
            s = undefined;
          }
        }
        continue;
      }
      if (st.k === "var") quiet(() => it.exec(st, scope));
      const { exprs, blocks } = stmtParts(st);
      exprs.forEach(visit);
      // try blocks and plain blocks count as the callback's own code; a catch does not.
      if (st.k === "try") walk(st.block);
      else if (st.k === "block" || st.k === "for" || st.k === "forof") blocks.forEach(walk);
    }
  };

  it.analysing = true;
  const saved = it.current;
  try {
    def.params.forEach((p, k) => quiet(() => it.bind(p, k === 0 ? msg : undefined, scope, false, true)));
    walk(body);
  } finally {
    it.analysing = false;
    it.current = saved;
  }
  return w;
}

/* ------------------------------------------------------------- rabbitmqctl */

const QUEUE_COLS: Record<string, (p: Project, name: string) => string> = {
  name: (_p, n) => n,
  messages: (p, n) => String(depth(p.broker, n).total),
  messages_ready: (p, n) => String(depth(p.broker, n).ready),
  messages_unacknowledged: (p, n) => String(depth(p.broker, n).unacked),
  consumers: (p, n) => String(Object.values(p.broker.consumers).filter((c) => c.queue === n).length),
  durable: (p, n) => String(p.broker.queues[n]!.durable),
  auto_delete: () => "false",
  type: (p, n) => p.broker.queues[n]!.type,
  state: (p, n) => (queueAvailable(p.broker, p.broker.queues[n]!) ? "running" : "down"),
  policy: (p, n) => policyFor(p.broker, n)?.name ?? "",
  effective_policy_definition: (p, n) => policyFor(p.broker, n)?.raw ?? "[]",
  leader: (p, n) => p.broker.queues[n]!.node,
  members: (p, n) => `[${p.broker.queues[n]!.members.join(",")}]`,
  online: (p, n) => `[${p.broker.queues[n]!.members.filter((m) => nodeAlive(p.broker, m)).join(",")}]`,
  arguments: (p, n) => {
    const q = p.broker.queues[n]!;
    const a: string[] = [];
    if (q.type !== "classic") a.push(`{"x-queue-type","${q.type}"}`);
    if (q.args.dlx !== undefined) a.push(`{"x-dead-letter-exchange","${q.args.dlx}"}`);
    if (q.args.dlxKey !== undefined) a.push(`{"x-dead-letter-routing-key","${q.args.dlxKey}"}`);
    if (q.args.ttl !== undefined) a.push(`{"x-message-ttl",${q.args.ttl * 1000}}`);
    if (q.args.maxLength !== undefined) a.push(`{"x-max-length",${q.args.maxLength}}`);
    if (q.args.overflow !== undefined) a.push(`{"x-overflow","${q.args.overflow}"}`);
    return `[${a.join(",")}]`;
  },
};

function rabbitmqctl(p: Project, args: string[]): Run {
  const [sub, ...rest] = args.filter((a) => a !== "-q" && a !== "--quiet");
  const quiet = args.includes("-q") || args.includes("--quiet");
  const head = (what: string) => (quiet ? [] : [out("Timeout: 60.0 seconds ...", "dim"), out(`Listing ${what} for vhost / ...`, "dim")]);
  const cols = (given: string[], known: string[], fallback: string[]): string[] | string => {
    const bad = given.find((c) => !known.includes(c));
    if (bad) return `Error:\nInvalid info item(s): ${bad}. Valid items: ${known.join(", ")}`;
    return given.length ? given : fallback;
  };
  const table = (names: string[], rows: string[][]) => [out(names.join("\t"), "hl"), ...rows.map((r) => out(r.join("\t")))];
  switch (sub) {
    case undefined:
    case "help":
      return say("Usage: rabbitmqctl <command> [<args>]\n\nCommands in this sandbox: list_queues, list_exchanges, list_bindings, list_consumers, purge_queue, delete_queue,\nset_policy, list_policies, clear_policy, cluster_status");
    case "list_queues": {
      const c = cols(rest, Object.keys(QUEUE_COLS), ["name", "messages"]);
      if (typeof c === "string") return fail(c);
      const names = Object.keys(p.broker.queues).sort();
      return { actions: [], output: [...head("queues"), ...table(c, names.map((n) => c.map((k) => QUEUE_COLS[k]!(p, n))))] };
    }
    case "list_exchanges": {
      const c = cols(rest, ["name", "type", "durable", "auto_delete", "internal", "arguments"], ["name", "type"]);
      if (typeof c === "string") return fail(c);
      const rows = Object.values(p.broker.exchanges)
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .map((e) =>
          c.map((k) =>
            k === "name" ? e.name : k === "type" ? e.type : k === "durable" ? String(e.durable) : k === "arguments" ? (e.alternate ? `[{"alternate-exchange","${e.alternate}"}]` : "[]") : "false",
          ),
        );
      return { actions: [], output: [...head("exchanges"), ...table(c, rows)] };
    }
    case "list_bindings": {
      const all = ["source_name", "source_kind", "destination_name", "destination_kind", "routing_key", "arguments"];
      const c = cols(rest, all, all);
      if (typeof c === "string") return fail(c);
      // The default exchange binds every queue by its name; rabbitmqctl lists those first.
      const rows = [
        ...Object.keys(p.broker.queues)
          .sort()
          .map((q) => ({ source_name: "", source_kind: "exchange", destination_name: q, destination_kind: "queue", routing_key: q, arguments: "[]" })),
        ...[...p.broker.bindings]
          .sort((a, b) => (a.exchange + a.queue + a.key < b.exchange + b.queue + b.key ? -1 : 1))
          .map((b) => ({
            source_name: b.exchange,
            source_kind: "exchange",
            destination_name: b.queue,
            destination_kind: "queue",
            routing_key: b.key,
            arguments: b.headers ? `[{"x-match","${b.match ?? "all"}"},${Object.entries(b.headers).map(([k, v]) => `{"${k}","${v}"}`).join(",")}]` : "[]",
          })),
      ];
      return { actions: [], output: [...head("bindings"), ...table(c, rows.map((r) => c.map((k) => r[k as keyof typeof r])))] };
    }
    case "list_consumers": {
      const all = ["queue_name", "channel_pid", "consumer_tag", "ack_required", "prefetch_count", "active", "arguments"];
      const c = cols(rest, all, all);
      if (typeof c === "string") return fail(c);
      const rows = Object.values(p.broker.consumers).map((x, i) =>
        c.map((k) =>
          k === "queue_name" ? x.queue : k === "channel_pid" ? `<rabbit@1.${1000 + i}.0>` : k === "consumer_tag" ? x.tag : k === "ack_required" ? String(!x.autoAck) : k === "prefetch_count" ? String(x.prefetch) : k === "active" ? "true" : "[]",
        ),
      );
      return { actions: [], output: [...head("consumers"), ...table(c, rows)] };
    }
    case "purge_queue": {
      const q = rest[0];
      if (!q) return fail("Error (argument validation): not enough arguments");
      if (!p.broker.queues[q]) return fail(`Error:\n{:not_found, {:resource, "/", :queue, "${q}"}}`);
      const r = runActions(p, [{ type: "purge", queue: q }]);
      return { ...r, output: [out(`Purging queue '${q}' in vhost '/' ...`), ...r.output] };
    }
    case "delete_queue": {
      const q = rest[0];
      if (!q) return fail("Error (argument validation): not enough arguments");
      if (!p.broker.queues[q]) return fail(`Error:\n{:not_found, {:resource, "/", :queue, "${q}"}}`);
      const n = depth(p.broker, q).ready;
      const r = runActions(p, [{ type: "deleteQueue", name: q }]);
      return { ...r, output: [out(`Deleting queue '${q}' on vhost '/' ...`), out(`Queue was successfully deleted with ${n} ready messages`), ...r.output] };
    }
    case "set_policy":
      return setPolicy(p, rest);
    case "list_policies": {
      const ps = [...(p.broker.policies ?? [])].sort((a, b) => (a.name < b.name ? -1 : 1));
      return {
        actions: [],
        output: [
          ...(quiet ? [] : [out(`Listing policies for vhost "/" ...`, "dim")]),
          ...table(["vhost", "name", "pattern", "apply-to", "definition", "priority"], ps.map((x) => ["/", x.name, x.pattern, x.applyTo, x.raw, String(x.priority)])),
        ],
      };
    }
    case "clear_policy": {
      const name = rest.find((a) => !a.startsWith("-"));
      if (!name) return fail("Error (argument validation): not enough arguments");
      if (!(p.broker.policies ?? []).some((x) => x.name === name)) return fail(`Clearing policy "${name}" on vhost "/" ...\nError:\nParameter does not exist`);
      const r = runActions(p, [{ type: "clearPolicy", name }]);
      return { ...r, output: [out(`Clearing policy "${name}" on vhost "/" ...`), ...r.output] };
    }
    case "cluster_status": {
      const running = p.broker.nodes.filter((n) => n.alive).map((n) => n.name);
      return say(`Cluster status of node ${p.broker.nodes[0]!.name} ...\nBasics\n\nCluster name: ${p.broker.nodes[0]!.name}\n\nDisk Nodes\n\n${p.broker.nodes.map((n) => n.name).join("\n")}\n\nRunning Nodes\n\n${running.join("\n")}`);
    }
    case "add_user":
    case "add_vhost":
    case "set_permissions":
    case "list_permissions":
    case "list_connections":
    case "list_channels":
      return say(`(rabbitmqctl ${sub} is not in this sandbox)`, "dim");
    default:
      return fail(`Command '${sub}' not found.`);
  }
}

/* -------------------------------------------------------------- policies */

/** Policy keys this sandbox applies, and the queue setting each one sets. */
const POLICY_KEYS: Record<string, (v: unknown, d: QueueArgs) => string | null> = {
  "dead-letter-exchange": (v, d) => (typeof v === "string" ? ((d.dlx = v), null) : "must be a string"),
  "dead-letter-routing-key": (v, d) => (typeof v === "string" ? ((d.dlxKey = v), null) : "must be a string"),
  "message-ttl": (v, d) => (typeof v === "number" && v >= 0 ? ((d.ttl = Math.max(1, Math.ceil(v / 1000))), null) : "must be a non-negative integer"),
  "max-length": (v, d) => (typeof v === "number" && v >= 0 ? ((d.maxLength = v), null) : "must be a non-negative integer"),
  overflow: (v, d) => (v === "drop-head" || v === "reject-publish" ? ((d.overflow = v), null) : "must be one of drop-head, reject-publish, reject-publish-dlx"),
  "delivery-limit": (v, d) => (typeof v === "number" && v >= 0 ? ((d.deliveryLimit = v), null) : "must be a non-negative integer"),
};
/** Real policy keys this sandbox accepts but does not model. */
const POLICY_IGNORED = ["max-length-bytes", "expires", "queue-leader-locator", "queue-mode", "stream-max-segment-size-bytes", "max-age"];

function setPolicy(p: Project, rest: string[]): Run {
  let applyTo: Policy["applyTo"] = "all";
  let priority = 0;
  const pos: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--apply-to") {
      const v = rest[++i] ?? "";
      if (!["queues", "exchanges", "all", "classic_queues", "quorum_queues", "streams"].includes(v)) return fail(`Error (argument validation): '${v}' is not a valid apply-to value`);
      applyTo = v === "exchanges" ? "exchanges" : v === "all" ? "all" : "queues";
    } else if (a === "--priority") priority = Number(rest[++i] ?? "0") || 0;
    else if (a === "-p" || a === "--vhost") i++;
    else if (a.startsWith("--apply-to=")) applyTo = a.endsWith("=exchanges") ? "exchanges" : a.endsWith("=all") ? "all" : "queues";
    else if (a.startsWith("--priority=")) priority = Number(a.slice(11)) || 0;
    else if (a.startsWith("-")) return fail(`Error (argument validation): unknown switch ${a}`);
    else pos.push(a);
  }
  const [name, pattern, raw] = pos;
  if (!name || !pattern || raw === undefined) return fail("Error (argument validation): not enough arguments.\nUsage: rabbitmqctl set_policy [--apply-to <queues|exchanges|all>] [--priority <n>] <name> <pattern> <definition>");
  let def: unknown;
  try {
    def = JSON.parse(raw);
  } catch {
    return fail(`Setting policy "${name}" for pattern "${pattern}" to "${raw}" with priority "${priority}" for vhost "/" ...\nError:\nJSON decoding error`);
  }
  if (!def || typeof def !== "object" || Array.isArray(def)) return fail(`Setting policy "${name}" for pattern "${pattern}" to "${raw}" with priority "${priority}" for vhost "/" ...\nError:\nValidation failed\n\npolicy definition must be a JSON object`);
  const definition: QueueArgs = {};
  const unknown: string[] = [];
  const ignored: string[] = [];
  for (const [k, v] of Object.entries(def as Record<string, unknown>)) {
    const set = POLICY_KEYS[k];
    if (set) {
      const bad = set(v, definition);
      if (bad) return fail(`Setting policy "${name}" for pattern "${pattern}" to "${raw}" with priority "${priority}" for vhost "/" ...\nError:\nValidation failed\n\n${k} ${bad}`);
    } else if (POLICY_IGNORED.includes(k)) ignored.push(k);
    else unknown.push(k);
  }
  if (unknown.length)
    return fail(`Setting policy "${name}" for pattern "${pattern}" to "${raw}" with priority "${priority}" for vhost "/" ...\nError:\nValidation failed\n\n[${unknown.map((k) => `{<<"${k}">>,${JSON.stringify((def as Record<string, unknown>)[k])}}`).join(",")}] are not recognised policy settings`);
  const policy: Policy = { name, pattern, applyTo, priority, definition, raw: JSON.stringify(def) };
  const r = runActions(p, [{ type: "setPolicy", policy }]);
  const head = out(`Setting policy "${name}" for pattern "${pattern}" to "${raw}" with priority "${priority}" for vhost "/" ...`);
  return { ...r, output: [head, ...r.output, ...(ignored.length ? [out(`(this sandbox accepts ${ignored.join(", ")} but does not model it)`, "dim")] : [])] };
}

/* ----------------------------------------------------- nodes and containers */

/** Container names: one `rabbitmq` for a single node, `rabbit1`… for a cluster. */
function containers(p: Project): { name: string; node: string }[] {
  if (p.broker.nodes.length === 1) return [{ name: "rabbitmq", node: p.broker.nodes[0]!.name }];
  return p.broker.nodes.map((n, i) => ({ name: `rabbit${i + 1}`, node: n.name }));
}

const containerId = (i: number) => ["3f2a91c0d1e4", "8b7c2e5d9a10", "c41d07f3e862"][i] ?? "0d9e1f2a3b4c";

function docker(p: Project, args: string[]): Run {
  const [sub, ...rest] = args;
  const all = containers(p);
  const find = (name: string | undefined) => all.find((c) => c.name === name);
  switch (sub) {
    case "exec": {
      const words = rest.filter((a) => a !== "-it" && a !== "-i" && a !== "-t");
      const c = find(words[0]);
      if (!c) return fail(`Error response from daemon: No such container: ${words[0] ?? ""}`);
      if (!nodeAlive(p.broker, c.node)) return fail(`Error response from daemon: container ${containerId(all.indexOf(c))} is not running`);
      const inner = words[1];
      if (inner === "rabbitmq-queues") return rabbitmqQueues(p, words.slice(2), c.node);
      if (inner === "rabbitmq-diagnostics") return command(p, words.slice(1));
      return command(p, words.slice(1));
    }
    case "ps": {
      const showAll = rest.includes("-a");
      const rows = all
        .map((c, i) => ({ c, i, up: nodeAlive(p.broker, c.node) }))
        .filter((x) => x.up || showAll)
        .map((x) => `${containerId(x.i)}   rabbitmq:4-management   ${x.up ? "Up 2 hours            " : "Exited (0) 1 minute ago"}   ${x.c.name}`);
      return say(["CONTAINER ID   IMAGE                   STATUS                    NAMES", ...rows].join("\n"));
    }
    case "stop":
    case "start":
    case "restart": {
      const names = rest.filter((a) => !a.startsWith("-"));
      if (!names.length) return fail(`"docker ${sub}" requires at least 1 argument.`);
      const actions: ProjectAction[] = [];
      const output: TermLine[] = [];
      let cur = p;
      for (const name of names) {
        const c = find(name);
        if (!c) return { actions, output: [...output, out(`Error response from daemon: No such container: ${name}`, "err")], failed: true };
        const alive = nodeAlive(cur.broker, c.node);
        const single = all.length === 1;
        // A single broker stopped and started again comes back like a restart: transient things are gone.
        const plan: ProjectAction[] =
          sub === "stop"
            ? alive
              ? [{ type: "nodeDown", node: c.node }]
              : []
            : sub === "start"
              ? alive
                ? []
                : single
                  ? [{ type: "restart" }, { type: "nodeUp", node: c.node }]
                  : [{ type: "nodeUp", node: c.node }]
              : single
                ? alive
                  ? [{ type: "restart" }]
                  : [{ type: "restart" }, { type: "nodeUp", node: c.node }]
                : alive
                  ? [{ type: "nodeDown", node: c.node }, { type: "nodeUp", node: c.node }]
                  : [{ type: "nodeUp", node: c.node }];
        const r = runActions(cur, plan);
        if (r.failed) return { actions: [...actions, ...r.actions], output: [...output, ...r.output], failed: true };
        actions.push(...r.actions);
        cur = applyAll(cur, r.actions);
        output.push(out(name));
      }
      return { actions, output };
    }
    default:
      return say("(in this sandbox docker runs: docker exec <container> …, docker stop|start|restart <container>, docker ps)", "dim");
  }
}

function rabbitmqQueues(p: Project, args: string[], on = p.broker.nodes.find((n) => n.alive)?.name ?? p.broker.nodes[0]!.name): Run {
  const [sub, ...rest] = args;
  switch (sub) {
    case "quorum_status": {
      const name = rest.find((a) => !a.startsWith("-"));
      if (!name) return fail("Error (argument validation): not enough arguments");
      const q = p.broker.queues[name];
      if (!q) return fail(`Status of quorum queue ${name} on node ${on} ...\nError:\n{:not_found, {:resource, "/", :queue, "${name}"}}`);
      if (q.type !== "quorum") return fail(`Status of quorum queue ${name} on node ${on} ...\nError:\n{:error, :not_quorum_queue}`);
      if (!queueAvailable(p.broker, q)) return fail(`Status of quorum queue ${name} on node ${on} ...\nError:\n{:error, :timeout}`);
      return {
        actions: [],
        output: [
          out(`Status of quorum queue ${name} on node ${on} ...`, "dim"),
          out("Node Name\tRaft State\tMembership", "hl"),
          ...q.members.map((m) => out(`${m}\t${!nodeAlive(p.broker, m) ? "noproc" : m === q.node ? "leader" : "follower"}\tvoter`)),
        ],
      };
    }
    case "check_if_node_is_quorum_critical": {
      const critical = Object.values(p.broker.queues).filter((q) => {
        if (q.type === "classic" || !q.members.includes(on)) return false;
        const alive = q.members.filter((m) => m !== on && nodeAlive(p.broker, m)).length;
        return alive * 2 <= q.members.length;
      });
      const head = out(`Checking if node ${on} is critical for quorum of any quorum queues ...`, "dim");
      if (!critical.length) return { actions: [], output: [head] };
      return {
        actions: [],
        output: [head, ...lines(`Error:\nThere are quorum queues that would lose their quorum if the target node is shut down:\n${critical.map((q) => `  ${q.name}`).join("\n")}`, "err")],
        failed: true,
      };
    }
    default:
      return say(`(rabbitmq-queues ${sub ?? ""} is not in this sandbox; it runs quorum_status and check_if_node_is_quorum_critical)`, "dim");
  }
}

const HELP = `This sandbox understands:
  nano <file>          edit a file (publisher.js, worker.js, setup.js…)
  node <file>          run it; its amqplib calls go to the broker
  rabbitmqctl …        list_queues, list_exchanges, list_bindings, list_consumers,
                       purge_queue, delete_queue, set_policy, list_policies, clear_policy,
                       cluster_status (also: docker exec rabbitmq rabbitmqctl …)
  rabbitmq-queues …    quorum_status <queue>, check_if_node_is_quorum_critical
  docker stop|start <container>   take a node down or bring it back (cluster: rabbit1…)
  sleep <seconds>      let time pass (TTLs, slow workers)
  jobs, pkill -f <file>   see and stop background workers (kill -9 to crash one)
  docker restart rabbitmq restart the broker
  ls, cat, echo "…" > file, clear
Keys: ↑ ↓ for earlier commands, Tab to complete.`;
