import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { headId, isAncestor, resolve, status, type Repo } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";

const tip = (r: Repo) => r.commits[headId(r)!]!;
const sameFiles = (a: Record<string, string>, b: Record<string, string>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export const missions: Mission<GitCtx>[] = [
  {
    id: "squash",
    title: l("İkisini birleştir", "Squash the two"),
    goal: l(
      "Son iki commit'i (\"Renkler değişti\" ve \"Hatalı deneme\") **tek bir commit**'te birleştir. Dosyaların içeriği aynı kalsın.",
      "Combine the last two commits (\"Renkler değişti\" and \"Hatalı deneme\") into **one commit**. File contents stay the same.",
    ),
    hint: l(
      "Branch'i iki commit geri taşı ama değişiklikleri staging'de tut, sonra tek seferde commit at.",
      "Move the branch back two commits but keep the changes staged, then commit once.",
    ),
    par: 3,
    check: (ctx) => {
      const t = tip(ctx.state);
      const twoBack = resolve(ctx.start, "HEAD~2")!;
      return t.parents.length === 1 && t.parents[0] === twoBack && sameFiles(t.files, tip(ctx.start).files) && status(ctx.state).clean;
    },
  },
  {
    id: "shared",
    title: l("Paylaşılmış geçmiş", "Shared history"),
    goal: l(
      "Bu branch başkalarıyla paylaşıldı. **Geçmişi değiştirmeden** son iki commit'in etkisini geri al: dosyalar \"Menü eklendi\"deki haline dönsün.",
      "This branch is shared. Undo the effect of the last two commits **without rewriting history**: the files go back to how they were at \"Menü eklendi\".",
    ),
    hint: l("Paylaşılmış geçmişte commit silinmez; geri alan commit'ler eklenir.", "On shared history you never remove commits; you add commits that undo them."),
    par: 2,
    check: (ctx) => {
      const head = headId(ctx.state)!;
      const twoBack = resolve(ctx.start, "HEAD~2")!;
      return isAncestor(ctx.state, headId(ctx.start)!, head) && sameFiles(tip(ctx.state).files, ctx.start.commits[twoBack]!.files) && status(ctx.state).clean;
    },
  },
  {
    id: "redo",
    title: l("Yeniden, düzgün", "Redo it properly"),
    goal: l(
      "\"Hatalı deneme\" commit'ini geçmişten çıkar ve yerine app.js'i **düzgün** haliyle kaydeden tek bir commit koy.",
      "Remove the \"Hatalı deneme\" commit from history and replace it with one commit that saves app.js in its **fixed** version.",
    ),
    hint: l(
      "Önce son commit'i geri al ama değişikliği klasörde tut; sonra düzelt, add et, commit at.",
      "Undo the last commit but keep the change in the folder; then fix, add and commit.",
    ),
    par: 4,
    check: (ctx) => {
      const t = tip(ctx.state);
      const bad = headId(ctx.start)!;
      return !isAncestor(ctx.state, bad, t.id) && t.parents[0] === resolve(ctx.start, "HEAD~1") && t.files["app.js"] === "düzgün" && status(ctx.state).clean;
    },
  },
];
