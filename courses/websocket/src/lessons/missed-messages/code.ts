/** The deploy log server (numbered lines, history, resume) and the client that reads it. */

export const SERVER = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9001 });
const history = []; // every line so far, in order
let seq = 0;

// The deploy log: a new numbered line every 3 s.
setInterval(() => {
  seq++;
  const msg = { type: "message", seq, text: \`build step \${seq}\` };
  history.push(msg);
  for (const ws of wss.clients) ws.send(JSON.stringify(msg));
}, 3000);

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  ws.on("message", (data) => {
    const msg = JSON.parse(data);
    if (msg.type === "resume") {
      // Everything after the last line the client has, in order.
      for (const m of history.filter((m) => m.seq > msg.after)) ws.send(JSON.stringify(m));
    }
  });
  ws.on("error", () => {});
});

// Heartbeat: drop clients that stopped answering.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 10000);

console.log("deploy log on :9001");
`;

/** The same server with no history: it can't answer a resume. */
export const SERVER_NO_HISTORY = SERVER.replace("  history.push(msg);\n", "").replace(
  '    if (msg.type === "resume") {\n      // Everything after the last line the client has, in order.\n      for (const m of history.filter((m) => m.seq > msg.after)) ws.send(JSON.stringify(m));\n    }\n',
  "    // TODO: answer { type: \"resume\", after } with what the client missed.\n",
);

/** A resume that sends one line too many. */
export const SERVER_OFF_BY_ONE = SERVER.replace("history.filter((m) => m.seq > msg.after)", "history.filter((m) => m.seq >= msg.after)");

export const READER = `const WebSocket = require("ws");

let attempt = 0;

function connect() {
  const ws = new WebSocket("ws://localhost:9001");
  ws.on("open", () => {
    attempt = 0;
  });
  ws.on("message", (data) => {
    const msg = JSON.parse(data);
    console.log(\`got #\${msg.seq}: \${msg.text}\`);
  });
  ws.on("close", () => {
    const delay = Math.random() * Math.min(30000, 1000 * 2 ** attempt);
    attempt++;
    setTimeout(connect, delay);
  });
  ws.on("error", () => {});
}

connect();
`;

/** Remember the last line, and ask for what came after it on every (re)connect. */
export const addResume = (t: string) =>
  t
    .replace("let attempt = 0;\n", "let attempt = 0;\nlet lastSeq = 0;\n")
    .replace("    attempt = 0;\n  });", '    attempt = 0;\n    ws.send(JSON.stringify({ type: "resume", after: lastSeq }));\n  });')
    .replace("    const msg = JSON.parse(data);\n    console.log", "    const msg = JSON.parse(data);\n    lastSeq = msg.seq;\n    console.log");

export const READER_RESUME = addResume(READER);

/** Ignore a line already shown: safe whatever the server sends twice. */
export const skipSeen = (t: string) => t.replace("    const msg = JSON.parse(data);\n    lastSeq = msg.seq;", "    const msg = JSON.parse(data);\n    if (msg.seq <= lastSeq) return;\n    lastSeq = msg.seq;");

export const answerResume = (t: string) =>
  t
    .replace("  for (const ws of wss.clients) ws.send(JSON.stringify(msg));\n}, 3000);", "  history.push(msg);\n  for (const ws of wss.clients) ws.send(JSON.stringify(msg));\n}, 3000);")
    .replace(
      '    // TODO: answer { type: "resume", after } with what the client missed.\n',
      '    if (msg.type === "resume") {\n      for (const m of history.filter((m) => m.seq > msg.after)) ws.send(JSON.stringify(m));\n    }\n',
    );

/** Keep the last line in a file, as an app keeps it in localStorage, so a restart resumes too. */
export const persist = (t: string) =>
  t
    .replace("let lastSeq = 0;\n", 'const fs = require("fs");\nlet lastSeq = fs.existsSync("last-seq.txt") ? Number(fs.readFileSync("last-seq.txt", "utf8")) : 0;\n')
    .replace("    lastSeq = msg.seq;\n", '    lastSeq = msg.seq;\n    fs.writeFileSync("last-seq.txt", String(lastSeq));\n');
