import { useMemo } from "react";
import { useLang } from "@lets-explain/core/i18n";
import { useTicker } from "@lets-explain/core/lib/playback";
import { createNet, simulate, type NetAction } from "./engine/net";
import { NET_STAGE, NetStage } from "./iso/NetStage";
import { stageLabels } from "./lessons/shared/NetScene";
import { browserSocket, wait } from "./lessons/shared/requests";

const lines: NetAction[] = [
  browserSocket(),
  { type: "say", from: "ayse", text: "Deploy starts in 5" },
  { type: "wsSend", client: "browser", text: JSON.stringify({ type: "chat", text: "On it" }) },
  wait(1500),
  { type: "say", from: "mert", text: "Tests are green" },
  { type: "wsSend", client: "browser", text: JSON.stringify({ type: "chat", text: "Shipping" }) },
  { type: "say", from: "ayse", text: "Deploy done" },
];

/** The course home loop: one WebSocket, messages going both ways. */
export function WsHero() {
  const { t, lang } = useLang();
  const tick = useTicker(true, false, 1700);
  const run = useMemo(() => simulate(lines, createNet()), []);
  const at = 1 + (tick % (run.states.length - 1));
  return (
    <svg className="stage-svg" viewBox={`0 0 ${NET_STAGE.width} ${NET_STAGE.height}`} aria-hidden="true">
      <NetStage net={run.states[at]!} last={run.events[at - 1] ?? []} beat={tick} labels={stageLabels(t, lang)} ports={[8081]} />
    </svg>
  );
}
