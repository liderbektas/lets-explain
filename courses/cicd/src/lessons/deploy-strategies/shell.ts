import type { Scenario } from "@lets-explain/core/course/types";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { out, type TermLine } from "@lets-explain/core/lib/terminal";
import { parse } from "yaml";
import { fail, miniShell, repoOf, say, type MiniRepo, type Step } from "../shared/miniRepo";
import type { TypedSim } from "../shared/SimScene";
import { applyFleet, finished, freshFleet, hasV2, weights, type Fleet, type FleetAction, type FleetEvent, type Strategy } from "./model";

/**
 * The deploy-strategies lesson typed, the way such deploys are really run: the app's manifest
 * (`shop.yaml`) is a Kubernetes Deployment (Recreate or RollingUpdate) or an Argo Rollouts
 * Rollout (blueGreen or canary). `kubectl apply` with a new image starts the deploy, `kubectl
 * rollout status` watches a Deployment move on, and `kubectl argo rollouts promote / abort`
 * steer a Rollout. Every move the cluster makes serves one round of 100 requests.
 *
 * Simplification: time only passes while you watch (`rollout status`) or steer; a real rollout
 * keeps moving on its own.
 */

export const MANIFEST = "shop.yaml";
const IMAGE = "ghcr.io/ada/shop";

export type Kind = "Deployment" | "Rollout";

export interface Live {
  kind: Kind;
  strategy: Strategy;
  /** 1 or 2: the image tag the cluster was last told to run. */
  version: 1 | 2;
  /** blueGreen with autoPromotionEnabled true (Argo's default): the switch happens on its own. */
  autoPromote: boolean;
}

export interface ClusterDesk {
  fleet: Fleet;
  repo: MiniRepo;
  live: Live;
}

export type ClusterAction = { type: "repo"; repo: MiniRepo } | { type: "fleet"; action: FleetAction } | { type: "live"; live: Live };

export interface ClusterCtx {
  start: ClusterDesk;
  state: ClusterDesk;
  actions: ClusterAction[];
  events: FleetEvent[][];
  states: ClusterDesk[];
}

export type ClusterScenario = Scenario<ClusterCtx, ClusterDesk>;

export function applyCluster(d: ClusterDesk, a: ClusterAction): { state: ClusterDesk; events: FleetEvent[] } {
  if (a.type === "repo") return { state: { ...d, repo: a.repo }, events: [] };
  if (a.type === "live") return { state: { ...d, live: a.live }, events: [] };
  const r = applyFleet(d.fleet, a.action);
  return { state: { ...d, fleet: r.state }, events: r.events };
}

export function replayCluster(start: ClusterDesk, actions: ClusterAction[]) {
  const states = [start];
  const events: FleetEvent[][] = [];
  let d = start;
  for (const a of actions) {
    const r = applyCluster(d, a);
    d = r.state;
    states.push(d);
    events.push(r.events);
  }
  return { states, events };
}

/* ------------------------------------------------------------- manifests */

const STRATEGY_YAML: Record<Strategy, string> = {
  recreate: "  strategy:\n    type: Recreate",
  rolling: "  strategy:\n    type: RollingUpdate\n    rollingUpdate:\n      maxUnavailable: 0\n      maxSurge: 1",
  "blue-green": "  strategy:\n    blueGreen:\n      activeService: shop\n      previewService: shop-preview\n      autoPromotionEnabled: false",
  canary: "  strategy:\n    canary:\n      steps:\n        - setWeight: 10\n        - pause: {}\n        - setWeight: 50\n        - pause: {}",
};

export const kindOf = (s: Strategy): Kind => (s === "recreate" || s === "rolling" ? "Deployment" : "Rollout");

/** The app's manifest for a strategy and an image version. */
export function manifest(strategy: Strategy, version: 1 | 2 = 1): string {
  const kind = kindOf(strategy);
  return [
    kind === "Deployment" ? "apiVersion: apps/v1" : "apiVersion: argoproj.io/v1alpha1",
    `kind: ${kind}`,
    "metadata:",
    "  name: shop",
    "spec:",
    "  replicas: 4",
    STRATEGY_YAML[strategy],
    "  selector:",
    "    matchLabels:",
    "      app: shop",
    "  template:",
    "    metadata:",
    "      labels:",
    "        app: shop",
    "    spec:",
    "      containers:",
    "        - name: shop",
    `          image: ${IMAGE}:v${version}`,
  ].join("\n");
}

/** A cluster running v1 with this strategy; `bad` puts a bug in v2. */
export function clusterDesk(strategy: Strategy, bad: boolean): ClusterDesk {
  return { fleet: freshFleet(bad), repo: repoOf({ [MANIFEST]: manifest(strategy), "Dockerfile": "FROM node:22-slim\nCOPY . .\nCMD [\"node\", \"server.js\"]" }), live: { kind: kindOf(strategy), strategy, version: 1, autoPromote: false } };
}

/** What a manifest asks for, or why kubectl / this sandbox cannot take it. */
export function readManifest(text: string): Live | string {
  let js: Record<string, unknown>;
  try {
    js = (parse(text) ?? {}) as Record<string, unknown>;
  } catch (e) {
    const line = /line (\d+)/.exec(String(e))?.[1] ?? "1";
    return `error: error parsing ${MANIFEST}: error converting YAML to JSON: yaml: line ${line}: could not find expected ':'`;
  }
  const kind = js.kind;
  if (kind !== "Deployment" && kind !== "Rollout") return `error: resource mapping not found for name: "shop" namespace: "" from "${MANIFEST}": no matches for kind "${String(kind)}"`;
  const spec = (js.spec ?? {}) as { strategy?: Record<string, unknown>; template?: { spec?: { containers?: { image?: string }[] } } };
  const image = spec.template?.spec?.containers?.[0]?.image ?? "";
  const m = new RegExp(`^${IMAGE.replace(/\./g, "\\.")}:v([12])$`).exec(image);
  if (!m) return `${MANIFEST}: (this sandbox has two builds of the app: ${IMAGE}:v1 and ${IMAGE}:v2)`;
  const version = Number(m[1]) as 1 | 2;
  const st = spec.strategy ?? {};
  if (kind === "Deployment") {
    const type = (st.type as string | undefined) ?? "RollingUpdate";
    if (type !== "Recreate" && type !== "RollingUpdate") return `The Deployment "shop" is invalid: spec.strategy.type: Unsupported value: "${type}": supported values: "Recreate", "RollingUpdate"`;
    if ("blueGreen" in st || "canary" in st) return `error: error validating "${MANIFEST}": error validating data: ValidationError(Deployment.spec.strategy): unknown field "${"blueGreen" in st ? "blueGreen" : "canary"}" in io.k8s.api.apps.v1.DeploymentStrategy; blue-green and canary need an Argo Rollouts Rollout (kind: Rollout)`;
    return { kind, strategy: type === "Recreate" ? "recreate" : "rolling", version, autoPromote: false };
  }
  if (st.blueGreen && typeof st.blueGreen === "object") {
    const bg = st.blueGreen as Record<string, unknown>;
    return { kind, strategy: "blue-green", version, autoPromote: bg.autoPromotionEnabled !== false };
  }
  if (st.canary && typeof st.canary === "object") {
    const steps = ((st.canary as { steps?: Record<string, unknown>[] }).steps ?? []).map((s) => ("setWeight" in s ? `w${s.setWeight}` : "pause" in s ? "p" : "?")).join(",");
    if (steps !== "w10,p,w50,p") return `${MANIFEST}: (this sandbox's canary steps are: setWeight: 10, pause: {}, setWeight: 50, pause: {})`;
    return { kind, strategy: "canary", version, autoPromote: false };
  }
  return `The Rollout "shop" is invalid: spec.strategy: Required value: a Rollout needs a blueGreen or a canary strategy`;
}

/* ------------------------------------------------------------- the shell */

const fleetStep = (action: FleetAction): ClusterAction => ({ type: "fleet", action });
const inProgress = (f: Fleet) => f.strategy !== null && hasV2(f) && !finished(f);
const resource = (k: Kind) => (k === "Deployment" ? "deployment.apps/shop" : "rollout.argoproj.io/shop");

function apply(d: ClusterDesk, file: string | undefined): Step<ClusterAction, ClusterDesk> {
  if (!file) return fail("error: must specify one of -f and -k");
  if (file !== MANIFEST && file !== `./${MANIFEST}`) return fail(`error: the path "${file}" does not exist`);
  const want = readManifest(d.repo.files[MANIFEST] ?? "");
  if (typeof want === "string") return fail(want);
  const live = d.live;
  const actions: ClusterAction[] = [];
  const changed = want.kind !== live.kind || want.strategy !== live.strategy || want.version !== live.version || want.autoPromote !== live.autoPromote;
  if (!changed) return say(`${resource(want.kind)} unchanged`);
  actions.push({ type: "live", live: want });
  const f = d.fleet;
  if (want.version === 2 && (live.version === 1 || f.rolledBack || !hasV2(f))) {
    // A new image: the deploy starts with the strategy the manifest names.
    actions.push(fleetStep({ type: "choose", strategy: want.strategy }), fleetStep({ type: "advance" }));
    if (want.strategy === "blue-green" && want.autoPromote) actions.push(fleetStep({ type: "advance" }));
  } else if (want.version === 1 && live.version === 2 && hasV2(f) && !f.rolledBack) {
    // Back to the old image: the cluster rolls back.
    actions.push(fleetStep({ type: "rollback" }));
  }
  return { actions, output: [out(`${resource(want.kind)} configured`)] };
}

function rolloutStatus(d: ClusterDesk): Step<ClusterAction, ClusterDesk> {
  if (d.live.kind !== "Deployment") return fail(`Error from server (NotFound): deployments.apps "shop" not found`);
  let f = d.fleet;
  if (!inProgress(f)) return say(`deployment "shop" successfully rolled out`);
  const actions: ClusterAction[] = [];
  const o: TermLine[] = [];
  const updated = (x: Fleet) => (x.strategy === "recreate" ? (x.phase >= 2 ? 4 : 0) : x.phase);
  while (inProgress(f)) {
    o.push(out(`Waiting for deployment "shop" rollout to finish: ${updated(f)} of 4 updated replicas are available...`));
    actions.push(fleetStep({ type: "advance" }));
    f = applyFleet(f, { type: "advance" }).state;
  }
  o.push(out(`deployment "shop" successfully rolled out`, "add"));
  return { actions, output: o };
}

function argo(d: ClusterDesk, args: string[]): Step<ClusterAction, ClusterDesk> {
  const [sub, ...rest] = args;
  const name = rest.filter((a) => !a.startsWith("-")).at(-1);
  if (d.live.kind !== "Rollout") return fail(`Error: rollouts.argoproj.io "shop" not found`);
  if (sub !== "version" && name !== "shop") return fail(`Error: rollouts.argoproj.io "${name ?? ""}" not found`);
  const f = d.fleet;
  switch (sub) {
    case "promote": {
      if (!inProgress(f)) return say("rollout 'shop' promoted");
      return { actions: [fleetStep({ type: "advance" })], output: [out("rollout 'shop' promoted")] };
    }
    case "abort": {
      if (!hasV2(f) || f.rolledBack) return say("rollout 'shop' aborted");
      return { actions: [fleetStep({ type: "rollback" })], output: [out("rollout 'shop' aborted")] };
    }
    case "status":
      return say(statusWord(d), f.rolledBack ? "del" : "out");
    case "get":
      return { actions: [], output: getRollout(d) };
    default:
      return say("(in this sandbox: kubectl argo rollouts get rollout shop | status shop | promote shop | abort shop)", "dim");
  }
}

function statusWord(d: ClusterDesk): string {
  const f = d.fleet;
  if (f.rolledBack) return "Degraded - RolloutAborted: Rollout aborted update to revision 2";
  if (inProgress(f)) return d.live.strategy === "canary" ? "Paused - CanaryPauseStep" : "Paused - BlueGreenPause";
  return "Healthy";
}

function getRollout(d: ClusterDesk): TermLine[] {
  const f = d.fleet;
  const s = d.live.strategy;
  const o: TermLine[] = [out("Name:            shop"), out("Namespace:       default"), out(`Status:          ${f.rolledBack ? "✖ Degraded" : inProgress(f) ? "॥ Paused" : "✔ Healthy"}`, f.rolledBack ? "del" : inProgress(f) ? "hl" : "add"), out(`Strategy:        ${s === "canary" ? "Canary" : "BlueGreen"}`)];
  if (s === "canary") {
    const step = !f.strategy ? 4 : f.phase === 1 ? 1 : f.phase === 2 ? 3 : 4;
    o.push(out(`  Step:          ${step}/4`), out(`  SetWeight:     ${f.canary || (inProgress(f) ? 0 : 100)}`), out(`  ActualWeight:  ${f.canary || (inProgress(f) ? 0 : 100)}`));
  }
  const v2 = hasV2(f) && !f.rolledBack;
  o.push(out("Images:          " + (v2 && inProgress(f) ? `${IMAGE}:v1 (stable${s === "blue-green" ? ", active" : ""})` : `${IMAGE}:v${v2 ? 2 : 1} (stable${s === "blue-green" ? ", active" : ""})`)));
  if (v2 && inProgress(f)) o.push(out(`                 ${IMAGE}:v2 (${s === "canary" ? "canary" : "preview"})`));
  return o;
}

function curl(d: ClusterDesk, url: string | undefined): Step<ClusterAction, ClusterDesk> {
  const f = d.fleet;
  if (!url) return fail("curl: try 'curl --help' for more information");
  if (/preview\.shop\.example/.test(url)) {
    const green = f.servers.some((s) => s.group === "green");
    if (!green || f.live === "green") return fail("curl: (6) Could not resolve host: preview.shop.example");
    return f.bad ? fail("curl: (22) The requested URL returned error: 500") : say("200 OK");
  }
  if (!/(^|\/\/)shop\.example/.test(url)) return fail(`curl: (6) Could not resolve host: ${url.replace(/^https?:\/\//, "").split("/")[0]}`);
  const w = weights(f);
  let v2 = 0;
  let total = 0;
  for (const s of f.servers) {
    total += w.get(s.id) ?? 0;
    if (s.version === 2) v2 += w.get(s.id) ?? 0;
  }
  if (total === 0) return fail("curl: (7) Failed to connect to shop.example port 443 after 3 ms: Couldn't connect to server");
  const share = Math.round(v2);
  const r = f.round;
  const note = out(r ? `(the last 100 requests: ${r.v1} answered by v1, ${r.v2} by v2, ${r.failed} errors)` : `(right now the load balancer sends ${share}% of requests to v2)`, r?.failed ? "del" : "dim");
  if (f.bad && share >= 50) return { actions: [], output: [out("curl: (22) The requested URL returned error: 500", "err"), note], failed: true };
  return { actions: [], output: [out("200 OK"), note] };
}

function getPods(d: ClusterDesk): TermLine[] {
  const ids = ["7c9f8", "5d2k1", "9x4mz", "2b7qw", "8h3np", "4r6tv", "6j1cs", "3m8ld", "1f5gy"];
  const o = [out("NAME                    READY   STATUS        RESTARTS   AGE", "dim")];
  d.fleet.servers.forEach((s, i) => {
    const rs = s.version === 2 ? "6b8d4f" : "5f7c9a";
    o.push(out(`shop-${rs}-${ids[i % ids.length]}     ${s.up ? "1/1     Running    " : "0/1     Terminating"}   0          ${s.version === 2 ? "1m" : "3d"}`));
  });
  return o;
}

function extra(d: ClusterDesk, words: string[]): Step<ClusterAction, ClusterDesk> | null {
  const [cmd, sub, ...rest] = words;
  if (cmd === "curl") return curl(d, words.slice(1).find((a) => !a.startsWith("-")));
  if (cmd !== "kubectl") return null;
  switch (sub) {
    case "apply": {
      const i = rest.findIndex((a) => a === "-f" || a === "--filename");
      return apply(d, i >= 0 ? rest[i + 1] : rest.find((a) => a.startsWith("--filename="))?.slice(11));
    }
    case "rollout": {
      const [what, target] = rest;
      if (target !== "deployment/shop" && target !== "deploy/shop") return fail(`error: the server doesn't have a resource type "${(target ?? "").split("/")[0]}"`);
      if (what === "status") return rolloutStatus(d);
      if (what === "undo") {
        if (d.live.kind !== "Deployment") return fail(`Error from server (NotFound): deployments.apps "shop" not found`);
        if (!hasV2(d.fleet) || d.fleet.rolledBack) return fail(`error: no rollout history found for deployment "shop"`);
        return { actions: [fleetStep({ type: "rollback" }), { type: "live", live: { ...d.live, version: 1 } }], output: [out("deployment.apps/shop rolled back")] };
      }
      return say("(in this sandbox: kubectl rollout status|undo deployment/shop)", "dim");
    }
    case "argo":
      if (rest[0] !== "rollouts") return fail(`error: unknown command "argo ${rest[0] ?? ""}" for "kubectl"`);
      return argo(d, rest.slice(1));
    case "get":
      if (rest[0] === "pods" || rest[0] === "pod" || rest[0] === "po") return { actions: [], output: getPods(d) };
      if (rest[0]?.startsWith("deploy")) return d.live.kind === "Deployment" ? say(`NAME   READY   UP-TO-DATE   AVAILABLE   AGE\nshop   ${d.fleet.servers.filter((s) => s.up).length}/4     ${d.fleet.servers.filter((s) => s.version === 2).length}            ${d.fleet.servers.filter((s) => s.up).length}           3d`) : say("No resources found in default namespace.");
      if (rest[0]?.startsWith("rollout")) return d.live.kind === "Rollout" ? say(`NAME   DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE\nshop   4         ${d.fleet.servers.length}         ${d.fleet.servers.filter((s) => s.version === 2).length}            ${d.fleet.servers.filter((s) => s.up).length}           3d`) : say("No resources found in default namespace.");
      return say(`(in this sandbox: kubectl get pods | deployments | rollouts)`, "dim");
    default:
      return say("(in this sandbox: kubectl apply -f shop.yaml, kubectl rollout status|undo deployment/shop, kubectl argo rollouts get|status|promote|abort shop, kubectl get pods)", "dim");
  }
}

export const clusterShell = miniShell<ClusterAction, ClusterDesk>({
  repo: (d) => d.repo,
  setRepo: (repo) => ({ type: "repo", repo }),
  apply: (d, a) => applyCluster(d, a).state,
  extra,
  prompt: () => "~/shop (main)$",
  words: ["kubectl", "curl", "apply", "-f", MANIFEST, "rollout", "status", "undo", "deployment/shop", "argo", "rollouts", "promote", "abort", "shop", "https://shop.example/health", "https://preview.shop.example/health"],
  help: `This sandbox understands:
  nano shop.yaml                               edit the app's manifest (strategy, image tag)
  kubectl apply -f shop.yaml                   send it to the cluster; a new image starts a deploy
  kubectl rollout status deployment/shop       watch a Deployment's rollout to the end
  kubectl rollout undo deployment/shop         roll a Deployment back
  kubectl argo rollouts get rollout shop       a Rollout's state
  kubectl argo rollouts promote shop           a Rollout's next step
  kubectl argo rollouts abort shop             put a Rollout back on the stable version
  kubectl get pods
  curl https://shop.example/health             ask the site (preview.shop.example: blue-green's idle side)
  cat, ls, clear`,
  push: () => "(this lesson deploys with kubectl apply; there is no CI to push to here)",
});

/** Types lines into a deploy-strategies scenario, saving editors with `edits`. */
export function typeIntoCluster(start: ClusterDesk, typed: string[], edits: ((t: string) => string)[] = []) {
  const r = typeLines(clusterShell, (d, as) => replayCluster(d, as).states.at(-1)!, start, typed, edits);
  const run = replayCluster(start, r.actions);
  const ctx: ClusterCtx = { start, state: run.states.at(-1)!, actions: r.actions, events: run.events, states: run.states };
  return { ctx, moves: r.moves, output: r.output };
}

export function clusterTyped(scenarios: ClusterScenario[]): TypedSim<Fleet, FleetEvent, ClusterDesk, ClusterAction, ClusterCtx> {
  return {
    scenarios,
    freeStart: () => clusterDesk("rolling", false),
    shell: clusterShell,
    replay: replayCluster,
    project: (d) => d.fleet,
    context: (start, actions, r) => ({ start, state: r.states.at(-1)!, actions, events: r.events, states: r.states }),
  };
}

