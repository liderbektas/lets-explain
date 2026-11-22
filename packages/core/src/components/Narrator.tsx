import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { ui } from "@lets-explain/core/i18n/ui";
import { useLang } from "@lets-explain/core/i18n";
import { clipDir, clipName, listenMinutes, type NarrationLine, type StepNarration } from "@lets-explain/core/course/narration";
import type { Lesson } from "@lets-explain/core/course/types";

/**
 * Plays a lesson's narration, one clip per line, and tells the scene how far to play.
 *
 * A step is told in parts. A prediction step first asks its question and waits; once the learner
 * answers, it reacts (right or wrong) and explains while the scene plays. Each line may cue a scene
 * action as it starts, and the scene does not run ahead of the words. Moving to another step stops
 * the current line and starts that step; the learner decides when to move on.
 */

interface Options {
  lesson: Lesson;
  courseId: string;
  /** The current step, or null on the recap. */
  step: number | null;
  /** The learner's guess on this step's prediction, if it has one and they have guessed. */
  picked: number | undefined;
  paused: boolean;
  replayKey: number;
}

export interface Narration {
  /** This lesson has narration in the current language and its audio is there. */
  available: boolean;
  /** Narration exists but its audio has not been generated (shown in development only). */
  missing: boolean;
  on: boolean;
  start: () => void;
  stop: () => void;
  /** How many of the step's actions the scene shows, or null to let it play on its own. */
  cursor: number | null;
  /** The line being spoken, for the caption. */
  caption: string | null;
  /** Which line of the current part this is (1-based), and how many it has. */
  lineNo: number;
  lineCount: number;
  /** About how many minutes the whole lesson takes to listen to. */
  minutes: number;
  /** The element the voice plays through, so the caption can follow it without re-rendering the page. */
  audio: HTMLAudioElement | null;
  /** The current step has been told to the end. */
  finished: boolean;
}

/**
 * Where the clips are served from. Empty in development (the site's own /audio folder); in the
 * live build, the public address of the storage bucket, set as VITE_AUDIO_BASE when building.
 */
const AUDIO_BASE = String(import.meta.env.VITE_AUDIO_BASE ?? "").replace(/\/+$/, "");

type Part = { id: string; lines: NarrationLine[] };

/** What to say now on a step: the question, the answer part, or the whole step. */
function partOf(script: StepNarration, picked: number | undefined, askedHere: boolean, right: boolean): Part {
  if (!script.answer) return { id: "all", lines: script.lines };
  if (picked === undefined) return { id: "ask", lines: script.lines };
  // A reaction only makes sense right after the question; coming back to an answered step, just explain.
  const react = askedHere ? [{ say: right ? script.answer.right : script.answer.wrong }] : [];
  return { id: "answer", lines: [...react, ...script.answer.lines] };
}

const absolute = (url: string) => new URL(url, window.location.href).href;

export function useNarration({ lesson, courseId, step, picked, paused, replayKey }: Options): Narration {
  const { lang } = useLang();
  const steps = lesson.narration?.[lang];
  const urlOf = useCallback(
    (text: string) => `${AUDIO_BASE}/${clipDir(courseId, lesson.slug, lang)}/${clipName(text, lang)}.mp3`,
    [courseId, lesson.slug, lang],
  );

  // Is the audio really there? Ask for the first clip once per lesson and language.
  const [audioState, setAudioState] = useState<{ key: string; ok: boolean } | null>(null);
  const firstLine = steps?.[0]?.lines[0]?.say;
  const audioKey = `${courseId}/${lesson.slug}/${lang}`;
  useEffect(() => {
    if (!firstLine) return;
    // Probe with an audio element rather than fetch: it needs no CORS when the clips live on
    // another host, and an HTML page served in place of a missing clip fails to load as audio.
    let live = true;
    const probe = new Audio();
    probe.preload = "metadata";
    probe.onloadedmetadata = () => live && setAudioState({ key: audioKey, ok: true });
    probe.onerror = () => live && setAudioState({ key: audioKey, ok: false });
    probe.src = urlOf(firstLine);
    return () => {
      live = false;
      probe.removeAttribute("src");
    };
  }, [audioKey, firstLine, urlOf]);
  const checked = audioState?.key === audioKey ? audioState.ok : null;
  const available = Boolean(steps) && checked === true;

  const [on, setOn] = useState(false);
  // If the browser refuses to play sound (no click yet), stop and show the button again rather than hang.
  const blocked = useCallback((e: unknown) => {
    if (e instanceof DOMException && e.name === "NotAllowedError") setOn(false);
  }, []);
  const audio = useRef<HTMLAudioElement | null>(null);
  const preload = useRef<HTMLAudioElement | null>(null);
  if (typeof window !== "undefined" && !audio.current) audio.current = new Audio();

  // Remember the step whose question was asked aloud, so the answer can react to the guess.
  const asked = useRef<string | null>(null);
  const stepKey = `${lesson.slug}-${step}`;
  const lastStep = useRef(stepKey);
  if (lastStep.current !== stepKey) {
    lastStep.current = stepKey;
    asked.current = null;
  }
  const script = on && available && step !== null ? steps?.[step] : undefined;
  const predict = step !== null ? lesson.steps[step]?.predict : undefined;
  const part = script ? partOf(script, picked, asked.current === stepKey, picked === predict?.answer) : null;
  const partKey = part ? `${stepKey}-${part.id}-${replayKey}-${lang}` : null;
  if (part?.id === "ask") asked.current = stepKey;

  const [pos, setPos] = useState<{ key: string | null; index: number }>({ key: null, index: 0 });
  const index = pos.key === partKey ? pos.index : 0;
  const line = part?.lines[index];
  const finished = Boolean(part) && index >= part!.lines.length;

  // Play the current line; when it ends, move to the next one.
  const say = line?.say;
  const nextSay = part?.lines[index + 1]?.say;
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    if (!say) {
      el.pause();
      return;
    }
    const url = absolute(urlOf(say));
    if (el.src !== url) el.src = url;
    const next = () => setPos({ key: partKey, index: index + 1 });
    el.onended = next;
    // A clip that will not load is skipped rather than stopping the lesson.
    el.onerror = () => {
      console.warn(`Narration clip missing: ${url}`);
      next();
    };
    if (paused) el.pause();
    else el.play().catch(blocked);
    if (nextSay) {
      preload.current ??= new Audio();
      preload.current.preload = "auto";
      preload.current.src = absolute(urlOf(nextSay));
    }
    return () => {
      el.onended = null;
      el.onerror = null;
    };
  }, [partKey, index, say, nextSay, paused, urlOf, blocked]);

  useEffect(() => {
    if (!on) audio.current?.pause();
  }, [on]);

  useEffect(() => () => audio.current?.pause(), []);

  const start = useCallback(() => {
    // Start the first clip inside the click itself: some browsers only allow sound that a tap began.
    const first = step !== null ? steps?.[step] : undefined;
    const el = audio.current;
    if (el && first) {
      const firstPart = partOf(first, picked, false, false);
      const say = firstPart.lines[0]?.say;
      if (say) {
        el.src = absolute(urlOf(say));
        el.play().catch(blocked);
      }
    }
    // Always from the top of the step, not from wherever an earlier start stopped.
    setPos({ key: null, index: 0 });
    setOn(true);
  }, [step, steps, picked, urlOf, blocked]);

  const stop = useCallback(() => {
    audio.current?.pause();
    setOn(false);
  }, []);

  // The scene shows every action cued so far; a finished part shows them all.
  let cursor: number | null = null;
  if (part) {
    if (finished) cursor = Number.MAX_SAFE_INTEGER;
    else {
      cursor = 0;
      for (let i = 0; i <= index; i++) {
        const cue = part.lines[i]?.cue;
        if (cue !== undefined) cursor = Math.max(cursor, cue + 1);
      }
    }
  }

  return {
    available,
    missing: Boolean(steps) && checked === false,
    on,
    start,
    stop,
    cursor,
    caption: line?.say ?? null,
    lineNo: index + 1,
    lineCount: part?.lines.length ?? 0,
    audio: audio.current,
    minutes: steps ? listenMinutes(steps) : 0,
    // After a question the narrator waits for the guess; that is not the end of the step.
    finished: on && finished && part?.id !== "ask",
  };
}

/**
 * The subtitle under the scene: who is speaking, how far into the step, the sentence, and a bar
 * that fills as the sentence plays. The bars on the badge move only while sound is coming out.
 * It listens to the audio element itself, so following the voice never re-renders the lesson.
 */
export function NarrationCaption({ narration, paused, onTogglePause }: { narration: Narration; paused: boolean; onTogglePause: () => void }) {
  const { t } = useLang();
  const { audio, caption, finished, lineNo, lineCount } = narration;
  const [speaking, setSpeaking] = useState(false);
  const fill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!audio) return;
    const sync = () => setSpeaking(!audio.paused && !audio.ended && audio.readyState > 2);
    const events = ["play", "playing", "pause", "ended", "waiting", "emptied"] as const;
    for (const e of events) audio.addEventListener(e, sync);
    sync();
    let frame = 0;
    const tick = () => {
      const d = audio.duration;
      if (fill.current) fill.current.style.transform = `scaleX(${d > 0 && Number.isFinite(d) ? Math.min(1, audio.currentTime / d) : 0})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      for (const e of events) audio.removeEventListener(e, sync);
    };
  }, [audio]);

  const show = narration.on && (caption !== null || finished);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className={`narration-caption ${finished ? "is-done" : speaking ? "is-speaking" : ""}`}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
        >
          {finished ? (
            <span className="nc-badge" aria-hidden="true">
              <Icon name="arrowRight" size={20} />
            </span>
          ) : (
            // Pointing at the badge offers pause (or play); the bars show whether the voice is on.
            <button
              className={`nc-badge ${paused ? "is-paused" : ""}`}
              onClick={onTogglePause}
              aria-label={t(paused ? ui.play : ui.pause)}
              title={`${t(paused ? ui.play : ui.pause)} (Space)`}
            >
              <span className="nc-bars" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="nc-icon" aria-hidden="true">
                <Icon name={paused ? "play" : "pause"} size={20} />
              </span>
            </button>
          )}
          <div className="nc-body">
            <span className="nc-meta">
              {t(ui.narrator)}
              {!finished && lineCount > 0 && (
                <span className="nc-count">
                  {lineNo}/{lineCount}
                </span>
              )}
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={finished ? "done" : caption}
                className="nc-text"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
              >
                {finished ? t(ui.narrationDone) : caption}
              </motion.p>
            </AnimatePresence>
          </div>
          {!finished && (
            <span className="nc-progress" aria-hidden="true">
              <span ref={fill} />
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
