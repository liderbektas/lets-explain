import { createContext, useContext, type ReactNode } from "react";
import type { Course } from "./types";

const CourseContext = createContext<Course | null>(null);

/** Everything under a course's pages reads the course from here: glossary, lessons, storage keys. */
export function CourseProvider({ course, children }: { course: Course; children: ReactNode }) {
  return <CourseContext.Provider value={course}>{children}</CourseContext.Provider>;
}

/** The current course, or null on pages outside any course (the hub). */
export function useCourseOrNull(): Course | null {
  return useContext(CourseContext);
}

export function useCourse(): Course {
  const course = useContext(CourseContext);
  if (!course) throw new Error("useCourse must be used inside CourseProvider");
  return course;
}

export function allLessons(course: Course) {
  return course.chapters.flatMap((c) => c.lessons.map((entry) => ({ chapter: c, entry })));
}

export function findLesson(course: Course, slug: string) {
  const lessons = allLessons(course);
  const index = lessons.findIndex((x) => x.entry.slug === slug);
  if (index === -1) return null;
  const found = lessons[index]!;
  const next = lessons.slice(index + 1).find((x) => x.entry.lesson);
  return {
    ...found,
    chapterNumber: course.chapters.indexOf(found.chapter) + 1,
    lessonInChapter: found.chapter.lessons.indexOf(found.entry) + 1,
    lessonsInChapter: found.chapter.lessons.length,
    next: next?.entry ?? null,
  };
}
