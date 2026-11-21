import { l } from "@lets-explain/core/i18n";
import { OP } from "../../engine/frames";
import { createNet, type Net, type NetAction } from "../../engine/net";
import { makeNetScene, type ViewInfo } from "../shared/NetScene";
import { browserSocket } from "../shared/requests";
import { frameView, lastFrame, remote, send, socketMetrics, socketView } from "../shared/sockets";
import { ECHO, LOGS, STREAM } from "./code";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "masking-and-fragments";

export const START = createNet({ files: { "echo.js": ECHO, "logs.js": LOGS, "stream.js": STREAM }, running: ["echo.js", "stream.js"] });

export const steps: NetAction[][] = [
  // 0 · a masked frame: the key, then the data XORed with it
  [browserSocket(9001), send("browser", "merhaba")],
  // 1 · the same text again: a new key, other bytes on the wire
  [send("browser", "merhaba")],
  // 2 · the server's frames are not masked
  [],
  // 3 · one message in three fragments
  [remote("laptop", 9003)],
  // 4 · who can split, and what may come in between
  [],
  // 5 · your turn
  [],
];

function view(net: Net, info: ViewInfo) {
  if (info.sandbox || info.step >= 3) return socketView(net, info);
  if (info.step === 2) return frameView(lastFrame(net, (f) => f.dir === "in" && f.opcode === OP.text), info, () => socketView(net, info));
  return frameView(lastFrame(net, (f) => f.dir === "out" && f.opcode === OP.text), info, () => socketView(net, info));
}

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Maskeli frame'ler ve parçalara bölünmüş bir mesaj", "Masked frames, and a message split into fragments"),
  view,
  metrics: (net, t, info) => {
    if (info.step <= 1 && !info.sandbox) {
      const masks = net.conns.flatMap((c) => c.frames.filter((f) => f.dir === "out" && f.mask).map((f) => f.mask!));
      return [
        { label: t(l("1. maske", "Mask 1")), value: masks[0] ?? "—" },
        { label: t(l("2. maske", "Mask 2")), value: masks[1] ?? "—", tone: masks[1] ? "ok" : "plain" },
      ];
    }
    if (info.step >= 3 && !info.sandbox) {
      const c = net.conns.find((x) => x.client === "laptop");
      return [
        { label: t(l("Frame", "Frames")), value: c ? c.frames.filter((f) => f.dir === "in").length : 0 },
        { label: t(l("Mesaj (onmessage)", "Messages (onmessage)")), value: c ? c.msgs.filter((m) => m.dir === "in").length : 0, tone: "ok" },
      ];
    }
    return socketMetrics(net, t, info.from);
  },
  scenarios,
  freeStart: FREE,
  actionMs: 2400,
});
