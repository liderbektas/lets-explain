/** The chat server of the closing lesson, and the scripts that talk to it. */

export const SERVER = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9001, maxPayload: 1024 * 1024 });

wss.on("connection", (ws) => {
  ws.on("error", (err) => console.log("socket error:", err.message));
  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      ws.send(JSON.stringify({ type: "stored", bytes: data.length }));
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return; // not JSON: ignore it
    }
    for (const client of wss.clients) client.send(JSON.stringify(msg));
  });
  ws.on("close", (code, reason) => console.log(\`closed \${code} \${reason}\`));
});

console.log("chat on :9001");
`;

export const SHUTDOWN = `
// On a deploy, systemd and docker stop the old process with SIGTERM.
process.on("SIGTERM", () => {
  for (const ws of wss.clients) ws.close(1001, "server restarting");
  wss.close(() => process.exit(0));
});
`;

export const addShutdown = (t: string) => t.replace('console.log("chat on :9001");', `${SHUTDOWN.trim()}\n\nconsole.log("chat on :9001");`);

export const kickBadJson = (t: string) => t.replace("      return; // not JSON: ignore it", '      return ws.close(1008, "messages must be JSON");');

export const WATCH = `const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:9001");

ws.on("open", () => console.log("watch: connected"));
ws.on("close", (code, reason) => console.log(\`watch: closed \${code} \${reason}\`));
ws.on("error", (err) => console.log("watch: error", err.message));
`;

export const REPORT = `const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:9001");

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "report", text: "nightly build: green" }));
  console.log("report sent");
  process.exit(0);
});
`;

export const closeCleanly = (t: string) => t.replace("  process.exit(0);", '  ws.close(1000, "done");');

export const UPLOAD = `const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:9001");
const photo = Buffer.alloc(2 * 1024 * 1024); // a 2 MB photo

ws.on("open", () => ws.send(photo));
ws.on("message", (data) => {
  console.log("server:", data.toString());
  ws.close(1000);
});
ws.on("close", (code) => console.log("upload closed", code));
`;

export const biggerLimit = (t: string) => t.replace("maxPayload: 1024 * 1024", "maxPayload: 5 * 1024 * 1024");
