import { PLAIN_CONF, WS_CONF } from "../../engine/nginx";

export { PLAIN_CONF, WS_CONF };

/** The three lines that let an upgrade through, added to the /ws location. */
export const passUpgrade = (t: string) =>
  t.replace(
    "        proxy_pass http://localhost:8081;\n    }",
    '        proxy_pass http://localhost:8081;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n    }',
  );

/** Someone's edit: right idea, one typo, never reloaded. */
export const TYPO_CONF = WS_CONF.replace("proxy_set_header Upgrade $http_upgrade;", "proxy_set_headr Upgrade $http_upgrade;");
export const fixTypo = (t: string) => t.replace("proxy_set_headr", "proxy_set_header");

/** The front end moved to /socket; nginx only knows /ws. */
export const addSocketPath = (t: string) =>
  t.replace(
    "    location /ws {",
    '    location /socket {\n        proxy_pass http://localhost:8081;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n    }\n\n    location /ws {',
  );

/** nginx in front of a Node server on :9001 that isn't running. */
export const NODE_CONF = WS_CONF.replace("proxy_pass http://localhost:8081;\n        proxy_http_version", "proxy_pass http://localhost:9001;\n        proxy_http_version");

export const SERVER = `const { WebSocketServer } = require("ws");

const wss = new WebSocketServer({ port: 9001 });

wss.on("connection", (ws) => {
  ws.send("hello from :9001");
  ws.on("message", (data) => ws.send(\`echo: \${data}\`));
  ws.on("error", console.error);
});

console.log("chat on :9001");
`;
