import type { REvent } from "../../engine/replication";
import type { Lang } from "@lets-explain/core/i18n";
import type { EventLine } from "../shared/describe";

const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

/** Display name for a record value such as "order:1041". */
export function valueText(value: string, lang: Lang) {
  const [kind, id] = value.split(":");
  if (!id) return value;
  const tr = lang === "tr";
  if (kind === "order") return `${tr ? "sipariş" : "order"} ${id}`;
  return `${kind} ${id}`;
}

/**
 * Replication engine events, one plain line each. Partition names are written "P1";
 * Turkish case suffixes on numbers and names are avoided ("P1 için", not "P1'in").
 */
export function describeReplicated(events: REvent[], lang: Lang, pname: (index: number) => string = (i) => `P${i}`): EventLine[] {
  const tr = lang === "tr";
  const lines: EventLine[] = [];
  for (const e of events) {
    switch (e.type) {
      case "produced":
        lines.push({
          tone: "produce",
          text: tr
            ? `Yazıldı: ${valueText(e.value, lang)} → ${pname(e.partition)} · offset ${e.offset} (broker ${e.leader})`
            : `Written: ${valueText(e.value, lang)} → ${pname(e.partition)} · offset ${e.offset} (broker ${e.leader})`,
        });
        break;
      case "rejected":
        lines.push({
          tone: "bad",
          text:
            e.reason === "offline"
              ? tr
                ? `Yazılamadı: ${pname(e.partition)} için ayakta leader yok (offline)`
                : `Write failed: ${pname(e.partition)} has no live leader (offline)`
              : tr
                ? `Reddedildi: NotEnoughReplicas. ${pname(e.partition)} ISR listesinde ${e.isr} kopya var, yetmiyor`
                : `Rejected: NotEnoughReplicas. ${pname(e.partition)} has ${e.isr} in the ISR, not enough`,
        });
        break;
      case "acked":
        lines.push({
          tone: "ok",
          text: tr
            ? `Producer onay aldı (acks=${e.acks}): ${pname(e.partition)} · offset ${e.offset}`
            : `Producer got the ack (acks=${e.acks}): ${pname(e.partition)} · offset ${e.offset}`,
        });
        break;
      case "sendFailed":
        lines.push({
          tone: "bad",
          text:
            e.reason === "leaderChanged"
              ? tr
                ? `Onay gelmedi: leader değişti, producer hata alır ve yeniden dener (${valueText(e.value, lang)})`
                : `No ack: the leader changed, so the producer gets an error and retries (${valueText(e.value, lang)})`
              : tr
                ? `Hata: NotEnoughReplicasAfterAppend. Kayıt yazıldı ama yeterli kopyaya ulaşmadı`
                : `Error: NotEnoughReplicasAfterAppend. The record was written but did not reach enough copies`,
        });
        break;
      case "replicated":
        lines.push({
          tone: "read",
          text: tr
            ? `Broker ${e.broker} kopyaladı: ${pname(e.partition)} · offset ${range(e.from, e.to - 1)}`
            : `Broker ${e.broker} copied ${pname(e.partition)} · offset ${range(e.from, e.to - 1)}`,
        });
        break;
      case "hwAdvanced":
        lines.push({
          tone: "ok",
          text: tr
            ? `High watermark ilerledi: ${pname(e.partition)} · ${e.from} → ${e.to}. Consumer'lar artık offset ${e.to - 1} dahil okuyabilir`
            : `High watermark moved: ${pname(e.partition)} · ${e.from} → ${e.to}. Consumers can now read up to offset ${e.to - 1}`,
        });
        break;
      case "brokerDown":
        lines.push({ tone: "bad", text: tr ? `Broker ${e.broker} çöktü!` : `Broker ${e.broker} crashed!` });
        break;
      case "brokerUp":
        lines.push({ tone: "ok", text: tr ? `Broker ${e.broker} yeniden açıldı` : `Broker ${e.broker} is back up` });
        break;
      case "brokerAdded":
        lines.push({ tone: "ok", text: tr ? `Broker ${e.broker} cluster'a katıldı (henüz boş)` : `Broker ${e.broker} joined the cluster (empty so far)` });
        break;
      case "slowChanged":
        lines.push({
          tone: e.slow ? "bad" : "ok",
          text: e.slow
            ? tr
              ? `Broker ${e.broker} yavaşladı: kopyalamayı bıraktı`
              : `Broker ${e.broker} slowed down: it stopped copying`
            : tr
              ? `Broker ${e.broker} normale döndü`
              : `Broker ${e.broker} is back to normal`,
        });
        break;
      case "isrShrink":
        lines.push({
          tone: "bad",
          text: tr
            ? `Broker ${e.broker}, ${pname(e.partition)} ISR listesinden çıktı (${e.reason === "crashed" ? "çöktü" : "geride kaldı"})`
            : `Broker ${e.broker} left the ${pname(e.partition)} ISR (${e.reason === "crashed" ? "crashed" : "fell behind"})`,
        });
        break;
      case "isrExpand":
        lines.push({
          tone: "ok",
          text: tr
            ? `Broker ${e.broker} yetişti ve ${pname(e.partition)} ISR listesine geri girdi`
            : `Broker ${e.broker} caught up and rejoined the ${pname(e.partition)} ISR`,
        });
        break;
      case "leaderElected":
        lines.push({
          tone: e.clean ? "ok" : "bad",
          text: e.clean
            ? tr
              ? `${pname(e.partition)} için leader artık broker ${e.to}`
              : `Broker ${e.to} is now the ${pname(e.partition)} leader`
            : tr
              ? `Unclean seçim: ${pname(e.partition)} leader'ı ISR dışından broker ${e.to} oldu`
              : `Unclean election: broker ${e.to}, from outside the ISR, now leads ${pname(e.partition)}`,
        });
        break;
      case "offline":
        lines.push({
          tone: "bad",
          text: tr
            ? `${pname(e.partition)} offline: ayakta senkron kopya kalmadı, okuma ve yazma durdu`
            : `${pname(e.partition)} is offline: no in-sync copy is up, reads and writes stop`,
        });
        break;
      case "truncated":
        lines.push({
          tone: "bad",
          text: tr
            ? `Broker ${e.broker}, ${pname(e.partition)} log'unu leader'a uydurdu: offset ${range(e.from, e.to - 1)} silindi`
            : `Broker ${e.broker} trimmed its ${pname(e.partition)} log to match the leader: offset ${range(e.from, e.to - 1)} removed`,
        });
        break;
      case "lost":
        lines.push({
          tone: "bad",
          text: tr
            ? `VERİ KAYBI: producer'a "tamam" denmiş ${valueText(e.value, lang)} artık hiçbir leader'da yok`
            : `DATA LOSS: ${valueText(e.value, lang)} was confirmed to the producer but no leader has it any more`,
        });
        break;
      case "reassigned":
        lines.push({
          tone: "plain",
          text: tr
            ? `${pname(e.partition)} taşındı: broker ${e.from.join(", ")} → broker ${e.to.join(", ")}`
            : `${pname(e.partition)} moved: broker ${e.from.join(", ")} → broker ${e.to.join(", ")}`,
        });
        break;
      case "configChanged": {
        const name = e.key === "acks" ? "acks" : e.key === "minIsr" ? "min.insync.replicas" : "unclean.leader.election.enable";
        lines.push({ tone: "plain", text: `${tr ? "Ayar" : "Setting"}: ${name}=${e.value}` });
        break;
      }
      case "error":
        lines.push({ tone: "bad", text: e.message });
        break;
    }
  }
  return lines;
}
