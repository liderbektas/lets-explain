/** The live board server: a 32 KB snapshot to everyone, every second. */

export const BOARD = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9001 });

// The live board: about 32 KB of JSON, rebuilt every second.
function snapshot() {
  return JSON.stringify({ type: "board", at: Date.now(), cells: "x".repeat(32 * 1024) });
}

setInterval(() => {
  const board = snapshot();
  for (const ws of wss.clients) {
    ws.send(board);
  }
}, 1000);

// Every 10 s: how much is still waiting to go out to each client.
setInterval(() => {
  for (const ws of wss.clients) {
    console.log(\`\${ws.name}: \${Math.round(ws.bufferedAmount / 1024)} KB waiting\`);
  }
}, 10000);

wss.on("connection", (ws, req) => {
  ws.name = new URL(req.url, "http://localhost").searchParams.get("name") ?? "client";
  ws.on("error", console.error);
});

console.log("board on :9001");
`;

const LOOP = "  for (const ws of wss.clients) {\n    ws.send(board);\n  }";

/** Skip a client whose queue is already long: it gets the next board instead. */
export const skipFull = (t: string) =>
  t.replace(LOOP, "  for (const ws of wss.clients) {\n    // Still sending the last ones: skip this board for that client.\n    if (ws.bufferedAmount > 256 * 1024) continue;\n    ws.send(board);\n  }");

/** Drop a client that has fallen too far behind. */
export const dropSlow = (t: string) =>
  t.replace(LOOP, "  for (const ws of wss.clients) {\n    if (ws.bufferedAmount > 1024 * 1024) {\n      ws.terminate();\n      continue;\n    }\n    ws.send(board);\n  }");
