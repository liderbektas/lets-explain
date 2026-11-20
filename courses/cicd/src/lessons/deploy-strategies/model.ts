import type { Change } from "@lets-explain/core/course/types";
import { l, type Lang } from "@lets-explain/core/i18n";
import type { Line } from "../../engine/describe";
import type { Sim } from "../shared/SimScene";

/**
 * A small fleet behind a load balancer, for comparing deploy strategies. Four servers run v1.
 * A deploy moves them to v2 in phases that depend on the strategy; every move serves one round
 * of 100 requests, so you can count what users saw: answers from v1, from v2, errors from a
 * broken v2, and rounds where nothing was up at all (downtime).
 */

export type Strategy = "recreate" | "rolling" | "blue-green" | "canary";
export type Group = "blue" | "green" | "canary";

export interface Server {
  id: string;
  group: Group;
  version: 1 | 2;
  up: boolean;
}

export interface Round {
  /** Requests answered by v1 / by v2. */
  v1: number;
  v2: number;
  /** Requests that got an error: a broken v2, or no server up. */
  failed: number;
  down: boolean;
}

export interface Fleet {
  strategy: Strategy | null;
  /** v2 has a bug that answers 500. */
  bad: boolean;
  servers: Server[];
  phase: number;
  /** Which group the load balancer sends traffic to (blue-green). */
  live: "blue" | "green";
  /** Canary's share of traffic, in percent. */
  canary: number;
  rolledBack: boolean;
  /** The checks the team ran on the idle green servers, if any. */
  greenCheck: "ok" | "bad" | null;
  round: Round | null;
  failed: number;
  downRounds: number;
  rounds: number;
}

export type FleetAction =
  | { type: "choose"; strategy: Strategy }
  | { type: "advance" }
  | { type: "rollback" }
  | { type: "setBad"; bad: boolean }
  | { type: "serve" };

export type FleetEvent =
  | { type: "phase"; strategy: Strategy; phase: number }
  | { type: "round"; round: Round }
  | { type: "greenCheck"; ok: boolean }
  | { type: "rolledBack"; strategy: Strategy }
  | { type: "chosen"; strategy: Strategy }
  | { type: "bad"; bad: boolean }
  | { type: "error"; code: string };

const blue = (): Server[] => [1, 2, 3, 4].map((i) => ({ id: `b${i}`, group: "blue" as const, version: 1 as const, up: true }));

export function freshFleet(bad = false): Fleet {
  return { strategy: null, bad, servers: blue(), phase: 0, live: "blue", canary: 0, rolledBack: false, greenCheck: null, round: null, failed: 0, downRounds: 0, rounds: 0 };
}

/** The last phase of each strategy: when every user is on v2. */
export const LAST: Record<Strategy, number> = { recreate: 2, rolling: 4, "blue-green": 2, canary: 3 };

export const finished = (f: Fleet) => f.strategy !== null && (f.rolledBack || f.phase >= LAST[f.strategy]);
export const hasV2 = (f: Fleet) => f.servers.some((s) => s.version === 2);

/** How 100 requests split over the servers right now. */
export function weights(f: Fleet): Map<string, number> {
  const out = new Map<string, number>();
  const share = (list: Server[], total: number) => {
    const up = list.filter((s) => s.up);
    for (const s of up) out.set(s.id, total / up.length);
  };
  if (f.strategy === "blue-green") share(f.servers.filter((s) => s.group === f.live), 100);
  else if (f.strategy === "canary" && f.canary > 0) {
    share(f.servers.filter((s) => s.group === "canary"), f.canary);
    share(f.servers.filter((s) => s.group === "blue"), 100 - f.canary);
  } else share(f.servers.filter((s) => s.group !== "green" && s.group !== "canary"), 100);
  return out;
}

function serve(f: Fleet): Round {
  const w = weights(f);
  let v1 = 0;
  let v2 = 0;
  for (const s of f.servers) {
    const n = w.get(s.id) ?? 0;
    if (s.version === 1) v1 += n;
    else v2 += n;
  }
  const total = v1 + v2;
  const down = total === 0;
  const failed = down ? 100 : f.bad ? v2 : 0;
  return { v1: Math.round(v1), v2: Math.round(v2), failed: Math.round(failed), down };
}

function withRound(f: Fleet, events: FleetEvent[], round = serve(f)): Fleet {
  events.push({ type: "round", round });
  return { ...f, round, failed: f.failed + round.failed, downRounds: f.downRounds + (round.down ? 1 : 0), rounds: f.rounds + 1 };
}

const refuse = (f: Fleet, code: string) => ({ state: f, events: [{ type: "error", code } as FleetEvent] });

export function applyFleet(f: Fleet, a: FleetAction): { state: Fleet; events: FleetEvent[] } {
  const events: FleetEvent[] = [];
  switch (a.type) {
    case "setBad":
      if (f.bad === a.bad) return refuse(f, "same");
      return { state: { ...f, bad: a.bad }, events: [{ type: "bad", bad: a.bad }] };
    case "choose":
      return { state: { ...freshFleet(f.bad), strategy: a.strategy }, events: [{ type: "chosen", strategy: a.strategy }] };
    case "serve":
      return { state: withRound(f, events), events };
    case "advance": {
      if (!f.strategy || finished(f)) return refuse(f, "nothing-to-advance");
      const phase = f.phase + 1;
      let servers = f.servers.map((s) => ({ ...s }));
      let next: Fleet = { ...f, phase };
      switch (f.strategy) {
        case "recreate":
          if (phase === 1) servers = servers.map((s) => ({ ...s, up: false }));
          else servers = servers.map((s) => ({ ...s, version: 2, up: true }));
          break;
        case "rolling":
          servers[phase - 1] = { ...servers[phase - 1]!, version: 2 };
          break;
        case "blue-green":
          if (phase === 1) {
            servers = [...servers, ...[1, 2, 3, 4].map((i) => ({ id: `g${i}`, group: "green" as const, version: 2 as const, up: true }))];
            next = { ...next, greenCheck: f.bad ? "bad" : "ok" };
            events.push({ type: "greenCheck", ok: !f.bad });
          } else next = { ...next, live: "green" };
          break;
        case "canary":
          if (phase === 1) {
            servers = [...servers, { id: "c1", group: "canary", version: 2, up: true }];
            next = { ...next, canary: 10 };
          } else if (phase === 2) next = { ...next, canary: 50 };
          else {
            servers = servers.filter((s) => s.group !== "canary").map((s) => ({ ...s, version: 2 }));
            next = { ...next, canary: 0 };
          }
          break;
      }
      events.push({ type: "phase", strategy: f.strategy, phase });
      return { state: withRound({ ...next, servers }, events), events };
    }
    case "rollback": {
      if (!f.strategy || f.rolledBack || !hasV2(f)) return refuse(f, "nothing-to-roll-back");
      events.push({ type: "rolledBack", strategy: f.strategy });
      const v1 = f.servers.filter((s) => s.group === "blue").map((s) => ({ ...s, version: 1 as const, up: true }));
      const back: Fleet = { ...f, servers: v1, live: "blue", canary: 0, rolledBack: true };
      if (f.strategy === "blue-green" || (f.strategy === "canary" && f.phase < LAST.canary)) {
        // The old version never went away: the load balancer just points back at it.
        return { state: withRound(back, events), events };
      }
      if (f.strategy === "recreate") {
        // Recreate again: stop everything, then start v1.
        return { state: withRound(back, events, { v1: 0, v2: 0, failed: 100, down: true }), events };
      }
      // Rolling back is another rolling deploy: this round is still served by what runs now.
      return { state: withRound(back, events, serve(f)), events };
    }
  }
}

/* ---------------------------------------------------------------- texts */

export const STRATEGY_NAME: Record<Strategy, [string, string]> = {
  recreate: ["Recreate", "Recreate"],
  rolling: ["Rolling", "Rolling"],
  "blue-green": ["Blue-green", "Blue-green"],
  canary: ["Canary", "Canary"],
};

/** What a phase did, in one short sentence. */
export function phaseText(s: Strategy, phase: number, tr: boolean): string {
  const t = (a: string, b: string) => (tr ? a : b);
  switch (s) {
    case "recreate":
      return phase === 1 ? t("Bütün v1 sunucuları durduruldu", "Every v1 server stopped") : t("Bütün sunucular v2 ile açıldı", "Every server started on v2");
    case "rolling":
      return t(`${phase}. sunucu v2'ye geçti (${phase}/4)`, `Server ${phase} moved to v2 (${phase}/4)`);
    case "blue-green":
      return phase === 1 ? t("Green ortamı v2 ile kuruldu, trafik hâlâ blue'da", "Green set up with v2; traffic still on blue") : t("Load balancer trafiği tek hamlede green'e çevirdi", "The load balancer switched all traffic to green at once");
    case "canary":
      return phase === 1 ? t("Bir canary sunucu v2 ile açıldı, trafiğin %10'u ona", "One canary server started on v2 with 10% of traffic") : phase === 2 ? t("Canary'nin payı %50'ye çıktı", "The canary's share went up to 50%") : t("Bütün sunucular v2'ye geçti", "Every server moved to v2");
  }
}

export function describeFleet(e: FleetEvent, lang: Lang): Line {
  const tr = lang === "tr";
  switch (e.type) {
    case "chosen":
      return { text: tr ? `Strateji: ${STRATEGY_NAME[e.strategy][0]}` : `Strategy: ${STRATEGY_NAME[e.strategy][1]}`, tone: "read" };
    case "bad":
      return { text: e.bad ? (tr ? "v2'de bir hata var: istekleri 500 ile cevaplayacak" : "v2 has a bug: it will answer requests with 500") : tr ? "v2 sağlam" : "v2 is healthy", tone: e.bad ? "bad" : "ok" };
    case "phase":
      return { text: phaseText(e.strategy, e.phase, tr), tone: "produce" };
    case "greenCheck":
      return { text: e.ok ? (tr ? "  Green'e içeriden bakıldı: 200 OK" : "  Green checked from inside: 200 OK") : tr ? "  Green'e içeriden bakıldı: 500!" : "  Green checked from inside: 500!", tone: e.ok ? "ok" : "bad" };
    case "round": {
      const r = e.round;
      if (r.down) return { text: tr ? "  100 istek: hiçbir sunucu ayakta değil, hepsi hata aldı" : "  100 requests: no server is up, all of them failed", tone: "bad" };
      return {
        text: tr ? `  100 istek: ${r.v1} v1'den, ${r.v2} v2'den${r.failed ? `, ${r.failed} hata` : ""}` : `  100 requests: ${r.v1} from v1, ${r.v2} from v2${r.failed ? `, ${r.failed} errors` : ""}`,
        tone: r.failed ? "bad" : "ok",
      };
    }
    case "rolledBack":
      return { text: tr ? "Geri alındı: herkes yine v1'de" : "Rolled back: everyone is on v1 again", tone: "read" };
    case "error":
      return { text: tr ? "Bu hamle şu an yapılamaz." : "That move is not possible right now.", tone: "bad" };
  }
}

function fleetChanges(before: Fleet, after: Fleet): Change[] {
  const out: Change[] = [];
  if (after.strategy && after.strategy !== before.strategy) out.push({ kind: "change", text: l(`Strateji: ${STRATEGY_NAME[after.strategy][0]}`, `Strategy: ${STRATEGY_NAME[after.strategy][1]}`) });
  const v2 = after.servers.filter((s) => s.version === 2).length;
  if (v2 !== before.servers.filter((s) => s.version === 2).length) out.push({ kind: "change", text: l(`${v2} sunucu v2 çalıştırıyor`, `${v2} servers run v2`) });
  const failed = after.failed - (after.strategy === before.strategy ? before.failed : 0);
  if (failed > 0) out.push({ kind: "bad", text: l(`${failed} istek hata aldı`, `${failed} requests failed`) });
  const down = after.downRounds - (after.strategy === before.strategy ? before.downRounds : 0);
  if (down > 0) out.push({ kind: "bad", text: l(`${down} tur boyunca site tamamen kapalıydı`, `The site was fully down for ${down} round${down > 1 ? "s" : ""}`) });
  if (after.rolledBack && !before.rolledBack) out.push({ kind: "good", text: l("Herkes yine v1'de", "Everyone is back on v1") });
  if (after.round && after.round.v2 === 100 && after.round.failed === 0 && !(before.round?.v2 === 100)) out.push({ kind: "good", text: l("Bütün trafik v2'de, hatasız", "All traffic on v2, no errors") });
  return out;
}

export const fleetSim: Sim<Fleet, FleetAction, FleetEvent> = { apply: applyFleet, describe: describeFleet, changes: fleetChanges };
