import { useState } from "react";
import { useLang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import type { Lesson, LessonEntry, QuizQuestion } from "@lets-explain/core/course/types";
import { useCourse } from "@lets-explain/core/course/context";
import { lessonHref } from "@lets-explain/core/lib/router";
import { useGame } from "@lets-explain/core/lib/storage";
import { Icon } from "@lets-explain/core/components/Icon";
import { Stars } from "@lets-explain/core/components/MissionPanel";
import { Rich } from "@lets-explain/core/components/Rich";

interface Props {
  lesson: Lesson;
  next: LessonEntry | null;
  onReview: (step: number) => void;
}

export function Recap({ lesson, next, onReview }: Props) {
  const { t } = useLang();
  const courseId = useCourse().id;
  return (
    <div className="recap">
      <section className="recap-points card">
        <p className="eyebrow">{t(ui.lessonDone)}</p>
        <h2>{t(ui.recapTitle)}</h2>
        <ul>
          {lesson.recap.map((point, i) => (
            <li key={i}>
              <Rich text={t(point)} />
            </li>
          ))}
        </ul>
        <Score lesson={lesson} />
        {next && (
          <a className="btn btn-primary recap-next" href={lessonHref(courseId, next.slug)}>
            {t(ui.nextLesson)}: {t(next.title)} <Icon name="arrowRight" size={18} />
          </a>
        )}
      </section>

      <section className="quiz">
        <h2>{t(ui.quizTitle)}</h2>
        {lesson.quiz.map((q, i) => (
          <Question key={i} index={i} q={q} onReview={onReview} />
        ))}
      </section>
    </div>
  );
}

function Question({ q, index, onReview }: { q: QuizQuestion; index: number; onReview: (s: number) => void }) {
  const { t } = useLang();
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = picked === q.answer;

  return (
    <fieldset className="question card">
      <legend>
        <span className="question-num">{index + 1}</span>
        <Rich text={t(q.question)} />
      </legend>
      <div className="options">
        {q.options.map((opt, i) => {
          const state = !answered ? "" : i === q.answer ? "is-right" : i === picked ? "is-wrong" : "is-dim";
          return (
            <button key={i} className={`option ${state}`} onClick={() => setPicked(i)} disabled={answered}>
              <Rich text={t(opt)} />
            </button>
          );
        })}
      </div>
      {answered && (
        <div className={`feedback ${correct ? "is-right" : "is-wrong"}`} role="status">
          <strong>{t(correct ? ui.quizCorrect : ui.quizWrong)}</strong> <Rich text={t(q.explain)} />
          <div className="feedback-actions">
            {!correct && (
              <button className="link-btn" onClick={() => onReview(q.reviewStep)}>
                {t(ui.quizReview)}
              </button>
            )}
            <button className="link-btn" onClick={() => setPicked(null)}>
              {t(ui.tryAgain)}
            </button>
          </div>
        </div>
      )}
    </fieldset>
  );
}

/** Right guesses and mission stars for this lesson; hidden for lessons that have neither. */
function Score({ lesson }: { lesson: Lesson }) {
  const { t } = useLang();
  const { game } = useGame();
  const guesses = game.predictions[lesson.slug] ?? {};
  const asked = lesson.steps.flatMap((s, i) => (s.predict ? [{ i, answer: s.predict.answer }] : []));
  const right = asked.filter((p) => guesses[p.i] === p.answer).length;
  const missions = lesson.missions ?? [];
  const stars = missions.reduce((sum, m) => sum + (game.missions[lesson.slug]?.[m.id] ?? 0), 0);
  if (asked.length === 0 && missions.length === 0) return null;

  return (
    <div className="score">
      <h3>{t(ui.scoreTitle)}</h3>
      <div className="score-row">
        {asked.length > 0 && (
          <span className="score-pill">
            <Icon name="check" size={16} />
            {t(ui.scorePredictions)} <b>{right}/{asked.length}</b>
          </span>
        )}
        {missions.length > 0 && (
          <span className="score-pill">
            <Stars count={stars > 0 ? Math.min(3, Math.ceil((stars / (missions.length * 3)) * 3)) : 0} size={14} />
            {t(ui.scoreStars)} <b>{stars}/{missions.length * 3}</b>
          </span>
        )}
      </div>
    </div>
  );
}
