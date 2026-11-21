import { ECHO } from "../frames/code";

export { ECHO };

/** The deploy log server: it sends the log in three pieces, as three messages. */
export const LOGS = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9002 });

// The last deploy's log, read in three pieces.
const parts = ["[10:30:01] build ok\\n", "[10:30:14] tests ok\\n", "[10:30:20] deployed\\n"];

wss.on("connection", (ws) => {
  for (const part of parts) {
    ws.send(part);
  }
});

console.log("log server on :9002");
`;

/** The same log, sent as one message in three fragments. */
export const STREAM = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9003 });

const parts = ["[10:30:01] build ok\\n", "[10:30:14] tests ok\\n", "[10:30:20] deployed\\n"];

wss.on("connection", (ws) => {
  parts.forEach((part, i) => {
    // FIN only on the last piece: the client gets one message.
    ws.send(part, { fin: i === parts.length - 1 });
  });
});

console.log("stream server on :9003");
`;

export const fixLogs = (t: string) =>
  t.replace("  for (const part of parts) {\n    ws.send(part);\n  }", "  parts.forEach((part, i) => {\n    ws.send(part, { fin: i === parts.length - 1 });\n  });");
