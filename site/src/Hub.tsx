import { CourseProvider } from "@lets-explain/core/course/context";
import type { Course } from "@lets-explain/core/course/types";
import { HowItWorks } from "@lets-explain/core/components/HowItWorks";
import { Icon } from "@lets-explain/core/components/Icon";
import { l, useLang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { courseHref, lessonHref } from "@lets-explain/core/lib/router";
import { resumeStep, useProgress } from "@lets-explain/core/lib/storage";
import { IslandCard, IslandsHero, ISLAND_TINT, type IslandId } from "./art/Islands";
import { courses, planned } from "./catalog";

const copy = {
  title: [l("Yazılımın içini", "See inside software:"), l("izle,", "watch,"), l("tahmin et, dene.", "predict, try.")] as const,
  lead: l(
    "Her kurs, normalde göremediğin bir teknolojiyi adım adım ilerleyen canlı sahnelerle açar. Bir mesajın nereye gittiğini, bir şey çökünce ne olduğunu kendi gözünle görürsün. Ön bilgi gerekmiyor.",
    "Each course opens up a technology you normally cannot see inside, with live scenes you step through. You see where a message goes and what a crash does, with your own eyes. No prior knowledge needed.",
  ),
  startKafka: l("Kafka ile başla", "Start with Kafka"),
  howLink: l("Nasıl çalışır?", "How it works"),
  how: l("Nasıl öğrenirsin?", "How you learn"),
  courses: l("Kurslar", "Courses"),
  coursesLead: l("{n} kurs açık, diğerleri yolda.", "{n} live, more on the way."),
  lessons: l("ders", "lessons"),
  chapters: l("bölüm", "chapters"),
  missions: l("görev", "missions"),
  done: l("bitti", "done"),
  soon: l("Yakında", "Soon"),
  live: l("Açık", "Live"),
  open: l("Kursa git", "Open course"),
};

const islandLabels = (t: (x: { tr: string; en: string }) => string): Record<IslandId, string> => ({
  kafka: "Kafka",
  rabbitmq: "RabbitMQ",
  kubernetes: "Kubernetes",
  git: "Git",
  transactions: t(l("Transaction", "Transactions")),
  docker: "Docker",
});

export function Hub() {
  const { t } = useLang();
  const [before, highlight, after] = copy.title;
  const kafka = courses[0]!;

  return (
    <div className="home hub">
      <section className="hero">
        <div>
          <h1>
            {t(before)} <em>{t(highlight)}</em> {t(after)}
          </h1>
          <p className="lead">{t(copy.lead)}</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={courseHref(kafka.id)}>
              {t(copy.startKafka)} <Icon name="arrowRight" />
            </a>
            <a className="btn" href="#how" onClick={(e) => {
              e.preventDefault();
              document.getElementById("how")?.scrollIntoView({ behavior: "smooth" });
            }}>
              {t(copy.howLink)}
            </a>
          </div>
        </div>
        <div className="hub-art">
          <IslandsHero labels={islandLabels(t)} live={courses.map((c) => c.id as IslandId)} />
        </div>
      </section>

      <HowItWorks title={copy.how} />

      <section className="outline">
        <div className="section-head">
          <h2>{t(copy.courses)}</h2>
          <p>{t(copy.coursesLead).replace("{n}", String(courses.length))}</p>
        </div>
        <div className="hub-grid">
          {courses.map((course) => (
            <CourseProvider key={course.id} course={course}>
              <LiveCard course={course} />
            </CourseProvider>
          ))}
          {planned.map((p) => (
            <div key={p.id} className="hub-card is-soon">
              <div className="hub-card-art" style={{ background: ISLAND_TINT[p.id as IslandId]?.soft }}>
                <IslandCard id={p.id as IslandId} />
                <span className="hub-badge">{t(copy.soon)}</span>
              </div>
              <div className="hub-card-body">
                <h3>{t(p.name)}</h3>
                <p>{t(p.tagline)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LiveCard({ course }: { course: Course }) {
  const { t } = useLang();
  const { progress } = useProgress();
  const lessons = course.chapters.flatMap((c) => c.lessons).filter((e) => e.lesson);
  const done = lessons.filter((e) => progress.done[e.slug]).length;
  const missions = lessons.reduce((n, e) => n + (e.lesson!.missions?.length ?? 0), 0);
  const started = Object.keys(progress.reached).length > 0;
  const resume = lessons.find((e) => !progress.done[e.slug] && progress.reached[e.slug] !== undefined) ?? lessons.find((e) => !progress.done[e.slug]);
  const id = course.id as IslandId;

  return (
    <article className="hub-card is-live">
      <a className="hub-card-art" href={courseHref(course.id)} style={{ background: ISLAND_TINT[id]?.soft }} aria-label={course.name}>
        <IslandCard id={id} />
        <span className="hub-badge">{t(copy.live)}</span>
      </a>
      <div className="hub-card-body">
        <h3>
          <a href={courseHref(course.id)}>{course.name}</a>
        </h3>
        <p>{t(course.tagline)}</p>
        <ul className="stat-row is-small">
          <li>
            <b>{lessons.length}</b> {t(copy.lessons)}
          </li>
          <li>
            <b>{course.chapters.length}</b> {t(copy.chapters)}
          </li>
          <li>
            <b>{missions}</b> {t(copy.missions)}
          </li>
        </ul>
        {started && (
          <div className="progress-meter">
            <span>
              {done}/{lessons.length} {t(copy.done)}
            </span>
            <div className="meter">
              <div style={{ width: `${(done / Math.max(lessons.length, 1)) * 100}%` }} />
            </div>
          </div>
        )}
        <div className="hub-card-actions">
          {started && resume?.lesson ? (
            <a className="btn btn-primary" href={lessonHref(course.id, resume.slug, resumeStep(progress, resume.slug, resume.lesson.steps.length))}>
              {t(ui.continue)}: {t(resume.title)} <Icon name="arrowRight" size={16} />
            </a>
          ) : (
            <a className="btn btn-primary" href={courseHref(course.id)}>
              {t(copy.open)} <Icon name="arrowRight" size={16} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
