import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { ancestors, currentBranch, status } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";
import { changedIn, newCommits } from "../shared/missionHelpers";

const WIP = "v2: arama + filtre (yarım)";

/** The half-done change is back in the folder, still uncommitted, and the stash is empty. */
const wipWaiting = (ctx: GitCtx) =>
  currentBranch(ctx.state) === "feature" &&
  ctx.state.work["app.js"] === WIP &&
  status(ctx.state).unstaged.some((c) => c.path === "app.js") &&
  ctx.state.stash.length === 0;

export const missions: Mission<GitCtx>[] = [
  {
    id: "copy-hotfix",
    title: l("Hotfix'i kopyala", "Copy the hotfix"),
    goal: l(
      "main'deki hotfix commit'ini **feature'a kopyala**. Yarım işin kaybolmasın: sonunda app.js'teki değişiklik yine klasörde, commit edilmemiş dursun.",
      "**Copy main's hotfix commit onto feature**. Do not lose your half-done work: in the end the app.js change is back in the folder, uncommitted.",
    ),
    hint: l(
      "cherry-pick temiz bir klasör ister. Yarım işi bir yere kaldırıp sonra geri getirebilirsin.",
      "cherry-pick needs a clean folder. You can put the half-done work away and bring it back after.",
    ),
    par: 3,
    check: (ctx) => {
      const tip = ctx.state.branches.feature;
      if (!tip) return false;
      const onFeature = ancestors(ctx.state, tip);
      const copied = newCommits(ctx).some((c) => onFeature.has(c) && changedIn(ctx.state, c).join() === "login.js");
      return copied && wipWaiting(ctx);
    },
  },
  {
    id: "urgent-fix",
    title: l("Acil düzeltme", "Urgent fix"),
    goal: l(
      "Yarım işin dururken **main'de README.md'yi düzelt** ve commit at. Sonra feature'a dön ve yarım işine kaldığın yerden devam et.",
      "With your work half done, **fix README.md on main** and commit. Then go back to feature and pick up your half-done work where you left it.",
    ),
    hint: l(
      "Yarım işle main'e geçemezsin. Önce onu stash'e kaldır, dönünce geri aç.",
      "You cannot switch to main with the half-done change. Stash it first and pop it when you are back.",
    ),
    par: 6,
    check: (ctx) => {
      const main = ctx.state.branches.main;
      if (!main) return false;
      const onMain = ancestors(ctx.state, main);
      const fixed = newCommits(ctx).some((c) => onMain.has(c) && changedIn(ctx.state, c).includes("README.md"));
      return fixed && wipWaiting(ctx);
    },
  },
  {
    id: "clean-slate",
    title: l("Temiz sayfa", "Clean slate"),
    goal: l(
      "Yarım işten tamamen vazgeç: önce **stash'e kaldır**, sonra **stash'ten de sil**. Sonunda klasör temiz, stash boş olsun.",
      "Give up the half-done work completely: **stash it**, then **drop it** from the stash too. In the end the folder is clean and the stash empty.",
    ),
    hint: l("stash drop, en üstteki stash kaydını siler.", "stash drop deletes the top stash entry."),
    par: 2,
    check: (ctx) => {
      const events = ctx.events.flat();
      return (
        events.some((e) => e.type === "stashed") &&
        events.some((e) => e.type === "stashDropped") &&
        ctx.state.stash.length === 0 &&
        status(ctx.state).clean
      );
    },
  },
];
