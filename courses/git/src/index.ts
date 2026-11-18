import { l } from "@lets-explain/core/i18n";
import type { Course } from "@lets-explain/core/course/types";
import { chapters } from "./course";
import { glossary } from "./glossary";
import { GitHero } from "./Hero";

export const gitCourse: Course = {
  id: "git",
  name: "Git",
  tagline: l(
    "Commit, branch, merge, rebase, geri alma ve uzak depolar: komutların arkasında ne olduğunu gör, kendi projende kullan.",
    "Commits, branches, merge, rebase, undoing and remotes: see what happens behind the commands, then use them in your own project.",
  ),
  chapters,
  glossary,
  home: {
    title: [l("Git'i", "Learn Git by"), l("görerek", "seeing it"), l("öğren.", "work.")],
    lead: l(
      "Her komutun arkasında küçük bir grafik değişir: bir branch ileri kayar, bir commit kopyalanır, HEAD yer değiştirir. Burada o grafiği izler, kendi ellerinle bozar ve düzeltirsin; her dersin sonunda aynı şeyi kendi projende yapacağın komutlar var.",
      "Behind every command a small graph changes: a branch slides forward, a commit gets copied, HEAD moves. Here you watch that graph, break and fix it yourself, and every lesson ends with the commands to do the same in your own project.",
    ),
    Art: GitHero,
  },
};
