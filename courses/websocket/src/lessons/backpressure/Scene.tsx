import { l } from "@lets-explain/core/i18n";
import { bufferedNow, createNet, type Net, type NetAction } from "../../engine/net";
import { makeNetScene } from "../shared/NetScene";
import { run, socketView, wait, write } from "../shared/sockets";
import { BOARD, skipFull } from "./code";
import { clients, FREE, scenarios } from "./scenarios";

export const SLUG = "backpressure";

export const START = createNet({ files: { "board.js": BOARD }, running: ["board.js"], actions: clients });

export const steps: NetAction[][] = [
  // 0 · 30 s of boards: the phone reads 8 KB/s, the server sends 32 KB/s
  [wait(30_000)],
  // 1 · what bufferedAmount is
  [],
  // 2 · skip a client whose queue is long
  [{ type: "kill", pid: 4242 }, write("board.js", skipFull(BOARD)), run("board.js"), wait(30_000)],
  // 3 · the choices
  [],
  // 4 · your turn
  [],
];

const kb = (n: number) => `${Math.round(n / 1024)} KB`;
const boards = (net: Net, client: string) => net.conns.filter((c) => c.client === client).reduce((n, c) => n + c.msgs.filter((m) => m.dir === "in").length, 0);

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Saniyede 32 KB'lık pano: hızlı bir dizüstü ve yavaş bir telefon", "A 32 KB board every second: a fast laptop and a slow phone"),
  view: (net, info) => socketView(net, info, { clients: ["laptop", "phone"], showQueues: true }),
  metrics: (net, t) => {
    const waiting = bufferedNow(net);
    return [
      { label: t(l("Sunucuda bekleyen", "Waiting on the server")), value: kb(waiting), tone: waiting > 512 * 1024 ? "danger" : waiting > 128 * 1024 ? "warn" : "ok" },
      { label: t(l("Dizüstü aldı", "Laptop got")), value: boards(net, "laptop") },
      { label: t(l("Telefon aldı", "Phone got")), value: boards(net, "phone") },
    ];
  },
  scenarios,
  freeStart: FREE,
});
