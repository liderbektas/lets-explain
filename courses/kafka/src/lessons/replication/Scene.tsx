import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { sendStats, type RState } from "../../engine/replication";
import { l, useLang } from "@lets-explain/core/i18n";
import { CLUSTER_STAGE, ClusterStage } from "../../iso/ClusterStage";
import { Pill } from "@lets-explain/core/iso/shapes";
import { describeReplicated } from "../cluster-kit/describe";
import { clusterLabels, replicatedChanges, toStage, TypedFooter, useSceneState, useTypedKit } from "../cluster-kit/kit";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { rCtx, replayR, replicationShell } from "../../engine/replicationCli";
import { model, run, SANDBOX_STEP, SLUG, stepActions } from "./model";
import { FREE, scenarios } from "./scenarios";

const text = {
  label: l(
    "Üç broker, her birinde P0'ın bir kopyası. Leader'ın bandına yazılır, follower'lar kopyalar",
    "Three brokers, each with a copy of P0. Writes go to the leader's belt and followers copy it",
  ),
  producer: l("Sipariş servisi", "Order service"),
  leader: l("Leader", "Leader"),
  none: l("yok", "none"),
  isr: l("ISR", "ISR"),
  hw: l("High watermark", "High watermark"),
  pending: l("Onay bekleyen", "Waiting for ack"),
  lost: l("Kayıp", "Lost"),
  epoch: l("leader epoch", "leader epoch"),
  legendParcel: l("kayıt (üstünde offset)", "record (offset on top)"),
  legendDim: l("soluk = HW üstünde, henüz okunamaz", "faded = above the HW, not readable yet"),
  legendHw: l("HW = consumer'ların okuyabildiği sınır", "HW = how far consumers can read"),
  legendBehind: l("ISR dışı = geride kalmış kopya", "out of ISR = a copy that fell behind"),
};

export function ReplicationScene({ step, paused, replayKey, controls: frameControls }: SceneProps) {
  const { t, lang } = useLang();
  const lesson = useSceneState({ model, run, stepActions, step, sandboxStep: SANDBOX_STEP, paused, replayKey });
  // The try-it step is typed: the terminal's state replaces the lesson's.
  const typed = useTypedKit({ slug: SLUG, active: step === SANDBOX_STEP, scenarios, freeStart: FREE, shell: replicationShell, replay: replayR, context: rCtx, stateOf: (b) => b.state });
  const view = typed ? { ...lesson, ...typed, sandbox: true } : { ...lesson, start: null as RState | null };
  const s = view.state;
  const p = s.partitions[0]!;
  const replicated = p.replicas.length > 1;
  const stage = toStage(s, { brokerName: (id) => `Broker ${id}`, showHw: replicated, dimUncommitted: replicated, events: view.lastEvents });

  const writing = view.lastEvents.some((e) => e.type === "produced" || e.type === "rejected");
  const stats = sendStats(s);
  const before = view.start ? sendStats(view.start) : { lost: 0 };

  const metrics: Metric[] = [
    { label: t(text.leader), value: p.leader === null ? t(text.none) : `B${p.leader}`, tone: p.leader === null ? "danger" : "plain" },
    { label: t(text.isr), value: `[${p.isr.join(", ")}]`, tone: replicated && p.isr.length < p.replicas.length ? "warn" : "plain" },
    ...(replicated ? [{ label: "HW", value: p.hw }] : []),
    { label: t(text.pending), value: stats.pending, tone: stats.pending > 0 ? ("warn" as const) : ("plain" as const) },
    { label: t(text.lost), value: stats.lost - before.lost, tone: stats.lost - before.lost > 0 ? ("danger" as const) : ("plain" as const) },
  ];

  const legend: LegendItem[] = [
    { swatch: <MiniCube fill="var(--mint)" />, label: t(text.legendParcel) },
    { swatch: <g opacity={0.35}><MiniCube fill="var(--mint)" /></g>, label: t(text.legendDim) },
    { swatch: <rect x={-10} y={-9} width={20} height={12} rx={6} className="hw-tag" />, label: t(text.legendHw) },
    { swatch: <rect x={-10} y={-8} width={20} height={11} rx={5.5} className="pill pill-danger" />, label: t(text.legendBehind) },
  ];

  const lines = describeReplicated(view.shownEvents, lang);
  const footer = typed ? <TypedFooter view={typed} lines={lines} /> : null;

  return (
    <SceneFrame
      metrics={metrics}
      controls={frameControls}
      legend={legend}
      paused={paused}
      width={CLUSTER_STAGE.width}
      height={CLUSTER_STAGE.height}
      label={t(text.label)}
      footer={footer}
    >
      <ClusterStage
        brokers={stage.brokers}
        partitions={stage.partitions}
        labels={clusterLabels(t)}
        window={6}
        producer={{ name: t(text.producer), state: writing ? "hop" : "idle", pulse: view.pulse, target: "p0" }}
        overlay={() =>
          replicated && p.epoch > 0 ? (
            <Pill x={CLUSTER_STAGE.width - 92} y={CLUSTER_STAGE.height - 30} text={`${t(text.epoch)}: ${p.epoch}`} tone="plain" size={11} animate={false} />
          ) : null
        }
      />
    </SceneFrame>
  );
}

function MiniCube({ fill }: { fill: string }) {
  return (
    <g stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="-7,-4 0,0 0,7 -7,3" style={{ fill }} />
      <polygon points="0,0 7,-4 7,3 0,7" style={{ fill }} opacity="0.75" />
      <polygon points="-7,-4 0,-8 7,-4 0,0" style={{ fill }} />
    </g>
  );
}

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const before: RState = run.states[run.startOf(step)]!;
  const after: RState = run.states[run.ends[step]!]!;
  const out = replicatedChanges(before, after);
  if (step === 0) out.unshift({ kind: "bad", text: { tr: "P0'ın tek kopyası var: broker 1'de", en: "P0 has a single copy, on broker 1" } });
  if (step === 1) out.push({ kind: "good", text: { tr: "replication.factor: 1 → 3", en: "replication.factor: 1 → 3" } });
  if (step === 3) out.push({ kind: "good", text: { tr: "ISR = [1, 2, 3]: üç kopya da senkron", en: "ISR = [1, 2, 3]: all three copies are in sync" } });
  return out;
}
