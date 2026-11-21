import { l } from "@lets-explain/core/i18n";
import { createNet, type Net, type NetAction } from "../../engine/net";
import { makeNetScene } from "../shared/NetScene";
import { run, socketView, wait, write } from "../shared/sockets";
import { READER, READER_RESUME, SERVER } from "./code";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "missed-messages";

export const START = createNet({
  files: { "server.js": SERVER, "reader.js": READER },
  running: ["server.js", "reader.js"],
  netPlan: [
    { at: 10_000, port: 9001, down: true },
    { at: 45_000, port: 9001, down: false },
    { at: 60_000, port: 9001, down: true },
    { at: 95_000, port: 9001, down: false },
  ],
});

export const steps: NetAction[][] = [
  // 0 · the Wi-Fi drops for 35 s: the reader comes back, the lines in between never do
  [wait(50_000)],
  // 1 · numbered lines and a resume: the gap fills in
  [{ type: "killFile", file: "reader.js" }, write("reader.js", READER_RESUME), run("reader.js"), wait(50_000)],
  // 2 · twice is better than never, once is best
  [],
  // 3 · how long to remember, and where
  [],
  // 4 · your turn
  [],
];

/** The lines the reader process (the newest one) has, and the gaps among them. */
export function readerLines(net: Net) {
  const p = [...net.procs].reverse().find((x) => x.file === "reader.js");
  if (!p) return { got: [] as number[], missing: 0 };
  const got = net.conns
    .filter((c) => c.client === `proc:${p.pid}`)
    .flatMap((c) => c.msgs.filter((m) => m.dir === "in"))
    .map((m) => (JSON.parse(m.text) as { seq: number }).seq);
  const max = got.length ? Math.max(...got) : 0;
  const have = new Set(got);
  let missing = 0;
  for (let s = 1; s <= max; s++) if (!have.has(s)) missing++;
  return { got, missing };
}

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Deploy log sunucusu ve onu okuyan ekran; ekranın Wi-Fi'ı arada gidiyor", "The deploy log server and the screen reading it; the screen's Wi-Fi drops now and then"),
  view: (net, info) => socketView(net, info),
  metrics: (net, t) => {
    const { got, missing } = readerLines(net);
    return [
      { label: t(l("Ekrandaki satır", "Lines on screen")), value: new Set(got).size },
      { label: t(l("Eksik", "Missing")), value: missing, tone: missing ? "danger" : "ok" },
      { label: t(l("Ağ", "Network")), value: net.blocked.length ? t(l("kopuk", "down")) : t(l("var", "up")), tone: net.blocked.length ? "danger" : "ok" },
    ];
  },
  scenarios,
  freeStart: FREE,
});
