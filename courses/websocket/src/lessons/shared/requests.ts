import { API_PORT, WS_PORT, type NetAction } from "../../engine/net";

/**
 * The requests a real browser sends, header by header, so the bytes counted on stage are the
 * bytes a page really spends. (Chrome on a Mac; the session cookie is the app's own.)
 */
const BROWSER: [string, string][] = [
  ["Connection", "keep-alive"],
  ["User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"],
  ["Accept", "*/*"],
  ["Referer", "http://localhost:8080/"],
  ["Accept-Encoding", "gzip, deflate, br, zstd"],
  ["Accept-Language", "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7"],
  ["Cookie", "sid=s%3A9f2c7e1ab04d4c6e8a3b.Xq7f0lQ2b9kR3mZ"],
];

export const browserGet = (target: string, extra: [string, string][] = []): NetAction => ({
  type: "http",
  client: "browser",
  port: API_PORT,
  method: "GET",
  target,
  headers: [["Host", `localhost:${API_PORT}`], ...BROWSER, ...extra],
});

export const browserPost = (text: string): NetAction => {
  const body = JSON.stringify({ text });
  return {
    type: "http",
    client: "browser",
    port: API_PORT,
    method: "POST",
    target: "/messages",
    headers: [["Host", `localhost:${API_PORT}`], ...BROWSER, ["Content-Type", "application/json"], ["Content-Length", String(new TextEncoder().encode(body).length)]],
    body,
  };
};

/** `new WebSocket("ws://localhost:8081")` in Chrome: the handshake headers it sends (the key is added by the model). */
export const browserSocket = (port = WS_PORT): NetAction => ({
  type: "wsOpen",
  client: "browser",
  port,
  target: "/",
  headers: [
    ["Host", `localhost:${port}`],
    ["Connection", "Upgrade"],
    ["Pragma", "no-cache"],
    ["Cache-Control", "no-cache"],
    ["User-Agent", BROWSER[1]![1]],
    ["Upgrade", "websocket"],
    ["Origin", "http://localhost:8080"],
    ["Sec-WebSocket-Version", "13"],
    ["Accept-Encoding", "gzip, deflate, br, zstd"],
    ["Accept-Language", "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7"],
    ["Cookie", BROWSER[6]![1]],
    ["Sec-WebSocket-Extensions", "permessage-deflate; client_max_window_bits"],
  ],
});

/** A handshake typed with curl, headers as given. */
export const curlUpgrade = (headers: [string, string][], port = WS_PORT): NetAction => ({
  type: "http",
  client: "you",
  port,
  method: "GET",
  target: "/",
  headers: [["Host", `localhost:${port}`], ["User-Agent", "curl/8.5.0"], ["Accept", "*/*"], ...headers],
  stopAfter: 30_000,
});

export const wait = (ms: number): NetAction => ({ type: "advance", ms });
