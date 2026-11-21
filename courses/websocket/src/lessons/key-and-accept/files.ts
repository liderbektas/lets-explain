/** The team's old hand-written handshake server, in its broken versions. */
export const SERVER_NO_GUID = `const http = require("http");
const crypto = require("crypto");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const server = http.createServer();

// Answers the WebSocket handshake by hand.
server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1").update(key).digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\\r\\n" +
      "Upgrade: websocket\\r\\n" +
      "Connection: Upgrade\\r\\n" +
      \`Sec-WebSocket-Accept: \${accept}\\r\\n\` +
      "\\r\\n",
  );
});

server.listen(9000, () => console.log("handshake server on :9000"));
`;

export const SERVER_HEX = SERVER_NO_GUID.replace('.update(key).digest("base64")', '.update(key + GUID).digest("hex")');
