import { fromUtf8, sha1, seededBytes, toBase64, toHex, utf8, type Bytes } from "./bytes";

/**
 * Runs a reader's Node file for real, in the page. `require` hands back small stand-ins for
 * `ws`, `http`, `crypto`, `ioredis`, `fs` and `events` that talk to the sandbox's network model
 * through a Host. Timers run on the sandbox clock, `Math.random` is seeded and `Date` follows the
 * sandbox clock, so a run replays exactly the same way every time.
 */

export const NODE_VERSION = "v22.12.0";
const EPOCH = Date.UTC(2026, 10, 21, 10, 0, 0);

/* ------------------------------------------------------------------ host */

export interface ConnectOpts {
  headers: [string, string][];
}

export interface Host {
  now(): number;
  random(pid: number): number;
  log(pid: number, text: string): void;
  timer(pid: number, ms: number, fn: () => void, every: boolean): number;
  clearTimer(id: number): void;
  /** Starts listening; returns an error message when the port is taken. */
  listen(pid: number, port: number, l: Listener): string | null;
  unlisten(pid: number, port: number): void;
  connect(pid: number, url: string, opts: ConnectOpts, sock: WsSocket): void;
  send(conn: number, from: "client" | "server", payload: Bytes, opts: { binary: boolean; fin: boolean; opcode?: number }): void;
  close(conn: number, from: "client" | "server", code: number | null, reason: string): void;
  terminate(conn: number, from: "client" | "server"): void;
  buffered(conn: number, from: "client" | "server"): number;
  redisConnect(pid: number, client: RedisClient): boolean;
  redisPublish(channel: string, message: string, pid: number): number;
  readFile(path: string): string | undefined;
  writeFile(path: string, text: string): void;
  exit(pid: number, code: number): void;
  crash(pid: number, err: unknown): void;
}

export type Listener =
  | { kind: "ws"; wss: WsServer }
  | { kind: "http"; server: HttpServer };

/* ---------------------------------------------------------------- buffer */

/** Node's Buffer, enough for handshake and frame code: a Uint8Array with encodings. */
export class NodeBuffer extends Uint8Array {
  override toString(enc = "utf8", start = 0, end = this.length): string {
    return encode(this.subarray(start, end), enc);
  }
  toJSON() {
    return { type: "Buffer", data: [...this] };
  }
  equals(other: Uint8Array) {
    return other.length === this.length && this.every((b, i) => b === other[i]);
  }
  readUInt8(i: number) {
    return this[i]!;
  }
  readUInt16BE(i: number) {
    return (this[i]! << 8) | this[i + 1]!;
  }
  write(text: string, offset = 0) {
    const b = utf8(text);
    this.set(b.subarray(0, this.length - offset), offset);
    return Math.min(b.length, this.length - offset);
  }
}

const buf = (bytes: Uint8Array) => {
  const b = new NodeBuffer(bytes.length);
  b.set(bytes);
  return b;
};

export function encode(bytes: Uint8Array, enc: string): string {
  switch (enc) {
    case "base64":
      return toBase64(bytes);
    case "hex":
      return toHex(bytes);
    case "latin1":
    case "binary":
      return String.fromCharCode(...bytes);
    default:
      return fromUtf8(bytes);
  }
}

export function toBytes(data: unknown, enc?: string): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  const s = String(data);
  if (enc === "hex") return Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
  if (enc === "base64") return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  if (enc === "latin1" || enc === "binary") return Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
  return utf8(s);
}

export const BufferApi = {
  from: (data: unknown, enc?: string) => buf(toBytes(data, enc)),
  alloc: (n: number, fill = 0) => {
    const b = new NodeBuffer(n);
    b.fill(typeof fill === "number" ? fill : 0);
    return b;
  },
  allocUnsafe: (n: number) => new NodeBuffer(n),
  concat: (list: Uint8Array[]) => {
    const out = new NodeBuffer(list.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of list) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  },
  isBuffer: (x: unknown) => x instanceof NodeBuffer,
  byteLength: (s: unknown) => (typeof s === "string" ? utf8(s).length : (s as Uint8Array).length),
};

/* ---------------------------------------------------------------- errors */

export class NodeError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** What Node prints when an error nobody caught ends the process. */
export function crashText(err: unknown): string {
  const e = err as { name?: string; message?: string; code?: string; unhandledEvent?: boolean };
  const name = e?.name && e.name !== "Error" ? e.name : "Error";
  const lines: string[] = [];
  if (e?.unhandledEvent) lines.push("node:events:497", "      throw er; // Unhandled 'error' event", "      ^", "");
  lines.push(`${name}: ${e?.message ?? String(err)}`);
  if (e?.code) lines.push(`  code: '${e.code}'`);
  lines.push("", `Node.js ${NODE_VERSION}`);
  return lines.join("\n");
}

/* --------------------------------------------------------------- emitter */

type Fn = (...args: never[]) => unknown;

export class Emitter {
  private handlers = new Map<string, { fn: Fn; once: boolean }[]>();
  on(event: string, fn: Fn) {
    const list = this.handlers.get(event) ?? [];
    list.push({ fn, once: false });
    this.handlers.set(event, list);
    return this;
  }
  addListener(event: string, fn: Fn) {
    return this.on(event, fn);
  }
  once(event: string, fn: Fn) {
    const list = this.handlers.get(event) ?? [];
    list.push({ fn, once: true });
    this.handlers.set(event, list);
    return this;
  }
  off(event: string, fn: Fn) {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter((h) => h.fn !== fn));
    return this;
  }
  removeListener(event: string, fn: Fn) {
    return this.off(event, fn);
  }
  removeAllListeners(event?: string) {
    if (event) this.handlers.delete(event);
    else this.handlers.clear();
    return this;
  }
  listenerCount(event: string) {
    return (this.handlers.get(event) ?? []).length;
  }
  /** As Node's: an 'error' with no listener is thrown. */
  emit(event: string, ...args: unknown[]): boolean {
    const list = this.handlers.get(event) ?? [];
    if (event === "error" && list.length === 0) {
      const err = args[0] as { unhandledEvent?: boolean } | undefined;
      if (err && typeof err === "object") err.unhandledEvent = true;
      throw err ?? new Error("Unhandled error.");
    }
    this.handlers.set(
      event,
      list.filter((h) => !h.once),
    );
    for (const h of list) (h.fn as (...a: unknown[]) => unknown)(...args);
    return list.length > 0;
  }
}

/* ------------------------------------------------------------- WebSocket */

export const READY = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 } as const;

/** One end of a WebSocket, in the ws library's shape. The same class serves clients and servers. */
export class WsSocket extends Emitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  CONNECTING = 0;
  OPEN = 1;
  CLOSING = 2;
  CLOSED = 3;
  readyState: number = READY.CONNECTING;
  conn = -1;
  url = "";
  protocol = "";
  binaryType = "nodebuffer";
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  /** Fields any code may hang on a socket (`ws.isAlive = true`). */
  [key: string]: unknown;

  constructor(
    readonly host: Host,
    readonly pid: number,
    readonly side: "client" | "server",
  ) {
    super();
  }

  get bufferedAmount() {
    return this.conn < 0 ? 0 : this.host.buffered(this.conn, this.side);
  }

  addEventListener(event: string, fn: (e: unknown) => void) {
    return this.on(event, ((...args: unknown[]) => fn(eventObject(event, args))) as Fn);
  }

  override emit(event: string, ...args: unknown[]): boolean {
    const prop = (this as Record<string, unknown>)[`on${event}`];
    const had = this.listenerCount(event) > 0 || typeof prop === "function";
    if (typeof prop === "function" && event !== "error") (prop as (e: unknown) => void)(eventObject(event, args));
    if (event === "error" && typeof prop === "function") {
      (prop as (e: unknown) => void)(eventObject(event, args));
      if (this.listenerCount("error") === 0) return true;
    }
    super.emit(event, ...args);
    return had;
  }

  send(data: unknown, opts?: unknown, cb?: unknown) {
    const callback = (typeof opts === "function" ? opts : cb) as ((err?: Error) => void) | undefined;
    const o = (typeof opts === "object" && opts ? opts : {}) as { binary?: boolean; fin?: boolean };
    if (this.readyState === READY.CONNECTING) throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
    if (this.readyState !== READY.OPEN) {
      callback?.(new Error(`WebSocket is not open: readyState ${this.readyState} (${this.readyState === 2 ? "CLOSING" : "CLOSED"})`));
      return;
    }
    const binary = o.binary ?? typeof data !== "string";
    this.host.send(this.conn, this.side, toBytes(typeof data === "number" ? String(data) : data), { binary, fin: o.fin ?? true });
    callback?.();
  }

  ping(data?: unknown) {
    if (this.readyState !== READY.OPEN) return;
    this.host.send(this.conn, this.side, data === undefined ? new Uint8Array() : toBytes(data), { binary: true, fin: true, opcode: 0x9 });
  }

  pong(data?: unknown) {
    if (this.readyState !== READY.OPEN) return;
    this.host.send(this.conn, this.side, data === undefined ? new Uint8Array() : toBytes(data), { binary: true, fin: true, opcode: 0xa });
  }

  close(code?: number, reason?: string) {
    if (this.readyState === READY.CLOSED || this.readyState === READY.CLOSING) return;
    if (this.readyState === READY.CONNECTING) {
      this.readyState = READY.CLOSED;
      return;
    }
    if (code !== undefined && !validCloseCode(code)) throw new TypeError(`First argument must be a valid error code number`);
    this.readyState = READY.CLOSING;
    this.host.close(this.conn, this.side, code ?? null, reason ?? "");
  }

  terminate() {
    if (this.readyState === READY.CLOSED) return;
    this.readyState = READY.CLOSED;
    if (this.conn >= 0) this.host.terminate(this.conn, this.side);
  }
}

/** Codes a ws endpoint may send (RFC 6455 section 7.4; 1005 and 1006 are never sent). */
export const validCloseCode = (code: number) =>
  (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999);

function eventObject(event: string, args: unknown[]) {
  if (event === "message") return { data: args[0], type: "message" };
  if (event === "close") return { code: args[0], reason: String(args[1] ?? ""), wasClean: args[0] !== 1006, type: "close" };
  if (event === "error") return { error: args[0], message: (args[0] as Error)?.message, type: "error" };
  return { type: event };
}

export interface WsServerOpts {
  port?: number;
  server?: HttpServer;
  maxPayload?: number;
  clientTracking?: boolean;
  verifyClient?: (info: unknown, cb?: (ok: boolean, code?: number, message?: string) => void) => boolean | void;
  path?: string;
}

export class WsServer extends Emitter {
  clients = new Set<WsSocket>();
  readonly maxPayload: number;
  closed = false;

  constructor(
    readonly host: Host,
    readonly pid: number,
    readonly opts: WsServerOpts,
  ) {
    super();
    // ws's default: 100 MiB.
    this.maxPayload = opts.maxPayload ?? 100 * 1024 * 1024;
    if (opts.port !== undefined) {
      const err = host.listen(pid, opts.port, { kind: "ws", wss: this });
      if (err) {
        // The error comes a tick later in Node, as an 'error' event on the server.
        host.timer(pid, 0, () => this.emit("error", Object.assign(new NodeError(err, "EADDRINUSE"), { syscall: "listen" })), false);
      } else host.timer(pid, 0, () => this.emit("listening"), false);
    } else if (opts.server) opts.server.wss = this;
  }

  address() {
    return { port: this.opts.port, family: "IPv6", address: "::" };
  }

  /** ws 8: stops taking new connections; the open ones stay open. */
  close(cb?: () => void) {
    this.closed = true;
    if (this.opts.port !== undefined) this.host.unlisten(this.pid, this.opts.port);
    if (cb) this.host.timer(this.pid, 0, cb, false);
  }
}

/* ------------------------------------------------------------------ http */

export class HttpServer extends Emitter {
  port: number | null = null;
  wss: WsServer | null = null;
  constructor(
    readonly host: Host,
    readonly pid: number,
    handler?: Fn,
  ) {
    super();
    if (handler) this.on("request", handler);
  }
  listen(port: unknown, ...rest: unknown[]) {
    this.port = Number(port);
    const err = this.host.listen(this.pid, this.port, { kind: "http", server: this });
    const cb = rest.find((r) => typeof r === "function") as (() => void) | undefined;
    if (err) this.host.timer(this.pid, 0, () => this.emit("error", Object.assign(new NodeError(err, "EADDRINUSE"), { syscall: "listen" })), false);
    else if (cb) this.host.timer(this.pid, 0, cb, false);
    return this;
  }
  close(cb?: () => void) {
    if (this.port !== null) this.host.unlisten(this.pid, this.port);
    if (cb) this.host.timer(this.pid, 0, cb, false);
    return this;
  }
  address() {
    return { port: this.port, family: "IPv6", address: "::" };
  }
}

/* ----------------------------------------------------------------- redis */

/** ioredis, the parts pub/sub needs. Commands queue until connected, as ioredis does. */
export class RedisClient extends Emitter {
  status = "connecting";
  channels = new Set<string>();
  constructor(
    readonly host: Host,
    readonly pid: number,
  ) {
    super();
    host.timer(
      pid,
      0,
      () => {
        if (host.redisConnect(pid, this)) {
          this.status = "ready";
          this.emit("connect");
          this.emit("ready");
        } else {
          this.status = "reconnecting";
          const err = new NodeError("connect ECONNREFUSED 127.0.0.1:6379", "ECONNREFUSED");
          if (this.listenerCount("error")) this.emit("error", err);
          else host.log(pid, `[ioredis] Unhandled error event: Error: connect ECONNREFUSED 127.0.0.1:6379`);
        }
      },
      false,
    );
  }
  subscribe(...args: unknown[]) {
    const cb = typeof args[args.length - 1] === "function" ? (args.pop() as (e: Error | null, n: number) => void) : undefined;
    for (const c of args) this.channels.add(String(c));
    if (cb) this.host.timer(this.pid, 0, () => cb(null, this.channels.size), false);
    return Promise.resolve(this.channels.size);
  }
  unsubscribe(...args: unknown[]) {
    for (const c of args) if (typeof c === "string") this.channels.delete(c);
    return Promise.resolve(this.channels.size);
  }
  publish(channel: unknown, message: unknown, cb?: (e: Error | null, n?: number) => void) {
    if (this.channels.size > 0) {
      const err = new Error("Connection in subscriber mode, only subscriber commands may be used");
      if (cb) cb(err);
      else this.host.log(this.pid, `[ioredis] Unhandled error event: ${err.message}`);
      return Promise.resolve(0);
    }
    const n = this.host.redisPublish(String(channel), typeof message === "string" ? message : String(message), this.pid);
    if (cb) this.host.timer(this.pid, 0, () => cb(null, n), false);
    return Promise.resolve(n);
  }
  duplicate() {
    return new RedisClient(this.host, this.pid);
  }
  quit() {
    this.status = "end";
    this.channels.clear();
    return Promise.resolve("OK");
  }
  disconnect() {
    this.status = "end";
    this.channels.clear();
  }
}

/* ---------------------------------------------------------------- loader */

export interface Instance {
  pid: number;
  /** Signal handlers: process.on("SIGTERM", ...). */
  signals: Map<string, (() => void)[]>;
  /** Set when loading threw: the text Node prints before it exits. */
  crash: string | null;
}

/** Runs a file once, as `node file` does. */
export function load(host: Host, pid: number, code: string, file: string, env: Record<string, string>, argv: string[] = []): Instance {
  const inst: Instance = { pid, signals: new Map(), crash: null };
  const log = (...args: unknown[]) => host.log(pid, args.map(show).join(" "));
  const WebSocket = function (this: unknown, url: string, protocols?: unknown, options?: unknown) {
    const sock = new WsSocket(host, pid, "client");
    sock.url = String(url);
    const o = (typeof protocols === "object" && !Array.isArray(protocols) ? protocols : options) as { headers?: Record<string, string>; origin?: string } | undefined;
    const headers: [string, string][] = Object.entries(o?.headers ?? {});
    if (o?.origin) headers.push(["Origin", o.origin]);
    host.connect(pid, String(url), { headers }, sock);
    return sock;
  } as unknown as Record<string, unknown>;
  Object.assign(WebSocket, READY);
  const wsModule = Object.assign(WebSocket, {
    WebSocket,
    WebSocketServer: function (this: unknown, opts: WsServerOpts, cb?: () => void) {
      const s = new WsServer(host, pid, opts ?? {});
      if (cb) s.once("listening", cb);
      return s;
    },
  });
  (wsModule as Record<string, unknown>).Server = wsModule.WebSocketServer;
  const httpApi = {
    STATUS_CODES: { 101: "Switching Protocols", 200: "OK", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 426: "Upgrade Required", 500: "Internal Server Error", 503: "Service Unavailable" },
    createServer: (handler?: Fn) => new HttpServer(host, pid, handler),
  };
  let draws = 0;
  const cryptoApi = {
    createHash(alg: string) {
      if (alg.toLowerCase() !== "sha1") throw new NodeError(`Digest method not supported (the sandbox has sha1)`, "ERR_CRYPTO_INVALID_DIGEST");
      const parts: Uint8Array[] = [];
      const hash = {
        update(data: unknown, enc?: string) {
          parts.push(toBytes(data, enc));
          return hash;
        },
        digest(enc?: string) {
          const out = sha1(BufferApi.concat(parts));
          return enc ? encode(out, enc) : buf(out);
        },
      };
      return hash;
    },
    randomBytes: (n: number) => buf(seededBytes(pid * 31 + draws++, n)),
    randomUUID: () => {
      const h = toHex(seededBytes(pid * 77 + draws++, 16));
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
    },
  };
  const fsApi = {
    readFileSync(path: string, enc?: unknown) {
      const text = host.readFile(String(path));
      if (text === undefined) throw Object.assign(new NodeError(`ENOENT: no such file or directory, open '${path}'`, "ENOENT"), { errno: -2 });
      return enc ? text : BufferApi.from(text);
    },
    writeFileSync: (path: string, data: unknown) => host.writeFile(String(path), String(data)),
    appendFileSync: (path: string, data: unknown) => host.writeFile(String(path), (host.readFile(String(path)) ?? "") + String(data)),
    existsSync: (path: string) => host.readFile(String(path)) !== undefined,
  };
  const require = (name: string) => {
    switch (name.replace(/^node:/, "")) {
      case "ws":
        return wsModule;
      case "http":
        return httpApi;
      case "crypto":
        return cryptoApi;
      case "ioredis":
        return Object.assign(
          function () {
            return new RedisClient(host, pid);
          },
          { default: undefined as unknown },
        );
      case "fs":
        return fsApi;
      case "events":
        return Object.assign(Emitter, { EventEmitter: Emitter });
      default:
        throw new NodeError(`Cannot find module '${name}'\nRequire stack:\n- /home/you/chat/${file}`, "MODULE_NOT_FOUND");
    }
  };
  const process = {
    env: { ...env },
    pid,
    argv: ["/usr/bin/node", `/home/you/chat/${file}`, ...argv],
    platform: "linux",
    version: NODE_VERSION,
    exit: (codeNum = 0) => {
      host.exit(pid, codeNum);
      throw EXIT;
    },
    on: (sig: string, fn: () => void) => {
      inst.signals.set(sig, [...(inst.signals.get(sig) ?? []), fn]);
      return process;
    },
    once: (sig: string, fn: () => void) => process.on(sig, fn),
    memoryUsage: () => ({ rss: 48_000_000, heapUsed: 12_000_000, heapTotal: 20_000_000, external: 1_000_000 }),
    uptime: () => host.now() / 1000,
    nextTick: (fn: () => void) => host.timer(pid, 0, fn, false),
  };
  const timers = {
    setTimeout: (fn: () => void, ms = 0, ...a: unknown[]) => timerHandle(host, host.timer(pid, Number(ms) || 0, () => (fn as Fn as (...x: unknown[]) => void)(...a), false)),
    setInterval: (fn: () => void, ms = 0, ...a: unknown[]) => timerHandle(host, host.timer(pid, Math.max(1, Number(ms) || 0), () => (fn as Fn as (...x: unknown[]) => void)(...a), true)),
    setImmediate: (fn: () => void) => timerHandle(host, host.timer(pid, 0, fn, false)),
    clear: (t: unknown) => {
      if (t && typeof t === "object" && "id" in t) host.clearTimer((t as { id: number }).id);
      else if (typeof t === "number") host.clearTimer(t);
    },
  };
  const SandboxMath = Object.create(Math, { random: { value: () => host.random(pid) } });
  class SandboxDate extends Date {
    constructor(...args: unknown[]) {
      if (args.length) super(...(args as [number]));
      else super(EPOCH + host.now());
    }
    static override now() {
      return EPOCH + host.now();
    }
  }
  const consoleApi = { log, info: log, warn: log, error: log, debug: log };
  try {
    const run = new Function(
      "require",
      "console",
      "Buffer",
      "process",
      "module",
      "exports",
      "__dirname",
      "__filename",
      "setTimeout",
      "setInterval",
      "setImmediate",
      "clearTimeout",
      "clearInterval",
      "Math",
      "Date",
      code,
    );
    run(require, consoleApi, BufferApi, process, { exports: {} }, {}, "/home/you/chat", `/home/you/chat/${file}`, timers.setTimeout, timers.setInterval, timers.setImmediate, timers.clear, timers.clear, SandboxMath, SandboxDate);
  } catch (err) {
    if (err !== EXIT) inst.crash = crashText(err);
  }
  return inst;
}

/** Thrown by process.exit to stop the code that called it. */
export const EXIT = Symbol("process.exit");

function timerHandle(_host: Host, id: number) {
  return {
    id,
    unref() {
      return this;
    },
    ref() {
      return this;
    },
    hasRef: () => true,
    [Symbol.toPrimitive]: () => id,
  };
}

/** How console.log prints a value. */
export function show(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof NodeBuffer) return `<Buffer ${toHex(v.subarray(0, 50)).replace(/(..)(?!$)/g, "$1 ")}${v.length > 50 ? ` ... ${v.length - 50} more bytes` : ""}>`;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (v instanceof WsSocket) return "WebSocket { ... }";
  if (v instanceof Set) return `Set(${v.size}) { ... }`;
  if (typeof v === "object" && v !== null) {
    try {
      return JSON.stringify(v).replace(/"([A-Za-z_$][\w$]*)":/g, "$1: ").replace(/,/g, ", ").replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/:\s+/g, ": ");
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/** The NodeBuffer for a payload, as ws hands it to a 'message' listener. */
export const asBuffer = (bytes: Uint8Array) => buf(bytes);

/** Runs a callback of the reader's code; an error it throws ends the process, as in Node. */
export function guard(host: Host, pid: number, fn: () => void) {
  try {
    fn();
  } catch (err) {
    if (err === EXIT) return;
    host.crash(pid, err);
  }
}
