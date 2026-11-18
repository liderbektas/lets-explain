import { useEffect } from "react";
import { useLang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { allLessons, useCourse } from "@lets-explain/core/course/context";
import { lessonHref } from "@lets-explain/core/lib/router";
import { resumeStep, useProgress } from "@lets-explain/core/lib/storage";
import { Icon } from "@lets-explain/core/components/Icon";

interface Props {
  activeSlug: string | null;
  open: boolean;
  onClose: () => void;
}

/** One pastel cube per chapter, so chapters are easy to tell apart. */
const CHAPTER_COLORS: [string, string, string][] = [
  ["#ffd66b", "#f2bd3a", "#d9a826"],
  ["#a8e6cf", "#7fd3b5", "#4fb08c"],
  ["#ff9f8a", "#f08770", "#e2735c"],
  ["#bfaef5", "#a993ee", "#8f78e0"],
  ["#a9c8f7", "#8db4f0", "#5f8fdc"],
  ["#ffd3a5", "#f9b67e", "#e3955a"],
  ["#d8d2dc", "#bdb6c4", "#9a94a2"],
];

export function ChapterCube({ index, size = 22 }: { index: number; size?: number }) {
  const [top, left, right] = CHAPTER_COLORS[index % CHAPTER_COLORS.length]!;
  return (
    <svg className="chapter-cube" width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <g stroke="#2b2a33" strokeWidth="1.6" strokeLinejoin="round">
        <polygon points="3,7 11,11 11,20 3,16" fill={left} />
        <polygon points="11,11 19,7 19,16 11,20" fill={right} />
        <polygon points="3,7 11,3 19,7 11,11" fill={top} />
      </g>
    </svg>
  );
}

/** The course list, opened from the top bar instead of taking a permanent column. */
export function CourseDrawer({ activeSlug, open, onClose }: Props) {
  const { t } = useLang();
  const course = useCourse();
  const { progress } = useProgress();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div className={`scrim ${open ? "is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <nav className={`drawer ${open ? "is-open" : ""}`} aria-label={t(ui.lessonsMenu)} aria-hidden={!open}>
        <div className="drawer-head">
          <div>
            <h2>{course.name}</h2>
            <p>
              {allLessons(course).filter((x) => x.entry.lesson).length} {t(ui.lessonsCount)}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t(ui.closeMenu)} tabIndex={open ? 0 : -1}>
            <Icon name="close" />
          </button>
        </div>
        {course.chapters.map((chapter, ci) => {
          const done = chapter.lessons.filter((l) => progress.done[l.slug]).length;
          return (
            <section key={chapter.id} className="drawer-chapter">
              <h3>
                <ChapterCube index={ci} />
                <span>{t(chapter.title)}</span>
                <small>
                  {done}/{chapter.lessons.length}
                </small>
              </h3>
              <ol>
                {chapter.lessons.map((entry) => {
                  const isDone = progress.done[entry.slug];
                  if (!entry.lesson) {
                    return (
                      <li key={entry.slug} className="drawer-item is-soon">
                        <span>{t(entry.title)}</span>
                        <em>{t(ui.soon)}</em>
                      </li>
                    );
                  }
                  return (
                    <li key={entry.slug}>
                      <a
                        className={`drawer-item ${activeSlug === entry.slug ? "is-active" : ""}`}
                        href={lessonHref(course.id, entry.slug, resumeStep(progress, entry.slug, entry.lesson.steps.length))}
                        tabIndex={open ? 0 : -1}
                      >
                        <span>{t(entry.title)}</span>
                        {isDone && (
                          <i className="done-dot">
                            <Icon name="check" size={12} />
                          </i>
                        )}
                      </a>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </nav>
    </>
  );
}
