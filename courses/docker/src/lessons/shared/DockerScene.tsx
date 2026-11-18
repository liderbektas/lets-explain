import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import type { Change, Mission, SceneProps } from "@lets-explain/core/course/types";
import { starsFor } from "@lets-explain/core/course/types";
import { useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import { describeDocker } from "../../engine/describe";
import { simulate, type DockerAction, type DockerEvent, type Host } from "../../engine/docker";
import { HOST_STAGE } from "../../iso/HostStage";
import { hostChanges } from "./hostChanges";

/**
 * The shared shell for every Docker lesson: it replays each step's actions through the model,
 * draws the lesson's view, computes "what changed", and runs the try-it step with missions.
 * A lesson only says what happens and how to draw it.
 */

/** What a mission can look at: where the try-it step began, every move, what each did. */
export interface DockerCtx {
  start: Host;
  state: Host;
  actions: DockerAction[];
  events: DockerEvent[][];
  states: Host[];
}

export interface SandboxButton {
  label: string;
  action: DockerAction;
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
  last: DockerEvent[];
  /** Container names the last action touched, to highlight. */
  fresh: Set<string>;
  t: (x: L) => string;
  lang: Lang;
}

export interface DockerSceneConfig {
  slug: string;
  start: Host;
  /** One list of actions per step. The last step is the try-it step and plays nothing. */
  steps: DockerAction[][];
  label: L;
  view: (repo: Host, info: ViewInfo) => ReactNode;
  metrics?: (repo: Host, t: (x: L) => string, info: ViewInfo) => Metric[];
  legend?: (t: (x: L) => string) => LegendItem[];
  sandbox?: {
    /** Where the try-it step starts. Defaults to the state at the end of the lesson. */
    start?: (end: Host) => Host;
    rows: (repo: Host, lang: Lang, history: DockerAction[]) => SandboxRow[];
    missions: Mission<DockerCtx>[];
  };
  /** Extra "what changed" lines for a step, added after the computed ones. */
  extraChanges?: (step: number) => Change[];
}

export interface DockerScene {
  Scene: ComponentType<SceneProps>;
  changesFor: (step: number) => Change[];
  /** The whole lesson as one run, for tests. */
  run: ReturnType<typeof simulate>;
  stepStart: (step: number) => number;
  stepEnd: (step: number) => number;
  sandboxStart: Host;
  /** Enabled sandbox moves in a state: exactly the buttons a reader could press. */
  moves: (repo: Host, history: DockerAction[]) => DockerAction[];
}

export function makeDockerScene(config: DockerSceneConfig): DockerScene {
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
  const moves = (repo: Host, history: DockerAction[]) =>
    config.sandbox ? config.sandbox.rows(repo, "en", history).flatMap((r) => r.buttons.filter((b) => !b.disabled).map((b) => b.action)) : [];

  const changesFor = (step: number): Change[] => {
    if (step >= sandboxStep && config.sandbox) return [];
    const before = run.states[stepStart(step)]!;
    const after = run.states[stepEnd(step)]!;
    return [...hostChanges(before, after), ...(config.extraChanges?.(step) ?? [])];
  };

  function Scene({ step, paused, replayKey, controls }: SceneProps) {
    const { t, lang } = useLang();
    const sandbox = Boolean(config.sandbox) && step === sandboxStep;
    const count = sandbox ? 0 : (config.steps[step]?.length ?? 0);
    const cursor = usePlayback(count, paused, `${step}-${replayKey}`);

    const [moves, setMoves] = useState<DockerAction[]>([]);
    const sandRun = useMemo(() => (sandbox ? simulate(moves, sandboxStart) : null), [sandbox, moves]);
    const { game, setMissionStars } = useGame();
    const best = game.missions[config.slug] ?? {};
    const missions = config.sandbox?.missions ?? [];
    const [missionIndex, setMissionIndex] = useState<number | null>(() => {
      const i = missions.findIndex((m) => !best[m.id]);
      return missions.length ? (i < 0 ? 0 : i) : null;
    });

    let state: Host;
    let last: DockerEvent[];
    let shown: DockerEvent[];
    if (sandRun) {
      state = sandRun.states[sandRun.states.length - 1]!;
      last = sandRun.events[sandRun.events.length - 1] ?? [];
      shown = sandRun.events.flat();
    } else {
      const s0 = stepStart(Math.min(step, sandboxStep));
      state = run.states[s0 + cursor]!;
      last = cursor > 0 ? run.events[s0 + cursor - 1]! : [];
      shown = run.events.slice(s0, s0 + cursor).flat();
    }
    const prev = sandRun ? (sandRun.states[sandRun.states.length - 2] ?? sandboxStart) : run.states[Math.max(0, stepStart(Math.min(step, sandboxStep)) + cursor - 1)]!;
    void prev;
    const fresh = new Set(last.flatMap((e) => ("name" in e && typeof e.name === "string" ? [e.name] : [])));
    const info: ViewInfo = { step, sandbox, last, fresh, t, lang };

    const mission = sandbox && missionIndex !== null ? missions[missionIndex] : undefined;
    const won = Boolean(mission && sandRun && mission.check({ start: sandboxStart, state, actions: moves, events: sandRun.events, states: sandRun.states }));
    useEffect(() => {
      if (won && mission) setMissionStars(config.slug, mission.id, starsFor(moves.length, mission.par));
    }, [won, mission, moves.length, setMissionStars]);
    const act = (a: DockerAction) => {
      if (!won) setMoves((xs) => [...xs, a]);
    };

    const lines = shown.map((e) => describeDocker(e, lang));
    const eventList = (
      <div className="events" aria-live="polite">
        <h3>{t(sandbox ? text.latest : text.thisStep)}</h3>
        {lines.length === 0 ? (
          <p>{t(sandbox ? text.nothing : text.waiting)}</p>
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
      sandbox && config.sandbox ? (
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
        width={HOST_STAGE.width}
        height={HOST_STAGE.height}
        label={t(config.label)}
        footer={footer}
      >
        {config.view(state, info)}
      </SceneFrame>
    );
  }

  return { Scene, changesFor, run, stepStart, stepEnd, sandboxStart, moves };
}

const l = (tr: string, en: string): L => ({ tr, en });
const text = {
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
};
