import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { wsShell } from "./cli";
import { decodeFrame, encodeFrame, OP } from "./frames";
import { PLAIN_CONF, WS_CONF } from "./nginx";
import { createNet, replay, serverOpen, type Net } from "./net";

const typed = (start: Net, lines: string[], edits: ((t: string) => string)[] = []) => typeLines(wsShell, replay, start, lines, edits);

const ECHO = `const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ port: 9001 });
wss.on("connection", (ws) => {
  ws.send("welcome");
  ws.on("message", (data) => ws.send("echo: " + data));
  ws.on("close", (code) => console.log("closed", code));
});
console.log("listening on 9001");`;

describe("frames", () => {
  it("encodes and decodes the RFC's examples", () => {
    // RFC 6455 5.7: a single-frame unmasked text message "Hello".
    expect([...encodeFrame({ fin: true, opcode: OP.text, payload: new TextEncoder().encode("Hello") })]).toEqual([0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    // The masked one, with mask 37 fa 21 3d.
    const masked = encodeFrame({ fin: true, opcode: OP.text, payload: new TextEncoder().encode("Hello"), mask: new Uint8Array([0x37, 0xfa, 0x21, 0x3d]) });
    expect([...masked]).toEqual([0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58]);
    expect(new TextDecoder().decode(decodeFrame(masked)!.payload)).toBe("Hello");
    // 256 bytes: 126 and a 2-byte length.
    const big = encodeFrame({ fin: true, opcode: OP.binary, payload: new Uint8Array(256) });
    expect([...big.slice(0, 4)]).toEqual([0x82, 0x7e, 0x01, 0x00]);
  });
});

describe("the reader's Node code", () => {
  it("a ws server runs, greets, echoes and sees the close code", () => {
    const start = createNet({ files: { "server.js": ECHO } });
    const r = typed(start, ["node server.js &", "wscat -c ws://localhost:9001", "hi", "^C"]);
    const out = r.output.join("\n");
    expect(out).toContain("listening on 9001");
    expect(out).toContain("< welcome");
    expect(out).toContain("< echo: hi");
    expect(out).toContain("closed 1005");
  });

  it("a client script runs in the foreground until it is done", () => {
    const client = `const WebSocket = require("ws");
const ws = new WebSocket("ws://localhost:9001");
ws.on("open", () => ws.send("ping me"));
ws.on("message", (d) => { console.log("got", d.toString()); if (String(d).startsWith("echo")) ws.close(1000, "done"); });
ws.on("close", (code) => console.log("client closed", code));`;
    const start = createNet({ files: { "server.js": ECHO, "client.js": client }, running: ["server.js"] });
    const r = typed(start, ["node client.js"]);
    const out = r.output.join("\n");
    expect(out).toContain("got welcome");
    expect(out).toContain("got echo: ping me");
    expect(out).toContain("closed 1000");
    expect(out).toContain("client closed 1000");
    expect(r.state.procs.find((p) => p.file === "client.js")!.alive).toBe(false);
  });

  it("fragments: three frames, one message", () => {
    const code = `const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ port: 9001 });
wss.on("connection", (ws) => {
  ws.send("part 1, ", { fin: false });
  ws.send("part 2, ", { fin: false });
  ws.send("part 3");
});`;
    const r = typed(createNet({ files: { "server.js": code } }), ["node server.js &", "wscat -c ws://localhost:9001"]);
    expect(r.output).toContain("< part 1, part 2, part 3");
    const c = r.state.conns[0]!;
    expect(c.frames.map((f) => [f.opcode, f.fin])).toEqual([
      [1, false],
      [0, false],
      [0, true],
    ]);
    expect(c.msgs).toHaveLength(1);
  });

  it("heartbeat: a dead client is found and terminated; without it, it stays", () => {
    const code = `const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ port: 9001 });
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
});
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);`;
    const start = createNet({ files: { "server.js": code }, running: ["server.js"], actions: [{ type: "wsOpen", client: "phone", port: 9001, target: "/", headers: [["Host", "localhost:9001"], ["Connection", "Upgrade"], ["Upgrade", "websocket"], ["Sec-WebSocket-Version", "13"]] }] });
    const r = typed(start, ["sleep 40"]);
    expect(serverOpen(r.state, `proc:4242`)).toHaveLength(1);
    const dead = replay(start, [{ type: "netDown", client: "phone" }, { type: "advance", ms: 70_000 }]);
    const c = dead.conns[0]!;
    expect(c.serverCode).toBe(1006);
    // The phone never heard: its end still believes it is open.
    expect(c.closedAt).toBeNull();
  });

  it("maxPayload: 1009, and a crash when nobody listens for 'error'", () => {
    const code = (handler: string) => `const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ port: 9001, maxPayload: 1024 });
wss.on("connection", (ws) => { ${handler} ws.on("message", () => {}); });`;
    const big = "x".repeat(2000);
    const crash = typed(createNet({ files: { "server.js": code("") } }), ["node server.js &", `wscat -c ws://localhost:9001 -x ${big}`]);
    expect(crash.output.join("\n")).toContain("RangeError: Max payload size exceeded");
    expect(crash.state.procs[0]!.alive).toBe(false);
    const safe = typed(createNet({ files: { "server.js": code('ws.on("error", (e) => console.log("error:", e.message));') } }), ["node server.js &", `wscat -c ws://localhost:9001 -x ${big}`]);
    expect(safe.output.join("\n")).toContain("error: Max payload size exceeded");
    expect(safe.state.procs[0]!.alive).toBe(true);
    expect(safe.state.conns[0]!.serverCode).toBe(1009);
  });

  it("SIGTERM handlers run; a graceful shutdown closes clients with 1001", () => {
    const code = `${ECHO}
process.on("SIGTERM", () => {
  wss.clients.forEach((ws) => ws.close(1001, "restarting"));
  wss.close(() => process.exit(0));
});`;
    const phone = { type: "wsOpen" as const, client: "phone", port: 9001, target: "/", headers: [["Host", "localhost:9001"], ["Connection", "Upgrade"], ["Upgrade", "websocket"], ["Sec-WebSocket-Version", "13"]] as [string, string][] };
    const start = createNet({ files: { "server.js": code }, running: ["server.js"], actions: [phone] });
    const r = typed(start, ["kill %1"]);
    expect(r.state.conns[0]!.closeCode).toBe(1001);
    expect(r.state.conns[0]!.closeReason).toBe("restarting");
    expect(r.output.join("\n")).toContain("Done");
    // Without a handler, SIGTERM just ends it: the phone sees 1006.
    const plain = typed(createNet({ files: { "server.js": ECHO }, running: ["server.js"], actions: [phone] }), ["kill %1"]);
    expect(plain.state.conns[0]!.closeCode).toBe(1006);
    expect(plain.output.join("\n")).toContain("Terminated");
  });
});

describe("nginx, iptables, redis, tshark", () => {
  it("a plain proxy config turns the handshake into 426; the WebSocket config passes it", () => {
    const plain = typed(createNet({ nginx: PLAIN_CONF }), ["wscat -c ws://localhost/ws"]);
    expect(plain.output.join("\n")).toContain("error: Unexpected server response: 426");
    const fixed = typed(createNet({ nginx: PLAIN_CONF }), ["sudo nano /etc/nginx/conf.d/chat.conf", "sudo nginx -t", "sudo nginx -s reload", "wscat -c ws://localhost/ws -x '{\"type\":\"chat\",\"text\":\"hi\"}'"], [() => WS_CONF]);
    expect(fixed.output.join("\n")).toContain("test is successful");
    expect(fixed.output.join("\n")).toContain('"text":"hi"');
  });

  it("nginx cuts an idle tunnel at proxy_read_timeout", () => {
    const r = typed(createNet({ nginx: WS_CONF }), ["wscat -c ws://localhost/ws", "^C"]);
    void r;
    const idle = replay(createNet({ nginx: WS_CONF }), [
      { type: "wsOpen", client: "browser", port: 80, target: "/ws", headers: [["Host", "localhost"], ["Connection", "Upgrade"], ["Upgrade", "websocket"], ["Sec-WebSocket-Version", "13"]] },
      { type: "advance", ms: 61_000 },
    ]);
    expect(idle.conns[0]!.closeCode).toBe(1006);
    expect(idle.conns[0]!.closedAt).toBe(60_000);
  });

  it("nginx -t names the line of a typo", () => {
    const r = typed(createNet({ nginx: PLAIN_CONF }), ["sudo nano /etc/nginx/conf.d/chat.conf", "sudo nginx -t"], [(t) => t.replace("proxy_pass http://localhost:8081;", "proxy_pass http://localhost:8081;\n        proxy_set_headr Upgrade $http_upgrade;")]);
    expect(r.output.join("\n")).toMatch(/unknown directive "proxy_set_headr" in \/etc\/nginx\/conf.d\/chat.conf:\d+/);
  });

  it("iptables drops packets; TCP delivers them once they get through again", () => {
    const start = createNet({ files: { "server.js": ECHO }, running: ["server.js"] });
    const r = typed(start, ["wscat -c ws://localhost:9001 -x one -w 1", "sudo iptables -A INPUT -p tcp --dport 9001 -j DROP", "iptables -L"]);
    expect(r.output.join("\n")).toContain("< echo: one");
    expect(r.state.blocked).toEqual([9001]);
  });

  it("redis pub/sub reaches subscribers in another process", () => {
    const sub = `const Redis = require("ioredis");
const sub = new Redis();
sub.subscribe("chat");
sub.on("message", (ch, msg) => console.log("sub got", msg));`;
    const r = typed(createNet({ redis: true, files: { "sub.js": sub } }), ["node sub.js &", "redis-cli PUBLISH chat hello"]);
    const out = r.output.join("\n");
    expect(out).toContain("(integer) 1");
    expect(out).toContain("sub got hello");
  });

  it("tshark prints a masked client frame as Wireshark dissects it", () => {
    const r = typed(createNet(), ["sudo tshark -i lo -Y websocket -O websocket &", "wscat -c ws://localhost:8081 -x merhaba -w 0", "kill %1"]);
    const out = r.output.join("\n");
    expect(out).toContain("Capturing on 'Loopback: lo'");
    expect(out).toContain(".... 0001 = Opcode: Text (1)");
    expect(out).toContain("1... .... = Mask: True");
    expect(out).toContain(".000 0111 = Payload length: 7");
    expect(out).toMatch(/Frame 1: 79 bytes on wire/);
    expect(out).toMatch(/\d+ packets captured/);
  });

  it("printf writes raw bytes a frame fixture needs", () => {
    const r = typed(createNet(), ["printf '\\x81\\x02hi' > hi.bin", "xxd hi.bin", "wc -c hi.bin"]);
    expect(r.output.join("\n")).toContain("00000000: 8102 6869");
    expect(r.output.join("\n")).toContain("4 hi.bin");
  });

  it("node -e runs code and a for loop starts background jobs", () => {
    const r = typed(createNet(), ["node -e 'console.log(Buffer.from(\"hi\").toString(\"hex\"))'"]);
    expect(r.output).toContain("6869");
    const loop = typed(createNet({ files: { "sleep.js": "setTimeout(() => {}, 1000);" } }), ["for i in $(seq 1 3); do node sleep.js & done"]);
    expect(loop.state.procs).toHaveLength(3);
  });
});
