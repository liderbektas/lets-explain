/** The chat server behind nginx, before and after a heartbeat. */

export const CHAT = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9001 });

wss.on("connection", (ws) => {
  console.log(\`connected (\${wss.clients.size} online)\`);
  ws.on("message", (data) => {
    for (const client of wss.clients) client.send(data.toString());
  });
  ws.on("close", (code) => console.log(\`closed \${code} (\${wss.clients.size} online)\`));
});

console.log("chat on :9001");
`;

/** The heartbeat from the ws documentation: ping everyone every 30 s, drop whoever did not pong. */
export const HEARTBEAT = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9001 });

wss.on("connection", (ws) => {
  console.log(\`connected (\${wss.clients.size} online)\`);
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  ws.on("message", (data) => {
    for (const client of wss.clients) client.send(data.toString());
  });
  ws.on("close", (code) => console.log(\`closed \${code} (\${wss.clients.size} online)\`));
});

// Every 30 s: whoever did not answer the last ping is gone; everyone else gets a new one.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

console.log("chat on :9001");
`;

/** Adds the heartbeat to the plain server, the way a reader would. */
export const addHeartbeat = () => HEARTBEAT;

export const NGINX_CHAT = `server {
    listen 80;
    server_name chat.local;

    location /ws {
        proxy_pass http://localhost:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`;

/** A test client that connects through nginx and says when, and after how long, it was cut. */
export const WATCH = `const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost/ws");
const opened = Date.now();

ws.on("open", () => console.log("watch: connected"));
ws.on("close", (code) => {
  console.log(\`watch: disconnected \${code} after \${Math.round((Date.now() - opened) / 1000)} s\`);
});
ws.on("error", (err) => console.log("watch: error", err.message));
`;

/** A phone that reconnects whenever it is cut off. */
export const PHONE = `const WebSocket = require("ws");

function connect() {
  const ws = new WebSocket("ws://localhost:9001");
  ws.on("open", () => console.log("phone: connected"));
  ws.on("close", () => setTimeout(connect, 2000));
  ws.on("error", () => {});
}

connect();
`;
