import type { Lang } from "@lets-explain/core/i18n";
import type { BrokerEvent } from "./broker";

export type Tone = "plain" | "read" | "ok" | "bad" | "produce";

export interface Line {
  text: string;
  tone: Tone;
}

const ex = (name: string, tr: boolean) => (name === "" ? (tr ? "default exchange" : "the default exchange") : `'${name}'`);

const REASON_TR: Record<string, string> = {
  rejected: "reddedildi",
  expired: "süresi doldu",
  maxlen: "kuyruk doldu",
  delivery_limit: "teslim sınırı aşıldı",
  unroutable: "gidecek kuyruk yok",
  restart: "broker yeniden başladı",
  "queue-down": "kuyruğun node'u kapalı",
  "auto-ack-crash": "auto-ack ile alınmıştı, consumer çöktü",
};

/** One plain sentence per broker event, in Turkish or English. */
export function describeBroker(e: BrokerEvent, lang: Lang): Line {
  const tr = lang === "tr";
  switch (e.type) {
    case "exchangeDeclared":
      return { text: tr ? `${e.kind} exchange '${e.name}' tanımlandı` : `Declared ${e.kind} exchange '${e.name}'`, tone: "plain" };
    case "queueDeclared":
      return { text: tr ? `Kuyruk '${e.name}' (${e.queueType}${e.durable ? ", durable" : ", geçici"}) tanımlandı` : `Declared queue '${e.name}' (${e.queueType}${e.durable ? ", durable" : ", transient"})`, tone: "plain" };
    case "queueDeleted":
      return { text: tr ? `Kuyruk '${e.name}' silindi (${e.messages} mesajla birlikte)` : `Queue '${e.name}' deleted (with ${e.messages} messages)`, tone: "bad" };
    case "purged":
      return { text: tr ? `'${e.queue}' boşaltıldı: ${e.messages} mesaj silindi` : `'${e.queue}' purged: ${e.messages} messages removed`, tone: "bad" };
    case "bound":
      return { text: tr ? `Binding: '${e.exchange}' → '${e.queue}'${e.key ? ` (key: ${e.key})` : ""}` : `Binding: '${e.exchange}' → '${e.queue}'${e.key ? ` (key: ${e.key})` : ""}`, tone: "plain" };
    case "unbound":
      return { text: tr ? `Binding kaldırıldı: '${e.exchange}' → '${e.queue}'` : `Binding removed: '${e.exchange}' → '${e.queue}'`, tone: "plain" };
    case "routed":
      return {
        text: tr
          ? `${e.id} (${e.routingKey || "key yok"}) ${ex(e.exchange, tr)} üzerinden ${e.via ? `alternate '${e.via}' ile ` : ""}→ ${e.queues.map((q) => `'${q}'`).join(", ")}`
          : `${e.id} (${e.routingKey || "no key"}) via ${ex(e.exchange, tr)} ${e.via ? `and alternate '${e.via}' ` : ""}→ ${e.queues.map((q) => `'${q}'`).join(", ")}`,
        tone: "produce",
      };
    case "unroutable":
      return {
        text: tr
          ? `${e.id} (${e.routingKey || "key yok"}) hiçbir kuyruğa uymadı: ${e.returned ? "mandatory olduğu için producer'a geri döndü" : "sessizce atıldı"}`
          : `${e.id} (${e.routingKey || "no key"}) matched no queue: ${e.returned ? "returned to the producer (mandatory)" : "silently dropped"}`,
        tone: "bad",
      };
    case "confirmed":
      return e.ok
        ? { text: tr ? `Broker ${e.id}'yi onayladı (confirm)` : `Broker confirmed ${e.id}`, tone: "ok" }
        : { text: tr ? `Broker ${e.id}'yi reddetti (nack): ${e.reason}` : `Broker rejected ${e.id} (nack): ${e.reason}`, tone: "bad" };
    case "delivered":
      return {
        text: tr
          ? `${e.id} → ${e.tag}${e.redelivered ? " (yeniden teslim, redelivered=true)" : ""}${e.autoAck ? ", auto-ack: broker hemen unuttu" : ""}`
          : `${e.id} → ${e.tag}${e.redelivered ? " (redelivered)" : ""}${e.autoAck ? ", auto-ack: the broker forgot it at once" : ""}`,
        tone: e.redelivered ? "bad" : "read",
      };
    case "acked":
      return { text: tr ? `${e.tag} ack gönderdi: ${e.ids.join(", ")} bitti` : `${e.tag} acked: ${e.ids.join(", ")} done`, tone: "ok" };
    case "processed":
      return { text: tr ? `${e.tag} işledi: ${e.ids.join(", ")}` : `${e.tag} processed: ${e.ids.join(", ")}`, tone: "ok" };
    case "requeued":
      return {
        text: tr
          ? `${e.ids.join(", ")} '${e.queue}' kuyruğunun başına döndü (${e.why === "nack" ? "nack + requeue" : e.why === "crash" ? "consumer çöktü" : "consumer ayrıldı"})`
          : `${e.ids.join(", ")} went back to the front of '${e.queue}' (${e.why === "nack" ? "nack + requeue" : e.why === "crash" ? "consumer crashed" : "consumer left"})`,
        tone: "bad",
      };
    case "deadLettered":
      return {
        text: e.to
          ? tr ? `${e.id} '${e.from}'den dead letter oldu (${REASON_TR[e.reason]}) → '${e.to}'` : `${e.id} dead-lettered from '${e.from}' (${e.reason}) → '${e.to}'`
          : tr ? `${e.id} '${e.from}'den atıldı (${REASON_TR[e.reason]}); DLX yok, mesaj kayboldu` : `${e.id} dropped from '${e.from}' (${e.reason}); no DLX, the message is gone`,
        tone: "bad",
      };
    case "dropped":
      return { text: tr ? `${e.id} '${e.queue}'ye giremedi: ${REASON_TR[e.reason]}` : `${e.id} could not enter '${e.queue}': ${e.reason}`, tone: "bad" };
    case "consumerAdded":
      return {
        text: tr
          ? `${e.tag} '${e.queue}'yi dinlemeye başladı (${e.autoAck ? "auto-ack" : `manual ack, prefetch ${e.prefetch || "sınırsız"}`})`
          : `${e.tag} started consuming '${e.queue}' (${e.autoAck ? "auto-ack" : `manual ack, prefetch ${e.prefetch || "unlimited"}`})`,
        tone: "plain",
      };
    case "consumerGone":
      return {
        text: e.lostInFlight.length
          ? tr ? `${e.tag} çöktü ve elindeki ${e.lostInFlight.join(", ")} kayboldu (auto-ack)` : `${e.tag} crashed and ${e.lostInFlight.join(", ")} in its hands are lost (auto-ack)`
          : tr ? `${e.tag} ${e.crashed ? "çöktü" : "ayrıldı"}` : `${e.tag} ${e.crashed ? "crashed" : "left"}`,
        tone: e.crashed ? "bad" : "plain",
      };
    case "ticked":
      return { text: tr ? `Zaman: ${e.time}` : `Time: ${e.time}`, tone: "plain" };
    case "restarted":
      return {
        text: tr
          ? `Broker yeniden başladı. Kaybolan mesaj: ${e.lostMessages.length || "yok"}${e.lostQueues.length ? `, silinen geçici kuyruk: ${e.lostQueues.join(", ")}` : ""}`
          : `Broker restarted. Messages lost: ${e.lostMessages.length || "none"}${e.lostQueues.length ? `, transient queues gone: ${e.lostQueues.join(", ")}` : ""}`,
        tone: e.lostMessages.length || e.lostQueues.length ? "bad" : "ok",
      };
    case "nodeChanged":
      return { text: tr ? `${e.node} ${e.alive ? "geri geldi" : "çöktü"}` : `${e.node} ${e.alive ? "is back" : "went down"}`, tone: e.alive ? "ok" : "bad" };
    case "leaderMoved":
      return { text: tr ? `'${e.queue}' için yeni leader: ${e.to} (${e.from} yerine)` : `New leader for '${e.queue}': ${e.to} (was ${e.from})`, tone: "ok" };
    case "queueUnavailable":
      return { text: tr ? `'${e.queue}' şu an kullanılamıyor` : `'${e.queue}' is unavailable now`, tone: "bad" };
    case "policySet":
      return {
        text: tr
          ? `'${e.name}' policy'si kuruldu${e.queues.length ? `: ${e.queues.join(", ")} artık onun ayarlarıyla çalışıyor` : " (henüz eşleşen kuyruk yok)"}`
          : `Policy '${e.name}' set${e.queues.length ? `: ${e.queues.join(", ")} now run with its settings` : " (no queue matches yet)"}`,
        tone: "ok",
      };
    case "policyCleared":
      return { text: tr ? `'${e.name}' policy'si kaldırıldı` : `Policy '${e.name}' cleared`, tone: "plain" };
    case "error":
      return { text: `RabbitMQ: ${e.message}`, tone: "bad" };
  }
}
