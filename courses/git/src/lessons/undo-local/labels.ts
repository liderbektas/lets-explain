import { l, type L } from "@lets-explain/core/i18n";
import type { AreasLabels } from "../../iso/AreasStage";

/** Labels for the three-areas drawing, shared by the undo lessons. */
export const areasLabels = (t: (x: L) => string): AreasLabels => ({
  work: t(l("Klasör", "Folder")),
  index: t(l("Staging", "Staging")),
  repo: t(l("Repo", "Repo")),
  workSub: "working tree",
  indexSub: "index",
  repoSub: ".git (commit'ler)",
  empty: t(l("boş", "empty")),
  untracked: t(l("yeni", "new")),
  modified: t(l("değişti", "changed")),
  deleted: t(l("silindi", "deleted")),
  staged: t(l("hazır", "staged")),
  ignored: t(l("yok sayılıyor", "ignored")),
  noCommits: t(l("Henüz commit yok", "No commits yet")),
});
