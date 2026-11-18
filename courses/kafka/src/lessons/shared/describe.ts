import type { SimEvent } from "../../engine/types";
import type { Lang } from "@lets-explain/core/i18n";

export type EventTone = "produce" | "read" | "bad" | "ok" | "plain";

export interface EventLine {
  text: string;
  tone: EventTone;
}

interface Names {
  /** Display name for a consumer group, already in the current language. */
  group: (id: string) => string;
  /** Short display for a record value, such as "sipariş 1041". */
  value: (value: string) => string;
}

const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

/**
 * Turns engine events into one line each, in plain language.
 * Consecutive reads by the same consumer are merged into one line.
 * Wording avoids Turkish case suffixes on numbers ("offset 3", not "3'e").
 */
export function describeEvents(events: SimEvent[], lang: Lang, names: Names): EventLine[] {
  const tr = lang === "tr";
  const lines: EventLine[] = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    switch (e.type) {
      case "produced":
        lines.push({
          tone: "produce",
          text: tr
            ? `Yazıldı: ${names.value(e.value)} → offset ${e.offset}`
            : `Written: ${names.value(e.value)} → offset ${e.offset}`,
        });
        break;

      case "delivered": {
        // Merge a run of deliveries to the same member.
        let j = i;
        while (j + 1 < events.length) {
          const n = events[j + 1]!;
          if (n.type !== "delivered" || n.member !== e.member || n.group !== e.group) break;
          j++;
        }
        const run = events.slice(i, j + 1) as Extract<SimEvent, { type: "delivered" }>[];
        const dups = run.filter((d) => d.duplicate).length;
        const who = names.group(e.group);
        const span = range(run[0]!.offset, run[run.length - 1]!.offset);
        const count = run.length;
        let text = tr ? `${who} okudu: offset ${span} · ${count} kayıt` : `${who} read offset ${span} · ${count} record${count > 1 ? "s" : ""}`;
        if (dups > 0) text += tr ? ` · ${dups} tanesi daha önce okunmuştu` : ` · ${dups} already read before`;
        lines.push({ text, tone: dups > 0 ? "bad" : "read" });
        i = j;
        break;
      }

      case "pollEmpty":
        lines.push({
          tone: "plain",
          text: tr ? `${names.group(e.group)} okumak istedi: yeni kayıt yok` : `${names.group(e.group)} polled: nothing new`,
        });
        break;

      case "committed": {
        const values = Object.values(e.offsets);
        const offset = values.length ? Math.max(...values) : null;
        lines.push({
          tone: "ok",
          text:
            offset === null
              ? tr
                ? `${names.group(e.group)} commit etti (henüz okuduğu bir şey yok)`
                : `${names.group(e.group)} committed (nothing read yet)`
              : tr
                ? `${names.group(e.group)} commit etti: sıradaki offset = ${offset}`
                : `${names.group(e.group)} committed: next offset = ${offset}`,
        });
        break;
      }

      case "memberJoined":
        lines.push({ tone: "ok", text: tr ? `${names.group(e.group)} başladı` : `${names.group(e.group)} started` });
        break;

      case "memberLeft": {
        const who = names.group(e.group);
        const lost = e.uncommitted
          .filter((u) => u.position > (u.committed ?? 0))
          .map((u) => range(u.committed ?? 0, u.position - 1));
        let text = e.crashed ? (tr ? `${who} çöktü!` : `${who} crashed!`) : tr ? `${who} durdu` : `${who} stopped`;
        if (lost.length) {
          text += tr
            ? ` Commit edilmemiş ilerleme kayboldu (offset ${lost.join(", ")})`
            : ` Uncommitted progress is lost (offset ${lost.join(", ")})`;
        }
        lines.push({ tone: "bad", text });
        break;
      }

      case "positionReset": {
        const who = names.group(e.group);
        const setting = "auto.offset.reset";
        lines.push({
          tone: e.reason === "out-of-range" ? "bad" : "plain",
          text:
            e.reason === "no-commit"
              ? tr
                ? `${who}: kayıtlı konum yok, ${setting} kuralıyla offset ${e.to} noktasından başlıyor`
                : `${who}: no saved position, ${setting} starts it at offset ${e.to}`
              : tr
                ? `${who}: offset ${e.from} silinmiş, ${setting} kuralıyla offset ${e.to} noktasına atladı`
                : `${who}: offset ${e.from} was deleted, ${setting} jumps it to offset ${e.to}`,
        });
        break;
      }

      case "seeked":
        lines.push({
          tone: "plain",
          text: tr
            ? `${names.group(e.group)} konumunu değiştirdi: offset ${e.from} → ${e.to}`
            : `${names.group(e.group)} moved its position: offset ${e.from} → ${e.to}`,
        });
        break;

      case "recordsDeleted":
        lines.push({
          tone: "bad",
          text: tr
            ? `Retention: offset ${range(e.from, e.to - 1)} silindi. Log artık offset ${e.to} ile başlıyor`
            : `Retention: offset ${range(e.from, e.to - 1)} deleted. The log now starts at offset ${e.to}`,
        });
        break;

      case "topicCreated":
        lines.push({ tone: "plain", text: tr ? `Topic oluşturuldu: ${e.topic}` : `Topic created: ${e.topic}` });
        break;

      case "rebalanced":
        // Single-partition lessons: assignment never changes, so this is noise.
        break;

      case "error":
        lines.push({ tone: "bad", text: e.message });
        break;
    }
  }
  return lines;
}
