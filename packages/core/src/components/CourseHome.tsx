import { allLessons, useCourse } from "../course/context";
import { l, useLang } from "../i18n";
import { ui } from "../i18n/ui";
import { lessonHref } from "../lib/router";
import { resumeStep, useProgress } from "../lib/storage";
import { ChapterCube } from "./CourseDrawer";
import { Icon } from "./Icon";
import { Rich } from "./Rich";

const copy = {
  interactive: l("interaktif kurs", "interactive course"),
  how: l("Nasıl çalışır?", "How it works"),
  howItems: [
    l("**İleri** dedikçe sahne bir adım ilerler. Acele yok, istediğin kadar geri dön.", "Press **Next** and the scene moves one step. No rush: go back as often as you like."),
    l("Bazı adımlarda önce **tahmin edersin**, sonra sahnede gerçekte ne olduğunu izlersin.", "On some steps you **guess first**, then watch what really happens on stage."),
    l("Her ders **görevlerle** biter. Az hamleyle çözersen 3 yıldız alırsın.", "Every lesson ends with **missions**. Solve them in few moves for 3 stars."),
  ],
  outline: l("Ders planı", "Course outline"),
};

/** A course's front page: hero, how it works, and the lesson outline. */
export function CourseHome() {
  const course = useCourse();
  const { t } = useLang();
  const { progress } = useProgress();
  const entries = allLessons(course).map((x) => x.entry);
  const started = Object.keys(progress.reached).length > 0;
  const resume =
    entries.find((e) => e.lesson && !progress.done[e.slug] && progress.reached[e.slug] !== undefined) ??
    entries.find((e) => e.lesson && !progress.done[e.slug]) ??
    entries[0]!;
  const [before, highlight, after] = course.home.title;
  const { Art } = course.home;

  return (
    <div className="home">
      <section className="hero">
        <div>
          <p className="crumb">
            {course.name} · {t(copy.interactive)}
          </p>
          <h1>
            {t(before)} <em>{t(highlight)}</em> {t(after)}
          </h1>
          <p className="lead">{t(course.home.lead)}</p>
          <a
            className="btn btn-primary"
            href={lessonHref(course.id, resume.slug, resumeStep(progress, resume.slug, resume.lesson?.steps.length ?? 1))}
          >
            {t(started ? ui.continue : ui.start)}: {t(resume.title)}
            <Icon name="arrowRight" />
          </a>
        </div>
        <div className="hero-art card stage">
          <Art />
        </div>
      </section>

      <section className="how">
        <h2>{t(copy.how)}</h2>
        <div className="how-grid">
          {copy.howItems.map((item, i) => (
            <div key={i} className="how-item card">
              <span className="num">{i + 1}</span>
              <p>
                <Rich text={t(item)} />
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="outline">
        <h2>{t(copy.outline)}</h2>
        <div className="outline-grid">
          {course.chapters.map((chapter, ci) => (
            <div key={chapter.id} className="outline-chapter card">
              <h3>
                <ChapterCube index={ci} />
                {String(ci + 1).padStart(2, "0")}. {t(chapter.title)}
              </h3>
              <ol>
                {chapter.lessons.map((entry) => (
                  <li key={entry.slug} className={entry.lesson ? "" : "is-soon"}>
                    <span
                      className="nav-state"
                      style={progress.done[entry.slug] ? { background: "var(--green)", borderColor: "var(--green)" } : undefined}
                    >
                      {progress.done[entry.slug] && <Icon name="check" size={12} />}
                    </span>
                    {entry.lesson ? (
                      <a href={lessonHref(course.id, entry.slug, resumeStep(progress, entry.slug, entry.lesson.steps.length))}>
                        {t(entry.title)}
                      </a>
                    ) : (
                      <span>{t(entry.title)}</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
