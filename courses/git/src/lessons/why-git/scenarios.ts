import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, currentBranch, headId, status, type GitAction } from "../../engine/git";
import type { GitScenario } from "../shared/GitScene";
import { changedIn, newCommits, repoAfter } from "../shared/missionHelpers";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });

/** A brand-new repository with the report's first draft in the folder, nothing saved yet. */
const FRESH = repoAfter([write("rapor.md", "Giriş")], createRepo({ author: ADA }));

/** The report with its first draft saved: free play starts here. */
export const DRAFT = repoAfter([add("rapor.md"), commit("İlk taslak")], FRESH);

/** Three saved versions of the report. */
const THREE = repoAfter(
  [write("rapor.md", "Giriş + Bölüm 1"), add("rapor.md"), commit("Bölüm 1 eklendi"), write("rapor.md", "Giriş + Bölüm 1 + Sonuç"), add("rapor.md"), commit("Sonuç yazıldı")],
  DRAFT,
);

export const scenarios: GitScenario[] = [
  {
    id: "first-version",
    title: l("İlk sürüm", "First version"),
    story: l(
      "Dönem raporuna başladın ve bu klasörü `git init` ile bir Git repo'su yaptın. `rapor.md`'deki giriş bölümü hazır, ama Git henüz hiçbir şey kaydetmedi.",
      "You started your term report and turned this folder into a Git repository with `git init`. The introduction in `rapor.md` is ready, but Git has saved nothing yet.",
    ),
    goal: l("Raporun bu hali repo'nun **ilk commit'i** olarak kaydedilsin.", "This state of the report is saved as the repository's **first commit**."),
    start: FRESH,
    hints: [
      l("Kaydetmek iki adım: önce Git'e hangi dosyayı kaydedeceğini söyle, sonra kaydet.", "Saving is two steps: tell Git which file to save, then save it."),
      l("`git add` dosyayı hazırlar, `git commit -m \"mesaj\"` kaydeder.", "`git add` prepares the file, `git commit -m \"message\"` saves it."),
      l("`git add rapor.md` sonra `git commit -m \"İlk taslak\"`", "`git add rapor.md` then `git commit -m \"First draft\"`"),
    ],
    par: 2,
    check: (ctx) => {
      const head = headId(ctx.state);
      return Boolean(head && currentBranch(ctx.state) === "main" && ctx.state.commits[head]!.files["rapor.md"] === "Giriş");
    },
  },
  {
    id: "new-chapter",
    title: l("Yeni bölüm", "New chapter"),
    story: l(
      "Dün ilk taslağı kaydettin. Bugün `rapor.md`'ye Bölüm 1'i yazdın. Akşam bilgisayarın kapanırsa ya da yarın beğenmezsen geri dönebilmek istiyorsun.",
      "Yesterday you saved the first draft. Today you wrote Chapter 1 in `rapor.md`. If your laptop dies tonight, or you don't like it tomorrow, you want to be able to go back.",
    ),
    goal: l("Bölüm 1'li hal **yeni bir sürüm** olarak kaydedilsin; ilk taslak da geçmişte dursun.", "The version with Chapter 1 is saved as **a new version**; the first draft stays in the history."),
    start: repoAfter([write("rapor.md", "Giriş + Bölüm 1")], DRAFT),
    hints: [
      l("`git status` ne değiştiğini söyler. Değişikliği yeni bir commit yapman gerekiyor.", "`git status` tells you what changed. You need to make the change a new commit."),
      l("Yine `git add` ve `git commit`. Mesaj neyi neden değiştirdiğini söylesin.", "Again `git add` and `git commit`. The message should say what you changed and why."),
      l("`git add rapor.md` sonra `git commit -m \"Bölüm 1 eklendi\"`", "`git add rapor.md` then `git commit -m \"Add chapter 1\"`"),
    ],
    par: 2,
    check: (ctx) =>
      currentBranch(ctx.state) === "main" &&
      status(ctx.state).clean &&
      newCommits(ctx).some((c) => ctx.state.commits[c]!.parents[0] === headId(ctx.start) && ctx.state.commits[c]!.files["rapor.md"] === "Giriş + Bölüm 1"),
  },
  {
    id: "with-notes",
    title: l("Notlarla birlikte", "With the notes"),
    story: l(
      "Bölüm 1'i yazarken kaynaklarını yeni bir `kaynaklar.md` dosyasına not ettin. Rapor bu kaynaklara atıf yapıyor: ikisi ayrı kaydedilirse sürümlerden biri eksik kalır.",
      "While writing Chapter 1 you listed your sources in a new file, `kaynaklar.md`. The report cites them: saved separately, one of the versions would be incomplete.",
    ),
    goal: l("`rapor.md` ve `kaynaklar.md` **aynı sürümde** kaydedilsin.", "`rapor.md` and `kaynaklar.md` are saved in **the same version**."),
    start: repoAfter([write("rapor.md", "Giriş + Bölüm 1 [1]"), write("kaynaklar.md", "[1] Pro Git, Scott Chacon")], DRAFT),
    hints: [
      l("Bir commit, staging'e koyduğun her şeyi birlikte kaydeder.", "A commit saves everything you staged, together."),
      l("İki dosyayı da `git add` ile ekle (ya da hepsini birden: `git add .`), sonra tek commit at.", "Add both files with `git add` (or everything at once: `git add .`), then make one commit."),
      l("`git add .` sonra `git commit -m \"Bölüm 1 ve kaynaklar\"`", "`git add .` then `git commit -m \"Chapter 1 and sources\"`"),
    ],
    par: 2,
    check: (ctx) =>
      newCommits(ctx).some((c) => {
        const files = changedIn(ctx.state, c);
        return files.includes("rapor.md") && files.includes("kaynaklar.md");
      }),
  },
  {
    id: "look-back",
    title: l("Eski hale bak", "Look back"),
    story: l(
      "Hocan soruyor: \"İlk taslakta giriş nasıldı?\" Rapor üç sürümdür kaydedilmiş. İlk hale bakıp sonra en yeni hale dönmek istiyorsun, hiçbir sürümü kaybetmeden.",
      "Your teacher asks: \"What did the introduction look like in the first draft?\" The report has three saved versions. You want to look at the first one, then come back to the latest, losing nothing.",
    ),
    goal: l("Klasörde **ilk sürümü** aç, sonra `main`'e dön. Üç sürüm de yerinde kalsın.", "Open **the first version** in the folder, then come back to `main`. All three versions stay."),
    start: THREE,
    hints: [
      l("Eski bir commit'e geçmek sonrakileri silmez. `HEAD~2`, iki commit öncesi demek.", "Moving to an old commit deletes nothing after it. `HEAD~2` means two commits back."),
      l("`git checkout` eski bir commit'e geçer; `git switch main` en yeni hale döner.", "`git checkout` moves to an old commit; `git switch main` brings you back to the latest."),
      l("`git checkout HEAD~2` sonra `git switch main`", "`git checkout HEAD~2` then `git switch main`"),
    ],
    par: 2,
    check: (ctx) => {
      const first = Object.values(ctx.start.commits).find((c) => c.parents.length === 0)!.id;
      return (
        ctx.states.some((s) => s.head.kind === "detached" && s.head.id === first) &&
        currentBranch(ctx.state) === "main" &&
        ctx.state.branches.main === ctx.start.branches.main
      );
    },
  },
];
