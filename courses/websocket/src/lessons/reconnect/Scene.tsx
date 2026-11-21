import { l } from "@lets-explain/core/i18n";
import { createNet, type NetAction } from "../../engine/net";
import { makeNetScene } from "../shared/NetScene";
import { run, socketView, wait, write } from "../shared/sockets";
import { CHAT, TAB_FIXED, TAB_JITTER, TAB_NONE } from "./code";
import { FREE, scenarios, startTabs } from "./scenarios";

export const SLUG = "reconnect";
const N = 20;

/** Tabs opened over a few seconds, the way people open them: a handful a second. */
const opened = (n: number): NetAction[] => startTabs(n).flatMap((a) => [a, wait(250)]);

export const START = createNet({ files: { "chat.js": CHAT, "tab.js": TAB_NONE }, actions: [run("chat.js"), ...opened(N), wait(2000)] });

const deploy: NetAction[] = [{ type: "killFile", file: "chat.js" }, run("chat.js")];

export const steps: NetAction[][] = [
  // 0 · a deploy: tabs with no reconnect stay cut
  [...deploy, wait(4000)],
  // 1 · reconnect every second: everyone comes back at once
  [write("tab.js", TAB_FIXED), ...opened(N), wait(2000), ...deploy, wait(8000)],
  // 2 · backoff with jitter: the returns spread out
  [write("tab.js", TAB_JITTER), { type: "killFile", file: "tab.js" }, ...opened(N), wait(4000), ...deploy, wait(30_000)],
  // 3 · ceilings, codes that mean stop, and the browser's online event
  [],
  // 4 · your turn
  [],
];

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Bir sunucu ve ona bağlanan sekmeler; her nokta bir sekme", "A server and the tabs connected to it; each dot is a tab"),
  view: (net, info) => socketView(net, info),
  metrics: (net, t, info) => {
    const made = net.exchanges.slice(info.from.exchanges.length).filter((e) => e.kind === "upgrade" && e.client.startsWith("proc:"));
    const online = net.conns.filter((c) => c.serverClosedAt === null && c.server.startsWith("proc:")).length;
    const refused = made.filter((e) => e.status === 503).length;
    return [
      { label: t(l("Bağlı sekme", "Tabs connected")), value: online, tone: "ok" },
      { label: t(l("Deneme", "Attempts")), value: made.length },
      { label: t(l("503 alan", "Got 503")), value: refused, tone: refused ? "danger" : "plain" },
    ];
  },
  scenarios,
  freeStart: FREE,
});
