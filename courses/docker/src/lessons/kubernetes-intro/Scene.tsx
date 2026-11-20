import { SceneFrame, type Metric } from "@lets-explain/core/components/SceneFrame";
import { useTypedSandbox } from "@lets-explain/core/components/TypedSandbox";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { l, useLang, type L } from "@lets-explain/core/i18n";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { ClusterView, type ClusterLabels } from "./ClusterView";
import { clusterChanges, describeKube } from "./describe";
import { kubeShell } from "./kubectl";
import { createCluster, simulate, type Cluster, type KubeAction, type KubeEvent } from "./model";
import { RUNNING, scenarios, type KubeCtx } from "./scenarios";

export const SLUG = "kubernetes-intro";

/** The lesson's story, one list of actions per step. The last step is the try-it step. */
export const steps: KubeAction[][] = [
  [],
  [{ type: "apply", replicas: 3, version: "v1" }],
  [{ type: "expose" }, { type: "curl" }, { type: "curl" }, { type: "curl" }],
  [{ type: "killPod" }],
  [{ type: "nodeDown", node: "node-2" }],
  [{ type: "scale", to: 5 }],
  [{ type: "setImage", version: "v2" }, { type: "curl" }],
  [{ type: "nodeUp", node: "node-2" }],
  [],
  [],
];

const ends: number[] = [];
steps.reduce((n, s) => {
  ends.push(n + s.length);
  return n + s.length;
}, 0);
export const stepStart = (step: number) => (step === 0 ? 0 : ends[step - 1]!);
export const stepEnd = (step: number) => ends[step]!;
export const run = simulate(steps.flat(), createCluster());
const SANDBOX = steps.length - 1;

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX) return [];
  return clusterChanges(run.states[stepStart(step)]!, run.states[stepEnd(step)]!);
}

const labels = (t: (x: L) => string): ClusterLabels => ({
  controlPlane: "Control plane",
  deployment: "Deployment",
  wanted: t(l("istenen", "desired")),
  running: t(l("çalışan", "running")),
  service: "Service",
  noDeployment: t(l("Henüz Deployment yok", "No Deployment yet")),
  notReady: "NotReady",
});

const text = {
  label: l("Üç node'lu bir Kubernetes cluster'ı, bir Deployment ve bir Service", "A three-node Kubernetes cluster, a Deployment and a Service"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  nothing: l("Bir kubectl komutu yaz; cluster'da ne olduğunu burada sade bir dille gör.", "Type a kubectl command; see what happened in the cluster here, in plain words."),
};

export function KubernetesScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX;
  const cursor = usePlayback(sandbox ? 0 : (steps[step]?.length ?? 0), paused, `${step}-${replayKey}`);

  // The try-it step: kubectl in a terminal, on the lesson's cluster.
  const box = useTypedSandbox({
    slug: SLUG,
    active: sandbox,
    scenarios,
    freeStart: RUNNING,
    shell: kubeShell,
    replay: (start: Cluster, actions: KubeAction[]) => simulate(actions, start),
    final: (r) => r.states[r.states.length - 1]!,
    context: (start, actions, r): KubeCtx => ({ start, state: r.states[r.states.length - 1]!, actions, events: r.events }),
  });

  let state: Cluster;
  let last: KubeEvent[];
  let shown: KubeEvent[];
  if (box.run) {
    state = box.run.states[box.run.states.length - 1]!;
    last = box.run.events[box.run.events.length - 1] ?? [];
    shown = box.run.events.flat();
  } else {
    const s0 = stepStart(Math.min(step, SANDBOX));
    state = run.states[s0 + cursor]!;
    last = cursor > 0 ? run.events[s0 + cursor - 1]! : [];
    shown = [];
  }

  const metrics: Metric[] = [
    { label: t(l("İstenen", "Desired")), value: state.desired ?? "—" },
    { label: t(l("Çalışan pod", "Running pods")), value: state.pods.length, tone: state.desired !== null && state.pods.length < state.desired ? "danger" : "ok" },
    { label: t(l("Ayaktaki node", "Nodes up")), value: `${state.nodes.filter((n) => n.up).length}/3`, tone: state.nodes.every((n) => n.up) ? "plain" : "warn" },
    { label: t(l("Sürüm", "Version")), value: state.version },
  ];

  const lines = shown.map((e) => describeKube(e, lang));
  const footer = sandbox ? (
    <div className="sandbox">
      {box.panel}
      {box.terminal}
      <div className="events" aria-live="polite">
        <h3>{t(text.latest)}</h3>
        {lines.length === 0 ? (
          <p>{t(text.nothing)}</p>
        ) : (
          <ol>
            {[...lines].reverse().map((line, i) => (
              <li key={`${shown.length}-${i}`} className={`ev-${line.tone}`}>
                <span className="ev-dot" />
                <span>{line.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  ) : null;

  return (
    <SceneFrame metrics={metrics} controls={controls} paused={paused} width={860} height={470} label={t(text.label)} footer={footer}>
      <ClusterView cluster={state} labels={labels(t)} last={last} />
    </SceneFrame>
  );
}
