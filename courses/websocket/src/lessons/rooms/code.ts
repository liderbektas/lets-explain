/** The rooms server with its four classic bugs, the fixes, and the clients that show them. */

export const ROOMS = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9001 });
const rooms = new Map(); // room name → the sockets in it

wss.on("connection", (ws) => {
  ws.room = null;

  ws.on("message", (data) => {
    const msg = JSON.parse(data);

    if (msg.type === "join") {
      ws.room = msg.room;
      if (!rooms.has(msg.room)) rooms.set(msg.room, new Set());
      rooms.get(msg.room).add(ws);
      console.log(\`\${msg.room}: \${rooms.get(msg.room).size} members\`);
      ws.send(JSON.stringify({ type: "joined", room: msg.room }));
      return;
    }

    if (msg.type === "chat") {
      const out = JSON.stringify({ type: "chat", room: ws.room, text: msg.text });
      for (const client of wss.clients) client.send(out);
    }
  });

  ws.on("close", () => {
    if (ws.room) rooms.get(ws.room).delete(ws);
  });
  ws.on("error", console.error);
});

console.log("rooms server on :9001");
`;

export const roomOnly = (t: string) => t.replace("      for (const client of wss.clients) client.send(out);", "      for (const client of rooms.get(ws.room) ?? []) client.send(out);");

export const safeParse = (t: string) =>
  t.replace(
    "    const msg = JSON.parse(data);\n",
    '    let msg;\n    try {\n      msg = JSON.parse(data);\n    } catch {\n      ws.send(JSON.stringify({ type: "error", error: "messages must be JSON" }));\n      return;\n    }\n',
  );

export const leaveOld = (t: string) => t.replace("      ws.room = msg.room;\n", "      if (ws.room) rooms.get(ws.room).delete(ws);\n      ws.room = msg.room;\n");

const CLOSE = "  ws.on(\"close\", () => {\n    if (ws.room) rooms.get(ws.room).delete(ws);\n  });\n";
export const noCleanup = (t: string) => t.replace(CLOSE, "");
export const cleanup = (t: string) => t.replace('  ws.on("error", console.error);', `${CLOSE}  ws.on("error", console.error);`);

/** Everything fixed: the scene's server. */
export const FIXED = leaveOld(safeParse(roomOnly(ROOMS)));

/** Ayşe in #genel (she asks every 5 s whether anyone is there) and Mert in #ops; they print what they get. */
export const BOTS = `const WebSocket = require("ws");

function bot(name, room, talks) {
  const ws = new WebSocket("ws://localhost:9001");
  ws.on("open", () => {
    ws.send(JSON.stringify({ type: "join", room }));
    if (talks) setInterval(() => ws.send(JSON.stringify({ type: "chat", text: \`\${name}: anyone here?\` })), 5000);
  });
  ws.on("message", (data) => {
    const msg = JSON.parse(data);
    if (msg.type === "chat" && !msg.text.startsWith(name)) console.log(\`[\${name} in #\${room}] \${msg.text}\`);
  });
  ws.on("error", () => {});
}

bot("ayse", "genel", true);
bot("mert", "ops", false);
`;

/** A test client: joins #genel, moves to #ops a second later, leaves after 12 s. */
export const SWITCH = `const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:9001");
let room = "genel";

ws.on("open", () => {
  ws.send(JSON.stringify({ type: "join", room: "genel" }));
  setTimeout(() => {
    room = "ops";
    ws.send(JSON.stringify({ type: "join", room: "ops" }));
  }, 1000);
  setTimeout(() => ws.close(1000), 12000);
});

ws.on("message", (data) => {
  const msg = JSON.parse(data);
  if (msg.type === "chat") console.log(\`switch (now in #\${room}) got from #\${msg.room}: \${msg.text}\`);
});
`;
