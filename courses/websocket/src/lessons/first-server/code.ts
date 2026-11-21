/** The first server: an echo, then the changes the scenarios ask for. */

export const SERVER = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9001 });

wss.on("connection", (ws, req) => {
  console.log("new client from", req.socket.remoteAddress);

  ws.on("message", (data) => {
    // For now: send the message back to whoever sent it.
    ws.send(\`echo: \${data}\`);
  });

  ws.on("error", console.error);
});

console.log("server on :9001");
`;

export const welcome = (t: string) =>
  t.replace('  console.log("new client from", req.socket.remoteAddress);\n', '  console.log("new client from", req.socket.remoteAddress);\n  ws.send("welcome to the chat");\n');

export const broadcast = (t: string) =>
  t.replace(
    "    // For now: send the message back to whoever sent it.\n    ws.send(`echo: ${data}`);",
    "    for (const client of wss.clients) {\n      if (client.readyState === WebSocket.OPEN) client.send(data.toString());\n    }",
  ).replace('const { WebSocketServer } = require("ws");', 'const { WebSocketServer, WebSocket } = require("ws");');

export const onlineCount = (t: string) =>
  t
    .replace(
      '  console.log("new client from", req.socket.remoteAddress);\n',
      '  console.log("new client from", req.socket.remoteAddress);\n  announce();\n  ws.on("close", announce);\n',
    )
    .replace(
      'console.log("server on :9001");',
      'function announce() {\n  const msg = JSON.stringify({ type: "online", count: wss.clients.size });\n  for (const client of wss.clients) client.send(msg);\n}\n\nconsole.log("server on :9001");',
    );

/** Two teammates' clients that print whatever reaches them. */
export const BOTS = `const WebSocket = require("ws");

for (const name of ["ayse", "mert"]) {
  const ws = new WebSocket("ws://localhost:9001");
  ws.on("message", (data) => console.log(\`[\${name}] got: \${data}\`));
  ws.on("error", () => {});
}
`;
