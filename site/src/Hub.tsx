import { CourseProvider } from "@lets-explain/core/course/context";
import type { Course } from "@lets-explain/core/course/types";
import { ChapterCube } from "@lets-explain/core/components/CourseDrawer";
import { Icon } from "@lets-explain/core/components/Icon";
import { l, useLang } from "@lets-explain/core/i18n";
import { courseHref } from "@lets-explain/core/lib/router";
import { useProgress } from "@lets-explain/core/lib/storage";
import { courses, planned } from "./catalog";

const copy = {
  crumb: l("Let's explain · interaktif kurslar", "Let's explain · interactive courses"),
  title: [l("Yazılım teknolojilerini", "Learn software tech by"), l("izleyerek", "watching"), l("ve deneyerek öğren.", "and trying it.")],
  lead: l(
    "Her kurs, içini göremediğin bir teknolojiyi adım adım ilerleyen canlı sahnelerle açar. Önce ne olacağını tahmin edersin, sonra izlersin; her dersin sonunda da kendi kurduğun görevleri çözersin.",
    "Each course opens up a technology you normally cannot see inside, with live scenes you step through. You guess what happens, then watch; every lesson ends with missions you solve yourself.",
  ),
  courses: l("Kurslar", "Courses"),
  lessons: l("ders", "lessons"),
  done: l("bitti", "done"),
  soon: l("Yakında", "Soon"),
  open: l("Açık", "Live"),
};

export function Hub() {
  const { t } = useLang();
  const [before, highlight, after] = copy.title;
  return (
    <div className="home">
      <section className="hero hub-hero">
        <div>
          <p className="crumb">{t(copy.crumb)}</p>
          <h1>
            {t(before!)} <em>{t(highlight!)}</em> {t(after!)}
          </h1>
          <p className="lead">{t(copy.lead)}</p>
        </div>
      </section>

      <section className="outline">
        <h2>{t(copy.courses)}</h2>
        <div className="hub-grid">
          {courses.map((course, i) => (
            <CourseProvider key={course.id} course={course}>
              <CourseCard course={course} index={i} />
            </CourseProvider>
          ))}
          {planned.map((p, i) => (
            <div key={p.id} className="hub-card card is-soon">
              <h3>
                <ChapterCube index={courses.length + i} size={26} />
                {t(p.name)}
              </h3>
              <p>{t(p.tagline)}</p>
              <div className="hub-meta">
                <span className="hub-badge">{t(copy.soon)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CourseCard({ course, index }: { course: Course; index: number }) {
  const { t } = useLang();
  const { progress } = useProgress();
  const lessons = course.chapters.flatMap((c) => c.lessons).filter((e) => e.lesson);
  const done = lessons.filter((e) => progress.done[e.slug]).length;
  return (
    <a className="hub-card card" href={courseHref(course.id)}>
      <h3>
        <ChapterCube index={index} size={26} />
        {course.name}
      </h3>
      <p>{t(course.tagline)}</p>
      <div className="hub-meta">
        <span className="hub-badge">{t(copy.open)}</span>
        <span className="hub-progress">
          {lessons.length} {t(copy.lessons)}
          {done > 0 && ` · ${done} ${t(copy.done)}`}
        </span>
        <Icon name="arrowRight" />
      </div>
    </a>
  );
}
