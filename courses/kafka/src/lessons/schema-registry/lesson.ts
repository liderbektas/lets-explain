import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { changesFor, SchemaRegistryScene } from "./Scene";

export const schemaRegistry: Lesson = {
  slug: "schema-registry",
  title: l("Schema Registry", "Schema Registry"),
  summary: l(
    "Yazan ve okuyan servislerin veri formatında anlaşması: şemalar, şema kimlikleri ve uyumluluk kuralları.",
    "How writers and readers agree on a data format: schemas, schema ids and compatibility rules.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: SchemaRegistryScene,
  changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kafka'nın kayıtların içine bakmadığını görmek", "See that Kafka never looks inside records"), step: 1 },
    { text: l("Schema Registry'nin ne işe yaradığını anlamak", "Understand what a Schema Registry is for"), step: 3 },
    { text: l("Mesajda şemanın kendisi yerine kimliğinin taşındığını görmek", "See that a message carries a schema id, not the schema"), step: 4 },
    { text: l("Uyumlu ve uyumsuz değişikliği ayırt etmek", "Tell a compatible change from an incompatible one"), step: 7 },
    { text: l("BACKWARD modunda neden önce okuyanın güncellendiğini öğrenmek", "Learn why readers upgrade first in BACKWARD mode"), step: 9 },
  ],
  steps: [
    {
      short: l("Sadece byte", "Just bytes"),
      tag: "how",
      title: l("Kafka için her kayıt sadece byte", "To Kafka, every record is just bytes"),
      body: [
        l(
          "Sipariş servisi siparişleri JSON olarak yazıyor: `{\"id\": 1041, \"total\": 349.9}`. Fatura servisi de okuyup faturayı kesiyor.",
          "The order service writes orders as JSON: `{\"id\": 1041, \"total\": 349.9}`. The billing service reads them and issues invoices.",
        ),
        l(
          "Kafka bu kayıtların içine hiç bakmaz. Onun için her kayıt bir byte dizisidir: ne alan adını bilir ne de tipini.",
          "Kafka never looks inside these records. To Kafka, each one is a sequence of bytes: it knows neither the field names nor their types.",
        ),
        l(
          "Yani yazanla okuyanın formatta anlaşması tamamen onların işi. Şimdilik ikisi de aynı formatı bildiği için her şey yolunda.",
          "So agreeing on the format is entirely up to the writer and the reader. For now they both know the same format, so everything works.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Kargo şirketi gibi: koliyi taşır ama içinde ne olduğunu açıp kontrol etmez.",
            "Like a courier: it carries the parcel but never opens it to check what is inside.",
          ),
        },
      ],
    },
    {
      short: l("Format değişti", "Format changed"),
      tag: "problem",
      title: l("Kimse haber vermedi", "Nobody said a word"),
      predict: {
        question: l(
          "Sipariş servisinin ekibi `total` alanının adını `amount` yaptı ve yeni siparişler yazdı. Fatura hâlâ eski kodla `total` arıyor. Ne olur?",
          "The order team renamed the `total` field to `amount` and wrote new orders. Billing still looks for `total` with its old code. What happens?",
        ),
        options: [
          l("Kafka yeni kayıtları reddeder", "Kafka rejects the new records"),
          l("Kayıtlar yazılır ama Fatura onları okuyamaz", "The records are written, but billing cannot read them"),
          l("Fatura yeni alanı kendisi tanır", "Billing figures out the new field by itself"),
        ],
        answer: 1,
        why: l(
          "Kafka formatı kontrol etmez, kayıtları olduğu gibi saklar. Sorunu ancak okuyan taraf, okurken fark eder.",
          "Kafka does not check the format; it stores the records as they are. Only the reader notices the problem, while reading.",
        ),
      },
      body: [
        l(
          "Sipariş servisi `total` alanının adını `amount` yaptı. Kafka iki yeni kaydı hiç itiraz etmeden yazdı.",
          "The order service renamed `total` to `amount`. Kafka wrote the two new records without a word.",
        ),
        l(
          "Fatura onları okumaya çalıştı ve `total` alanını bulamadı. Kırmızı ünlem işaretli koliler, okunamayan kayıtlar.",
          "Billing tried to read them and could not find `total`. The parcels with a red exclamation mark are the records it could not read.",
        ),
        l(
          "Hata yazan tarafta yapıldı ama okuyan tarafta, belki saatler sonra, gece yarısı patladı. Bu tür kayıtlara **poison pill** (zehirli hap) denir.",
          "The mistake was made by the writer, but it blew up on the reader's side, maybe hours later at midnight. Records like these are called **poison pills**.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada okunamayan kayıt sayılıp geçiliyor. Gerçek bir consumer okuyamadığı kayıtta hata fırlatır ve siz bir şey yapana kadar o offset'te takılı kalır. Çözüm, kaydı atlamak ya da bir dead letter topic'e göndermektir.",
            "Here an unreadable record is counted and skipped. A real consumer throws an error on it and stays stuck at that offset until you act: skip it, or send it to a dead letter topic.",
          ),
        },
      ],
    },
    {
      short: l("Şema", "Schema"),
      tag: "idea",
      title: l("Fikir: formatı bir sözleşmeye yaz", "The idea: write the format down as a contract"),
      changes: [{ kind: "change", text: l("Sipariş servisi `total`'a geri döndü", "The order service went back to `total`") }],
      body: [
        l(
          "Sipariş servisi `total` alanına geri döndü. Ama asıl sorun duruyor: format sadece iki ekibin kafasında.",
          "The order service went back to `total`. But the real problem remains: the format lives only in two teams' heads.",
        ),
        l(
          "Çözüm, formatı açıkça yazmak. Bir kaydın hangi alanlardan oluştuğunu ve tiplerini anlatan bu tarife [[schema]] (şema) denir. Sağ alttaki kart, sipariş servisinin şeması.",
          "The fix is to write the format down. A description of a record's fields and their types is a [[schema]]. The card at the bottom right is the order service's schema.",
        ),
        l(
          "Kafka dünyasında şemalar çoğunlukla **Avro**, **Protobuf** ya da **JSON Schema** ile yazılır. Şemayı bilen bir [[serializer]], nesneyi byte'lara çevirirken ona uyar.",
          "In the Kafka world, schemas are mostly written in **Avro**, **Protobuf** or **JSON Schema**. A [[serializer]] that knows the schema follows it when turning an object into bytes.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Kesikli çerçeveli alanların default değeri var. Okuyan taraf bu alanı bulamazsa default değeri kullanır. Bu ayrıntı birazdan çok önemli olacak.",
            "Fields with a dashed outline have a default value. If the reader cannot find such a field, it uses the default. This detail matters a lot in a moment.",
          ),
        },
      ],
    },
    {
      short: l("Registry", "Registry"),
      tag: "how",
      title: l("Şemaların tek adresi: Schema Registry", "One home for schemas: the Schema Registry"),
      body: [
        l(
          "Sağ üste yeni bir servis geldi: [[schemaRegistry]]. Şemaları sürüm sürüm saklar. Kafka'nın içinde değil, yanında çalışır.",
          "A new service has appeared at the top right: the [[schemaRegistry]]. It stores schemas version by version. It runs next to Kafka, not inside it.",
        ),
        l(
          "Sipariş servisi ilk kaydı yazarken serializer şemayı registry'ye gönderdi. Registry onu `orders-value` adlı [[subject]] altında **v1** olarak sakladı ve bir kimlik verdi: **#1**.",
          "As the order service wrote its first record, the serializer sent the schema to the registry. The registry stored it as **v1** under the [[subject]] `orders-value` and gave it an id: **#1**.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Schema Registry Apache Kafka projesinin parçası değil. En yaygını Confluent'in Schema Registry'si. Apicurio Registry, Karapace ve AWS Glue Schema Registry de aynı işi yapar.",
            "Schema Registry is not part of the Apache Kafka project. The most common one is Confluent's. Apicurio Registry, Karapace and AWS Glue Schema Registry do the same job.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Serializer'ın şemayı kendiliğinden kaydetmesi `auto.register.schemas=true` ayarından gelir (varsayılan). Canlı ortamda bu çoğu zaman kapatılır ve şemalar CI sürecinde kaydedilir.",
            "The serializer registers the schema by itself because of `auto.register.schemas=true` (the default). In production this is often turned off and schemas are registered in CI.",
          ),
        },
      ],
    },
    {
      short: l("Sadece id", "Just an id"),
      tag: "how",
      title: l("Mesajda şemanın kimliği gider", "The message carries the schema's id"),
      predict: {
        question: l(
          "Sipariş servisi registry ile iki kayıt daha yazacak. Serializer her mesaja şemadan ne koyar?",
          "The order service will write two more records with the registry. What does the serializer put in each message about the schema?",
        ),
        options: [
          l("Şemanın tamamını", "The whole schema"),
          l("Sadece şemanın 4 byte'lık kimliğini", "Only the schema's 4-byte id"),
          l("Hiçbir şey: Kafka şemayı kendisi bilir", "Nothing: Kafka knows the schema"),
        ],
        answer: 1,
        why: l(
          "Her mesaja şemanın tamamını koymak çok yer kaplardı. Mesaj sadece kimliği taşır; şemanın kendisi registry'de durur.",
          "Putting the whole schema in every message would waste a lot of space. The message carries only the id; the schema itself stays in the registry.",
        ),
      },
      body: [
        l(
          "İki kayıt daha yazıldı ve ikisinin üstünde de **#1** yazıyor. Sol üstteki kart, Kafka'ya giden bir mesajın içini gösteriyor.",
          "Two more records were written, both marked **#1**. The card at the top left shows what goes inside a message.",
        ),
        l(
          "Önce sıfır değerli bir \"sihirli byte\", sonra 4 byte'lık şema kimliği, en sonda da şemaya göre sıkıştırılmış veri. Şemanın kendisi mesajda yok.",
          "First a \"magic byte\" with the value zero, then the 4-byte schema id, and finally the data, packed according to the schema. The schema itself is not in the message.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu düzen Confluent'in \"wire format\"ıdır. Avro'da veri, alan adları olmadan sadece değerlerle yazılır; bu yüzden JSON'dan çok daha küçüktür.",
            "This layout is Confluent's \"wire format\". In Avro the data is written as values only, without field names, which makes it much smaller than JSON.",
          ),
        },
      ],
    },
    {
      short: l("Okuyan taraf", "The reader"),
      tag: "how",
      title: l("Okuyan, şemayı kimliğiyle bulur", "The reader finds the schema by its id"),
      body: [
        l(
          "Fatura de artık registry deserializer'ını kullanıyor. İlk #1'li kaydı görünce registry'ye sordu: \"#1 hangi şema?\" Cevabı aldı ve **önbelleğe** koydu.",
          "Billing now uses the registry deserializer too. When it saw the first #1 record, it asked the registry \"which schema is #1?\", got the answer and **cached** it.",
        ),
        l(
          "Sonraki iki kayıt için registry'ye hiç sormadı. Her şema kimliği için tek bir istek yeterli, bu yüzden registry okumayı yavaşlatmaz.",
          "For the next two records it did not ask at all. One request per schema id is enough, so the registry does not slow reading down.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Okuyan taraf iki şemayla çalışır: kaydın yazıldığı şema (kimlikten gelir) ve kendi kodunun beklediği şema. Arada fark varsa kurallara göre uydurur: fazla alanı atlar, eksik alana default'u koyar.",
            "The reader works with two schemas: the one the record was written with (from the id) and the one its own code expects. If they differ it reconciles them: it skips extra fields and fills missing ones with their defaults.",
          ),
        },
      ],
    },
    {
      short: l("Uyumlu", "Compatible"),
      tag: "experiment",
      title: l("Default'lu yeni alan: kabul", "A new field with a default: accepted"),
      predict: {
        question: l(
          "Sipariş servisi `coupon` adında yeni bir alan ekliyor ve ona default değer veriyor. Registry ne der?",
          "The order service adds a new field called `coupon` and gives it a default value. What does the registry say?",
        ),
        options: [
          l("Kabul eder ve v2 olarak kaydeder", "It accepts it and stores it as v2"),
          l("Reddeder, çünkü şema değişti", "It refuses, because the schema changed"),
          l("Bütün eski kayıtları yeni şemaya çevirir", "It converts every old record to the new schema"),
        ],
        answer: 0,
        why: l(
          "Varsayılan kural BACKWARD: yeni şemayı kullanan kod eski kayıtları da okuyabilmeli. Eski kayıtlarda `coupon` yok ama default değeri var, o yüzden sorun yok.",
          "The default rule is BACKWARD: code using the new schema must still read old records. Old records have no `coupon`, but it has a default, so that is fine.",
        ),
      },
      body: [
        l(
          "Registry yeni şemayı kontrol etti, **v2** olarak kabul etti ve ona **#2** kimliğini verdi. Yeni kayıt mavi ve üstünde #2 yazıyor.",
          "The registry checked the new schema, accepted it as **v2** and gave it id **#2**. The new record is blue and marked #2.",
        ),
        l(
          "Fatura'nın kodu hâlâ eski, yani `coupon` alanını bilmiyor. Yine de kaydı okudu: tanımadığı alanı atladı.",
          "Billing's code is still the old one and knows nothing about `coupon`. It read the record anyway, skipping the field it does not know.",
        ),
        l(
          "Bu kontrolü yapan kurala [[compatibility]] denir. Registry'nin varsayılanı **BACKWARD**: yeni şemayla yazılmış kod, eski şemayla yazılmış verileri okuyabilmelidir.",
          "The rule behind this check is the [[compatibility]]. The registry's default is **BACKWARD**: code built with the new schema must be able to read data written with the old one.",
        ),
      ],
    },
    {
      short: l("Uyumsuz", "Incompatible"),
      tag: "experiment",
      title: l("Yeniden adlandırma bu sefer reddedildi", "This time the rename is refused"),
      predict: {
        question: l(
          "Ekip aynı `total` → `amount` değişikliğini bu kez registry ile deniyor. Ne olur?",
          "The team tries the same `total` → `amount` change, this time with the registry. What happens?",
        ),
        options: [
          l("Kayıt yazılır, Fatura yine bozulur", "The record is written and billing breaks again"),
          l("Registry şemayı reddeder ve hiçbir kayıt yazılmaz", "The registry refuses the schema and no record is written"),
          l("Registry Fatura'nın kodunu günceller", "The registry updates billing's code"),
        ],
        answer: 1,
        why: l(
          "Yeni şemadaki `amount` alanı eski kayıtlarda yok ve default değeri de yok. Yeni şemalı kod eski kayıtları okuyamaz, bu da BACKWARD kuralını bozar.",
          "The new `amount` field is missing from old records and has no default. Code with the new schema could not read old records, which breaks the BACKWARD rule.",
        ),
      },
      body: [
        l(
          "Registry yeni şemayı reddetti (REST API'de `409 Conflict`). Serializer hata fırlattı ve kayıt Kafka'ya **hiç gitmedi**.",
          "The registry refused the new schema (a `409 Conflict` in its REST API). The serializer threw an error and the record **never reached** Kafka.",
        ),
        l(
          "Farkı gör: ilk seferde hata gece yarısı okuyan tarafta patlamıştı. Şimdi değişikliği yapan ekip, daha yazarken uyarıyı aldı.",
          "See the difference: the first time, the error blew up on the reader's side at midnight. Now the team making the change hears about it right away, while writing.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Avro'da bir alanın adını değiştirmek için `aliases` kullanılabilir; böylece okuyan taraf eski adı da tanır. Burada sadeleştirmek için yeniden adlandırmayı \"sil + ekle\" gibi ele alıyoruz.",
            "In Avro you can rename a field safely with `aliases`, so the reader also accepts the old name. To keep it simple, we treat a rename as \"delete + add\" here.",
          ),
        },
      ],
    },
    {
      short: l("BACKWARD neyi korur?", "What BACKWARD protects"),
      tag: "experiment",
      title: l("Silmek kabul edildi, eski Fatura bozuldu", "The delete is accepted, and old billing breaks"),
      predict: {
        question: l(
          "Mod hâlâ BACKWARD. Sipariş servisi `total` alanını tamamen siliyor. Fatura'nın kodu eski. Ne olur?",
          "The mode is still BACKWARD. The order service deletes the `total` field entirely. Billing's code is the old one. What happens?",
        ),
        options: [
          l("Registry reddeder, hiçbir şey bozulmaz", "The registry refuses and nothing breaks"),
          l("Registry kabul eder, ama eski Fatura yeni kaydı okuyamaz", "The registry accepts it, but old billing cannot read the new record"),
          l("Registry kabul eder ve her şey çalışır", "The registry accepts it and everything works"),
        ],
        answer: 1,
        why: l(
          "BACKWARD sadece \"yeni şemalı kod eski veriyi okuyabilir mi?\" diye bakar. Silmek buna uyar. Ama eski kod yeni veriyi okumaya çalışınca `total`'ı bulamaz.",
          "BACKWARD only asks \"can code with the new schema read old data?\". A delete passes that. But old code reading new data cannot find `total`.",
        ),
      },
      body: [
        l(
          "Registry silmeyi kabul etti ve **v3** (#3) oluştu. Ama Fatura hâlâ `total` bekliyordu ve yeni kaydı okuyamadı.",
          "The registry accepted the delete and created **v3** (#3). But billing still expected `total` and could not read the new record.",
        ),
        l(
          "Her mod farklı bir yönü korur:",
          "Each mode protects a different direction:",
        ),
        l(
          "**BACKWARD** (varsayılan): yeni kod eski veriyi okur. Default'lu alan eklemek ve alan silmek serbest. Önce **okuyanlar** güncellenir. **FORWARD**: eski kod yeni veriyi okur. Alan eklemek ve default'lu alanı silmek serbest. Önce **yazanlar** güncellenir. **FULL**: ikisi birden; sadece default'lu alan eklenip silinebilir. **NONE**: kontrol yok.",
          "**BACKWARD** (default): new code reads old data. Adding fields with defaults and deleting fields are allowed; **readers** upgrade first. **FORWARD**: old code reads new data. Adding fields and deleting fields with defaults are allowed; **writers** upgrade first. **FULL**: both; only fields with defaults may be added or deleted. **NONE**: no check.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada her yeni şema sadece en son sürümle karşılaştırılıyor. `BACKWARD_TRANSITIVE` gibi `_TRANSITIVE` modlar onu önceki **bütün** sürümlerle karşılaştırır.",
            "Here a new schema is compared only with the latest version. The `_TRANSITIVE` modes, such as `BACKWARD_TRANSITIVE`, compare it with **every** earlier version.",
          ),
        },
      ],
    },
    {
      short: l("Önce okuyan", "Readers first"),
      tag: "how",
      title: l("BACKWARD'da önce okuyanı güncelle", "In BACKWARD, upgrade the reader first"),
      body: [
        l(
          "Fatura'nın kodu en son şemaya (v3) güncellendi. Yeni kaydı da artık sorunsuz okuyor.",
          "Billing's code was updated to the latest schema (v3). It now reads the new record without trouble.",
        ),
        l(
          "Doğru sıra şuydu: önce şemayı registry'ye kaydet, sonra okuyanları güncelle, en son yazanı yeni şemaya geçir. Böylece hiçbir okuyan, tanımadığı bir veriyle karşılaşmaz.",
          "The right order was: register the schema, upgrade the readers, and only then switch the writer to it. That way no reader ever meets data it cannot handle.",
        ),
        l(
          "Hangi modu seçeceğin, hangi tarafı önce güncelleyebildiğine bağlı. Okuyanların hepsini önce güncelleyebiliyorsan BACKWARD, yazanı önce güncelleyeceksen FORWARD.",
          "Which mode you pick depends on which side you can upgrade first. If you can upgrade every reader first, use BACKWARD; if the writer goes first, use FORWARD.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Apache Kafka broker'ları kayıtları şemaya göre doğrulamaz; kontrol producer'daki serializer'da ve registry'de olur. Bazı ticari dağıtımlar broker tarafında da doğrulama sunar.",
            "Apache Kafka brokers do not validate records against a schema; the check happens in the producer's serializer and the registry. Some commercial distributions add broker-side validation.",
          ),
        },
        {
          kind: "reality",
          text: l(
            "Confluent Schema Registry şemaları yine Kafka'da, `_schemas` adlı bir topic'te saklar.",
            "Confluent Schema Registry itself stores schemas in Kafka, in a topic called `_schemas`.",
          ),
        },
      ],
    },
    {
      short: l("Sıra sende", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Burada temiz bir başlangıç var: registry açık, mod BACKWARD, sadece v1 (`id, total`) kayıtlı ve Fatura güncel.",
          "This is a clean start: the registry is on, the mode is BACKWARD, only v1 (`id, total`) is registered and billing is up to date.",
        ),
        l(
          "Sipariş servisinin şemasını değiştirebilir, uyumluluk modunu seçebilir, Fatura'ya okutabilir ve kodunu güncelleyebilirsin. Bir şema ancak o şemayla ilk kayıt yazılırken registry'ye gider.",
          "You can change the order service's schema, pick the compatibility mode, make billing read, and update its code. A schema goes to the registry only when the first record with it is written.",
        ),
        l(
          "Sahnenin altında **3 görev** var. Ne kadar az hamleyle bitirirsen o kadar çok yıldız alırsın. Görevsiz oynamak için **Serbest**'i seç.",
          "There are **3 missions** under the scene. The fewer moves you use, the more stars you get. To play without a mission, choose **Free play**.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Registry kartındaki modu değiştirip aynı değişikliği tekrar dene: aynı şema bir modda kabul edilip diğerinde reddedilebilir.",
            "Change the mode and try the same edit again: the same schema can be accepted in one mode and refused in another.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Kafka kayıtların içine bakmaz; formatta anlaşmak yazanla okuyanın işidir.",
      "Kafka never looks inside records; agreeing on the format is up to the writer and the reader.",
    ),
    l(
      "[[schemaRegistry|Schema Registry]], şemaları [[subject]] başına sürüm sürüm saklayan ayrı bir servistir.",
      "A [[schemaRegistry|Schema Registry]] is a separate service that keeps schemas version by version, per [[subject]].",
    ),
    l(
      "Mesaj şemanın kendisini değil, 4 byte'lık kimliğini taşır. Okuyan şemayı bir kez getirir ve önbelleğe alır.",
      "A message carries the schema's 4-byte id, not the schema. The reader fetches the schema once and caches it.",
    ),
    l(
      "Registry uyumsuz bir şemayı reddeder ve bozuk veri Kafka'ya hiç gitmez.",
      "The registry refuses an incompatible schema, so broken data never reaches Kafka.",
    ),
    l(
      "BACKWARD (varsayılan) yeni kodun eski veriyi okumasını korur, bu yüzden önce okuyanlar güncellenir. FORWARD tersidir, FULL ikisi birden.",
      "BACKWARD (the default) protects new code reading old data, so readers upgrade first. FORWARD is the reverse, FULL is both.",
    ),
    l(
      "Yeni alan eklerken default değer vermek, hemen her modda değişikliği güvenli yapar.",
      "Giving a new field a default value makes the change safe in almost every mode.",
    ),
  ],
  quiz: [
    {
      question: l(
        "Bir producer bozuk formatta JSON yazıyor. Apache Kafka broker'ı ne yapar?",
        "A producer writes JSON in a broken format. What does the Apache Kafka broker do?",
      ),
      options: [
        l("Kaydı reddeder", "It rejects the record"),
        l("Formatı düzeltir", "It fixes the format"),
        l("Hiçbir şey: kaydı byte olarak saklar", "Nothing: it stores the record as bytes"),
        l("Consumer'lara uyarı gönderir", "It warns the consumers"),
      ],
      answer: 2,
      explain: l(
        "Kafka için kayıt sadece byte'tır. Formatı kontrol eden, producer'daki serializer ve registry'dir.",
        "To Kafka a record is just bytes. The format is checked by the producer's serializer and the registry.",
      ),
      reviewStep: 1,
    },
    {
      question: l(
        "Registry kullanan bir producer'ın gönderdiği mesajda şemadan ne bulunur?",
        "What does a message from a producer using the registry contain about the schema?",
      ),
      options: [
        l("Şemanın tamamı", "The whole schema"),
        l("Şemanın kimliği (schema id)", "The schema's id"),
        l("Subject'in adı", "The subject's name"),
        l("Hiçbir şey", "Nothing"),
      ],
      answer: 1,
      explain: l(
        "Mesaj sihirli byte'tan sonra 4 byte'lık şema kimliğini taşır. Okuyan şemayı bu kimlikle registry'den getirir.",
        "After the magic byte the message carries the 4-byte schema id. The reader fetches the schema from the registry by that id.",
      ),
      reviewStep: 4,
    },
    {
      question: l(
        "Mod BACKWARD. Hangi değişiklik kabul edilir?",
        "The mode is BACKWARD. Which change is accepted?",
      ),
      options: [
        l("Default değeri olmayan yeni bir alan eklemek", "Adding a new field without a default"),
        l("Default değeri olan yeni bir alan eklemek", "Adding a new field with a default"),
        l("Zorunlu bir alanın adını değiştirmek", "Renaming a required field"),
        l("Hiçbiri, BACKWARD her değişikliği reddeder", "None; BACKWARD refuses every change"),
      ],
      answer: 1,
      explain: l(
        "Yeni şemalı kod eski kayıtları okurken eksik alana default değeri koyar. Default olmasaydı eski kayıtları okuyamazdı.",
        "When code with the new schema reads old records, it fills the missing field with its default. Without a default it could not read them.",
      ),
      reviewStep: 6,
    },
    {
      question: l(
        "BACKWARD modunda bir alanı sildin ve registry kabul etti. Hangi taraf önce güncellenmeliydi?",
        "In BACKWARD mode you deleted a field and the registry accepted it. Which side should have been upgraded first?",
      ),
      options: [
        l("Önce okuyanlar (consumer'lar)", "The readers (consumers) first"),
        l("Önce yazan (producer)", "The writer (producer) first"),
        l("Sıra fark etmez", "The order does not matter"),
        l("Önce Kafka broker'ları", "The Kafka brokers first"),
      ],
      answer: 0,
      explain: l(
        "BACKWARD sadece yeni kodun eski veriyi okumasını garanti eder. Eski kodlu bir okuyan, alanı silinmiş yeni veriyi okuyamaz; o yüzden okuyanlar önce güncellenir.",
        "BACKWARD only guarantees that new code reads old data. A reader with old code cannot read new data missing the field, so readers upgrade first.",
      ),
      reviewStep: 9,
    },
  ],
};
