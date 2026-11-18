import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { ancestors, headId, isAncestor } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";

const merges = (ctx: GitCtx, id: string | undefined) =>
  id ? [...ancestors(ctx.state, id)].filter((c) => ctx.state.commits[c]!.parents.length > 1).length : 0;

export const missions: Mission<GitCtx>[] = [
  {
    id: "straight-line",
    title: l("Dümdüz", "Straight line"),
    goal: l(
      "feature'ın iki commit'ini main'e getir, ama main'in geçmişinde **hiç merge commit'i olmasın**: tek düz bir çizgi.",
      "Bring feature's two commits into main, but with **no merge commit** anywhere in main's history: one straight line.",
    ),
    hint: l(
      "Önce feature'ı main'in üstüne taşı; o zaman main sadece ileri kayabilir (fast-forward).",
      "First move feature on top of main; then main can simply slide forward (fast-forward).",
    ),
    par: 3,
    check: (ctx) => {
      const main = ctx.state.branches.main;
      return Boolean(!ctx.state.op && main && main === ctx.state.branches.feature && merges(ctx, main) === 0 && ctx.state.commits[main]!.files["search.js"]);
    },
  },
  {
    id: "merge-way",
    title: l("Merge ile", "With a merge"),
    goal: l(
      "Aynı işi bu sefer **rebase yapmadan** yap: feature'ı main'e bir merge commit'iyle getir.",
      "Do the same job **without rebasing** this time: bring feature into main with a merge commit.",
    ),
    hint: l("Merge, hedef branch'teyken yapılır.", "You merge while on the target branch."),
    par: 2,
    check: (ctx) => {
      const main = ctx.state.branches.main;
      return Boolean(!ctx.state.op && main && ctx.state.commits[main]!.parents.length === 2 && isAncestor(ctx.state, ctx.start.branches.feature!, main));
    },
  },
  {
    id: "keep-blue",
    title: l("Mavi kalsın", "Keep it blue"),
    goal: l(
      "`theme`'i main'in üstüne rebase et. Conflict çıkınca **theme'in mavi rengini** tut ve rebase'i bitir.",
      "Rebase `theme` onto main. When the conflict comes, keep **theme's blue** and finish the rebase.",
    ),
    hint: l(
      "Rebase sırasında \"bizim\" taraf main'dir, \"onların\" taraf yeniden yazılan theme commit'i.",
      "During a rebase, \"ours\" is main and \"theirs\" is the theme commit being replayed.",
    ),
    par: 5,
    check: (ctx) => {
      const theme = ctx.state.branches.theme;
      return Boolean(
        !ctx.state.op &&
          theme &&
          isAncestor(ctx.state, ctx.state.branches.main!, theme) &&
          ctx.state.commits[theme]!.files["style.css"] === "renk: mavi" &&
          merges(ctx, theme) === 0,
      );
    },
  },
  {
    id: "abort",
    title: l("Vazgeç", "Back out"),
    goal: l(
      "`theme`'i rebase etmeyi dene; conflict çıkınca vazgeç. Sonunda rebase sürmesin ve theme **eski commit'inde** kalsın.",
      "Try rebasing `theme`; when the conflict comes, back out. In the end no rebase is running and theme is on **its old commit**.",
    ),
    hint: l("Yarım kalan bir rebase'in de kendi iptal komutu var.", "A half-done rebase has its own cancel command too."),
    par: 3,
    check: (ctx) =>
      ctx.events.flat().some((e) => e.type === "conflict" && e.during === "rebase") &&
      !ctx.state.op &&
      ctx.state.branches.theme === ctx.start.branches.theme &&
      headId(ctx.state) === ctx.start.branches.theme,
  },
];
