import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "@lets-explain/core/course/types";

export type { GlossaryEntry };

/** Terms stay in English in both languages: that is what Git prints and what docs use. */
const core: Record<string, GlossaryEntry> = {
  repository: {
    term: "Repository",
    def: l(
      "Projenin bütün geçmişini tutan veritabanı. Klasördeki gizli `.git` dizinidir.",
      "The database that holds a project's whole history: the hidden `.git` folder.",
    ),
  },
  workingTree: {
    term: "Working tree",
    def: l("Dosyaları düzenlediğin normal proje klasörü.", "The ordinary project folder where you edit files."),
  },
  index: {
    term: "Staging area",
    def: l(
      "Bir sonraki commit'in hazırlandığı yer. Index de denir. `git add` dosyaları buraya koyar.",
      "Where the next commit is put together, also called the index. `git add` puts files here.",
    ),
  },
  commit: {
    term: "Commit",
    def: l(
      "Projenin o anki tam fotoğrafı: dosyalar, mesaj, yazar, zaman ve bir önceki commit'e bağlantı.",
      "A full snapshot of the project at one moment: files, message, author, time and a link to the previous commit.",
    ),
  },
  hash: {
    term: "Commit id (hash)",
    def: l(
      "Commit'in içeriğinden hesaplanan 40 karakterlik kimlik. İçerik değişirse kimlik de değişir.",
      "A 40-character id computed from a commit's content. Change the content and the id changes.",
    ),
  },
  branch: {
    term: "Branch",
    def: l(
      "Bir commit'i gösteren, taşınabilir bir isim. Yeni commit atınca bulunduğun branch onu göstermeye kayar.",
      "A movable name that points at a commit. When you commit, the branch you are on moves to the new commit.",
    ),
  },
  head: {
    term: "HEAD",
    def: l(
      "Şu an nerede olduğunu gösteren işaret. Genelde bir branch'i gösterir; o branch da bir commit'i.",
      "The marker for where you are now. Usually it points at a branch, which points at a commit.",
    ),
  },
  merge: {
    term: "Merge",
    def: l("İki branch'in değişikliklerini birleştirmek.", "Combining the changes of two branches."),
  },
  conflict: {
    term: "Conflict",
    def: l(
      "İki tarafın aynı yeri farklı değiştirdiği, Git'in kendi başına seçemediği durum.",
      "When both sides changed the same place differently and Git cannot choose on its own.",
    ),
  },
  rebase: {
    term: "Rebase",
    def: l(
      "Commit'leri başka bir commit'in üstünde yeniden oynatmak. Commit'ler yeni kimlikler alır.",
      "Replaying commits on top of another commit. The commits get new ids.",
    ),
  },
  remote: {
    term: "Remote",
    def: l(
      "Başka bir yerdeki aynı repository, örneğin GitHub'daki kopya. Varsayılan adı `origin`.",
      "The same repository somewhere else, such as the copy on GitHub. Its default name is `origin`.",
    ),
  },
  reflog: {
    term: "Reflog",
    def: l(
      "HEAD'in son zamanlarda nerelerde olduğunun yerel kaydı. Kaybolmuş commit'leri bulmayı sağlar.",
      "A local record of where HEAD has recently been. It lets you find commits that seem lost.",
    ),
  },
};

const extra = import.meta.glob<{ terms?: Record<string, GlossaryEntry> }>("./lessons/*/terms.ts", { eager: true });

export const glossary: Record<string, GlossaryEntry> = Object.assign({}, ...Object.values(extra).map((m) => m.terms ?? {}), core);
