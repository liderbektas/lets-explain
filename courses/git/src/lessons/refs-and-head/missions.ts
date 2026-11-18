import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { ancestors, currentBranch, reachable, resolve } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";
import { newCommits } from "../shared/missionHelpers";

/** Commits made while HEAD was detached (the commit event names no branch). */
const detachedCommits = (ctx: GitCtx) =>
  ctx.events.flat().flatMap((e) => (e.type === "committed" && e.branch === null ? [e.id] : []));

const mainUntouched = (ctx: GitCtx) => ctx.state.branches.main === ctx.start.branches.main;

export const missions: Mission<GitCtx>[] = [
  {
    id: "look-back",
    title: l("Geçmişe bak", "Look back"),
    goal: l(
      "main'e dokunmadan **iki commit önceki** koda bak, sonra main'e geri dön.",
      "Without touching main, look at the code from **two commits ago**, then go back to main.",
    ),
    hint: l("`HEAD~2` iki commit geriyi gösterir. Oraya geçince HEAD bir branch'te değildir.", "`HEAD~2` means two commits back. Going there leaves HEAD on no branch."),
    par: 2,
    check: (ctx) => {
      const target = resolve(ctx.start, "main~2");
      const visited = ctx.states.some((s) => s.head.kind === "detached" && s.head.id === target);
      return visited && currentBranch(ctx.state) === "main" && mainUntouched(ctx);
    },
  },
  {
    id: "rescue",
    title: l("Kurtar", "Rescue"),
    goal: l(
      "Detached HEAD'deyken bir commit at ve onu **kaybetme**: sonunda main'e dön, ama o commit bir branch'te dursun.",
      "Make a commit on a detached HEAD and **do not lose it**: end on main, with that commit on a branch.",
    ),
    hint: l(
      "Bir commit'i korumanın yolu ona bir isim vermek: `git switch -c`.",
      "The way to keep a commit is to give it a name: `git switch -c`.",
    ),
    par: 5,
    check: (ctx) => {
      if (currentBranch(ctx.state) !== "main") return false;
      const others = Object.entries(ctx.state.branches).filter(([b]) => b !== "main");
      return detachedCommits(ctx).some((id) => others.some(([, tip]) => ancestors(ctx.state, tip).has(id)));
    },
  },
  {
    id: "lose-one",
    title: l("Kayıp commit", "The lost commit"),
    goal: l(
      "Bir commit'in nasıl kaybolduğunu gör: detached HEAD'de commit at ve **hiçbir isim vermeden** main'e dön.",
      "See how a commit gets lost: commit on a detached HEAD and go back to main **without naming it**.",
    ),
    hint: l("Geri dönünce o commit'i hiçbir branch göstermez; grafikte soluklaşır.", "Once you are back, no branch points at that commit and it fades in the graph."),
    par: 4,
    check: (ctx) => {
      const live = reachable(ctx.state);
      return currentBranch(ctx.state) === "main" && newCommits(ctx).some((c) => !live.has(c));
    },
  },
];
