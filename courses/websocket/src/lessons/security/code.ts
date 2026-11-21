/** The chat server before hardening, the fixes, and the clients that test them. */

export const SERVER = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9001 });

wss.on("connection", (ws, req) => {
  console.log("connection from", req.headers.origin ?? "(no origin)");
  ws.on("message", (data) => {
    for (const client of wss.clients) client.send(data.toString());
  });
});

console.log("chat on :9001");
`;

const OPEN = "const wss = new WebSocketServer({ port: 9001 });";

/** Only pages from our own site may open a connection. */
export const checkOrigin = (t: string) =>
  t.replace(OPEN, 'const wss = new WebSocketServer({\n  port: 9001,\n  // Only pages from our own site may open a connection.\n  verifyClient: ({ origin }) => origin === "http://localhost:8080",\n});');

/** A size limit, and an error listener so hitting it doesn't take the process down. */
export const limitSize = (t: string) =>
  t
    .replace(OPEN, "const wss = new WebSocketServer({ port: 9001, maxPayload: 64 * 1024 });")
    .replace('  ws.on("message", (data) => {', '  ws.on("error", (err) => console.log("socket error:", err.message));\n  ws.on("message", (data) => {');

/** The limit alone: the 'error' it raises has nobody to catch it. */
export const limitOnly = (t: string) => t.replace(OPEN, "const wss = new WebSocketServer({ port: 9001, maxPayload: 64 * 1024 });");

export const TOKEN = "team-token-7f3a";

/** The first message must be { type: "auth", token }; until then nothing is shared. */
export const requireAuth = (t: string) =>
  t.replace(
    '  ws.on("message", (data) => {\n    for (const client of wss.clients) client.send(data.toString());\n  });',
    `  ws.authed = false;
  ws.on("message", (data) => {
    if (!ws.authed) {
      let msg = null;
      try {
        msg = JSON.parse(data);
      } catch {}
      if (msg?.type !== "auth" || msg.token !== "${TOKEN}") return ws.close(4001, "unauthorized");
      ws.authed = true;
      return ws.send(JSON.stringify({ type: "authenticated" }));
    }
    for (const client of wss.clients) if (client.authed) client.send(data.toString());
  });`,
  );

/** No more than 10 messages a second from one client. */
export const rateLimit = (t: string) =>
  t.replace(
    '  ws.on("message", (data) => {\n    for (const client',
    '  let count = 0;\n  const reset = setInterval(() => (count = 0), 1000);\n  ws.on("close", () => clearInterval(reset));\n  ws.on("message", (data) => {\n    if (++count > 10) return ws.close(1008, "too many messages");\n    for (const client',
  );

/** Opens many 1 MB messages at once, as an attacker would. */
export const FLOOD = `const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:9001", { origin: "http://localhost:8080" });
const junk = "x".repeat(1024 * 1024); // 1 MB

ws.on("open", () => {
  for (let i = 0; i < 2; i++) ws.send(junk);
});
ws.on("close", (code) => console.log("flood: closed", code));
ws.on("error", () => {});
`;

/** A buggy client that sends 100 messages in a burst. */
export const SPAM = `const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:9001", { origin: "http://localhost:8080" });

ws.on("open", () => {
  for (let i = 0; i < 100; i++) ws.send(\`spam \${i}\`);
});
ws.on("close", (code, reason) => console.log("spam: closed", code, String(reason)));
ws.on("error", () => {});
`;

/** Both at once: the Origin check, then the size limit and the error listener. */
export const harden = (t: string) =>
  checkOrigin(t)
    .replace("  port: 9001,\n", "  port: 9001,\n  maxPayload: 64 * 1024,\n")
    .replace('  ws.on("message", (data) => {', '  ws.on("error", (err) => console.log("socket error:", err.message));\n  ws.on("message", (data) => {');
