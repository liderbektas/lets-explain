/** The chat server that can only take so many new connections a second, and the tab's client code. */

export const CHAT = `const { WebSocketServer } = require("ws");

// Setting up a connection costs CPU (TLS, auth, loading the user). This server sets up
// about 5 a second and answers 503 to the rest. Turning one away costs CPU too: a second
// with more than 10 attempts leaves the machine too busy to set up any in the next.
let tokens = 5;
let attempts = 0;
let refused = 0;
setInterval(() => {
  tokens = attempts > 10 ? 0 : 5;
  attempts = 0;
}, 1000);

const wss = new WebSocketServer({
  port: 9001,
  verifyClient: (info, done) => {
    attempts++;
    if (tokens <= 0) {
      refused++;
      return done(false, 503, "Busy, try again");
    }
    tokens--;
    done(true);
  },
});

wss.on("connection", (ws) => ws.on("error", () => {}));

let last = "";
setInterval(() => {
  const line = \`online: \${wss.clients.size}, refused so far: \${refused}\`;
  if (line !== last) console.log(line);
  last = line;
}, 5000);

console.log("chat on :9001");
`;

/** The same server, which also turns away tab 3: its session has expired. */
export const CHAT_EXPIRED = CHAT.replace(
  'wss.on("connection", (ws) => ws.on("error", () => {}));',
  'wss.on("connection", (ws, req) => {\n  ws.on("error", () => {});\n  const tab = new URL(req.url, "http://localhost").searchParams.get("tab");\n  // Tab 3 is still logged in with a session that has expired.\n  if (tab === "3") ws.close(4001, "session expired");\n});',
);

const HEAD = `const WebSocket = require("ws");

const url = \`ws://localhost:9001/?tab=\${process.env.TAB}\`;
`;

/** No reconnecting at all: once cut, the tab stays cut. */
export const TAB_NONE = `${HEAD}
function connect() {
  const ws = new WebSocket(url);
  ws.on("close", () => {
    // The page shows "disconnected" and stays that way.
  });
  ws.on("error", () => {});
}

connect();
`;

/** Reconnects one second after every drop: fine alone, a stampede in a crowd. */
export const TAB_FIXED = TAB_NONE.replace('    // The page shows "disconnected" and stays that way.', "    setTimeout(connect, 1000);");

/** Exponential backoff with no ceiling and no jitter. */
export const TAB_EXPO = `${HEAD}
let attempt = 0;

function connect() {
  const ws = new WebSocket(url);
  ws.on("open", () => {
    attempt = 0;
  });
  ws.on("close", (code) => {
    const delay = 1000 * 2 ** attempt;
    attempt++;
    setTimeout(connect, delay);
  });
  ws.on("error", () => {});
}

connect();
`;

/** Full jitter: a random wait up to a ceiling that doubles, capped at 30 s. */
export const TAB_JITTER = TAB_EXPO.replace("    const delay = 1000 * 2 ** attempt;", "    const delay = Math.random() * Math.min(30000, 1000 * 2 ** attempt);");

export const reconnectEverySecond = () => TAB_FIXED;
export const withJitter = (t: string) =>
  t.includes("2 ** attempt")
    ? t.replace("    const delay = 1000 * 2 ** attempt;", "    const delay = Math.random() * Math.min(30000, 1000 * 2 ** attempt);")
    : TAB_JITTER;
export const withCap = (t: string) => t.replace("    const delay = 1000 * 2 ** attempt;", "    const delay = Math.min(30000, 1000 * 2 ** attempt);");
export const stopOn4001 = (t: string) =>
  t.replace("  ws.on(\"close\", (code) => {\n", '  ws.on("close", (code) => {\n    if (code === 4001) return console.log(`tab ${process.env.TAB}: please log in again`);\n');
