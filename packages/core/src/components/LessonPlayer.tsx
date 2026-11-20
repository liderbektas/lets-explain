import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useLang, type L } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import type { Change, Lesson, LessonEntry, Practice } from "@lets-explain/core/course/types";
import { useCourse } from "@lets-explain/core/course/context";
import { courseHref, lessonHref, replaceRoute } from "@lets-explain/core/lib/router";
import { useGame, useProgress } from "@lets-explain/core/lib/storage";
import { Callout } from "@lets-explain/core/components/Callout";
import { Icon } from "@lets-explain/core/components/Icon";
import { Recap } from "@lets-explain/core/components/Recap";
import { Rich } from "@lets-explain/core/components/Rich";
import { SceneBoundary } from "@lets-explain/core/components/SceneBoundary";

interface Props {
  lesson: Lesson;
  chapterTitle: L;
  chapterNumber: number;
  lessonInChapter: number;
  lessonsInChapter: number;
  step: number;
  next: LessonEntry | null;
}

export function LessonPlayer(props: Props) {
  const { lesson, chapterTitle, lessonInChapter, step: routeStep, next } = props;
  const { t } = useLang();
  const { id: courseId, name: courseName } = useCourse();
  const { markReached, markDone } = useProgress();
  const { game, setPrediction, forgetPrediction } = useGame();
  const [paused, setPaused] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  const last = lesson.steps.length; // the recap comes after the last step
  const step = Math.min(Math.max(routeStep, 0), last);
  const isRecap = step === last;
  const current = lesson.steps[Math.min(step, last - 1)]!;
  const { Scene } = lesson;

  // A step with a prediction holds its scene until the reader has guessed.
  const predict = isRecap ? undefined : current.predict;
  const picked = predict ? game.predictions[lesson.slug]?.[step] : undefined;
  const waiting = Boolean(predict) && picked === undefined;
  const guess = useCallback((i: number) => setPrediction(lesson.slug, step, i), [setPrediction, lesson.slug, step]);

  const go = useCallback(
    (n: number) => replaceRoute(lessonHref(courseId, lesson.slug, Math.min(Math.max(n, 0), last))),
    [courseId, lesson.slug, last],
  );
  const replay = useCallback(() => {
    setPaused(false);
    setReplayKey((k) => k + 1);
  }, []);

  useEffect(() => {
    markReached(lesson.slug, step);
    if (isRecap) {
      markDone(lesson.slug);
      window.scrollTo({ top: 0 });
    }
    setPaused(false);
  }, [lesson.slug, step, isRecap, markReached, markDone]);

  useEffect(() => {
    document.title = `${t(lesson.title)} · ${courseName}`;
  }, [lesson.title, t, courseName]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (waiting && predict && n >= 1 && n <= predict.options.length) guess(n - 1);
      else if (e.key === "ArrowRight") go(step + 1);
      else if (e.key === "ArrowLeft") go(step - 1);
      else if (e.key === "r" || e.key === "R") replay();
      else if (e.key === " " && !el.closest("button, a")) {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, step, replay, waiting, predict, guess]);

  const changes: Change[] = isRecap ? [] : (current.changes ?? lesson.changesFor?.(step) ?? []);
  const nextShort = step < last - 1 ? lesson.steps[step + 1]!.short : ui.recap;
  const shorts = [...lesson.steps.map((s) => s.short), ui.recap];

  const controls = (
    <div className="stage-controls">
      <button className="round-btn" onClick={replay} aria-label={t(ui.replay)} title={`${t(ui.replay)} (R)`}>
        <Icon name="reset" size={18} />
      </button>
      <button
        className="round-btn"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={t(paused ? ui.play : ui.pause)}
        title={`${t(paused ? ui.play : ui.pause)} (Space)`}
      >
        <Icon name={paused ? "play" : "pause"} size={18} />
      </button>
    </div>
  );

  return (
    <article className={`lesson ${isRecap ? "is-recap" : ""}`}>
      <header className="lesson-bar">
        <a className="round-btn" href={courseHref(courseId)} aria-label={t(ui.map)} title={t(ui.map)}>
          <Icon name="arrowLeft" size={18} />
        </a>
        <div className="lesson-name">
          <p>
            {t(chapterTitle)} · {t(ui.lesson)} {lessonInChapter}
          </p>
          <h1>{t(lesson.title)}</h1>
        </div>
        <div className="path" aria-label={t(ui.step)}>
          <div className="path-track">
            <div className="path-fill" style={{ width: `${(step / last) * 100}%` }} />
          </div>
          <ol>
            {shorts.map((short, i) => (
              <li key={i} style={{ left: `${(i / last) * 100}%` }}>
                <button
                  className={`path-dot ${i === step ? "is-current" : ""} ${i < step ? "is-past" : ""} ${i === last ? "is-goal" : ""}`}
                  onClick={() => go(i)}
                  aria-current={i === step ? "step" : undefined}
                  aria-label={`${i + 1}. ${t(short)}`}
                >
                  {i === last ? <Icon name="flag" size={12} /> : i === step ? i + 1 : null}
                  <span className="path-tip">{t(short)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <span className="soft-chip">
          <Icon name="clock" size={15} /> {lesson.minutes} {t(ui.minutes)}
        </span>
      </header>

      {isRecap ? (
        <Recap lesson={lesson} next={next} onReview={go} />
      ) : (
        <div className="lesson-grid">
          <section className="guide">
            <div className="speech">
              <div className="speech-top">
                {waiting ? (
                  <span className="tag tag-predict">{t(ui.predictTag)}</span>
                ) : (
                  <span className={`tag tag-${current.tag}`}>{t(ui.tags[current.tag])}</span>
                )}
                <span className="step-no">
                  {step + 1} / {last}
                </span>
              </div>
              <div className="speech-body">
              <AnimatePresence mode="wait" initial={false}>
                {waiting && predict ? (
                  <motion.div
                    key={`${step}-guess`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <h2>
                      <Rich text={t(predict.question)} />
                    </h2>
                    <p className="predict-lead">{t(ui.predictLead)}</p>
                    <div className="options predict-options">
                      {predict.options.map((opt, i) => (
                        <button key={i} className="option" onClick={() => guess(i)}>
                          <span className="option-key">{i + 1}</span>
                          <Rich text={t(opt)} />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {predict && picked !== undefined && (
                    <PredictResult
                      right={picked === predict.answer}
                      guess={predict.options[picked] ?? predict.options[0]!}
                      why={predict.why}
                      onAgain={() => forgetPrediction(lesson.slug, step)}
                    />
                  )}
                  <h2>{t(current.title)}</h2>
                  {current.body.map((p, i) => (
                    <p key={i}>
                      <Rich text={t(p)} />
                    </p>
                  ))}
                  {step === 0 && (
                    <div className="goals">
                      <p>{t(ui.objectivesIntro)}</p>
                      <ul>
                        {lesson.objectives.map((o, i) => (
                          <li key={i}>{t(o.text)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {current.callouts?.map((c, i) => <Callout key={i} kind={c.kind} text={c.text} />)}
                  {current.practice && <PracticeCard practice={current.practice} />}
                  {changes.length > 0 && (
                    <div className="changes">
                      <h3>{t(ui.whatChanged)}</h3>
                      <ul>
                        {changes.map((c, i) => (
                          <li key={i} className={`change change-${c.kind}`}>
                            <Rich text={t(c.text)} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
                )}
              </AnimatePresence>
              </div>
              <div className="guide-nav">
                <button className="btn" onClick={() => go(step - 1)} disabled={step === 0} aria-label={t(ui.prev)}>
                  <Icon name="arrowLeft" size={18} />
                </button>
                <button className="btn btn-primary" onClick={() => go(step + 1)}>
                  <span className="next-label">
                    <b>{t(ui.continue)}</b>
                    <small>{t(nextShort)}</small>
                  </span>
                  <Icon name="arrowRight" size={18} />
                </button>
              </div>
            </div>
            <p className="key-hints">
              {waiting && predict && (
                <>
                  <kbd>1</kbd>–<kbd>{predict.options.length}</kbd> {t(ui.predictKeys)} ·{" "}
                </>
              )}
              <kbd>←</kbd> <kbd>→</kbd> {t(ui.keys)} · <kbd>R</kbd> {t(ui.keyReplay)} · <kbd>Space</kbd> {t(ui.keyPause)}
            </p>
          </section>

          <section className={`stage ${paused ? "is-paused" : ""}`}>
            <SceneBoundary key={step} message={t(ui.sceneError)}>
              <Scene step={step} paused={paused || waiting} replayKey={replayKey} controls={controls} />
            </SceneBoundary>
            <AnimatePresence>
              {waiting && (
                <motion.div
                  className="stage-wait"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  <Icon name="arrowLeft" size={16} /> {t(ui.predictWaiting)}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      )}
    </article>
  );
}

function PredictResult({ right, guess, why, onAgain }: { right: boolean; guess: L; why: L; onAgain: () => void }) {
  const { t } = useLang();
  return (
    <div className={`predict-result ${right ? "is-right" : "is-wrong"}`} role="status">
      <span className="predict-badge" aria-hidden="true">
        <Icon name={right ? "check" : "close"} size={18} />
      </span>
      <div>
        <strong>{t(right ? ui.predictRight : ui.predictWrong)}</strong>{" "}
        <span className="predict-guess">
          {t(ui.predictYours)}: <Rich text={t(guess)} />
        </span>
        <p>
          <Rich text={t(why)} />
        </p>
        <button className="link-btn" onClick={onAgain}>
          {t(ui.predictAgain)}
        </button>
      </div>
    </div>
  );
}

/** The real commands for this step, in a terminal-style card with a copy button per line. */
function PracticeCard({ practice }: { practice: Practice }) {
  const { t } = useLang();
  const [copied, setCopied] = useState<number | null>(null);
  const copy = (i: number, cmd: string) => {
    navigator.clipboard?.writeText(cmd).then(
      () => {
        setCopied(i);
        setTimeout(() => setCopied((c) => (c === i ? null : c)), 1400);
      },
      () => {},
    );
  };
  return (
    <div className="practice">
      <div className="practice-head">
        <span className="practice-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <b>{t(ui.practiceTitle)}</b>
      </div>
      {practice.intro && (
        <p className="practice-intro">
          <Rich text={t(practice.intro)} />
        </p>
      )}
      <ul>
        {practice.commands.map((c, i) => (
          <li key={i}>
            <div className="practice-line">
              <code>
                <span className="prompt">$</span> {c.cmd}
              </code>
              <button className="practice-copy" onClick={() => copy(i, c.cmd)} aria-label={t(ui.copy)} title={t(ui.copy)}>
                {copied === i ? <Icon name="check" size={14} /> : <Icon name="copy" size={14} />}
              </button>
            </div>
            {c.note && (
              <p className="practice-note">
                <Rich text={t(c.note)} />
              </p>
            )}
          </li>
        ))}
      </ul>
      {practice.snippets?.map((sn, i) => (
        <div key={sn.label} className="practice-snippet">
          <div className="practice-snippet-head">
            <span>{sn.label}</span>
            <button className="practice-copy" onClick={() => copy(100 + i, sn.code)} aria-label={t(ui.copy)} title={t(ui.copy)}>
              {copied === 100 + i ? <Icon name="check" size={14} /> : <Icon name="copy" size={14} />}
            </button>
          </div>
          <pre>
            <code>{sn.code}</code>
          </pre>
          {sn.note && (
            <p className="practice-note">
              <Rich text={t(sn.note)} />
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
