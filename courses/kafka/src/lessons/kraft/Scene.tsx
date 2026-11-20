import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { CLUSTER_STAGE, ClusterStage, type StageBroker, type StagePartition } from "../../iso/ClusterStage";
import { NameTag } from "../../iso/PartitionStage";
import { Building, Pill, TINTS } from "@lets-explain/core/iso/shapes";
import { TypedFooter, useSceneState, useTypedKit } from "../cluster-kit/kit";
import { kCtx, kraftShell, replayK } from "./cli";
import type { EventLine } from "../shared/describe";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { model, run, SANDBOX_STEP, SLUG, stepActions, stranded, type KEvent, type KState, type MetaRecord } from "./model";
import { FREE, scenarios } from "./scenarios";

const text = {
  label: l(
    "Üstte üç controller ve metadata log'ları, altta veriyi taşıyan üç broker",
    "Three controllers with their metadata logs on top, three data brokers below",
  ),
  active: l("Aktif controller", "Active controller"),
  none: l("yok", "none"),
  up: l("Ayakta controller", "Controllers up"),
  majority: l("Çoğunluk", "Majority"),
  yes: l("var", "yes"),
  no: l("yok", "no"),
  meta: l("Metadata offset", "Metadata offset"),
  stranded: l("Sahipsiz partition", "Stranded partitions"),
  activeBadge: l("aktif", "active"),
  fenced: l("fenced", "fenced"),
  leads: l("lideri", "leader"),
  crashedLeader: l("lideri · çökük!", "leader · down!"),
  legendController: l("controller: metadata'yı yönetir", "controller: manages metadata"),
  legendBroker: l("broker: veriyi taşır", "broker: carries the data"),
  legendRecord: l("metadata kaydı", "metadata record"),
  legendHw: l("HW = çoğunlukta olan (commit edilmiş) kayıtlar", "HW = records on a majority (committed)"),
};

const roles = (t: (x: L) => string) => ({
  leader: t(l("aktif", "active")),
  follower: t(l("takipçi", "follower")),
  behind: t(l("geride", "behind")),
  offline: t(l("lider yok", "no leader")),
  hw: "HW",
  slow: t(l("yavaş", "slow")),
});

const kindOf = (r: MetaRecord) =>
  r.kind === "register" || r.kind === "unfence" ? "order" : r.kind === "fence" ? "cancel" : r.kind === "leader" ? "payment" : "neutral";

/**
 * `before` is the state ahead of the latest action: records a follower controller gained since
 * then were copied from the active controller's log, so they travel from there.
 */
function toStage(s: KState, t: (x: L) => string, before?: KState): { brokers: StageBroker[]; partitions: StagePartition[] } {
  const brokers: StageBroker[] = s.controllers.map((c) => ({
    id: c.id,
    name: `Controller ${c.id}`,
    alive: c.alive,
    roof: TINTS.sun,
    badge: s.active === c.id ? { text: t(text.activeBadge), tone: "sun" } : undefined,
  }));
  const partitions: StagePartition[] = [
    {
      id: "meta",
      label: "metadata",
      hw: s.active === null ? undefined : s.committed,
      replicas: s.controllers.map((c) => ({
        broker: c.id,
        end: c.log.length,
        role: s.active === null ? "offline" : s.active === c.id ? "leader" : c.alive ? "follower" : "behind",
        records: c.log.map((r, offset) => {
          const had = before?.controllers.find((x) => x.id === c.id)?.log.length ?? c.log.length;
          const copied = before !== undefined && offset >= had && s.active !== null && s.active !== c.id;
          return { offset, kind: kindOf(r), arrived: copied ? ("copy" as const) : undefined };
        }),
      })),
    },
  ];
  return { brokers, partitions };
}

function recordText(r: MetaRecord, lang: Lang) {
  const tr = lang === "tr";
  switch (r.kind) {
    case "register":
      return tr ? `broker ${r.broker} cluster'a kaydoldu` : `broker ${r.broker} registered`;
    case "fence":
      return tr ? `broker ${r.broker} fenced (heartbeat gelmiyor)` : `broker ${r.broker} fenced (no heartbeats)`;
    case "unfence":
      return tr ? `broker ${r.broker} yeniden kullanılabilir` : `broker ${r.broker} usable again`;
    case "leader":
      return r.to === null
        ? tr
          ? `P${r.partition} için uygun broker yok`
          : `no broker can lead P${r.partition}`
        : tr
          ? `P${r.partition} leader: broker ${r.from ?? "-"} → broker ${r.to}`
          : `P${r.partition} leader: broker ${r.from ?? "-"} → broker ${r.to}`;
    case "topic":
      return tr ? `topic \`${r.name}\` oluşturuldu` : `topic \`${r.name}\` created`;
  }
}

export function describeKraft(events: KEvent[], lang: Lang): EventLine[] {
  const tr = lang === "tr";
  const out: EventLine[] = [];
  for (const e of events) {
    switch (e.type) {
      case "controllerDown":
        out.push({ tone: "bad", text: tr ? `Controller ${e.id} çöktü${e.wasActive ? " (aktif olandı)" : ""}` : `Controller ${e.id} crashed${e.wasActive ? " (it was the active one)" : ""}` });
        break;
      case "controllerUp":
        out.push({ tone: "ok", text: tr ? `Controller ${e.id} yeniden açıldı` : `Controller ${e.id} is back up` });
        break;
      case "elected":
        out.push({ tone: "ok", text: tr ? `Oylama: controller ${e.id} yeni aktif controller (epoch ${e.epoch})` : `Vote: controller ${e.id} is the new active controller (epoch ${e.epoch})` });
        break;
      case "quorumLost":
        out.push({
          tone: "bad",
          text: tr
            ? `Çoğunluk yok: 3 controller'dan sadece ${e.alive} ayakta. Kimse metadata yazamaz`
            : `No majority: only ${e.alive} of 3 controllers up. Nobody can write metadata`,
        });
        break;
      case "appended":
        out.push({ tone: "produce", text: tr ? `Metadata #${e.offset}: ${recordText(e.record, lang)}` : `Metadata #${e.offset}: ${recordText(e.record, lang)}` });
        break;
      case "brokerDown":
        out.push({
          tone: "bad",
          text: e.noticed
            ? tr
              ? `Broker ${e.id} çöktü; aktif controller heartbeat'lerin kesildiğini fark etti`
              : `Broker ${e.id} crashed; the active controller noticed its heartbeats stopped`
            : tr
              ? `Broker ${e.id} çöktü ama bunu fark edecek aktif controller yok!`
              : `Broker ${e.id} crashed, but there is no active controller to notice!`,
        });
        break;
      case "brokerUp":
        out.push({
          tone: "ok",
          text: e.noticed
            ? tr
              ? `Broker ${e.id} açıldı ve controller'a kaydoldu`
              : `Broker ${e.id} is up and registered with the controller`
            : tr
              ? `Broker ${e.id} açıldı ama kaydolacağı aktif controller yok`
              : `Broker ${e.id} is up, but there is no active controller to register with`,
        });
        break;
      case "rejected":
        out.push({ tone: "bad", text: tr ? `Reddedildi: \`${e.name}\` oluşturulamadı, aktif controller yok` : `Refused: \`${e.name}\` was not created, no active controller` });
        break;
      case "error":
        out.push({ tone: "bad", text: e.message });
        break;
    }
  }
  return out;
}

const BROKER_X = [190, 430, 670];
const BROKER_Y = 392;

export function KraftScene({ step, paused, replayKey, controls: frameControls }: SceneProps) {
  const { t, lang } = useLang();
  const lesson = useSceneState({ model, run, stepActions, step, sandboxStep: SANDBOX_STEP, paused, replayKey });
  // The try-it step is typed: the terminal's state replaces the lesson's.
  const typed = useTypedKit({ slug: SLUG, active: step === SANDBOX_STEP, scenarios, freeStart: FREE, shell: kraftShell, replay: replayK, context: kCtx, stateOf: (b) => b.state });
  const view = typed ? { ...lesson, ...typed } : lesson;
  const s = view.state;
  const stage = toStage(s, t, view.before);
  const up = s.controllers.filter((c) => c.alive).length;
  const stuck = stranded(s);

  const metrics: Metric[] = [
    { label: t(text.active), value: s.active === null ? t(text.none) : `C${s.active}`, tone: s.active === null ? "danger" : "plain" },
    { label: t(text.up), value: `${up}/3` },
    { label: t(text.majority), value: t(up >= 2 ? text.yes : text.no), tone: up >= 2 ? "ok" : "danger" },
    { label: t(text.meta), value: s.committed },
    { label: t(text.stranded), value: stuck.length, tone: stuck.length > 0 ? "danger" : "plain" },
  ];

  const legend: LegendItem[] = [
    { swatch: <MiniHouse roof="var(--sun)" />, label: t(text.legendController) },
    { swatch: <MiniHouse roof="var(--sky)" />, label: t(text.legendBroker) },
    { swatch: <MiniCube fill="var(--sky)" />, label: t(text.legendRecord) },
    { swatch: <rect x={-10} y={-9} width={20} height={12} rx={6} className="hw-tag" />, label: t(text.legendHw) },
  ];

  const lines = describeKraft(view.shownEvents, lang);
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
        labels={roles(t)}
        top={120}
        window={6}
        s={26}
        overlay={(layout) => (
          <g>
            {s.brokers.map((b, i) => {
              const x = BROKER_X[i]!;
              const active = s.active === null ? null : layout.broker(s.active);
              const leads = s.partitions.filter((p) => p.leader === b.id);
              return (
                <g key={b.id}>
                  {active && b.alive && (
                    <line x1={x} y1={BROKER_Y - 48} x2={active[0]} y2={active[1] + 26} className="quorum-line is-hot" />
                  )}
                  <g transform={`translate(${x} ${BROKER_Y})`}>
                    <Building s={22} roof={TINTS.sky} status={b.alive ? "ok" : "down"} w={1.3} h={0.9} />
                    <NameTag y={-54} text={`Broker ${b.id}`} tint={b.alive ? TINTS.sky : TINTS.grey} />
                    {b.fenced && <Pill x={62} y={-30} text={t(text.fenced)} tone="danger" size={11} animate={false} />}
                    <text x={0} y={36} textAnchor="middle" className="label-soft">
                      metadata @ {b.applied}
                    </text>
                  </g>
                  {leads.map((p, k) => (
                    <Pill
                      key={p.index}
                      x={x + 92}
                      y={BROKER_Y - 8 + k * 24}
                      text={`P${p.index} ${t(b.alive ? text.leads : text.crashedLeader)}`}
                      tone={b.alive ? "sun" : "danger"}
                      size={11}
                      animate={false}
                    />
                  ))}
                </g>
              );
            })}
          </g>
        )}
      />
    </SceneFrame>
  );
}

function MiniHouse({ roof }: { roof: string }) {
  return (
    <g stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="-8,-2 0,2 0,8 -8,4" fill="#f3ebdc" />
      <polygon points="0,2 8,-2 8,4 0,8" fill="#e2d6c1" />
      <polygon points="-9,-3 0,-8 9,-3 0,2" style={{ fill: roof }} />
    </g>
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
  const before = run.states[run.startOf(step)]!;
  const after = run.states[run.ends[step]!]!;
  const both = (tr: string, en: string) => ({ tr, en });
  const out: Change[] = [];
  if (step === 0) out.push({ kind: "add", text: both("Metadata log'unda 4 kayıt: 3 broker ve `orders` topic'i", "4 records in the metadata log: 3 brokers and the `orders` topic") });
  for (const c of after.controllers) {
    const was = before.controllers.find((x) => x.id === c.id)!;
    if (was.alive && !c.alive) out.push({ kind: "bad", text: both(`Controller ${c.id} çöktü`, `Controller ${c.id} crashed`) });
    if (!was.alive && c.alive) out.push({ kind: "good", text: both(`Controller ${c.id} geri geldi`, `Controller ${c.id} is back`) });
  }
  if (before.active !== after.active) {
    out.push(
      after.active === null
        ? { kind: "bad", text: both("Aktif controller yok: metadata dondu", "No active controller: metadata is frozen") }
        : { kind: "change", text: both(`Aktif controller: ${before.active === null ? "yok" : `C${before.active}`} → C${after.active}`, `Active controller: ${before.active === null ? "none" : `C${before.active}`} → C${after.active}`) },
    );
  }
  const added = after.committed - before.committed;
  if (added > 0) out.push({ kind: "add", text: both(`+${added} metadata kaydı (commit edildi)`, `+${added} metadata record${added > 1 ? "s" : ""} (committed)`) });
  for (const b of after.brokers) {
    const was = before.brokers.find((x) => x.id === b.id)!;
    if (was.alive && !b.alive) out.push({ kind: "bad", text: both(`Broker ${b.id} çöktü`, `Broker ${b.id} crashed`) });
    if (!was.alive && b.alive) out.push({ kind: "good", text: both(`Broker ${b.id} geri geldi`, `Broker ${b.id} is back`) });
  }
  for (const p of after.partitions) {
    const was = before.partitions[p.index]!;
    if (was.leader !== p.leader) out.push({ kind: "change", text: both(`P${p.index} leader: broker ${was.leader ?? "-"} → broker ${p.leader ?? "-"}`, `P${p.index} leader: broker ${was.leader ?? "-"} → broker ${p.leader ?? "-"}`) });
  }
  const stuck = stranded(after).length - stranded(before).length;
  if (stuck > 0) out.push({ kind: "bad", text: both(`${stuck} partition'ın leader'ı çökük broker'da kaldı`, `${stuck} partition${stuck > 1 ? "s are" : " is"} left with a crashed leader`) });
  return out;
}
