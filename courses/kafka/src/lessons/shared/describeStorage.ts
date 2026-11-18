import type { StorageEvent } from "../../engine/storage";
import type { Lang } from "@lets-explain/core/i18n";
import type { EventLine } from "./describe";

const list = (xs: number[]) => xs.join(", ");

/**
 * Storage engine events in plain words, one line each, for the try-it event lists.
 * `keyName` turns a record key into a display name (compaction lessons use people's names).
 */
export function describeStorage(
  events: StorageEvent[],
  lang: Lang,
  keyName: (key: string | null) => string | null = () => null,
): EventLine[] {
  const tr = lang === "tr";
  const out: EventLine[] = [];
  for (const e of events) {
    switch (e.type) {
      case "appended": {
        const who = keyName(e.key);
        const what = e.tombstone
          ? tr
            ? `Tombstone yazıldı: ${who ?? "?"} silindi`
            : `Tombstone written: ${who ?? "?"} deleted`
          : who
            ? tr
              ? `Yazıldı: ${who}`
              : `Written: ${who}`
            : tr
              ? "Yazıldı"
              : "Written";
        out.push({ tone: e.tombstone ? "bad" : "produce", text: `${what} → offset ${e.offset} (segment ${e.segment})` });
        break;
      }
      case "rolled":
        out.push({
          tone: "ok",
          text:
            e.reason === "size"
              ? tr
                ? `Aktif segment doldu, yeni segment açıldı: segment ${e.base}`
                : `The active segment was full; new segment ${e.base} rolled`
              : e.reason === "time"
                ? tr
                  ? `Segment çok eskidi (segment.ms), yeni segment açıldı: segment ${e.base}`
                  : `The segment got too old (segment.ms); new segment ${e.base} rolled`
                : tr
                  ? `Her şeyin süresi dolmuştu: önce boş bir segment açıldı (segment ${e.base})`
                  : `Everything had expired: an empty segment ${e.base} was rolled first`,
        });
        break;
      case "ticked":
        out.push({ tone: "plain", text: tr ? `Zaman geçti: gün ${e.from} → gün ${e.to}` : `Time passed: day ${e.from} → day ${e.to}` });
        break;
      case "segmentsDeleted":
        out.push({
          tone: "bad",
          text:
            e.reason === "time"
              ? tr
                ? `Retention (süre) sildi: segment ${list(e.bases)}. Log artık offset ${e.to} ile başlıyor`
                : `Time retention deleted segment ${list(e.bases)}. The log now starts at offset ${e.to}`
              : tr
                ? `Retention (boyut) sildi: segment ${list(e.bases)}. Log artık offset ${e.to} ile başlıyor`
                : `Size retention deleted segment ${list(e.bases)}. The log now starts at offset ${e.to}`,
        });
        break;
      case "compacted": {
        const parts: string[] = [];
        if (e.removed.length) parts.push(tr ? `eski değerler silindi: offset ${list(e.removed)}` : `old values removed: offset ${list(e.removed)}`);
        if (e.tombstonesRemoved.length)
          parts.push(tr ? `süresi dolan tombstone gitti: offset ${list(e.tombstonesRemoved)}` : `expired tombstone removed: offset ${list(e.tombstonesRemoved)}`);
        if (e.merged.length) parts.push(tr ? `küçülen segment birleşti: ${list(e.merged)}` : `shrunken segment merged: ${list(e.merged)}`);
        if (parts.length === 0) parts.push(tr ? "tombstone'lar işaretlendi, silinmeleri için süre başladı" : "tombstones marked; their countdown has started");
        out.push({ tone: "ok", text: `${tr ? "Cleaner çalıştı" : "Cleaner ran"}: ${parts.join("; ")}` });
        break;
      }
      case "nothingToDo":
        out.push({
          tone: "plain",
          text:
            e.what === "compact"
              ? tr
                ? "Cleaner çalıştı ama temizlenecek bir şey yoktu (aktif segment'e dokunmaz)"
                : "The cleaner ran but found nothing to clean (it never touches the active segment)"
              : tr
                ? "Retention kontrol etti: silinecek segment yok"
                : "Retention checked: no segment to delete",
        });
        break;
      case "configured":
        out.push({ tone: "plain", text: tr ? "Ayar değişti" : "Setting changed" });
        break;
      case "error":
        out.push({ tone: "bad", text: e.message });
        break;
    }
  }
  return out;
}
