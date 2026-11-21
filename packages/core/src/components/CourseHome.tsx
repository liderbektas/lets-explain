import { allLessons, useCourse } from "../course/context";
import { l, useLang } from "../i18n";
import { ui } from "../i18n/ui";
import { lessonHref } from "../lib/router";
import { resumeStep, useProgress } from "../lib/storage";
import { ChapterCube } from "./CourseDrawer";
import { HowItWorks } from "./HowItWorks";
import { Credit } from "./Credit";
import { Icon } from "./Icon";

const copy = {
  how: l("Nasıl çalışır?", "How it works"),
  outline: l("Ders planı", "Course outline"),
  lessons: l("ders", "lessons"),
  chapters: l("bölüm", "chapters"),
  predictions: l("tahmin sorusu", "predictions"),
  missions: l("senaryo", "scenarios"),
  progress: l("ilerlemen", "your progress"),
  done: l("bitti", "done"),
  next: l("Sıradaki", "Next up"),
};

/** A course's front page: hero with what is inside, how it works, and the lesson outline. */
export function CourseHome() {
  const course = useCourse();
  const { t } = useLang();
  const { progress } = useProgress();
  const entries = allLessons(course).map((x) => x.entry);
  const written = entries.filter((e) => e.lesson);
  const doneCount = written.filter((e) => progress.done[e.slug]).length;
  const started = Object.keys(progress.reached).length > 0;
  const resume =
    entries.find((e) => e.lesson && !progress.done[e.slug] && progress.reached[e.slug] !== undefined) ??
    entries.find((e) => e.lesson && !progress.done[e.slug]) ??
    entries[0]!;
  const [before, highlight, after] = course.home.title;
  const { Art } = course.home;

  const predictions = written.reduce((n, e) => n + e.lesson!.steps.filter((s) => s.predict).length, 0);
  const missions = written.reduce((n, e) => n + (e.lesson!.missions?.length ?? 0), 0);
  const stats = [
    { value: written.length, label: copy.lessons },
    { value: course.chapters.length, label: copy.chapters },
    { value: predictions, label: copy.predictions },
    { value: missions, label: copy.missions },
  ];

  return (
    <div className="home">
      <section className="hero">
        <div>
          <h1>
            {t(before)} <em>{t(highlight)}</em> {t(after)}
          </h1>
          <p className="lead">{t(course.home.lead)}</p>
          <ul className="stat-row">
            {stats.map((s) => (
              <li key={s.label.en}>
                <b>{s.value}</b> {t(s.label)}
              </li>
            ))}
          </ul>
          <div className="hero-actions">
            <a
              className="btn btn-primary"
              href={lessonHref(course.id, resume.slug, resumeStep(progress, resume.slug, resume.lesson?.steps.length ?? 1))}
            >
              {t(started ? ui.continue : ui.start)}: {t(resume.title)}
              <Icon name="arrowRight" />
            </a>
            {started && (
              <div className="progress-meter" aria-label={t(copy.progress)}>
                <span>
                  {doneCount}/{written.length} {t(copy.done)}
                </span>
                <div className="meter">
                  <div style={{ width: `${(doneCount / Math.max(written.length, 1)) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="hero-art card">
          <Art />
        </div>
      </section>

      <HowItWorks title={copy.how} />

      <section className="outline">
        <h2>{t(copy.outline)}</h2>
        <div className="outline-grid">
          {course.chapters.map((chapter, ci) => {
            const lessons = chapter.lessons.filter((e) => e.lesson);
            const done = lessons.filter((e) => progress.done[e.slug]).length;
            return (
              <div key={chapter.id} className={`outline-chapter card ${done === lessons.length && done > 0 ? "is-complete" : ""}`}>
                <h3>
                  <ChapterCube index={ci} size={26} />
                  <span>
                    <small>{String(ci + 1).padStart(2, "0")}</small>
                    {t(chapter.title)}
                  </span>
                  <em>
                    {done}/{chapter.lessons.length}
                  </em>
                </h3>
                <ol>
                  {chapter.lessons.map((entry) => {
                    const isDone = progress.done[entry.slug];
                    const isNext = entry.slug === resume.slug && !isDone;
                    return (
                      <li key={entry.slug} className={`${entry.lesson ? "" : "is-soon"} ${isNext ? "is-next" : ""}`}>
                        <span className={`nav-state ${isDone ? "is-done" : ""}`}>{isDone && <Icon name="check" size={12} />}</span>
                        {entry.lesson ? (
                          <a href={lessonHref(course.id, entry.slug, resumeStep(progress, entry.slug, entry.lesson.steps.length))}>
                            {t(entry.title)}
                          </a>
                        ) : (
                          <span>{t(entry.title)}</span>
                        )}
                        {isNext && <span className="next-chip">{t(copy.next)}</span>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      </section>
      <Credit />
    </div>
  );
}
