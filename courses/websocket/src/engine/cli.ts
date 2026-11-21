import type { CommandLine, ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete, out, shellWords, type TermLine } from "@lets-explain/core/lib/terminal";
import { fromBase64, fromUtf8, seededBytes, sha1, toBase64, toHex, utf8, type Bytes } from "./bytes";
import { NGINX_CONF, parseNginx } from "./nginx";
import { apply, header, requestText, WS_PORT, wscatConn, type Net, type NetAction, type NetEvent } from "./net";

/**
 * The reader's terminal: curl, wscat, openssl, node, tshark, nginx and friends, printing what the
 * real tools print. A line becomes model actions; the output is read from what those actions did.
 */

export type CliResult = ShellResult<NetAction, Net>;

export const PROMPT = "~/chat $";
export const CURL_UA = "curl/8.5.0";
/** curl has no time limit of its own; the sandbox stops a request nothing answers after this. */
const SANDBOX_STOP_MS = 30_000;
const LOOKS = new Set(["help", "clear", "ls", "cat", "pwd", "ps", "jobs", "history", "man", "echo", "seq"]);
const COMMANDS = [
  "curl",
  "wscat",
  "openssl",
  "printf",
  "echo",
  "base64",
  "xxd",
  "wc",
  "jq",
  "grep",
  "seq",
  "node",
  "kill",
  "pkill",
  "ps",
  "jobs",
  "sleep",
  "tshark",
  "nginx",
  "systemctl",
  "iptables",
  "redis-cli",
  "sudo",
  "ls",
  "cat",
  "nano",
  "clear",
  "help",
];

export const promptFor = (net: Net) => (wscatConn(net) ? ">" : PROMPT);

/* ------------------------------------------------------------------ state */

interface Ctx {
  net: Net;
  actions: NetAction[];
  lines: TermLine[];
  moved: boolean;
  /** The process this command waits for in the foreground; its own end prints no job line. */
  fg: number | null;
  /** The reader closed this wscat connection themselves: no "Disconnected" line. */
  closing: Set<number>;
  sudo: boolean;
}

/** Applies an action and prints whatever background things did meanwhile. */
function act(ctx: Ctx, a: NetAction): NetEvent[] {
  const r = apply(ctx.net, a);
  ctx.net = r.net;
  ctx.actions.push(a);
  printBackground(ctx, r.events);
  return r.events;
}

const jobOf = (net: Net, pid: number) => net.procs.findIndex((p) => p.pid === pid) + 1;
const cmdOf = (net: Net, pid: number) => {
  const p = net.procs.find((x) => x.pid === pid);
  if (!p) return "";
  if (p.kind === "tshark") return "tshark -i lo";
  const env = Object.entries(p.env)
    .map(([k, v]) => `${k}=${v} `)
    .join("");
  return p.file === "[eval]" ? "node -e …" : `${env}node ${p.file}`;
};
const jobLine = (net: Net, pid: number, what: string) => `[${jobOf(net, pid)}]+  ${what.padEnd(24)}${cmdOf(net, pid)}`;

function printBackground(ctx: Ctx, events: NetEvent[]) {
  const net = ctx.net;
  for (const e of events) {
    switch (e.type) {
      case "procLog":
        ctx.lines.push(out(e.text));
        break;
      case "procCrashed":
        for (const line of e.text.split("\n")) ctx.lines.push(out(line, "err"));
        if (e.pid !== ctx.fg) ctx.lines.push(out(jobLine(net, e.pid, "Exit 1"), "dim"));
        break;
      case "procExited":
        if (e.pid !== ctx.fg && !events.some((x) => x.type === "procCrashed" && x.pid === e.pid)) ctx.lines.push(out(jobLine(net, e.pid, e.code ? `Exit ${e.code}` : "Done"), "dim"));
        break;
      case "procStopped":
        if (net.procs.find((p) => p.pid === e.pid)?.kind === "node") {
          ctx.lines.push(out(jobLine(net, e.pid, { TERM: "Terminated", KILL: "Killed", INT: "Interrupt" }[e.signal] ?? "Terminated"), "dim"));
        }
        break;
      case "captured":
        for (const line of e.lines) ctx.lines.push(out(line, "hl"));
        break;
      case "message":
        if (e.client === "you" && e.dir === "in") ctx.lines.push(out(`< ${e.binary ? `<Buffer ${e.text.replace(/(..)(?!$)/g, "$1 ")}>` : e.text}`, "hl"));
        break;
      case "wsClosed":
        if (e.client === "you" && e.side === "client" && !ctx.closing.has(e.conn)) {
          ctx.lines.push(out(`Disconnected (code: ${e.code}, reason: "${e.reason}")`, "err"));
        }
        break;
    }
  }
}

interface Proc {
  stdout: Bytes;
  code: number;
}

const ok = (text: string | Bytes = ""): Proc => ({ stdout: typeof text === "string" ? utf8(text) : text, code: 0 });
const EMPTY = new Uint8Array();

function err(ctx: Ctx, text: string, code = 1): Proc {
  if (text) for (const line of text.split("\n")) ctx.lines.push(out(line, "err"));
  return { stdout: EMPTY, code };
}

/* ------------------------------------------------------------ expansions */

/** `$NAME`, `${NAME}` and `$(command)` outside single quotes, as bash does before it splits words. */
function expand(ctx: Ctx, line: string, vars: Record<string, string> = {}): string {
  let res = "";
  let single = false;
  let double = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "'" && !double) {
      single = !single;
      res += ch;
      continue;
    }
    if (ch === '"' && !single) double = !double;
    if (single || ch !== "$") {
      res += ch;
      continue;
    }
    if (line[i + 1] === "(") {
      let depth = 1;
      let j = i + 2;
      while (j < line.length && depth > 0) {
        if (line[j] === "(") depth++;
        else if (line[j] === ")") depth--;
        j++;
      }
      const inner = line.slice(i + 2, j - 1);
      const sub = runPipeline(ctx, expand(ctx, inner, vars), { capture: true });
      res += fromUtf8(sub.stdout).replace(/\n+$/, "");
      i = j - 1;
      continue;
    }
    const m = /^\{([A-Za-z_][A-Za-z0-9_]*)\}|^([A-Za-z_][A-Za-z0-9_]*)/.exec(line.slice(i + 1));
    if (m) {
      const name = m[1] ?? m[2]!;
      res += vars[name] ?? ctx.net.vars[name] ?? "";
      i += m[0].length;
      continue;
    }
    res += ch;
  }
  return res;
}

/* ------------------------------------------------------------------ text */

/** Bytes as a terminal shows them: text when it is text, mojibake when it is not. */
export function shown(bytes: Bytes): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "�");
}

function printBytes(ctx: Ctx, bytes: Bytes) {
  if (!bytes.length) return;
  const text = shown(bytes).replace(/\n$/, "");
  for (const line of text.split("\n")) ctx.lines.push(out(line));
}

/** Backslash escapes as printf and `echo -e` read them, into bytes: \n \t \\ \xHH \0NNN. */
function unescape(s: string): number[] {
  const res: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch !== "\\" || i === s.length - 1) {
      res.push(...utf8(ch));
      continue;
    }
    const n = s[i + 1]!;
    if (n === "x") {
      const m = /^[0-9a-fA-F]{1,2}/.exec(s.slice(i + 2));
      if (m) {
        res.push(parseInt(m[0], 16));
        i += 1 + m[0].length;
        continue;
      }
    }
    if (/[0-7]/.test(n)) {
      const m = /^[0-7]{1,4}/.exec(s.slice(i + 1))!;
      res.push(parseInt(m[0], 8) & 0xff);
      i += m[0].length;
      continue;
    }
    const map: Record<string, number> = { n: 10, t: 9, r: 13, "\\": 92, '"': 34, "'": 39, a: 7, b: 8, e: 27 };
    if (map[n] !== undefined) {
      res.push(map[n]!);
      i++;
      continue;
    }
    res.push(92);
  }
  return res;
}

/** printf's format: %s, %d, %%, and the backslash escapes; the format repeats while arguments are left. */
function printf(format: string, args: string[]): Bytes {
  const res: number[] = [];
  const slots = (format.match(/%[sd]/g) ?? []).length;
  let k = 0;
  do {
    for (const p of format.split(/(%%|%s|%d)/)) {
      if (p === "%%") res.push(37);
      else if (p === "%s") res.push(...utf8(args[k++] ?? ""));
      else if (p === "%d") res.push(...utf8(String(parseInt(args[k++] ?? "0", 10) || 0)));
      else res.push(...unescape(p));
    }
  } while (slots > 0 && k < args.length);
  return new Uint8Array(res);
}

function wrap(text: string, width: number): string {
  if (width <= 0) return text;
  return (text.match(new RegExp(`.{1,${width}}`, "g")) ?? [""]).join("\n");
}

function xxd(bytes: Bytes): string {
  const rows: string[] = [];
  for (let off = 0; off < bytes.length; off += 16) {
    const chunk = [...bytes.slice(off, off + 16)];
    const hex = chunk.map((b) => b.toString(16).padStart(2, "0"));
    const groups: string[] = [];
    for (let i = 0; i < hex.length; i += 2) groups.push(hex.slice(i, i + 2).join(""));
    const ascii = chunk.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
    rows.push(`${off.toString(16).padStart(8, "0")}: ${groups.join(" ").padEnd(39)}  ${ascii}`);
  }
  return rows.join("\n") + (rows.length ? "\n" : "");
}

/* -------------------------------------------------------------------- jq */

function jq(ctx: Ctx, filter: string, input: Bytes): Proc {
  let value: unknown;
  try {
    value = JSON.parse(fromUtf8(input));
  } catch {
    return err(ctx, "jq: error (at <stdin>:0): Cannot parse input as JSON", 2);
  }
  const pretty = (v: unknown) => JSON.stringify(v, null, 2) ?? "null";
  const f = filter.trim();
  let results: unknown[];
  if (f === "." || f === "") results = [value];
  else if (f === "length") results = [Array.isArray(value) ? value.length : typeof value === "string" ? value.length : value && typeof value === "object" ? Object.keys(value).length : 0];
  else {
    const m = /^\.\[(-?\d*)\](?:\.([A-Za-z_]\w*))?$|^\.([A-Za-z_]\w*)$/.exec(f);
    if (!m) return err(ctx, `jq: the sandbox's jq knows ., length, .field, .[N] and .[].field (not ${f})`, 3);
    if (m[3]) results = [(value as Record<string, unknown>)?.[m[3]] ?? null];
    else {
      if (!Array.isArray(value)) return err(ctx, `jq: error (at <stdin>:0): Cannot index ${typeof value} with number`, 5);
      const picked = m[1] === "" ? value : [value[Number(m[1]) < 0 ? value.length + Number(m[1]) : Number(m[1])] ?? null];
      results = m[2] ? picked.map((x) => (x as Record<string, unknown>)?.[m[2]!] ?? null) : picked;
    }
  }
  return ok(results.map(pretty).join("\n") + "\n");
}

/* ------------------------------------------------------------------ curl */

interface CurlOpts {
  url: string | null;
  method: string | null;
  headers: [string, string][];
  data: string | null;
  json: boolean;
  include: boolean;
  head: boolean;
  silent: boolean;
  showErrors: boolean;
  verbose: boolean;
  maxTime: number | null;
}

function parseCurl(args: string[]): CurlOpts | string {
  const o: CurlOpts = { url: null, method: null, headers: [], data: null, json: false, include: false, head: false, silent: false, showErrors: false, verbose: false, maxTime: null };
  const takes = new Set(["-X", "--request", "-H", "--header", "-d", "--data", "--data-raw", "--data-binary", "--json", "-m", "--max-time", "-o", "--output", "-A", "--user-agent"]);
  const flag = (f: string, next: () => string | undefined): string | null => {
    switch (f) {
      case "-i":
      case "--include":
        o.include = true;
        return null;
      case "-I":
      case "--head":
        o.head = true;
        return null;
      case "-s":
      case "--silent":
        o.silent = true;
        return null;
      case "-S":
      case "--show-error":
        o.showErrors = true;
        return null;
      case "-v":
      case "--verbose":
        o.verbose = true;
        return null;
      case "-N":
      case "--no-buffer":
      case "-L":
      case "--location":
      case "--http1.1":
      case "-f":
      case "--fail":
        return null;
      case "-X":
      case "--request":
        o.method = next() ?? "";
        return null;
      case "-H":
      case "--header": {
        const h = next() ?? "";
        const i = h.indexOf(":");
        if (i < 0) return null;
        o.headers.push([h.slice(0, i).trim(), h.slice(i + 1).trim()]);
        return null;
      }
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
        o.data = (o.data === null ? "" : `${o.data}&`) + (next() ?? "");
        return null;
      case "--json":
        o.data = next() ?? "";
        o.json = true;
        return null;
      case "-m":
      case "--max-time": {
        const v = Number(next());
        if (!Number.isFinite(v) || v <= 0) return "curl: option --max-time: expected a proper numerical parameter";
        o.maxTime = Math.round(v * 1000);
        return null;
      }
      case "-o":
      case "--output":
      case "-A":
      case "--user-agent":
        next();
        return null;
      default:
        return `curl: option ${f}: is unknown\ncurl: try 'curl --help' for more information`;
    }
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const next = () => args[++i];
    if (a.startsWith("--")) {
      const e = flag(a, next);
      if (e) return e;
    } else if (a.startsWith("-") && a.length > 1) {
      // Short flags can be bundled: -sN, -iN, -sSv.
      const letters = a.slice(1).split("");
      for (let k = 0; k < letters.length; k++) {
        const f = `-${letters[k]}`;
        if (takes.has(f)) {
          const rest = letters.slice(k + 1).join("");
          const e = flag(f, () => (rest ? rest : next()));
          if (e) return e;
          break;
        }
        const e = flag(f, next);
        if (e) return e;
      }
    } else if (o.url === null) o.url = a;
  }
  return o;
}

interface Url {
  scheme: string;
  host: string;
  port: number;
  target: string;
}

function parseUrl(raw: string, defaultScheme: string): Url | null {
  const m = /^(?:([a-z]+):\/\/)?([^/:?#]+)(?::(\d+))?([^#]*)/i.exec(raw);
  if (!m) return null;
  const scheme = (m[1] ?? defaultScheme).toLowerCase();
  const port = m[3] ? Number(m[3]) : scheme === "https" || scheme === "wss" ? 443 : 80;
  let target = m[4] || "/";
  if (!target.startsWith("/")) target = `/${target}`;
  return { scheme, host: m[2]!.toLowerCase(), port, target };
}

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0", "chat.local"]);

function curlRequestHeaders(o: CurlOpts, url: Url): [string, string][] {
  const base: [string, string][] = [
    ["Host", url.port === 80 ? url.host : `${url.host}:${url.port}`],
    ["User-Agent", CURL_UA],
    ["Accept", o.json ? "application/json" : "*/*"],
  ];
  if (o.data !== null) {
    base.push(["Content-Type", o.json ? "application/json" : "application/x-www-form-urlencoded"]);
    base.push(["Content-Length", String(utf8(o.data).length)]);
  }
  // -H replaces a header of the same name; "Name:" with nothing removes it.
  for (const [k, v] of o.headers) {
    const i = base.findIndex(([n]) => n.toLowerCase() === k.toLowerCase());
    if (i >= 0) base.splice(i, 1);
    if (v !== "") base.push([k, v]);
  }
  return base;
}

function progress(ctx: Ctx, bytes: number) {
  const n = String(bytes).padStart(5);
  ctx.lines.push(out("  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current", "dim"));
  ctx.lines.push(out("                                 Dload  Upload   Total   Spent    Left  Speed", "dim"));
  ctx.lines.push(out(`100 ${n}  100 ${n}    0     0   ${Math.max(1, Math.round(bytes / 1.024))}      0 --:--:-- --:--:-- --:--:--  ${Math.max(1, Math.round(bytes / 1.024))}`, "dim"));
}

function curl(ctx: Ctx, args: string[], piped: boolean): Proc {
  const o = parseCurl(args);
  if (typeof o === "string") return err(ctx, o, 2);
  if (!o.url) return err(ctx, "curl: no URL specified!\ncurl: try 'curl --help' or 'curl --manual' for more information", 2);
  const url = parseUrl(o.url, "http");
  if (!url) return err(ctx, `curl: (3) URL rejected: Bad hostname`, 3);
  const loud = !o.silent || o.showErrors;
  if (url.scheme === "ws" || url.scheme === "wss") return err(ctx, loud ? `curl: (1) Protocol "${url.scheme}" not supported` : "", 1);
  if (url.scheme !== "http" && url.scheme !== "https") return err(ctx, `curl: (1) Protocol "${url.scheme}" not supported`, 1);
  if (!LOCAL.has(url.host)) return err(ctx, loud ? `curl: (6) Could not resolve host: ${url.host}` : "", 6);
  if (url.scheme === "https") return err(ctx, loud ? "curl: (35) OpenSSL/3.0.13: error:0A00010B:SSL routines::wrong version number" : "", 35);
  const method = o.method ?? (o.head ? "HEAD" : o.data !== null ? "POST" : "GET");
  const headers = curlRequestHeaders(o, url);
  act(ctx, {
    type: "http",
    client: "you",
    port: url.port,
    method,
    target: url.target,
    headers,
    ...(o.data !== null ? { body: o.data } : {}),
    ...(o.maxTime !== null ? { maxTime: o.maxTime } : { stopAfter: SANDBOX_STOP_MS }),
  });
  const ex = () => [...ctx.net.exchanges].reverse().find((e) => e.client === "you")!;
  if (ex().doneAt === null) act(ctx, { type: "await" });
  const e = ex();

  if (o.verbose) {
    ctx.lines.push(out(`*   Trying 127.0.0.1:${url.port}...`, "dim"));
    if (e.end === "refused") {
      ctx.lines.push(out(`* connect to 127.0.0.1 port ${url.port} failed: Connection refused`, "dim"));
      ctx.lines.push(out(`* Failed to connect to ${url.host} port ${url.port} after 0 ms: Couldn't connect to server`, "dim"));
      ctx.lines.push(out("* Closing connection", "dim"));
    } else {
      ctx.lines.push(out(`* Connected to ${url.host} (127.0.0.1) port ${url.port}`, "dim"));
      for (const line of requestText({ ...e, body: "" }).split("\r\n").slice(0, -2)) ctx.lines.push(out(`> ${line}`, "dim"));
      ctx.lines.push(out(">", "dim"));
      if (e.body) ctx.lines.push(out(`} [${utf8(e.body).length} bytes data]`, "dim"));
    }
  }
  if (e.end === "refused") return err(ctx, loud ? `curl: (7) Failed to connect to ${url.host} port ${url.port} after 0 ms: Couldn't connect to server` : "", 7);
  if (e.end === "dropped") return err(ctx, loud ? "curl: (52) Empty reply from server" : "", 52);

  let stdout = "";
  if (e.status !== null) {
    const head = [`HTTP/1.1 ${e.status} ${e.statusText}`, ...e.respHeaders.map(([k, v]) => `${k}: ${v}`)];
    if (o.verbose) {
      for (const line of head) ctx.lines.push(out(`< ${line}`, "dim"));
      ctx.lines.push(out("<", "dim"));
    } else if (o.include || o.head) stdout += `${head.join("\n")}\n\n`;
    if (!o.head) stdout += e.respBody;
  }
  const bodyBytes = utf8(e.respBody).length;
  if (piped && !o.silent && !o.verbose) progress(ctx, bodyBytes);
  const show = () => {
    if (!piped) printBytes(ctx, utf8(stdout));
  };
  if (e.status === 101) {
    // After 101 the connection speaks WebSocket frames; curl (built without ws support) just waits.
    show();
    ctx.lines.push(out("(The connection is now a WebSocket. curl does not speak it and would wait here until Ctrl+C; the sandbox closes it.)", "dim"));
    return { stdout: piped ? utf8(stdout) : EMPTY, code: 0 };
  }
  if (e.end === "clientTimeout") {
    show();
    if (loud) ctx.lines.push(out(`curl: (28) ${e.status === null ? "Connection" : "Operation"} timed out after ${e.doneAt! - e.sentAt} milliseconds with ${bodyBytes} bytes received`, "err"));
    return { stdout: piped ? utf8(stdout) : EMPTY, code: 28 };
  }
  if (e.end === "sandboxStop") {
    show();
    ctx.lines.push(out(`^C   (the sandbox stopped it after ${SANDBOX_STOP_MS / 1000} s, as if you pressed Ctrl+C; add --max-time to choose)`, "dim"));
    return { stdout: piped ? utf8(stdout) : EMPTY, code: 130 };
  }
  if (o.verbose) ctx.lines.push(out(`* Connection #0 to host ${url.host} left intact`, "dim"));
  return { stdout: utf8(stdout), code: 0 };
}

/* ----------------------------------------------------------------- wscat */

function wsHeaders(url: Url, extra: [string, string][]): [string, string][] {
  return [
    ["Sec-WebSocket-Version", "13"],
    ["Connection", "Upgrade"],
    ["Upgrade", "websocket"],
    ["Sec-WebSocket-Extensions", "permessage-deflate; client_max_window_bits"],
    ["Host", url.port === 80 ? url.host : `${url.host}:${url.port}`],
    ...extra,
  ];
}

function wscat(ctx: Ctx, args: string[]): Proc {
  let connect: string | null = null;
  let execute: string | null = null;
  let wait = 2;
  const extra: [string, string][] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-c" || a === "--connect") connect = args[++i] ?? null;
    else if (a === "-x" || a === "--execute") execute = args[++i] ?? "";
    else if (a === "-w" || a === "--wait") wait = Number(args[++i] ?? 2);
    else if (a === "-o" || a === "--origin") extra.push(["Origin", args[++i] ?? ""]);
    else if (a === "-H" || a === "--header") {
      const h = args[++i] ?? "";
      const k = h.indexOf(":");
      if (k > 0) extra.push([h.slice(0, k).trim(), h.slice(k + 1).trim()]);
    } else if (a === "-l" || a === "--listen") return err(ctx, "wscat: the sandbox runs wscat as a client only (-c)", 1);
    else if (a === "--no-color" || a === "-n" || a === "--no-check" || a === "-P" || a === "--show-ping-pong") continue;
    else if (a === "-h" || a === "--help") {
      return ok(
        "Usage: wscat [options] (--listen <port> | --connect <url>)\n\n  -c, --connect <url>          connect to a WebSocket server\n  -x, --execute <command>      execute command after connecting\n  -w, --wait <seconds>         wait given seconds after executing command\n  -o, --origin <origin>        optional origin\n  -H, --header <header:value>  set an HTTP header\n",
      );
    } else if (!a.startsWith("-") && connect === null) return err(ctx, `error: unknown argument '${a}'`, 1);
  }
  if (!connect) return err(ctx, "error: either --listen or --connect must be specified", 1);
  const url = parseUrl(connect, "ws");
  if (!url || !["ws", "wss", "http", "https"].includes(url.scheme)) return err(ctx, `error: Invalid URL: ${connect}`, 1);
  if (!LOCAL.has(url.host)) return err(ctx, `error: getaddrinfo ENOTFOUND ${url.host}`, 1);
  if (url.scheme === "wss" || url.scheme === "https") return err(ctx, "error: write EPROTO: SSL routines:ssl3_get_record:wrong version number", 1);
  const mark = ctx.lines.length;
  const events = act(ctx, { type: "wsOpen", client: "you", port: url.port, target: url.target, headers: wsHeaders(url, extra), interactive: execute === null });
  const failed = events.find((e) => e.type === "wsFailed" && e.client === "you");
  if (failed && failed.type === "wsFailed") return err(ctx, `error: ${failed.reason}`, 1);
  if (execute === null) {
    // Anything the server says right away comes after the "Connected" line.
    ctx.lines.splice(mark, 0, out("Connected (press CTRL+C to quit)", "add"));
    return ok();
  }
  act(ctx, { type: "wsSend", client: "you", text: execute });
  act(ctx, { type: "advance", ms: Math.max(0, Math.round((Number.isFinite(wait) ? wait : 2) * 1000)) });
  const c = [...ctx.net.conns].reverse().find((x) => x.client === "you");
  if (c && c.closedAt === null) {
    // ws.close() with no code: the close frame carries no status, which the server reads as 1005.
    ctx.closing.add(c.id);
    act(ctx, { type: "wsClose", client: "you", code: null });
  }
  return ok();
}

/* --------------------------------------------------------------- openssl */

function openssl(ctx: Ctx, args: string[], stdin: Bytes): Proc {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
      return err(ctx, "openssl: the sandbox needs a command, e.g. openssl rand -base64 16", 1);
    case "version":
      return ok("OpenSSL 3.0.13 30 Jan 2024 (Library: OpenSSL 3.0.13 30 Jan 2024)\n");
    case "rand": {
      const n = Number(rest.find((a) => /^\d+$/.test(a)));
      if (!Number.isFinite(n) || n <= 0) return err(ctx, "Usage: rand [options] num", 1);
      act(ctx, { type: "draw" });
      const bytes = seededBytes(ctx.net.draws, n);
      if (rest.includes("-base64")) return ok(`${wrap(toBase64(bytes), 64)}\n`);
      if (rest.includes("-hex")) return ok(`${toHex(bytes)}\n`);
      return { stdout: bytes, code: 0 };
    }
    case "sha1":
    case "dgst": {
      if (sub === "dgst" && !rest.includes("-sha1")) return err(ctx, "openssl: the sandbox's dgst only knows -sha1", 1);
      const files = rest.filter((a) => !a.startsWith("-"));
      let data = stdin;
      let name = "stdin";
      if (files[0]) {
        const f = ctx.net.files[files[0]];
        if (f === undefined) return err(ctx, `Could not open file or uri for loading data from ${files[0]}`, 1);
        data = utf8(f);
        name = files[0];
      }
      const digest = sha1(data);
      if (rest.includes("-binary")) return { stdout: digest, code: 0 };
      return ok(`SHA1(${name})= ${toHex(digest)}\n`);
    }
    case "base64":
    case "enc": {
      if (rest.includes("-d")) {
        const bytes = fromBase64(fromUtf8(stdin));
        return bytes ? { stdout: bytes, code: 0 } : err(ctx, "bad decrypt", 1);
      }
      const b = toBase64(stdin);
      return ok(`${rest.includes("-A") ? b : wrap(b, 64)}\n`);
    }
    default:
      return err(ctx, `Invalid command '${sub}'; type "help" for a list.`, 1);
  }
}

/* ------------------------------------------------------------ processes */

function nodeCmd(ctx: Ctx, args: string[], background: boolean, env: Record<string, string>): Proc {
  let code: string | undefined;
  let file: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-e" || a === "--eval" || a === "-p" || a === "--print") {
      const src = args[++i] ?? "";
      code = a === "-p" || a === "--print" ? `console.log(${src})` : src;
      file = "[eval]";
    } else if (a === "-v" || a === "--version") return ok("v22.12.0\n");
    else if (!a.startsWith("-") && file === undefined) file = a.replace(/^\.\//, "");
    else rest.push(a);
  }
  if (!file) return err(ctx, "node: the sandbox runs a file (node server.js) or code (node -e '...')", 9);
  const before = ctx.net.procs.length;
  const mark = ctx.lines.length;
  const events = act(ctx, { type: "node", file, ...(code !== undefined ? { code } : {}), ...(Object.keys(env).length ? { env } : {}), ...(rest.length ? { args: rest } : {}) });
  const failed = events.find((e) => e.type === "procFailed");
  if (failed && failed.type === "procFailed") return err(ctx, failed.text, 1);
  const started = events.find((e) => e.type === "procStarted");
  const p = ctx.net.procs[before];
  if (!p) return ok();
  if (started && started.type === "procStarted") ctx.lines.splice(mark, 0, ...started.logs.map((l) => out(l)));
  if (background) {
    ctx.lines.splice(mark, 0, out(`[${jobOf(ctx.net, p.pid)}] ${p.pid}`));
    return ok();
  }
  if (!p.alive) return { stdout: EMPTY, code: p.exit?.code ?? 0 };
  if (p.ports.length) {
    ctx.lines.push(out(`(node keeps running and would hold this terminal; here it runs in the background, as with &. Stop it with: kill ${p.pid})`, "dim"));
    return ok();
  }
  // A script runs in the foreground until it is done.
  ctx.fg = p.pid;
  act(ctx, { type: "awaitExit", pid: p.pid, max: SANDBOX_STOP_MS });
  const now = ctx.net.procs.find((x) => x.pid === p.pid)!;
  if (now.alive) {
    ctx.lines.push(out(`(still running after ${SANDBOX_STOP_MS / 1000} s; the sandbox leaves it in the background, as with &. Stop it with: kill ${p.pid})`, "dim"));
    ctx.fg = null;
    return ok();
  }
  return { stdout: EMPTY, code: now.exit?.code ?? 0 };
}

const SIGNALS: Record<string, "TERM" | "KILL" | "INT"> = {
  "-9": "KILL",
  "-KILL": "KILL",
  "-SIGKILL": "KILL",
  "-15": "TERM",
  "-TERM": "TERM",
  "-SIGTERM": "TERM",
  "-2": "INT",
  "-INT": "INT",
  "-SIGINT": "INT",
};

function kill(ctx: Ctx, args: string[]): Proc {
  let sig: "TERM" | "KILL" | "INT" = "TERM";
  const targets: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (SIGNALS[a]) sig = SIGNALS[a]!;
    else if (a === "-s") sig = SIGNALS[`-${args[++i] ?? "TERM"}`] ?? "TERM";
    else targets.push(a);
  }
  if (!targets.length) return err(ctx, "kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ...", 2);
  let code = 0;
  for (const t of targets) {
    const pid = t.startsWith("%") ? ctx.net.procs[Number(t.slice(1)) - 1]?.pid : Number(t);
    const p = ctx.net.procs.find((x) => x.pid === pid && x.alive);
    if (!p) {
      err(ctx, t.startsWith("%") ? `bash: kill: ${t}: no such job` : `bash: kill: (${t}) - No such process`);
      code = 1;
      continue;
    }
    act(ctx, { type: "kill", pid: p.pid, signal: sig });
  }
  return { stdout: EMPTY, code };
}

function pkill(ctx: Ctx, args: string[]): Proc {
  const sig = (args.map((a) => SIGNALS[a]).find(Boolean) ?? "TERM") as "TERM" | "KILL" | "INT";
  const pattern = args.filter((a) => !a.startsWith("-")).pop();
  if (!pattern) return err(ctx, "pkill: no matching criteria specified", 2);
  const full = args.includes("-f");
  const hits = ctx.net.procs.filter((p) => p.alive && (full ? `${p.kind === "tshark" ? "tshark" : "node"} ${p.file}`.includes(pattern) : (p.kind === "tshark" ? "tshark" : "node").includes(pattern)));
  for (const p of hits) act(ctx, { type: "kill", pid: p.pid, signal: sig });
  return { stdout: EMPTY, code: hits.length ? 0 : 1 };
}

function ps(ctx: Ctx, args: string[]): Proc {
  const alive = ctx.net.procs.filter((p) => p.alive);
  const cmd = (p: (typeof alive)[number]) => (p.kind === "tshark" ? "tshark -i lo" : p.file === "[eval]" ? "node -e" : `node ${p.file}`);
  if (args.some((a) => a.includes("aux") || a === "-ef")) {
    return ok(
      [
        "USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND",
        "you         4100  0.0  0.1  10032  5120 pts/0    Ss   10:00   0:00 -bash",
        ...alive.map((p) => `you         ${p.pid}  0.1  0.9 1021432 48120 pts/0   Sl   10:00   0:00 ${cmd(p)}`),
      ].join("\n") + "\n",
    );
  }
  return ok(["    PID TTY          TIME CMD", "   4100 pts/0    00:00:00 bash", ...alive.map((p) => `   ${p.pid} pts/0    00:00:00 ${p.kind === "tshark" ? "tshark" : "node"}`)].join("\n") + "\n");
}

function jobs(ctx: Ctx): Proc {
  const lines = ctx.net.procs.map((p, i) => (p.alive ? `[${i + 1}]  Running                 ${cmdOf(ctx.net, p.pid)} &` : null)).filter(Boolean);
  return ok(lines.length ? `${lines.join("\n")}\n` : "");
}

/* ---------------------------------------------------------------- tools */

function tshark(ctx: Ctx, args: string[], background: boolean): Proc {
  let verbose = false;
  let websocketOnly = false;
  let port: number | null = null;
  let duration: number | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-i") {
      const dev = args[++i];
      if (dev !== "lo" && dev !== "any") return err(ctx, `tshark: The capture session could not be initiated on capture device "${dev}" (No such device exists).`, 2);
    } else if (a === "-Y") {
      const f = args[++i] ?? "";
      if (/websocket/.test(f)) websocketOnly = true;
      const m = /tcp\.port\s*==\s*(\d+)/.exec(f);
      if (m) port = Number(m[1]);
    } else if (a === "-f") {
      const m = /port\s+(\d+)/.exec(args[++i] ?? "");
      if (m) port = Number(m[1]);
    } else if (a === "-O" || a === "-V") {
      if (a === "-O") i++;
      verbose = true;
    } else if (a === "-a") {
      const m = /duration:(\d+)/.exec(args[++i] ?? "");
      if (m) duration = Number(m[1]) * 1000;
    }
  }
  if (ctx.sudo) ctx.lines.push(out('Running as user "root" and group "root". This could be dangerous.', "dim"));
  const mark = ctx.lines.length;
  const events = act(ctx, { type: "tshark", verbose, websocketOnly, port });
  const started = events.find((e) => e.type === "captured");
  const pid = started && started.type === "captured" ? started.pid : null;
  if (pid === null) return ok();
  if (background) {
    ctx.lines.splice(mark, 0, out(`[${jobOf(ctx.net, pid)}] ${pid}`));
    return ok();
  }
  // In the foreground, tshark holds the terminal until its -a duration (or the sandbox stops it).
  ctx.fg = pid;
  act(ctx, { type: "advance", ms: duration ?? SANDBOX_STOP_MS });
  if (duration === null) ctx.lines.push(out(`^C   (the sandbox stopped it after ${SANDBOX_STOP_MS / 1000} s; run it with & to capture while you work)`, "dim"));
  act(ctx, { type: "kill", pid, signal: "INT" });
  return ok();
}

function nginx(ctx: Ctx, args: string[]): Proc {
  if (!ctx.net.nginx && !ctx.net.files[NGINX_CONF]) return err(ctx, "Command 'nginx' not found, but can be installed with:\nsudo apt install nginx", 127);
  if (args.includes("-v") || args.includes("-V")) return ok("nginx version: nginx/1.24.0 (Ubuntu)\n");
  if (args.includes("-t")) {
    const r = parseNginx(ctx.net.files[NGINX_CONF] ?? "");
    if (!r.ok) return err(ctx, `${r.error}\nnginx: configuration file /etc/nginx/nginx.conf test failed`, 1);
    return ok("nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful\n");
  }
  const s = args.indexOf("-s");
  if (s >= 0) {
    if (!ctx.sudo) {
      return err(ctx, 'nginx: [alert] could not open error log file: open() "/var/log/nginx/error.log" failed (13: Permission denied)\nnginx: [error] open() "/run/nginx.pid" failed (13: Permission denied)', 1);
    }
    if (args[s + 1] !== "reload") return err(ctx, `nginx: the sandbox knows "nginx -s reload"`, 1);
    const events = act(ctx, { type: "nginxReload" });
    const r = events.find((e) => e.type === "nginx");
    if (r && r.type === "nginx" && !r.ok) return err(ctx, r.text, 1);
    return ok();
  }
  return err(ctx, "nginx: the sandbox knows nginx -t and nginx -s reload", 1);
}

function systemctl(ctx: Ctx, args: string[]): Proc {
  const [verb, unit] = args;
  const name = (unit ?? "").replace(/\.service$/, "");
  if (name !== "nginx" && name !== "redis-server" && name !== "redis") return err(ctx, `Failed to ${verb ?? "run"} ${unit ?? ""}: Unit ${unit ?? ""}.service not found.`, 5);
  if (verb === "status") {
    const up = name === "nginx" ? ctx.net.nginx !== null : ctx.net.redis;
    return ok(`● ${name}.service\n     Active: ${up ? "active (running)" : "inactive (dead)"} since Sat 2026-11-21 09:58:12 UTC\n`);
  }
  if (!ctx.sudo) return err(ctx, `Failed to ${verb} ${name}.service: Interactive authentication required.`, 1);
  if (name === "nginx" && (verb === "reload" || verb === "restart")) {
    const events = act(ctx, { type: "nginxReload" });
    const r = events.find((e) => e.type === "nginx");
    if (r && r.type === "nginx" && !r.ok) {
      return err(ctx, `Job for nginx.service failed because the control process exited with error code.\nSee "systemctl status nginx.service" and "journalctl -xeu nginx.service" for details.`, 1);
    }
    return ok();
  }
  return err(ctx, "the sandbox knows systemctl status|reload|restart nginx", 1);
}

function iptables(ctx: Ctx, args: string[]): Proc {
  if (!ctx.sudo) return err(ctx, "iptables v1.8.10 (nf_tables): Could not fetch rule set generation id: Permission denied (you must be root)", 4);
  if (args.includes("-L")) {
    const rules = ctx.net.blocked.map((p) => `DROP       tcp  --  anywhere             anywhere             tcp dpt:${p}`);
    return ok(`Chain INPUT (policy ACCEPT)\ntarget     prot opt source               destination\n${rules.join("\n")}${rules.length ? "\n" : ""}`);
  }
  if (args.includes("-F")) {
    for (const p of [...ctx.net.blocked]) act(ctx, { type: "block", port: p, on: false });
    return ok();
  }
  const add = args.includes("-A") || args.includes("-I");
  const del = args.includes("-D");
  const d = args.indexOf("--dport");
  const port = d >= 0 ? Number(args[d + 1]) : NaN;
  const target = args[args.indexOf("-j") + 1];
  if ((!add && !del) || !Number.isFinite(port) || (target !== "DROP" && target !== "REJECT")) {
    return err(ctx, "iptables: the sandbox knows: iptables -A INPUT -p tcp --dport PORT -j DROP (and -D to remove it, -F, -L)", 2);
  }
  if (del && !ctx.net.blocked.includes(port)) return err(ctx, "iptables: Bad rule (does a matching rule exist in that chain?).", 1);
  act(ctx, { type: "block", port, on: add });
  return ok();
}

function redisCli(ctx: Ctx, args: string[]): Proc {
  if (!ctx.net.redis) return err(ctx, "Could not connect to Redis at 127.0.0.1:6379: Connection refused", 1);
  const [cmd, ...rest] = args;
  switch ((cmd ?? "").toUpperCase()) {
    case "PING":
      return ok("PONG\n");
    case "PUBLISH": {
      if (rest.length < 2) return err(ctx, "(error) ERR wrong number of arguments for 'publish' command", 1);
      const n = ctx.net.rt?.redis.filter((r) => r.client.channels.has(rest[0]!) && r.client.status === "ready").length ?? 0;
      act(ctx, { type: "redisPublish", channel: rest[0]!, message: rest[1]! });
      return ok(`(integer) ${n}\n`);
    }
    default:
      return err(ctx, "(error) ERR the sandbox's redis-cli knows PING and PUBLISH", 1);
  }
}

/* --------------------------------------------------------------- the rest */

const HELP = `Commands in this terminal:
  curl URL                    make an HTTP request (-i headers, -v everything, -H, -X, -d, --json, -N, --max-time)
  wscat -c ws://HOST:PORT     open a WebSocket (-x MESSAGE -w SECONDS sends one and waits; -o ORIGIN)
  node FILE / node -e 'CODE'  run Node code (with & it runs in the background); kill, pkill -f, ps, jobs
  sudo tshark -i lo -Y websocket [-O websocket] &   watch the frames go by
  sudo nginx -t / sudo nginx -s reload              check and load /etc/nginx/conf.d/chat.conf
  sudo iptables -A INPUT -p tcp --dport PORT -j DROP   drop a port's packets (-D to undo)
  redis-cli PING / PUBLISH    talk to Redis
  openssl, printf, echo, base64, xxd, wc -c, jq, grep, seq   work on text and bytes, joined with |
  sleep N                     let N seconds pass
  ls / cat FILE / nano FILE / clear
The chat runs on this machine: the API on http://localhost:8080, WebSocket on ws://localhost:${WS_PORT}.`;

function ls(ctx: Ctx, args: string[]): Proc {
  const dir = args.find((a) => !a.startsWith("-"));
  const names = Object.keys(ctx.net.files);
  if (!dir) {
    const here = names.filter((n) => !n.startsWith("/")).sort();
    return ok(here.length ? `${here.join("  ")}\n` : "");
  }
  const prefix = dir.replace(/\/$/, "") + "/";
  const inside = names.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length).split("/")[0]!);
  if (!inside.length) {
    if (names.includes(dir)) return ok(`${dir}\n`);
    return err(ctx, `ls: cannot access '${dir}': No such file or directory`, 2);
  }
  return ok(`${[...new Set(inside)].sort().join("  ")}\n`);
}

function exec(ctx: Ctx, input: string[], stdin: Bytes, piped: boolean, background: boolean): Proc {
  let words = [...input];
  // VAR=value before a command sets it for that command only.
  const env: Record<string, string> = {};
  while (words.length > 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!)) {
    const w = words.shift()!;
    env[w.slice(0, w.indexOf("="))] = w.slice(w.indexOf("=") + 1);
  }
  if (words[0] === "sudo") {
    words = words.slice(1);
    ctx.sudo = true;
  }
  const [cmd, ...args] = words;
  // Working something out counts as a command; looking around does not, nor does a typo.
  if (cmd && COMMANDS.includes(cmd) && !LOOKS.has(cmd)) ctx.moved = true;
  switch (cmd) {
    case "help":
      return ok(`${HELP}\n`);
    case "pwd":
      return ok("/home/you/chat\n");
    case "ls":
      return ls(ctx, args);
    case "cat": {
      if (!args.length) return { stdout: stdin, code: 0 };
      let text = "";
      for (const f of args) {
        const body = ctx.net.files[f.replace(/^\.\//, "")];
        if (body === undefined) return err(ctx, `cat: ${f}: No such file or directory`, 1);
        text += body.endsWith("\n") ? body : `${body}\n`;
      }
      return ok(text);
    }
    case "echo": {
      let newline = true;
      let escapes = false;
      const rest = [...args];
      while (rest[0] && /^-[neE]+$/.test(rest[0])) {
        const f = rest.shift()!;
        if (f.includes("n")) newline = false;
        if (f.includes("e")) escapes = true;
      }
      const text = rest.join(" ");
      const bytes = escapes ? new Uint8Array(unescape(text)) : utf8(text);
      return ok(newline ? new Uint8Array([...bytes, 10]) : bytes);
    }
    case "printf":
      if (!args.length) return err(ctx, "printf: usage: printf [-v var] format [arguments]", 2);
      return ok(printf(args[0]!, args.slice(1)));
    case "seq": {
      const nums = args.map(Number);
      const [a, b] = nums.length === 1 ? [1, nums[0]!] : [nums[0]!, nums[1]!];
      if (!Number.isFinite(a) || !Number.isFinite(b)) return err(ctx, `seq: invalid floating point argument: '${args[0] ?? ""}'`, 1);
      const list: number[] = [];
      for (let i = a; i <= b && list.length < 1000; i++) list.push(i);
      return ok(list.length ? `${list.join("\n")}\n` : "");
    }
    case "base64": {
      const decode = args.includes("-d") || args.includes("--decode");
      const file = args.find((a) => !a.startsWith("-") && !/^\d+$/.test(a));
      const input = file ? utf8(ctx.net.files[file] ?? "") : stdin;
      if (decode) {
        const bytes = fromBase64(fromUtf8(input));
        return bytes ? { stdout: bytes, code: 0 } : err(ctx, "base64: invalid input", 1);
      }
      const w = args.indexOf("-w");
      const width = w >= 0 ? Number(args[w + 1]) : 76;
      return ok(`${wrap(toBase64(input), width)}\n`);
    }
    case "xxd": {
      const file = args.find((a) => !a.startsWith("-"));
      const raw = file ? ctx.net.files[file] : undefined;
      if (file && raw === undefined) return err(ctx, `xxd: ${file}: No such file or directory`, 2);
      const input = raw !== undefined ? Uint8Array.from(raw, (c) => c.charCodeAt(0) & 0xff) : stdin;
      if (args.includes("-r")) {
        const hex = fromUtf8(input).replace(/[^0-9a-fA-F]/g, "");
        return ok(Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16)));
      }
      return ok(args.includes("-p") ? `${wrap(toHex(input), 60)}\n` : xxd(input));
    }
    case "wc": {
      if (!args.includes("-c")) return err(ctx, "wc: the sandbox counts bytes: wc -c", 1);
      const file = args.find((a) => !a.startsWith("-"));
      const raw = file ? ctx.net.files[file] : undefined;
      if (file && raw === undefined) return err(ctx, `wc: ${file}: No such file or directory`, 1);
      return ok(raw !== undefined ? `${raw.length} ${file}\n` : `${stdin.length}\n`);
    }
    case "jq":
      return jq(ctx, args.find((a) => !a.startsWith("-")) ?? ".", stdin);
    case "grep": {
      const pattern = args.find((a) => !a.startsWith("-"));
      if (!pattern) return err(ctx, "Usage: grep [OPTION]... PATTERNS [FILE]...", 2);
      const lines = fromUtf8(stdin)
        .split("\n")
        .filter((l) => l.includes(pattern));
      return { stdout: utf8(lines.length ? `${lines.join("\n")}\n` : ""), code: lines.length ? 0 : 1 };
    }
    case "sleep": {
      const s = Number((args[0] ?? "").replace(/s$/, ""));
      if (!Number.isFinite(s) || s < 0) return err(ctx, `sleep: invalid time interval '${args[0] ?? ""}'`, 1);
      act(ctx, { type: "advance", ms: Math.round(s * 1000) });
      return ok();
    }
    case "curl":
      return curl(ctx, args, piped);
    case "wscat":
      return wscat(ctx, args);
    case "openssl":
      return openssl(ctx, args, stdin);
    case "node":
      return nodeCmd(ctx, args, background, env);
    case "kill":
      return kill(ctx, args);
    case "pkill":
      return pkill(ctx, args);
    case "ps":
      return ps(ctx, args);
    case "jobs":
      return jobs(ctx);
    case "tshark":
      return tshark(ctx, args, background);
    case "nginx":
      return nginx(ctx, args);
    case "systemctl":
      return systemctl(ctx, args);
    case "iptables":
      return iptables(ctx, args);
    case "redis-cli":
      return redisCli(ctx, args);
    case "clear":
    case "nano":
    case "export":
    case undefined:
      return ok();
    default:
      return err(ctx, `${cmd}: command not found`, 127);
  }
}

/** Splits at unquoted `|`; core's shellWords keeps a bare `|` as its own word. */
function stages(words: string[]): string[][] {
  const res: string[][] = [[]];
  for (const w of words) {
    if (w === "|") res.push([]);
    else res[res.length - 1]!.push(w);
  }
  return res;
}

/** `a|b` with no spaces: give the pipe room so shellWords sees it, outside quotes. */
function spacePipes(line: string): string {
  let res = "";
  let quote: string | null = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      res += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      res += ch;
    } else if (ch === "|") res += " | ";
    else res += ch;
  }
  return res;
}

/** Runs one pipeline; `capture` keeps the output (for `$(...)`) instead of printing it. */
function runPipeline(ctx: Ctx, line: string, opts: { capture?: boolean; background?: boolean } = {}): Proc {
  let words = shellWords(spacePipes(line));
  // NAME=value on its own sets a shell variable.
  if (words.length && words.every((w) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || w === "export")) {
    for (const w of words) {
      if (w === "export") continue;
      const i = w.indexOf("=");
      act(ctx, { type: "set", name: w.slice(0, i), value: w.slice(i + 1) });
    }
    return ok();
  }
  let redirect: { file: string; append: boolean } | null = null;
  const r = words.findIndex((w) => w === ">" || w === ">>");
  if (r >= 0) {
    redirect = { file: words[r + 1] ?? "", append: words[r] === ">>" };
    words = [...words.slice(0, r), ...words.slice(r + 2)];
  }
  const parts = stages(words);
  let data: Bytes = EMPTY;
  let code = 0;
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const p = exec(ctx, parts[i]!, data, !last || Boolean(redirect) || Boolean(opts.capture), Boolean(opts.background));
    data = p.stdout;
    code = p.code;
  }
  if (redirect) {
    // Files hold bytes as latin1 characters, so `xxd` and `wc -c` see what was written.
    const before = redirect.append ? (ctx.net.files[redirect.file] ?? "") : "";
    act(ctx, { type: "write", path: redirect.file, text: before + String.fromCharCode(...data) });
    ctx.moved = true;
    return { stdout: EMPTY, code };
  }
  const network = parts.some((p) => ["curl", "wscat", "node", "redis-cli"].includes(p[0] ?? ""));
  const text = shown(data).trim();
  if (!opts.capture) printBytes(ctx, data);
  // What the terminal worked out stays visible to the scenario (a key, a hash, a base64 value).
  if (!network && text && data.length < 400) act(ctx, { type: "print", text });
  return { stdout: data, code };
}

/** One line typed in wscat: it goes to the server as a text frame. */
function wscatLine(net: Net, line: string): CliResult {
  const ctx = newCtx(net);
  act(ctx, { type: "wsSend", client: "you", text: line });
  return { actions: ctx.actions, output: ctx.lines, moves: 1 };
}

const newCtx = (net: Net): Ctx => ({ net, actions: [], lines: [], moved: false, fg: null, closing: new Set(), sudo: false });

/** `for i in $(seq 1 5); do ...; done` */
function forLoop(ctx: Ctx, line: string): number | null {
  const m = /^for\s+([A-Za-z_]\w*)\s+in\s+(.+?)\s*;\s*do\s+(.+?)\s*;?\s*done$/.exec(line.trim());
  if (!m) return null;
  const items = expand(ctx, m[2]!).split(/\s+/).filter(Boolean);
  let code = 0;
  for (const item of items.slice(0, 200)) code = runChain(ctx, m[3]!, { [m[1]!]: item });
  return code;
}

function runChain(ctx: Ctx, line: string, vars: Record<string, string> = {}): number {
  const chain = splitChain(line);
  let code = 0;
  for (const { cmd, op, bg } of chain) {
    if (op === "&&" && code !== 0) break;
    ctx.sudo = false;
    const expanded = expand(ctx, cmd, vars);
    const first = shellWords(expanded).filter((w) => !/^[A-Za-z_]\w*=/.test(w) && w !== "sudo")[0] ?? "";
    if (bg && first !== "node" && first !== "tshark") {
      // `a & b`: bash starts a in the background and goes on with b. A URL with an unquoted & splits here.
      ctx.lines.push(out(`[${ctx.net.procs.length + 1}] ${4300 + ctx.actions.length}`));
      code = runPipeline(ctx, expanded).code;
      ctx.lines.push(out(`[${ctx.net.procs.length + 1}]+  Done                    ${cmd.trim()}`, "dim"));
      continue;
    }
    code = runPipeline(ctx, expanded, { background: bg }).code;
  }
  return code;
}

export function runLine(net: Net, raw: string): CliResult {
  if (wscatConn(net)) return wscatLine(net, raw);
  const line = raw.trim();
  if (!line) return { actions: [], output: [], moves: 0 };
  const words = shellWords(line);
  const first = words[0] === "sudo" ? words[1] : words[0];
  if (first === "clear") return { actions: [], output: [], moves: 0, clear: true };
  if (first === "nano" || first === "vim" || first === "vi") return nano(net, words[words[0] === "sudo" ? 2 : 1], words[0] === "sudo");
  const ctx = newCtx(net);
  if (/^for\s/.test(line)) {
    const r = forLoop(ctx, line);
    if (r === null) return { actions: [], output: [out("bash: syntax error: the sandbox reads: for i in $(seq 1 5); do COMMAND; done", "err")], moves: 0 };
  } else runChain(ctx, line);
  return { actions: ctx.actions, output: ctx.lines, moves: ctx.moved ? 1 : 0 };
}

/** Splits a line at unquoted `&&`, `;` and `&` (which sends what came before to the background). */
function splitChain(line: string): { cmd: string; op: "&&" | ";" | null; bg: boolean }[] {
  const res: { cmd: string; op: "&&" | ";" | null; bg: boolean }[] = [];
  let cur = "";
  let quote: string | null = null;
  let op: "&&" | ";" | null = null;
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && ch === "&" && line[i + 1] === "&") {
      res.push({ cmd: cur, op, bg: false });
      op = "&&";
      cur = "";
      i++;
      continue;
    }
    if (depth === 0 && ch === "&" && line[i - 1] !== ">" && line[i + 1] !== ">") {
      res.push({ cmd: cur, op, bg: true });
      op = ";";
      cur = "";
      continue;
    }
    if (depth === 0 && ch === ";") {
      res.push({ cmd: cur, op, bg: false });
      op = ";";
      cur = "";
      continue;
    }
    cur += ch;
  }
  res.push({ cmd: cur, op, bg: false });
  return res.filter((c) => c.cmd.trim());
}

function nano(net: Net, file: string | undefined, sudo: boolean): CliResult {
  if (!file) return { actions: [], output: [out("nano: the sandbox opens a file: nano server.js", "err")], moves: 0 };
  const path = file.replace(/^\.\//, "");
  return {
    actions: [],
    output: [],
    moves: 0,
    editor: {
      file: path,
      text: net.files[path] ?? "",
      save: (_state, text) =>
        path.startsWith("/etc/") && !sudo
          ? { actions: [], output: [out(`[ Error writing ${path}: Permission denied ]  (open it with: sudo nano ${path})`, "err")], moves: 0 }
          : { actions: [{ type: "write", path, text }], output: [], moves: 1 },
    },
  };
}

/** Ctrl+C: leaves wscat. wscat closes with no status code, so the server sees 1005. */
export function interrupt(net: Net): CliResult {
  const c = wscatConn(net);
  if (!c) return { actions: [], output: [], moves: 0 };
  const ctx = newCtx(net);
  ctx.closing.add(c.id);
  act(ctx, { type: "wsClose", client: "you", code: null });
  return { actions: ctx.actions, output: ctx.lines, moves: 0 };
}

export function completeLine(net: Net, input: string): { input: string; options: string[] } {
  if (wscatConn(net)) return { input, options: [] };
  const words = input.split(/\s+/);
  if (words.length <= 1) return complete(input, COMMANDS);
  const files = Object.keys(net.files);
  const urls = ["localhost:8080/", "localhost:8080/messages", "localhost:8080/events", `ws://localhost:${WS_PORT}`, `localhost:${WS_PORT}`];
  return complete(input, [...files, ...urls, "--max-time", "--include", "--header", "--json", "-binary", "-base64", "websocket"]);
}

export const wsShell: CommandLine<NetAction, Net> = {
  run: runLine,
  prompt: promptFor,
  complete: completeLine,
  interrupt,
  title: "bash",
};

export { header };
