import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { WhyKafkaScene } from "./Scene";

export const whyKafka: Lesson = {
  slug: "why-kafka",
  title: l("Neden Kafka?", "Why Kafka?"),
  summary: l(
    "Servisler birbirine doğrudan bağlanınca ne ters gider, Kafka bunu nasıl çözer?",
    "What goes wrong when services call each other directly, and how Kafka fixes it.",
  ),
  minutes: 8,
  level: l("Başlangıç", "Beginner"),
  Scene: WhyKafkaScene,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Servisler doğrudan bağlanınca neyin bozulduğunu görmek", "See what breaks when services call each other directly"), step: 2 },
    { text: l("Bir servis çökünce zincirin nasıl etkilendiğini görmek", "See how one crash ripples through the chain"), step: 3 },
    { text: l("Araya ortak bir log koymanın neyi düzelttiğini anlamak", "Understand what a shared log in the middle fixes"), step: 5 },
    { text: l("Producer, consumer ve event kavramlarını tanımak", "Meet producers, consumers and events"), step: 7 },
    { text: l("Bir record'un içinde ne olduğunu bilmek", "Know what is inside a record"), step: 8 },
  ],
  steps: [
    {
      short: l("Bir sipariş", "One order"),
      tag: "how",
      changes: [
        { kind: "add", text: l("Sipariş servisi 3 servisi tek tek çağırıyor", "The order service calls 3 services one by one") },
      ],
      title: l("Bir sipariş geldi", "An order comes in"),
      body: [
        l(
          "Bir online mağaza düşün. Müşteri **Satın al**'a bastığında sipariş servisi çalışır. Ama iş orada bitmez: ödeme alınmalı, stok düşülmeli ve müşteriye bir e-posta gitmeli.",
          "Picture an online shop. When a customer presses **Buy**, the order service runs. But the work does not end there: the payment has to be taken, stock has to go down, and the customer needs an email.",
        ),
        l(
          "En basit çözüm şu: sipariş servisi bu üç servisi tek tek çağırır. Sahnedeki her yol böyle bir çağrı; üzerinde giden minik koliler de taşınan veriler.",
          "The simplest solution: the order service calls those three services one by one. Each road in the scene is such a call, and the little parcels on it are the data going across.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Burada henüz bir sorun yok. Üç servis için doğrudan çağrı gayet makul. Sorunlar sistem büyüdükçe ortaya çıkıyor.",
            "Nothing is wrong yet. For three services, direct calls are perfectly reasonable. The trouble starts as the system grows.",
          ),
        },
      ],
    },
    {
      short: l("Herkes istiyor", "Everyone wants it"),
      tag: "problem",
      changes: [
        { kind: "add", text: l("+3 servis: Analitik, Dolandırıcılık, Kargo", "+3 services: Analytics, Fraud check, Shipping") },
        { kind: "bad", text: l("Sipariş servisi artık 6 servisi tanımak zorunda", "The order service now has to know 6 services") },
      ],
      title: l("Herkes siparişten haberdar olmak istiyor", "Everyone wants to hear about orders"),
      body: [
        l(
          "Şirket büyüyor. Analitik ekibi satış raporu istiyor, güvenlik ekibi şüpheli siparişleri yakalamak istiyor, kargo ekibi paketi hazırlamak istiyor.",
          "The company grows. The analytics team wants sales reports, the security team wants to catch suspicious orders, the shipping team wants to prepare the parcel.",
        ),
        l(
          "Her yeni ihtiyaç, sipariş servisine bir çağrı daha ekletiyor. Sipariş servisinin asıl işi sipariş almak; ama artık altı servisin adresini, hatalarını ve yavaşlığını da bilmek zorunda.",
          "Every new need adds another call to the order service. Its real job is taking orders, but now it also has to know six services' addresses, errors and slowness.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Yeni bir servis eklemek için başka bir ekibin koduna dokunman gerekiyorsa, servisler birbirine [[coupling|sıkı bağlı]] demektir.",
            "If adding a new service means changing another team's code, the services are [[coupling|tightly coupled]].",
          ),
        },
      ],
    },
    {
      short: l("Bağlantı yumağı", "The tangle"),
      tag: "problem",
      changes: [
        { kind: "add", text: l("+2 kaynak: Sepet ve Üyelik", "+2 sources: Cart and Accounts") },
        { kind: "bad", text: l("Bağlantı sayısı: 6 → 18", "Connections: 6 → 18") },
      ],
      predict: {
        question: l(
          "Sepet ve üyelik servisleri de olay üretmeye başladı: artık 3 kaynak ve 6 hedef var. Herkes doğrudan birbirine bağlanırsa en kötü durumda kaç bağlantı olur?",
          "The cart and account services start producing too: now there are 3 sources and 6 targets. If everyone connects directly, how many connections is the worst case?",
        ),
        options: [l("9 (3 + 6)", "9 (3 + 6)"), l("18 (3 × 6)", "18 (3 × 6)"), l("6", "6")],
        answer: 1,
        why: l(
          "Her kaynak her hedefe ayrı bir bağlantı kurar: 3 × 6 = 18. Servis ekledikçe bu sayı çarpılarak büyür.",
          "Every source opens its own connection to every target: 3 × 6 = 18. Each new service multiplies the count.",
        ),
      },
      title: l("Bağlantılar katlanarak çoğalıyor", "Connections multiply"),
      body: [
        l(
          "Olay üreten tek servis sipariş servisi değil. Sepet ve üyelik servisleri de olay üretiyor ve aynı servisler onları da dinlemek istiyor.",
          "The order service is not the only one producing news. The cart and account services do too, and the same services want to hear from them as well.",
        ),
        l(
          "3 kaynak ve 6 hedef varsa, en kötü durumda **3 × 6 = 18** ayrı bağlantı olur. Her biri ayrı ayrı yazılmalı, izlenmeli ve bozulduğunda onarılmalı.",
          "With 3 sources and 6 targets, the worst case is **3 × 6 = 18** separate connections. Each one has to be written, monitored and fixed when it breaks.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "N kaynak ve M hedef için bağlantı sayısı N × M büyür. Bir noktadan sonra bu çizgileri yönetmek asıl işin önüne geçer.",
            "With N sources and M targets, connections grow as N × M. At some point, managing the lines takes over from the real work.",
          ),
        },
      ],
    },
    {
      short: l("Biri çökerse", "One goes down"),
      tag: "problem",
      changes: [
        { kind: "bad", text: l("E-posta servisi çöktü", "The email service is down") },
        { kind: "bad", text: l("Sipariş servisi cevap bekliyor", "The order service is stuck waiting") },
      ],
      predict: {
        question: l(
          "Gece e-posta servisi çöktü. Sipariş servisi onu doğrudan çağırıyor. Yeni bir sipariş gelince ne olur?",
          "At night the email service crashes. The order service calls it directly. What happens when a new order comes in?",
        ),
        options: [
          l("Hiçbir şey; e-posta servisi geri gelince e-postayı kendisi bulur", "Nothing; the email service finds the email itself when it is back"),
          l("Sipariş servisi cevap bekler ve o e-posta kaybolabilir", "The order service waits for an answer, and that email can be lost"),
          l("Bütün servisler birlikte çöker", "Every service crashes together"),
        ],
        answer: 1,
        why: l(
          "Doğrudan çağrıda karşı tarafın o anda ayakta olması gerekir. E-posta yoksa sipariş servisi takılır, mesajı tutan da kimse yoktur.",
          "A direct call needs the other side to be up at that moment. With email down, the order service gets stuck, and nobody holds on to the message.",
        ),
      },
      title: l("E-posta servisi çöktü", "The email service is down"),
      body: [
        l(
          "Gece 02:00'de e-posta servisi çöküyor. Sipariş servisi onu çağırıyor ve cevap alamıyor. Şimdi ne yapacak?",
          "At 2 a.m. the email service crashes. The order service calls it and gets no answer. What now?",
        ),
        l(
          "Siparişi iptal mi edecek? Beklemeye mi devam edecek? Tekrar mı deneyecek? Ya tekrar denerken kendisi de yeniden başlarsa? O e-posta sessizce kaybolur.",
          "Cancel the order? Keep waiting? Retry? And if it restarts while retrying, that email is silently lost.",
        ),
        l(
          "Doğrudan çağrılarda iki servisin **aynı anda** ayakta olması gerekir. Biri düşünce diğeri de etkilenir.",
          "Direct calls need both services to be up **at the same time**. When one falls over, the other suffers too.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Telefonla aramak gibi: karşı taraf açmazsa söyleyeceğin iletilmez. İhtiyacımız olan, karşı tarafın müsait olunca dinleyeceği bir sesli mesaj kutusu.",
            "Like a phone call: if nobody picks up, your message does not get through. What we need is a voicemail box the other side checks when it is free.",
          ),
        },
      ],
    },
    {
      short: l("Ani yük", "Traffic spike"),
      tag: "problem",
      changes: [
        { kind: "change", text: l("Sipariş trafiği ×50", "Order traffic ×50") },
        { kind: "bad", text: l("Analitik yetişemiyor, işler birikiyor", "Analytics can't keep up; work piles up") },
        { kind: "bad", text: l("Sipariş servisi, dolayısıyla müşteri bekliyor", "The order service, and so the customer, waits") },
      ],
      title: l("Kampanya günü: trafik 50 katına çıktı", "Sale day: traffic jumps 50×"),
      body: [
        l(
          "Büyük indirim başladı ve her dakika normalin 50 katı sipariş geliyor. Ödeme servisi yetişiyor ama analitik servisi yavaş; her çağrıya geç cevap veriyor.",
          "A big sale starts and fifty times the usual orders arrive every minute. Payments keeps up, but analytics is slow and answers every call late.",
        ),
        l(
          "Sipariş servisi analitiği beklerken müşteriler de bekliyor. Zincirdeki en yavaş servis, bütün zincirin hızını belirliyor.",
          "While the order service waits for analytics, customers wait too. The slowest service in the chain sets the speed of the whole chain.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Üreten taraf ile okuyan taraf farklı hızlarda çalışabilmeli. Doğrudan çağrılar buna izin vermez.",
            "The side that produces and the side that reads should be able to run at different speeds. Direct calls do not allow that.",
          ),
        },
      ],
    },
    {
      short: l("Ortak defter", "Shared log"),
      tag: "idea",
      changes: [
        { kind: "good", text: l("Araya ortak bir log girdi", "A shared log sits in the middle") },
        { kind: "good", text: l("Bağlantı sayısı: 18 → 9", "Connections: 18 → 9") },
        { kind: "good", text: l("Kimse kimseyi doğrudan çağırmıyor", "Nobody calls anybody directly") },
      ],
      predict: {
        question: l(
          "Araya herkesin yazıp okuduğu ortak bir defter koyuyoruz. 3 kaynak ve 6 hedef var. Şimdi kaç bağlantı olur?",
          "We put a shared log in the middle that everyone writes to and reads from. With 3 sources and 6 targets, how many connections now?",
        ),
        options: [l("18, değişmez", "18, nothing changes"), l("9, herkes sadece deftere bağlanır", "9, everyone connects only to the log"), l("1", "1")],
        answer: 1,
        why: l(
          "Her servis artık sadece deftere bağlanıyor: 3 kaynak + 6 hedef = 9. Servis eklemek sadece bir bağlantı ekler.",
          "Each service now connects only to the log: 3 sources + 6 targets = 9. A new service adds just one connection.",
        ),
      },
      title: l("Fikir: araya ortak bir defter koy", "The idea: put a shared log in between"),
      body: [
        l(
          "Sipariş servisi kimseyi çağırmasın. Sadece olanı bir deftere yazsın: \"1042 numaralı sipariş verildi.\" Olmuş bir şeyin bu kaydına [[event]] diyoruz.",
          "The order service stops calling anyone. It just writes what happened into a log: \"order 1042 was placed\". A record of something that happened is called an [[event]].",
        ),
        l(
          "İlgilenen her servis bu defteri kendi hızında okusun. Yazan, kimin okuduğunu bilmez. Okuyan da kimin yazdığını bilmek zorunda değildir.",
          "Every interested service reads that log at its own pace. The writer does not know who reads, and the readers do not need to know who wrote.",
        ),
        l(
          "Bağlantı sayısı 18'den **3 + 6 = 9**'a düştü. Yeni bir servis eklemek için kimseye sormak gerekmiyor; defteri okumaya başlaması yeterli.",
          "Connections drop from 18 to **3 + 6 = 9**. Adding a new service needs nobody's permission: it just starts reading the log.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Bu yaklaşıma event-driven (olay güdümlü) mimari denir. Servisler birbirine değil, olaylara bağlanır.",
            "This is called event-driven architecture. Services depend on events, not on each other.",
          ),
        },
      ],
    },
    {
      short: l("Çökme sorun değil", "Crashes are fine"),
      tag: "idea",
      changes: [
        { kind: "bad", text: l("E-posta yine çöktü", "Email is down again") },
        { kind: "good", text: l("Event'ler log'da bekliyor, hiçbiri kaybolmadı", "Events wait in the log; none are lost") },
        { kind: "good", text: l("Geri gelince arayı kapatıyor", "When it is back, it catches up") },
      ],
      predict: {
        question: l(
          "E-posta servisi yine çöktü ama bu sefer arada defter var. Çökükken gelen siparişlerin e-postalarına ne olur?",
          "The email service crashes again, but this time the log is in between. What happens to the emails for orders that arrive while it is down?",
        ),
        options: [
          l("Kaybolurlar", "They are lost"),
          l("Defterde bekler, servis geri gelince gönderilir", "They wait in the log and go out when the service is back"),
          l("Sipariş servisi onları göndermek için bekler", "The order service waits to send them"),
        ],
        answer: 1,
        why: l(
          "Sipariş servisi event'i deftere yazıp devam eder. E-posta servisi geri gelince kaldığı yerden okur ve aradaki her şeyi işler.",
          "The order service writes the event to the log and moves on. When email is back, it reads from where it stopped and handles everything in between.",
        ),
      },
      title: l("Çöken servis kaldığı yerden devam eder", "A crashed service picks up where it left off"),
      body: [
        l(
          "E-posta servisi yine çöktü. Ama bu sefer sipariş servisini ilgilendirmiyor: event'i yazdı ve işine devam etti. Event'ler defterde bekliyor.",
          "The email service crashes again. This time the order service does not care: it wrote the event and moved on. The events wait in the log.",
        ),
        l(
          "E-posta servisi geri geldiğinde en son nerede kaldığına bakar ve aradaki event'leri sırayla işler. Hiçbir sipariş e-postası kaybolmaz.",
          "When the email service comes back, it checks where it stopped and works through the events in between, in order. No order email is lost.",
        ),
        l(
          "Sahneyi izle: e-posta servisi düşünce geride kalıyor, geri gelince arayı kapatıyor. Diğer servisler bundan hiç etkilenmiyor.",
          "Watch the diagram: when email is down it falls behind, and when it is back it catches up. The other services never notice.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu, okuyanın \"nerede kaldım\" bilgisini bir yere kaydetmesine bağlı. Bunun nasıl yapıldığını bir sonraki derste, offset ve commit konusunda göreceğiz.",
            "This depends on the reader saving \"where I stopped\" somewhere. The next lesson, on offsets and commits, shows how.",
          ),
        },
      ],
    },
    {
      short: l("Bu Kafka", "This is Kafka"),
      tag: "how",
      changes: [
        { kind: "change", text: l("Ortak log'un adı: Apache Kafka", "The shared log has a name: Apache Kafka") },
      ],
      title: l("Bu defterin adı: Apache Kafka", "That log is Apache Kafka"),
      body: [
        l(
          "Apache Kafka tam olarak bu ortak defter. Event'leri diske yazar, sıralarını korur ve her okuyucunun kendi hızında okumasına izin verir.",
          "Apache Kafka is exactly this shared log. It writes events to disk, keeps them in order, and lets every reader go at its own pace.",
        ),
        l(
          "Kafka'ya yazan uygulamaya [[producer]], okuyan uygulamaya [[consumer]] denir. Bir servis aynı anda ikisi birden de olabilir.",
          "An application that writes to Kafka is a [[producer]]; one that reads is a [[consumer]]. A service can be both at once.",
        ),
        l(
          "Kafka, LinkedIn'de şirket içindeki bu bağlantı yumağını çözmek için geliştirildi, 2011'de açık kaynak oldu ve bugün bir Apache Software Foundation projesi.",
          "Kafka was built at LinkedIn to untangle exactly this kind of mess, became open source in 2011, and is now an Apache Software Foundation project.",
        ),
        l(
          "Kafka tek bir defter de değil: birçok sunucuya yayılmış bir defter. Bu sayede saniyede milyonlarca event'i kaldırabilir ve bir sunucu düşse bile verinin kopyaları başka sunucularda durur. Bunları ilerideki derslerde tek tek göreceğiz.",
          "And it is not one log on one machine: it is spread over many servers. That is how it handles millions of events per second and keeps copies of the data when a server dies. Later lessons cover each of these.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka bir veritabanının yerini almaz ve klasik mesaj kuyruklarıyla da tam olarak aynı şey değildir. Farklarını kursun sonunda ayrıca karşılaştıracağız.",
            "Kafka does not replace a database, and it is not quite the same as a classic message queue either. The course compares them near the end.",
          ),
        },
      ],
    },
    {
      short: l("Event'in içi", "Inside an event"),
      tag: "how",
      changes: [
        { kind: "change", text: l("Bir event'e, yani bir koliye yakından baktık", "We opened up one event, one parcel") },
      ],
      title: l("Bir event'in içinde ne var?", "What is inside an event?"),
      body: [
        l(
          "Kafka'da her event bir [[record]] olarak saklanır. Bir record'un dört parçası var:",
          "Kafka stores each event as a [[record]]. A record has four parts:",
        ),
        l(
          "**Key**: event'in neye ait olduğu, örneğin sipariş numarası. İsteğe bağlıdır ama sıralama için önemlidir; ileride göreceğiz. **Value**: asıl içerik. **Timestamp**: ne zaman olduğu. **Headers**: isteğe bağlı ek bilgiler.",
          "**Key**: what the event is about, such as the order number. It is optional but matters for ordering, as we will see. **Value**: the actual content. **Timestamp**: when it happened. **Headers**: optional extra information.",
        ),
        l(
          "Event'ler geçmiş zamanla isimlendirilir: `OrderPlaced`, `PaymentReceived`. Çünkü olmuş bir şeyi anlatırlar ve olmuş bir şey değiştirilemez.",
          "Events are named in the past tense: `OrderPlaced`, `PaymentReceived`. They describe something that already happened, and the past cannot be changed.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Kafka içeriğin ne olduğunu bilmez; onun için key de value da byte dizisidir. JSON, Avro ya da Protobuf kullanmak senin kararın.",
            "Kafka does not know what the content means: key and value are just bytes to it. JSON, Avro or Protobuf is your choice.",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Bu sahnede sistemi sen kuruyorsun: servisleri **doğrudan** birbirine bağlayabilir ya da araya **Kafka** koyabilirsin. Servis ekleyebilir, sipariş verebilir ve e-posta servisini çökertip yeniden başlatabilirsin.",
          "Here you build the system yourself: wire services **directly** to each other or put **Kafka** in the middle. You can add services, place orders, and crash and restart the email service.",
        ),
        l(
          "Sayaçlar her düğmeden sonra ne olduğunu gösterir: kaç bağlantı var, kaç e-posta gitti, kaçı kayboldu, kaçı log'da bekliyor.",
          "The counters show what happened after every button: how many connections, emails sent, emails lost, and events waiting in the log.",
        ),
        l(
          "Sahnenin altında **3 görev** var. Ne kadar az hamleyle bitirirsen o kadar çok yıldız alırsın. Görevsiz oynamak istersen **Serbest**'i seç.",
          "Under the scene there are **3 missions**. The fewer moves you use, the more stars you get. To play without a mission, choose **Free play**.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Gerçek sistemlerde doğrudan çağrılar çoğu zaman tekrar dener (retry) ve bazı e-postaları kurtarır. Ama servis uzun süre kapalı kalırsa ya da çağıran taraf da yeniden başlarsa mesajlar yine kaybolabilir. Kafka bu yükü tek bir yere, kalıcı log'a taşır.",
            "Real direct calls often retry and save some emails. But if the service stays down long enough, or the caller restarts too, messages can still be lost. Kafka moves that burden into one place: a durable log.",
          ),
        },
      ],
    },
  ],
  recap: [
    l(
      "Servisler birbirini doğrudan çağırınca bağlantılar **N × M** büyür; bir servisin çökmesi ya da yavaşlaması diğerlerini de etkiler.",
      "When services call each other directly, connections grow as **N × M**, and one slow or crashed service drags the others down.",
    ),
    l(
      "Kafka araya ortak bir log koyar: [[producer]]'lar yazar, [[consumer]]'lar kendi hızında okur. Kimse kimseyi beklemez.",
      "Kafka puts a shared log in between: [[producer|producers]] write, [[consumer|consumers]] read at their own pace. Nobody waits for anybody.",
    ),
    l(
      "Okuyan çökse bile event'ler Kafka'da bekler; okuyan geri gelince kaldığı yerden devam eder.",
      "If a reader crashes, the events wait in Kafka, and the reader continues from where it stopped.",
    ),
    l(
      "Bir [[event]] olmuş bir şeyin kaydıdır: key, value, timestamp ve headers'tan oluşur ve değiştirilmez.",
      "An [[event]] records something that happened: key, value, timestamp and headers. It is never changed.",
    ),
  ],
  quiz: [
    {
      question: l(
        "4 kaynak servis 5 hedef servise doğrudan bağlanırsa en kötü durumda kaç bağlantı olur? Araya Kafka koyunca kaça düşer?",
        "If 4 source services connect directly to 5 target services, how many connections is the worst case? How many with Kafka in between?",
      ),
      options: [l("9, sonra 20", "9, then 20"), l("20, sonra 9", "20, then 9"), l("20, sonra 20", "20, then 20"), l("9, sonra 9", "9, then 9")],
      answer: 1,
      explain: l(
        "Doğrudan bağlantıda 4 × 5 = 20. Kafka ile her servis sadece Kafka'ya bağlanır: 4 + 5 = 9.",
        "Direct: 4 × 5 = 20. With Kafka, each service connects only to Kafka: 4 + 5 = 9.",
      ),
      reviewStep: 5,
    },
    {
      question: l(
        "Kafka kullanan bir sistemde e-posta servisi 10 dakika çöküyor. Bu sırada verilen siparişlerin e-postalarına ne olur?",
        "In a system using Kafka, the email service is down for 10 minutes. What happens to the emails for orders placed meanwhile?",
      ),
      options: [
        l("Kaybolurlar", "They are lost"),
        l("Sipariş servisi hata vermeye başlar", "The order service starts failing"),
        l("Event'ler Kafka'da bekler, servis geri gelince e-postalar gönderilir", "The events wait in Kafka and the emails go out when the service is back"),
        l("Kafka e-postaları kendisi gönderir", "Kafka sends the emails itself"),
      ],
      answer: 2,
      explain: l(
        "Sipariş servisi event'i Kafka'ya yazıp devam eder. E-posta servisi geri gelince kaldığı yerden okur.",
        "The order service writes the event to Kafka and moves on. The email service reads from where it stopped once it is back.",
      ),
      reviewStep: 6,
    },
    {
      question: l("Hangisi iyi bir event adıdır?", "Which one is a good event name?"),
      options: [l("`SendEmail`", "`SendEmail`"), l("`OrderPlaced`", "`OrderPlaced`"), l("`UpdateStock`", "`UpdateStock`"), l("`GetOrder`", "`GetOrder`")],
      answer: 1,
      explain: l(
        "Event olmuş bir şeyi anlatır, o yüzden geçmiş zamanla isimlendirilir. Diğerleri bir şeyin yapılmasını isteyen komutlar.",
        "An event describes something that already happened, so it is named in the past tense. The others are commands asking for something to be done.",
      ),
      reviewStep: 8,
    },
  ],
};
