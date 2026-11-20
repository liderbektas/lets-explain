import type { Lang } from "@lets-explain/core/i18n";
import type { DockerEvent } from "./docker";

export type Tone = "plain" | "read" | "ok" | "bad" | "produce";

export interface Line {
  text: string;
  tone: Tone;
}

const EXIT_TR: Record<string, string> = {
  done: "işini bitirdi",
  error: "hata verdi",
  stopped: "durduruldu",
  killed: "öldürüldü (SIGKILL)",
  oom: "bellek sınırını aştı, OOM ile öldürüldü",
  "not-found": "komut bulunamadı",
  permission: "izin hatası",
};
const EXIT_EN: Record<string, string> = {
  done: "finished its job",
  error: "failed",
  stopped: "was stopped",
  killed: "was killed (SIGKILL)",
  oom: "went over its memory limit and was OOM-killed",
  "not-found": "command not found",
  permission: "permission denied",
};

/** One plain sentence per Docker event, in Turkish or English. */
export function describeDocker(e: DockerEvent, lang: Lang): Line {
  const tr = lang === "tr";
  switch (e.type) {
    case "pulled":
      return { text: tr ? `${e.ref} indirildi (${e.layers} layer${e.reused ? `, ${e.reused}'i zaten vardı` : ""})` : `Pulled ${e.ref} (${e.layers} layers${e.reused ? `, ${e.reused} already here` : ""})`, tone: "produce" };
    case "pushed":
      return { text: tr ? `${e.ref} registry'ye gönderildi (${e.layers - e.skipped} yeni layer, ${e.skipped} zaten vardı)` : `Pushed ${e.ref} (${e.layers - e.skipped} new layers, ${e.skipped} already there)`, tone: "ok" };
    case "tagged":
      return { text: tr ? `${e.target} etiketi ${e.source} ile aynı image'ı gösteriyor` : `Tag ${e.target} now points at the same image as ${e.source}`, tone: "plain" };
    case "imageRemoved":
      return { text: e.untaggedOnly ? (tr ? `${e.ref} etiketi kaldırıldı (image başka etiketle duruyor)` : `Untagged ${e.ref} (the image stays under another tag)`) : tr ? `${e.ref} image'ı silindi` : `Removed image ${e.ref}`, tone: "plain" };
    case "buildStep":
      return {
        text: e.step.text.startsWith("FROM")
          ? `${e.step.index}. ${e.step.text}`
          : e.step.cached
            ? tr ? `${e.step.index}. ${e.step.text}: CACHED` : `${e.step.index}. ${e.step.text}: CACHED`
            : tr ? `${e.step.index}. ${e.step.text}: çalıştı (${e.step.seconds}s)` : `${e.step.index}. ${e.step.text}: ran (${e.step.seconds}s)`,
        tone: e.step.cached ? "ok" : "produce",
      };
    case "built":
      return { text: tr ? `Build bitti: ${e.tag}, ${e.size} MB, ${e.seconds} saniye (${e.cached}/${e.total} adım cache'ten)` : `Built ${e.tag}: ${e.size} MB in ${e.seconds}s (${e.cached}/${e.total} steps from cache)`, tone: "ok" };
    case "created":
      return { text: tr ? `Container ${e.name} oluşturuldu (${e.ref})` : `Created container ${e.name} (${e.ref})`, tone: "plain" };
    case "started":
      return { text: tr ? `${e.name} başladı` : `${e.name} started`, tone: "read" };
    case "log":
      return { text: `${e.name} | ${e.line}`, tone: "plain" };
    case "exited":
      return { text: tr ? `${e.name} kapandı, exit code ${e.code}: ${EXIT_TR[e.reason]}` : `${e.name} exited with code ${e.code}: ${EXIT_EN[e.reason]}`, tone: e.code === 0 ? "plain" : "bad" };
    case "removed":
      return { text: tr ? `${e.name} silindi${e.volumes.length ? ` (anonim volume'u da)` : ""}` : `${e.name} removed${e.volumes.length ? " (and its anonymous volume)" : ""}`, tone: "plain" };
    case "healthy":
      return { text: tr ? `${e.name} sağlıklı (healthcheck geçti)` : `${e.name} is healthy (healthcheck passed)`, tone: "ok" };
    case "restarting":
      return { text: tr ? `${e.name} restart policy ile yeniden başlatılıyor (${e.count}. kez)` : `${e.name} restarted by its restart policy (#${e.count})`, tone: "bad" };
    case "execOutput":
      return { text: `${e.name} $ ${e.cmd}${e.output.length ? ` → ${e.output.join(" · ")}` : ""}`, tone: e.code === 0 ? "read" : "bad" };
    case "wrote":
      return {
        text: tr
          ? `${e.name} ${e.path} dosyasını yazdı: ${e.where === "layer" ? "container'ın kendi katmanına (container silinince gider)" : e.where === "volume" ? `'${e.source}' volume'una` : `host'taki ${e.source} klasörüne`}`
          : `${e.name} wrote ${e.path}: ${e.where === "layer" ? "into its own layer (gone with the container)" : e.where === "volume" ? `to volume '${e.source}'` : `to ${e.source} on the host`}`,
        tone: e.where === "layer" ? "plain" : "ok",
      };
    case "hostEdited":
      if (e.removed) return { text: tr ? `Host'ta ${e.path} silindi` : `Deleted ${e.path} on the host`, tone: "plain" };
      return { text: tr ? `Host'ta ${e.path} değiştirildi` : `Edited ${e.path} on the host`, tone: "plain" };
    case "curlResult":
      return { text: `curl localhost:${e.port} → ${e.body}`, tone: e.ok ? "ok" : "bad" };
    case "volumeCreated":
      return { text: tr ? `Volume '${e.name}' oluşturuldu` : `Volume '${e.name}' created`, tone: "plain" };
    case "volumeRemoved":
      return { text: tr ? `Volume '${e.name}' silindi, içindeki veriyle birlikte` : `Volume '${e.name}' removed, with its data`, tone: "bad" };
    case "networkCreated":
      return { text: tr ? `Network '${e.name}' oluşturuldu` : `Network '${e.name}' created`, tone: "plain" };
    case "connected":
      return { text: tr ? `${e.name} '${e.network}' ağına bağlandı` : `${e.name} joined network '${e.network}'`, tone: "plain" };
    case "pruned":
      return {
        text: tr
          ? `Temizlik: ${e.containers.length} container, ${e.images.length} image, ${e.volumes.length} volume, ${e.networks.length} network silindi`
          : `Pruned ${e.containers.length} containers, ${e.images.length} images, ${e.volumes.length} volumes, ${e.networks.length} networks`,
        tone: "plain",
      };
    case "daemonRestarted":
      return { text: tr ? `Docker daemon yeniden başladı. Geri gelen: ${e.started.join(", ") || "hiçbiri"}` : `Docker daemon restarted. Back up: ${e.started.join(", ") || "none"}`, tone: "plain" };
    case "upstreamReleased":
      return { text: tr ? `Registry'de ${e.ref} artık başka bir image: "${e.note}"` : `On the registry, ${e.ref} is now a different image: "${e.note}"`, tone: "bad" };
    case "composeUp":
      return { text: tr ? `compose up (${e.project}): ${e.services.join(" → ")}` : `compose up (${e.project}): ${e.services.join(" → ")}`, tone: "ok" };
    case "composeWaiting":
      return { text: tr ? `${e.service}, ${e.for} sağlıklı olana kadar bekliyor` : `${e.service} waits until ${e.for} is healthy`, tone: "plain" };
    case "composeDown":
      return { text: tr ? `compose down (${e.project}): ${e.removed.length} container silindi${e.volumes.length ? `, volume'lar da: ${e.volumes.join(", ")}` : ", volume'lar duruyor"}` : `compose down (${e.project}): ${e.removed.length} containers removed${e.volumes.length ? `, volumes too: ${e.volumes.join(", ")}` : ", volumes kept"}`, tone: "plain" };
    case "error":
      return { text: e.message, tone: "bad" };
  }
}
