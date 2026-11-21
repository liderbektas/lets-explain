/** The files of the frames lesson's project. */

export const ECHO = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9001 });

wss.on("connection", (ws) => {
  ws.on("message", (data, isBinary) => {
    // Every message goes straight back: text as text, binary as binary.
    ws.send(data, { binary: isBinary });
  });
});

console.log("echo server on :9001");
`;

export const SENSOR = `const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:9001");

ws.on("open", () => {
  const reading = { temp: 21.5 };
  // One temperature reading, sent as JSON text.
  ws.send(JSON.stringify(reading));
});

ws.on("message", (data, isBinary) => {
  console.log("echoed back:", isBinary ? data : data.toString());
  ws.close(1000);
});
`;
