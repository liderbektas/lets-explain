import { useEffect, useMemo, useState } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { Flag, Parcel, TINTS, type PillTone } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import type { EventLine } from "../shared/describe";
import { starsFor, type Change, type SceneProps } from "@lets-explain/core/course/types";
import { BeltsStage, STAGE, type BeltPartition, type BeltReader } from "../ordering/BeltsStage";
import "../ordering/scene.css";
import { missions } from "./missions";
import {
  assignment,
  CLI_STEP,
  CONSUMER_POOL,
  GROUP,
  HOT_KEY,
  HOT_PARTITION,
  inflow,
  KEEP,
  lagOf,
  MAX_CONSUMERS,
  SANDBOX_STEP,
  sandboxStart,
  simulate,
  speedOf,
  steps,
  stepActions,
  TOPIC,
  totalLag,
  type LAction,
  type LEvent,
  type LState,
} from "./model";
import "./scene.css";

const SLUG = "consumer-lag";
const WINDOW = 8;

const text = {
  label: l(
    "clicks topic'inin partition'ları bant olarak; analytics group'unun consumer'ları bantların başında, bayrakları commit ettikleri offset'te",
    "The clicks topic's partitions as belts; the analytics group's consumers at the near end, flags at their committed offsets",
  ),
  producer: l("Tıklama servisi", "Click service"),
  next: l("sıradaki", "next"),
  lag: l("Toplam lag", "Total lag"),
  logEnd: l("Log-end offset", "Log-end offset"),
  committed: l("Committed offset", "Committed offset"),
  incoming: l("Gelen", "Incoming"),
  capacity: l("İşleme gücü", "Capacity"),
  perSec: l("/sn", "/s"),
  consumers: l("Consumer", "Consumers"),
  idle: l("boşta", "idle"),
  missed: l("Kaçırılan", "Missed"),
  yours: l("(senin)", "(yours)"),
  legendUnread: l("okunmamış kayıt", "unread record"),
  legendRead: l("işlenmiş kayıt", "handled record"),
  legendFlag: l("bayrak = commit edilen offset", "flag = committed offset"),
  legendBadge: l("rozet = o partition'ın lag'i", "badge = that partition's lag"),
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
  time: l("Zaman", "Time"),
  tick: l("1 saniye geçsin", "Let 1 second pass"),
  group: l("Group", "Group"),
  addConsumer: l("Consumer ekle", "Add consumer"),
  removeConsumer: l("Consumer çıkar", "Remove consumer"),
  code: l("Ayarlar", "Settings"),
  hotOn: l("Sıcak key'i aç", "Turn hot key on"),
  hotOff: l("Sıcak key'i kapat", "Turn hot key off"),
  fastOn: l("Kodu hızlandır", "Speed up code"),
  fastOff: l("Normal hıza dön", "Back to normal speed"),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
  cliTitle: l("Terminalde lag'e bakmak", "Checking lag in a terminal"),
};

const nameOf = (id: string, lang: Lang) => (CONSUMER_POOL.find((c) => c.id === id)?.name ?? l(id, id))[lang];
const tintOf = (id: string) => CONSUMER_POOL.find((c) => c.id === id)?.tint ?? TINTS.grey;
const plist = (ps: number[]) => (ps.length ? ps.map((p) => `p${p}`).join(", ") : "—");

export function describe(events: LEvent[], lang: Lang): EventLine[] {
  const tr = lang === "tr";
  const out: EventLine[] = [];
  const who = (a: Record<string, number[]>) =>
    Object.entries(a)
      .map(([m, ps]) => `${nameOf(m, lang)}: ${plist(ps)}`)
      .join(" · ");
  for (const e of events) {
    switch (e.type) {
      case "second": {
        const total = e.written.reduce((a, b) => a + b, 0);
        const parts = e.written.flatMap((n, i) => (n > 0 ? [`p${i} +${n}`] : [])).join(", ");
        out.push({ tone: "produce", text: tr ? `1 saniye geçti: ${total} kayıt yazıldı (${parts})` : `1 second passed: ${total} records written (${parts})` });
        const handled = Object.entries(e.handled).filter(([, ns]) => ns.some((n) => n > 0));
        for (const [m, ns] of handled) {
          const sum = ns.reduce((a, b) => a + b, 0);
          const where = ns.flatMap((n, i) => (n > 0 ? [`p${i} ${n}`] : [])).join(", ");
          out.push({ tone: "read", text: tr ? `${nameOf(m, lang)} ${sum} kayıt işledi ve commit etti (${where})` : `${nameOf(m, lang)} handled and committed ${sum} (${where})` });
        }
        if (handled.length === 0) out.push({ tone: "plain", text: tr ? "Kimse kayıt işlemedi" : "Nobody handled a record" });
        const deleted = e.deleted.reduce((a, b) => a + b, 0);
        if (deleted > 0) {
          out.push({
            tone: e.missed > 0 ? "bad" : "ok",
            text: tr
              ? `Retention ${deleted} eski kayıt sildi${e.missed > 0 ? `: ${e.missed} tanesi hiç okunmamıştı!` : ""}`
              : `Retention deleted ${deleted} old record${deleted > 1 ? "s" : ""}${e.missed > 0 ? `: ${e.missed} never read!` : ""}`,
          });
        }
        break;
      }
      case "joined": {
        const idle = (e.assignment[e.member] ?? []).length === 0;
        out.push({
          tone: idle ? "bad" : "ok",
          text: tr
            ? `${nameOf(e.member, lang)} katıldı. Rebalance → ${who(e.assignment)}${idle ? ` · ${nameOf(e.member, lang)}'e partition kalmadı, boşta` : ""}`
            : `${nameOf(e.member, lang)} joined. Rebalance → ${who(e.assignment)}${idle ? ` · no partition left for ${nameOf(e.member, lang)}, it is idle` : ""}`,
        });
        break;
      }
      case "left":
        out.push({ tone: "plain", text: tr ? `${nameOf(e.member, lang)} ayrıldı. Rebalance → ${who(e.assignment) || "kimse yok"}` : `${nameOf(e.member, lang)} left. Rebalance → ${who(e.assignment) || "nobody"}` });
        break;
      case "hot":
        out.push({
          tone: e.on ? "bad" : "ok",
          text: e.on
            ? tr
              ? `Sıcak key açıldı: bütün tıklamalar key = "${HOT_KEY}" ile partition ${HOT_PARTITION}'ye gidiyor`
              : `Hot key on: every click has key = "${HOT_KEY}" and goes to partition ${HOT_PARTITION}`
            : tr
              ? "Sıcak key kapandı: trafik partition'lara eşit dağılıyor"
              : "Hot key off: traffic spreads evenly over the partitions",
        });
        break;
      case "fast":
        out.push({
          tone: "ok",
          text: e.on
            ? tr
              ? "Kod hızlandı: her consumer saniyede 4 kayıt işliyor"
              : "Code sped up: every consumer handles 4 records a second"
            : tr
              ? "Normal hız: her consumer saniyede 2 kayıt işliyor"
              : "Normal speed: every consumer handles 2 records a second",
        });
        break;
      case "produced":
        out.push({ tone: "produce", text: tr ? `Yazıldı: p${e.partition}'a ${e.count} kayıt` : `Written: ${e.count} record${e.count > 1 ? "s" : ""} to p${e.partition}` });
        break;
      case "consumed": {
        const sum = e.handled.reduce((a, b) => a + b, 0);
        out.push({
          tone: sum > 0 ? "read" : "plain",
          text: tr ? `${nameOf(e.member, lang)} ${sum} kayıt işledi ve commit etti` : `${nameOf(e.member, lang)} handled and committed ${sum} record${sum === 1 ? "" : "s"}`,
        });
        break;
      }
    }
  }
  return out;
}

function lagTone(lag: number): PillTone {
  if (lag === 0) return "ok";
  if (lag <= 3) return "plain";
  if (lag < KEEP) return "warn";
  return "danger";
}

function beltsOf(state: LState): BeltPartition[] {
  const owners = assignment(state);
  const ownerOf = (i: number) => Object.entries(owners).find(([, ps]) => ps.includes(i))?.[0];
  return state.partitions.map((p, i) => {
    const owner = ownerOf(i);
    const lag = lagOf(p);
    return {
      logStart: p.logStart,
      logEnd: p.logEnd,
      records: Array.from({ length: p.logEnd - p.logStart }, (_, k) => {
        const offset = p.logStart + k;
        return { offset, label: "", kind: "order" as const, state: offset < p.committed ? ("dim" as const) : ("normal" as const) };
      }),
      position: p.committed,
      ownerTint: owner ? tintOf(owner) : TINTS.grey,
      badge: { text: `lag ${lag}`, tone: lagTone(lag) },
      hot: state.hot && i === HOT_PARTITION,
    };
  });
}

function readersOf(state: LState, lastEvents: LEvent[], pulse: number, lang: Lang): BeltReader[] {
  const owners = assignment(state);
  const second = lastEvents.find((e) => e.type === "second");
  const consumed = lastEvents.find((e) => e.type === "consumed");
  return state.members.map((m) => {
    const did =
      (second && second.type === "second" && (second.handled[m] ?? []).some((n) => n > 0)) ||
      (consumed && consumed.type === "consumed" && consumed.member === m && consumed.handled.some((n) => n > 0));
    const mine = owners[m] ?? [];
    const behind = mine.some((p) => lagOf(state.partitions[p]!) >= KEEP - 2);
    return {
      id: m,
      name: mine.length === 0 ? `${nameOf(m, lang)} · ${lang === "tr" ? "boşta" : "idle"}` : nameOf(m, lang),
      tint: tintOf(m),
      state: mine.length === 0 ? "idle" : behind ? "busy" : did ? "hop" : "idle",
      pulse,
      partitions: mine,
    };
  });
}

export function ConsumerLagScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;
  const [extra, setExtra] = useState<LAction[]>([]);
  const { game, setMissionStars } = useGame();
  const best = game.missions[SLUG] ?? {};
  const [missionIndex, setMissionIndex] = useState<number | null>(() => {
    const i = missions.findIndex((m) => !best[m.id]);
    return i < 0 ? 0 : i;
  });

  const count = sandbox ? 0 : stepActions[step]!.length;
  const cursor = usePlayback(count, paused, `${step}-${replayKey}`, 950);
  const sandboxRun = useMemo(() => (sandbox ? simulate(extra, sandboxStart) : null), [sandbox, extra]);

  let state: LState;
  let lastEvents: LEvent[];
  let shownEvents: LEvent[];
  if (sandboxRun) {
    state = sandboxRun.states[sandboxRun.states.length - 1]!;
    lastEvents = sandboxRun.events[sandboxRun.events.length - 1] ?? [];
    shownEvents = sandboxRun.events.flat();
  } else {
    const run = steps[step]!.run;
    state = run.states[cursor]!;
    lastEvents = cursor > 0 ? run.events[cursor - 1]! : [];
    shownEvents = run.events.slice(0, cursor).flat();
  }
  const pulse = sandbox ? extra.length : cursor;

  const mission = sandbox && missionIndex !== null ? missions[missionIndex]! : null;
  const won = Boolean(mission && sandboxRun && mission.check({ start: sandboxStart, state, actions: extra, events: sandboxRun.events }));
  const missionId = mission?.id;
  useEffect(() => {
    if (won && missionId) setMissionStars(SLUG, missionId, starsFor(extra.length, missions[missionIndex!]!.par));
  }, [won, missionId, missionIndex, extra.length, setMissionStars]);
  const locked = won;
  const act = (a: LAction) => {
    if (!locked) setExtra((xs) => [...xs, a]);
  };

  const lag = totalLag(state);
  const single = state.partitions.length === 1;
  const owners = assignment(state);
  const idle = state.members.filter((m) => (owners[m] ?? []).length === 0).length;
  const metrics: Metric[] = single
    ? [
        { label: t(text.logEnd), value: state.partitions[0]!.logEnd },
        { label: t(text.committed), value: state.partitions[0]!.committed, dot: "var(--lilac)" },
        { label: t(text.lag), value: lag, tone: lag === 0 ? "ok" : lag > 5 ? "danger" : "warn" },
      ]
    : [
        { label: t(text.lag), value: lag, tone: lag === 0 ? "ok" : lag > 9 ? "danger" : "warn" },
        { label: t(text.incoming), value: `${inflow(state).reduce((a, b) => a + b, 0)}${t(text.perSec)}` },
        {
          label: t(text.capacity),
          value: `${(state.members.length - idle) * speedOf(state)}${t(text.perSec)}`,
          tone: (state.members.length - idle) * speedOf(state) < 3 ? "warn" : "plain",
        },
        { label: t(text.consumers), value: idle > 0 ? `${state.members.length} (${idle} ${t(text.idle)})` : state.members.length },
      ];
  if (!single && (sandbox || state.missed > 0)) {
    const missed = state.missed - (sandbox ? sandboxStart.missed : 0);
    metrics.push({ label: `${t(text.missed)}${sandbox ? ` ${t(text.yours)}` : ""}`, value: missed, tone: missed > 0 ? "danger" : "plain" });
  }

  const legend: LegendItem[] = [
    { swatch: <g transform="translate(0 3)"><Parcel s={11} kind="order" size={0.85} /></g>, label: t(text.legendUnread) },
    { swatch: <g transform="translate(0 3)"><Parcel s={11} kind="order" size={0.85} state="dim" /></g>, label: t(text.legendRead) },
    { swatch: <g transform="translate(-6 6) scale(0.42)"><Flag tint={TINTS.lilac} label="" height={30} /></g>, label: t(text.legendFlag) },
    { swatch: <rect x={-10} y={-6} width={20} height={12} rx={6} className="pill pill-warn" />, label: t(text.legendBadge) },
  ];

  const lines = describe(shownEvents, lang);
  const eventList = (
    <div className={`events ${sandbox ? "" : "is-short"}`} aria-live="polite">
      <h3>{t(sandbox ? text.latest : text.thisStep)}</h3>
      {lines.length === 0 ? (
        <p>{t(sandbox ? text.nothing : text.waiting)}</p>
      ) : (
        <ol>
          {(sandbox ? [...lines].reverse() : lines).map((line, i) => (
            <li key={`${pulse}-${i}`} className={`ev-${line.tone}`}>
              <span className="ev-dot" />
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  let footer = null;
  if (sandbox) {
    footer = (
      <div className="sandbox">
        <MissionPanel
          missions={missions}
          active={missionIndex}
          onSelect={(i) => {
            setMissionIndex(i);
            setExtra([]);
          }}
          moves={extra.length}
          won={won}
          best={best}
        />
        <div className="sandbox-controls" title={locked ? t(ui.locked) : undefined}>
          <div className="control-row">
            <span className="control-name">
              <i style={{ background: "var(--sky)" }} />
              {t(text.time)}
            </span>
            <button className="chip-btn is-producer" disabled={locked} onClick={() => act({ type: "tick" })}>
              <Icon name="clock" size={15} /> {t(text.tick)}
            </button>
          </div>
          <div className="control-row">
            <span className="control-name">
              <i style={{ background: "var(--lilac)" }} />
              {t(text.group)}
            </span>
            <button className="chip-btn is-ok" disabled={locked || state.members.length >= MAX_CONSUMERS} onClick={() => act({ type: "addConsumer" })}>
              {t(text.addConsumer)}
            </button>
            <button className="chip-btn" disabled={locked || state.members.length === 0} onClick={() => act({ type: "removeConsumer" })}>
              {t(text.removeConsumer)}
            </button>
          </div>
          <div className="control-row">
            <span className="control-name">
              <i style={{ background: "var(--sun)" }} />
              {t(text.code)}
            </span>
            <button className={`chip-btn toggle-btn ${state.hot ? "" : "is-danger"}`} disabled={locked} onClick={() => act({ type: "toggleHot" })}>
              {t(state.hot ? text.hotOff : text.hotOn)}
            </button>
            <button className={`chip-btn toggle-btn ${state.fast ? "" : "is-ok"}`} disabled={locked} onClick={() => act({ type: "toggleFast" })}>
              {t(state.fast ? text.fastOff : text.fastOn)}
            </button>
          </div>
          <div className="control-row">
            <button className="chip-btn" disabled={extra.length === 0} onClick={() => setExtra((xs) => xs.slice(0, -1))}>
              <Icon name="undo" size={15} /> {t(text.undo)}
            </button>
            <button className="chip-btn" disabled={extra.length === 0} onClick={() => setExtra([])}>
              <Icon name="reset" size={15} /> {t(text.reset)}
            </button>
          </div>
        </div>
        {eventList}
      </div>
    );
  } else if (step === CLI_STEP) {
    footer = <CliOutput state={state} />;
  }

  const produced = lastEvents.some((e) => (e.type === "second" && e.written.some((n) => n > 0)) || e.type === "produced");

  return (
    <SceneFrame
      metrics={metrics}
      controls={controls}
      legend={legend}
      paused={paused}
      width={STAGE.width}
      height={STAGE.height}
      label={t(text.label)}
      footer={footer}
    >
      <BeltsStage
        partitions={beltsOf(state)}
        readers={readersOf(state, lastEvents, pulse, lang)}
        producer={{ name: t(text.producer), state: produced ? "hop" : "idle", pulse }}
        partitionLabel={(i) => `p${i}`}
        nextLabel={t(text.next)}
        window={WINDOW}
        origin={{ ox: 300, oy: 130 }}
      />
    </SceneFrame>
  );
}

/** What `kafka-consumer-groups.sh --describe` prints for this state, columns as in the real tool. */
function CliOutput({ state }: { state: LState }) {
  const { t } = useLang();
  const owners = assignment(state);
  const ownerOf = (i: number) => Object.entries(owners).find(([, ps]) => ps.includes(i))?.[0];
  const rows = state.partitions.map((p, i) => {
    const owner = ownerOf(i);
    const n = owner?.slice(1);
    return [
      GROUP,
      TOPIC,
      String(i),
      String(p.committed),
      String(p.logEnd),
      String(lagOf(p)),
      owner ? `consumer-${GROUP}-${n}-4b1c…` : "-",
      owner ? `/10.0.0.${n}` : "-",
      owner ? `consumer-${GROUP}-${n}` : "-",
    ];
  });
  const head = ["GROUP", "TOPIC", "PARTITION", "CURRENT-OFFSET", "LOG-END-OFFSET", "LAG", "CONSUMER-ID", "HOST", "CLIENT-ID"];
  const widths = head.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c]!.length)) + 2);
  const fmt = (cells: string[]) => cells.map((cell, c) => cell.padEnd(widths[c]!)).join("").trimEnd();
  return (
    <div className="cli">
      <h3>{t(text.cliTitle)}</h3>
      <pre>
        <span className="cli-prompt">$ </span>
        {`kafka-consumer-groups.sh --bootstrap-server localhost:9092 \\\n    --describe --group ${GROUP}\n\n`}
        <b>{fmt(head)}</b>
        {"\n"}
        {rows.map((r) => (
          <span key={r[2]} className={Number(r[5]) >= 6 ? "cli-bad" : undefined}>
            {fmt(r)}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}

/* ------------------------------------------------- "what changed" per step */

const both = (tr: string, en: string): L => ({ tr, en });

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const { start, run } = steps[step]!;
  const end = run.states[run.states.length - 1]!;
  const out: Change[] = [];
  const evs = run.events.flat();

  const written = end.partitions.reduce((s, p) => s + p.logEnd, 0) - start.partitions.reduce((s, p) => s + p.logEnd, 0);
  const handled = end.partitions.reduce((s, p) => s + p.committed, 0) - start.partitions.reduce((s, p) => s + p.committed, 0);
  if (step === CLI_STEP) {
    out.push({ kind: "add", text: both("Komut her partition için CURRENT-OFFSET, LOG-END-OFFSET ve LAG yazıyor", "The command prints CURRENT-OFFSET, LOG-END-OFFSET and LAG per partition") });
    return out;
  }
  if (written > 0) out.push({ kind: "add", text: both(`+${written} kayıt yazıldı`, `+${written} records written`) });
  const missed = end.missed - start.missed;
  if (handled - missed > 0) out.push({ kind: "good", text: both(`${handled - missed} kayıt işlendi ve commit edildi`, `${handled - missed} records handled and committed`) });
  if (handled - missed === 0 && written > 0) out.push({ kind: "bad", text: both("Hiç kayıt işlenmedi", "No record was handled") });

  for (const e of evs) {
    if (e.type === "joined") {
      const idle = (e.assignment[e.member] ?? []).length === 0;
      out.push({
        kind: idle ? "bad" : "change",
        text: idle
          ? both(`${nameOf(e.member, "tr")} katıldı ama boşta: partition kalmadı`, `${nameOf(e.member, "en")} joined but is idle: no partition left`)
          : both(`${nameOf(e.member, "tr")} katıldı, partition'lar yeniden dağıtıldı`, `${nameOf(e.member, "en")} joined; partitions handed out again`),
      });
    }
    if (e.type === "left") out.push({ kind: "remove", text: both(`${nameOf(e.member, "tr")} ayrıldı`, `${nameOf(e.member, "en")} left`) });
    if (e.type === "fast" && e.on) out.push({ kind: "good", text: both("Kod hızlandı: consumer başına saniyede 2 → 4 kayıt", "Code sped up: 2 → 4 records a second per consumer") });
  }
  if (missed > 0) out.push({ kind: "bad", text: both(`Retention ${missed} kaydı okunmadan sildi`, `Retention deleted ${missed} records before they were read`) });

  const a = totalLag(start);
  const b = totalLag(end);
  out.push({ kind: b > a ? "bad" : b < a ? "good" : "change", text: both(`Toplam lag: ${a} → ${b}`, `Total lag: ${a} → ${b}`) });
  if (end.hot && end.partitions.length > 1) {
    const hp = end.partitions[HOT_PARTITION]!;
    out.push({ kind: "bad", text: both(`Sıcak partition p${HOT_PARTITION}: lag ${lagOf(hp)}`, `Hot partition p${HOT_PARTITION}: lag ${lagOf(hp)}`) });
  }
  return out;
}
