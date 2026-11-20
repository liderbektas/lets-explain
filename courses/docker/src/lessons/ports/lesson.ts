import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const ports: Lesson = {
  slug: "ports",
  title: l("Port mapping", "Port mapping"),
  summary: l(
    "`-p 8080:80` ne demek, yanlış port neden \"reset\" verir, bir host portu neden iki container'a verilmez ve rastgele port nasıl seçilir.",
    "What `-p 8080:80` means, why a wrong port gives \"reset\", why one host port cannot go to two containers, and how a random port is picked.",
  ),
  minutes: 11,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("`-p host:container` sırasını okumak", "Read the `-p host:container` order"), step: 0 },
    { text: l("Yanlış container portunun belirtisini tanımak", "Recognise the sign of a wrong container port"), step: 1 },
    { text: l("Port çakışmasını görmek ve çözmek", "See a port conflict and fix it"), step: 3 },
    { text: l("Rastgele host portu ve `docker port`", "A random host port and `docker port`"), step: 5 },
  ],
  steps: [
    {
      short: l("-p 8080:80", "-p 8080:80"),
      tag: "how",
      title: l("Host'un kapısı, container'ın kapısı", "The host's door and the container's door"),
      body: [
        l(
          "Her container'ın kendi ağı vardır. İçindeki nginx 80 portunu dinler, ama bu 80 senin bilgisayarının 80'i değildir. [[portMapping|Port mapping]] ikisini birbirine bağlar.",
          "Every container has its own network. The nginx inside listens on port 80, but that 80 is not your computer's 80. [[portMapping|Port mapping]] connects the two.",
        ),
        l(
          "`-p 8080:80` sırası **host:container**: bilgisayarının 8080'ine gelen istek container'ın 80'ine gider. `curl localhost:8080` nginx sayfasını getirdi.",
          "`-p 8080:80` reads **host:container**: a request to your machine's 8080 goes to the container's 80. `curl localhost:8080` returned the nginx page.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Bir apartman düşün: dış kapı numarası (8080) sokaktan görünen adres, daire numarası (80) içerideki yer. Kapıcı (Docker) dış kapıya gelen ziyaretçiyi doğru daireye yollar.",
            "Think of a building: the street number (8080) is the address seen from outside, the flat number (80) is the place inside. The doorman (Docker) sends visitors at the front door to the right flat.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name web -p 8080:80 nginx:1.27" },
          { cmd: "curl localhost:8080" },
          { cmd: "docker ps", note: l("PORTS sütununda `0.0.0.0:8080->80/tcp` görünür.", "The PORTS column shows `0.0.0.0:8080->80/tcp`.") },
        ],
      },
    },
    {
      short: l("Yanlış port", "Wrong port"),
      tag: "problem",
      predict: {
        question: l(
          "İkinci bir nginx'i `-p 8081:8080` ile başlatacağız; ama nginx içeride 8080'i değil 80'i dinliyor. `curl localhost:8081` ne olur?",
          "We will start a second nginx with `-p 8081:8080`, but nginx listens on 80 inside, not 8080. What does `curl localhost:8081` do?",
        ),
        options: [
          l("nginx sayfası gelir", "The nginx page comes back"),
          l("Bağlantı container'a ulaşır ama kesilir (reset)", "The connection reaches the container but is reset"),
          l("Docker container'ı başlatmaz", "Docker refuses to start the container"),
        ],
        answer: 1,
        why: l(
          "Docker 8081'i container'ın 8080'ine bağladı, ama orada dinleyen kimse yok. Bağlantı container'a kadar gelir ve kesilir: `Connection reset by peer`.",
          "Docker connected 8081 to the container's 8080, but nothing listens there. The connection gets to the container and is cut: `Connection reset by peer`.",
        ),
      },
      title: l("Container ayakta, kapı yanlış", "The container is up, the door is wrong"),
      body: [
        l(
          "`web2` çalışıyor (yeşil ışık), etiketi `localhost:8081 → 8080`. Ama curl `Connection reset by peer` dedi. Bu hata \"oraya kadar geldim ama içeride kimse yok\" demek.",
          "`web2` is running (green light) with the tag `localhost:8081 → 8080`. But curl said `Connection reset by peer`. That error means \"I got there, but nobody was home\".",
        ),
        l(
          "`Connection refused` farklıdır: o, host'ta o portu hiç kimse yayınlamıyor demek. İkisini ayırt etmek sorun gidermede yarım işi çözer.",
          "`Connection refused` is different: it means nobody publishes that port on the host at all. Telling the two apart is half of debugging.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name web2 -p 8081:8080 nginx:1.27" },
          { cmd: "curl localhost:8081", note: l("`Connection reset by peer`: yanlış container portu.", "`Connection reset by peer`: wrong container port.") },
          { cmd: "docker inspect --format '{{.Config.ExposedPorts}}' nginx:1.27", note: l("Image'ın hangi portu kullandığını (EXPOSE) gösterir.", "Shows which port the image says it uses (EXPOSE).") },
        ],
      },
    },
    {
      short: l("İkisi de 80", "Both on 80"),
      tag: "how",
      predict: {
        question: l(
          "`web` zaten içeride 80'i dinliyor. `web2`'yi `-p 8081:80` ile yeniden başlatacağız: o da içeride 80'i dinleyecek. Çakışır mı?",
          "`web` already listens on 80 inside. We will restart `web2` with `-p 8081:80`, also on 80 inside. Do they clash?",
        ),
        options: [
          l("Evet, iki container aynı portu kullanamaz", "Yes, two containers cannot use the same port"),
          l("Hayır: içeride her container'ın kendi 80'i var, host portları farklı", "No: inside, each container has its own 80, and the host ports differ"),
          l("Sadece biri cevap verir", "Only one of them answers"),
        ],
        answer: 1,
        why: l(
          "İçerideki portlar container'a özeldir; on container'ın hepsi 80 dinleyebilir. Tekil olması gereken host tarafıdır.",
          "Ports inside belong to each container; ten containers can all listen on 80. It is the host side that must be unique.",
        ),
      },
      title: l("İçeride aynı port, dışarıda farklı", "Same port inside, different outside"),
      body: [
        l(
          "`web2`'yi silip `-p 8081:80` ile yeniden başlattık. Artık iki nginx de içeride 80'i dinliyor, biri host'ta 8080'de, diğeri 8081'de. İkisi de cevap veriyor.",
          "We removed `web2` and started it again with `-p 8081:80`. Both nginx now listen on 80 inside, one on host 8080 and one on 8081. Both answer.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker rm -f web2" },
          { cmd: "docker run -d --name web2 -p 8081:80 nginx:1.27" },
          { cmd: "curl localhost:8081" },
        ],
      },
    },
    {
      short: l("Çakışma", "Conflict"),
      tag: "experiment",
      predict: {
        question: l(
          "8080'i `web` kullanıyor. Üçüncü bir container'ı da `-p 8080:80` ile başlatmaya çalışacağız. Ne olur?",
          "`web` is using 8080. We will try to start a third container with `-p 8080:80` too. What happens?",
        ),
        options: [
          l("İstekler iki container arasında paylaşılır", "Requests are shared between the two"),
          l("Docker yeni container'ı başlatamaz: port dolu", "Docker cannot start the new one: the port is taken"),
          l("Eski container durdurulur", "The old container is stopped"),
        ],
        answer: 1,
        why: l(
          "Bir host portunu aynı anda tek bir şey dinleyebilir. Docker container'ı oluşturur ama başlatamaz: `port is already allocated`.",
          "Only one thing can listen on a host port at a time. Docker creates the container but cannot start it: `port is already allocated`.",
        ),
      },
      title: l("Port is already allocated", "Port is already allocated"),
      body: [
        l(
          "Hata: `Bind for 0.0.0.0:8080 failed: port is already allocated`. `web3` oluşturuldu ama hiç başlamadı; sayaçta \"Başlayamayan: 1\" yazıyor.",
          "The error: `Bind for 0.0.0.0:8080 failed: port is already allocated`. `web3` was created but never started; the counter says \"Failed to start: 1\".",
        ),
        l(
          "Portu bir container değil, bilgisayarında çalışan başka bir program (yerel bir veritabanı, başka bir geliştirme sunucusu) da tutuyor olabilir. Kimin tuttuğunu bulup ya onu kapatır ya da başka bir host portu seçersin.",
          "It may not be a container holding the port but another program on your machine (a local database, another dev server). Find who holds it, then stop it or pick another host port.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker ps --filter publish=8080", note: l("8080'i yayınlayan container'ı bulur.", "Finds the container publishing 8080.") },
          { cmd: "lsof -i :8080", note: l("macOS/Linux: portu tutan herhangi bir programı gösterir (Linux'ta `ss -ltnp` da olur).", "macOS/Linux: shows any program holding the port (`ss -ltnp` also works on Linux).") },
        ],
      },
    },
    {
      short: l("Rastgele port", "Random port"),
      tag: "how",
      title: l("Host portunu Docker seçsin", "Let Docker pick the host port"),
      body: [
        l(
          "`web3`'ü silip `-p 80` ile, yani sadece container portunu vererek başlattık. Docker boştaki yüksek bir portu seçti: `localhost:32768 → 80`. Curl oradan cevap aldı.",
          "We removed `web3` and started it with `-p 80`, giving only the container port. Docker picked a free high port: `localhost:32768 → 80`. Curl got an answer there.",
        ),
        l(
          "Aynı image'dan birçok kopya çalıştırırken (testler, deneme ortamları) host portlarını tek tek düşünmek zorunda kalmazsın.",
          "When you run many copies of one image (tests, throwaway environments) you do not have to plan host ports one by one.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name web3 -p 80 nginx:1.27" },
          { cmd: "docker port web3", note: l("Hangi host portunun seçildiğini gösterir, örneğin `80/tcp -> 0.0.0.0:32768`.", "Shows which host port was picked, such as `80/tcp -> 0.0.0.0:32768`.") },
        ],
      },
    },
    {
      short: l("-P ve docker port", "-P and docker port"),
      tag: "how",
      title: l("-P: image'ın açtığı bütün portlar", "-P: every port the image declares"),
      body: [
        l(
          "Büyük `-P`, image'ın Dockerfile'da `EXPOSE` ile bildirdiği **bütün** portları rastgele host portlarına yayınlar. nginx için bu 80'dir.",
          "Capital `-P` publishes **every** port the image declares with `EXPOSE` in its Dockerfile to random host ports. For nginx that is 80.",
        ),
        l(
          "`EXPOSE` tek başına hiçbir portu açmaz: sadece \"bu image bu portu kullanır\" diye bir nottur. Portu dışarı açan her zaman `-p` ya da `-P`'dir.",
          "`EXPOSE` on its own opens nothing: it is just a note saying \"this image uses this port\". Only `-p` or `-P` publishes a port.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d -P --name web4 nginx:1.27" },
          { cmd: "docker port web4" },
          { cmd: "docker run -d -p 5353:53/udp --name dns alpine:3.20 sleep 3600", note: l("UDP portu için `/udp` eklersin; varsayılan TCP'dir.", "Add `/udp` for a UDP port; the default is TCP.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Sadece kendi bilgisayarına aç", "Open it to your own machine only"),
      body: [
        l(
          "`-p 8080:80` portu bilgisayarının **bütün** ağ arayüzlerinde açar (`0.0.0.0`): aynı ağdaki başka bir cihaz da erişebilir. Bir veritabanını ya da yönetim panelini sadece kendine açmak için `-p 127.0.0.1:8080:80` yaz.",
          "`-p 8080:80` opens the port on **all** your network interfaces (`0.0.0.0`): another device on the same network can reach it. To open a database or admin panel to yourself only, write `-p 127.0.0.1:8080:80`.",
        ),
        l(
          "Linux sunucularda dikkat: Docker yayınlanan portlar için kendi iptables kurallarını yazar, bu yüzden `ufw` gibi bir güvenlik duvarının kuralları onları **durdurmayabilir**. Dışarıya açılmaması gereken bir şeyi hiç yayınlama ya da 127.0.0.1'e bağla.",
          "Careful on Linux servers: Docker writes its own iptables rules for published ports, so a firewall like `ufw` may **not** stop them. Do not publish what should stay private, or bind it to 127.0.0.1.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede bilgisayarın tek bir `localhost`'u var ve rastgele portlar 32768'den başlıyor. Gerçekte Docker rastgele portu işletim sisteminin geçici port aralığından seçer.",
            "Here the machine has a single `localhost` and random ports start at 32768. In reality Docker picks random ports from the operating system's ephemeral port range.",
          ),
        },
        {
          kind: "insight",
          text: l(
            "Container'lar birbirine port yayınlamadan da ulaşabilir: aynı network'te isimle. `-p` sadece **host'tan** (ya da dışarıdan) erişim içindir. Bunu bir sonraki derste göreceğiz.",
            "Containers can reach each other without publishing ports: by name on the same network. `-p` is only for access **from the host** (or outside). The next lesson shows this.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name admin -p 127.0.0.1:8080:80 nginx:1.27", note: l("Sadece bu bilgisayardan erişilir.", "Reachable from this machine only.") },
          { cmd: "docker run -d --name db -p 127.0.0.1:5432:5432 -e POSTGRES_PASSWORD=secret postgres:17" },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **4 senaryo** var: yanlış container portu, 8080'i kimin tuttuğunu bulmak, portu Docker'a seçtirmek ve bilinmeyen bir image'ın portunu bulmak. Komutları terminale **kendin yaz**; sahne hangi kapının nereye açıldığını gösterir.",
          "Your turn. Below are **4 scenarios** from real work: a wrong container port, finding who holds 8080, letting Docker pick the port and finding an unknown image's port. **Type the commands yourself** in the terminal; the scene shows which door opens where.",
        ),
        l(
          "`curl localhost:<port>` portu dener, `docker ps` PORTS sütununu gösterir, `docker port <ad>` bir container'ın portlarını listeler. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "`curl localhost:<port>` tries a port, `docker ps` shows the PORTS column, and `docker port <name>` lists one container's ports. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("`-p host:container`: soldaki senin bilgisayarının portu, sağdaki container'ın içi.", "`-p host:container`: the left is your machine's port, the right is inside the container."),
    l("`Connection reset` yanlış container portu, `Connection refused` yayınlanmamış host portu demektir.", "`Connection reset` means a wrong container port; `Connection refused` means the host port is not published."),
    l("İçeride her container aynı portu dinleyebilir; tekil olması gereken host portudur.", "Inside, every container can use the same port; the host port is what must be unique."),
    l("Dolu bir host portu `port is already allocated` hatası verir; container oluşur ama başlamaz.", "A taken host port gives `port is already allocated`; the container is created but does not start."),
    l("`-p 80` ve `-P` host portunu Docker'a seçtirir; `docker port` hangisini seçtiğini söyler.", "`-p 80` and `-P` let Docker pick the host port; `docker port` tells you which."),
    l("Özel kalması gereken servisleri `-p 127.0.0.1:...` ile sadece kendi bilgisayarına aç.", "Open services that must stay private with `-p 127.0.0.1:...` to your own machine only."),
  ],
  quiz: [
    {
      question: l("Uygulaman container'da 3000'i dinliyor. Bilgisayarında 8000'den açmak için hangi parametre?", "Your app listens on 3000 in the container. Which flag opens it on your machine at 8000?"),
      options: [l("`-p 3000:8000`", "`-p 3000:8000`"), l("`-p 8000:3000`", "`-p 8000:3000`"), l("`-p 8000`", "`-p 8000`"), l("`--expose 8000`", "`--expose 8000`")],
      answer: 1,
      explain: l("Sıra host:container: 8000 dışarısı, 3000 içerisi.", "The order is host:container: 8000 outside, 3000 inside."),
      reviewStep: 0,
    },
    {
      question: l("Container çalışıyor ama `curl` `Connection reset by peer` diyor. En olası sebep?", "The container is running but `curl` says `Connection reset by peer`. Most likely cause?"),
      options: [
        l("Host portu yayınlanmamış", "The host port is not published"),
        l("`-p`'nin sağındaki port, uygulamanın içeride dinlediği port değil", "The right side of `-p` is not the port the app listens on inside"),
        l("Image indirilmemiş", "The image was not pulled"),
        l("Container'ın adı yanlış", "The container's name is wrong"),
      ],
      answer: 1,
      explain: l("Bağlantı container'a ulaştı ama o portta kimse yoktu: container portu yanlış.", "The connection reached the container but nobody was on that port: the container port is wrong."),
      reviewStep: 1,
    },
    {
      question: l("İki container'ı da `-p 8080:80` ile başlatmak istiyorsun. Ne olur?", "You want to start two containers, both with `-p 8080:80`. What happens?"),
      options: [
        l("İkisi de çalışır, istekler paylaşılır", "Both run and share requests"),
        l("İkincisi `port is already allocated` ile başlayamaz", "The second cannot start: `port is already allocated`"),
        l("İlki durdurulur", "The first one is stopped"),
        l("Docker ikinciye otomatik 8081 verir", "Docker gives the second one 8081 automatically"),
      ],
      answer: 1,
      explain: l("Bir host portunu tek bir container kullanabilir; ikincisine farklı bir host portu ver.", "One host port, one container; give the second a different host port."),
      reviewStep: 3,
    },
    {
      question: l("Postgres'i sadece kendi bilgisayarından erişilecek şekilde açmak için?", "How do you open postgres so that only your own machine can reach it?"),
      options: [
        l("`-p 5432:5432`", "`-p 5432:5432`"),
        l("`-p 127.0.0.1:5432:5432`", "`-p 127.0.0.1:5432:5432`"),
        l("`EXPOSE 5432`", "`EXPOSE 5432`"),
        l("`-P`", "`-P`"),
      ],
      answer: 1,
      explain: l("Adres vermezsen bütün arayüzlerde açılır; 127.0.0.1 sadece yerel erişim demek.", "Without an address it opens on all interfaces; 127.0.0.1 means local access only."),
      reviewStep: 6,
    },
  ],
};
