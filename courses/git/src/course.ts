import { l } from "@lets-explain/core/i18n";
import type { Chapter, Lesson, LessonEntry } from "@lets-explain/core/course/types";

/** Lessons live in `lessons/<slug>/lesson.ts` and are picked up here by slug. */
const modules = import.meta.glob<Record<string, unknown>>("./lessons/*/lesson.ts", { eager: true });
const written = new Map<string, Lesson>();
for (const mod of Object.values(modules)) {
  for (const value of Object.values(mod)) {
    if (value && typeof value === "object" && "slug" in value && "steps" in value) {
      const lesson = value as Lesson;
      written.set(lesson.slug, lesson);
    }
  }
}

const entry = (slug: string, tr: string, en: string): LessonEntry => {
  const lesson = written.get(slug);
  return lesson ? { slug, title: lesson.title, lesson } : { slug, title: l(tr, en) };
};

export const chapters: Chapter[] = [
  {
    id: "foundations",
    title: l("Temeller", "Foundations"),
    lessons: [
      entry("why-git", "Neden Git?", "Why Git?"),
      entry("three-areas", "Üç alan: klasör, staging, repo", "Three areas: folder, staging, repo"),
      entry("commits-and-history", "Commit ve geçmiş", "Commits and history"),
    ],
  },
  {
    id: "inside",
    title: l("Git'in içi", "Inside Git"),
    lessons: [
      entry("objects", "Nesneler: blob, tree, commit", "Objects: blob, tree, commit"),
      entry("refs-and-head", "Ref'ler ve HEAD", "Refs and HEAD"),
    ],
  },
  {
    id: "branching",
    title: l("Branch'ler", "Branching"),
    lessons: [
      entry("branches", "Branch", "Branches"),
      entry("merging", "Merge", "Merging"),
      entry("conflicts", "Conflict", "Conflicts"),
      entry("rebase", "Rebase", "Rebase"),
    ],
  },
  {
    id: "undo",
    title: l("Geri almak", "Undoing"),
    lessons: [
      entry("undo-local", "Değişiklikleri geri al", "Undo local changes"),
      entry("reset-and-revert", "reset ve revert", "reset and revert"),
      entry("reflog", "reflog: kaybolanı bul", "reflog: find what was lost"),
      entry("stash-and-cherry-pick", "stash ve cherry-pick", "stash and cherry-pick"),
    ],
  },
  {
    id: "remotes",
    title: l("Uzak depolar", "Remotes"),
    lessons: [
      entry("remotes", "Remote: clone, fetch, pull, push", "Remotes: clone, fetch, pull, push"),
      entry("collaboration", "Birlikte çalışmak", "Working together"),
    ],
  },
  {
    id: "practice",
    title: l("Pratikte", "In practice"),
    lessons: [
      entry("history-cleanup", "Geçmişi temizlemek", "Cleaning up history"),
      entry("ignore-and-tags", ".gitignore ve tag", ".gitignore and tags"),
      entry("bisect", "bisect: hatayı bul", "bisect: find the bug"),
      entry("workflows", "Çalışma düzenleri", "Workflows"),
    ],
  },
];
