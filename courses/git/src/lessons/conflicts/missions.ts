import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { headId, status, type Repo } from "../../engine/git";
import type { GitCtx } from "../shared/GitScene";

const TITLE = "title.txt";
const LOG = "CHANGELOG.md";
const BOTH = "Şifre sıfırlama eklendi\nKaranlık tema eklendi";

/** The finished merge commit on HEAD, if the merge is done. */
function mergeCommit(repo: Repo) {
  const id = headId(repo);
  if (!id || repo.op) return null;
  const c = repo.commits[id]!;
  return c.parents.length === 2 ? c : null;
}

export const missions: Mission<GitCtx>[] = [
  {
    id: "their-title",
    title: l("Yeni isim", "The new name"),
    goal: l(
      "`feature`'ı merge et. Başlıkta feature'ın **yeni ismi** kalsın, CHANGELOG.md'de **iki satır da** olsun.",
      "Merge `feature`. Keep feature's **new name** in the title, and **both lines** in CHANGELOG.md.",
    ),
    hint: l(
      "Her conflict'li dosya için bir taraf seç; sonra hepsini birden add edip commit at.",
      "Pick a side for each conflicted file, then add them all at once and commit.",
    ),
    par: 5,
    check: ({ state }) => {
      const c = mergeCommit(state);
      return Boolean(c && c.files[TITLE] === "Online Mağaza" && c.files[LOG] === BOTH);
    },
  },
  {
    id: "abort",
    title: l("Vazgeç", "Back out"),
    goal: l(
      "Merge'ü başlat. Conflict'i görünce vazgeç: sonunda **merge sürmesin**, main eski commit'inde kalsın ve klasör temiz olsun.",
      "Start the merge. When you see the conflict, back out: in the end **no merge is running**, main is on its old commit, and the folder is clean.",
    ),
    hint: l("Yarım kalmış bir merge'ü iptal etmenin kendi komutu var.", "A half-done merge has its own command for giving up."),
    par: 2,
    check: ({ state, start, events }) =>
      events.flat().some((e) => e.type === "conflict") && !state.op && state.branches.main === start.branches.main && status(state).clean,
  },
  {
    id: "tidy",
    title: l("Bitir ve topla", "Finish and tidy up"),
    goal: l(
      "`feature`'ı merge et; bu sefer başlıkta **main'in indirimi** kalsın, CHANGELOG.md'de iki satır olsun. Sonra işi biten `feature` branch'ini sil.",
      "Merge `feature`; this time keep **main's sale** in the title and both lines in CHANGELOG.md. Then delete the finished `feature` branch.",
    ),
    hint: l(
      "Merge'ten sonra feature'ın commit'leri main'in geçmişinde; branch'i silmek onları kaybettirmez.",
      "After the merge, feature's commits are in main's history; deleting the branch does not lose them.",
    ),
    par: 6,
    check: ({ state }) => {
      const c = mergeCommit(state);
      return Boolean(c && !state.branches.feature && c.files[TITLE] === "Mağaza: Büyük indirim" && c.files[LOG] === BOTH);
    },
  },
];
