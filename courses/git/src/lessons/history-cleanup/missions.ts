import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { headFiles, resolve, firstParents, headId, type Repo } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";
import { changedIn } from "../shared/missionHelpers";

/** Local commits on top of origin/main, oldest first (the same list `git rebase -i` shows). */
function onTop(repo: Repo): string[] {
  const base = resolve(repo, "origin/main");
  const chain = firstParents(repo, headId(repo));
  const cut = base ? chain.indexOf(base) : -1;
  return (cut < 0 ? chain : chain.slice(0, cut)).reverse();
}

const messages = (repo: Repo) => onTop(repo).map((id) => repo.commits[id]!.message);

/** No work lost: the final code is all there. */
const codeIntact = (repo: Repo) => {
  const f = headFiles(repo);
  return f["login.js"] === "giriş formu (e-posta doğrulamalı)" && f["password.js"] === "şifre kontrolü";
};

export const missions: Mission<GitCtx>[] = [
  {
    id: "tidy",
    title: l("Toparla", "Tidy up"),
    goal: l(
      "`debug log` commit'ini at ve `yazım hatası düzeltildi` commit'ini **Giriş formu**'nun içine kat. Kod kaybolmasın.",
      "Drop the `debug log` commit and fold `yazım hatası düzeltildi` **into Giriş formu**. No code may be lost.",
    ),
    hint: l(
      "fixup bir commit'i bir öncekinin içine katar ve öncekinin mesajını tutar.",
      "fixup folds a commit into the one before it and keeps the earlier message.",
    ),
    par: 2,
    check: ({ state }) => {
      const loginCommits = onTop(state).filter((c) => changedIn(state, c).includes("login.js"));
      return (
        codeIntact(state) &&
        !("debug.js" in headFiles(state)) &&
        loginCommits.length === 1 &&
        state.commits[loginCommits[0]!]!.message === "Giriş formu"
      );
    },
  },
  {
    id: "messages",
    title: l("Mesajları düzelt", "Fix the messages"),
    goal: l(
      "Son commit'teki yazım hatasını (`kontorlü`) düzelt ve `wip` commit'ine anlamlı bir mesaj ver. Commit sayısı değişmesin.",
      "Fix the typo (`kontorlü`) in the last commit, and give the `wip` commit a meaningful message. Keep the number of commits.",
    ),
    hint: l(
      "Son commit'in mesajı için ayrı, kısa bir yol var. Diğerleri için rebase -i'de reword.",
      "The last commit's message has its own shortcut. For the others, reword in rebase -i.",
    ),
    par: 2,
    check: ({ state, start }) => {
      const msgs = messages(state);
      return msgs.length === messages(start).length && !msgs.includes("wip") && !msgs.some((m) => m.includes("kontorlü")) && codeIntact(state);
    },
  },
  {
    id: "two",
    title: l("İki commit", "Two commits"),
    goal: l(
      "origin/main'in üstünde **sadece iki commit** kalsın: `Giriş formu` ve `Şifre kontrolü` (doğru yazılmış). Debug izi olmasın, kod kaybolmasın.",
      "Leave **just two commits** on top of origin/main: `Giriş formu` and `Şifre kontrolü` (spelled right). No debug trace, no lost code.",
    ),
    hint: l(
      "fixup önceki commit'in mesajını tutar; sonunda bir mesajı reword etmen gerekebilir.",
      "fixup keeps the earlier commit's message; you may need to reword one at the end.",
    ),
    par: 4,
    check: ({ state }) => {
      const msgs = messages(state);
      return msgs.length === 2 && msgs[0] === "Giriş formu" && msgs[1] === "Şifre kontrolü" && codeIntact(state) && !("debug.js" in headFiles(state));
    },
  },
];
