import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import type { RState, Send } from "../../engine/replication";
import { l, useLang, type L } from "@lets-explain/core/i18n";
import { CLUSTER_STAGE, ClusterStage } from "../../iso/ClusterStage";
import { Pill, type PillTone } from "@lets-explain/core/iso/shapes";
import { describeReplicated } from "../cluster-kit/describe";
import { clusterLabels, replicatedChanges, toStage, TypedFooter, useSceneState, useTypedKit } from "../cluster-kit/kit";
import { rCtx, replayR, replicationShell } from "../../engine/replicationCli";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { model, run, SANDBOX_STEP, SLUG, stepActions } from "./model";
import { FREE, scenarios } from "./scenarios";

const text = {
  label: l("Producer, üç broker'daki P0 kopyalarına yazıyor ve her yazma için bir cevap bekliyor", "The producer writes to P0's copies on three brokers and waits for an answer to each write"),
  producer: l("Sipariş servisi", "Order service"),
  isr: l("ISR", "ISR"),
  acked: l("Onaylanan", "Acked"),
  pending: l("Bekleyen", "Waiting"),
  lost: l("Kayıp", "Lost"),
  failed: l("Hata", "Errors"),
  legendHw: l("HW = consumer'ların okuyabildiği sınır", "HW = how far consumers can read"),
  legendReceipt: l("producer'ın aldığı son cevap", "the producer's latest answer"),
  legendDim: l("soluk = henüz bütün ISR'de değil", "faded = not on the whole ISR yet"),
};

const receipt: Record<string, { text: L; tone: PillTone }> = {
  acked: { text: l("✓ onay geldi", "✓ acked"), tone: "ok" },
  sent: { text: l("gönderildi, cevap beklenmiyor", "sent, no answer expected"), tone: "plain" },
  pending: { text: l("… onay bekleniyor", "… waiting for ack"), tone: "warn" },
  failed: { text: l("✗ hata aldı", "✗ got an error"), tone: "danger" },
  lost: { text: l("✓ sandı ama kayboldu", "✓ thought so, but lost"), tone: "danger" },
};

function receiptFor(send: Send | undefined) {
  if (!send) return null;
  if (send.status === "failed" && send.reason) {
    const reason = send.reason === "notEnoughReplicas" ? "NotEnoughReplicas" : send.reason === "notEnoughReplicasAfterAppend" ? "NotEnoughReplicasAfterAppend" : send.reason === "offline" ? "offline" : "leader changed";
    return { text: l(`✗ ${reason}`, `✗ ${reason}`), tone: "danger" as const };
  }
  // With acks=0 a lost record looks exactly like a sent one to the producer.
  if (send.status === "lost" && send.acks === 0) return receipt.sent!;
  return receipt[send.status] ?? null;
}

export function AcksScene({ step, paused, replayKey, controls: frameControls }: SceneProps) {
  const { t, lang } = useLang();
  const lesson = useSceneState({ model, run, stepActions, step, sandboxStep: SANDBOX_STEP, paused, replayKey });
  // The try-it step is typed: the terminal's state replaces the lesson's.
  const typed = useTypedKit({ slug: SLUG, active: step === SANDBOX_STEP, scenarios, freeStart: FREE, shell: replicationShell, replay: replayR, context: rCtx, stateOf: (b) => b.state });
  const view = typed ? { ...lesson, ...typed, sandbox: true } : { ...lesson, start: null as RState | null };
  const s = view.state;
  const p = s.partitions[0]!;
  const stage = toStage(s, { brokerName: (id) => `Broker ${id}`, showHw: true, dimUncommitted: true, events: view.lastEvents });

  // Lesson steps count everything so far; the try-it step counts only the reader's own writes.
  const since = view.start;
  const mine = (st: RState) => (since ? st.sends.filter((x) => !since.sends.some((y) => y.id === x.id)) : st.sends);
  const sends = mine(s);
  // "Acked" counts every write the producer was told went through, even if it was lost later.
  const acked = sends.filter((x) => x.status === "acked" || x.status === "sent" || (x.status === "lost" && x.offset !== null)).length;
  const lost = sends.filter((x) => x.status === "lost").length;
  const failed = sends.filter((x) => x.status === "failed").length;
  const pending = sends.filter((x) => x.status === "pending").length;

  const metrics: Metric[] = [
    { label: "acks", value: String(s.config.acks) },
    { label: "min.insync", value: s.config.minIsr },
    { label: t(text.isr), value: `[${p.isr.join(", ")}]`, tone: p.isr.length < s.config.minIsr ? "danger" : p.isr.length < p.replicas.length ? "warn" : "plain" },
    { label: t(text.acked), value: acked, tone: acked > 0 ? "ok" : "plain" },
    { label: t(text.pending), value: pending, tone: pending > 0 ? "warn" : "plain" },
    { label: t(text.failed), value: failed, tone: failed > 0 ? "danger" : "plain" },
    { label: t(text.lost), value: lost, tone: lost > 0 ? "danger" : "plain" },
  ];

  const legend: LegendItem[] = [
    { swatch: <rect x={-10} y={-9} width={20} height={12} rx={6} className="hw-tag" />, label: t(text.legendHw) },
    { swatch: <rect x={-10} y={-8} width={20} height={11} rx={5.5} className="pill pill-ok" />, label: t(text.legendReceipt) },
  ];

  const writing = view.lastEvents.some((e) => e.type === "produced" || e.type === "rejected");
  const latest = sends[sends.length - 1];
  const card = receiptFor(latest);

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
        producer={{ name: t(text.producer), state: writing ? "hop" : "idle", pulse: view.pulse, target: "p0" }}
        overlay={(layout) => (
          <g>
            <Pill x={layout.producer[0] - 150} y={layout.producer[1] - 34} text={`acks=${s.config.acks}`} tone="ink" size={12} animate={false} />
            {card && <Pill key={`${latest?.id}-${latest?.status}`} x={layout.producer[0] + 170} y={layout.producer[1] - 34} text={t(card.text)} tone={card.tone} size={12} />}
          </g>
        )}
      />
    </SceneFrame>
  );
}

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const before: RState = run.states[run.startOf(step)]!;
  const after: RState = run.states[run.ends[step]!]!;
  const out = replicatedChanges(before, after);
  const sent = after.sends.filter((x) => x.status === "sent").length - before.sends.filter((x) => x.status === "sent").length;
  if (sent > 0) out.push({ kind: "change", text: { tr: `${sent} kayıt gönderildi; producer cevap beklemedi`, en: `${sent} records sent; the producer did not wait for an answer` } });
  return out;
}
