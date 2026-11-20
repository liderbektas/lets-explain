import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import type { TermLine } from "@lets-explain/core/lib/terminal";

export interface TerminalEditor {
  file: string;
  text: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

interface Props {
  prompt: string;
  /** Everything printed so far, typed lines included. */
  log: TermLine[];
  onRun: (line: string) => void;
  /** Earlier commands, oldest first, for ↑ and ↓. */
  history: string[];
  onComplete?: (input: string) => { input: string; options: string[] };
  /** A command opened an editor: it takes the terminal's place until saved or cancelled. */
  editor?: TerminalEditor | null;
  disabled?: boolean;
  /** Shown in the input while it is locked. */
  lockedText?: string;
  title?: string;
}

/**
 * A terminal the reader types into. It only reads and prints: a course's command line decides
 * what each command does, so the same terminal serves Git, Docker or Kafka.
 */
export function Terminal({ prompt, log, onRun, history, onComplete, editor, disabled, lockedText, title }: Props) {
  const { t } = useLang();
  const [input, setInput] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [back, setBack] = useState<number | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const screen = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = screen.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, options, editor]);

  useEffect(() => {
    if (!editor && !disabled) field.current?.focus({ preventScroll: true });
  }, [editor, disabled]);

  const submit = () => {
    const line = input.trim();
    setInput("");
    setOptions([]);
    setBack(null);
    onRun(line);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!history.length) return;
      e.preventDefault();
      const up = e.key === "ArrowUp";
      const at = back === null ? (up ? history.length - 1 : null) : back + (up ? -1 : 1);
      if (at === null || at >= history.length) {
        setBack(null);
        setInput("");
      } else {
        const i = Math.max(0, at);
        setBack(i);
        setInput(history[i]!);
      }
    } else if (e.key === "Tab" && onComplete) {
      e.preventDefault();
      const r = onComplete(input);
      setInput(r.input);
      setOptions(r.options);
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      setInput("");
      setOptions([]);
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      onRun("clear");
    } else if (options.length) setOptions([]);
  };

  return (
    <div className={`terminal ${disabled ? "is-locked" : ""}`} onClick={() => !editor && field.current?.focus({ preventScroll: true })}>
      <div className="terminal-bar" aria-hidden="true">
        <span className="terminal-dot is-red" />
        <span className="terminal-dot is-yellow" />
        <span className="terminal-dot is-green" />
        <span className="terminal-title">{editor ? `nano ${editor.file}` : (title ?? "bash")}</span>
      </div>
      {editor ? (
        <Editor editor={editor} />
      ) : (
        <>
          <div className="terminal-screen" ref={screen} role="log" aria-live="polite">
            {log.map((line, i) => (
              <div key={i} className={`term-line is-${line.tone}`}>
                {line.text || " "}
              </div>
            ))}
            {options.length > 0 && <div className="term-line is-dim">{options.join("   ")}</div>}
            <label className="term-input">
              <span className="term-prompt">{prompt}</span>
              <input
                ref={field}
                value={disabled ? "" : input}
                placeholder={disabled ? lockedText : undefined}
                onChange={(e) => {
                  setInput(e.target.value);
                  setBack(null);
                }}
                onKeyDown={onKey}
                disabled={disabled}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                aria-label={prompt}
              />
            </label>
          </div>
          <div className="terminal-foot">{t(ui.terminalHelp).replace(/`/g, "")}</div>
        </>
      )}
    </div>
  );
}

function Editor({ editor }: { editor: TerminalEditor }) {
  const { t } = useLang();
  const [text, setText] = useState(editor.text);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(editor.text);
    const el = area.current;
    if (el) {
      el.focus({ preventScroll: true });
      // Start at the top, where the message or the todo list goes.
      el.setSelectionRange(0, 0);
      el.scrollTop = 0;
    }
  }, [editor]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "o")) {
      e.preventDefault();
      editor.onSave(text);
    } else if (e.key === "Escape" || (e.ctrlKey && e.key === "x")) {
      e.preventDefault();
      editor.onCancel();
    }
  };

  return (
    <div className="term-editor">
      <textarea ref={area} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} spellCheck={false} aria-label={editor.file} />
      <div className="term-editor-keys">
        <button type="button" className="chip-btn is-go" onClick={() => editor.onSave(text)}>
          {t(ui.editorSave)} <kbd>Ctrl S</kbd>
        </button>
        <button type="button" className="chip-btn" onClick={editor.onCancel}>
          {t(ui.editorCancel)} <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
