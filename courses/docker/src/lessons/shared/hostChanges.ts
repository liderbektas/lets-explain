import type { Change } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { Host } from "../../engine/docker";

/** The "Ne değişti?" list between two host states, in both languages. */
export function hostChanges(before: Host, after: Host): Change[] {
  const out: Change[] = [];
  const tagsBefore = new Set(Object.keys(before.tags));
  for (const t of Object.keys(after.tags)) if (!tagsBefore.has(t)) out.push({ kind: "add", text: l(`Image \`${t}\` bu makinede`, `Image \`${t}\` is on this machine`) });
  for (const t of tagsBefore) if (!after.tags[t]) out.push({ kind: "remove", text: l(`\`${t}\` etiketi gitti`, `Tag \`${t}\` is gone`) });
  if (after.lastBuild && after.lastBuild !== before.lastBuild && JSON.stringify(after.lastBuild) !== JSON.stringify(before.lastBuild)) {
    const b = after.lastBuild;
    out.push({ kind: "good", text: l(`Build: ${b.size} MB, ${b.seconds} saniye, ${b.cached} adım cache'ten`, `Build: ${b.size} MB, ${b.seconds}s, ${b.cached} steps from cache`) });
  }

  const byName = (h: Host) => new Map(Object.values(h.containers).map((c) => [c.name, c]));
  const was = byName(before);
  const now = byName(after);
  for (const [name, c] of now) {
    const old = was.get(name);
    if (!old || old.id !== c.id) out.push({ kind: "add", text: l(`Container \`${name}\` (${c.ref.replace(/:latest$/, "")})`, `Container \`${name}\` (${c.ref.replace(/:latest$/, "")})`) });
    if (old && old.id === c.id && old.state !== c.state) {
      out.push({
        kind: c.state === "running" ? "good" : c.exitCode === 0 ? "change" : "bad",
        text: c.state === "running" ? l(`\`${name}\` çalışıyor`, `\`${name}\` is running`) : l(`\`${name}\` durdu, exit code ${c.exitCode}`, `\`${name}\` stopped, exit code ${c.exitCode}`),
      });
    } else if ((!old || old.id !== c.id) && c.state === "exited") {
      out.push({ kind: c.exitCode === 0 ? "change" : "bad", text: l(`\`${name}\` hemen kapandı, exit code ${c.exitCode}`, `\`${name}\` exited right away, code ${c.exitCode}`) });
    }
    if (old && old.id === c.id && old.restarts !== c.restarts) out.push({ kind: "bad", text: l(`\`${name}\` yeniden başlatıldı (${c.restarts}. kez)`, `\`${name}\` restarted (#${c.restarts})`) });
    if (old && old.id === c.id && old.health !== c.health && c.health === "healthy") out.push({ kind: "good", text: l(`\`${name}\` sağlıklı`, `\`${name}\` is healthy`) });
  }
  for (const [name, c] of was) if (!now.has(name) || now.get(name)!.id !== c.id) out.push({ kind: "remove", text: l(`Container \`${name}\` silindi`, `Container \`${name}\` removed`) });

  for (const v of Object.keys(after.volumes)) if (!before.volumes[v]) out.push({ kind: "add", text: l(`Volume \`${after.volumes[v]!.anonymous ? "anonim" : v}\``, `Volume \`${after.volumes[v]!.anonymous ? "anonymous" : v}\``) });
  for (const v of Object.keys(before.volumes)) if (!after.volumes[v]) out.push({ kind: "remove", text: l(`Volume \`${before.volumes[v]!.anonymous ? "anonim" : v}\` silindi`, `Volume \`${before.volumes[v]!.anonymous ? "anonymous" : v}\` removed`) });
  for (const n of Object.keys(after.networks)) if (!before.networks[n]) out.push({ kind: "add", text: l(`Network \`${n}\``, `Network \`${n}\``) });
  for (const n of Object.keys(before.networks)) if (!after.networks[n]) out.push({ kind: "remove", text: l(`Network \`${n}\` silindi`, `Network \`${n}\` removed`) });
  return out;
}
