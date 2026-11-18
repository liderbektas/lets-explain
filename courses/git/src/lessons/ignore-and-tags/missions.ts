import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { headFiles, headId, isAncestor, status } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";
import { changedIn, newCommits } from "../shared/missionHelpers";

const CLUTTER = ["app.log", "node_modules/lib.js", ".env"];

export const missions: Mission<GitCtx>[] = [
  {
    id: "clean-commit",
    title: l("Temiz commit", "A clean commit"),
    goal: l(
      "`git add .` ile her şeyi staging'e koyup commit at, ama commit'e **app.log, node_modules ve .env girmesin**. `.gitignore` commit'te olsun.",
      "Stage everything with `git add .` and commit, but **app.log, node_modules and .env must stay out**. `.gitignore` goes into the commit.",
    ),
    hint: l("`add .` neyi alacağına `.gitignore`'a bakarak karar verir. Önce kuralları yaz.", "`add .` checks `.gitignore` to decide what to take. Write the rules first."),
    par: 3,
    check: (ctx) => {
      if (newCommits(ctx).length === 0) return false;
      const files = headFiles(ctx.state);
      return ".gitignore" in files && CLUTTER.every((p) => !(p in files));
    },
  },
  {
    id: "untrack-log",
    title: l("debug.log'dan kurtul", "Get rid of debug.log"),
    goal: l(
      "`debug.log` yanlışlıkla commit'lenmiş. Repo'dan çıksın ama **klasörde kalsın** ve bundan sonra yok sayılsın. Kuralı da commit'e koy ki takım arkadaşların da yok saysın.",
      "`debug.log` was committed by mistake. Take it out of the repo but **keep it in the folder**, ignored from now on. Commit the rule too, so your teammates ignore it as well.",
    ),
    hint: l(
      "Takip edilen bir dosyayı `.gitignore` tek başına durdurmaz. Önce Git'in onu unutması gerekir.",
      "`.gitignore` alone does not stop a tracked file. Git first has to forget it.",
    ),
    par: 4,
    check: (ctx) => {
      const files = headFiles(ctx.state);
      return (
        !("debug.log" in files) &&
        ".gitignore" in files &&
        "debug.log" in ctx.state.work &&
        status(ctx.state).ignored.includes("debug.log")
      );
    },
  },
  {
    id: "release-tag",
    title: l("Sürüm etiketi", "Release tag"),
    goal: l(
      "Şu anki commit'e `v1.0` tag'i koy. Sonra `app.js`'i değiştirip yeni bir commit at: **v1.0 eski commit'te kalmalı**, main yeni commit'e geçmeli.",
      "Put the tag `v1.0` on the current commit. Then change `app.js` and commit: **v1.0 stays on the old commit** while main moves to the new one.",
    ),
    hint: l("Tag bir kez konunca yerinden oynamaz; branch'ler ise her commit'te ilerler.", "Once placed, a tag never moves; branches move with every commit."),
    par: 4,
    check: (ctx) => {
      const tag = ctx.state.tags["v1.0"];
      const head = headId(ctx.state);
      if (!tag || !head || tag === head) return false;
      return tag === headId(ctx.start) && isAncestor(ctx.state, tag, head) && newCommits(ctx).some((c) => changedIn(ctx.state, c).includes("app.js"));
    },
  },
];
