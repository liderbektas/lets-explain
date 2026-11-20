import type { Lang } from "@lets-explain/core/i18n";
import { short, type GitEvent } from "./git";

export type Tone = "plain" | "read" | "ok" | "bad" | "produce";

export interface Line {
  text: string;
  tone: Tone;
}

const first = (m: string) => m.split("\n")[0]!;

/** One plain sentence per Git event, in Turkish or English, for event lists. */
export function describeGit(e: GitEvent, lang: Lang): Line {
  const tr = lang === "tr";
  switch (e.type) {
    case "wrote":
      return { text: tr ? `${e.path} ${e.created ? "oluşturuldu" : "değiştirildi"}` : `${e.path} ${e.created ? "created" : "edited"}`, tone: "plain" };
    case "removed":
      return { text: tr ? `${e.path} silindi (sadece klasörden)` : `${e.path} deleted (from the folder only)`, tone: "plain" };
    case "staged":
      return { text: tr ? `git add: ${e.paths.join(", ")} staging'e kondu` : `git add: ${e.paths.join(", ")} staged`, tone: "produce" };
    case "unstaged":
      return { text: tr ? `${e.paths.join(", ")} staging'den çıkarıldı` : `${e.paths.join(", ")} unstaged`, tone: "plain" };
    case "restored":
      return { text: tr ? `${e.path} son kaydedilmiş haline döndü` : `${e.path} put back to its saved version`, tone: "plain" };
    case "untracked":
      return { text: tr ? `${e.path} artık takip edilmiyor (dosya klasörde duruyor)` : `${e.path} is no longer tracked (the file stays)`, tone: "plain" };
    case "committed":
      return {
        text: tr
          ? `${e.merge ? "Merge commit" : e.amend ? "Commit düzeltildi (amend)" : "Commit"} ${short(e.id)}: "${first(e.message)}"${e.branch ? ` → ${e.branch}` : ""}`
          : `${e.merge ? "Merge commit" : e.amend ? "Commit amended" : "Commit"} ${short(e.id)}: "${first(e.message)}"${e.branch ? ` → ${e.branch}` : ""}`,
        tone: "ok",
      };
    case "branchCreated":
      return { text: tr ? `${e.name} branch'i ${short(e.at)} üzerinde açıldı` : `Branch ${e.name} created at ${short(e.at)}`, tone: "plain" };
    case "branchDeleted":
      return { text: tr ? `${e.name} branch'i silindi (commit'ler duruyor)` : `Branch ${e.name} deleted (its commits remain)`, tone: "plain" };
    case "branchRenamed":
      return { text: tr ? `${e.from} branch'inin adı ${e.to} oldu` : `Branch ${e.from} renamed to ${e.to}`, tone: "plain" };
    case "switched":
      return {
        text: e.detached
          ? tr ? `HEAD doğrudan ${e.to} commit'ine geçti (detached HEAD)` : `HEAD moved straight to commit ${e.to} (detached HEAD)`
          : tr ? `${e.from} → ${e.to} branch'ine geçildi` : `Switched from ${e.from} to ${e.to}`,
        tone: e.detached ? "bad" : "read",
      };
    case "fastForward":
      return { text: tr ? `Fast-forward: ${e.branch} ${short(e.from)} → ${short(e.to)} ileri kaydı, yeni commit yok` : `Fast-forward: ${e.branch} slid ${short(e.from)} → ${short(e.to)}, no new commit`, tone: "ok" };
    case "upToDate":
      return { text: tr ? "Zaten güncel: alınacak yeni commit yok" : "Already up to date: nothing new to bring in", tone: "plain" };
    case "conflict":
      return {
        text: tr ? `Conflict: ${e.paths.join(", ")} iki tarafta da değişmiş. Düzelt, add et, sonra devam et` : `Conflict: ${e.paths.join(", ")} changed on both sides. Fix, add, then continue`,
        tone: "bad",
      };
    case "resolved":
      return {
        text: tr
          ? `${e.path} için ${e.take === "ours" ? "bizim taraf" : e.take === "theirs" ? "onların tarafı" : "iki taraf birlikte"} seçildi`
          : `${e.path}: kept ${e.take === "ours" ? "our side" : e.take === "theirs" ? "their side" : "both sides"}`,
        tone: "plain",
      };
    case "aborted":
      return { text: tr ? `${e.kind} iptal edildi, her şey başladığı yere döndü` : `${e.kind} aborted; everything is back where it started`, tone: "plain" };
    case "rebased":
      return {
        text: tr
          ? `Rebase: ${e.branch} üzerindeki ${e.replayed} commit ${short(e.onto)} üstüne yeniden yazıldı${e.skipped ? ` (${e.skipped} atlandı)` : ""}`
          : `Rebase: ${e.replayed} commit${e.replayed === 1 ? "" : "s"} of ${e.branch} replayed onto ${short(e.onto)}${e.skipped ? ` (${e.skipped} skipped)` : ""}`,
        tone: "ok",
      };
    case "picked":
      return { text: tr ? `Cherry-pick: ${short(e.from)} kopyalandı, yeni commit ${short(e.id)}` : `Cherry-pick: copied ${short(e.from)} as new commit ${short(e.id)}`, tone: "ok" };
    case "reverted":
      return { text: tr ? `Revert: ${short(e.target)} değişikliğini geri alan yeni commit ${short(e.id)}` : `Revert: new commit ${short(e.id)} undoes ${short(e.target)}`, tone: "ok" };
    case "reset":
      return {
        text: tr
          ? `reset --${e.mode}: ${short(e.from)} → ${short(e.to)}${e.left.length ? `. ${e.left.length} commit artık hiçbir branch'te değil` : ""}`
          : `reset --${e.mode}: ${short(e.from)} → ${short(e.to)}${e.left.length ? `. ${e.left.length} commit${e.left.length === 1 ? " is" : "s are"} on no branch now` : ""}`,
        tone: e.mode === "hard" ? "bad" : "plain",
      };
    case "stashed":
      return { text: tr ? `${e.files} değişiklik stash'e kaldırıldı, klasör temiz` : `${e.files} change${e.files === 1 ? "" : "s"} put away in the stash; folder clean`, tone: "plain" };
    case "stashApplied":
      return { text: tr ? "Stash geri açıldı, değişiklikler klasörde" : "Stash popped; the changes are back in the folder", tone: "ok" };
    case "stashDropped":
      return { text: tr ? "Stash kaydı silindi" : "Stash entry dropped", tone: "bad" };
    case "tagged":
      return { text: tr ? `${e.name} tag'i ${short(e.at)} commit'ine kondu` : `Tag ${e.name} put on ${short(e.at)}`, tone: "ok" };
    case "fetched":
      return {
        text: e.updates.length
          ? tr ? `Fetch: ${e.updates.map((u) => `${u.ref} → ${short(u.to)}`).join(", ")}. Kendi branch'lerin değişmedi` : `Fetch: ${e.updates.map((u) => `${u.ref} → ${short(u.to)}`).join(", ")}. Your own branches did not move`
          : tr ? "Fetch: uzakta yeni bir şey yok" : "Fetch: nothing new on the remote",
        tone: "read",
      };
    case "pushed":
      return {
        text: tr
          ? `Push: origin/${e.branch} ${e.from ? short(e.from) : "(yeni)"} → ${short(e.to)}${e.forced ? " (zorla, uzaktaki commit'lerin üstüne yazıldı)" : ""}`
          : `Push: origin/${e.branch} ${e.from ? short(e.from) : "(new)"} → ${short(e.to)}${e.forced ? " (forced, overwrote remote commits)" : ""}`,
        tone: e.forced ? "bad" : "ok",
      };
    case "pushRejected":
      return {
        text:
          e.reason === "non-fast-forward"
            ? tr ? `Push reddedildi: origin/${e.branch} ilerlemiş. Önce pull ile onların commit'lerini al` : `Push rejected: origin/${e.branch} has moved on. Pull their commits first`
            : e.reason === "stale"
              ? tr ? `--force-with-lease reddetti: uzakta görmediğin bir commit var` : `--force-with-lease refused: the remote has a commit you have not seen`
              : tr ? `Push reddedildi: ${e.branch}'in uzakta karşılığı yok. İlk seferde -u ile gönder` : `Push rejected: ${e.branch} has no upstream yet. Use -u the first time`,
        tone: "bad",
      };
    case "teammatePushed":
      return { text: tr ? `Takım arkadaşın origin/${e.branch}'e push etti: "${first(e.message)}"` : `Your teammate pushed to origin/${e.branch}: "${first(e.message)}"`, tone: "produce" };
    case "bisectTesting":
      return { text: tr ? `Bisect: ${short(e.id)} test ediliyor (${e.left} aday kaldı)` : `Bisect: testing ${short(e.id)} (${e.left} candidates left)`, tone: "read" };
    case "bisectFound":
      return { text: tr ? `Bisect buldu: hatayı ilk getiren commit ${short(e.id)}` : `Bisect found it: the first bad commit is ${short(e.id)}`, tone: "ok" };
    case "bisectDone":
      return { text: tr ? `Bisect bitti, ${e.back}'e dönüldü` : `Bisect finished; back on ${e.back}`, tone: "plain" };
    case "error":
      return { text: tr ? `Git: ${e.message}` : `Git: ${e.message}`, tone: "bad" };
  }
}
