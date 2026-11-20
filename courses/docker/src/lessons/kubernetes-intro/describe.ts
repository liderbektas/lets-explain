import type { Change } from "@lets-explain/core/course/types";
import { l, type Lang } from "@lets-explain/core/i18n";
import type { Cluster, KubeEvent } from "./model";

export interface Line {
  text: string;
  tone: "plain" | "read" | "ok" | "bad" | "produce";
}

const WHY_TR = { deploy: "Deployment istedi", heal: "eksik kopya tamamlandı", scale: "ölçeklendi", rollout: "yeni sürüm" } as const;
const WHY_EN = { deploy: "the Deployment asked", heal: "a missing copy was replaced", scale: "scaled", rollout: "new version" } as const;

/** One sentence per cluster event, in Turkish or English. */
export function describeKube(e: KubeEvent, lang: Lang): Line {
  const tr = lang === "tr";
  switch (e.type) {
    case "podCreated":
      return { text: tr ? `Pod ${e.id} ${e.node} üzerinde başladı (${e.version}, ${WHY_TR[e.why]})` : `Pod ${e.id} started on ${e.node} (${e.version}, ${WHY_EN[e.why]})`, tone: e.why === "heal" ? "ok" : "produce" };
    case "podGone":
      return {
        text: tr
          ? `Pod ${e.id} ${e.why === "killed" ? "silindi" : e.why === "node" ? "node'uyla birlikte gitti" : e.why === "rollout" ? "eski sürüm olarak kapatıldı" : "fazla olduğu için kapatıldı"}`
          : `Pod ${e.id} ${e.why === "killed" ? "was deleted" : e.why === "node" ? "went down with its node" : e.why === "rollout" ? "was retired as the old version" : "was removed as extra"}`,
        tone: e.why === "killed" || e.why === "node" ? "bad" : "plain",
      };
    case "nodeChanged":
      return { text: tr ? `${e.node} ${e.up ? "geri geldi" : "çöktü (NotReady)"}` : `${e.node} ${e.up ? "is back" : "went down (NotReady)"}`, tone: e.up ? "ok" : "bad" };
    case "scaled":
      return { text: tr ? `Deployment ${e.from} → ${e.to} kopya` : `Deployment scaled ${e.from} → ${e.to} replicas`, tone: "plain" };
    case "exposed":
      return { text: tr ? "Service web açıldı: pod'lar tek bir adresin arkasında" : "Service web created: the pods sit behind one address", tone: "ok" };
    case "rolledOut":
      return { text: tr ? `Rolling update bitti: bütün pod'lar ${e.version}` : `Rolling update done: every pod is ${e.version}`, tone: "ok" };
    case "served":
      return { text: tr ? `curl web → ${e.pod} cevap verdi (${e.version})` : `curl web → answered by ${e.pod} (${e.version})`, tone: "read" };
    case "curlFailed":
      if (e.why === "no-forward")
        return { text: tr ? "curl başarısız: o port cluster'a açık değil (port-forward yok)" : "curl failed: that port isn't open to the cluster (no port-forward)", tone: "bad" };
      return { text: tr ? `curl web başarısız: ${e.why === "no-service" ? "Service yok" : "çalışan pod yok"}` : `curl web failed: ${e.why === "no-service" ? "no Service" : "no running pods"}`, tone: "bad" };
    case "forwarding":
      return { text: tr ? `port-forward: localhost:${e.port} → Service web` : `port-forward: localhost:${e.port} → Service web`, tone: "read" };
    case "error":
      return { text: `Error: ${e.message}`, tone: "bad" };
  }
}

/** "What changed" between two cluster states. */
export function clusterChanges(before: Cluster, after: Cluster): Change[] {
  const out: Change[] = [];
  if (before.desired !== after.desired && after.desired !== null) {
    out.push({ kind: "change", text: l(`İstenen kopya: ${before.desired ?? 0} → ${after.desired}`, `Desired replicas: ${before.desired ?? 0} → ${after.desired}`) });
  }
  const was = new Set(before.pods.map((p) => p.id));
  const now = new Set(after.pods.map((p) => p.id));
  const added = after.pods.filter((p) => !was.has(p.id));
  const gone = before.pods.filter((p) => !now.has(p.id));
  if (added.length) out.push({ kind: "add", text: l(`${added.length} yeni pod: ${added.map((p) => `\`${p.id}\` (${p.node})`).join(", ")}`, `${added.length} new pod${added.length === 1 ? "" : "s"}: ${added.map((p) => `\`${p.id}\` (${p.node})`).join(", ")}`) });
  if (gone.length) out.push({ kind: "remove", text: l(`${gone.length} pod gitti`, `${gone.length} pod${gone.length === 1 ? "" : "s"} gone`) });
  for (const n of after.nodes) {
    const old = before.nodes.find((x) => x.name === n.name)!;
    if (old.up !== n.up) out.push({ kind: n.up ? "good" : "bad", text: l(`\`${n.name}\` ${n.up ? "geri geldi" : "çöktü"}`, `\`${n.name}\` ${n.up ? "is back" : "went down"}`) });
  }
  if (!before.service && after.service) out.push({ kind: "add", text: l("Service `web`", "Service `web`") });
  if (before.version !== after.version) out.push({ kind: "change", text: l(`Image sürümü: ${before.version} → ${after.version}`, `Image version: ${before.version} → ${after.version}`) });
  if (after.desired !== null && after.pods.length === after.desired && (added.length || gone.length)) {
    out.push({ kind: "good", text: l(`Çalışan = istenen (${after.desired})`, `Running = desired (${after.desired})`) });
  }
  return out;
}
