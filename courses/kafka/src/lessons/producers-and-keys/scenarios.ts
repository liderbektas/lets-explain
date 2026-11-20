import { l } from "@lets-explain/core/i18n";
import { boxOf } from "../../engine/cli";
import { partitionForKey } from "../../engine/murmur2";
import type { Action, ClusterState } from "../../engine/types";
import type { KafkaCtx, KafkaScenario } from "../shared/TopicLessonScene";
import { stateAfter } from "../shared/topicSim";
import { TOPIC } from "./model";

/**
 * Scenarios for producers and keys. The cluster has 3 brokers and the orders topic 3
 * partitions; with 3 partitions murmur2 puts ali → P0, mehmet → P1, zeynep → P2, can → P0,
 * and with 4 partitions ali → P3 (the tests check this).
 */

const create = (name: string, partitions: number): Action => ({ type: "createTopic", name, partitions });
const keyed = (topic: string, key: string, value: string): Action => ({ type: "produce", topic, key, value, producer: "orders-service" });
const keyless = (topic: string, value: string): Action => ({ type: "produce", topic, key: null, value, producer: "orders-service" });

const cluster = (actions: Action[]): ClusterState => stateAfter(actions, 3);

/** Free play: the orders topic, empty, plus a file of login events to try pipes with. */
export const FREE = boxOf(cluster([create(TOPIC, 3)]), { "logins.txt": "u42,login\nu7,login\nu42,logout" });

/** Records with this key in a topic, as [partition, value] in offset order per partition. */
const withKey = (s: ClusterState, topic: string, key: string) =>
  (s.topics[topic]?.partitions ?? []).flatMap((p) => p.records.filter((r) => r.key === key).map((r) => ({ partition: p.index, value: r.value })));

const partitionsOf = (s: ClusterState, topic: string, key: string) => new Set(withKey(s, topic, key).map((r) => r.partition));

/** Records written during the scenario (not there at the start). */
const written = (ctx: KafkaCtx, topic: string) =>
  (ctx.state.topics[topic]?.partitions ?? []).flatMap((p) => {
    const before = ctx.start.topics[topic]?.partitions[p.index]?.logEndOffset ?? 0;
    return p.records.filter((r) => r.offset >= before).map((r) => ({ partition: p.index, key: r.key, value: r.value }));
  });

export const scenarios: KafkaScenario[] = [
  {
    id: "keep-order",
    title: l("Sıra bozulmasın", "Keep the order"),
    story: l(
      "Ali bir sipariş verdi, adresini değiştirdi, sonra iptal etti. Dün bu üç olay key'siz gönderildi, farklı partition'lara dağıldı ve kargo servisi iptali siparişten **önce** okudu. Olayları yeniden göndermen gerekiyor, bu sefer doğru şekilde.",
      "Ali placed an order, changed the address, then cancelled. Yesterday these three events went out without a key, landed in different partitions, and the shipping service read the cancel **before** the order. You need to send them again, properly this time.",
    ),
    goal: l(
      "`orders`'a Ali'nin `order`, `address`, `cancel` olaylarını **`ali` key'iyle**, bu sırayla yaz: üçü aynı partition'da sıralı dursun.",
      "Write Ali's `order`, `address`, `cancel` events to `orders` **with the key `ali`**, in that order: all three in one partition, in order.",
    ),
    start: boxOf(cluster([create(TOPIC, 3)])),
    hints: [
      l(
        "Aynı key her zaman aynı partition'a gider; bir partition'ın içinde sıra korunur. Satırları `ali:order` gibi yazıp producer'a key'i nerede ayıracağını söyle.",
        "The same key always goes to the same partition, and order holds inside a partition. Write lines like `ali:order` and tell the producer where the key ends.",
      ),
      l(
        "Birden çok satırı `printf \"a\\nb\\n\"` ile pipe'la. Console producer'da `--property parse.key=true --property key.separator=:` key'i satırdan ayırır.",
        "Pipe several lines with `printf \"a\\nb\\n\"`. On the console producer, `--property parse.key=true --property key.separator=:` splits the key off the line.",
      ),
      l(
        "`printf \"ali:order\\nali:address\\nali:cancel\\n\" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders --property parse.key=true --property key.separator=:`",
        "`printf \"ali:order\\nali:address\\nali:cancel\\n\" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders --property parse.key=true --property key.separator=:`",
      ),
    ],
    par: 1,
    check: (ctx) => {
      const ali = withKey(ctx.state, TOPIC, "ali");
      return partitionsOf(ctx.state, TOPIC, "ali").size === 1 && ali.map((r) => r.value).join(",").includes("order,address,cancel");
    },
  },
  {
    id: "logins-file",
    title: l("Dosyadan, key'iyle", "From a file, with keys"),
    story: l(
      "Güvenlik ekibi `logins.txt` dosyasını gönderdi: her satır `kullanıcı,olay`. Bu olaylar `logins` topic'ine gitmeli ve **aynı kullanıcının** olayları sırasını korumalı. Topic zaten 3 partition'la açık.",
      "The security team sent `logins.txt`: every line is `user,event`. These events go to the `logins` topic, and **each user's** events must keep their order. The topic already exists with 3 partitions.",
    ),
    goal: l(
      "`logins.txt`'deki her satır, virgülden önceki kullanıcı id'si **key** olacak şekilde `logins`'e yazılsın.",
      "Every line of `logins.txt` goes to `logins`, with the user id before the comma as the **key**.",
    ),
    start: boxOf(cluster([create("logins", 3)]), { "logins.txt": "u42,login\nu7,login\nu42,logout" }),
    hints: [
      l("Önce dosyaya bir bak: `cat logins.txt`. Ayırıcı iki nokta değil, virgül.", "Look at the file first: `cat logins.txt`. The separator is a comma, not a colon."),
      l("`cat dosya |` ile satırları producer'a pipe'layabilirsin; `key.separator` da virgül olmalı.", "`cat file |` pipes the lines into the producer; `key.separator` must be a comma too."),
      l(
        "`cat logins.txt | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic logins --property parse.key=true --property key.separator=,`",
        "`cat logins.txt | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic logins --property parse.key=true --property key.separator=,`",
      ),
    ],
    par: 1,
    check: (ctx) => {
      const rows = written(ctx, "logins");
      return (
        rows.length === 3 &&
        rows.every((r) => r.key === "u42" || r.key === "u7") &&
        partitionsOf(ctx.state, "logins", "u42").size === 1 &&
        withKey(ctx.state, "logins", "u42").map((r) => r.value).join(",") === "login,logout"
      );
    },
  },
  {
    id: "payments-topic",
    title: l("Yeni topic, doğru key", "New topic, right key"),
    story: l(
      "Ödeme servisi bugün devreye giriyor. Ödemeler `payments` adlı yeni bir topic'e yazılacak; dört fatura servisi kopyası paralel okuyabilmeli ve **bir müşterinin** ödemeleri sırayla işlenmeli. İlk müşteri Mehmet'in iki ödemesi bekliyor: `paid` ve `refund`.",
      "The payment service goes live today. Payments go to a new topic called `payments`; four copies of the billing service must be able to read in parallel, and **one customer's** payments must be handled in order. The first customer, Mehmet, has two payments waiting: `paid` and `refund`.",
    ),
    goal: l(
      "`payments` topic'i **4 partition**'la açılsın ve Mehmet'in iki ödemesi `mehmet` key'iyle, sırayla yazılsın.",
      "Create `payments` with **4 partitions** and write Mehmet's two payments with the key `mehmet`, in order.",
    ),
    start: boxOf(cluster([create(TOPIC, 3)])),
    hints: [
      l(
        "Bir group'ta en fazla partition sayısı kadar consumer iş alır: dört okuyucu için en az dört partition gerekir.",
        "A group can give work to at most as many consumers as there are partitions: four readers need at least four partitions.",
      ),
      l("Önce `kafka-topics.sh --create`, sonra key'li bir console producer.", "First `kafka-topics.sh --create`, then a keyed console producer."),
      l(
        "`kafka-topics.sh --bootstrap-server localhost:9092 --create --topic payments --partitions 4` sonra `printf \"mehmet:paid\\nmehmet:refund\\n\" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic payments --property parse.key=true --property key.separator=:`",
        "`kafka-topics.sh --bootstrap-server localhost:9092 --create --topic payments --partitions 4` then `printf \"mehmet:paid\\nmehmet:refund\\n\" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic payments --property parse.key=true --property key.separator=:`",
      ),
    ],
    par: 2,
    check: (ctx) =>
      ctx.state.topics.payments?.partitions.length === 4 &&
      partitionsOf(ctx.state, "payments", "mehmet").size === 1 &&
      withKey(ctx.state, "payments", "mehmet").map((r) => r.value).join(",") === "paid,refund",
  },
  {
    id: "grow-moves-keys",
    title: l("Büyütünce ne olur?", "What growing does"),
    story: l(
      "Kampanya yaklaşıyor; `orders`'ı 3'ten 4 partition'a çıkarman isteniyor. Ekip, bunun Ali gibi eski müşterileri nasıl etkileyeceğini merak ediyor. Büyüt, sonra Ali'nin yeni siparişini (`ali:order`) yaz ve nereye gittiğini gör.",
      "A sale is coming and you're asked to grow `orders` from 3 to 4 partitions. The team wonders how this affects existing customers like Ali. Grow it, then write Ali's new order (`ali:order`) and see where it goes.",
    ),
    goal: l(
      "`orders` 4 partition olsun ve Ali'nin **büyütmeden sonra** yazılan siparişi topic'te olsun.",
      "`orders` has 4 partitions, and Ali's order written **after** the change is in the topic.",
    ),
    start: boxOf(cluster([create(TOPIC, 3), keyed(TOPIC, "ali", "order"), keyed(TOPIC, "ali", "address"), keyless(TOPIC, "order:3001")])),
    hints: [
      l("Partition sayısı `kafka-topics.sh --alter` ile artırılır; azaltılamaz.", "The partition count is raised with `kafka-topics.sh --alter`; it can't be lowered."),
      l(
        "Sıra önemli: önce büyüt, sonra yaz. Partition = murmur2(key) % **partition sayısı**; sayı değişince Ali'nin yeri de değişir.",
        "Order matters: grow first, then write. Partition = murmur2(key) % **the partition count**; when the count changes, so does Ali's place.",
      ),
      l(
        "`kafka-topics.sh --bootstrap-server localhost:9092 --alter --topic orders --partitions 4` sonra `echo \"ali:order\" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders --property parse.key=true --property key.separator=:`",
        "`kafka-topics.sh --bootstrap-server localhost:9092 --alter --topic orders --partitions 4` then `echo \"ali:order\" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders --property parse.key=true --property key.separator=:`",
      ),
    ],
    par: 2,
    check: (ctx) =>
      ctx.state.topics[TOPIC]!.partitions.length === 4 &&
      written(ctx, TOPIC).some((r) => r.key === "ali" && r.partition === partitionForKey("ali", 4)),
  },
  {
    id: "neighbours",
    title: l("Aynı rafta", "Same shelf"),
    story: l(
      "Kargo ekibinden bir soru: \"Can ile Ali'nin siparişleri hep aynı kargo işçisine düşüyor, bir hata mı var?\" Göstermek için ikisinin birer siparişini key'leriyle `orders`'a yaz ve aynı partition'a düştüklerini gör.",
      "A question from the shipping team: \"Can's and Ali's orders always land on the same worker; is something wrong?\" To show them, write one order each for both with their keys to `orders`, and see that they share a partition.",
    ),
    goal: l(
      "`orders`'ta **Can'ın ve Ali'nin** key'li siparişleri aynı partition'da dursun.",
      "**Can's and Ali's** keyed orders sit in the same partition of `orders`.",
    ),
    start: boxOf(cluster([create(TOPIC, 3)])),
    hints: [
      l(
        "3 partition'da dört müşteri var: bazı key'ler aynı partition'ı paylaşmak zorunda. Bu bir hata değil.",
        "There are four customers and 3 partitions: some keys have to share a partition. That's not a bug.",
      ),
      l("İki satır, iki farklı key, tek bir producer komutu yeter.", "Two lines, two different keys: one producer command is enough."),
      l(
        "`printf \"can:order\\nali:order\\n\" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders --property parse.key=true --property key.separator=:`",
        "`printf \"can:order\\nali:order\\n\" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders --property parse.key=true --property key.separator=:`",
      ),
    ],
    par: 1,
    check: (ctx) => {
      const can = partitionsOf(ctx.state, TOPIC, "can");
      const ali = partitionsOf(ctx.state, TOPIC, "ali");
      return can.size === 1 && ali.size === 1 && [...can][0] === [...ali][0];
    },
  },
];
