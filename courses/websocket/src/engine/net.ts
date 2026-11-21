import { acceptFor, fromUtf8, seededBytes, sha1, toBase64, toHex, utf8, validKey } from "./bytes";
import { closePayload, OP, OPCODE_NAME, readClose, wireSize } from "./frames";
import { nginxPage, NGINX_CONF, NGINX_VERSION, parseNginx, pickLocation, upstreamHeaders, type NginxConf } from "./nginx";
import { asBuffer, crashText, EXIT, guard, load, WsSocket, type Host, type Instance, type Listener, type RedisClient, type WsServer } from "./runtime";

/**
 * A small, deterministic model of a team chat and everything around it.
 *
 * - An Express API on :8080 (`GET /messages`, long polling with `?wait=`, `POST /messages`,
 *   server-sent events on `/events`) and a standalone `ws` WebSocket chat on :8081, which answer
 *   the way Express and the ws library do.
 * - Node files the reader runs (`node server.js`) run for real, with `ws`, `ioredis` and timers
 *   on the sandbox clock (see runtime.ts). Processes are kept as specs; their live objects sit in a
 *   runtime that is rebuilt fresh for every replay, so a run always replays the same way.
 * - WebSocket connections carry real frames: client frames are masked, messages can be split into
 *   fragments, pings get pongs, and a close is a handshake. Each end closes on its own: a pulled
 *   cable leaves the other end believing the connection is open.
 * - nginx on :80 (reloaded from its config file), Redis on :6379, iptables rules that drop
 *   packets, and tshark captures that print frames as Wireshark dissects them.
 *
 * Time only moves when something waits: `sleep`, a long poll, a stream with --max-time.
 */

export const API_PORT = 8080;
export const WS_PORT = 8081;
export const NGINX_PORT = 80;
export const REDIS_PORT = 6379;
const EPOCH = Date.UTC(2026, 10, 21, 10, 0, 0);
/** Express caps long polls here, as most long-poll endpoints do. */
export const MAX_WAIT_S = 30;
/** A Node client's connection is set up as soon as the code that asked for it has run. */
const CONNECT_MS = 0;
/** The ws library gives a peer this long to answer a close frame. */
const CLOSE_TIMEOUT_MS = 30_000;

/** "you" (the terminal: curl, wscat), "browser", "proc:<pid>" (a Node script), or any named remote client. */
export type Client = string;
export type Via = "seed" | "teammate" | "ws" | "post";

export interface ChatMessage {
  id: number;
  from: string;
  text: string;
  at: number;
  via: Via;
}

/** A teammate writes at a set time. */
export interface Planned {
  at: number;
  from: string;
  text: string;
}

export type ExchangeKind = "poll" | "longpoll" | "sse" | "post" | "upgrade" | "other";
export type ExchangeEnd = "done" | "clientTimeout" | "sandboxStop" | "refused" | "dropped" | "lost" | "closed";

/** One HTTP request and its answer (for a stream, everything sent so far). */
export interface Exchange {
  id: number;
  client: Client;
  port: number;
  method: string;
  target: string;
  path: string;
  query: Record<string, string>;
  headers: [string, string][];
  body: string;
  httpVersion: "1.0" | "1.1";
  kind: ExchangeKind;
  sentAt: number;
  doneAt: number | null;
  status: number | null;
  statusText: string;
  respHeaders: [string, string][];
  respBody: string;
  /** Message ids this answer carried to the client. */
  delivered: number[];
  /** A 200 with `[]`, or a 204: the client asked and there was nothing. */
  empty: boolean;
  after: number;
  /** A held long poll answers 204 at this time if nothing comes. */
  holdUntil: number | null;
  /** The client gives up at this time (curl --max-time). */
  abortAt: number | null;
  stopKind: "clientTimeout" | "sandboxStop";
  end: ExchangeEnd | null;
  /** nginx: the client's request this upstream request serves. */
  proxyFor: number | null;
}

export interface WsFrame {
  at: number;
  /** "out": client to server. */
  dir: "out" | "in";
  /** The payload as text (binary payloads as hex, long ones cut short). */
  text: string;
  opcode: number;
  fin: boolean;
  masked: boolean;
  mask: string | null;
  size: number;
  wire: number;
  /** Never arrived: the receiving end had already closed. */
  lost: boolean;
}

/** A whole message as its receiver got it (fragments put together). */
export interface WsMsg {
  at: number;
  dir: "out" | "in";
  text: string;
  binary: boolean;
  size: number;
  frames: number;
}

export interface WsConn {
  id: number;
  client: Client;
  /** The port the client dialled (nginx's, when it goes through nginx). */
  port: number;
  /** The port of the server that holds the other end. */
  upstream: number;
  /** "chat" (the built-in :8081 chat) or "proc:<pid>". */
  server: string;
  via: number | null;
  key: string;
  accept: string;
  exchange: number;
  interactive: boolean;
  origin: string | null;
  openedAt: number;
  /** The client's end. */
  closedAt: number | null;
  closeCode: number | null;
  closeReason: string;
  /** The server's end. */
  serverClosedAt: number | null;
  serverCode: number | null;
  serverReason: string;
  /** Which ends have sent a close frame. */
  sentClose: { client: boolean; server: boolean };
  frames: WsFrame[];
  msgs: WsMsg[];
  /** A slow client reads this many bytes a second; null reads at once. */
  readRate: number | null;
  /** Bytes on their way to a slow client, and when each arrives. */
  queue: { at: number; wire: number }[];
  drainAt: number;
  lastFromServer: number;
  /** nginx's proxy_read_timeout for this connection. */
  idleTimeout: number | null;
  /** How to reconnect, for a client app that does. */
  reopen: Extract<NetAction, { type: "wsOpen" }> | null;
}

export interface Proc {
  pid: number;
  /** What `ps` shows after "node", or the tool's command line. */
  file: string;
  kind: "node" | "tshark";
  code: string;
  env: Record<string, string>;
  args: string[];
  alive: boolean;
  startedAt: number;
  ports: number[];
  exit: { code: number | null; signal: string | null } | null;
  /** tshark: how it prints. */
  capture: { verbose: boolean; websocketOnly: boolean; port: number | null; count: number } | null;
}

export interface Net {
  now: number;
  messages: ChatMessage[];
  planned: Planned[];
  exchanges: Exchange[];
  conns: WsConn[];
  /** Message id → when a client first got it. */
  seen: Record<number, number>;
  files: Record<string, string>;
  procs: Proc[];
  /** Values the terminal computed (keys, hashes), so a scenario can see what the reader worked out. */
  printed: string[];
  /** Shell variables (`KEY=...`). */
  vars: Record<string, string>;
  /** How many random values were drawn; keys, masks and `openssl rand` come from this. */
  draws: number;
  nextPid: number;
  /** The config nginx runs with (null: nginx is not installed here). */
  nginx: { conf: NginxConf; loadedAt: number } | null;
  redis: boolean;
  /** Ports whose packets iptables drops. */
  blocked: number[];
  /** Clients whose network is gone. */
  down: Client[];
  /** Network trouble at set times: a port's packets dropped (or one client's cable pulled), then back. */
  netPlan: NetTrouble[];
  packets: number;
  /** How the start was built, so a fresh runtime can be booted from it. */
  origin?: { base: Net; actions: NetAction[] };
  /** The live side of the current run. Shared by every snapshot of one run. */
  rt?: Rt;
}

export interface NetTrouble {
  at: number;
  port?: number;
  client?: Client;
  down: boolean;
}

export type NetAction =
  | { type: "advance"; ms: number }
  /** Waits until the latest request is answered or given up: a blocking curl. */
  | { type: "await" }
  | {
      type: "http";
      client: Client;
      port: number;
      method: string;
      target: string;
      headers: [string, string][];
      body?: string;
      /** curl --max-time, in ms. */
      maxTime?: number;
      /** For a stream with no --max-time: the sandbox stops it after this long. */
      stopAfter?: number;
    }
  /** A WebSocket client library (the browser, wscat) connects: handshake, then checks the answer. */
  | {
      type: "wsOpen";
      client: Client;
      port: number;
      target: string;
      headers: [string, string][];
      interactive?: boolean;
      readRate?: number;
      /** A client app that reconnects this many ms after it is cut off (or fails to connect). */
      reconnect?: number;
    }
  | { type: "wsSend"; client: Client; text: string; binary?: boolean }
  /** code null: a close frame with no status (wscat on Ctrl+C, ws.close() with no code). */
  | { type: "wsClose"; client: Client; code: number | null; reason?: string }
  /** The client's network goes away: its requests stop; its sockets go silent. */
  | { type: "netDown"; client: Client }
  | { type: "netUp"; client: Client }
  /** The client closes its open streams itself (`eventSource.close()`). */
  | { type: "hangUp"; client: Client }
  /** A teammate writes now. */
  | { type: "say"; from: string; text: string }
  | { type: "write"; path: string; text: string }
  | { type: "node"; file: string; code?: string; env?: Record<string, string>; args?: string[] }
  /** A foreground script: time runs until it ends (at most `max` ms). */
  | { type: "awaitExit"; pid: number; max: number }
  | { type: "kill"; pid: number; signal?: "TERM" | "KILL" | "INT" }
  /** Every process running this file gets SIGTERM (pkill -f). */
  | { type: "killFile"; file: string }
  | { type: "block"; port: number; on: boolean }
  | { type: "tshark"; verbose: boolean; websocketOnly: boolean; port: number | null }
  | { type: "nginxReload" }
  | { type: "redisPublish"; channel: string; message: string }
  | { type: "print"; text: string }
  | { type: "set"; name: string; value: string }
  | { type: "draw" };

export type NetEvent =
  | { type: "sent"; id: number; client: Client; kind: ExchangeKind; port: number; method: string; target: string }
  | { type: "answered"; id: number; status: number; empty: boolean; delivered: number[] }
  | { type: "held"; id: number; kind: ExchangeKind }
  | { type: "streamed"; id: number; msg: number }
  | { type: "ended"; id: number; end: ExchangeEnd }
  | { type: "posted"; msg: number; from: string; via: Via }
  | { type: "wsOpened"; conn: number; port: number; client: Client }
  | { type: "wsFailed"; port: number; reason: string; client: Client }
  | { type: "frame"; conn: number; dir: "out" | "in"; text: string; opcode: number; fin: boolean; size: number; held?: boolean }
  | { type: "message"; conn: number; dir: "out" | "in"; text: string; binary: boolean; client: Client }
  | { type: "wsClosed"; conn: number; code: number; side: "client" | "server"; reason: string; client: Client }
  | { type: "time"; from: number; to: number }
  | { type: "procStarted"; pid: number; file: string; port: number | null; logs: string[] }
  | { type: "procFailed"; file: string; text: string }
  | { type: "procCrashed"; pid: number; text: string }
  | { type: "procStopped"; pid: number; signal: string }
  | { type: "procExited"; pid: number; code: number }
  | { type: "procLog"; pid: number; text: string }
  | { type: "captured"; pid: number; lines: string[] }
  | { type: "blocked"; port: number; on: boolean }
  | { type: "nginx"; ok: boolean; text: string }
  | { type: "note"; text: string };

/* ------------------------------------------------------------------- setup */

export interface NetSetup {
  messages?: { from: string; text: string }[];
  planned?: Planned[];
  /** Messages the client already has. */
  seenUpTo?: number;
  files?: Record<string, string>;
  /** Node files started before the scenario begins (with their environment). */
  running?: (string | { file: string; env?: Record<string, string> })[];
  /** Anything else that happened before the scenario begins. */
  actions?: NetAction[];
  /** nginx installed and running with this config file's text (written to NGINX_CONF). */
  nginx?: string;
  redis?: boolean;
  netPlan?: NetTrouble[];
  now?: number;
}

export function createNet(setup: NetSetup = {}): Net {
  const now = setup.now ?? 0;
  const messages = (setup.messages ?? []).map((m, i) => ({ id: i + 1, from: m.from, text: m.text, at: now, via: "seed" as const }));
  const seen: Record<number, number> = {};
  for (const m of messages) if (m.id <= (setup.seenUpTo ?? 0)) seen[m.id] = now;
  const files = { ...(setup.files ?? {}) };
  let nginx: Net["nginx"] = null;
  if (setup.nginx !== undefined) {
    files[NGINX_CONF] = setup.nginx;
    const p = parseNginx(setup.nginx);
    if (p.ok) nginx = { conf: p.conf, loadedAt: now };
  }
  const base: Net = {
    now,
    messages,
    planned: [...(setup.planned ?? [])].sort((a, b) => a.at - b.at),
    exchanges: [],
    conns: [],
    seen,
    files,
    procs: [],
    printed: [],
    vars: {},
    draws: 0,
    nextPid: 4242,
    nginx,
    redis: setup.redis ?? false,
    blocked: [],
    down: [],
    netPlan: [...(setup.netPlan ?? [])].sort((a, b) => a.at - b.at),
    packets: 0,
  };
  const actions: NetAction[] = [
    ...(setup.running ?? []).map((r): NetAction => (typeof r === "string" ? { type: "node", file: r } : { type: "node", file: r.file, env: r.env })),
    ...(setup.actions ?? []),
  ];
  if (!actions.length) return base;
  const start = { ...simulate(actions, base).states.at(-1)! };
  delete start.rt;
  return start;
}

/* -------------------------------------------------------------- utilities */

export const header = (headers: [string, string][], name: string): string | undefined =>
  headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];

/** Node's parser treats a request as an upgrade only with both `Connection: Upgrade` and an `Upgrade` header. */
export function isUpgrade(headers: [string, string][]): boolean {
  const conn = header(headers, "connection");
  const tokens = (conn ?? "").split(",").map((t) => t.trim().toLowerCase());
  return tokens.includes("upgrade") && header(headers, "upgrade") !== undefined;
}

export const httpDate = (now: number) => new Date(EPOCH + now).toUTCString();

export const bytesOf = (text: string) => utf8(text).length;

/** Express's weak ETag for a body: length in hex and the start of its SHA-1, as the etag package does. */
const etag = (body: string) => `W/"${bytesOf(body).toString(16)}-${toBase64(sha1(utf8(body))).slice(0, 27)}"`;

const msgJson = (m: Pick<ChatMessage, "id" | "from" | "text">) => ({ id: m.id, from: m.from, text: m.text });

export function parseTarget(target: string): { path: string; query: Record<string, string> } {
  const [path, qs] = target.split("?", 2) as [string, string | undefined];
  const query: Record<string, string> = {};
  for (const part of (qs ?? "").split("&")) {
    if (!part) continue;
    const [k, v] = part.split("=", 2) as [string, string | undefined];
    try {
      query[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    } catch {
      query[k] = v ?? "";
    }
  }
  return { path: path || "/", query };
}

/** The raw bytes of a request on the wire, to count what each way of asking costs. */
export function requestText(ex: Pick<Exchange, "method" | "target" | "headers" | "body"> & { httpVersion?: string }): string {
  return `${ex.method} ${ex.target} HTTP/${ex.httpVersion ?? "1.1"}\r\n${ex.headers.map(([k, v]) => `${k}: ${v}\r\n`).join("")}\r\n${ex.body}`;
}

export function responseText(ex: Exchange): string {
  if (ex.status === null) return "";
  return `HTTP/1.1 ${ex.status} ${ex.statusText}\r\n${ex.respHeaders.map(([k, v]) => `${k}: ${v}\r\n`).join("")}\r\n${ex.respBody}`;
}

/** Bytes a WebSocket text frame takes: 2 header bytes (more for long payloads), 4 mask bytes from a client. */
export function frameBytes(text: string, fromClient: boolean): number {
  return wireSize(bytesOf(text), fromClient);
}

export const sseEvent = (m: { id: number; from: string; text: string }) => `id: ${m.id}\ndata: ${JSON.stringify(msgJson(m))}\n\n`;

function clone(n: Net): Net {
  return {
    ...n,
    messages: [...n.messages],
    planned: [...n.planned],
    exchanges: n.exchanges.map((e) => ({ ...e, delivered: [...e.delivered] })),
    conns: n.conns.map((c) => ({ ...c, frames: [...c.frames], msgs: [...c.msgs], queue: [...c.queue], sentClose: { ...c.sentClose } })),
    seen: { ...n.seen },
    files: { ...n.files },
    procs: n.procs.map((p) => ({ ...p, ports: [...p.ports], capture: p.capture ? { ...p.capture } : null })),
    printed: [...n.printed],
    vars: { ...n.vars },
    blocked: [...n.blocked],
    down: [...n.down],
    netPlan: [...n.netPlan],
  };
}

/* ---------------------------------------------------------------- runtime */

interface Task {
  at: number;
  seq: number;
  pid: number | null;
  id: number;
  every: number | null;
  run: () => void;
}

export interface Rt {
  net: Net;
  ev: NetEvent[];
  host: Host;
  inst: Map<number, Instance>;
  listeners: Map<number, { pid: number; l: Listener }>;
  tasks: Task[];
  seq: number;
  rand: Map<number, number>;
  /** Live socket objects of Node code, by `${conn}:${side}`. */
  socks: Map<string, WsSocket>;
  /** Fragments put together so far, by `${conn}:${receiving side}`. */
  partial: Map<string, { opcode: number; parts: Uint8Array[]; size: number; frames: number }>;
  /** A sender midway through a fragmented message, by `${conn}:${sending side}`. */
  partialOut: Map<string, boolean>;
  redis: { pid: number; client: RedisClient }[];
  /** Deliveries waiting for a path that is cut (TCP keeps retrying them). */
  held: { conn: number; run: () => void }[];
  /** Sockets of Node clients still connecting, by pid. */
  connecting: Map<number, number>;
}

const conn = (net: Net, id: number) => net.conns.find((c) => c.id === id);
const procOf = (net: Net, pid: number) => net.procs.find((p) => p.pid === pid);

function schedule(rt: Rt, at: number, run: () => void, pid: number | null = null, every: number | null = null): number {
  const id = ++rt.seq;
  rt.tasks.push({ at, seq: id, pid, id, every, run });
  return id;
}

/** Seeded per process, so a reconnect with jitter replays the same way. */
function random(rt: Rt, pid: number) {
  let s = rt.rand.get(pid) ?? (pid * 7919) >>> 0;
  s = (s + 0x6d2b79f5) >>> 0;
  rt.rand.set(pid, s);
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function makeRt(net: Net): Rt {
  const rt: Rt = {
    net,
    ev: [],
    host: undefined as unknown as Host,
    inst: new Map(),
    listeners: new Map(),
    tasks: [],
    seq: 0,
    rand: new Map(),
    socks: new Map(),
    partial: new Map(),
    partialOut: new Map(),
    redis: [],
    held: [],
    connecting: new Map(),
  };
  rt.host = {
    now: () => rt.net.now,
    random: (pid) => random(rt, pid),
    log: (pid, text) => rt.ev.push({ type: "procLog", pid, text }),
    timer: (pid, ms, fn, every) => schedule(rt, rt.net.now + Math.max(0, ms), () => guard(rt.host, pid, fn), pid, every ? Math.max(1, ms) : null),
    clearTimer: (id) => {
      rt.tasks = rt.tasks.filter((t) => t.id !== id);
    },
    listen: (pid, port, l) => {
      if (portTaken(rt.net, port)) return `listen EADDRINUSE: address already in use :::${port}`;
      rt.listeners.set(port, { pid, l });
      const p = procOf(rt.net, pid);
      if (p && !p.ports.includes(port)) p.ports.push(port);
      return null;
    },
    unlisten: (pid, port) => {
      if (rt.listeners.get(port)?.pid === pid) rt.listeners.delete(port);
      const p = procOf(rt.net, pid);
      if (p) p.ports = p.ports.filter((x) => x !== port);
    },
    connect: (pid, url, opts, sock) => {
      rt.connecting.set(pid, (rt.connecting.get(pid) ?? 0) + 1);
      schedule(
        rt,
        rt.net.now + CONNECT_MS,
        () => {
          rt.connecting.set(pid, (rt.connecting.get(pid) ?? 1) - 1);
          if (sock.readyState === 3) return;
          procConnect(rt, pid, url, opts.headers, sock);
        },
        pid,
      );
    },
    send: (id, from, payload, o) => {
      const c = conn(rt.net, id);
      if (!c) return;
      const key = `${id}:${from}`;
      const opcode = o.opcode ?? (rt.partialOut.get(key) ? OP.cont : o.binary ? OP.binary : OP.text);
      if (o.opcode === undefined) {
        if (!o.fin) rt.partialOut.set(key, true);
        else rt.partialOut.delete(key);
      }
      transmit(rt, c, from, opcode, payload, o.fin);
    },
    close: (id, from, code, reason) => {
      const c = conn(rt.net, id);
      if (c) sendClose(rt, c, from, code, reason);
    },
    terminate: (id, from) => {
      const c = conn(rt.net, id);
      if (c) terminate(rt, c, from);
    },
    buffered: (id, from) => {
      const c = conn(rt.net, id);
      if (!c || from === "client") return 0;
      return c.queue.filter((q) => q.at > rt.net.now).reduce((n, q) => n + q.wire, 0);
    },
    redisConnect: (pid, client) => {
      if (!rt.net.redis) return false;
      rt.redis.push({ pid, client });
      return true;
    },
    redisPublish: (channel, message) => publish(rt, channel, message),
    readFile: (path) => rt.net.files[path.replace(/^\/home\/you\/chat\//, "").replace(/^\.\//, "")] ?? rt.net.files[path],
    writeFile: (path, text) => {
      rt.net.files[path.replace(/^\/home\/you\/chat\//, "").replace(/^\.\//, "")] = text;
    },
    exit: (pid, code) => endProc(rt, pid, { code, signal: null }),
    crash: (pid, err) => {
      if (err === EXIT) return;
      rt.ev.push({ type: "procCrashed", pid, text: crashText(err) });
      endProc(rt, pid, { code: 1, signal: null });
    },
  };
  return rt;
}

/**
 * The runtime for a state. The run's own when this state is the newest it reached; otherwise a
 * fresh one, rebuilt by replaying how this state was made. Either way, applying an action to any
 * state gives the same result.
 */
function runtimeFor(net: Net): Rt {
  if (net.rt && net.rt.net === net) return net.rt;
  if (net.origin) return simulate(net.origin.actions, net.origin.base).states.at(-1)!.rt!;
  return makeRt(net);
}

const portTaken = (net: Net, port: number) =>
  port === API_PORT ||
  port === WS_PORT ||
  port === REDIS_PORT ||
  (port === NGINX_PORT && net.nginx !== null) ||
  Boolean(net.rt?.listeners.has(port));

/* ------------------------------------------------------------- processes */

function startProc(rt: Rt, a: { file: string; code?: string; env?: Record<string, string>; args?: string[] }) {
  const net = rt.net;
  const code = a.code ?? net.files[a.file];
  if (code === undefined) {
    rt.ev.push({
      type: "procFailed",
      file: a.file,
      text: `node:internal/modules/cjs/loader:1228\n  throw err;\n  ^\n\nError: Cannot find module '/home/you/chat/${a.file}'\n  code: 'MODULE_NOT_FOUND'\n\nNode.js v22.12.0`,
    });
    return;
  }
  const pid = net.nextPid++;
  const proc: Proc = { pid, file: a.file, kind: "node", code, env: a.env ?? {}, args: a.args ?? [], alive: true, startedAt: net.now, ports: [], exit: null, capture: null };
  net.procs.push(proc);
  const before = rt.ev.length;
  const inst = load(rt.host, pid, code, a.file, proc.env, proc.args);
  rt.inst.set(pid, inst);
  const logs = rt.ev.splice(before).flatMap((e) => (e.type === "procLog" ? [e.text] : []));
  if (inst.crash) {
    rt.ev.push({ type: "procFailed", file: a.file, text: [...logs, inst.crash].join("\n") });
    proc.alive = false;
    proc.exit = { code: 1, signal: null };
    dropProcState(rt, pid);
    return;
  }
  if (!proc.alive) {
    // process.exit() while loading.
    for (const l of logs) rt.ev.push({ type: "procLog", pid, text: l });
    return;
  }
  rt.ev.push({ type: "procStarted", pid, file: a.file, port: proc.ports[0] ?? null, logs });
}

function dropProcState(rt: Rt, pid: number) {
  rt.tasks = rt.tasks.filter((t) => t.pid !== pid);
  for (const [port, l] of [...rt.listeners]) if (l.pid === pid) rt.listeners.delete(port);
  rt.redis = rt.redis.filter((r) => r.pid !== pid);
  const p = procOf(rt.net, pid);
  if (p) p.ports = [];
}

/** A process ends: its sockets close (the other ends see 1006), its ports free up. */
function endProc(rt: Rt, pid: number, how: { code: number | null; signal: string | null }) {
  const p = procOf(rt.net, pid);
  if (!p || !p.alive) return;
  p.alive = false;
  p.exit = how;
  dropProcState(rt, pid);
  for (const c of rt.net.conns) {
    if (c.server === `proc:${pid}` && c.serverClosedAt === null) terminate(rt, c, "server");
    if (c.client === `proc:${pid}` && c.closedAt === null) terminate(rt, c, "client");
  }
  if (how.signal) rt.ev.push({ type: "procStopped", pid, signal: how.signal });
  else rt.ev.push({ type: "procExited", pid, code: how.code ?? 0 });
}

/** Node exits once nothing is left to wait for. */
function exitIdle(rt: Rt) {
  for (const p of rt.net.procs) {
    if (!p.alive || p.kind !== "node") continue;
    const busy =
      [...rt.listeners.values()].some((l) => l.pid === p.pid) ||
      rt.tasks.some((t) => t.pid === p.pid) ||
      (rt.connecting.get(p.pid) ?? 0) > 0 ||
      rt.redis.some((r) => r.pid === p.pid && r.client.status !== "end") ||
      rt.net.conns.some((c) => c.client === `proc:${p.pid}` && c.closedAt === null);
    if (!busy) endProc(rt, p.pid, { code: 0, signal: null });
  }
}

function signal(rt: Rt, pid: number, sig: "TERM" | "KILL" | "INT") {
  const p = procOf(rt.net, pid);
  if (!p || !p.alive) return;
  if (p.kind === "tshark") {
    rt.ev.push({ type: "captured", pid, lines: ["", `${p.capture?.count ?? 0} packet${p.capture?.count === 1 ? "" : "s"} captured`] });
    p.alive = false;
    p.exit = { code: 0, signal: sig };
    rt.ev.push({ type: "procStopped", pid, signal: sig });
    return;
  }
  const handlers = rt.inst.get(pid)?.signals.get(`SIG${sig}`) ?? [];
  if (sig !== "KILL" && handlers.length) {
    // A handler replaces Node's default: the process goes on until it exits itself.
    for (const h of handlers) guard(rt.host, pid, h);
    return;
  }
  endProc(rt, pid, { code: null, signal: sig });
}

/* -------------------------------------------------------------- the API */

function finish(rt: Rt, ex: Exchange, status: number, statusText: string, headers: [string, string][], body: string) {
  const net = rt.net;
  ex.status = status;
  ex.statusText = statusText;
  ex.respHeaders = headers;
  ex.respBody = ex.method === "HEAD" ? "" : body;
  ex.doneAt = net.now;
  ex.end = "done";
  rt.ev.push({ type: "answered", id: ex.id, status, empty: ex.empty, delivered: ex.delivered });
  if (ex.proxyFor !== null) {
    const down = net.exchanges.find((e) => e.id === ex.proxyFor);
    if (down && down.doneAt === null) {
      down.empty = ex.empty;
      down.delivered = [...ex.delivered];
      if (down.client !== "nginx") markSeen(net, down.delivered);
      finish(rt, down, status, statusText, nginxHeaders(rt, ex.respHeaders), body);
    }
  }
}

const expressTail = (net: Net): [string, string][] => [
  ["Date", httpDate(net.now)],
  ["Connection", "keep-alive"],
  ["Keep-Alive", "timeout=5"],
];

function sendJson(rt: Rt, ex: Exchange, status: number, statusText: string, value: unknown) {
  const body = JSON.stringify(value);
  const headers: [string, string][] = [
    ["X-Powered-By", "Express"],
    ["Content-Type", "application/json; charset=utf-8"],
    ["Content-Length", String(bytesOf(body))],
    ["ETag", etag(body)],
    ...expressTail(rt.net),
  ];
  finish(rt, ex, status, statusText, headers, body);
}

function deliverList(rt: Rt, ex: Exchange, list: ChatMessage[], status: number) {
  ex.delivered = ex.method === "HEAD" ? [] : list.map((m) => m.id);
  ex.empty = list.length === 0;
  if (ex.method !== "HEAD" && ex.client !== "nginx") markSeen(rt.net, ex.delivered);
  sendJson(rt, ex, status, "OK", list.map(msgJson));
}

function markSeen(net: Net, ids: number[]) {
  for (const id of ids) if (net.seen[id] === undefined) net.seen[id] = net.now;
}

const HELP = `Team chat API
  GET  /messages?after=<id>                  messages after an id (polling)
  GET  /messages?after=<id>&wait=<seconds>   wait for one (long polling, at most ${MAX_WAIT_S} s)
  POST /messages  {"text": "..."}            write one (Content-Type: application/json)
  GET  /events                               server-sent events; resume with Last-Event-ID
WebSocket: ws://localhost:${WS_PORT}  send {"type":"chat","text":"..."}
`;

function notFound(rt: Rt, ex: Exchange) {
  const body = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot ${ex.method} ${ex.path}</pre>\n</body>\n</html>\n`;
  finish(
    rt,
    ex,
    404,
    "Not Found",
    [
      ["X-Powered-By", "Express"],
      ["Content-Security-Policy", "default-src 'none'"],
      ["X-Content-Type-Options", "nosniff"],
      ["Content-Type", "text/html; charset=utf-8"],
      ["Content-Length", String(bytesOf(body))],
      ...expressTail(rt.net),
    ],
    body,
  );
}

const wholeNumber = (s: string | undefined) => (s !== undefined && /^\d+$/.test(s) ? Number(s) : null);

/** The Express API on :8080. */
function handleApi(rt: Rt, ex: Exchange, upgrade: boolean) {
  const net = rt.net;
  // No `upgrade` listener on this server: Node destroys the socket.
  if (upgrade) return drop(rt, ex);
  const get = ex.method === "GET" || ex.method === "HEAD";
  if (get && ex.path === "/") {
    finish(
      rt,
      ex,
      200,
      "OK",
      [["X-Powered-By", "Express"], ["Content-Type", "text/plain; charset=utf-8"], ["Content-Length", String(bytesOf(HELP))], ["ETag", etag(HELP)], ...expressTail(net)],
      HELP,
    );
    return;
  }
  if (get && ex.path === "/messages") {
    const after = ex.query.after === undefined ? 0 : wholeNumber(ex.query.after);
    if (after === null) return sendJson(rt, ex, 400, "Bad Request", { error: "after must be a message id (a whole number)" });
    ex.after = after;
    const list = net.messages.filter((m) => m.id > after);
    if (ex.query.wait === undefined) {
      ex.kind = "poll";
      return deliverList(rt, ex, list, 200);
    }
    const wait = wholeNumber(ex.query.wait);
    if (wait === null) return sendJson(rt, ex, 400, "Bad Request", { error: "wait must be a number of seconds" });
    ex.kind = "longpoll";
    if (list.length > 0 || wait === 0) return deliverList(rt, ex, list, 200);
    ex.holdUntil = net.now + Math.min(wait, MAX_WAIT_S) * 1000;
    rt.ev.push({ type: "held", id: ex.id, kind: "longpoll" });
    return;
  }
  if (ex.method === "POST" && ex.path === "/messages") {
    ex.kind = "post";
    const type = header(ex.headers, "content-type") ?? "";
    if (!type.toLowerCase().startsWith("application/json")) {
      return sendJson(rt, ex, 415, "Unsupported Media Type", { error: "send JSON with Content-Type: application/json" });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(ex.body);
    } catch {
      return sendJson(rt, ex, 400, "Bad Request", { error: "the body is not valid JSON" });
    }
    const text = (parsed as { text?: unknown })?.text;
    if (typeof text !== "string" || !text.trim()) return sendJson(rt, ex, 400, "Bad Request", { error: "text is required" });
    // The answer goes out after the message is stored, so long polls and streams hear it first.
    const msg = post(rt, "you", text, "post");
    return sendJson(rt, ex, 201, "Created", msgJson(msg));
  }
  if (get && ex.path === "/events") {
    ex.kind = "sse";
    ex.status = 200;
    ex.statusText = "OK";
    ex.respHeaders = [
      ["X-Powered-By", "Express"],
      ["Content-Type", "text/event-stream"],
      ["Cache-Control", "no-cache"],
      ["Connection", "keep-alive"],
      ["Date", httpDate(net.now)],
      ["Transfer-Encoding", "chunked"],
    ];
    const last = wholeNumber(header(ex.headers, "last-event-id"));
    ex.after = last ?? net.messages.length;
    rt.ev.push({ type: "held", id: ex.id, kind: "sse" });
    // A client that says where it stopped gets what it missed first.
    if (last !== null) for (const m of net.messages.filter((x) => x.id > last)) stream(rt, ex, m);
    return;
  }
  notFound(rt, ex);
}

function stream(rt: Rt, ex: Exchange, m: ChatMessage) {
  if (ex.method === "HEAD") return;
  ex.respBody += sseEvent(m);
  ex.delivered.push(m.id);
  markSeen(rt.net, [m.id]);
  rt.ev.push({ type: "streamed", id: ex.id, msg: m.id });
}

/* ------------------------------------------------------- the handshake */

/** What the ws library writes when it turns a handshake down. */
function abortHandshake(rt: Rt, ex: Exchange, status: number, statusText: string, message: string, extra: [string, string][] = []) {
  finish(rt, ex, status, statusText, [["Connection", "close"], ["Content-Type", "text/html"], ["Content-Length", String(bytesOf(message))], ...extra], message);
}

const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  405: "Method Not Allowed",
  426: "Upgrade Required",
  429: "Too Many Requests",
  503: "Service Unavailable",
};

/** How a ws server answers a request before accepting it; true means "go on". */
function wsChecks(rt: Rt, ex: Exchange, upgrade: boolean, ownServer: boolean): boolean {
  if (!upgrade) {
    if (!ownServer) {
      // ws attached to someone else's HTTP server: a plain request is that server's to answer.
      waitForever(rt, ex);
      return false;
    }
    // `new WebSocketServer({ port })` makes its own HTTP server, and it answers every plain request this way.
    const body = "Upgrade Required";
    finish(rt, ex, 426, "Upgrade Required", [["Content-Length", String(body.length)], ["Content-Type", "text/plain"], ...expressTail(rt.net)], body);
    return false;
  }
  ex.kind = "upgrade";
  const key = header(ex.headers, "sec-websocket-key");
  const up = header(ex.headers, "upgrade");
  const version = Number(header(ex.headers, "sec-websocket-version"));
  if (ex.method !== "GET") abortHandshake(rt, ex, 405, "Method Not Allowed", "Invalid HTTP method");
  else if (up === undefined || up.toLowerCase() !== "websocket") abortHandshake(rt, ex, 400, "Bad Request", "Invalid Upgrade header");
  else if (!validKey(key)) abortHandshake(rt, ex, 400, "Bad Request", "Missing or invalid Sec-WebSocket-Key header");
  else if (version !== 13 && version !== 8) abortHandshake(rt, ex, 400, "Bad Request", "Missing or invalid Sec-WebSocket-Version header", [["Sec-WebSocket-Version", "13, 8"]]);
  else return true;
  return false;
}

/** Node leaves a request nobody answers waiting. */
function waitForever(rt: Rt, ex: Exchange) {
  rt.ev.push({ type: "held", id: ex.id, kind: "other" });
}

function accept101(rt: Rt, ex: Exchange) {
  finish(rt, ex, 101, "Switching Protocols", [
    ["Upgrade", "websocket"],
    ["Connection", "Upgrade"],
    ["Sec-WebSocket-Accept", acceptFor(header(ex.headers, "sec-websocket-key")!)],
  ], "");
}

/** Where a successful handshake lands: which server holds the other end, and through which port. */
interface Landing {
  server: string;
  upstream: number;
  via: number | null;
  idleTimeout: number | null;
}

/** Routes a request to whatever listens on its port. */
function serve(rt: Rt, ex: Exchange): Landing | null {
  const net = rt.net;
  const upgrade = isUpgrade(ex.headers) && ex.httpVersion === "1.1";
  if (net.blocked.includes(ex.port) || net.down.includes(ex.client)) {
    // The packets go nowhere: the client waits until it gives up.
    waitForever(rt, ex);
    return null;
  }
  if (ex.port === API_PORT) {
    handleApi(rt, ex, upgrade);
    return null;
  }
  if (ex.port === WS_PORT) {
    if (!wsChecks(rt, ex, upgrade, true)) return null;
    accept101(rt, ex);
    return { server: "chat", upstream: WS_PORT, via: null, idleTimeout: null };
  }
  if (ex.port === NGINX_PORT && net.nginx) return proxy(rt, ex);
  const listener = rt.listeners.get(ex.port);
  if (listener) {
    const { pid, l } = listener;
    if (l.kind === "ws") return acceptWs(rt, ex, pid, l.wss, upgrade, true);
    if (l.server.wss) return acceptWs(rt, ex, pid, l.server.wss, upgrade, false);
    if (upgrade) return rawUpgrade(rt, ex, pid, l.server);
    if (l.server.listenerCount("request") > 0) return plainRequest(rt, ex, pid, l.server);
    waitForever(rt, ex);
    return null;
  }
  ex.doneAt = net.now;
  ex.end = "refused";
  rt.ev.push({ type: "ended", id: ex.id, end: "refused" });
  if (ex.proxyFor !== null) {
    const down = net.exchanges.find((e) => e.id === ex.proxyFor);
    if (down && down.doneAt === null) badGateway(rt, down);
  }
  return null;
}

function drop(rt: Rt, ex: Exchange) {
  ex.doneAt = rt.net.now;
  ex.end = "dropped";
  rt.ev.push({ type: "ended", id: ex.id, end: "dropped" });
  if (ex.proxyFor !== null) {
    const down = rt.net.exchanges.find((e) => e.id === ex.proxyFor);
    if (down && down.doneAt === null) badGateway(rt, down);
  }
}

function badGateway(rt: Rt, ex: Exchange) {
  const body = nginxPage(502, "Bad Gateway");
  finish(rt, ex, 502, "Bad Gateway", [["Server", NGINX_VERSION], ["Date", httpDate(rt.net.now)], ["Content-Type", "text/html"], ["Content-Length", String(bytesOf(body))], ["Connection", "keep-alive"]], body);
}

const fakeReq = (ex: Exchange) => ({
  method: ex.method,
  url: ex.target,
  httpVersion: ex.httpVersion,
  headers: Object.fromEntries(ex.headers.map(([k, v]) => [k.toLowerCase(), v])),
  socket: { remoteAddress: "::ffff:127.0.0.1", remotePort: 50000 + ex.id },
});

/** A ws server in the reader's code: the library's checks, verifyClient, then 101. */
function acceptWs(rt: Rt, ex: Exchange, pid: number, wss: WsServer, upgrade: boolean, ownServer: boolean): Landing | null {
  if (wss.closed) {
    drop(rt, ex);
    return null;
  }
  if (!wsChecks(rt, ex, upgrade, ownServer)) return null;
  const verify = wss.opts.verifyClient;
  if (verify) {
    const info = { origin: header(ex.headers, "origin"), secure: false, req: fakeReq(ex) };
    let verdict: { ok: boolean; code: number; message?: string } | null = null;
    guard(rt.host, pid, () => {
      if (verify.length >= 2) verify(info, (ok, code = 401, message) => (verdict = { ok, code, message }));
      else verdict = { ok: Boolean(verify(info)), code: 401 };
    });
    const v = verdict as { ok: boolean; code: number; message?: string } | null;
    if (!procOf(rt.net, pid)?.alive) {
      drop(rt, ex);
      return null;
    }
    if (!v || !v.ok) {
      const code = v?.code ?? 401;
      const text = STATUS_TEXT[code] ?? "Unauthorized";
      abortHandshake(rt, ex, code, text, v?.message ?? text);
      return null;
    }
  }
  accept101(rt, ex);
  return { server: `proc:${pid}`, upstream: ex.port, via: null, idleTimeout: null };
}

interface EmitterLike {
  emit: (e: string, ...a: unknown[]) => boolean;
  listenerCount: (e: string) => number;
}

/** A hand-written handshake: the reader's `upgrade` handler writes the answer to the socket itself. */
function rawUpgrade(rt: Rt, ex: Exchange, pid: number, server: EmitterLike): Landing | null {
  ex.kind = "upgrade";
  if (server.listenerCount("upgrade") === 0) {
    drop(rt, ex);
    return null;
  }
  let raw = "";
  const socket = {
    write: (s: unknown) => {
      raw += s instanceof Uint8Array ? String.fromCharCode(...s) : String(s);
      return true;
    },
    end: (s?: unknown) => {
      if (s !== undefined) raw += String(s);
    },
    destroy: () => {},
    on: () => socket,
    setTimeout: () => socket,
    setNoDelay: () => socket,
  };
  guard(rt.host, pid, () => server.emit("upgrade", fakeReq(ex), socket, asBuffer(new Uint8Array())));
  const end = raw.indexOf("\r\n\r\n");
  const head = (end < 0 ? raw : raw.slice(0, end)).split("\r\n");
  const m = /^HTTP\/1\.[01] (\d{3}) ?(.*)$/.exec(head[0] ?? "");
  if (!m) {
    drop(rt, ex);
    return null;
  }
  const headers: [string, string][] = [];
  for (const line of head.slice(1)) {
    const i = line.indexOf(":");
    if (i > 0) headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  finish(rt, ex, Number(m[1]), m[2] ?? "", headers, end < 0 ? "" : raw.slice(end + 4));
  return Number(m[1]) === 101 ? { server: `proc:${pid}`, upstream: ex.port, via: null, idleTimeout: null } : null;
}

function plainRequest(rt: Rt, ex: Exchange, pid: number, server: EmitterLike): Landing | null {
  const headers: [string, string][] = [];
  let body = "";
  let ended = false;
  const res = {
    statusCode: 200,
    setHeader: (k: string, v: unknown) => headers.push([k, String(v)]),
    writeHead: (s: number, h?: Record<string, unknown>) => {
      res.statusCode = s;
      for (const [k, v] of Object.entries(h ?? {})) headers.push([k, String(v)]);
      return res;
    },
    write: (s: unknown) => {
      body += String(s);
      return true;
    },
    end: (s?: unknown) => {
      if (s !== undefined) body += String(s);
      ended = true;
    },
  };
  guard(rt.host, pid, () => server.emit("request", fakeReq(ex), res));
  if (!ended) {
    waitForever(rt, ex);
    return null;
  }
  finish(rt, ex, res.statusCode, STATUS_TEXT[res.statusCode] ?? "OK", [...headers, ["Date", httpDate(rt.net.now)], ["Content-Length", String(bytesOf(body))]], body);
  return null;
}

/* ------------------------------------------------------------------ nginx */

function nginxHeaders(rt: Rt, upstream: [string, string][]): [string, string][] {
  const skip = new Set(["date", "connection", "keep-alive", "x-powered-by"]);
  const out: [string, string][] = [["Server", NGINX_VERSION], ["Date", httpDate(rt.net.now)]];
  for (const [k, v] of upstream) if (!skip.has(k.toLowerCase())) out.push([k, v]);
  out.push(["Connection", header(upstream, "upgrade") ? "upgrade" : "keep-alive"]);
  return out;
}

function proxy(rt: Rt, ex: Exchange): Landing | null {
  const conf = rt.net.nginx!.conf;
  const loc = pickLocation(conf, ex.path);
  if (!loc || !loc.proxyPass) {
    const body = nginxPage(404, "Not Found");
    finish(rt, ex, 404, "Not Found", [["Server", NGINX_VERSION], ["Date", httpDate(rt.net.now)], ["Content-Type", "text/html"], ["Content-Length", String(bytesOf(body))], ["Connection", "keep-alive"]], body);
    return null;
  }
  const rest = ex.target.slice(loc.path.length);
  const target = loc.proxyPass.path ? `${loc.proxyPass.path.replace(/\/$/, "")}/${rest.replace(/^\//, "")}` : ex.target;
  const up = newExchange(rt.net, {
    client: "nginx",
    port: loc.proxyPass.port,
    method: ex.method,
    target,
    headers: upstreamHeaders(loc, ex.headers, loc.proxyPass.port),
    body: ex.body,
  });
  up.httpVersion = loc.httpVersion;
  up.proxyFor = ex.id;
  const landed = serve(rt, up);
  if (landed && up.status === 101 && isUpgrade(ex.headers)) {
    return { server: landed.server, upstream: landed.upstream, via: NGINX_PORT, idleTimeout: loc.readTimeout };
  }
  return null;
}

/* --------------------------------------------------------------- sockets */

function openSocket(rt: Rt, ex: Exchange, landing: Landing, client: Client, extra: { interactive?: boolean; readRate?: number; sock?: WsSocket; reopen?: Extract<NetAction, { type: "wsOpen" }> }): WsConn {
  const net = rt.net;
  const c: WsConn = {
    id: net.conns.length + 1,
    client,
    port: ex.port,
    upstream: landing.upstream,
    server: landing.server,
    via: landing.via,
    key: header(ex.headers, "sec-websocket-key") ?? "",
    accept: header(ex.respHeaders, "sec-websocket-accept") ?? "",
    exchange: ex.id,
    interactive: extra.interactive ?? false,
    origin: header(ex.headers, "origin") ?? null,
    openedAt: net.now,
    closedAt: null,
    closeCode: null,
    closeReason: "",
    serverClosedAt: null,
    serverCode: null,
    serverReason: "",
    sentClose: { client: false, server: false },
    frames: [],
    msgs: [],
    readRate: extra.readRate ?? null,
    queue: [],
    drainAt: net.now,
    lastFromServer: net.now,
    idleTimeout: landing.idleTimeout,
    reopen: extra.reopen ?? null,
  };
  net.conns.push(c);
  rt.ev.push({ type: "wsOpened", conn: c.id, port: ex.port, client });
  if (c.idleTimeout !== null) watchIdle(rt, c.id, net.now + c.idleTimeout);
  // The client's side first: its socket is open the moment the 101 checks out.
  if (extra.sock) {
    extra.sock.conn = c.id;
    extra.sock.readyState = 1;
    rt.socks.set(`${c.id}:client`, extra.sock);
  }
  // The server's side: a socket object for the reader's code, and its 'connection' event.
  if (landing.server.startsWith("proc:")) {
    const pid = Number(landing.server.slice(5));
    const listener = rt.listeners.get(landing.upstream);
    const wss = listener && (listener.l.kind === "ws" ? listener.l.wss : listener.l.server.wss);
    if (wss) {
      const sock = new WsSocket(rt.host, pid, "server");
      sock.conn = c.id;
      sock.readyState = 1;
      rt.socks.set(`${c.id}:server`, sock);
      if (wss.opts.clientTracking !== false) wss.clients.add(sock);
      const upstreamEx = net.exchanges.find((e) => e.proxyFor === ex.id) ?? ex;
      guard(rt.host, pid, () => wss.emit("connection", sock, fakeReq(upstreamEx)));
    }
  }
  if (extra.sock) {
    const pid = Number(client.slice(5));
    const sock = extra.sock;
    if (sock.readyState === 1) guard(rt.host, pid, () => sock.emit("open"));
  }
  return c;
}

/** What a WebSocket client checks before it calls a handshake good, in the ws library's words. */
function clientCheck(ex: Exchange, key: string): string | null {
  if (ex.end === "refused") return `connect ECONNREFUSED 127.0.0.1:${ex.port}`;
  if (ex.end === "dropped" || ex.status === null) return ex.doneAt === null ? "connect ETIMEDOUT" : "socket hang up";
  if (ex.status !== 101) return `Unexpected server response: ${ex.status}`;
  if ((header(ex.respHeaders, "upgrade") ?? "").toLowerCase() !== "websocket") return "Invalid Upgrade header";
  if (header(ex.respHeaders, "sec-websocket-accept") !== acceptFor(key)) return "Invalid Sec-WebSocket-Accept header";
  return null;
}

/** The key the next WebSocket connection will send. */
export const nextKey = (net: Net) => toBase64(seededBytes(net.draws + 1, 16));

/** The newest connection a client still has open. */
export function openConn(net: Net, client: Client) {
  return [...net.conns].reverse().find((c) => c.client === client && c.closedAt === null);
}

/** The terminal's interactive wscat session, if one is open. */
export const wscatConn = (net: Net) => [...net.conns].reverse().find((c) => c.client === "you" && c.interactive && c.closedAt === null);

function parseWsUrl(url: string): { port: number; target: string; secure: boolean } | null {
  const m = /^(wss?|https?):\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::(\d+))?(\/[^#]*)?$/i.exec(url);
  if (!m) return null;
  const secure = /^(wss|https)$/i.test(m[1]!);
  return { port: m[2] ? Number(m[2]) : secure ? 443 : 80, target: m[3] ?? "/", secure };
}

/** A Node client's `new WebSocket(url)`, once its connection is set up. */
function procConnect(rt: Rt, pid: number, url: string, headers: [string, string][], sock: WsSocket) {
  const net = rt.net;
  const fail = (reason: string) => {
    sock.readyState = 3;
    rt.ev.push({ type: "wsFailed", port: 0, reason, client: `proc:${pid}` });
    guard(rt.host, pid, () => {
      sock.emit("error", Object.assign(new Error(reason), { code: reason.split(" ")[1] }));
    });
    if (procOf(net, pid)?.alive) guard(rt.host, pid, () => sock.emit("close", 1006, asBuffer(new Uint8Array())));
  };
  const u = parseWsUrl(url);
  if (!u) return fail(`Invalid URL: ${url}`);
  if (u.secure) return fail("write EPROTO SSL routines:ssl3_get_record:wrong version number");
  net.draws++;
  const key = toBase64(seededBytes(net.draws, 16));
  const ex = newExchange(net, {
    client: `proc:${pid}`,
    port: u.port,
    method: "GET",
    target: u.target,
    headers: [
      ["Sec-WebSocket-Version", "13"],
      ["Sec-WebSocket-Key", key],
      ["Connection", "Upgrade"],
      ["Upgrade", "websocket"],
      ["Sec-WebSocket-Extensions", "permessage-deflate; client_max_window_bits"],
      ["Host", `localhost:${u.port}`],
      ...headers,
    ],
  });
  ex.kind = "upgrade";
  rt.ev.push({ type: "sent", id: ex.id, client: ex.client, kind: "upgrade", port: u.port, method: "GET", target: u.target });
  const landing = serve(rt, ex);
  if (ex.doneAt === null && !landing) {
    // Packets dropped: the ws client has no timeout of its own; TCP gives up after about two minutes.
    rt.connecting.set(pid, (rt.connecting.get(pid) ?? 0) + 1);
    schedule(
      rt,
      net.now + 130_000,
      () => {
        rt.connecting.set(pid, (rt.connecting.get(pid) ?? 1) - 1);
        if (sock.readyState === 0) fail("connect ETIMEDOUT");
      },
      pid,
    );
    return;
  }
  const failed = clientCheck(ex, key);
  if (failed || !landing) return fail(failed ?? "socket hang up");
  openSocket(rt, ex, landing, `proc:${pid}`, { sock });
}

/* ---------------------------------------------------------------- frames */

const cut = (net: Net, c: WsConn) => net.blocked.includes(c.port) || net.blocked.includes(c.upstream) || net.down.includes(c.client);

const endClosed = (c: WsConn, side: "client" | "server") => (side === "client" ? c.closedAt !== null : c.serverClosedAt !== null);

function payloadText(opcode: number, payload: Uint8Array, binary: boolean): string {
  if (opcode === OP.close) {
    const r = readClose(payload);
    return r.code === null ? "" : `${r.code}${r.reason ? ` ${r.reason}` : ""}`;
  }
  if (binary) return payload.length > 48 ? `${toHex(payload.subarray(0, 48))}…` : toHex(payload);
  return payload.length > 600 ? `${fromUtf8(payload.subarray(0, 600))}…` : fromUtf8(payload);
}

/** Puts a frame on the wire from one end; the other end gets it when the path lets it through. */
function transmit(rt: Rt, c: WsConn, from: "client" | "server", opcode: number, payload: Uint8Array, fin: boolean) {
  const net = rt.net;
  if (endClosed(c, from)) return;
  const masked = from === "client";
  net.draws++;
  const mask = masked ? toHex(seededBytes(net.draws + 7_000, 4)) : null;
  const to = from === "client" ? "server" : "client";
  const partial = rt.partial.get(`${c.id}:${to}`);
  const binary = opcode === OP.binary || (opcode === OP.cont && partial?.opcode === OP.binary);
  const frame: WsFrame = {
    at: net.now,
    dir: from === "client" ? "out" : "in",
    text: payloadText(opcode, payload, binary),
    opcode,
    fin,
    masked,
    mask,
    size: payload.length,
    wire: wireSize(payload.length, masked),
    lost: false,
  };
  c.frames.push(frame);
  const held = cut(net, c);
  rt.ev.push({ type: "frame", conn: c.id, dir: frame.dir, text: frame.text, opcode, fin, size: frame.size, held });
  capture(rt, c, frame);
  if (from === "server") c.lastFromServer = net.now;
  const index = c.frames.length - 1;
  const deliver = () => {
    const now = conn(rt.net, c.id);
    if (!now || endClosed(now, to)) {
      if (now?.frames[index]) now.frames[index] = { ...now.frames[index]!, lost: true };
      return;
    }
    receive(rt, c.id, to, opcode, payload, fin);
  };
  if (held) {
    rt.held.push({ conn: c.id, run: deliver });
    return;
  }
  if (from === "server" && c.readRate) {
    const at = Math.max(net.now, c.drainAt) + Math.ceil((frame.wire * 1000) / c.readRate);
    c.drainAt = at;
    c.queue.push({ at, wire: frame.wire });
    schedule(rt, at, deliver);
  } else schedule(rt, net.now, deliver);
}

/** One end gets a frame. */
function receive(rt: Rt, id: number, to: "client" | "server", opcode: number, payload: Uint8Array, fin: boolean) {
  const net = rt.net;
  const c = conn(net, id);
  if (!c || endClosed(c, to)) return;
  const sock = rt.socks.get(`${c.id}:${to}`);
  const pid = sock?.pid ?? null;
  const other = to === "client" ? "server" : "client";
  if (opcode === OP.ping) {
    // Every WebSocket implementation answers a ping on its own; browser code never sees it.
    if (sock && pid !== null) guard(rt.host, pid, () => sock.emit("ping", asBuffer(payload)));
    transmit(rt, c, to, OP.pong, payload, true);
    return;
  }
  if (opcode === OP.pong) {
    if (sock && pid !== null) guard(rt.host, pid, () => sock.emit("pong", asBuffer(payload)));
    return;
  }
  if (opcode === OP.close) {
    const { code, reason } = readClose(payload);
    if (!c.sentClose[to]) {
      // The answer echoes the status code, as ws does.
      c.sentClose[to] = true;
      if (sock) sock.readyState = 2;
      transmit(rt, c, to, OP.close, closePayload(code, ""), true);
    }
    endClose(rt, c, to, code ?? 1005, reason);
    void other;
    return;
  }
  // Data: put fragments together; the message is whole at FIN.
  const key = `${c.id}:${to}`;
  const part = rt.partial.get(key) ?? { opcode, parts: [], size: 0, frames: 0 };
  part.parts.push(payload);
  part.size += payload.length;
  part.frames++;
  // A ws server checks the size against maxPayload as frames arrive.
  const wss = to === "server" && c.server.startsWith("proc:") ? wssFor(rt, c) : null;
  if (wss && part.size > wss.maxPayload) {
    rt.partial.delete(key);
    tooBig(rt, c, sock);
    return;
  }
  if (!fin) {
    rt.partial.set(key, part);
    return;
  }
  rt.partial.delete(key);
  const all = new Uint8Array(part.size);
  let at = 0;
  for (const p of part.parts) {
    all.set(p, at);
    at += p.length;
  }
  const binary = part.opcode === OP.binary;
  const text = binary ? toHex(all.subarray(0, 64)) : fromUtf8(all.length > 2000 ? all.subarray(0, 2000) : all);
  const dir = to === "server" ? "out" : "in";
  c.msgs.push({ at: net.now, dir, text, binary, size: all.length, frames: part.frames });
  rt.ev.push({ type: "message", conn: c.id, dir, text, binary, client: c.client });
  if (to === "client") {
    if (!binary && c.server === "chat") {
      try {
        const m = JSON.parse(text) as { type?: string; id?: number };
        if (m.type === "message" && typeof m.id === "number") markSeen(net, [m.id]);
      } catch {
        /* not JSON: nothing to mark */
      }
    }
  } else if (c.server === "chat") chatReply(rt, c, text);
  if (sock && pid !== null) guard(rt.host, pid, () => sock.emit("message", asBuffer(all), binary));
}

function wssFor(rt: Rt, c: WsConn): WsServer | null {
  const l = rt.listeners.get(c.upstream);
  if (l && `proc:${l.pid}` === c.server) return l.l.kind === "ws" ? l.l.wss : l.l.server.wss;
  for (const { pid, l: x } of rt.listeners.values()) {
    if (`proc:${pid}` !== c.server) continue;
    const w = x.kind === "ws" ? x.wss : x.server.wss;
    if (w) return w;
  }
  return null;
}

/** ws's answer to a message over maxPayload: close 1009, and an 'error' on the socket. */
function tooBig(rt: Rt, c: WsConn, sock: WsSocket | undefined) {
  if (sock) sock.readyState = 2;
  sendClose(rt, c, "server", 1009, "");
  if (sock) {
    const err = Object.assign(new RangeError("Max payload size exceeded"), { code: "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH" });
    guard(rt.host, sock.pid, () => sock.emit("error", err));
  }
}

/** One end starts the closing handshake. */
function sendClose(rt: Rt, c: WsConn, from: "client" | "server", code: number | null, reason: string) {
  if (c.sentClose[from] || endClosed(c, from)) return;
  c.sentClose[from] = true;
  transmit(rt, c, from, OP.close, closePayload(code, reason), true);
  // If the other end never answers, ws gives up and drops the connection.
  schedule(rt, rt.net.now + CLOSE_TIMEOUT_MS, () => {
    const now = conn(rt.net, c.id);
    if (now && !endClosed(now, from)) terminate(rt, now, from);
  });
}

/** One end is finished with the connection: its 'close' fires with the code it saw. */
function endClose(rt: Rt, c: WsConn, side: "client" | "server", code: number, reason: string) {
  if (endClosed(c, side)) return;
  const net = rt.net;
  if (side === "client") {
    c.closedAt = net.now;
    c.closeCode = code;
    c.closeReason = reason;
  } else {
    c.serverClosedAt = net.now;
    c.serverCode = code;
    c.serverReason = reason;
  }
  rt.ev.push({ type: "wsClosed", conn: c.id, code, side, reason, client: c.client });
  // Whatever was still queued for this connection is freed with it.
  c.queue = c.queue.filter((q) => q.at <= net.now);
  if (side === "client" && c.reopen) {
    const again = c.reopen;
    schedule(rt, net.now + (again.reconnect ?? 1000), () => openRemote(rt, again));
  }
  const sock = rt.socks.get(`${c.id}:${side}`);
  if (sock) {
    sock.readyState = 3;
    rt.socks.delete(`${c.id}:${side}`);
    if (side === "server") wssFor(rt, c)?.clients.delete(sock);
    if (procOf(net, sock.pid)?.alive) guard(rt.host, sock.pid, () => sock.emit("close", code, asBuffer(utf8(reason))));
  }
}

/** One end drops the TCP connection with no close frame (terminate(), a crash, a timeout). */
function terminate(rt: Rt, c: WsConn, side: "client" | "server") {
  if (endClosed(c, side)) return;
  endClose(rt, c, side, 1006, "");
  const other = side === "client" ? "server" : "client";
  if (endClosed(c, other)) return;
  const fin = () => {
    const now = conn(rt.net, c.id);
    if (now && !endClosed(now, other)) endClose(rt, now, other, 1006, "");
  };
  // The other end hears the TCP close when packets get through.
  if (cut(rt.net, c)) rt.held.push({ conn: c.id, run: fin });
  else fin();
}

/** nginx closes a tunnel the server has said nothing on for proxy_read_timeout. */
function watchIdle(rt: Rt, id: number, at: number) {
  schedule(rt, at, () => {
    const c = conn(rt.net, id);
    if (!c || c.closedAt !== null || c.idleTimeout === null) return;
    const due = c.lastFromServer + c.idleTimeout;
    if (rt.net.now < due) return watchIdle(rt, id, due);
    rt.ev.push({ type: "note", text: "nginx: upstream timed out (110: Connection timed out) while proxying upgraded connection" });
    terminate(rt, c, "server");
    if (!endClosed(c, "client")) terminate(rt, c, "client");
  });
}

/** Packets get through again: everything TCP was holding arrives. */
function release(rt: Rt) {
  const net = rt.net;
  const keep: Rt["held"] = [];
  const go: Rt["held"] = [];
  for (const h of rt.held) {
    const c = conn(net, h.conn);
    if (c && cut(net, c)) keep.push(h);
    else go.push(h);
  }
  rt.held = keep;
  for (const h of go) schedule(rt, net.now, h.run);
}

/* --------------------------------------------------------------- tshark */

const ephemeral = (c: WsConn) => 50000 + c.id * 7;

export const CLOSE_NAME: Record<number, string> = {
  1000: "Normal Closure",
  1001: "Going Away",
  1002: "Protocol error",
  1003: "Unsupported Data",
  1005: "No Status Rcvd",
  1006: "Abnormal Closure",
  1007: "Invalid Payload Data",
  1008: "Policy Violation",
  1009: "Message Too Big",
  1010: "Mandatory Extension",
  1011: "Internal Error",
};

function capture(rt: Rt, c: WsConn, f: WsFrame) {
  const net = rt.net;
  for (const p of net.procs) {
    if (!p.alive || p.kind !== "tshark" || !p.capture) continue;
    const cap = p.capture;
    if (cap.port !== null && cap.port !== c.port && cap.port !== c.upstream) continue;
    cap.count++;
    net.packets++;
    const n = cap.count;
    const len = 66 + f.wire;
    const t = ((net.now - p.startedAt) / 1000).toFixed(9);
    const name = OPCODE_NAME[f.opcode] ?? `Unknown (${f.opcode})`;
    const src = f.dir === "out" ? ephemeral(c) : c.port;
    const dst = f.dir === "out" ? c.port : ephemeral(c);
    if (!cap.verbose) {
      rt.ev.push({
        type: "captured",
        pid: p.pid,
        lines: [`${String(n).padStart(5)} ${t.padStart(12)}    127.0.0.1 → 127.0.0.1    WebSocket ${len} WebSocket ${name}${f.fin ? " [FIN]" : ""}${f.masked ? " [MASKED]" : ""}`],
      });
      continue;
    }
    const bits7 = f.size < 126 ? f.size : f.size < 65536 ? 126 : 127;
    const b = bits7.toString(2).padStart(7, "0");
    const op = f.opcode.toString(2).padStart(4, "0");
    const lines = [
      `Frame ${n}: ${len} bytes on wire (${len * 8} bits), ${len} bytes captured (${len * 8} bits) on interface lo, id 0`,
      "Ethernet II, Src: 00:00:00_00:00:00 (00:00:00:00:00:00), Dst: 00:00:00_00:00:00 (00:00:00:00:00:00)",
      "Internet Protocol Version 4, Src: 127.0.0.1, Dst: 127.0.0.1",
      `Transmission Control Protocol, Src Port: ${src}, Dst Port: ${dst}, Len: ${f.wire}`,
      "WebSocket",
      `    ${f.fin ? 1 : 0}... .... = Fin: ${f.fin ? "True" : "False"}`,
      "    .000 .... = Reserved: 0x0",
      `    .... ${op} = Opcode: ${name} (${f.opcode})`,
      `    ${f.masked ? 1 : 0}... .... = Mask: ${f.masked ? "True" : "False"}`,
      `    .${b.slice(0, 3)} ${b.slice(3)} = Payload length: ${bits7}`,
      ...(bits7 === 126 ? [`    Extended Payload length (16 bits): ${f.size}`] : bits7 === 127 ? [`    Extended Payload length (64 bits): ${f.size}`] : []),
      ...(f.masked ? [`    Masking-Key: ${f.mask}`, "    Masked payload"] : []),
      ...(f.size > 0 ? ["    Payload"] : []),
    ];
    if (f.opcode === OP.close && f.size >= 2) {
      const [code, ...reason] = f.text.split(" ");
      lines.push(`        Close: ${CLOSE_NAME[Number(code)] ?? "Unknown"} (${code})`);
      if (reason.length) lines.push(`        Reason: ${reason.join(" ")}`);
    } else if ((f.opcode === OP.text || f.opcode === OP.cont) && f.size > 0 && !/^[0-9a-f]+…?$/.test(f.text)) {
      lines.push("Line-based text data (1 lines)", `    ${f.text.length > 120 ? `${f.text.slice(0, 120)}…` : f.text}`);
    } else if (f.size > 0) lines.push(`Data (${f.size} bytes)`, `    Data: ${f.text.slice(0, 64)}`);
    lines.push("");
    rt.ev.push({ type: "captured", pid: p.pid, lines });
  }
}

/* ------------------------------------------------------------- the chat */

/** A new message reaches the chat: held long polls answer, streams and sockets carry it. */
function post(rt: Rt, from: string, text: string, via: Via): ChatMessage {
  const net = rt.net;
  const msg: ChatMessage = { id: net.messages.length + 1, from, text, at: net.now, via };
  net.messages.push(msg);
  rt.ev.push({ type: "posted", msg: msg.id, from, via });
  for (const ex of net.exchanges) {
    if (ex.doneAt !== null || ex.port !== API_PORT) continue;
    if (ex.kind === "longpoll") deliverList(rt, ex, net.messages.filter((m) => m.id > ex.after), 200);
    else if (ex.kind === "sse") stream(rt, ex, msg);
  }
  for (const c of net.conns) {
    if (c.serverClosedAt !== null || c.server !== "chat") continue;
    transmit(rt, c, "server", OP.text, utf8(JSON.stringify({ type: "message", ...msgJson(msg) })), true);
  }
  return msg;
}

function chatReply(rt: Rt, c: WsConn, text: string) {
  const reply = (value: unknown) => transmit(rt, c, "server", OP.text, utf8(JSON.stringify(value)), true);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return reply({ type: "error", error: 'expected JSON, e.g. {"type":"chat","text":"hi"}' });
  }
  const m = parsed as { type?: unknown; text?: unknown };
  if (m?.type !== "chat") return reply({ type: "error", error: `unknown type: ${JSON.stringify(m?.type ?? null)}` });
  if (typeof m.text !== "string" || !m.text.trim()) return reply({ type: "error", error: "text is required" });
  post(rt, "you", m.text, "ws");
}

function publish(rt: Rt, channel: string, message: string): number {
  let n = 0;
  for (const { pid, client } of rt.redis) {
    if (!client.channels.has(channel) || client.status !== "ready" || !procOf(rt.net, pid)?.alive) continue;
    n++;
    schedule(rt, rt.net.now, () => guard(rt.host, pid, () => client.emit("message", channel, message)), pid);
  }
  return n;
}

/* ------------------------------------------------------------------ time */

/** The next thing that happens on its own, at or before `limit`. */
function nextAt(net: Net, rt: Rt, limit: number): number | null {
  let best: number | null = null;
  const consider = (t: number | null | undefined) => {
    if (t !== null && t !== undefined && t <= limit && (best === null || t < best)) best = t;
  };
  consider(net.planned[0]?.at);
  consider(net.netPlan[0]?.at);
  for (const e of net.exchanges) {
    if (e.doneAt !== null) continue;
    consider(e.holdUntil);
    consider(e.abortAt);
  }
  for (const t of rt.tasks) consider(t.at);
  return best === null ? null : Math.max(net.now, best);
}

/** Everything due at the current time, in order. */
function settle(net: Net, rt: Rt) {
  // Code that keeps scheduling work for the very same moment (a reconnect with no delay) would never
  // let time move; the sandbox stops it after a while, as a real machine would grind on.
  for (let n = 0; n < 20_000; n++) {
    if (net.planned.length && net.planned[0]!.at <= net.now) {
      const p = net.planned.shift()!;
      post(rt, p.from, p.text, "teammate");
      continue;
    }
    if (net.netPlan.length && net.netPlan[0]!.at <= net.now) {
      const p = net.netPlan.shift()!;
      if (p.port !== undefined) setBlocked(rt, p.port, p.down);
      if (p.client !== undefined) {
        if (p.down && !net.down.includes(p.client)) net.down.push(p.client);
        if (!p.down) {
          net.down = net.down.filter((c) => c !== p.client);
          release(rt);
        }
      }
      continue;
    }
    const ex = net.exchanges.find((e) => e.doneAt === null && ((e.holdUntil !== null && e.holdUntil <= net.now) || (e.abortAt !== null && e.abortAt <= net.now)));
    if (ex) {
      if (ex.holdUntil !== null && ex.holdUntil <= net.now) {
        ex.empty = true;
        finish(rt, ex, 204, "No Content", [["X-Powered-By", "Express"], ...expressTail(net)], "");
      } else {
        ex.doneAt = net.now;
        ex.end = ex.stopKind;
        rt.ev.push({ type: "ended", id: ex.id, end: ex.stopKind });
      }
      continue;
    }
    let due: Task | null = null;
    for (const t of rt.tasks) if (t.at <= net.now && (!due || t.at < due.at || (t.at === due.at && t.seq < due.seq))) due = t;
    if (!due) {
      exitIdle(rt);
      return;
    }
    const task = due;
    rt.tasks = rt.tasks.filter((t) => t !== task);
    if (task.every !== null) rt.tasks.push({ ...task, at: task.at + task.every, seq: ++rt.seq });
    task.run();
  }
  rt.ev.push({ type: "note", text: "sandbox: too many things happened at once; stopped here" });
}

function advanceTo(net: Net, rt: Rt, target: number) {
  const from = net.now;
  const at = rt.ev.length;
  settle(net, rt);
  for (;;) {
    const t = nextAt(net, rt, target);
    if (t === null) break;
    net.now = t;
    settle(net, rt);
  }
  net.now = Math.max(net.now, target);
  settle(net, rt);
  if (net.now !== from) rt.ev.splice(at, 0, { type: "time", from, to: net.now });
}

function setBlocked(rt: Rt, port: number, on: boolean) {
  const net = rt.net;
  if (on && !net.blocked.includes(port)) net.blocked.push(port);
  if (!on) net.blocked = net.blocked.filter((p) => p !== port);
  rt.ev.push({ type: "blocked", port, on });
  if (!on) release(rt);
}

/* ------------------------------------------------------------------ apply */

function newExchange(net: Net, a: { client: Client; port: number; method: string; target: string; headers: [string, string][]; body?: string }): Exchange {
  const { path, query } = parseTarget(a.target);
  const ex: Exchange = {
    id: net.exchanges.length + 1,
    client: a.client,
    port: a.port,
    method: a.method,
    target: a.target,
    path,
    query,
    headers: a.headers,
    body: a.body ?? "",
    httpVersion: "1.1",
    kind: "other",
    sentAt: net.now,
    doneAt: null,
    status: null,
    statusText: "",
    respHeaders: [],
    respBody: "",
    delivered: [],
    empty: false,
    after: 0,
    holdUntil: null,
    abortAt: null,
    stopKind: "clientTimeout",
    end: null,
    proxyFor: null,
  };
  net.exchanges.push(ex);
  return ex;
}

/** A client library (the browser, wscat, a named app) connects: handshake, then checks the answer. */
function openRemote(rt: Rt, a: Extract<NetAction, { type: "wsOpen" }>) {
  const net = rt.net;
  const ev = rt.ev;
  const retry = () => {
    if (a.reconnect !== undefined) schedule(rt, net.now + a.reconnect, () => openRemote(rt, a));
  };
  net.draws++;
  const key = toBase64(seededBytes(net.draws, 16));
  const headers: [string, string][] = [...a.headers, ["Sec-WebSocket-Key", key]];
  const ex = newExchange(net, { client: a.client, port: a.port, method: "GET", target: a.target, headers });
  ev.push({ type: "sent", id: ex.id, client: a.client, kind: "upgrade", port: a.port, method: "GET", target: a.target });
  const landing = serve(rt, ex);
  ex.kind = "upgrade";
  if (ex.doneAt === null && !landing) {
    ex.doneAt = net.now;
    ex.end = "lost";
    ev.push({ type: "wsFailed", port: a.port, reason: "connect ETIMEDOUT", client: a.client });
    retry();
    return;
  }
  const failed = clientCheck(ex, key);
  if (failed || !landing) {
    ev.push({ type: "wsFailed", port: a.port, reason: failed ?? "socket hang up", client: a.client });
    retry();
    return;
  }
  openSocket(rt, ex, landing, a.client, { interactive: a.interactive, readRate: a.readRate, reopen: a.reconnect !== undefined ? a : undefined });
}

const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

export interface Applied {
  net: Net;
  events: NetEvent[];
}

export function apply(prev: Net, a: NetAction): Applied {
  const rt = runtimeFor(prev);
  const net = clone(prev);
  // Every state remembers where it came from, so its runtime can be rebuilt.
  const root = prev.origin?.base ?? { ...prev, rt: undefined, origin: undefined };
  net.origin = { base: root, actions: [...(prev.origin?.actions ?? []), a] };
  net.rt = rt;
  rt.net = net;
  rt.ev = [];
  const ev = rt.ev;
  switch (a.type) {
    case "advance":
      advanceTo(net, rt, net.now + a.ms);
      break;
    case "await": {
      const ex = net.exchanges.filter((e) => e.client !== "nginx").at(-1);
      if (!ex || ex.doneAt !== null) break;
      // Time runs until it is answered or given up; a message may answer it before any deadline.
      const from = net.now;
      const at = ev.length;
      const limit = net.now + 60 * 60_000;
      while (ex.doneAt === null) {
        const t = nextAt(net, rt, limit);
        if (t === null) break;
        net.now = t;
        settle(net, rt);
      }
      if (net.now !== from) ev.splice(at, 0, { type: "time", from, to: net.now });
      break;
    }
    case "awaitExit": {
      const from = net.now;
      const at = ev.length;
      const limit = net.now + a.max;
      while (procOf(net, a.pid)?.alive) {
        const t = nextAt(net, rt, limit);
        if (t === null) break;
        net.now = t;
        settle(net, rt);
      }
      if (net.now !== from) ev.splice(at, 0, { type: "time", from, to: net.now });
      break;
    }
    case "http": {
      const ex = newExchange(net, a);
      if (a.maxTime !== undefined) ex.abortAt = net.now + a.maxTime;
      else if (a.stopAfter !== undefined) {
        ex.abortAt = net.now + a.stopAfter;
        ex.stopKind = "sandboxStop";
      }
      ev.push({ type: "sent", id: ex.id, client: a.client, kind: ex.kind, port: a.port, method: a.method, target: a.target });
      serve(rt, ex);
      const sent = ev.find((e) => e.type === "sent");
      if (sent && sent.type === "sent") sent.kind = ex.kind;
      break;
    }
    case "wsOpen":
      openRemote(rt, a);
      break;
    case "wsSend": {
      const c = openConn(net, a.client);
      if (c) transmit(rt, c, "client", a.binary ? OP.binary : OP.text, a.binary ? hexBytes(a.text) : utf8(a.text), true);
      break;
    }
    case "wsClose": {
      const c = openConn(net, a.client);
      if (c) sendClose(rt, c, "client", a.code, a.reason ?? "");
      break;
    }
    case "netDown":
      for (const ex of net.exchanges) {
        if (ex.client !== a.client || ex.doneAt !== null) continue;
        ex.doneAt = net.now;
        ex.end = "lost";
        ev.push({ type: "ended", id: ex.id, end: "lost" });
      }
      if (!net.down.includes(a.client)) net.down.push(a.client);
      break;
    case "netUp":
      net.down = net.down.filter((c) => c !== a.client);
      release(rt);
      break;
    case "hangUp":
      for (const ex of net.exchanges) {
        if (ex.client !== a.client || ex.doneAt !== null) continue;
        ex.doneAt = net.now;
        ex.end = "closed";
        ev.push({ type: "ended", id: ex.id, end: "closed" });
      }
      break;
    case "say":
      post(rt, a.from, a.text, "teammate");
      break;
    case "write":
      net.files[a.path] = a.text;
      break;
    case "node":
      startProc(rt, a);
      break;
    case "kill":
      signal(rt, a.pid, a.signal ?? "TERM");
      break;
    case "killFile":
      for (const p of net.procs.filter((x) => x.alive && x.file === a.file)) signal(rt, p.pid, "TERM");
      break;
    case "block":
      setBlocked(rt, a.port, a.on);
      break;
    case "tshark": {
      const pid = net.nextPid++;
      net.procs.push({
        pid,
        file: "tshark",
        kind: "tshark",
        code: "",
        env: {},
        args: [],
        alive: true,
        startedAt: net.now,
        ports: [],
        exit: null,
        capture: { verbose: a.verbose, websocketOnly: a.websocketOnly, port: a.port, count: 0 },
      });
      ev.push({ type: "captured", pid, lines: ["Capturing on 'Loopback: lo'"] });
      break;
    }
    case "nginxReload": {
      const p = parseNginx(net.files[NGINX_CONF] ?? "");
      if (!p.ok) ev.push({ type: "nginx", ok: false, text: p.error });
      else {
        net.nginx = { conf: p.conf, loadedAt: net.now };
        ev.push({ type: "nginx", ok: true, text: "" });
      }
      break;
    }
    case "redisPublish":
      publish(rt, a.channel, a.message);
      break;
    case "print":
      net.printed.push(a.text);
      break;
    case "set":
      net.vars[a.name] = a.value;
      break;
    case "draw":
      net.draws++;
      break;
  }
  settle(net, rt);
  return { net, events: ev };
}

export interface Run {
  states: Net[];
  events: NetEvent[][];
}

export function simulate(actions: NetAction[], start: Net): Run {
  const states = [start];
  const events: NetEvent[][] = [];
  let net = start;
  for (const a of actions) {
    const r = apply(net, a);
    net = r.net;
    states.push(net);
    events.push(r.events);
  }
  return { states, events };
}

export const replay = (start: Net, actions: NetAction[]) => simulate(actions, start).states.at(-1)!;

/* -------------------------------------------------------------- readings */

/** Requests that asked for messages and got none. */
export const emptyAnswers = (net: Net, since = 0) => net.exchanges.slice(since).filter((e) => e.empty).length;

/** How long a message waited before a client had it, in ms; null while nobody has it. */
export function latency(net: Net, id: number): number | null {
  const m = net.messages.find((x) => x.id === id);
  const seen = net.seen[id];
  return m && seen !== undefined ? seen - m.at : null;
}

/** Bytes a server holds for slow clients right now. */
export const bufferedNow = (net: Net) => net.conns.reduce((n, c) => n + c.queue.filter((q) => q.at > net.now).reduce((m, q) => m + q.wire, 0), 0);

/** Connections a server still counts as open. */
export const serverOpen = (net: Net, server: string) => net.conns.filter((c) => c.server === server && c.serverClosedAt === null);

/** The newest process running a file. */
export const procByFile = (net: Net, file: string) => [...net.procs].reverse().find((p) => p.file === file && p.kind === "node");

export const hex = toHex;
