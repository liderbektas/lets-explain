import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import type { RState } from "../../engine/replication";
import { l, useLang } from "@lets-explain/core/i18n";
import { CLUSTER_STAGE, ClusterStage } from "../../iso/ClusterStage";
import { Pill, TINTS } from "@lets-explain/core/iso/shapes";
import { describeReplicated } from "../cluster-kit/describe";
import { clusterLabels, partitionTint, replicatedChanges, Sandbox, toStage, useSceneState } from "../cluster-kit/kit";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { controls, model, run, SANDBOX_STEP, SLUG, stepActions, writtenIn } from "./model";

const text = {
  label: l("Broker'lar bina, her partition bir bant, kayıtlar koli", "Brokers as buildings, each partition a belt, records as parcels"),
  producer: l("Sipariş servisi", "Order service"),
  brokersUp: l("Ayakta broker", "Brokers up"),
  online: l("Çalışan partition", "Partitions online"),
  records: l("Toplam kayıt", "Records"),
  rejected: l("Reddedilen", "Rejected"),
  yours: l("(senin)", "(yours)"),
  metaAsk: l("Kim neyin lideri?", "Who leads what?"),
  metaReply: l("P0 → B1 · P1 → B2 · P2 → B3", "P0 → B1 · P1 → B2 · P2 → B3"),
  bootstrap: l("bootstrap.servers", "bootstrap.servers"),
  legendBroker: l("broker = bir Kafka sunucusu", "broker = one Kafka server"),
  legendBelt: l("bant = broker'daki partition", "belt = a partition on that broker"),
  legendLeader: l("leader = o partition'ın evi", "leader = where that partition lives"),
  legendDown: l("çökmüş broker", "crashed broker"),
};

const brokerName = (lang: string) => (id: number) => (lang === "tr" ? `Broker ${id}` : `Broker ${id}`);

export function BrokersScene({ step, paused, replayKey, controls: frameControls }: SceneProps) {
  const { t, lang } = useLang();
  const view = useSceneState({ model, run, stepActions, step, sandboxStep: SANDBOX_STEP, paused, replayKey });
  const s = view.state;
  const stage = toStage(s, { brokerName: brokerName(lang), events: view.lastEvents });

  const produced = view.lastEvents.find((e) => e.type === "produced" || e.type === "rejected");
  const target = produced && (produced.type === "produced" || produced.type === "rejected") ? `p${produced.partition}` : null;

  const sandboxSince = view.ctx?.start;
  const rejectedNow = s.sends.filter((x) => x.status === "failed").length - (sandboxSince ? sandboxSince.sends.filter((x) => x.status === "failed").length : 0);
  const metrics: Metric[] = [
    { label: t(text.brokersUp), value: `${s.brokers.filter((b) => b.alive).length}/${s.brokers.length}` },
    {
      label: t(text.online),
      value: `${s.partitions.filter((p) => p.leader !== null).length}/${s.partitions.length}`,
      tone: s.partitions.some((p) => p.leader === null) ? "danger" : "plain",
    },
    { label: t(text.records), value: s.partitions.reduce((n, p) => n + (p.leader === null ? 0 : p.logs[p.leader]!.length), 0) },
    { label: `${t(text.rejected)}${view.sandbox ? ` ${t(text.yours)}` : ""}`, value: rejectedNow, tone: rejectedNow > 0 ? "danger" : "plain" },
  ];

  const legend: LegendItem[] = [
    { swatch: <MiniHouse />, label: t(text.legendBroker) },
    ...[0, 1, 2].map((i) => ({ swatch: <MiniCube fill={partitionTint(i).body} />, label: `P${i}` })),
    { swatch: <rect x={-10} y={-8} width={20} height={11} rx={5.5} className="pill pill-sun" />, label: t(text.legendLeader) },
  ];

  // With one copy per partition, acks and the high watermark add nothing, so their lines are left out.
  const lines = describeReplicated(
    view.shownEvents.filter((e) => e.type !== "acked" && e.type !== "hwAdvanced"),
    lang,
  );

  const footer = view.sandbox && view.ctx ? (
    <Sandbox
      slug={SLUG}
      missions={missions}
      ctx={view.ctx}
      rows={controls(s, writtenIn(view.extra))}
      extra={view.extra}
      setExtra={view.setExtra}
      lines={lines}
    />
  ) : null;

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
        producer={{ name: t(text.producer), state: produced ? "hop" : "idle", pulse: view.pulse, target }}
        overlay={(layout) =>
          step === 3 ? (
            <g>
              <line
                x1={layout.producer[0] + 10}
                y1={layout.producer[1] - 60}
                x2={layout.broker(2)[0]}
                y2={layout.broker(2)[1] + 30}
                className="dashed-arrow"
                markerEnd="url(#arrow)"
              />
              <Pill x={(layout.producer[0] + layout.broker(2)[0]) / 2 + 70} y={(layout.producer[1] + layout.broker(2)[1]) / 2 + 6} text={t(text.metaAsk)} tone="sun" />
              <Pill x={layout.producer[0] + 150} y={layout.producer[1] - 20} text={t(text.metaReply)} tone="ok" />
              <Pill x={layout.producer[0] - 120} y={layout.producer[1] - 20} text={t(text.bootstrap)} tone="ink" size={11} />
            </g>
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

function MiniHouse() {
  return (
    <g stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="-8,-2 0,2 0,8 -8,4" fill="#f3ebdc" />
      <polygon points="0,2 8,-2 8,4 0,8" fill="#e2d6c1" />
      <polygon points="-9,-3 0,-8 9,-3 0,2" style={{ fill: TINTS.sky.body }} />
    </g>
  );
}

/* ------------------------------------------------- "what changed" per step */

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const before: RState = run.states[run.startOf(step)]!;
  const after: RState = run.states[run.ends[step]!]!;
  const out = replicatedChanges(before, after);
  if (step === 0) out.unshift({ kind: "add", text: { tr: "Tek broker: `orders` topic'inin 3 partition'ı da onda", en: "One broker: all 3 partitions of `orders` live on it" } });
  if (step === 3) out.push({ kind: "change", text: { tr: "Producer metadata aldı: her partition'ın lideri belli", en: "The producer fetched metadata: every partition's leader is known" } });
  return out;
}
