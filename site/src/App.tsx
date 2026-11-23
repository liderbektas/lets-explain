import { useEffect, useState } from "react";
import { CourseDrawer } from "@lets-explain/core/components/CourseDrawer";
import { CourseHome } from "@lets-explain/core/components/CourseHome";
import { LessonPlayer } from "@lets-explain/core/components/LessonPlayer";
import { TopBar } from "@lets-explain/core/components/TopBar";
import { CourseProvider, findLesson } from "@lets-explain/core/course/context";
import type { Course } from "@lets-explain/core/course/types";
import { l, useLang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { canonicalHref, hubHref, replaceRoute, useRoute, type Route } from "@lets-explain/core/lib/router";
import { courses, unreleased } from "./catalog";
import { Hub } from "./Hub";

export function App() {
  const route = useRoute();
  const course = route.name === "course" || route.name === "lesson" ? courses.find((c) => c.id === route.course) : undefined;

  // Old hash links (#/kafka/..., #/learn/...) still work; show them in the current form.
  useEffect(() => {
    const href = canonicalHref(route, window.location.pathname, window.location.hash);
    if (href) replaceRoute(href);
  }, [route]);

  useEffect(() => {
    if (route.name === "hub") document.title = "Let's explain";
    else if (course && route.name === "course") document.title = `${course.name} · Let's explain`;
  }, [route, course]);

  if (route.name === "hub") {
    return (
      <div className="app">
        <TopBar />
        <main className="main">
          <Hub />
        </main>
      </div>
    );
  }
  if (!course) {
    // A written but unreleased course says so, instead of "this page does not exist".
    const soon = route.name === "course" || route.name === "lesson" ? unreleased.find((c) => c.id === route.course) : undefined;
    return (
      <div className="app">
        <TopBar />
        <main className="main">
          <NotFound soon={soon?.name} />
        </main>
      </div>
    );
  }
  return (
    <CourseProvider course={course}>
      <CourseShell course={course} route={route} />
    </CourseProvider>
  );
}

function CourseShell({ course, route }: { course: Course; route: Route }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [route]);

  const found = route.name === "lesson" ? findLesson(course, route.slug) : null;
  const activeSlug = route.name === "lesson" ? route.slug : null;

  return (
    <div className="app">
      <TopBar course={course} onMenu={() => setMenuOpen(true)} />
      <CourseDrawer activeSlug={activeSlug} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="main">
        {route.name === "course" && <CourseHome />}
        {route.name === "lesson" && found?.entry.lesson && (
          <LessonPlayer
            key={found.entry.slug}
            lesson={found.entry.lesson}
            chapterTitle={found.chapter.title}
            chapterNumber={found.chapterNumber}
            lessonInChapter={found.lessonInChapter}
            lessonsInChapter={found.lessonsInChapter}
            step={route.step}
            next={found.next}
          />
        )}
        {route.name === "lesson" && !found?.entry.lesson && <NotFound />}
      </main>
    </div>
  );
}

function NotFound({ soon }: { soon?: string }) {
  const { t } = useLang();
  return (
    <div className="not-found">
      <p>{soon ? t(l(`${soon} kursu yakında açılıyor.`, `The ${soon} course is coming soon.`)) : t(ui.notFound)}</p>
      <a href={hubHref}>{t(l("Bütün kurslar", "All courses"))}</a>
    </div>
  );
}
