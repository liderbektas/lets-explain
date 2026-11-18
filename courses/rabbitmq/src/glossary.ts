import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "@lets-explain/core/course/types";

export type { GlossaryEntry };

/** Terms stay in English in both languages: that is what RabbitMQ, its docs and its tools say. */
const core: Record<string, GlossaryEntry> = {
  broker: {
    term: "Broker",
    def: l("Mesajları alan, saklayan ve dağıtan sunucu. Burada RabbitMQ.", "The server that receives, stores and hands out messages. Here, RabbitMQ."),
  },
  producer: {
    term: "Producer",
    def: l("Mesaj gönderen uygulama. Mesajı bir exchange'e yollar, kuyruğu doğrudan bilmez.", "An application that sends messages. It sends to an exchange and does not need to know the queues."),
  },
  consumer: {
    term: "Consumer",
    def: l("Bir kuyruktan mesaj alan ve işleyen uygulama.", "An application that receives and processes messages from a queue."),
  },
  queue: {
    term: "Queue",
    def: l("Mesajların bir consumer alana kadar beklediği sıra. Alınıp onaylanan mesaj kuyruktan çıkar.", "Where messages wait until a consumer takes them. A message that is taken and acked leaves the queue."),
  },
  exchange: {
    term: "Exchange",
    def: l("Producer'ın mesaj gönderdiği yönlendirici. Kurallarına (binding'lere) bakıp mesajı kuyruklara dağıtır.", "The router producers send to. It looks at its rules (bindings) and passes the message to queues."),
  },
  binding: {
    term: "Binding",
    def: l("Exchange ile kuyruk arasındaki kural: \"bu key'li mesajlar bu kuyruğa\".", "A rule between an exchange and a queue: \"messages with this key go to this queue\"."),
  },
  routingKey: {
    term: "Routing key",
    def: l("Producer'ın mesaja yapıştırdığı adres etiketi, örneğin `order.created`. Exchange buna bakarak yönlendirir.", "The address label a producer puts on a message, such as `order.created`. The exchange routes by it."),
  },
  ack: {
    term: "Ack",
    def: l("Consumer'ın broker'a \"bu mesajı bitirdim, silebilirsin\" demesi.", "The consumer telling the broker \"I am done with this message, you can delete it\"."),
  },
  prefetch: {
    term: "Prefetch",
    def: l("Bir consumer'ın aynı anda elinde tutabileceği onaylanmamış mesaj sayısı (`basic.qos`).", "How many unacked messages a consumer may hold at once (`basic.qos`)."),
  },
  dlx: {
    term: "Dead letter exchange",
    def: l("Reddedilen, süresi dolan ya da sığmayan mesajların gönderildiği exchange. Kısaca DLX.", "The exchange that rejected, expired or overflowing messages are sent to. DLX for short."),
  },
  vhost: {
    term: "Virtual host",
    def: l("Bir broker içindeki ayrı alan: kendi exchange'leri, kuyrukları ve izinleri olan bir \"oda\". Varsayılanı `/`.", "A separate space inside a broker with its own exchanges, queues and permissions. The default is `/`."),
  },
};

const extra = import.meta.glob<{ terms?: Record<string, GlossaryEntry> }>("./lessons/*/terms.ts", { eager: true });

export const glossary: Record<string, GlossaryEntry> = Object.assign({}, ...Object.values(extra).map((m) => m.terms ?? {}), core);
