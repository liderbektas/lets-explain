import { l } from "@lets-explain/core/i18n";
import { createNet, type NetAction } from "../../engine/net";
import { PhoneStage } from "../../iso/PhoneStage";
import { flowMetrics } from "../shared/metrics";
import { makeNetScene } from "../shared/NetScene";
import { phoneLabels } from "../shared/phone";
import { browserGet, wait } from "../shared/requests";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "polling";

export const START = createNet({
  messages: [
    { from: "ayse", text: "Morning! Stand-up at 10" },
    { from: "mert", text: "Deploy at 10:30" },
  ],
  planned: [
    { at: 7000, from: "mert", text: "Tests are green" },
    { at: 16000, from: "ayse", text: "Deploy starts" },
    { at: 47000, from: "mert", text: "Deploy done" },
    { at: 47200, from: "zeynep", text: "Nice!" },
  ],
});

const poll = (after: number) => browserGet(`/messages?after=${after}`);
const longPoll = (after: number) => browserGet(`/messages?after=${after}&wait=30`);

export const steps: NetAction[][] = [
  // 0 · the page loads and asks once.
  [browserGet("/messages")],
  // 1 · every 2 s for 10 s; Mert writes at 7 s.
  [wait(2000), poll(2), wait(2000), poll(2), wait(2000), poll(2), wait(2000), poll(2), wait(2000), poll(3)],
  // 2 · every half second: quicker, and every answer empty.
  [wait(500), poll(3), wait(500), poll(3), wait(500), poll(3), wait(500), poll(3)],
  // 3 · a long poll at 12 s; Ayşe writes at 16 s; the page asks again at once.
  [longPoll(3), wait(4000), longPoll(4)],
  // 4 · nobody writes for 30 s: 204, and the page asks again.
  [wait(30_000), longPoll(4)],
  // 5 · two messages 0.2 s apart: the second waits on the server until the page asks again.
  [wait(1500), longPoll(5)],
  // 6 · your turn
  [],
];

export const scene = makeNetScene({
  slug: SLUG,
  start: START,
  steps,
  label: l(
    "Solda tarayıcının açık olduğu telefon, sağda sohbet sunucusunun kabini, sağ üstte mesaj yazan ekip arkadaşları. Her istek kesik çizgide giden bir zarf, cevabı geri dönen bir zarf.",
    "The phone running the browser on the left, the chat server's rack on the right, teammates who write at the top right. Each request is an envelope going along the dashed lane; its answer is an envelope coming back.",
  ),
  view: (net, info) => (
    <PhoneStage
      net={net}
      last={info.last}
      beat={info.beat}
      device={info.sandbox ? "laptop" : "phone"}
      labels={phoneLabels(info.t, info.lang, info.sandbox ? l("Sen (terminal)", "You (terminal)") : l("Tarayıcı", "Browser"))}
    />
  ),
  metrics: (net, t, info) => flowMetrics(net, info.from, t),
  scenarios,
  freeStart: FREE,
});
