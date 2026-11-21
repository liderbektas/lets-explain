import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { acceptFor, sha1, toHex, utf8, validKey } from "./bytes";
import { wsShell } from "./cli";
import { apply, createNet, frameBytes, replay, type Net } from "./net";

const typed = (start: Net, lines: string[], edits: ((t: string) => string)[] = []) => typeLines(wsShell, replay, start, lines, edits);
const text = (start: Net, lines: string[]) => typed(start, lines).output.join("\n");

const chat = (extra: Partial<Parameters<typeof createNet>[0]> = {}) =>
  createNet({
    messages: [
      { from: "ayse", text: "Günaydın" },
      { from: "mert", text: "Deploy 10:30'da" },
    ],
    ...extra,
  });

describe("bytes", () => {
  it("SHA-1 matches the standard test vectors", () => {
    expect(toHex(sha1(utf8("abc")))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(toHex(sha1(utf8("")))).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(toHex(sha1(utf8("a".repeat(1000))))).toBe("291e9a6c66994949b57ba5e650361e98fc36b1ba");
  });

  it("computes the accept value from RFC 6455's example", () => {
    expect(acceptFor("dGhlIHNhbXBsZSBub25jZQ==")).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  });

  it("knows a key is 16 bytes of base64", () => {
    expect(validKey("dGhlIHNhbXBsZSBub25jZQ==")).toBe(true);
    expect(validKey("abc123")).toBe(false);
    expect(validKey(undefined)).toBe(false);
  });

  it("counts frame bytes as the protocol does", () => {
    expect(frameBytes("merhaba", true)).toBe(13);
    expect(frameBytes("merhaba", false)).toBe(9);
  });
});

describe("the chat API", () => {
  it("polling answers at once, with [] when there is nothing new", () => {
    const out = text(chat(), ["curl localhost:8080/messages?after=2"]);
    expect(out).toBe("[]");
    const all = text(chat(), ["curl localhost:8080/messages"]);
    expect(all).toContain('"from":"ayse"');
  });

  it("a long poll waits for the next message and answers right then", () => {
    const start = chat({ planned: [{ at: 7000, from: "mert", text: "Testler yeşil" }] });
    const r = typed(start, ["curl 'localhost:8080/messages?after=2&wait=30'"]);
    expect(r.state.now).toBe(7000);
    expect(r.output.join("\n")).toContain("Testler yeşil");
    expect(r.state.seen[3]).toBe(7000);
  });

  it("a long poll with nothing to say answers 204 after 30 seconds", () => {
    const r = typed(chat(), ["curl -i 'localhost:8080/messages?after=2&wait=60'"]);
    expect(r.state.now).toBe(30_000);
    expect(r.output[0]).toBe("HTTP/1.1 204 No Content");
  });

  it("server-sent events stream until --max-time, then curl reports the timeout", () => {
    const start = chat({ planned: [{ at: 3000, from: "ayse", text: "Bir" }, { at: 6000, from: "mert", text: "İki" }] });
    const r = typed(start, ["curl -N --max-time 10 localhost:8080/events"]);
    const out = r.output.join("\n");
    expect(out).toContain("id: 3");
    expect(out).toContain("id: 4");
    expect(out).toMatch(/curl: \(28\) Operation timed out after 10000 milliseconds with \d+ bytes received/);
  });

  it("Last-Event-ID replays only what was missed", () => {
    const start = chat({ messages: [1, 2, 3, 4].map((n) => ({ from: "ayse", text: `m${n}` })) });
    const out = text(start, ["curl -N -m 2 -H 'Last-Event-ID: 2' localhost:8080/events"]);
    expect(out).toContain("id: 3");
    expect(out).toContain("id: 4");
    expect(out).not.toContain("id: 2\n");
  });

  it("POST needs JSON, as Express's json parser does", () => {
    expect(text(chat(), ["curl -d 'text=selam' localhost:8080/messages"])).toContain("Content-Type: application/json");
    const r = typed(chat(), [`curl --json '{"text":"selam"}' localhost:8080/messages`]);
    expect(r.state.messages.at(-1)).toMatchObject({ from: "you", text: "selam", via: "post" });
  });

  it("an unknown path is Express's 404 page", () => {
    expect(text(chat(), ["curl localhost:8080/nope"])).toContain("<pre>Cannot GET /nope</pre>");
  });
});

const HANDSHAKE = "-H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13'";

describe("the ws server's handshake", () => {
  it("answers 101 with the right accept", () => {
    const out = text(chat(), [`curl -i ${HANDSHAKE} -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:8081`]);
    expect(out).toContain("HTTP/1.1 101 Switching Protocols");
    expect(out).toContain("Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  });

  it("426 without the upgrade headers, 400 with a bad key, 400 with a bad version", () => {
    expect(text(chat(), ["curl -i localhost:8081"])).toContain("HTTP/1.1 426 Upgrade Required");
    expect(text(chat(), ["curl -i -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:8081"])).toContain("426");
    const bad = text(chat(), [`curl -i ${HANDSHAKE} -H 'Sec-WebSocket-Key: abc123' localhost:8081`]);
    expect(bad).toContain("HTTP/1.1 400 Bad Request");
    expect(bad).toContain("Missing or invalid Sec-WebSocket-Key header");
    const ver = text(chat(), ["curl -i -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 12' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:8081"]);
    expect(ver).toContain("Sec-WebSocket-Version: 13, 8");
  });

  it("the Express port has no upgrade listener: the socket just closes", () => {
    expect(text(chat(), [`curl ${HANDSHAKE} -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' localhost:8080`])).toBe("curl: (52) Empty reply from server");
    expect(text(chat(), ["wscat -c ws://localhost:8080"])).toBe("error: socket hang up");
  });

  it("wscat chats over one connection; Ctrl+C leaves", () => {
    const r = typed(chat(), ["wscat -c ws://localhost:8081", '{"type":"chat","text":"selam"}', "^C"]);
    expect(r.output).toContain("Connected (press CTRL+C to quit)");
    expect(r.output.some((l) => l.startsWith("< ") && l.includes('"text":"selam"'))).toBe(true);
    // wscat closes with no status code on Ctrl+C: both ends see 1005.
    expect(r.state.conns[0]).toMatchObject({ closeCode: 1005, serverCode: 1005 });
  });
});

describe("the shell", () => {
  const KEY = "dGhlIHNhbXBsZSBub25jZQ==";
  const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

  it("computes accept with openssl -binary, and shows why the other ways go wrong", () => {
    expect(text(chat(), [`printf '%s' '${KEY}${GUID}' | openssl sha1 -binary | base64`])).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    expect(text(chat(), [`printf '%s' '${KEY}${GUID}' | openssl sha1 | base64`])).not.toContain("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    expect(text(chat(), [`echo '${KEY}${GUID}' | openssl sha1 -binary | base64`])).not.toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    expect(text(chat(), [`echo -n '${KEY}${GUID}' | openssl sha1 -binary | base64`])).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  });

  it("variables and command substitution work like bash", () => {
    const r = typed(chat(), [`KEY=${KEY}`, `printf '%s' "\${KEY}${GUID}" | openssl sha1 -binary | base64`]);
    expect(r.output.at(-1)).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    // As in bash: $KEY258EAFA5 is a variable named KEY258EAFA5, which is empty.
    const glued = typed(chat(), [`KEY=${KEY}`, `printf '%s' "$KEY${GUID}" | openssl sha1 -binary | base64`]);
    expect(glued.output.at(-1)).not.toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    const k = typed(chat(), ["openssl rand -base64 16"]).output[0]!;
    expect(validKey(k)).toBe(true);
  });

  it("runs the reader's own server code", () => {
    const code = `const http = require("http");
const crypto = require("crypto");
const GUID = "${GUID}";
const server = http.createServer();
server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: " + accept + "\\r\\n\\r\\n");
});
server.listen(9000, () => console.log("listening on 9000"));`;
    const start = createNet({ files: { "server.js": code } });
    const r = typed(start, ["node server.js &", "wscat -c ws://localhost:9000 -x hi"]);
    expect(r.output).toContain("listening on 9000");
    expect(r.output.join("\n")).not.toContain("error");
    const again = typed(r.state, ["node server.js"]);
    expect(again.output.join("\n")).toContain("EADDRINUSE");
    const broken = createNet({ files: { "server.js": code.replace("key + GUID", "key") } });
    expect(text(broken, ["node server.js &", "wscat -c ws://localhost:9000"])).toContain("error: Invalid Sec-WebSocket-Accept header");
  });

  it("time passes with sleep and nothing else", () => {
    const r = apply(chat(), { type: "advance", ms: 1500 });
    expect(r.net.now).toBe(1500);
  });
});
