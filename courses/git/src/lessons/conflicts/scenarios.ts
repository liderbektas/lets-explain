import { l } from "@lets-explain/core/i18n";
import { currentBranch, headId, isAncestor, status, type Repo } from "../../engine/git";
import type { GitScenario } from "../shared/GitScene";
import { repoAfter } from "../shared/missionHelpers";
import { LOG, START, TITLE } from "./repo";

const SALE = "Mağaza: Büyük indirim";
const RENAMED = "Online Mağaza";
const MAIN_LINE = "Şifre sıfırlama eklendi";
const FEATURE_LINE = "Karanlık tema eklendi";

/** The merge commit on HEAD once the merge is finished, else null. */
function mergeCommit(repo: Repo) {
  const id = headId(repo);
  if (!id || repo.op) return null;
  const c = repo.commits[id]!;
  return c.parents.length === 2 ? c : null;
}

/** A changelog that keeps both lines, in either order, with no conflict markers left. */
const hasBothLines = (content: string | undefined) => {
  if (content === undefined || /^(<{7}|={7}|>{7})/m.test(content)) return false;
  const rows = content.split("\n").map((r) => r.trim()).filter(Boolean);
  return rows.length === 2 && rows.includes(MAIN_LINE) && rows.includes(FEATURE_LINE);
};

/** main in the middle of `git merge feature`, stopped on both files. */
const MERGING: Repo = repoAfter([{ type: "merge", target: "feature" }], START);

export const scenarios: GitScenario[] = [
  {
    id: "new-name",
    title: l("Yeni isim kalsın", "Keep the new name"),
    story: l(
      "`feature` branch'inde mağazanın adı \"Online Mağaza\" oldu; main'de ise başlığa indirim yazıldı. İkisi de `CHANGELOG.md`'ye kendi satırını ekledi. Ürün ekibi kararını verdi: **yeni isim** kalacak, changelog'da iki satır da olacak.",
      "On `feature` the shop was renamed \"Online Mağaza\"; on main a sale went into the title. Both added their own line to `CHANGELOG.md`. The product team has decided: the **new name** stays, and the changelog keeps both lines.",
    ),
    goal: l("`feature` main'e merge edilsin: başlık \"Online Mağaza\", CHANGELOG.md'de iki satır da olsun.", "`feature` is merged into main: the title is \"Online Mağaza\" and CHANGELOG.md keeps both lines."),
    start: START,
    hints: [
      l("Merge iki dosyada duracak. `git status` hangi dosyaların çakıştığını söyler; `cat` ile işaretleri görebilirsin.", "The merge will stop on two files. `git status` tells you which ones clash; `cat` shows you the markers."),
      l(
        "Başlık için tek tarafı seç: `git checkout --theirs`. Changelog'da iki satır da lazım: `nano` ile işaret satırlarını sil. Sonra `git add` ve `git commit`.",
        "For the title, pick one side: `git checkout --theirs`. The changelog needs both lines: delete the marker lines in `nano`. Then `git add` and `git commit`.",
      ),
      l(
        "`git merge feature`, `git checkout --theirs title.txt`, `nano CHANGELOG.md` (işaret satırlarını sil, kaydet), `git add .`, `git commit`",
        "`git merge feature`, `git checkout --theirs title.txt`, `nano CHANGELOG.md` (delete the marker lines, save), `git add .`, `git commit`",
      ),
    ],
    par: 5,
    check: ({ state }) => {
      const c = mergeCommit(state);
      return Boolean(c && c.files[TITLE] === RENAMED && hasBothLines(c.files[LOG]));
    },
  },
  {
    id: "not-now",
    title: l("Şimdi değil", "Not now"),
    story: l(
      "Dün akşam `git merge feature` yazmışsın, conflict çıkmış ve bilgisayarı kapatmışsın. Bugün terminali açınca prompt `(main|MERGING)` diyor. Bu merge'ü şimdi bitirmek istemiyorsun; önce acil bir işe bakacaksın.",
      "Last night you typed `git merge feature`, hit a conflict and shut the laptop. Today the prompt says `(main|MERGING)`. You don't want to finish this merge now; something urgent comes first.",
    ),
    goal: l("Merge iptal edilsin: main eski commit'inde kalsın, klasör temiz olsun.", "The merge is called off: main stays on its old commit and the folder is clean."),
    start: MERGING,
    hints: [
      l("`git status` ne olduğunu ve nasıl çıkılacağını yazar.", "`git status` says what is going on and how to get out."),
      l("Yarım kalmış bir merge'ün kendi iptal komutu var.", "A half-done merge has its own cancel command."),
      l("`git merge --abort`", "`git merge --abort`"),
    ],
    par: 1,
    check: ({ state, start }) => !state.op && state.branches.main === start.branches.main && status(state).clean,
  },
  {
    id: "after-lunch",
    title: l("Öğle arasından sonra", "After lunch"),
    story: l(
      "Merge'ün ortasında öğle arasına çıktın. Dönünce hatırladın: `title.txt`'te **main'in indirim başlığını** seçip add etmiştin. `CHANGELOG.md` kaldı; orada iki satır da kalmalı. İş bitince `feature` branch'ine de gerek kalmayacak.",
      "You went to lunch in the middle of a merge. Back at your desk you remember: in `title.txt` you had picked **main's sale title** and added it. `CHANGELOG.md` is left; it should keep both lines. Once done, the `feature` branch won't be needed.",
    ),
    goal: l("Merge bitsin (indirim başlığı, changelog'da iki satır) ve `feature` branch'i silinsin.", "The merge is finished (sale title, both changelog lines) and the `feature` branch is deleted."),
    start: repoAfter([{ type: "resolve", path: TITLE, take: "ours" }, { type: "add", paths: [TITLE] }], MERGING),
    hints: [
      l("`git status`'a bak: biri çözülmüş, biri hâlâ \"both modified\".", "Check `git status`: one file is resolved, one is still \"both modified\"."),
      l("Changelog'daki işaret satırlarını sil, `git add` ile çözüldüğünü söyle, `git commit` ile bitir. Sonra branch'i sil.", "Remove the marker lines from the changelog, mark it resolved with `git add`, finish with `git commit`. Then delete the branch."),
      l("`nano CHANGELOG.md` (işaretleri sil, kaydet), `git add CHANGELOG.md`, `git commit`, `git branch -d feature`", "`nano CHANGELOG.md` (delete the markers, save), `git add CHANGELOG.md`, `git commit`, `git branch -d feature`"),
    ],
    par: 4,
    check: ({ state }) => {
      const c = mergeCommit(state);
      return Boolean(c && !state.branches.feature && c.files[TITLE] === SALE && hasBothLines(c.files[LOG]));
    },
  },
  {
    id: "forgot-add",
    title: l("add unutuldu", "Forgot to add"),
    story: l(
      "İki dosyadaki conflict'i de editörde düzelttin: başlıkta yeni isim, changelog'da iki satır. `git commit` yazdın ama Git \"Committing is not possible because you have unmerged files\" diyor. Dosyalar doğru görünüyor, eksik olan ne?",
      "You fixed the conflict in both files in your editor: the new name in the title, both lines in the changelog. You typed `git commit`, but Git says \"Committing is not possible because you have unmerged files\". The files look right, so what's missing?",
    ),
    goal: l("Merge, dosyalar şu anki halleriyle commit'lensin.", "The merge is committed with the files as they are now."),
    start: repoAfter(
      [
        { type: "write", path: TITLE, content: RENAMED },
        { type: "write", path: LOG, content: `${MAIN_LINE}\n${FEATURE_LINE}` },
      ],
      MERGING,
    ),
    hints: [
      l("Dosyayı düzeltmek yetmez; Git'e çözdüğünü söylemen gerekir.", "Fixing a file isn't enough; you have to tell Git you resolved it."),
      l("Conflict'in çözüldüğünü `git add` işaretler.", "`git add` is what marks a conflict as resolved."),
      l("`git add .` sonra `git commit`", "`git add .` then `git commit`"),
    ],
    par: 2,
    check: ({ state, start }) => {
      const c = mergeCommit(state);
      return Boolean(c && c.files[TITLE] === start.work[TITLE] && c.files[LOG] === start.work[LOG]);
    },
  },
  {
    id: "on-your-branch",
    title: l("Kendi branch'inde çöz", "Solve it on your branch"),
    story: l(
      "Pull request açmadan önce ekip senden şunu istiyor: main'deki yenilikleri **kendi branch'ine** al ve conflict'i orada çöz, main'e dokunma. Başlıkta main'in indirimi kalsın, changelog'da iki satır olsun. Şu an main'desin.",
      "Before you open a pull request, the team asks you to bring main's news into **your own branch** and solve the conflict there, without touching main. The title keeps main's sale; the changelog keeps both lines. You are on main right now.",
    ),
    goal: l(
      "`feature`'da main'i içeren bir merge commit'i olsun (indirim başlığı, iki satır); **main değişmesin**.",
      "`feature` has a merge commit that contains main (sale title, both lines); **main does not change**.",
    ),
    start: START,
    hints: [
      l("Bu sefer merge'ü alan taraf feature: önce oraya geç, sonra main'i merge et.", "This time feature is the receiving side: switch there, then merge main."),
      l("Dikkat: artık \"bizim\" taraf (ours) feature, \"onların\" taraf (theirs) main.", "Careful: now \"ours\" is feature and \"theirs\" is main."),
      l(
        "`git switch feature`, `git merge main`, `git checkout --theirs title.txt`, `nano CHANGELOG.md` (işaretleri sil), `git add .`, `git commit`",
        "`git switch feature`, `git merge main`, `git checkout --theirs title.txt`, `nano CHANGELOG.md` (delete the markers), `git add .`, `git commit`",
      ),
    ],
    par: 6,
    check: ({ state, start }) => {
      const c = mergeCommit(state);
      return Boolean(
        c &&
          currentBranch(state) === "feature" &&
          state.branches.main === start.branches.main &&
          isAncestor(state, start.branches.main!, state.branches.feature!) &&
          c.files[TITLE] === SALE &&
          hasBothLines(c.files[LOG]),
      );
    },
  },
];
