import { l } from "@lets-explain/core/i18n";
import { OP } from "../../engine/frames";
import { createNet, type Net, type NetAction } from "../../engine/net";
import { makeNetScene, type ViewInfo } from "../shared/NetScene";
import { browserSocket } from "../shared/requests";
import { close, frameView, lastFrame, send, socketMetrics, socketView } from "../shared/sockets";
import { ECHO, SENSOR } from "./code";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "frames";

export const START = createNet({ files: { "echo.js": ECHO, "sensor.js": SENSOR }, running: ["echo.js"] });

export const LONG = "x".repeat(300);

export const steps: NetAction[][] = [
  // 0 · "merhaba" from the browser: 2 header bytes, 4 mask bytes, 7 data bytes
  [browserSocket(9001), send("browser", "merhaba")],
  // 1 · the echo coming back: no mask
  [],
  // 2 · four bytes of binary
  [send("browser", "00d7012c", true)],
  // 3 · 300 bytes: the length no longer fits in 7 bits
  [send("browser", LONG)],
  // 4 · the close frame
  [close("browser", 1000, "bye")],
  // 5 · your turn
  [],
];

const picks: Record<number, (f: { dir: string; opcode: number }) => boolean> = {
  0: (f) => f.dir === "out" && f.opcode === OP.text,
  1: (f) => f.dir === "in" && f.opcode === OP.text,
  2: (f) => f.dir === "out" && f.opcode === OP.binary,
  3: (f) => f.dir === "out" && f.opcode === OP.text,
  4: (f) => f.dir === "out" && f.opcode === OP.close,
};

function view(net: Net, info: ViewInfo) {
  const pick = picks[info.step];
  if (info.sandbox || !pick) return socketView(net, info);
  return frameView(lastFrame(net, pick), info, () => socketView(net, info));
}

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir WebSocket frame'i, kablodaki baytlarıyla", "A WebSocket frame, byte by byte as it goes on the wire"),
  view,
  metrics: (net, t, info) => {
    const pick = picks[info.step];
    const f = pick && !info.sandbox ? lastFrame(net, pick) : undefined;
    if (!f) return socketMetrics(net, t, info.from);
    return [
      { label: t(l("Başlık", "Header")), value: `${f.wire - f.size} B` },
      { label: t(l("Veri", "Payload")), value: `${f.size} B` },
      { label: t(l("Toplam", "Total")), value: `${f.wire} B`, tone: "ok" },
    ];
  },
  scenarios,
  freeStart: FREE,
  actionMs: 2400,
});
