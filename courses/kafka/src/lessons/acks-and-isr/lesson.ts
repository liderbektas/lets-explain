import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { AcksScene, changesFor } from "./Scene";

export const acksAndIsr: Lesson = {
  slug: "acks-and-isr",
  title: l("acks ve ISR", "acks & ISR"),
  summary: l(
    "Producer \"tamam\" cevabını ne zaman alır? acks=0, 1, all ve min.insync.replicas ile hız ve güvenlik dengesi.",
    "When does the producer hear \"done\"? acks=0, 1 and all, and min.insync.replicas, trading speed for safety.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: AcksScene,
  changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Producer'ın neden bir cevap beklediğini anlamak", "Understand why the producer waits for an answer"), step: 0 },
    { text: l("acks=0, 1 ve all farkını görmek", "See the difference between acks=0, 1 and all"), step: 4 },
    { text: l("acks=1 ile onaylı bir kaydın nasıl kaybolduğunu görmek", "See how an acked record is lost with acks=1"), step: 3 },
    { text: l("ISR küçülünce acks=all'ın ne anlama geldiğini görmek", "See what acks=all means once the ISR shrinks"), step: 6 },
    { text: l("min.insync.replicas ile alt sınır koymak", "Set a floor with min.insync.replicas"), step: 7 },
  ],
  steps: [
    {
      short: l("Onay", "The ack"),
      tag: "how",
      title: l("Producer bir cevap bekler", "The producer waits for an answer"),
      body: [
        l(
          "Producer bir kayıt gönderince broker'dan bir cevap bekler: \"kaydın bende\". Buna [[ack]] (acknowledgement, onay) denir. Sahnedeki yeşil \"onay geldi\" etiketi bu cevap.",
          "When the producer sends a record, it waits for the broker to say \"I have it\". That answer is an [[ack]] (acknowledgement). The green \"acked\" label on the stage is that answer.",
        ),
        l(
          "Onay gelince producer işine devam eder; gelmezse bir süre sonra yeniden dener. Peki broker \"tamam\"ı ne zaman söylemeli? Leader diske yazınca mı, yoksa follower'lar da kopyalayınca mı?",
          "Once the ack arrives, the producer moves on; if it does not, it retries after a while. So when should the broker say \"done\"? When the leader writes it, or once the followers have copied it too?",
        ),
        l(
          "Bunu producer'daki [[acks]] ayarı belirler. Üç seçenek var ve her biri hız ile güvenlik arasında farklı bir denge kurar.",
          "The producer's [[acks]] setting decides. There are three options, each trading speed against safety differently.",
        ),
      ],
    },
    {
      short: l("acks=0", "acks=0"),
      tag: "how",
      title: l("acks=0: gönder ve unut", "acks=0: fire and forget"),
      body: [
        l(
          "acks=0 ile producer hiç cevap beklemez: kaydı ağa bırakır ve sıradakine geçer. Etikette \"gönderildi, cevap beklenmiyor\" yazıyor.",
          "With acks=0 the producer waits for nothing: it puts the record on the wire and moves on. The label reads \"sent, no answer expected\".",
        ),
        l(
          "Bu en hızlı yol ama kör bir yol. Kayıt yolda kaybolsa ya da leader o an çökse producer bunu hiç öğrenemez ve yeniden denemez.",
          "This is the fastest option, but a blind one. If the record is lost on the way, or the leader crashes at that moment, the producer never finds out and never retries.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "acks=0, kaybı dert etmeyeceğin veriler için uygundur: örneğin saniyede binlerce gelen ve birkaçı eksik olsa da fark etmeyen sensör ölçümleri.",
            "acks=0 suits data where loss does not matter, such as sensor readings arriving thousands per second where a few missing ones go unnoticed.",
          ),
        },
      ],
    },
    {
      short: l("acks=1", "acks=1"),
      tag: "how",
      predict: {
        question: l(
          "Ayar acks=1 olacak. Follower'lar yavaşladı ve henüz kopyalamıyor. Producer bir sipariş yazınca onayı ne zaman alır?",
          "The setting becomes acks=1. The followers slowed down and are not copying yet. When does the producer get its ack for a new order?",
        ),
        options: [
          l("Hemen, leader kendi diskine yazınca", "Right away, once the leader writes it"),
          l("Üç kopya da yazınca", "Once all three copies have it"),
          l("Hiç almaz", "Never"),
        ],
        answer: 0,
        why: l(
          "acks=1 sadece leader'ı bekler. Follower'ların kopyalayıp kopyalamadığına bakmadan onay gönderilir.",
          "acks=1 waits for the leader only. The ack goes out without checking whether any follower has copied the record.",
        ),
      },
      title: l("acks=1: leader yazınca tamam", "acks=1: done once the leader writes"),
      body: [
        l(
          "Follower'lar yavaşladı ama producer onayı hemen aldı: leader siparişi yazdı ve \"tamam\" dedi. Kayıt şu an sadece broker 1'de.",
          "The followers slowed down, yet the producer got its ack at once: the leader wrote the order and said \"done\". Right now the record is only on broker 1.",
        ),
        l(
          "Soluk koliye ve \"HW\" direğine bak: kayıt henüz bütün ISR'de değil, consumer'lar onu göremiyor. Ama producer \"tamam\" cevabını çoktan aldı.",
          "Look at the faded parcel and the \"HW\" post: the record is not on the whole ISR yet, so consumers cannot see it. But the producer already heard \"done\".",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Follower'ları \"yavaşlattık\" ki farkı görebilesin. Gerçekte follower'lar milisaniyeler geridedir; ama leader tam o milisaniyelerde çökebilir.",
            "We \"slowed\" the followers so you can see the gap. In reality followers trail by milliseconds, but the leader can crash in exactly those milliseconds.",
          ),
        },
      ],
    },
    {
      short: l("Onaylı kayıp", "Acked, lost"),
      tag: "problem",
      predict: {
        question: l(
          "Leader broker 1 şimdi çökecek. Az önce onaylanan sipariş ne olur?",
          "Broker 1, the leader, is about to crash. What happens to the order that was just acked?",
        ),
        options: [
          l("Broker 2 leader olur ve sipariş onda var", "Broker 2 becomes leader and has the order"),
          l("Broker 2 leader olur ama sipariş onda yok: kaybolur", "Broker 2 becomes leader without the order: it is lost"),
          l("P0 offline olur ve bekler", "P0 goes offline and waits"),
        ],
        answer: 1,
        why: l(
          "Broker 2 hâlâ ISR'deydi, o yüzden leader olabildi. Ama siparişi kopyalayamamıştı. Producer'a \"tamam\" denmiş bir kayıt artık hiçbir yerde yok.",
          "Broker 2 was still in the ISR, so it could take over. But it had not copied the order. A record the producer was told was safe is now nowhere.",
        ),
      },
      title: l("Onaylandı ama kayboldu", "Acked, and then lost"),
      body: [
        l(
          "Broker 1 çöktü ve broker 2 leader oldu. Siparişi henüz kopyalamamıştı. Sayaçta \"Kayıp: 1\", etikette \"sandı ama kayboldu\" yazıyor.",
          "Broker 1 crashed and broker 2 took over. It had not copied the order yet. The counter reads \"Lost: 1\" and the label \"thought so, but lost\".",
        ),
        l(
          "Bu acks=1'in bedeli: producer'a verilen söz, tek bir broker'ın sağlığına bağlı. Bir ödeme ya da sipariş için bu kabul edilemez.",
          "That is the price of acks=1: the promise to the producer rests on one broker's health. For a payment or an order, that is not acceptable.",
        ),
      ],
    },
    {
      short: l("acks=all", "acks=all"),
      tag: "idea",
      title: l("acks=all: bütün ISR yazınca tamam", "acks=all: done once the whole ISR has it"),
      body: [
        l(
          "Broker'lar normale döndü, broker 1 de follower olarak geri geldi. Ayarı acks=all yaptık ve bir sipariş yazdık.",
          "The brokers are back to normal and broker 1 returned as a follower. We switched to acks=all and wrote an order.",
        ),
        l(
          "Bu sefer leader onay göndermek için ISR'deki **herkesin** kaydı kopyalamasını bekledi. Onay geldiğinde sipariş üç broker'da birden var; hangisi çökerse çöksün yeni leader'da olacak.",
          "This time the leader waited for **everyone** in the ISR to copy the record before acking. When the ack arrives, the order is on all three brokers; whichever crashes, the new leader will have it.",
        ),
        l(
          "Olay listesinde broker 1'in bir kaydı sildiğini de görebilirsin. Çökmeden önce yazdığı ama kimsenin kopyalamadığı siparişi, yeni leader'a uymak için kendi kopyasından attı.",
          "The events also show broker 1 removing a record. It dropped the order it wrote before crashing, which nobody had copied, to match the new leader.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka 3.0'dan beri producer'ın varsayılanı `acks=all` (ayrıca `enable.idempotence=true`). Eski bir client ya da elle değiştirilmiş bir ayar görürsen bunu kontrol et.",
            "Since Kafka 3.0 the producer defaults to `acks=all` (along with `enable.idempotence=true`). If you see an old client or a hand-edited setting, check this.",
          ),
        },
      ],
    },
    {
      short: l("Yavaş follower", "Slow follower"),
      tag: "experiment",
      predict: {
        question: l(
          "Broker 3 yavaşlayacak. acks=all ile bir sipariş yazılacak. Producer onayı ne zaman alır?",
          "Broker 3 will slow down. An order is written with acks=all. When does the producer get the ack?",
        ),
        options: [
          l("Hemen; iki broker yeterli", "Right away: two brokers are enough"),
          l("Broker 3 yetişene ya da ISR'den çıkana kadar bekler", "It waits until broker 3 catches up or leaves the ISR"),
          l("Hiç; yazma reddedilir", "Never: the write is rejected"),
        ],
        answer: 1,
        why: l(
          "acks=all, ISR'deki **bütün** kopyaları bekler. Broker 3 ISR'de kaldıkça onay gelmez. 30 saniye sonra ISR'den çıkarılınca bekleme biter.",
          "acks=all waits for **every** copy in the ISR. While broker 3 stays in the ISR there is no ack. Once it is dropped after 30 seconds, the wait is over.",
        ),
      },
      title: l("acks=all yavaş follower'ı bekler", "acks=all waits for a slow follower"),
      body: [
        l(
          "Broker 3 yavaşladı. Sipariş yazıldı ama etiket bir süre \"onay bekleniyor\" dedi: broker 3 hâlâ ISR'deydi ve kaydı almamıştı.",
          "Broker 3 slowed down. The order was written, but for a while the label said \"waiting for ack\": broker 3 was still in the ISR and did not have the record.",
        ),
        l(
          "30 saniye dolunca leader broker 3'ü ISR'den çıkardı. ISR artık [1, 2] ve ikisinde de kayıt var, o yüzden onay geldi.",
          "When 30 seconds were up, the leader dropped broker 3 from the ISR. The ISR is now [1, 2] and both have the record, so the ack arrived.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçekte producer bu süreyi `delivery.timeout.ms` (varsayılan 2 dakika) içinde bekler. Tek bir yavaş follower yazmaları en fazla `replica.lag.time.max.ms` kadar geciktirir.",
            "In reality the producer waits within `delivery.timeout.ms` (2 minutes by default). One slow follower delays writes by at most `replica.lag.time.max.ms`.",
          ),
        },
      ],
    },
    {
      short: l("Tek kişilik ISR", "ISR of one"),
      tag: "problem",
      predict: {
        question: l(
          "Broker 1 de yavaşlayacak ve 30 saniye geçecek. ISR'de sadece leader kalınca acks=all ile yazılan bir kayıt kaç kopyada olunca onaylanır?",
          "Broker 1 will slow down too and 30 seconds will pass. With only the leader left in the ISR, how many copies does an acks=all write need before it is acked?",
        ),
        options: [
          l("3; acks=all hep üç kopya ister", "3: acks=all always wants three"),
          l("1; ISR'deki herkes artık sadece leader", "1: everyone in the ISR is now just the leader"),
          l("Hiç onaylanmaz", "It is never acked"),
        ],
        answer: 1,
        why: l(
          "acks=all \"bütün kopyalar\" değil, \"ISR'deki bütün kopyalar\" demek. ISR tek kişiye inince acks=all fiilen acks=1 gibi davranır.",
          "acks=all does not mean \"every copy\" but \"every copy in the ISR\". Once the ISR is down to one, acks=all behaves just like acks=1.",
        ),
      },
      title: l("ISR tek kişiye inerse acks=all yetmez", "When the ISR is down to one, acks=all is not enough"),
      body: [
        l(
          "Broker 1 de geride kaldı ve ISR'den çıktı: ISR = [2]. Sipariş sadece leader'da olduğu hâlde onaylandı.",
          "Broker 1 fell behind too and left the ISR: ISR = [2]. The order was acked while only the leader had it.",
        ),
        l(
          "Yani acks=all tek başına bir güvence değil. ISR'nin ne kadar küçülebileceğine de bir sınır koymak gerekiyor.",
          "So acks=all alone is no guarantee. We also need a floor on how small the ISR may get.",
        ),
      ],
    },
    {
      short: l("min.insync", "min.insync"),
      tag: "idea",
      title: l("min.insync.replicas: alt sınır", "min.insync.replicas: a floor"),
      body: [
        l(
          "[[minInsyncReplicas]] ayarını 2 yaptık. Artık acks=all bir yazma, ISR'de en az 2 kopya yoksa **hiç kabul edilmiyor**.",
          "We set [[minInsyncReplicas]] to 2. Now an acks=all write is **not accepted at all** unless the ISR holds at least 2 copies.",
        ),
        l(
          "ISR hâlâ [2] olduğu için sipariş `NotEnoughReplicas` hatasıyla reddedildi. Kayıt log'a hiç yazılmadı ve producer bunu hemen öğrendi.",
          "The ISR is still [2], so the order was rejected with `NotEnoughReplicas`. The record never reached the log, and the producer found out at once.",
        ),
        l(
          "Bu bir tercih: biraz erişilebilirlikten vazgeçip, \"onay aldıysan en az iki kopya vardır\" sözünü alıyoruz.",
          "It is a trade: we give up some availability to get the promise \"if you got an ack, at least two copies exist\".",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "min.insync.replicas sadece acks=all yazmaları etkiler. acks=0 ve acks=1 ile yazan producer'lar ve okuyan consumer'lar etkilenmez.",
            "min.insync.replicas only affects acks=all writes. Producers using acks=0 or acks=1, and consumers reading, are unaffected.",
          ),
        },
      ],
    },
    {
      short: l("Önerilen ayar", "Recommended"),
      tag: "experiment",
      predict: {
        question: l(
          "RF=3 ve min.insync.replicas=2. Broker 3 çöktü ve yazmalar sürüyor. Sonra broker 1 de çökerse ne olur?",
          "RF=3 and min.insync.replicas=2. Broker 3 crashed and writes carry on. What happens if broker 1 crashes too?",
        ),
        options: [
          l("Yazmalar aynen sürer", "Writes carry on as before"),
          l("acks=all yazmalar NotEnoughReplicas ile reddedilir; okuma sürer", "acks=all writes fail with NotEnoughReplicas; reads carry on"),
          l("Topic silinir", "The topic is deleted"),
        ],
        answer: 1,
        why: l(
          "ISR tek kişiye iner ve 2'nin altına düşer. Kafka yeni yazmaları reddeder ama mevcut kayıtlar okunmaya devam eder.",
          "The ISR shrinks to one, below 2. Kafka refuses new writes, but existing records can still be read.",
        ),
      },
      title: l("RF=3, min.insync=2: bir çökmeye dayanır", "RF=3, min.insync=2: survives one crash"),
      body: [
        l(
          "Follower'lar yetişti. Broker 3 çöktü: ISR = [1, 2], yani 2 kopya. Sipariş onaylandı; yazmalar kesintisiz sürdü.",
          "The followers caught up. Broker 3 crashed: ISR = [1, 2], two copies. The order was acked and writes went on without a break.",
        ),
        l(
          "Sonra broker 1 de çöktü: ISR = [2]. Sıradaki sipariş reddedildi. İki kopyası olmayan hiçbir kayıt onay almadı.",
          "Then broker 1 crashed too: ISR = [2]. The next order was rejected. No record got an ack without having two copies.",
        ),
        l(
          "Bu yüzden önerilen üretim ayarı: **replication.factor=3, min.insync.replicas=2, acks=all**. Bir broker çökse de, bakıma alınsa da yazmalar sürer; onaylı veri hiç kaybolmaz.",
          "That is why the recommended production setup is **replication.factor=3, min.insync.replicas=2, acks=all**. One broker can crash or go down for maintenance and writes continue; acknowledged data is never lost.",
        ),
      ],
    },
    {
      short: l("Varsayılanlar", "Defaults"),
      tag: "reality",
      title: l("Gerçekte varsayılanlar ne?", "What are the real defaults?"),
      body: [
        l(
          "**Producer:** Kafka 3.0'dan beri `acks=all` ve `enable.idempotence=true`. Yani yeni bir client güvenli tarafta başlar.",
          "**Producer:** since Kafka 3.0, `acks=all` and `enable.idempotence=true`. A new client starts on the safe side.",
        ),
        l(
          "**Broker ve topic:** `min.insync.replicas` varsayılan olarak **1**. Yani acks=all tek başına, ISR tek kişiye inince seni korumaz. Önemli topic'lerde bunu 2 yapmak senin işin.",
          "**Broker and topic:** `min.insync.replicas` defaults to **1**. So acks=all alone does not protect you once the ISR is down to one. Setting it to 2 on important topics is up to you.",
        ),
        l(
          "**Replication factor:** topic oluştururken seçilir; `default.replication.factor` varsayılan olarak 1. Üretimde 3 yaygın tercih.",
          "**Replication factor:** chosen when a topic is created; `default.replication.factor` defaults to 1. In production, 3 is the common choice.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "min.insync.replicas'ı replication factor'e eşit yapma (örneğin ikisi de 3). O zaman tek bir broker bakıma girdiğinde bütün acks=all yazmalar durur.",
            "Do not set min.insync.replicas equal to the replication factor (say, both 3). Then a single broker going down for maintenance stops every acks=all write.",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Bütün broker'lar ayakta, P0'ın leader'ı `kafka-2`, `min.insync.replicas=2`. Cluster bir docker-compose geliştirme ortamı: broker N, `kafka-N` container'ında. Aşağıda gerçek işten **5 senaryo** var; komutları **kendin yaz**.",
          "Your turn. Every broker is up, `kafka-2` leads P0, `min.insync.replicas=2`. The cluster is a docker-compose dev setup: broker N lives in container `kafka-N`. Below are **5 scenarios** from real work; **type the commands yourself**.",
        ),
        l(
          "`acks` producer'ın ayarıdır: konsol producer'a `--producer-property acks=1` diye verirsin (varsayılan `all`). `min.insync.replicas` topic'in ayarıdır: `kafka-configs.sh` ile değişir. Producer'ın yanındaki etiket her yazmanın cevabını gösterir: onay, bekleme, hata ya da \"sandı ama kayboldu\".",
          "`acks` is the producer's setting: give the console producer `--producer-property acks=1` (the default is `all`). `min.insync.replicas` is the topic's: change it with `kafka-configs.sh`. The label next to the producer shows the answer to each write: ack, waiting, error, or \"thought so, but lost\".",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Leader çökünce yeni leader replica listesindeki sıraya göre ISR'den seçilir. `kafka-topics.sh --describe` bu sırayı `Replicas:` sütununda gösterir.",
            "When the leader dies, the new one is picked from the ISR in replica-list order. `kafka-topics.sh --describe` shows that order in the `Replicas:` column.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Producer her yazma için bir [[ack]] bekler; ne zaman geleceğini [[acks]] ayarı belirler.",
      "The producer waits for an [[ack]] on every write; the [[acks]] setting decides when it comes.",
    ),
    l(
      "acks=0 hiç beklemez, en hızlısıdır ama kaybı fark etmez. acks=1 sadece leader'ı bekler; leader kopyalanmadan çökerse onaylı kayıt kaybolur.",
      "acks=0 waits for nothing: fastest, but blind to loss. acks=1 waits for the leader only; if it dies before followers copy, an acked record is lost.",
    ),
    l(
      "acks=all ISR'deki bütün kopyaları bekler ve Kafka 3.0'dan beri varsayılandır.",
      "acks=all waits for every copy in the ISR and has been the default since Kafka 3.0.",
    ),
    l(
      "ISR tek kişiye inerse acks=all, acks=1 kadar güvenlidir.",
      "If the ISR shrinks to one, acks=all is only as safe as acks=1.",
    ),
    l(
      "[[minInsyncReplicas]] alt sınır koyar: ISR küçükse acks=all yazmalar NotEnoughReplicas ile reddedilir.",
      "[[minInsyncReplicas]] sets a floor: if the ISR is smaller, acks=all writes fail with NotEnoughReplicas.",
    ),
    l(
      "Önerilen: replication.factor=3, min.insync.replicas=2, acks=all. Bir broker çökse de yazmalar sürer ve onaylı veri kaybolmaz.",
      "Recommended: replication.factor=3, min.insync.replicas=2, acks=all. Writes survive one broker down and acked data is never lost.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Hangi acks ayarında producer, leader kaydı yazar yazmaz onay alır?",
        "With which acks setting does the producer get its ack as soon as the leader writes?",
      ),
      options: [l("acks=0", "acks=0"), l("acks=1", "acks=1"), l("acks=all", "acks=all"), l("Hiçbiri", "None")],
      answer: 1,
      explain: l(
        "acks=1 sadece leader'ı bekler. acks=0 hiç beklemez, acks=all bütün ISR'yi bekler.",
        "acks=1 waits for the leader only. acks=0 waits for nothing; acks=all waits for the whole ISR.",
      ),
      reviewStep: 2,
    },
    {
      question: l(
        "acks=all ile yazıyorsun, ISR = [1] (sadece leader) ve min.insync.replicas=1. Yazma ne olur?",
        "You write with acks=all, the ISR is [1] (just the leader) and min.insync.replicas=1. What happens?",
      ),
      options: [
        l("Reddedilir", "It is rejected"),
        l("Leader yazınca onaylanır; tek kopyası olur", "It is acked once the leader writes; it has one copy"),
        l("Follower'lar dönene kadar bekler", "It waits for the followers to return"),
        l("Kayıt hemen kaybolur", "The record is lost at once"),
      ],
      answer: 1,
      explain: l(
        "acks=all, ISR'deki herkesi bekler ve ISR'de sadece leader var. min.insync=1 de buna izin veriyor. Kayıt tek kopyayla onaylanır.",
        "acks=all waits for the ISR, which is only the leader, and min.insync=1 allows it. The record is acked with a single copy.",
      ),
      reviewStep: 6,
    },
    {
      question: l(
        "RF=3, min.insync.replicas=2, acks=all. İki broker aynı anda çöktü. Ne olur?",
        "RF=3, min.insync.replicas=2, acks=all. Two brokers crash at once. What happens?",
      ),
      options: [
        l("Yazmalar ve okumalar aynen sürer", "Writes and reads carry on as normal"),
        l("Yazmalar NotEnoughReplicas ile reddedilir; okumalar sürer", "Writes fail with NotEnoughReplicas; reads carry on"),
        l("Onaylı kayıtlar kaybolur", "Acked records are lost"),
        l("Kafka min.insync.replicas'ı kendiliğinden 1'e düşürür", "Kafka lowers min.insync.replicas to 1 by itself"),
      ],
      answer: 1,
      explain: l(
        "ISR 1'e iner, 2'nin altına. Yeni acks=all yazmalar reddedilir; mevcut veri güvende ve okunabilir.",
        "The ISR drops to 1, below 2. New acks=all writes are refused; existing data is safe and readable.",
      ),
      reviewStep: 8,
    },
    {
      question: l(
        "acks=1 ile onay almış bir kayıt hangi durumda kaybolabilir?",
        "When can a record acked with acks=1 be lost?",
      ),
      options: [
        l("Hiçbir zaman", "Never"),
        l("Leader, follower'lar kopyalamadan çökerse", "If the leader crashes before followers copy it"),
        l("Sadece bütün broker'lar aynı anda çökerse", "Only if every broker crashes at once"),
        l("Consumer onu okuyunca", "When a consumer reads it"),
      ],
      answer: 1,
      explain: l(
        "acks=1 onayı leader yazınca verilir. Leader kopyalanmadan çökerse, kaydı olmayan bir follower leader olabilir.",
        "With acks=1 the ack is sent once the leader writes. If the leader dies before any copy is made, a follower without the record can take over.",
      ),
      reviewStep: 3,
    },
  ],
};
