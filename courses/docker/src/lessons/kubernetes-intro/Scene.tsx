import { useEffect, useMemo, useState } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { SceneFrame, type Metric } from "@lets-explain/core/components/SceneFrame";
import { starsFor, type Change, type SceneProps } from "@lets-explain/core/course/types";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import { ClusterView, type ClusterLabels } from "./ClusterView";
import { clusterChanges, describeKube } from "./describe";
import { missions } from "./missions";
import { createCluster, simulate, type Cluster, type KubeAction, type KubeEvent } from "./model";

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

/** The try-it step: a Deployment of 2 pods (v1) behind a Service, all nodes up. */
export const sandboxStart: Cluster = simulate([{ type: "apply", replicas: 2, version: "v1" }, { type: "expose" }]).states[2]!;

interface Button {
  label: string;
  action: KubeAction;
  tone?: "plain" | "ok" | "danger" | "producer" | "go";
  disabled?: boolean;
}

export function rows(c: Cluster, lang: Lang): { label: string; buttons: Button[] }[] {
  const tr = lang === "tr";
  const desired = c.desired ?? 0;
  const node = (name: string): Button => {
    const up = c.nodes.find((n) => n.name === name)!.up;
    return up
      ? { label: tr ? `${name} çöksün` : `${name} goes down`, action: { type: "nodeDown", node: name }, tone: "danger" }
      : { label: tr ? `${name} dönsün` : `${name} comes back`, action: { type: "nodeUp", node: name }, tone: "ok" };
  };
  return [
    {
      label: "Deployment",
      buttons: [
        { label: `scale --replicas=${desired + 1}`, action: { type: "scale", to: desired + 1 }, tone: "producer", disabled: desired >= 6 },
        { label: `scale --replicas=${desired - 1}`, action: { type: "scale", to: desired - 1 }, disabled: desired <= 1 },
        { label: "set image shop:v2", action: { type: "setImage", version: "v2" }, tone: "ok", disabled: c.version === "v2" },
      ],
    },
    {
      label: tr ? "Arıza" : "Trouble",
      buttons: [{ label: tr ? "delete pod" : "delete pod", action: { type: "killPod" }, tone: "danger", disabled: c.pods.length === 0 }, node("node-1"), node("node-2")],
    },
    { label: tr ? "Dene" : "Try", buttons: [{ label: "curl web", action: { type: "curl" }, tone: "go" }] },
  ];
}

/** Enabled moves in a state: exactly the buttons a reader could press. */
export const moves = (c: Cluster) => rows(c, "en").flatMap((r) => r.buttons.filter((b) => !b.disabled).map((b) => b.action));

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
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
};

export function KubernetesScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX;
  const cursor = usePlayback(sandbox ? 0 : (steps[step]?.length ?? 0), paused, `${step}-${replayKey}`);
  const [history, setHistory] = useState<KubeAction[]>([]);
  const sand = useMemo(() => (sandbox ? simulate(history, sandboxStart) : null), [sandbox, history]);
  const { game, setMissionStars } = useGame();
  const best = game.missions[SLUG] ?? {};
  const [missionIndex, setMissionIndex] = useState<number | null>(() => {
    const i = missions.findIndex((m) => !best[m.id]);
    return i < 0 ? 0 : i;
  });

  let state: Cluster;
  let last: KubeEvent[];
  let shown: KubeEvent[];
  if (sand) {
    state = sand.states[sand.states.length - 1]!;
    last = sand.events[sand.events.length - 1] ?? [];
    shown = sand.events.flat();
  } else {
    const s0 = stepStart(Math.min(step, SANDBOX));
    state = run.states[s0 + cursor]!;
    last = cursor > 0 ? run.events[s0 + cursor - 1]! : [];
    shown = [];
  }

  const mission = sandbox && missionIndex !== null ? missions[missionIndex] : undefined;
  const won = Boolean(mission && sand && mission.check({ start: sandboxStart, state, actions: history, events: sand.events }));
  useEffect(() => {
    if (won && mission) setMissionStars(SLUG, mission.id, starsFor(history.length, mission.par));
  }, [won, mission, history.length, setMissionStars]);
  const act = (a: KubeAction) => {
    if (!won) setHistory((xs) => [...xs, a]);
  };

  const metrics: Metric[] = [
    { label: t(l("İstenen", "Desired")), value: state.desired ?? "—" },
    { label: t(l("Çalışan pod", "Running pods")), value: state.pods.length, tone: state.desired !== null && state.pods.length < state.desired ? "danger" : "ok" },
    { label: t(l("Ayaktaki node", "Nodes up")), value: `${state.nodes.filter((n) => n.up).length}/3`, tone: state.nodes.every((n) => n.up) ? "plain" : "warn" },
    { label: t(l("Sürüm", "Version")), value: state.version },
  ];

  const lines = shown.map((e) => describeKube(e, lang));
  const footer = sandbox ? (
    <div className="sandbox">
      <MissionPanel
        missions={missions}
        active={missionIndex}
        onSelect={(i) => {
          setMissionIndex(i);
          setHistory([]);
        }}
        moves={history.length}
        won={won}
        best={best}
      />
      <div className="sandbox-controls" title={won ? t(ui.locked) : undefined}>
        {rows(state, lang).map((row) => (
          <div className="control-row" key={row.label}>
            <span className="control-name">{row.label}</span>
            {row.buttons.map((b) => (
              <button key={b.label} className={`chip-btn ${b.tone && b.tone !== "plain" ? `is-${b.tone}` : ""}`} disabled={won || b.disabled} onClick={() => act(b.action)}>
                {b.label}
              </button>
            ))}
          </div>
        ))}
        <div className="control-row">
          <button className="chip-btn" disabled={history.length === 0} onClick={() => setHistory((xs) => xs.slice(0, -1))}>
            <Icon name="undo" size={15} /> {t(text.undo)}
          </button>
          <button className="chip-btn" disabled={history.length === 0} onClick={() => setHistory([])}>
            <Icon name="reset" size={15} /> {t(text.reset)}
          </button>
        </div>
      </div>
      <div className="events" aria-live="polite">
        <h3>{t(text.latest)}</h3>
        {lines.length === 0 ? (
          <p>{t(text.nothing)}</p>
        ) : (
          <ol>
            {[...lines].reverse().map((line, i) => (
              <li key={`${history.length}-${i}`} className={`ev-${line.tone}`}>
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
