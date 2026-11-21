/** One chat server, run as several instances, before and after Redis pub/sub. */

export const SERVER = `const { WebSocketServer } = require("ws");

const port = Number(process.env.PORT);
const wss = new WebSocketServer({ port });

// Sends a message to everyone connected to THIS instance.
function deliver(text) {
  for (const ws of wss.clients) ws.send(text);
}

wss.on("connection", (ws) => {
  ws.on("message", (data) => deliver(data.toString()));
  ws.on("error", () => {});
});

console.log(\`chat instance on :\${port}\`);
`;

/** Publish to Redis; every instance (this one included) delivers what comes from Redis. */
export const withRedis = (t: string) =>
  t
    .replace(
      'const { WebSocketServer } = require("ws");\n',
      'const { WebSocketServer } = require("ws");\nconst Redis = require("ioredis");\n\nconst pub = new Redis();\nconst sub = new Redis();\nsub.subscribe("chat");\nsub.on("message", (channel, text) => deliver(text));\n',
    )
    .replace('  ws.on("message", (data) => deliver(data.toString()));', '  ws.on("message", (data) => pub.publish("chat", data.toString()));');

export const REDIS_SERVER = withRedis(SERVER);

/** Publishing and also delivering locally: the local clients get it twice. */
export const DOUBLE = REDIS_SERVER.replace('  ws.on("message", (data) => pub.publish("chat", data.toString()));', '  ws.on("message", (data) => {\n    deliver(data.toString());\n    pub.publish("chat", data.toString());\n  });');
export const fixDouble = (t: string) => t.replace("    deliver(data.toString());\n    pub.publish", "    pub.publish");

/** Ayşe on :8082 and Mert on :8083; they print what reaches them. Ayşe asks every 5 s. */
export const BOTS = `const WebSocket = require("ws");

function bot(name, port, talks) {
  const ws = new WebSocket(\`ws://localhost:\${port}\`);
  ws.on("open", () => {
    if (talks) setInterval(() => ws.send(\`\${name}: anyone around?\`), 5000);
  });
  ws.on("message", (data) => {
    if (!String(data).startsWith(name)) console.log(\`[\${name} on :\${port}] \${data}\`);
  });
  ws.on("error", () => {});
}

bot("ayse", 8082, process.env.TALK === "1");
bot("mert", 8083, false);
`;

/** Listens on one instance for 10 s and prints what it hears. */
export const LISTEN = `const WebSocket = require("ws");

const port = process.env.PORT;
const ws = new WebSocket(\`ws://localhost:\${port}\`);

ws.on("open", () => console.log(\`listening on :\${port} for 10 s\`));
ws.on("message", (data) => console.log(\`heard on :\${port}: \${data}\`));
ws.on("error", (err) => console.log("error:", err.message));
setTimeout(() => ws.close(1000), 10000);
`;
