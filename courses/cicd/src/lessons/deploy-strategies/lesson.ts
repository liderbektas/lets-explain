import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const K8S_ROLLING = `# Kubernetes Deployment: rolling is the default
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0   # never drop below 4 healthy pods
      maxSurge: 1         # start one new pod at a time`;

const K8S_RECREATE = `spec:
  strategy:
    type: Recreate   # stop every old pod, then start the new ones`;

export const deployStrategies: Lesson = {
  slug: "deploy-strategies",
  title: l("Deploy stratejileri", "Deploy strategies"),
  summary: l(
    "Yeni sürümü sunuculara koymanın birkaç yolu var: hepsini kapatıp aç (recreate), birer birer değiştir (rolling), yanına kurup trafiği çevir (blue-green) ya da önce küçük bir gruba aç (canary). Her biri kesinti, risk ve maliyet arasında farklı bir denge kurar.",
    "There are a few ways to put a new version on your servers: stop all and start again (recreate), replace them one by one (rolling), set it up next to the old one and switch traffic (blue-green), or open it to a small group first (canary). Each strikes a different balance between downtime, risk and cost.",
  ),
  minutes: 16,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Recreate'in neden kesinti yarattığını görmek", "See why recreate causes downtime"), step: 1 },
    { text: l("Rolling deploy'da iki sürümün aynı anda çalıştığını bilmek", "Know that two versions run at once during a rolling deploy"), step: 2 },
    { text: l("Blue-green ile tek hamlede geçip tek hamlede geri dönmek", "Switch and switch back in one move with blue-green"), step: 4 },
    { text: l("Canary ile bir hatayı az kullanıcıya dokunarak yakalamak", "Catch a bug with canary while touching few users"), step: 5 },
  ],
  steps: [
    {
      short: l("Dört sunucu", "Four servers"),
      tag: "problem",
      title: l("Deploy, çalışan bir şeyi değiştirmektir", "A deploy replaces something that is running"),
      body: [
        l(
          "Uygulaman dört sunucuda v1 çalıştırıyor. Önlerinde bir load balancer var: gelen her isteği ayakta olan bir sunucuya dağıtıyor. Bir tur 100 istek; şu an hepsi v1'den cevap aldı.",
          "Your app runs v1 on four servers. A load balancer sits in front of them and hands each incoming request to a server that is up. One round is 100 requests; right now all of them got an answer from v1.",
        ),
        l(
          "CD'nin son adımı bu sunucuları v2'ye geçirmek. Soru şu: geçiş sırasında kullanıcılar ne görecek, v2 bozuksa kaç kişi etkilenecek ve geri dönmek ne kadar sürecek?",
          "The last step of CD is to move these servers to v2. The question is: what do users see during the switch, how many are hurt if v2 is broken, and how long does going back take?",
        ),
      ],
    },
    {
      short: l("Recreate", "Recreate"),
      tag: "how",
      predict: {
        question: l(
          "**Recreate**: önce bütün v1 sunucuları durdurulur, sonra hepsi v2 ile açılır. Aradaki turda kullanıcılar ne görür?",
          "**Recreate**: first every v1 server is stopped, then all of them start on v2. What do users see in the round in between?",
        ),
        options: [l("v1", "v1"), l("Hata: ayakta sunucu yok", "Errors: no server is up"), l("Yarısı v1, yarısı v2", "Half v1, half v2")],
        answer: 1,
        why: l(
          "Eskiler kapandı, yeniler henüz açılmadı. O arada load balancer'ın gönderebileceği kimse yok.",
          "The old ones are gone and the new ones are not up yet. In between, the load balancer has nowhere to send anyone.",
        ),
      },
      title: l("Recreate: basit ama kesintili", "Recreate: simple, with downtime"),
      body: [
        l(
          "İlk turda 100 isteğin hepsi hata aldı: site kapalıydı. İkinci turda herkes v2'deydi. Recreate'in iyi yanı: hiçbir an iki sürüm birlikte çalışmaz. Kötü yanı: her deploy kısa bir kesinti demek.",
          "In the first round all 100 requests failed: the site was down. In the second, everyone was on v2. The good side of recreate: two versions never run together. The bad side: every deploy means a short outage.",
        ),
        l(
          "Gece kimsenin kullanmadığı bir iç araç ya da iki sürümün aynı veritabanıyla çalışamadığı bir durum için hâlâ makul bir seçim.",
          "It is still a fair choice for an internal tool nobody uses at night, or when two versions cannot share the same database.",
        ),
      ],
      practice: { commands: [], snippets: [{ label: "deployment.yaml", code: K8S_RECREATE }] },
    },
    {
      short: l("Rolling", "Rolling"),
      tag: "how",
      predict: {
        question: l(
          "**Rolling**: sunucular birer birer v2'ye geçiyor. İki sunucu geçtiğinde kullanıcılar hangi sürümü görür?",
          "**Rolling**: servers move to v2 one by one. Once two have moved, which version do users see?",
        ),
        options: [l("Hepsi v1", "All of them v1"), l("Hepsi v2", "All of them v2"), l("Bir kısmı v1, bir kısmı v2", "Some v1, some v2")],
        answer: 2,
        why: l(
          "Load balancer isteği hangi sunucuya verirse o sürümü görürsün. Rolling sırasında iki sürüm aynı anda canlıdır.",
          "You see whichever version the server the load balancer picks runs. During a rolling deploy two versions are live at once.",
        ),
      },
      title: l("Rolling: kesinti yok, ama iki sürüm yan yana", "Rolling: no downtime, but two versions side by side"),
      body: [
        l(
          "Her turda bir sunucu daha v2'ye geçti: trafiğin %25'i, %50'si, %75'i, sonra hepsi v2'de. Hiçbir an site kapanmadı; ek sunucu da gerekmedi.",
          "Each round one more server moved to v2: 25%, 50%, 75% of traffic, then all of it on v2. The site never went down, and no extra servers were needed.",
        ),
        l(
          "Bedeli: geçiş boyunca aynı kullanıcı bir istekte v1'e, bir sonrakinde v2'ye denk gelebilir. Bu yüzden API'ler ve veritabanı değişiklikleri iki sürümle de çalışacak şekilde yazılır.",
          "The price: during the switch the same user may hit v1 on one request and v2 on the next. That is why APIs and database changes are written to work with both versions.",
        ),
      ],
      practice: {
        intro: l("Kubernetes'te rolling varsayılandır; hızını ayarlarsın:", "In Kubernetes rolling is the default; you tune its pace:"),
        commands: [{ cmd: "kubectl rollout status deployment/shop", note: l("Geçişin ilerleyişini izler.", "Watches the rollout's progress.") }],
        snippets: [{ label: "deployment.yaml", code: K8S_ROLLING }],
      },
    },
    {
      short: l("Bozuk rolling", "Broken rolling"),
      tag: "experiment",
      title: l("Bozuk bir sürümle rolling", "A rolling deploy with a broken version"),
      body: [
        l(
          "Bu kez v2'de bir bug var ve her isteğe 500 dönüyor. Birinci turda 25, ikincide 50 istek hata aldı. Geri almaya karar verdik, ama rolling'de geri dönmek de bir rolling deploy: o turda da 50 istek hata aldı. Toplam 125.",
          "This time v2 has a bug and answers every request with 500. The first round had 25 failed requests, the second 50. We decided to roll back, but rolling back is another rolling deploy: 50 more failed in that round. 125 in total.",
        ),
        l(
          "Rolling, sorunu fark ettiğin ana kadar geçen her adımda daha çok kullanıcıya dokunur. Hızlı fark etmek, otomatik [[smokeTest|smoke test]] ve health check'lerle mümkün olur.",
          "Rolling touches more users with every step until you notice. Noticing fast comes from automatic [[smokeTest|smoke tests]] and health checks.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Kubernetes, health check'i (readiness probe) geçmeyen yeni bir pod'a trafik vermez ve geçişi orada durdurur. Bug'ın health endpoint'ini de bozması gerekir; bozmuyorsa geçiş devam eder.",
            "Kubernetes sends no traffic to a new pod that fails its health check (readiness probe) and halts the rollout there. The bug has to break the health endpoint too; if it does not, the rollout carries on.",
          ),
        },
      ],
      practice: { commands: [{ cmd: "kubectl rollout undo deployment/shop", note: l("Bir önceki sürüme rolling ile döner.", "Rolls back to the previous version, as a rolling deploy.") }] },
    },
    {
      short: l("Blue-green", "Blue-green"),
      tag: "how",
      predict: {
        question: l(
          "**Blue-green**: v2 ayrı bir green ortamına kuruldu, trafik tek hamlede ona çevrildi. Sonradan bir sorun çıksa geri dönmek ne kadar sürer?",
          "**Blue-green**: v2 was set up on a separate green environment and traffic was switched to it in one move. If a problem showed up later, how long would going back take?",
        ),
        options: [
          l("Tek hamle: blue hâlâ ayakta", "One move: blue is still up"),
          l("Sunucular birer birer geri alınır", "Servers are rolled back one by one"),
          l("Blue yeniden kurulmalı", "Blue has to be rebuilt"),
        ],
        answer: 0,
        why: l(
          "Blue'ya dokunulmadı; load balancer'ı geri çevirmek yeter. Bu, blue-green'in en büyük avantajı.",
          "Blue was never touched; pointing the load balancer back is enough. That is blue-green's biggest advantage.",
        ),
      },
      title: l("Blue-green: yanına kur, tek hamlede çevir", "Blue-green: set it up alongside, switch in one move"),
      body: [
        l(
          "v2 dört yeni green sunucuya kuruldu. Bu sırada bütün trafik hâlâ blue'daydı, ekip green'e içeriden baktı: 200 OK. Sonra load balancer trafiği tek hamlede green'e çevirdi. Kesinti yok, karışık sürüm yok.",
          "v2 went onto four new green servers. Meanwhile all traffic stayed on blue, and the team checked green from inside: 200 OK. Then the load balancer switched all traffic to green in one move. No downtime, no mixed versions.",
        ),
        l(
          "Bedeli: bir süreliğine iki kat sunucu. Blue, geri dönüş güvencesi olarak bir süre daha ayakta tutulur, sonra bir sonraki sürüm için \"yeni green\" olur.",
          "The price: twice the servers for a while. Blue is kept up for a while as a way back, then becomes the \"new green\" for the next release.",
        ),
      ],
    },
    {
      short: l("Canary", "Canary"),
      tag: "experiment",
      predict: {
        question: l(
          "**Canary**: bug'lı v2 tek bir sunucuya kuruldu ve trafiğin %10'unu aldı. O turda kaç istek hata alır?",
          "**Canary**: the buggy v2 went onto one server and got 10% of traffic. How many requests fail in that round?",
        ),
        options: [l("0", "0"), l("Yaklaşık 10", "About 10"), l("100", "100")],
        answer: 1,
        why: l(
          "Sadece canary'ye giden istekler bozuk sürüme denk gelir. Hatayı gerçek trafikte gördün ama yalnızca küçük bir grup etkilendi.",
          "Only the requests sent to the canary hit the broken version. You saw the bug under real traffic, yet only a small group was hurt.",
        ),
      },
      title: l("Canary: önce küçük bir gruba aç", "Canary: open it to a small group first"),
      body: [
        l(
          "10 istek hata aldı, hata oranı hemen göze battı ve geri aldık: canary sunucusu kapandı, trafik yine v1'deydi. Sağlam bir sürümde pay %10'dan %50'ye, sonra herkese çıkardı.",
          "10 requests failed, the error rate stood out at once and we rolled back: the canary server went away and traffic was on v1 again. With a healthy version the share would have gone from 10% to 50%, then to everyone.",
        ),
        l(
          "[[canary|Canary]] gerçek kullanıcıların davranışını görmenin en güvenli yolu. Ama hata oranını, gecikmeyi izleyen bir izleme sistemi olmadan işe yaramaz: birinin ya da bir şeyin \"bu kötü\" demesi gerekir.",
          "A [[canary]] is the safest way to see how real users behave with the new version. But without monitoring that watches the error rate and latency it is useless: someone or something has to say \"this is bad\".",
        ),
      ],
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Hangisini ne zaman seçersin?", "Which one, when?"),
      body: [
        l(
          "**Recreate:** en basit, kesintiyi kaldırabiliyorsan. **[[rolling|Rolling]]:** çoğu web uygulaması için varsayılan, ek sunucu gerektirmez. **[[blueGreen|Blue-green]]:** hızlı ve temiz geri dönüş istiyorsan, iki kat kaynağı kaldırabiliyorsan. **Canary:** riskli değişiklikler ve büyük kullanıcı kitleleri için, iyi bir izleme ile birlikte.",
          "**Recreate:** the simplest, if you can live with downtime. **[[rolling|Rolling]]:** the default for most web apps, no extra servers needed. **[[blueGreen|Blue-green]]:** when you want a fast, clean way back and can afford twice the resources. **Canary:** for risky changes and large user bases, together with good monitoring.",
        ),
        l(
          "Bunlar birbirini dışlamaz. Bir de **feature flag** var: kodu herkese deploy edip yeni özelliği bir ayarla küçük bir gruba açmak. Deploy ile \"kullanıcıya açmak\" ayrı iki adım olur.",
          "These do not exclude each other. There are also **feature flags**: deploy the code to everyone and turn the new feature on for a small group with a setting. Deploying and \"releasing to users\" become two separate steps.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede her hamle bir tur, istekler sunuculara tam eşit dağılıyor ve bozuk sürüm her isteğe 500 dönüyor. Gerçekte bir geçiş dakikalar sürer, hatalar genelde isteklerin bir kısmında çıkar ve trafik dağılımı tam eşit değildir. Bu stratejileri genelde Kubernetes, bir bulut load balancer'ı ya da Argo Rollouts gibi araçlar uygular; GitHub Actions sadece onlara \"şu sürümü çıkar\" der.",
            "On this stage each move is a round, requests split perfectly evenly and the broken version answers every request with 500. In reality a switch takes minutes, errors usually hit only some requests and traffic is never split perfectly. These strategies are usually carried out by Kubernetes, a cloud load balancer or tools like Argo Rollouts; GitHub Actions just tells them \"ship this version\".",
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
          "Aşağıda gerçek işten **5 senaryo** var. Uygulamanın `shop.yaml`'ı bir Kubernetes Deployment'ı (Recreate, RollingUpdate) ya da Argo Rollouts ile bir Rollout (blue-green, canary). Manifest'i `nano shop.yaml` ile **kendin düzenle**, `kubectl apply` ile gönder, geçişi `kubectl rollout status` ile izle ya da `kubectl argo rollouts promote / abort` ile yönet.",
          "Below are **5 scenarios** from real work. The app's `shop.yaml` is a Kubernetes Deployment (Recreate, RollingUpdate) or an Argo Rollouts Rollout (blue-green, canary). **Edit the manifest yourself** with `nano shop.yaml`, send it with `kubectl apply`, watch the rollout with `kubectl rollout status` or steer it with `kubectl argo rollouts promote / abort`.",
        ),
        l(
          "Kümenin her hareketi bir tur, yani 100 istek; sahne kimin hangi sürümden cevap aldığını sayar. Siteye `curl https://shop.example/health` ile bakabilirsin. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "Every move the cluster makes is one round of 100 requests; the scene counts who got an answer from which version. Check the site with `curl https://shop.example/health`. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Recreate: hepsini kapat, hepsini aç. Basit, ama her deploy bir kesinti.", "Recreate: stop all, start all. Simple, but every deploy is an outage."),
    l("Rolling: birer birer değiştir. Kesinti yok, ama bir süre iki sürüm birlikte çalışır.", "Rolling: replace one by one. No downtime, but two versions run together for a while."),
    l("Blue-green: yanına kur, trafiği tek hamlede çevir; geri dönmek de tek hamle.", "Blue-green: set it up alongside and switch traffic in one move; going back is one move too."),
    l("Canary: önce küçük bir pay; hata varsa sadece o küçük grup etkilenir.", "Canary: a small share first; if it is broken, only that small group is hurt."),
    l("İki sürüm birlikte çalışabileceği için API ve veritabanı değişiklikleri geriye uyumlu olmalı.", "Since two versions may run together, API and database changes must be backward compatible."),
  ],
  quiz: [
    {
      question: l("Hangi strateji her deploy'da kısa bir kesinti yaratır?", "Which strategy causes a short outage on every deploy?"),
      options: [l("Rolling", "Rolling"), l("Recreate", "Recreate"), l("Blue-green", "Blue-green"), l("Canary", "Canary")],
      answer: 1,
      explain: l("Recreate eskileri kapatıp yenileri açar; arada ayakta sunucu yoktur.", "Recreate stops the old ones before starting the new ones; in between nothing is up."),
      reviewStep: 1,
    },
    {
      question: l("Rolling deploy sırasında neden API'ler iki sürümle de uyumlu olmalı?", "Why must APIs work with both versions during a rolling deploy?"),
      options: [
        l("Çünkü rolling iki kat sunucu kullanır", "Because rolling uses twice the servers"),
        l("Çünkü bir süre v1 ve v2 aynı anda trafik alır", "Because for a while v1 and v2 take traffic at the same time"),
        l("Çünkü rolling'de geri dönüş yoktur", "Because rolling cannot go back"),
        l("Gerek yoktur", "They need not"),
      ],
      answer: 1,
      explain: l("Aynı kullanıcı arka arkaya iki farklı sürüme denk gelebilir.", "The same user may hit two different versions back to back."),
      reviewStep: 2,
    },
    {
      question: l("Blue-green'in en büyük avantajı nedir?", "What is blue-green's biggest advantage?"),
      options: [
        l("Ek sunucu gerektirmez", "It needs no extra servers"),
        l("Geri dönüş tek hamledir, çünkü eski ortam hâlâ ayaktadır", "Going back is one move, because the old environment is still up"),
        l("Yeni sürümü önce %10'a açar", "It opens the new version to 10% first"),
        l("Testleri gereksiz kılar", "It makes tests unnecessary"),
      ],
      answer: 1,
      explain: l("Trafiği blue'ya geri çevirmek yeter. Bedeli bir süreliğine iki kat kaynak.", "Pointing traffic back at blue is enough. The price is twice the resources for a while."),
      reviewStep: 4,
    },
    {
      question: l("Canary işe yarasın diye en çok neye ihtiyaç vardır?", "What does a canary need most to be useful?"),
      options: [
        l("Daha çok sunucuya", "More servers"),
        l("Hata oranını ve gecikmeyi izleyen bir izleme sistemine", "Monitoring that watches the error rate and latency"),
        l("Recreate ile birlikte kullanılmaya", "Being used together with recreate"),
        l("`latest` etiketine", "The `latest` tag"),
      ],
      answer: 1,
      explain: l("Canary'nin amacı küçük grupta sorunu görmek; bunu gösteren bir şey yoksa işe yaramaz.", "The point of a canary is to see trouble in a small group; without something that shows it, it does nothing."),
      reviewStep: 5,
    },
  ],
};
