import { l } from "@lets-explain/core/i18n";
import { makeSimScene, resolveSteps, type SandboxRow } from "../shared/SimScene";
import { FleetStage } from "./FleetStage";
import { missions } from "./missions";
import { finished, fleetSim, freshFleet, hasV2, STRATEGY_NAME, type Fleet, type FleetAction, type Strategy } from "./model";

export const SLUG = "deploy-strategies";

export const choose = (strategy: Strategy): FleetAction => ({ type: "choose", strategy });
export const advance: FleetAction = { type: "advance" };
export const rollback: FleetAction = { type: "rollback" };
export const setBad = (bad: boolean): FleetAction => ({ type: "setBad", bad });

export const START: Fleet = freshFleet();

export const steps = resolveSteps(fleetSim, START, [
  [{ type: "serve" }],
  [choose("recreate"), advance, advance],
  [choose("rolling"), advance, advance, advance, advance],
  [setBad(true), choose("rolling"), advance, advance, rollback],
  [setBad(false), choose("blue-green"), advance, advance],
  [setBad(true), choose("canary"), advance, rollback],
  [],
  [],
]);

const ALL: Strategy[] = ["recreate", "rolling", "blue-green", "canary"];

function rows(f: Fleet, lang: "tr" | "en"): SandboxRow<FleetAction>[] {
  const tr = lang === "tr";
  const chosen = f.strategy !== null;
  return [
    {
      label: "v2",
      buttons: [{ label: f.bad ? (tr ? "v2'yi düzelt" : "fix v2") : tr ? "v2'ye bug koy" : "put a bug in v2", action: setBad(!f.bad), tone: f.bad ? "ok" : "danger", disabled: chosen }],
    },
    {
      label: tr ? "Strateji" : "Strategy",
      buttons: ALL.map((s) => ({ label: STRATEGY_NAME[s][tr ? 0 : 1], action: choose(s), tone: "producer" as const, disabled: chosen })),
    },
    {
      label: "Deploy",
      buttons: [
        { label: tr ? "sonraki adım" : "next phase", action: advance, tone: "go", disabled: !chosen || finished(f) },
        { label: tr ? "geri al" : "roll back", action: rollback, tone: "danger", disabled: !chosen || f.rolledBack || !hasV2(f) },
      ],
    },
  ];
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: fleetSim,
  start: START,
  steps,
  label: l(
    "Kullanıcılar, bir load balancer ve sunucular: hangi sunucunun hangi sürümü çalıştırdığı ve trafiğin ne kadarını aldığı",
    "Users, a load balancer and servers: which version each server runs and how much traffic it gets",
  ),
  view: (f) => <FleetStage fleet={f} />,
  metrics: (f, t) => [
    { label: t(l("Strateji", "Strategy")), value: f.strategy ? STRATEGY_NAME[f.strategy][0] : "—" },
    { label: t(l("v2'deki trafik", "Traffic on v2")), value: f.round ? `${f.round.v2}%` : "0%" },
    { label: t(l("Hatalı istek", "Failed requests")), value: f.failed, tone: f.failed ? "danger" : "ok" },
    { label: t(l("Kesinti", "Downtime")), value: t(l(`${f.downRounds} tur`, `${f.downRounds} rounds`)), tone: f.downRounds ? "danger" : "plain" },
  ],
  sandbox: { start: () => freshFleet(), rows, missions },
});
