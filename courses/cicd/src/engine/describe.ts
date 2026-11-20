import type { Lang } from "@lets-explain/core/i18n";
import { fmt, type CiEvent, type Status } from "./ci";

export type Tone = "plain" | "read" | "ok" | "bad" | "produce";

export interface Line {
  text: string;
  tone: Tone;
}

const STATUS_TR: Record<Status, string> = {
  queued: "sırada",
  waiting: "onay bekliyor",
  success: "başarılı",
  failure: "başarısız",
  skipped: "atlandı",
  cancelled: "iptal edildi",
};

const EVENT_TR: Record<string, string> = { push: "push", pull_request: "pull request", schedule: "zamanlanmış", dispatch: "elle tetikleme" };
const EVENT_EN: Record<string, string> = { push: "push", pull_request: "pull request", schedule: "schedule", dispatch: "manual dispatch" };

const ERRORS: Record<string, [string, string]> = {
  "no-branch": ["Böyle bir branch yok.", "No such branch."],
  "pr-exists": ["Bu branch için zaten açık bir PR var.", "This branch already has an open PR."],
  "no-pr": ["Açık bir PR yok.", "No open PR."],
  "no-dispatch": ["Bu workflow elle tetiklenemiyor: `workflow_dispatch` yok.", "This workflow cannot be run by hand: no `workflow_dispatch`."],
  "no-schedule": ["Zamanlanmış bir workflow yok.", "No scheduled workflow."],
  "nothing-to-rerun": ["Yeniden çalıştırılacak başarısız bir run yok.", "No failed run to re-run."],
  "nothing-waiting": ["Onay bekleyen bir run yok.", "No run is waiting for approval."],
  "no-workflow": ["Böyle bir workflow yok.", "No such workflow."],
  "nothing-to-roll-back": ["Geri dönülecek önceki bir sürüm yok.", "No earlier version to roll back to."],
};

/** One plain sentence per event, in Turkish or English. */
export function describeCi(e: CiEvent, lang: Lang): Line {
  const tr = lang === "tr";
  switch (e.type) {
    case "pushed":
      return { text: tr ? `${e.branch} branch'ine push: ${e.sha} "${e.message}"` : `Pushed to ${e.branch}: ${e.sha} "${e.message}"`, tone: "produce" };
    case "triggered":
      return {
        text: tr
          ? `#${e.run} ${e.workflow} başladı (${EVENT_TR[e.event]}, ${e.branch}${e.attempt > 1 ? `, ${e.attempt}. deneme` : ""})`
          : `#${e.run} ${e.workflow} started (${EVENT_EN[e.event]}, ${e.branch}${e.attempt > 1 ? `, attempt ${e.attempt}` : ""})`,
        tone: "read",
      };
    case "notTriggered": {
      const why = {
        branch: tr ? "branch filtresine uymuyor" : "branch filter does not match",
        paths: tr ? "değişen dosyalar path filtresine uymuyor" : "changed files do not match the path filter",
        "skip-ci": tr ? "commit mesajında [skip ci] var" : "the commit message has [skip ci]",
        event: tr ? "bu olayı dinlemiyor" : "it does not listen to this event",
      }[e.reason];
      return { text: tr ? `${e.workflow} çalışmadı: ${why}` : `${e.workflow} did not run: ${why}`, tone: "plain" };
    }
    case "jobDone": {
      const reason =
        e.reason === "timeout"
          ? tr ? " (zaman aşımı)" : " (timed out)"
          : e.reason === "fail-fast"
            ? tr ? " (fail-fast: başka bir bacak kırıldı)" : " (fail-fast: another leg failed)"
            : e.reason === "needs"
              ? tr ? " (ihtiyaç duyduğu job geçmedi)" : " (a job it needs did not pass)"
              : e.reason === "if"
                ? tr ? " (if koşulu tutmadı)" : " (its if condition was false)"
                : "";
      const step = e.failedStep ? (tr ? `, kırılan adım: ${e.failedStep}${e.exit !== undefined ? ` (exit ${e.exit})` : ""}` : `, failed step: ${e.failedStep}${e.exit !== undefined ? ` (exit ${e.exit})` : ""}`) : "";
      const time = e.status === "skipped" ? "" : ` · ${fmt(e.seconds)}`;
      return {
        text: tr ? `  job ${e.job}: ${STATUS_TR[e.status]}${time}${reason}${step}` : `  job ${e.job}: ${e.status}${time}${reason}${step}`,
        tone: e.status === "success" ? "ok" : e.status === "failure" ? "bad" : "plain",
      };
    }
    case "runDone":
      return {
        text: tr
          ? `#${e.run} ${e.workflow}: ${STATUS_TR[e.status]} · ${fmt(e.seconds)} · ${e.minutes} dk faturalandı`
          : `#${e.run} ${e.workflow}: ${e.status} · ${fmt(e.seconds)} · ${e.minutes} min billed`,
        tone: e.status === "success" ? "ok" : e.status === "failure" ? "bad" : "plain",
      };
    case "cancelled":
      return { text: tr ? `#${e.run} iptal edildi: yerine #${e.by} geldi (concurrency)` : `#${e.run} cancelled: #${e.by} replaced it (concurrency)`, tone: "plain" };
    case "cache":
      return {
        text:
          e.result === "hit"
            ? tr ? `  cache bulundu: ${e.key}` : `  cache hit: ${e.key}`
            : e.result === "miss"
              ? tr ? `  cache yok: ${e.key}` : `  cache miss: ${e.key}`
              : tr ? `  cache kaydedildi: ${e.key}` : `  cache saved: ${e.key}`,
        tone: e.result === "hit" ? "ok" : e.result === "saved" ? "produce" : "plain",
      };
    case "artifact":
      return {
        text:
          e.action === "uploaded"
            ? tr ? `  artifact "${e.name}" yüklendi` : `  artifact "${e.name}" uploaded`
            : e.action === "downloaded"
              ? tr ? `  artifact "${e.name}" indirildi` : `  artifact "${e.name}" downloaded`
              : tr ? `  artifact "${e.name}" bulunamadı` : `  artifact "${e.name}" not found`,
        tone: e.action === "missing" ? "bad" : "produce",
      };
    case "imagePushed":
      return { text: tr ? `  image gönderildi: ghcr.io/ada/shop:${e.tag}` : `  image pushed: ghcr.io/ada/shop:${e.tag}`, tone: "produce" };
    case "deployed":
      return { text: tr ? `  ${e.env} artık ${e.sha} çalıştırıyor` : `  ${e.env} now runs ${e.sha}`, tone: "ok" };
    case "rolledBack":
      return { text: tr ? `${e.env} geri alındı: yine ${e.sha} çalışıyor` : `${e.env} rolled back: running ${e.sha} again`, tone: "read" };
    case "waitingApproval":
      return { text: tr ? `#${e.run} ${e.env} için onay bekliyor` : `#${e.run} is waiting for approval to deploy to ${e.env}`, tone: "read" };
    case "approved":
      return { text: tr ? `#${e.run}: ${e.env} onaylandı` : `#${e.run}: ${e.env} approved`, tone: "ok" };
    case "prOpened":
      return { text: tr ? `PR #${e.pr} açıldı: ${e.branch} → main${e.fork ? " (fork'tan)" : ""}` : `PR #${e.pr} opened: ${e.branch} → main${e.fork ? " (from a fork)" : ""}`, tone: "produce" };
    case "merged":
      return { text: tr ? `PR #${e.pr} main'e merge edildi (${e.sha})` : `PR #${e.pr} merged into main (${e.sha})`, tone: "ok" };
    case "mergeBlocked":
      return { text: tr ? `PR #${e.pr} merge edilemez: ${e.checks.join(", ")} geçmedi` : `PR #${e.pr} cannot merge: ${e.checks.join(", ")} not passing`, tone: "bad" };
    case "smoke":
      return { text: e.ok ? (tr ? `  ${e.env}/health → 200` : `  ${e.env}/health → 200`) : tr ? `  ${e.env}/health → 500` : `  ${e.env}/health → 500`, tone: e.ok ? "ok" : "bad" };
    case "notified":
      return { text: tr ? `  sohbete mesaj: ${e.text}` : `  posted to chat: ${e.text}`, tone: "read" };
    case "configChanged":
      return { text: tr ? `Ayar değişti: ${e.what}` : `Setting changed: ${e.what}`, tone: "plain" };
    case "error": {
      const msg = ERRORS[e.code] ?? [e.code, e.code];
      return { text: tr ? msg[0] : msg[1], tone: "bad" };
    }
  }
}
