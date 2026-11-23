import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { useTypedSandbox } from "@lets-explain/core/components/TypedSandbox";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import type { Change, Mission, Scenario, SceneProps } from "@lets-explain/core/course/types";
import { starsFor } from "@lets-explain/core/course/types";
import { useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import { project as makeProject, rabbitShell, replayProject, type Files, type Project, type ProjectAction } from "../../engine/cli";
import { describeBroker } from "../../engine/describe";
import { simulate, type BrokerAction, type BrokerEvent, type Broker } from "../../engine/broker";
import { MAILROOM_STAGE } from "../../iso/MailroomStage";
import { brokerChanges } from "./brokerChanges";

/**
 * The shared shell for every RabbitMQ lesson: it replays each step's actions through the model,
 * draws the lesson's view, computes "what changed", and runs the try-it step with missions.
 * A lesson only says what happens and how to draw it.
 */

/** What a mission can look at: where the try-it step began, every move, what each did. */
export interface BrokerCtx {
  start: Broker;
  state: Broker;
  actions: BrokerAction[];
  events: BrokerEvent[][];
  states: Broker[];
}

/** What a typed scenario's check sees: the broker run, plus the project (files, workers) around it. */
export interface RabbitCtx extends BrokerCtx {
  project: Project;
  startProject: Project;
  typed: ProjectAction[];
}

export type RabbitScenario = Scenario<RabbitCtx, Project>;

/** The context for a typed run, shared by the scene and the tests. */
export function typedCtx(start: Project, actions: ProjectAction[]): RabbitCtx {
  const r = replayProject(start, actions);
  return {
    start: start.broker,
    state: r.project.broker,
    actions: actions.filter((a): a is BrokerAction => !["writeFile", "removeFile", "startWorker", "stopWorker", "nextGen"].includes(a.type)),
    events: r.events,
    states: r.states,
    project: r.project,
    startProject: start,
    typed: actions,
  };
}

export interface SandboxButton {
  label: string;
  action: BrokerAction;
  tone?: "plain" | "ok" | "danger" | "producer" | "go";
  /** Disable when the move makes no sense here. The mission search skips disabled buttons too. */
  disabled?: boolean;
}

export interface SandboxRow {
  label: string;
  buttons: SandboxButton[];
}

export interface ViewInfo {
  step: number;
  sandbox: boolean;
  /** Events of the action that produced this state. */
  last: BrokerEvent[];
  /** Message ids the last action touched, to highlight. */
  fresh: Set<string>;
  /** The state before the last action, so the stage can move each message from where it was. */
  prev: Broker;
  /** Every event since the run began, up to this state (e.g. which exchange dropped a lost message). */
  history: BrokerEvent[];
  t: (x: L) => string;
  lang: Lang;
}

export interface BrokerSceneConfig {
  slug: string;
  start: Broker;
  /** One list of actions per step. The last step is the try-it step and plays nothing. */
  steps: BrokerAction[][];
  label: L;
  view: (repo: Broker, info: ViewInfo) => ReactNode;
  metrics?: (repo: Broker, t: (x: L) => string, info: ViewInfo) => Metric[];
  legend?: (t: (x: L) => string) => LegendItem[];
  sandbox?: {
    /** Where the try-it step starts. Defaults to the state at the end of the lesson. */
    start?: (end: Broker) => Broker;
    /** Button rows, for a lesson whose try-it step is played with buttons. */
    rows?: (repo: Broker, lang: Lang, history: BrokerAction[]) => SandboxRow[];
    missions?: Mission<BrokerCtx>[];
    /** Scenarios played by typing in a terminal (code and rabbitmqctl). They replace the buttons. */
    scenarios?: RabbitScenario[];
    /** The project's files in free play. */
    files?: Files;
  };
  /** Extra "what changed" lines for a step, added after the computed ones. */
  extraChanges?: (step: number) => Change[];
}

export interface BrokerScene {
  Scene: ComponentType<SceneProps>;
  changesFor: (step: number) => Change[];
  /** The whole lesson as one run, for tests. */
  run: ReturnType<typeof simulate>;
  stepStart: (step: number) => number;
  stepEnd: (step: number) => number;
  sandboxStart: Broker;
  /** Enabled sandbox moves in a state: exactly the buttons a reader could press. */
  moves: (repo: Broker, history: BrokerAction[]) => BrokerAction[];
}

export function makeBrokerScene(config: BrokerSceneConfig): BrokerScene {
  const ends: number[] = [];
  let n = 0;
  for (const s of config.steps) {
    n += s.length;
    ends.push(n);
  }
  const run = simulate(config.steps.flat(), config.start);
  const stepStart = (step: number) => (step === 0 ? 0 : ends[step - 1]!);
  const stepEnd = (step: number) => ends[step]!;
  const sandboxStep = config.steps.length - 1;
  const end = run.states[run.states.length - 1]!;
  const sandboxStart = config.sandbox?.start ? config.sandbox.start(end) : end;
  const moves = (repo: Broker, history: BrokerAction[]) =>
    config.sandbox?.rows ? config.sandbox.rows(repo, "en", history).flatMap((r) => r.buttons.filter((b) => !b.disabled).map((b) => b.action)) : [];
  const scenarios = config.sandbox?.scenarios ?? [];
  const typed = scenarios.length > 0;
  const freeProject = makeProject(sandboxStart, config.sandbox?.files ?? {});

  const changesFor = (step: number): Change[] => {
    if (step >= sandboxStep && config.sandbox) return [];
    const before = run.states[stepStart(step)]!;
    const after = run.states[stepEnd(step)]!;
    return [...brokerChanges(before, after), ...(config.extraChanges?.(step) ?? [])];
  };

  function Scene({ step, paused, replayKey, controls }: SceneProps) {
    const { t, lang } = useLang();
    const sandbox = Boolean(config.sandbox) && step === sandboxStep;
    const count = sandbox ? 0 : (config.steps[step]?.length ?? 0);
    // Each action gets time for its whole motion: to the exchange, into the queue, on to a consumer.
    const cursor = usePlayback(count, paused, `${step}-${replayKey}`, ACTION_MS);

    const [moves, setMoves] = useState<BrokerAction[]>([]);
    const sandRun = useMemo(() => (sandbox ? simulate(moves, sandboxStart) : null), [sandbox, moves]);
    const { game, setMissionStars } = useGame();
    const best = game.missions[config.slug] ?? {};
    const missions = config.sandbox?.missions ?? [];
    const [missionIndex, setMissionIndex] = useState<number | null>(() => {
      const i = missions.findIndex((m) => !best[m.id]);
      return missions.length ? (i < 0 ? 0 : i) : null;
    });

    const typedBox = useTypedSandbox({
      slug: config.slug,
      active: typed && sandbox,
      scenarios,
      freeStart: freeProject,
      shell: rabbitShell,
      replay: (start: Project, actions: ProjectAction[]) => replayProject(start, actions),
      final: (r) => r.project,
      context: (start, actions) => typedCtx(start, actions),
    });
    const typedRun = typedBox.run;

    let state: Broker;
    let last: BrokerEvent[];
    let shown: BrokerEvent[];
    let history: BrokerEvent[];
    if (typedRun) {
      state = typedRun.project.broker;
      history = typedRun.events.flat();
      // The last broker action's events: file edits and worker bookkeeping have none.
      last = [...typedRun.events].reverse().find((e) => e.length > 0) ?? [];
      shown = typedRun.events.flat();
    } else if (sandRun) {
      state = sandRun.states[sandRun.states.length - 1]!;
      history = [...run.events.flat(), ...sandRun.events.flat()];
      last = sandRun.events[sandRun.events.length - 1] ?? [];
      shown = sandRun.events.flat();
    } else {
      const s0 = stepStart(Math.min(step, sandboxStep));
      state = run.states[s0 + cursor]!;
      history = run.events.slice(0, s0 + cursor).flat();
      last = cursor > 0 ? run.events[s0 + cursor - 1]! : [];
      shown = run.events.slice(s0, s0 + cursor).flat();
    }
    const prev = typedRun
      ? (() => {
          const i = typedRun.events.length - 1 - [...typedRun.events].reverse().findIndex((e) => e.length > 0);
          return i >= 0 && i < typedRun.events.length ? typedRun.states[i]! : typedBox.start.broker;
        })()
      : sandRun
        ? (sandRun.states[sandRun.states.length - 2] ?? sandboxStart)
        : run.states[Math.max(0, stepStart(Math.min(step, sandboxStep)) + cursor - 1)]!;
    const fresh = new Set(last.flatMap((e) => ("id" in e ? [e.id] : [])));
    const info: ViewInfo = { step, sandbox, last, fresh, prev, history, t, lang };

    const mission = sandbox && missionIndex !== null ? missions[missionIndex] : undefined;
    const won = Boolean(mission && sandRun && mission.check({ start: sandboxStart, state, actions: moves, events: sandRun.events, states: sandRun.states }));
    useEffect(() => {
      if (won && mission) setMissionStars(config.slug, mission.id, starsFor(moves.length, mission.par));
    }, [won, mission, moves.length, setMissionStars]);
    const act = (a: BrokerAction) => {
      if (!won) setMoves((xs) => [...xs, a]);
    };

    const lines = shown.map((e) => describeBroker(e, lang));
    const eventList = (
      <div className="events" aria-live="polite">
        <h3>{t(sandbox ? text.latest : text.thisStep)}</h3>
        {lines.length === 0 ? (
          <p>{t(sandbox ? (typed ? text.nothingTyped : text.nothing) : text.waiting)}</p>
        ) : (
          <ol>
            {(sandbox ? [...lines].reverse() : lines).map((line, i) => (
              <li key={`${moves.length}-${i}`} className={`ev-${line.tone}`}>
                <span className="ev-dot" />
                <span>{line.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );

    const footer =
      sandbox && typed ? (
        <div className="sandbox">
          {typedBox.panel}
          {typedBox.terminal}
          {eventList}
        </div>
      ) : sandbox && config.sandbox?.rows ? (
        <div className="sandbox">
          {missions.length > 0 && (
            <MissionPanel
              missions={missions}
              active={missionIndex}
              onSelect={(i) => {
                setMissionIndex(i);
                setMoves([]);
              }}
              moves={moves.length}
              won={won}
              best={best}
            />
          )}
          <div className="sandbox-controls" title={won ? t(ui.locked) : undefined}>
            {config.sandbox.rows(state, lang, moves).map((row) => (
              <div className="control-row" key={row.label}>
                <span className="control-name">{row.label}</span>
                {row.buttons.map((b) => (
                  <button
                    key={b.label}
                    className={`chip-btn ${b.tone && b.tone !== "plain" ? `is-${b.tone === "producer" ? "producer" : b.tone}` : ""}`}
                    disabled={won || b.disabled}
                    onClick={() => act(b.action)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            ))}
            <div className="control-row">
              <button className="chip-btn" disabled={moves.length === 0} onClick={() => setMoves((xs) => xs.slice(0, -1))}>
                <Icon name="undo" size={15} /> {t(text.undo)}
              </button>
              <button className="chip-btn" disabled={moves.length === 0} onClick={() => setMoves([])}>
                <Icon name="reset" size={15} /> {t(text.reset)}
              </button>
            </div>
          </div>
          {eventList}
        </div>
      ) : null;

    return (
      <SceneFrame
        metrics={config.metrics?.(state, t, info) ?? []}
        controls={controls}
        legend={config.legend?.(t) ?? []}
        paused={paused}
        width={MAILROOM_STAGE.width}
        height={MAILROOM_STAGE.height}
        label={t(config.label)}
        footer={footer}
      >
        {config.view(state, info)}
      </SceneFrame>
    );
  }

  return { Scene, changesFor, run, stepStart, stepEnd, sandboxStart, moves };
}

/** Milliseconds per action: the longest motion (publish, route, deliver) takes about 1.4 s. */
const ACTION_MS = 1500;

const l = (tr: string, en: string): L => ({ tr, en });
const text = {
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
  nothingTyped: l("Bir komut yaz; broker'da ne olduğunu burada sade bir dille gör.", "Type a command; see what happened in the broker here, in plain words."),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
};
