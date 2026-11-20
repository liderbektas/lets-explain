import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { useTypedSandbox } from "@lets-explain/core/components/TypedSandbox";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import type { Action, ClusterState, KafkaRecord, Partition, SimEvent } from "../../engine/types";
import { l, useLang, type Lang } from "@lets-explain/core/i18n";
import { TopicStage, TOPIC_STAGE, type ParcelLook, type StageReader } from "../../iso/TopicStage";
import type { ParcelState, Tint } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import { starsFor, type Mission, type Scenario, type SceneProps } from "@lets-explain/core/course/types";
import { kafkaShell, replayShell, type KafkaBox, type ShellAction, type ShellRun } from "../../engine/cli";
import type { EventLine } from "./describe";
import { runMoves, topicCtx, type MoveRun, type TopicCtx } from "./topicSim";

/** What a typed scenario's check sees: the cluster as in a mission, plus the shell around it. */
export interface KafkaCtx extends TopicCtx {
  startBox: KafkaBox;
  box: KafkaBox;
}

export type KafkaScenario = Scenario<KafkaCtx, KafkaBox>;

export function kafkaCtx(startBox: KafkaBox, run: ShellRun): KafkaCtx {
  const box = run.boxes[run.boxes.length - 1]!;
  return { start: startBox.cluster, state: box.cluster, moves: run.actions.map((a) => [a]), events: run.events, startBox, box };
}

/**
 * The scene shell shared by the multi-partition lessons. A lesson gives it the
 * simulation (one action per playback tick), how to draw readers and parcels,
 * its counters, and for the try-it step its buttons and missions.
 */

export interface SceneView {
  state: ClusterState;
  /** Events of the latest action (or press), for highlights. */
  last: SimEvent[];
  sandbox: boolean;
  step: number;
  t: (x: { tr: string; en: string }) => string;
  lang: Lang;
  pulse: number;
  /** The topic on the stage: the lesson's own, or in the terminal the one the reader last worked on. */
  topic: string;
}

export interface SandboxApi {
  state: ClusterState;
  /** Presses so far. */
  moves: Action[][];
  press: (move: Action[]) => void;
  locked: boolean;
}

interface Config {
  slug: string;
  topic: string;
  base: { run: MoveRun; ends: number[]; startOf: (step: number) => number };
  stepActions: Action[][];
  sandboxStep: number;
  sandboxStart: ClusterState;
  /** Button missions, for a lesson still played with buttons. */
  missions: Mission<TopicCtx>[];
  /** Typed scenarios: they replace the buttons and missions. */
  scenarios?: KafkaScenario[];
  /** Where free play starts in typed mode. */
  freeStart?: KafkaBox;
  label: { tr: string; en: string };
  readers: (view: SceneView) => StageReader[];
  /** Highlight tint for a delivered record, by member. */
  tintOf: (group: string, member: string) => Tint | undefined;
  metrics: (view: SceneView, ctx: { start: ClusterState | null }) => Metric[];
  legend: (view: SceneView) => LegendItem[];
  describe: (events: SimEvent[], view: SceneView) => EventLine[];
  look?: (record: KafkaRecord, partition: Partition, view: SceneView) => ParcelLook;
  partitionLabel?: (index: number, view: SceneView) => string;
  producerName: { tr: string; en: string };
  controls: (api: SandboxApi, view: SceneView) => ReactNode;
  overlay?: (view: SceneView) => ReactNode;
}

const text = {
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
  nothingTyped: l("Bir komut yaz; Kafka'da ne olduğunu burada sade bir dille gör.", "Type a command; see what happened in Kafka here, in plain words."),
  next: l("sıradaki", "next"),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
};

export function TopicLessonScene({ config, step, paused, replayKey, controls }: SceneProps & { config: Config }) {
  const { t, lang } = useLang();
  const c = config;
  const sandbox = step === c.sandboxStep;
  const [extra, setExtra] = useState<Action[][]>([]);
  const { game, setMissionStars } = useGame();
  const best = game.missions[c.slug] ?? {};
  const [missionIndex, setMissionIndex] = useState<number | null>(() => {
    const i = c.missions.findIndex((m) => !best[m.id]);
    return i < 0 ? 0 : i;
  });

  const typed = Boolean(c.scenarios?.length);
  const box = useTypedSandbox({
    slug: c.slug,
    active: typed && sandbox,
    scenarios: c.scenarios ?? [],
    freeStart: c.freeStart ?? { cluster: c.sandboxStart, jobs: [], files: {}, nextPid: 4242 },
    shell: kafkaShell,
    replay: (start: KafkaBox, actions: ShellAction[]) => replayShell(start, actions),
    final: (r) => r.boxes[r.boxes.length - 1]!,
    context: (start, _actions, r) => kafkaCtx(start, r),
  });

  const count = sandbox ? 0 : (c.stepActions[step]?.length ?? 0);
  const cursor = usePlayback(count, paused, `${step}-${replayKey}`);
  const sandboxRun = useMemo(() => (sandbox ? runMoves(c.sandboxStart, extra) : null), [sandbox, extra, c.sandboxStart]);

  let state: ClusterState;
  let last: SimEvent[];
  let shown: SimEvent[];
  if (box.run) {
    state = box.run.boxes[box.run.boxes.length - 1]!.cluster;
    const withEvents = box.run.events.filter((e) => e.length > 0);
    last = withEvents[withEvents.length - 1] ?? [];
    shown = box.run.events.flat();
  } else if (sandboxRun) {
    state = sandboxRun.states[sandboxRun.states.length - 1]!;
    last = sandboxRun.events[sandboxRun.events.length - 1] ?? [];
    shown = sandboxRun.events.flat();
  } else {
    const start = c.base.startOf(Math.min(step, c.sandboxStep));
    state = c.base.run.states[start + cursor] ?? c.base.run.states[c.base.run.states.length - 1]!;
    last = cursor > 0 ? (c.base.run.events[start + cursor - 1] ?? []) : [];
    shown = c.base.run.events.slice(start, start + cursor).flat();
  }

  const mission = sandbox && missionIndex !== null ? c.missions[missionIndex] : undefined;
  const won = Boolean(mission && sandboxRun && mission.check(topicCtx(c.sandboxStart, sandboxRun, extra)));
  const missionId = mission?.id;
  const par = mission?.par ?? 0;
  useEffect(() => {
    if (won && missionId) setMissionStars(c.slug, missionId, starsFor(extra.length, par));
  }, [won, missionId, par, extra.length, setMissionStars, c.slug]);
  const locked = won;

  const pulse = box.run ? box.run.events.length : sandbox ? extra.length : cursor;
  const shownTopic = box.run ? touchedTopic(state, box.run.events.flat(), c.topic) : c.topic;
  const view: SceneView = { state, last, sandbox, step, t, lang, pulse, topic: shownTopic };
  const topic = state.topics[shownTopic];
  const partitions = topic?.partitions ?? [];

  const marks = new Map<string, { state: ParcelState; tint?: Tint; to?: string }>();
  for (const e of last) {
    if (e.type !== "delivered") continue;
    const index = e.tp.slice(e.tp.lastIndexOf("-") + 1);
    marks.set(`${index}:${e.offset}`, { state: e.duplicate ? "dup" : "read", tint: c.tintOf(e.group, e.member), to: e.member });
  }

  const produced = last.some((e) => e.type === "produced");
  const lines = c.describe(shown, view);
  const api: SandboxApi = {
    state,
    moves: extra,
    locked,
    press: (move) => {
      if (!locked && move.length > 0) setExtra((xs) => [...xs, move]);
    },
  };

  const eventList = (
    <div className={`events ${sandbox ? "" : "is-short"}`} aria-live="polite">
      <h3>{t(sandbox ? text.latest : text.thisStep)}</h3>
      {lines.length === 0 ? (
        <p>{t(sandbox ? (typed ? text.nothingTyped : text.nothing) : text.waiting)}</p>
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

  const footer = sandbox && typed ? (
    <div className="sandbox">
      {box.panel}
      {box.terminal}
      {eventList}
    </div>
  ) : sandbox ? (
    <div className="sandbox">
      <MissionPanel
        missions={c.missions}
        active={missionIndex}
        onSelect={(i) => {
          setMissionIndex(i);
          setExtra([]);
        }}
        moves={extra.length}
        won={won}
        best={best}
      />
      <div className="sandbox-controls">
        {c.controls(api, view)}
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
  ) : null;

  return (
    <SceneFrame
      metrics={c.metrics(view, { start: sandbox ? (typed ? box.start.cluster : c.sandboxStart) : null })}
      controls={controls}
      legend={c.legend(view)}
      paused={paused}
      width={TOPIC_STAGE.width}
      height={TOPIC_STAGE.height}
      label={t(c.label)}
      footer={footer}
    >
      <TopicStage
        partitions={partitions}
        readers={c.readers(view)}
        producer={{ name: t(c.producerName), state: produced ? "hop" : "idle", pulse }}
        marks={marks}
        look={c.look ? (r, p) => c.look!(r, p, view) : undefined}
        labels={{ partition: (i) => (c.partitionLabel ? c.partitionLabel(i, view) : `P${i}`), next: t(text.next) }}
      />
      {c.overlay?.(view)}
    </SceneFrame>
  );
}

/** A small cube for legends. */
export function MiniCube({ fill }: { fill: string }) {
  return (
    <g stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="-7,-4 0,0 0,7 -7,3" style={{ fill }} />
      <polygon points="0,0 7,-4 7,3 0,7" style={{ fill }} opacity="0.75" />
      <polygon points="-7,-4 0,-8 7,-4 0,0" style={{ fill }} />
    </g>
  );
}

export function FlagSwatch({ fill }: { fill: string }) {
  return (
    <g transform="translate(-6 5)">
      <line x1={0} y1={0} x2={0} y2={-15} className="flag-pole" />
      <path d="M0 -15h12l-2 3 2 3H0z" fill={fill} className="ink" />
    </g>
  );
}

/** Turns "order:1041" into "sipariş 1041" / "order 1041". */
export function orderText(value: string, lang: Lang) {
  const [, id] = value.split(":");
  return `${lang === "tr" ? "sipariş" : "order"} ${id ?? value}`;
}

/**
 * In the terminal a reader may create or use any topic. The stage shows the one they touched
 * last, falling back to the lesson's topic, then to any topic there is.
 */
function touchedTopic(state: ClusterState, events: SimEvent[], fallback: string): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    const name =
      "topic" in e && typeof e.topic === "string" ? e.topic : "tp" in e && typeof e.tp === "string" ? e.tp.slice(0, e.tp.lastIndexOf("-")) : null;
    if (name && state.topics[name]) return name;
  }
  if (state.topics[fallback]) return fallback;
  return Object.keys(state.topics)[0] ?? fallback;
}
