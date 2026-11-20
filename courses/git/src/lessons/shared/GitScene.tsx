import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { ScenarioPanel } from "@lets-explain/core/components/ScenarioPanel";
import { Terminal } from "@lets-explain/core/components/Terminal";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import type { Change, Mission, Scenario, SceneProps } from "@lets-explain/core/course/types";
import { scenarioStars, starsFor } from "@lets-explain/core/course/types";
import type { TermLine } from "@lets-explain/core/lib/terminal";
import { useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import { completeLine, promptFor, runLine, type CliResult, type GitEditor } from "../../engine/cli";
import { describeGit } from "../../engine/describe";
import { simulate, type GitAction, type GitEvent, type Repo } from "../../engine/git";
import { GIT_STAGE } from "../../iso/GraphStage";
import { gitChanges } from "./gitChanges";

/**
 * The shared shell for every Git lesson: it replays each step's actions through the model,
 * draws the lesson's view, computes "what changed", and runs the try-it step with missions.
 * A lesson only says what happens and how to draw it.
 */

/** What a mission can look at: where the try-it step began, every move, what each did. */
export interface GitCtx {
  start: Repo;
  state: Repo;
  actions: GitAction[];
  events: GitEvent[][];
  states: Repo[];
}

export type GitScenario = Scenario<GitCtx, Repo>;

/** One typed line and what it did; an editor's save is its own entry, with no line. */
interface Entry {
  prompt: string;
  line: string | null;
  result: CliResult;
}

export interface SandboxButton {
  label: string;
  action: GitAction;
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
  last: GitEvent[];
  /** Commits created by the last action, to glow. */
  fresh: Set<string>;
  t: (x: L) => string;
  lang: Lang;
}

export interface GitSceneConfig {
  slug: string;
  start: Repo;
  /** One list of actions per step. The last step is the try-it step and plays nothing. */
  steps: GitAction[][];
  label: L;
  view: (repo: Repo, info: ViewInfo) => ReactNode;
  metrics?: (repo: Repo, t: (x: L) => string, info: ViewInfo) => Metric[];
  legend?: (t: (x: L) => string) => LegendItem[];
  sandbox?: {
    /** Where the try-it step starts (free play, when there are scenarios). Defaults to the state at the end of the lesson. */
    start?: (end: Repo) => Repo;
    /** Button rows, for a lesson whose try-it step is played with buttons. */
    rows?: (repo: Repo, lang: Lang, history: GitAction[]) => SandboxRow[];
    missions?: Mission<GitCtx>[];
    /** Scenarios played by typing commands in a terminal. They replace the buttons. */
    scenarios?: GitScenario[];
  };
  /** Extra "what changed" lines for a step, added after the computed ones. */
  extraChanges?: (step: number) => Change[];
}

export interface GitScene {
  Scene: ComponentType<SceneProps>;
  changesFor: (step: number) => Change[];
  /** The whole lesson as one run, for tests. */
  run: ReturnType<typeof simulate>;
  stepStart: (step: number) => number;
  stepEnd: (step: number) => number;
  sandboxStart: Repo;
  /** Enabled sandbox moves in a state: exactly the buttons a reader could press. */
  moves: (repo: Repo, history: GitAction[]) => GitAction[];
}

export function makeGitScene(config: GitSceneConfig): GitScene {
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
  const moves = (repo: Repo, history: GitAction[]) =>
    config.sandbox?.rows ? config.sandbox.rows(repo, "en", history).flatMap((r) => r.buttons.filter((b) => !b.disabled).map((b) => b.action)) : [];
  const scenarios = config.sandbox?.scenarios ?? [];
  const typed = scenarios.length > 0;

  const changesFor = (step: number): Change[] => {
    if (step >= sandboxStep && config.sandbox) return [];
    const before = run.states[stepStart(step)]!;
    const after = run.states[stepEnd(step)]!;
    return [...gitChanges(before, after), ...(config.extraChanges?.(step) ?? [])];
  };

  function Scene({ step, paused, replayKey, controls }: SceneProps) {
    const { t, lang } = useLang();
    const sandbox = Boolean(config.sandbox) && step === sandboxStep;
    const count = sandbox ? 0 : (config.steps[step]?.length ?? 0);
    const cursor = usePlayback(count, paused, `${step}-${replayKey}`);

    const [moves, setMoves] = useState<GitAction[]>([]);
    const sandRun = useMemo(() => (sandbox ? simulate(moves, sandboxStart) : null), [sandbox, moves]);
    const { game, setMissionStars } = useGame();
    const best = game.missions[config.slug] ?? {};
    const missions = config.sandbox?.missions ?? [];
    const [missionIndex, setMissionIndex] = useState<number | null>(() => {
      const i = missions.findIndex((m) => !best[m.id]);
      return missions.length ? (i < 0 ? 0 : i) : null;
    });

    // Typing: the scenario being played, every line typed, and an editor a command opened.
    const [scenarioIndex, setScenarioIndex] = useState<number | null>(() => {
      const i = scenarios.findIndex((m) => !best[m.id]);
      return scenarios.length ? (i < 0 ? 0 : i) : null;
    });
    const [entries, setEntries] = useState<Entry[]>([]);
    const [editor, setEditor] = useState<GitEditor | null>(null);
    const [hints, setHints] = useState(0);
    const scenario = typed && sandbox && scenarioIndex !== null ? scenarios[scenarioIndex] : undefined;
    const typedStart = scenario ? scenario.start : sandboxStart;
    const typedActions = useMemo(() => entries.flatMap((e) => e.result.actions), [entries]);
    const typedRun = useMemo(() => (typed && sandbox ? simulate(typedActions, typedStart) : null), [sandbox, typedActions, typedStart]);
    const pick = (i: number | null) => {
      setScenarioIndex(i);
      setEntries([]);
      setEditor(null);
      setHints(0);
    };

    let state: Repo;
    let last: GitEvent[];
    let shown: GitEvent[];
    if (typedRun) {
      state = typedRun.states[typedRun.states.length - 1]!;
      last = typedRun.events[typedRun.events.length - 1] ?? [];
      shown = typedRun.events.flat();
    } else if (sandRun) {
      state = sandRun.states[sandRun.states.length - 1]!;
      last = sandRun.events[sandRun.events.length - 1] ?? [];
      shown = sandRun.events.flat();
    } else {
      const s0 = stepStart(Math.min(step, sandboxStep));
      state = run.states[s0 + cursor]!;
      last = cursor > 0 ? run.events[s0 + cursor - 1]! : [];
      shown = run.events.slice(s0, s0 + cursor).flat();
    }
    const prev = typedRun
      ? (typedRun.states[typedRun.states.length - 2] ?? typedStart)
      : sandRun
        ? (sandRun.states[sandRun.states.length - 2] ?? sandboxStart)
        : run.states[Math.max(0, stepStart(Math.min(step, sandboxStep)) + cursor - 1)]!;
    const fresh = new Set(Object.keys(state.commits).filter((c) => !prev.commits[c]));
    const info: ViewInfo = { step, sandbox, last, fresh, t, lang };

    const mission = sandbox && missionIndex !== null ? missions[missionIndex] : undefined;
    const won = Boolean(mission && sandRun && mission.check({ start: sandboxStart, state, actions: moves, events: sandRun.events, states: sandRun.states }));
    useEffect(() => {
      if (won && mission) setMissionStars(config.slug, mission.id, starsFor(moves.length, mission.par));
    }, [won, mission, moves.length, setMissionStars]);
    const act = (a: GitAction) => {
      if (!won) setMoves((xs) => [...xs, a]);
    };

    const typedMoves = entries.reduce((n, e) => n + e.result.moves, 0);
    const typedWon = Boolean(
      scenario && typedRun && scenario.check({ start: typedStart, state, actions: typedActions, events: typedRun.events, states: typedRun.states }),
    );
    const sawAnswer = Boolean(scenario && hints >= scenario.hints.length);
    useEffect(() => {
      if (typedWon && scenario) setMissionStars(config.slug, scenario.id, scenarioStars(typedMoves, scenario.par, sawAnswer));
    }, [typedWon, scenario, typedMoves, sawAnswer, setMissionStars]);
    const runTyped = (line: string) => {
      const prompt = promptFor(state);
      const result: CliResult = line ? runLine(state, line) : { actions: [], output: [], moves: 0 };
      setEntries((xs) => [...xs, { prompt, line, result }]);
      setEditor(result.editor ?? null);
    };
    const saveEditor = (text: string) => {
      if (!editor) return;
      const result = editor.save(state, text);
      setEntries((xs) => [...xs, { prompt: "", line: null, result }]);
      setEditor(result.editor ?? null);
    };
    const cancelEditor = () => {
      setEntries((xs) => [...xs, { prompt: "", line: null, result: { actions: [], output: [{ text: "Aborted: the editor closed without saving.", tone: "dim" }], moves: 0 } }]);
      setEditor(null);
    };
    const undoTyped = () => {
      setEditor(null);
      setEntries((xs) => {
        let i = xs.length - 1;
        while (i > 0 && xs[i]!.line === null) i--;
        return xs.slice(0, Math.max(0, i));
      });
    };
    const termLog: TermLine[] = [];
    for (const e of entries) {
      if (e.result.clear) {
        termLog.length = 0;
        continue;
      }
      if (e.line !== null) termLog.push({ text: `${e.prompt} ${e.line}`, tone: "in" });
      termLog.push(...e.result.output);
    }

    const lines = shown.map((e) => describeGit(e, lang));
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
          <ScenarioPanel
            scenarios={scenarios}
            active={scenarioIndex}
            onSelect={pick}
            moves={typedMoves}
            won={typedWon}
            hints={hints}
            onHint={() => setHints((h) => h + 1)}
            best={best}
          />
          <div>
            <Terminal
              prompt={promptFor(state)}
              log={termLog}
              onRun={runTyped}
              history={entries.flatMap((e) => (e.line ? [e.line] : []))}
              onComplete={(input) => completeLine(state, input)}
              editor={editor ? { file: editor.file, text: editor.text, onSave: saveEditor, onCancel: cancelEditor } : null}
              disabled={typedWon}
              lockedText={t(ui.terminalLocked)}
            />
            <div className="terminal-tools">
              <button className="chip-btn" disabled={entries.length === 0 || typedWon} onClick={undoTyped}>
                <Icon name="undo" size={15} /> {t(ui.undoCommand)}
              </button>
              <button className="chip-btn" disabled={entries.length === 0} onClick={() => pick(scenarioIndex)}>
                <Icon name="reset" size={15} /> {t(ui.startOver)}
              </button>
            </div>
          </div>
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
        width={GIT_STAGE.width}
        height={GIT_STAGE.height}
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
  nothingTyped: l("Bir komut yaz; Git'in ne yaptığını burada sade bir dille gör.", "Type a command; see what Git did here, in plain words."),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
};
