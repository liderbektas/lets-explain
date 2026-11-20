import { l } from "@lets-explain/core/i18n";
import { makeSimScene, resolveSteps } from "../shared/SimScene";
import { FleetStage } from "./FleetStage";
import { fleetSim, freshFleet, STRATEGY_NAME, type Fleet, type FleetAction, type Strategy } from "./model";
import { scenarios } from "./scenarios";
import { clusterTyped } from "./shell";

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
  // Typed: the app's manifest is a real file; kubectl and Argo Rollouts run the deploy on this fleet.
  sandbox: { typed: clusterTyped(scenarios) },
});
