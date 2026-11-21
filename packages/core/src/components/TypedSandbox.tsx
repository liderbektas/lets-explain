import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { ScenarioPanel } from "@lets-explain/core/components/ScenarioPanel";
import { Terminal } from "@lets-explain/core/components/Terminal";
import { scenarioStars, type Scenario } from "@lets-explain/core/course/types";
import { useLang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import type { TermLine } from "@lets-explain/core/lib/terminal";
import { useGame } from "@lets-explain/core/lib/storage";

/**
 * The try-it step played by typing. A course brings its command line (what a typed line does
 * to its model) and its scenarios; this runs the terminal, the scenario picker, hints, stars
 * and undo, and hands back the state to draw.
 */

/** What one typed line did. Replaying `actions` on the state before gives the state after. */
export interface ShellResult<A, S> {
  actions: A[];
  output: TermLine[];
  /** Commands that changed something; stars count these. */
  moves: number;
  /** The command opened an editor (`nano file`, `git commit` with no -m). */
  editor?: ShellEditor<A, S>;
  clear?: boolean;
}

export interface ShellEditor<A, S> {
  file: string;
  text: string;
  /** Runs with the saved text, on the state as it was when the editor opened. */
  save: (state: S, text: string) => ShellResult<A, S>;
}

export interface CommandLine<A, S> {
  run: (state: S, line: string) => ShellResult<A, S>;
  prompt: (state: S) => string;
  complete?: (state: S, input: string) => { input: string; options: string[] };
  /** Ctrl+C: stops what holds the terminal (an interactive client). Without it Ctrl+C only clears the line. */
  interrupt?: (state: S) => ShellResult<A, S>;
  /** The terminal window's title, e.g. "bash". */
  title?: string;
}

/** One typed line and what it did; an editor's save is its own entry, with no line. */
interface Entry<A, S> {
  prompt: string;
  line: string | null;
  result: ShellResult<A, S>;
}

export interface TypedSandboxOptions<A, S, R, C> {
  /** Lesson slug: where the stars are kept. */
  slug: string;
  /** False on every step but the try-it one; the hook then does nothing. */
  active: boolean;
  scenarios: Scenario<C, S>[];
  /** Free play starts here. */
  freeStart: S;
  shell: CommandLine<A, S>;
  /** Plays actions from a start: whatever the scene needs (states, events…). */
  replay: (start: S, actions: A[]) => R;
  /** The state after a replay. */
  final: (run: R) => S;
  /** What a scenario's check sees. */
  context: (start: S, actions: A[], run: R) => C;
}

export interface TypedSandbox<S, R> {
  /** Null when the hook is not active. */
  run: R | null;
  state: S | null;
  start: S;
  panel: ReactNode;
  /** The terminal with its undo and start-over buttons. */
  terminal: ReactNode;
}

export function useTypedSandbox<A, S, R, C>(o: TypedSandboxOptions<A, S, R, C>): TypedSandbox<S, R> {
  const { t } = useLang();
  const { game, setMissionStars } = useGame();
  const best = game.missions[o.slug] ?? {};
  const [index, setIndex] = useState<number | null>(() => {
    const i = o.scenarios.findIndex((s) => !best[s.id]);
    return o.scenarios.length ? (i < 0 ? 0 : i) : null;
  });
  const [entries, setEntries] = useState<Entry<A, S>[]>([]);
  const [editor, setEditor] = useState<ShellEditor<A, S> | null>(null);
  const [hints, setHints] = useState(0);

  const scenario = o.active && index !== null ? o.scenarios[index] : undefined;
  const start = scenario ? scenario.start : o.freeStart;
  const actions = useMemo(() => entries.flatMap((e) => e.result.actions), [entries]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useMemo(() => (o.active ? o.replay(start, actions) : null), [o.active, start, actions]);
  const state = run ? o.final(run) : null;
  const moves = entries.reduce((n, e) => n + e.result.moves, 0);
  const won = Boolean(scenario && run && scenario.check(o.context(start, actions, run)));
  const sawAnswer = Boolean(scenario && hints >= scenario.hints.length);

  useEffect(() => {
    if (won && scenario) setMissionStars(o.slug, scenario.id, scenarioStars(moves, scenario.par, sawAnswer));
  }, [won, scenario, moves, sawAnswer, setMissionStars, o.slug]);

  const pick = (i: number | null) => {
    setIndex(i);
    setEntries([]);
    setEditor(null);
    setHints(0);
  };
  const runLine = (line: string) => {
    if (!state) return;
    const prompt = o.shell.prompt(state);
    const result: ShellResult<A, S> = line ? o.shell.run(state, line) : { actions: [], output: [], moves: 0 };
    setEntries((xs) => [...xs, { prompt, line, result }]);
    setEditor(result.editor ?? null);
  };
  const interrupt = () => {
    if (!state || !o.shell.interrupt) return;
    const prompt = o.shell.prompt(state);
    const result = o.shell.interrupt(state);
    setEntries((xs) => [...xs, { prompt, line: "^C", result }]);
    setEditor(null);
  };
  const save = (text: string) => {
    if (!editor || !state) return;
    const result = editor.save(state, text);
    setEntries((xs) => [...xs, { prompt: "", line: null, result }]);
    setEditor(result.editor ?? null);
  };
  const cancel = () => {
    setEntries((xs) => [...xs, { prompt: "", line: null, result: { actions: [], output: [{ text: "Aborted: the editor closed without saving.", tone: "dim" }], moves: 0 } }]);
    setEditor(null);
  };
  const undo = () => {
    setEditor(null);
    setEntries((xs) => {
      let i = xs.length - 1;
      while (i > 0 && xs[i]!.line === null) i--;
      return xs.slice(0, Math.max(0, i));
    });
  };

  if (!o.active || !state) return { run: null, state: null, start, panel: null, terminal: null };

  const log: TermLine[] = [];
  for (const e of entries) {
    if (e.result.clear) {
      log.length = 0;
      continue;
    }
    if (e.line !== null) log.push({ text: `${e.prompt} ${e.line}`, tone: "in" });
    log.push(...e.result.output);
  }

  const panel = (
    <ScenarioPanel
      scenarios={o.scenarios}
      active={index}
      onSelect={pick}
      moves={moves}
      won={won}
      hints={hints}
      onHint={() => setHints((h) => h + 1)}
      best={best}
    />
  );
  const terminal = (
    <div>
      <Terminal
        prompt={o.shell.prompt(state)}
        log={log}
        onRun={runLine}
        history={entries.flatMap((e) => (e.line && e.line !== "^C" ? [e.line] : []))}
        onComplete={o.shell.complete ? (input) => o.shell.complete!(state, input) : undefined}
        onInterrupt={o.shell.interrupt ? interrupt : undefined}
        editor={editor ? { file: editor.file, text: editor.text, onSave: save, onCancel: cancel } : null}
        disabled={won}
        lockedText={t(ui.terminalLocked)}
        title={o.shell.title}
      />
      <div className="terminal-tools">
        <button className="chip-btn" disabled={entries.length === 0 || won} onClick={undo}>
          <Icon name="undo" size={15} /> {t(ui.undoCommand)}
        </button>
        <button className="chip-btn" disabled={entries.length === 0} onClick={() => pick(index)}>
          <Icon name="reset" size={15} /> {t(ui.startOver)}
        </button>
      </div>
    </div>
  );
  return { run, state, start, panel, terminal };
}

/**
 * Plays typed lines without a screen, the way a reader would, saving each editor with the next
 * of `edits`. For scenario tests in every course.
 */
export function typeLines<A, S>(
  shell: Pick<CommandLine<A, S>, "run" | "interrupt">,
  apply: (state: S, actions: A[]) => S,
  start: S,
  typed: string[],
  edits: ((text: string) => string)[] = [],
): { actions: A[]; moves: number; output: string[]; state: S } {
  let state = start;
  const actions: A[] = [];
  const output: string[] = [];
  let moves = 0;
  const settle = (r: ShellResult<A, S>) => {
    actions.push(...r.actions);
    output.push(...r.output.map((l) => l.text));
    moves += r.moves;
    state = apply(state, r.actions);
    if (r.editor) {
      const edit = edits.shift();
      if (!edit) throw new Error(`an editor for ${r.editor.file} was left open`);
      settle(r.editor.save(state, edit(r.editor.text)));
    }
  };
  // "^C" stands for pressing Ctrl+C.
  for (const line of typed) settle(line === "^C" && shell.interrupt ? shell.interrupt(state) : shell.run(state, line));
  return { actions, moves, output, state };
}
