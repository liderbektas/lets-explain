import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { firstParents, headId } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";
import { changedIn } from "../shared/missionHelpers";

/** The commits on the current line of history that were not there when the try-it step began. */
function added(ctx: GitCtx): string[] {
  const before = new Set(firstParents(ctx.start, headId(ctx.start)));
  return firstParents(ctx.state, headId(ctx.state)).filter((c) => !before.has(c));
}

const amended = (ctx: GitCtx) => ctx.events.flat().some((e) => e.type === "committed" && e.amend);

export const missions: Mission<GitCtx>[] = [
  {
    id: "order",
    title: l("Sırayla", "In order"),
    goal: l(
      "Geçmişe **iki** halka ekle: önce sadece `README.md`'yi, sonra sadece `app.js`'i değiştiren iki ayrı commit.",
      "Add **two** links to the history: first a commit that changes only `README.md`, then one that changes only `app.js`.",
    ),
    hint: l("Her commit'ten önce sadece o dosyayı değiştir.", "Before each commit, change only that one file."),
    par: 6,
    check: (ctx) => {
      const mine = added(ctx);
      if (mine.length !== 2) return false;
      const [newer, older] = mine;
      return changedIn(ctx.state, older!).join() === "README.md" && changedIn(ctx.state, newer!).join() === "app.js";
    },
  },
  {
    id: "forgot",
    title: l("Unuttum", "Forgot one"),
    goal: l(
      "Son commit'e unuttuğun bir değişikliği ekle, ama **commit sayısı artmasın**.",
      "Add a forgotten change to the last commit, but the **number of commits must not grow**.",
    ),
    hint: l("Yeni commit atmak yerine sonuncuyu yeniden yaz: `--amend`.", "Instead of a new commit, rewrite the last one: `--amend`."),
    par: 3,
    check: (ctx) => {
      const head = headId(ctx.state)!;
      const startHead = headId(ctx.start)!;
      return (
        amended(ctx) &&
        firstParents(ctx.state, head).length === firstParents(ctx.start, startHead).length &&
        JSON.stringify(ctx.state.commits[head]!.files) !== JSON.stringify(ctx.start.commits[startHead]!.files)
      );
    },
  },
  {
    id: "later",
    title: l("Sonradan ekle", "Add it later"),
    goal: l(
      "README.md'yi değiştiren bir commit at. Sonra app.js'teki bir değişikliği de **aynı commit'e** kat: geçmişte sadece bir yeni commit olsun ve iki dosyayı da değiştirsin.",
      "Commit a README.md change. Then fold an app.js change into **that same commit**: the history gains just one commit, and it changes both files.",
    ),
    hint: l("İkinci değişikliği commit'lemek yerine amend et.", "Amend the second change instead of committing it."),
    par: 6,
    check: (ctx) => {
      const mine = added(ctx);
      // The new commit sits on top of the old history: amending the commit that was already there does not count.
      return (
        mine.length === 1 &&
        ctx.state.commits[mine[0]!]!.parents[0] === headId(ctx.start) &&
        amended(ctx) &&
        changedIn(ctx.state, mine[0]!).join() === "README.md,app.js"
      );
    },
  },
];
