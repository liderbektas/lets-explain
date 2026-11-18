import type { Change } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { currentBranch, headId, reachable, short, status, type Repo } from "../../engine/git";

const first = (m: string) => m.split("\n")[0]!;

/** The "Ne değişti?" list between two repo states, in both languages. */
export function gitChanges(before: Repo, after: Repo): Change[] {
  const out: Change[] = [];

  const live = reachable(after);
  const newCommits = Object.keys(after.commits).filter((c) => !before.commits[c] && live.has(c));
  for (const c of newCommits.sort((a, b) => after.commits[a]!.time - after.commits[b]!.time)) {
    const commit = after.commits[c]!;
    const fetched = commit.author !== after.author;
    out.push({
      kind: "add",
      text: fetched
        ? l(`İndirilen commit \`${short(c)}\`: "${first(commit.message)}"`, `Fetched commit \`${short(c)}\`: "${first(commit.message)}"`)
        : l(
            `Yeni commit \`${short(c)}\`: "${first(commit.message)}"${commit.parents.length > 1 ? " (merge, iki ebeveyn)" : ""}`,
            `New commit \`${short(c)}\`: "${first(commit.message)}"${commit.parents.length > 1 ? " (merge, two parents)" : ""}`,
          ),
    });
  }

  const names = new Set([...Object.keys(before.branches), ...Object.keys(after.branches)]);
  for (const b of [...names].sort()) {
    const was = before.branches[b];
    const now = after.branches[b];
    if (was === now) continue;
    if (!was) out.push({ kind: "add", text: l(`\`${b}\` branch'i açıldı → \`${short(now!)}\``, `Branch \`${b}\` created → \`${short(now!)}\``) });
    else if (!now) out.push({ kind: "remove", text: l(`\`${b}\` branch'i silindi`, `Branch \`${b}\` deleted`) });
    else out.push({ kind: "change", text: l(`\`${b}\`: \`${short(was)}\` → \`${short(now)}\``, `\`${b}\`: \`${short(was)}\` → \`${short(now)}\``) });
  }

  const hb = currentBranch(before);
  const ha = currentBranch(after);
  if (hb !== ha || (!ha && headId(before) !== headId(after))) {
    out.push({
      kind: ha ? "change" : "bad",
      text: ha
        ? l(`HEAD artık \`${ha}\` branch'inde`, `HEAD is now on \`${ha}\``)
        : l(`HEAD doğrudan \`${short(headId(after)!)}\` commit'inde (detached)`, `HEAD points straight at \`${short(headId(after)!)}\` (detached)`),
    });
  }

  for (const [ref, id] of Object.entries(after.tracking)) {
    if (before.tracking[ref] !== id) out.push({ kind: "change", text: l(`\`${ref}\` → \`${short(id)}\``, `\`${ref}\` → \`${short(id)}\``) });
  }
  if (after.remote && before.remote) {
    for (const [b, id] of Object.entries(after.remote.branches)) {
      if (before.remote.branches[b] !== id) out.push({ kind: "change", text: l(`Uzakta (origin) \`${b}\` → \`${short(id)}\``, `On the remote (origin) \`${b}\` → \`${short(id)}\``) });
    }
  }
  for (const [t, id] of Object.entries(after.tags)) {
    if (before.tags[t] !== id) out.push({ kind: "add", text: l(`\`${t}\` tag'i → \`${short(id)}\``, `Tag \`${t}\` → \`${short(id)}\``) });
  }

  const lost = [...reachable(before)].filter((c) => after.commits[c] && !reachable(after).has(c));
  if (lost.length) {
    out.push({
      kind: "bad",
      text: l(`${lost.length} commit artık hiçbir branch'ten görünmüyor (reflog'da duruyor)`, `${lost.length} commit${lost.length === 1 ? " is" : "s are"} no longer on any branch (still in the reflog)`),
    });
  }

  const sb = status(before);
  const sa = status(after);
  const label = (x: { path: string }[]) => x.map((c) => `\`${c.path}\``).join(", ");
  if (JSON.stringify(sa.staged) !== JSON.stringify(sb.staged) && sa.staged.length) {
    out.push({ kind: "good", text: l(`Staging'de: ${label(sa.staged)}`, `Staged: ${label(sa.staged)}`) });
  }
  if (JSON.stringify(sa.unstaged) !== JSON.stringify(sb.unstaged) && sa.unstaged.length) {
    out.push({ kind: "change", text: l(`Klasörde değişmiş, henüz add edilmemiş: ${label(sa.unstaged)}`, `Changed in the folder, not added yet: ${label(sa.unstaged)}`) });
  }
  if (JSON.stringify(sa.untracked) !== JSON.stringify(sb.untracked) && sa.untracked.length) {
    out.push({ kind: "change", text: l(`Takip edilmeyen yeni dosya: ${sa.untracked.map((p) => `\`${p}\``).join(", ")}`, `New untracked file: ${sa.untracked.map((p) => `\`${p}\``).join(", ")}`) });
  }
  if (sa.conflicted.length && JSON.stringify(sa.conflicted) !== JSON.stringify(sb.conflicted)) {
    out.push({ kind: "bad", text: l(`Conflict: ${sa.conflicted.map((p) => `\`${p}\``).join(", ")}`, `Conflict: ${sa.conflicted.map((p) => `\`${p}\``).join(", ")}`) });
  }
  if (!sa.staged.length && !sa.unstaged.length && !sa.untracked.length && !sa.conflicted.length && (sb.staged.length || sb.unstaged.length || sb.untracked.length || sb.conflicted.length)) {
    out.push({ kind: "good", text: l("Çalışma alanı temiz: kaydedilmemiş değişiklik yok", "Working tree clean: no unsaved changes") });
  }
  if (after.stash.length !== before.stash.length) {
    out.push({
      kind: after.stash.length > before.stash.length ? "add" : "remove",
      text: l(`Stash'te ${after.stash.length} kayıt`, `${after.stash.length} entr${after.stash.length === 1 ? "y" : "ies"} in the stash`),
    });
  }
  return out;
}
