import { groupStats } from "../../engine/cluster";
import type { ClusterState } from "../../engine/types";
import { l } from "@lets-explain/core/i18n";
import { Pill, TINTS } from "@lets-explain/core/iso/shapes";
import type { StageReader } from "../../iso/TopicStage";
import { describeTopicEvents } from "../shared/describeTopic";
import { topicChanges } from "../shared/topicChanges";
import { lanesOf } from "../shared/topicSim";
import { FlagSwatch, MiniCube, orderText, TopicLessonScene, type SceneView } from "../shared/TopicLessonScene";
import type { Change, SceneProps } from "@lets-explain/core/course/types";
import { FREE, scenarios } from "./scenarios";
import { ANALYTICS, base, BILLING, MEMBERS, memberDef as lessonMember, sandboxStart, SANDBOX_STEP, stepActions, TOPIC } from "./model";

/** The lesson's members by id; readers started in the terminal are console consumers, named by pid. */
function memberDef(id: string) {
  if (MEMBERS.some((m) => m.id === id)) return lessonMember(id);
  const pid = Number(id.replace("console-consumer-", ""));
  const billing = MEMBERS.filter((m) => m.group === BILLING);
  return { name: l(`okuyucu ${pid}`, `reader ${pid}`), tint: billing[Math.abs(pid - 4242) % billing.length]!.tint };
}

const SLUG = "consumer-groups";

const text = {
  label: l(
    "3 partition'lı orders topic'i: Fatura group'u solda, Analitik group'u sağda",
    "The 3-partition orders topic: the billing group on the left, the analytics group on the right",
  ),
  producer: l("Sipariş servisi", "Order service"),
  members: l("Fatura okuyucu", "Billing readers"),
  billingLag: l("Fatura lag", "Billing lag"),
  analyticsLag: l("Analitik lag", "Analytics lag"),
  again: l("Tekrar okunan", "Read again"),
  yours: l("(senin)", "(yours)"),
  legendParcel: l("kayıt = vagon (yanında offset)", "record = wagon (offset on its side)"),
  legendFlag: l("bayrak = sıradaki offset", "flag = next offset"),
  legendSeal: l("mühür = group'un commit ettiği offset", "seal = offset the group committed"),
  p1: l("Rebalance: Fatura 1 → P0+P1 · Fatura 2 → P2", "Rebalance: Billing 1 → P0+P1 · Billing 2 → P2"),
  p2: l("Fatura 2 çöktü · P2'nin 2 kaydı yeniden okundu", "Billing 2 crashed · 2 records on P2 read again"),
  p3: l("Analitik her şeyi baştan okudu, Fatura etkilenmedi", "Analytics read everything; billing was untouched"),
  p4: l("Commit sayesinde tekrar yok", "Thanks to the commit, no repeats"),
  p5: l("Rebalance: herkese bir partition", "Rebalance: one partition each"),
  p6: l("Yedekteki Fatura 4 devreye girdi", "Billing 4, the spare, stepped in"),
};

/** Members who ever read something stay on stage; those no longer in the group are drawn as crashed. */
function readersOf(view: SceneView): StageReader[] {
  const out: StageReader[] = [];
  for (const [gid, side] of [[BILLING, 0], [ANALYTICS, 1]] as const) {
    const group = view.state.groups[gid];
    if (!group) continue;
    const current = group.members.map((m) => m.id);
    // The lesson's readers stay on stage after a crash; a console consumer that left is simply gone.
    const seen = new Set([...current, ...group.deliveries.map((d) => d.member).filter((m) => MEMBERS.some((x) => x.id === m))]);
    for (const id of [...seen].sort()) {
      const def = memberDef(id);
      const up = current.includes(id);
      const readNow = view.last.some((e) => e.type === "delivered" && e.member === id);
      const committedNow = view.last.some((e) => e.type === "committed" && e.member === id);
      out.push({
        id,
        name: view.t(def.name),
        tint: def.tint,
        side,
        pulse: view.pulse,
        state: !up ? "crashed" : readNow ? "hop" : committedNow ? "happy" : "idle",
        lanes: up ? lanesOf(view.state, gid, id, view.topic) : [],
      });
    }
  }
  return out;
}

function committedText(state: ClusterState, gid: string) {
  const c = state.groups[gid]?.committed ?? {};
  return [0, 1, 2].map((i) => `P${i}=${c[`${TOPIC}-${i}`] ?? "—"}`).join(" · ");
}

const config = {
  slug: SLUG,
  topic: TOPIC,
  base,
  stepActions,
  sandboxStep: SANDBOX_STEP,
  sandboxStart,
  missions: [],
  scenarios,
  freeStart: FREE,
  label: text.label,
  producerName: text.producer,
  readers: readersOf,
  tintOf: (_g: string, member: string) => memberDef(member).tint,
  metrics: (view: SceneView, ctx: { start: ClusterState | null }) => {
    const t = view.t;
    const s = view.state;
    const dups = groupStats(s, BILLING).duplicates - (ctx.start ? groupStats(ctx.start, BILLING).duplicates : 0);
    return [
      { label: t(text.members), value: s.groups[BILLING]?.members.length ?? 0, dot: TINTS.coral.body },
      { label: t(text.billingLag), value: s.groups[BILLING] ? groupStats(s, BILLING).lag : "—" },
      ...(s.groups[ANALYTICS] ? [{ label: t(text.analyticsLag), value: groupStats(s, ANALYTICS).lag, dot: TINTS.mint.body }] : []),
      {
        label: `${t(text.again)}${view.sandbox ? ` ${t(text.yours)}` : ""}`,
        value: dups,
        tone: dups > 0 ? ("danger" as const) : ("plain" as const),
      },
    ];
  },
  legend: (view: SceneView) => [
    { swatch: <MiniCube fill="var(--mint)" />, label: view.t(text.legendParcel) },
    { swatch: <FlagSwatch fill="var(--coral)" />, label: view.t(text.legendFlag) },
    {
      swatch: (
        <g>
          <circle r={6.5} fill="var(--coral-soft)" stroke="var(--coral-deep)" strokeWidth={1.8} />
        </g>
      ),
      label: view.t(text.legendSeal),
    },
  ],
  describe: (events: Parameters<typeof describeTopicEvents>[0], view: SceneView) =>
    describeTopicEvents(events, view.lang, {
      member: (_g, m) => view.t(memberDef(m).name),
      value: (v) => orderText(v, view.lang),
    }),
  controls: () => null,
  overlay: (view: SceneView) => {
    if (view.sandbox) return null;
    const done = view.pulse >= (stepActions[view.step]?.length ?? 0);
    if (!done) return null;
    const t = view.t;
    if (view.step === 7) {
      return (
        <>
          <Pill x={430} y={34} text={`billing: ${committedText(view.state, BILLING)}`} tone="ink" />
          <Pill x={430} y={66} text={`analytics: ${committedText(view.state, ANALYTICS)}`} tone="ok" />
        </>
      );
    }
    const pills: Record<number, [string, "danger" | "sun" | "ok" | "ink"]> = {
      1: [t(text.p1), "sun"],
      2: [t(text.p2), "danger"],
      3: [t(text.p3), "ok"],
      4: [t(text.p4), "ok"],
      5: [t(text.p5), "sun"],
      6: [t(text.p6), "ok"],
    };
    const pill = pills[view.step];
    return pill ? <Pill x={430} y={40} text={pill[0]} tone={pill[1]} /> : null;
  },
};

export function ConsumerGroupsScene(props: SceneProps) {
  return <TopicLessonScene {...props} config={config} />;
}

const names = {
  member: (_g: string, m: string) => memberDef(m).name,
  group: (g: string) => (g === ANALYTICS ? l("Analitik", "Analytics") : l("Fatura", "Billing")),
};

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const start = base.startOf(step);
  const end = base.ends[step]!;
  const out = topicChanges(base.run.states[start]!, base.run.states[end]!, base.run.events.slice(start, end).flat(), TOPIC, names);
  if (step === 7) {
    const s = base.run.states[end]!;
    out.push(
      { kind: "change", text: l(`billing commit'leri: ${committedText(s, BILLING)}`, `billing commits: ${committedText(s, BILLING)}`) },
      { kind: "change", text: l(`analytics commit'leri: ${committedText(s, ANALYTICS)}`, `analytics commits: ${committedText(s, ANALYTICS)}`) },
    );
  }
  return out;
}
