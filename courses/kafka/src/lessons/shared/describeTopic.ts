import type { SimEvent } from "../../engine/types";
import type { Lang } from "@lets-explain/core/i18n";
import type { EventLine } from "./describe";

interface Names {
  /** Display name for a consumer (member id), already in the current language. */
  member: (group: string, member: string) => string;
  /** Short display for a record value, such as "sipariş 1041". */
  value: (value: string) => string;
  /** Display for a key, or null to leave keys out. */
  key?: (key: string) => string;
}

const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
const pName = (tp: string) => `P${tp.slice(tp.lastIndexOf("-") + 1)}`;

/**
 * Event lines for multi-partition lessons: like `describeEvents`, but every line names
 * the partition, and rebalances say who got what.
 */
export function describeTopicEvents(events: SimEvent[], lang: Lang, names: Names): EventLine[] {
  const tr = lang === "tr";
  const lines: EventLine[] = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    switch (e.type) {
      case "produced": {
        const key = e.key !== null && names.key ? ` (key ${names.key(e.key)})` : "";
        const how =
          e.routedBy === "key"
            ? tr
              ? "key'in hash'i"
              : "key hash"
            : e.routedBy === "explicit"
              ? tr
                ? "elle seçildi"
                : "chosen by hand"
              : tr
                ? "key yok, sırayla"
                : "no key, in turn";
        lines.push({
          tone: "produce",
          text: tr
            ? `Yazıldı: ${names.value(e.value)}${key} → P${e.partition}, offset ${e.offset} · ${how}`
            : `Written: ${names.value(e.value)}${key} → P${e.partition}, offset ${e.offset} · ${how}`,
        });
        break;
      }

      case "delivered": {
        // One read can walk several partitions in turn; merge the run and give one line per partition.
        let j = i;
        while (j + 1 < events.length) {
          const n = events[j + 1]!;
          if (n.type !== "delivered" || n.member !== e.member || n.group !== e.group) break;
          j++;
        }
        const run = events.slice(i, j + 1) as Extract<SimEvent, { type: "delivered" }>[];
        const byTp = new Map<string, typeof run>();
        for (const d of run) byTp.set(d.tp, [...(byTp.get(d.tp) ?? []), d]);
        const who = names.member(e.group, e.member);
        for (const [tpName, ds] of byTp) {
          const dups = ds.filter((d) => d.duplicate).length;
          const span = range(ds[0]!.offset, ds[ds.length - 1]!.offset);
          let text = tr ? `${who} okudu: ${pName(tpName)}, offset ${span}` : `${who} read ${pName(tpName)}, offset ${span}`;
          if (dups > 0) text += tr ? ` · ${dups} tanesi daha önce okunmuştu` : ` · ${dups} already read before`;
          lines.push({ text, tone: dups > 0 ? "bad" : "read" });
        }
        i = j;
        break;
      }

      case "pollEmpty":
        lines.push({
          tone: "plain",
          text: tr
            ? `${names.member(e.group, e.member)} okumak istedi: yeni kayıt yok`
            : `${names.member(e.group, e.member)} polled: nothing new`,
        });
        break;

      case "committed": {
        const parts = Object.entries(e.offsets).map(([p, o]) => `${pName(p)}=${o}`);
        lines.push({
          tone: "ok",
          text: parts.length
            ? tr
              ? `${names.member(e.group, e.member)} commit etti: ${parts.join(", ")}`
              : `${names.member(e.group, e.member)} committed: ${parts.join(", ")}`
            : tr
              ? `${names.member(e.group, e.member)} commit etti (okuduğu bir şey yok)`
              : `${names.member(e.group, e.member)} committed (nothing read)`,
        });
        break;
      }

      case "memberJoined":
        lines.push({
          tone: "ok",
          text: tr ? `${names.member(e.group, e.member)} group'a katıldı` : `${names.member(e.group, e.member)} joined the group`,
        });
        break;

      case "memberLeft": {
        const who = names.member(e.group, e.member);
        const lost = e.uncommitted
          .filter((u) => u.position > (u.committed ?? 0))
          .map((u) => `${pName(u.tp)} ${range(u.committed ?? 0, u.position - 1)}`);
        let text = e.crashed ? (tr ? `${who} çöktü!` : `${who} crashed!`) : tr ? `${who} group'tan ayrıldı` : `${who} left the group`;
        if (lost.length) {
          text += tr ? ` Commit edilmemiş ilerleme: ${lost.join(", ")}` : ` Uncommitted progress: ${lost.join(", ")}`;
        }
        lines.push({ tone: "bad", text });
        break;
      }

      case "rebalanced": {
        const parts = Object.entries(e.assignment).map(
          ([m, tps]) => `${names.member(e.group, m)}: ${tps.length ? tps.map(pName).join("+") : tr ? "boşta" : "idle"}`,
        );
        lines.push({
          tone: "plain",
          text: tr ? `Rebalance: ${parts.join(" · ") || "kimse yok"}` : `Rebalance: ${parts.join(" · ") || "nobody"}`,
        });
        break;
      }

      case "positionReset":
        lines.push({
          tone: "plain",
          text: tr
            ? `${names.member(e.group, e.member)}: ${pName(e.tp)} için kayıtlı konum yok, offset ${e.to} noktasından başlıyor`
            : `${names.member(e.group, e.member)}: no saved position on ${pName(e.tp)}, starting at offset ${e.to}`,
        });
        break;

      case "partitionsAdded":
        lines.push({
          tone: "ok",
          text: tr
            ? `Topic büyüdü: ${e.from} → ${e.to} partition`
            : `Topic grew: ${e.from} → ${e.to} partitions`,
        });
        break;

      case "error":
        lines.push({ tone: "bad", text: e.message });
        break;

      default:
        break;
    }
  }
  return lines;
}
