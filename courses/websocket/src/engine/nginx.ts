/**
 * A small reading of an nginx site config: `server { listen; location { proxy_* } }`, with the
 * errors `nginx -t` prints for the mistakes people make. Directives the sandbox does not act on
 * are still accepted when nginx knows them.
 */

export const NGINX_VERSION = "nginx/1.24.0 (Ubuntu)";
export const NGINX_CONF = "/etc/nginx/conf.d/chat.conf";

export interface Location {
  path: string;
  proxyPass: { port: number; path: string } | null;
  httpVersion: "1.0" | "1.1";
  /** proxy_set_header Name Value, in order; the value may hold $http_upgrade and friends. */
  setHeaders: [string, string][];
  /** proxy_read_timeout in ms (nginx's default is 60 s). */
  readTimeout: number;
}

export interface NginxConf {
  listen: number;
  locations: Location[];
}

const KNOWN = new Set([
  "listen",
  "server_name",
  "location",
  "proxy_pass",
  "proxy_http_version",
  "proxy_set_header",
  "proxy_read_timeout",
  "proxy_send_timeout",
  "proxy_connect_timeout",
  "proxy_buffering",
  "proxy_cache_bypass",
  "root",
  "index",
  "access_log",
  "error_log",
  "client_max_body_size",
  "keepalive_timeout",
  "add_header",
  "return",
]);

interface Token {
  text: string;
  line: number;
  quoted: boolean;
}

function tokens(src: string): Token[] {
  const out: Token[] = [];
  let line = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === "\n") {
      line++;
      continue;
    }
    if (/\s/.test(ch)) continue;
    if (ch === "#") {
      while (i < src.length && src[i] !== "\n") i++;
      i--;
      continue;
    }
    if (ch === "{" || ch === "}" || ch === ";") {
      out.push({ text: ch, line, quoted: false });
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== ch) s += src[j++];
      out.push({ text: s, line, quoted: true });
      i = j;
      continue;
    }
    let s = "";
    while (i < src.length && !/[\s{};]/.test(src[i]!)) s += src[i++];
    i--;
    out.push({ text: s, line, quoted: false });
  }
  return out;
}

export function parseTime(v: string): number | null {
  const m = /^(\d+)(ms|s|m|h|d)?$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return n * { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[(m[2] ?? "s") as "s"];
}

export type Parsed = { ok: true; conf: NginxConf } | { ok: false; error: string };

/** Reads the site config, or says what `nginx -t` would complain about. */
export function parseNginx(src: string, file = NGINX_CONF): Parsed {
  const t = tokens(src);
  const at = (tok: Token | undefined) => `${file}:${tok?.line ?? src.split("\n").length}`;
  const emerg = (msg: string, tok: Token | undefined): Parsed => ({ ok: false, error: `nginx: [emerg] ${msg} in ${at(tok)}` });
  let i = 0;
  const conf: NginxConf = { listen: 80, locations: [] };

  /** Reads one directive's words up to ';'. */
  const statement = (): { words: Token[]; end: Token | undefined } | Parsed => {
    const words: Token[] = [];
    while (i < t.length && t[i]!.text !== ";" ) {
      if (!t[i]!.quoted && (t[i]!.text === "{" || t[i]!.text === "}")) return emerg(`unexpected "${t[i]!.text}"`, t[i]);
      words.push(t[i++]!);
    }
    if (i >= t.length) return emerg("unexpected end of file, expecting \";\" or \"}\"", t[t.length - 1]);
    return { words, end: t[i++] };
  };

  const block = (inLocation: Location | null): Parsed | null => {
    while (i < t.length) {
      const tok = t[i]!;
      if (tok.text === "}" && !tok.quoted) {
        i++;
        return null;
      }
      const name = tok.text;
      if (!KNOWN.has(name) && name !== "server") return emerg(`unknown directive "${name}"`, tok);
      if (name === "location") {
        if (inLocation) return emerg(`"location" directive is not allowed here`, tok);
        i++;
        const path = t[i++];
        if (!path || path.text === "{") return emerg(`invalid number of arguments in "location" directive`, tok);
        if (t[i]?.text !== "{") return emerg(`directive "location" has no opening "{"`, tok);
        i++;
        const loc: Location = { path: path.text, proxyPass: null, httpVersion: "1.0", setHeaders: [], readTimeout: 60_000 };
        const r = block(loc);
        if (r) return r;
        conf.locations.push(loc);
        continue;
      }
      i++;
      const st = statement();
      if ("ok" in st) return st;
      const args = st.words.map((w) => w.text);
      switch (name) {
        case "listen":
          conf.listen = Number(args[0]?.split(":").pop()) || 80;
          break;
        case "proxy_pass": {
          if (!inLocation) return emerg(`"proxy_pass" directive is not allowed here`, tok);
          const m = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::(\d+))?(\/.*)?$/.exec(args[0] ?? "");
          if (!m) return emerg(`invalid URL prefix in "${args[0] ?? ""}"`, tok);
          inLocation.proxyPass = { port: Number(m[1] ?? 80), path: m[2] ?? "" };
          break;
        }
        case "proxy_http_version":
          if (!inLocation) break;
          if (args[0] !== "1.0" && args[0] !== "1.1") return emerg(`invalid value "${args[0] ?? ""}" in "proxy_http_version" directive, it must be "1.0" or "1.1"`, tok);
          inLocation.httpVersion = args[0];
          break;
        case "proxy_set_header":
          if (args.length !== 2) return emerg(`invalid number of arguments in "proxy_set_header" directive`, tok);
          inLocation?.setHeaders.push([args[0]!, args[1]!]);
          break;
        case "proxy_read_timeout": {
          const ms = parseTime(args[0] ?? "");
          if (ms === null) return emerg(`"proxy_read_timeout" directive invalid value`, tok);
          if (inLocation) inLocation.readTimeout = ms;
          break;
        }
      }
    }
    if (inLocation) return emerg(`unexpected end of file, expecting "}"`, t[t.length - 1]);
    return null;
  };

  // The file holds one server block.
  if (t[i]?.text !== "server") return emerg(t[i] ? `unknown directive "${t[i]!.text}"` : "no server block", t[i]);
  i++;
  if (t[i]?.text !== "{") return emerg(`directive "server" has no opening "{"`, t[i]);
  i++;
  const r = block(null);
  if (r) return r;
  if (i < t.length) return emerg(`unexpected "${t[i]!.text}"`, t[i]);
  return { ok: true, conf };
}

/** The location nginx picks for a path: the longest matching prefix. */
export function pickLocation(conf: NginxConf, path: string): Location | null {
  return conf.locations.filter((l) => path.startsWith(l.path)).sort((a, b) => b.path.length - a.path.length)[0] ?? null;
}

const HOP = new Set(["connection", "upgrade", "keep-alive", "te", "trailer", "transfer-encoding", "proxy-connection", "proxy-authenticate", "proxy-authorization"]);

/**
 * The request nginx sends upstream: Host and `Connection: close` unless set, the hop-by-hop
 * headers dropped, then proxy_set_header applied ($http_upgrade is the client's Upgrade header;
 * an empty value means the header is not sent).
 */
export function upstreamHeaders(loc: Location, client: [string, string][], upstreamPort: number): [string, string][] {
  const get = (n: string) => client.find(([k]) => k.toLowerCase() === n)?.[1] ?? "";
  const vars: Record<string, string> = {
    $http_upgrade: get("upgrade"),
    $host: (get("host") || "localhost").split(":")[0]!,
    $proxy_host: `localhost:${upstreamPort}`,
    $remote_addr: "127.0.0.1",
    $proxy_add_x_forwarded_for: "127.0.0.1",
    $scheme: "http",
    $http_host: get("host"),
  };
  const sub = (v: string) => v.replace(/\$[a-z_]+/g, (m) => vars[m] ?? "");
  const set = new Map<string, string>([
    ["Host", vars.$proxy_host!],
    ["Connection", "close"],
  ]);
  for (const [k, v] of loc.setHeaders) {
    const canon = [...set.keys()].find((x) => x.toLowerCase() === k.toLowerCase()) ?? k;
    set.set(canon, sub(v));
  }
  const out: [string, string][] = [];
  for (const [k, v] of set) if (v !== "") out.push([k, v]);
  for (const [k, v] of client) {
    const lower = k.toLowerCase();
    if (lower === "host" || HOP.has(lower) || [...set.keys()].some((x) => x.toLowerCase() === lower)) continue;
    out.push([k, v]);
  }
  return out;
}

export function nginxPage(status: number, text: string): string {
  return `<html>\r\n<head><title>${status} ${text}</title></head>\r\n<body>\r\n<center><h1>${status} ${text}</h1></center>\r\n<hr><center>nginx/1.24.0 (Ubuntu)</center>\r\n</body>\r\n</html>\r\n`;
}

/** The config people start from: a plain reverse proxy that does not pass WebSockets through. */
export const PLAIN_CONF = `server {
    listen 80;
    server_name chat.local;

    location / {
        proxy_pass http://localhost:8080;
    }

    location /ws {
        proxy_pass http://localhost:8081;
    }
}
`;

/** The same config with WebSockets passed through. */
export const WS_CONF = `server {
    listen 80;
    server_name chat.local;

    location / {
        proxy_pass http://localhost:8080;
    }

    location /ws {
        proxy_pass http://localhost:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`;
