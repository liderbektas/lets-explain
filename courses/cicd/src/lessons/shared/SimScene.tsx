import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import type { Change, Mission, SceneProps } from "@lets-explain/core/course/types";
import { starsFor } from "@lets-explain/core/course/types";
import { useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { useGame } from "@lets-explain/core/lib/storage";
import type { Line } from "../../engine/describe";

/**
 * The shared shell for every CI/CD lesson. A lesson brings a small simulation (`Sim`): the
 * course's GitHub Actions model, or a lesson's own model for things like deploy strategies.
 * The shell replays each step's actions through it, draws the lesson's view, computes "what
 * changed", and runs the try-it step with missions. A lesson only says what happens and how
 * to draw it.
 */

export interface Sim<S, A, E> {
  apply: (state: S, action: A) => { state: S; events: E[] };
  describe: (event: E, lang: Lang) => Line;
  /** The "what changed" list between two states. */
  changes?: (before: S, after: S) => Change[];
  /** How long to show an action's result before the next one plays, in ms (default 1000). */
  hold?: (events: E[]) => number;
}

/** What a mission can look at: where the try-it step began, every move, what each did. */
export interface Ctx<S, A, E> {
  start: S;
  state: S;
  actions: A[];
  events: E[][];
  states: S[];
}

export interface SandboxButton<A> {
  label: string;
  action: A;
  tone?: "plain" | "ok" | "danger" | "producer" | "go";
  /** Disable when the move makes no sense here. The mission search skips disabled buttons too. */
  disabled?: boolean;
}

export interface SandboxRow<A> {
  label: string;
  buttons: SandboxButton<A>[];
}

export interface ViewInfo<S, A, E> {
  step: number;
  sandbox: boolean;
  /** Events of the action that produced this state. */
  last: E[];
  /** The state before the last action. */
  prev: S;
  /** Actions played so far in this step (or every sandbox move). */
  played: A[];
  t: (x: L) => string;
  lang: Lang;
}

export interface SceneConfig<S, A, E> {
  slug: string;
  sim: Sim<S, A, E>;
  start: S;
  /** One list of actions per step. The last step is the try-it step and plays nothing. */
  steps: A[][];
  label: L;
  view: (state: S, info: ViewInfo<S, A, E>) => ReactNode;
  metrics?: (state: S, t: (x: L) => string, info: ViewInfo<S, A, E>) => Metric[];
  legend?: (t: (x: L) => string) => LegendItem[];
  sandbox?: {
    /** Where the try-it step starts. Defaults to the state at the end of the lesson. */
    start?: (end: S) => S;
    rows: (state: S, lang: Lang, history: A[]) => SandboxRow<A>[];
    missions: Mission<Ctx<S, A, E>>[];
  };
  /** Extra "what changed" lines for a step, added after the computed ones. */
  extraChanges?: (step: number) => Change[];
  width?: number;
  height?: number;
}

export interface SimScene<S, A, E> {
  Scene: ComponentType<SceneProps>;
  changesFor: (step: number) => Change[];
  /** The whole lesson as one run, for tests. */
  run: { states: S[]; events: E[][] };
  stepStart: (step: number) => number;
  stepEnd: (step: number) => number;
  /** State at the end of a lesson step. */
  at: (step: number) => S;
  sandboxStart: S;
  /** Enabled sandbox moves in a state: exactly the buttons a reader could press. */
  moves: (state: S, history: A[]) => A[];
  sim: Sim<S, A, E>;
}

export function simulateWith<S, A, E>(sim: Sim<S, A, E>, actions: A[], start: S) {
  const states: S[] = [start];
  const events: E[][] = [];
  let s = start;
  for (const a of actions) {
    const r = sim.apply(s, a);
    s = r.state;
    states.push(s);
    events.push(r.events);
  }
  return { states, events };
}

/** Step specs may be functions of the state they run in (e.g. "toggle the cache that is there now"). */
export type Spec<S, A> = A | ((s: S) => A);

export function resolveSteps<S, A, E>(sim: Sim<S, A, E>, start: S, list: Spec<S, A>[][]): A[][] {
  let s = start;
  return list.map((step) =>
    step.map((spec) => {
      const a = typeof spec === "function" ? (spec as (x: S) => A)(s) : spec;
      s = sim.apply(s, a).state;
      return a;
    }),
  );
}

export function makeSimScene<S, A, E>(config: SceneConfig<S, A, E>): SimScene<S, A, E> {
  const { sim } = config;
  const ends: number[] = [];
  let n = 0;
  for (const s of config.steps) {
    n += s.length;
    ends.push(n);
  }
  const run = simulateWith(sim, config.steps.flat(), config.start);
  const stepStart = (step: number) => (step === 0 ? 0 : ends[step - 1]!);
  const stepEnd = (step: number) => ends[step]!;
  const at = (step: number) => run.states[stepEnd(step)]!;
  const sandboxStep = config.steps.length - 1;
  const end = run.states[run.states.length - 1]!;
  const sandboxStart = config.sandbox?.start ? config.sandbox.start(end) : end;
  const moves = (state: S, history: A[]) =>
    config.sandbox ? config.sandbox.rows(state, "en", history).flatMap((r) => r.buttons.filter((b) => !b.disabled).map((b) => b.action)) : [];

  const changesFor = (step: number): Change[] => {
    if (step >= sandboxStep && config.sandbox) return [];
    const before = run.states[stepStart(step)]!;
    const after = run.states[stepEnd(step)]!;
    return [...(sim.changes?.(before, after) ?? []), ...(config.extraChanges?.(step) ?? [])];
  };

  function Scene({ step, paused, replayKey, controls }: SceneProps) {
    const { t, lang } = useLang();
    const sandbox = Boolean(config.sandbox) && step === sandboxStep;
    const count = sandbox ? 0 : (config.steps[step]?.length ?? 0);
    const s0 = stepStart(Math.min(step, sandboxStep));
    const cursor = usePacedPlayback(count, paused, `${step}-${replayKey}`, (i) => sim.hold?.(run.events[s0 + i] ?? []) ?? 1000);

    const [moves, setMoves] = useState<A[]>([]);
    const sandRun = useMemo(() => (sandbox ? simulateWith(sim, moves, sandboxStart) : null), [sandbox, moves]);
    const { game, setMissionStars } = useGame();
    const best = game.missions[config.slug] ?? {};
    const missions = config.sandbox?.missions ?? [];
    const [missionIndex, setMissionIndex] = useState<number | null>(() => {
      const i = missions.findIndex((m) => !best[m.id]);
      return missions.length ? (i < 0 ? 0 : i) : null;
    });

    let state: S;
    let prev: S;
    let last: E[];
    let shown: E[];
    let played: A[];
    if (sandRun) {
      state = sandRun.states[sandRun.states.length - 1]!;
      prev = sandRun.states[sandRun.states.length - 2] ?? sandboxStart;
      last = sandRun.events[sandRun.events.length - 1] ?? [];
      shown = sandRun.events.flat();
      played = moves;
    } else {
      state = run.states[s0 + cursor]!;
      prev = run.states[Math.max(0, s0 + cursor - 1)]!;
      last = cursor > 0 ? run.events[s0 + cursor - 1]! : [];
      shown = run.events.slice(s0, s0 + cursor).flat();
      played = (config.steps[Math.min(step, sandboxStep)] ?? []).slice(0, cursor);
    }
    const info: ViewInfo<S, A, E> = { step, sandbox, last, prev, played, t, lang };

    const mission = sandbox && missionIndex !== null ? missions[missionIndex] : undefined;
    const won = Boolean(mission && sandRun && mission.check({ start: sandboxStart, state, actions: moves, events: sandRun.events, states: sandRun.states }));
    useEffect(() => {
      if (won && mission) setMissionStars(config.slug, mission.id, starsFor(moves.length, mission.par));
    }, [won, mission, moves.length, setMissionStars]);
    const act = (a: A) => {
      if (!won) setMoves((xs) => [...xs, a]);
    };

    const lines = shown.map((e) => sim.describe(e, lang));
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
                    className={`chip-btn ${b.tone && b.tone !== "plain" ? `is-${b.tone}` : ""}`}
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
        width={config.width ?? STAGE.width}
        height={config.height ?? STAGE.height}
        label={t(config.label)}
        footer={footer}
      >
        {config.view(state, info)}
      </SceneFrame>
    );
  }

  return { Scene, changesFor, run, stepStart, stepEnd, at, sandboxStart, moves, sim };
}

/**
 * Plays a step's actions one at a time, like core's usePlayback, but each action's result stays
 * on screen as long as `holdAfter(i)` says: a push that starts a run is held until the run has
 * played out, a settings change only briefly.
 */
function usePacedPlayback(count: number, paused: boolean, resetKey: string, holdAfter: (i: number) => number): number {
  const [pb, setPb] = useState({ key: resetKey, cursor: 0 });
  const cursor = pb.key === resetKey ? Math.min(pb.cursor, count) : 0;
  const wait = cursor === 0 ? 450 : holdAfter(cursor - 1);
  useEffect(() => {
    if (paused || cursor >= count) return;
    const id = setTimeout(() => setPb((p) => ({ key: resetKey, cursor: (p.key === resetKey ? p.cursor : 0) + 1 })), wait);
    return () => clearTimeout(id);
  }, [cursor, count, paused, resetKey, wait]);
  return cursor;
}

export const STAGE = { width: 860, height: 470 };

const l = (tr: string, en: string): L => ({ tr, en });
const text = {
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
};
