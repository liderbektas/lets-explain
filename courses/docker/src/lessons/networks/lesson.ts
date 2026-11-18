import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

export const networks: Lesson = {
  slug: "networks",
  title: l("Network'ler ve DNS", "Networks and DNS"),
  summary: l(
    "Container'lar birbirini nasıl bulur? Varsayılan bridge, kendi network'ün, isimle DNS, host ve none ağları.",
    "How do containers find each other? The default bridge, your own network, DNS by name, and the host and none networks.",
  ),
  minutes: 13,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Varsayılan bridge'de isimle bulmanın çalışmadığını görmek", "See that name lookup fails on the default bridge"), step: 1 },
    { text: l("Kendi network'ünü kurup container'ları bağlamak", "Create your own network and connect containers"), step: 2 },
    { text: l("Container'lar arası trafiğin `-p` gerektirmediğini görmek", "See that container-to-container traffic needs no `-p`"), step: 4 },
    { text: l("bridge, host ve none farkını bilmek", "Know bridge, host and none apart"), step: 6 },
  ],
  steps: [
    {
      short: l("İki container", "Two containers"),
      tag: "how",
      title: l("İki container, varsayılan ağ", "Two containers on the default network"),
      body: [
        l(
          "Bir web sunucusu (`web`) ve bir Redis (`cache`) başlattık. `--network` vermediğimiz için ikisi de Docker'ın varsayılan **bridge** ağında; çiplerinde `bridge` yazıyor.",
          "We started a web server (`web`) and a Redis (`cache`). We gave no `--network`, so both are on Docker's default **bridge** network; their chips say `bridge`.",
        ),
        l(
          "Bridge, bilgisayarının içinde container'lar için kurulmuş küçük bir sanal ağ. Her container burada kendi IP adresini alır.",
          "The bridge is a small virtual network inside your machine, set up for containers. Each container gets its own IP address on it.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker network ls", note: l("Her kurulumda üç ağ hazır gelir: `bridge`, `host`, `none`.", "Every install comes with three networks: `bridge`, `host`, `none`.") },
          { cmd: "docker run -d --name web nginx:1.27" },
          { cmd: "docker run -d --name cache redis:7" },
        ],
      },
    },
    {
      short: l("İsimle?", "By name?"),
      tag: "problem",
      predict: {
        question: l("`web`'in içinden `ping cache` yapacağız. Varsayılan bridge'de `cache` ismi bulunur mu?", "From inside `web` we will run `ping cache`. On the default bridge, does the name `cache` resolve?"),
        options: [
          l("Evet, Docker container adlarını her yerde çözer", "Yes, Docker resolves container names everywhere"),
          l("Hayır, varsayılan bridge'de isimle bulma yok", "No, the default bridge has no name lookup"),
          l("Sadece aynı image'dan gelenler birbirini bulur", "Only containers from the same image find each other"),
        ],
        answer: 1,
        why: l(
          "Docker'ın isimle DNS'i sadece **senin oluşturduğun** (user-defined) network'lerde çalışır. Varsayılan bridge eski bir ağdır; orada container'lar ancak IP adresiyle konuşur.",
          "Docker's name-based DNS only works on networks **you create** (user-defined). The default bridge is a legacy network where containers can only talk by IP address.",
        ),
      },
      title: l("Varsayılan bridge isim bilmez", "The default bridge does not know names"),
      body: [
        l(
          "`ping cache` başarısız: `bad address 'cache'`. İkisi aynı ağda ama birbirinin adını bilmiyor. IP adresi her yeniden başlatmada değişebileceği için IP ile bağlanmak da kırılgan.",
          "`ping cache` failed: `bad address 'cache'`. They are on the same network but do not know each other's names. Connecting by IP is fragile too, since the address can change on every restart.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run --rm alpine:3.20 ping -c 1 cache", note: l("Varsayılan bridge'de: `bad address 'cache'`.", "On the default bridge: `bad address 'cache'`.") },
          { cmd: "docker inspect -f '{{.NetworkSettings.IPAddress}}' cache", note: l("IP adresi var, ama ismi yok.", "It has an IP address, but no name.") },
        ],
      },
    },
    {
      short: l("Kendi ağın", "Your network"),
      tag: "how",
      title: l("docker network create", "docker network create"),
      body: [
        l(
          "`docker network create shop` yeni bir bridge ağı kurdu. `docker network connect` ile `web` ve `cache`'i ona bağladık. Artık ikisinin de `shop` çipi var ve aralarında kesikli bir çizgi çıktı: birbirini isimle bulabilirler.",
          "`docker network create shop` set up a new bridge network. With `docker network connect` we attached `web` and `cache` to it. Both now carry a `shop` chip, and a dashed line joins them: they can find each other by name.",
        ),
        l(
          "Bir container aynı anda birden fazla ağda olabilir. Yeni container'ları baştan bir ağda başlatmak için `--network shop` yeterli.",
          "A container can be on several networks at once. To start a new container on a network from the beginning, `--network shop` is enough.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker network create shop" },
          { cmd: "docker network connect shop web" },
          { cmd: "docker network connect shop cache" },
          { cmd: "docker run -d --name worker --network shop nginx:1.27", note: l("Baştan `shop` ağında başlar.", "Starts on `shop` from the beginning.") },
        ],
      },
    },
    {
      short: l("İsimle bul", "Find by name"),
      tag: "experiment",
      predict: {
        question: l("İkisi de artık `shop`'ta. `ping cache` şimdi ne olur?", "Both are on `shop` now. What happens with `ping cache`?"),
        options: [l("Yine `bad address`", "`bad address` again"), l("Çalışır: `cache` bulunur", "It works: `cache` resolves"), l("Docker'ı yeniden başlatmak gerekir", "Docker must be restarted first")],
        answer: 1,
        why: l(
          "User-defined bir ağda Docker'ın kendi DNS sunucusu (`127.0.0.11`) container adlarını IP'ye çevirir. Container yeniden başlayıp IP'si değişse de isim aynı kalır.",
          "On a user-defined network Docker's built-in DNS server (`127.0.0.11`) turns container names into IPs. Even if a container restarts and its IP changes, the name stays the same.",
        ),
      },
      title: l("Container adı = host adı", "The container name is the host name"),
      body: [
        l(
          "`ping cache` çalıştı. Uygulamanın ayarında da artık IP yerine `cache` yazabilirsin: `REDIS_URL=redis://cache:6379`.",
          "`ping cache` works. In your app's settings you can now write `cache` instead of an IP: `REDIS_URL=redis://cache:6379`.",
        ),
        l(
          "Docker Compose bunu senin için kendiliğinden yapar: her proje için bir ağ kurar ve servisleri adlarıyla bağlar. Compose bölümünde göreceğiz.",
          "Docker Compose does this for you: it creates a network per project and joins services by name. The Compose chapter shows it.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run --rm --network shop alpine:3.20 ping -c 1 cache", note: l("Aynı ağdaki geçici bir container'dan isimle ping.", "A ping by name from a throwaway container on the same network.") },
          { cmd: "docker exec web getent hosts cache", note: l("nginx image'ında ping yok; `getent` ismin hangi IP'ye çözüldüğünü gösterir.", "The nginx image has no ping; `getent` shows which IP the name resolves to.") },
        ],
      },
    },
    {
      short: l("-p gerekmez", "No -p needed"),
      tag: "how",
      predict: {
        question: l(
          "`api` adlı bir nginx'i `shop` ağında **`-p` vermeden** başlatacağız. `web` ona `curl http://api` ile ulaşabilir mi?",
          "We will start an nginx called `api` on `shop` **without `-p`**. Can `web` reach it with `curl http://api`?",
        ),
        options: [
          l("Hayır, port yayınlanmadı", "No, no port was published"),
          l("Evet: aynı ağdaki container'lar birbirinin bütün portlarına ulaşır", "Yes: containers on the same network reach each other's ports directly"),
          l("Sadece `-P` ile", "Only with `-P`"),
        ],
        answer: 1,
        why: l(
          "`-p` sadece **host'tan** container'a giriş içindir. Aynı ağdaki container'lar birbirine doğrudan, container portuyla bağlanır.",
          "`-p` is only for getting in **from the host**. Containers on the same network connect to each other directly, on the container port.",
        ),
      },
      title: l("İçeride serbest, dışarıya kapalı", "Open inside, closed outside"),
      body: [
        l(
          "`web`'den `curl http://api` cevap aldı, ama bilgisayarından `curl localhost:80` reddedildi. `api`'nin altında hiç port etiketi yok.",
          "`curl http://api` from `web` got an answer, but `curl localhost:80` from your machine was refused. There is no port tag under `api`.",
        ),
        l(
          "Bu iyi bir şey: veritabanı, cache, iç API'ler dışarıya hiç açılmadan sadece onları kullanan servislere görünür. Dışarı sadece gerçekten gereken (çoğu zaman tek bir web girişi) açılır.",
          "This is a good thing: the database, cache and internal APIs are visible only to the services that use them, never opened to the outside. Only what really needs it (usually one web entry point) is published.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name api --network shop nginx:1.27", note: l("Port yayınlamadan.", "Without publishing a port.") },
          { cmd: "docker run --rm --network shop alpine:3.20 wget -qO- http://api", note: l("Aynı ağdan cevap alır.", "Gets an answer from the same network.") },
        ],
      },
    },
    {
      short: l("Yalıtım", "Isolation"),
      tag: "experiment",
      title: l("Başka ağdaki container ulaşamaz", "A container on another network cannot reach it"),
      body: [
        l(
          "`other` adlı yeni bir nginx'i ağ belirtmeden başlattık; o varsayılan bridge'de. `ping cache` yine başarısız: `shop`'ta olmayan biri `shop`'takileri isimle bulamaz.",
          "We started a new nginx called `other` without a network; it is on the default bridge. `ping cache` fails again: someone outside `shop` cannot find those inside by name.",
        ),
        l(
          "Ağları bir yalıtım aracı olarak da kullanabilirsin: örneğin `frontend` ve `backend` ağları; veritabanı sadece `backend`'de, web sunucusu ikisinde birden.",
          "You can use networks for isolation too: for example `frontend` and `backend` networks, with the database only on `backend` and the web server on both.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker network create backend" },
          { cmd: "docker run -d --name db --network backend -e POSTGRES_PASSWORD=secret postgres:17", note: l("Sadece `backend`'deki servisler ulaşır.", "Only services on `backend` can reach it.") },
        ],
      },
    },
    {
      short: l("host ve none", "host and none"),
      tag: "how",
      predict: {
        question: l(
          "nginx'i `--network host -p 8080:80` ile başlatacağız. `-p 8080:80`'e ne olur?",
          "We will start nginx with `--network host -p 8080:80`. What happens to `-p 8080:80`?",
        ),
        options: [
          l("Normal çalışır: 8080 → 80", "It works as usual: 8080 → 80"),
          l("Yok sayılır: container host'un ağını doğrudan kullanır", "It is ignored: the container uses the host's network directly"),
          l("Docker hata verir ve başlatmaz", "Docker errors and does not start it"),
        ],
        answer: 1,
        why: l(
          "`host` ağında container'ın ayrı bir ağı yoktur; nginx doğrudan host'un 80'ini dinler. Eşleştirilecek bir şey kalmadığı için `-p` yok sayılır (Docker bir uyarı yazar).",
          "On `host` the container has no network of its own; nginx listens on the host's 80 directly. With nothing left to map, `-p` is ignored (Docker prints a warning).",
        ),
      },
      title: l("Üç ağ türü", "Three kinds of network"),
      body: [
        l(
          "**bridge**: varsayılan; container'ın kendi ağı var, dışarıya `-p` ile açılır. Kendi oluşturduğun bridge ağlarında isimle DNS de vardır.",
          "**bridge**: the default; the container has its own network and is published with `-p`. Bridge networks you create also give you DNS by name.",
        ),
        l(
          "**host**: container host'un ağını paylaşır, port eşleştirme yoktur (`hostnet`'in altında etiket yok). **none**: hiç ağ yok; sadece kendi içinde çalışan işler için (`isolated`).",
          "**host**: the container shares the host's network, with no port mapping (no tag under `hostnet`). **none**: no network at all, for jobs that only work inside themselves (`isolated`).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "`host` ağı Linux'ta tam çalışır. Docker Desktop'ta (Mac, Windows) container'lar bir sanal makinede çalıştığı için host ağı farklı davranır ve ayarlardan ayrıca açılması gerekir.",
            "The `host` network works fully on Linux. On Docker Desktop (Mac, Windows) containers run inside a VM, so host networking behaves differently and has to be switched on in the settings.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name hostnet --network host nginx:1.27", note: l("Linux'ta doğrudan host'un 80'inde.", "On Linux, directly on the host's port 80.") },
          { cmd: "docker run --rm --network none alpine:3.20 ip addr", note: l("Sadece `lo` (loopback) görünür.", "Only `lo` (loopback) shows up.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Ağları incelemek ve günlük kullanım", "Inspecting networks and daily use"),
      body: [
        l(
          "`docker network inspect shop` ağdaki container'ları ve IP'lerini gösterir. Bir container'a ağ içinde ek bir isim de verebilirsin: `--network-alias db`. Böylece aynı servisin farklı sürümleri aynı adla çağrılabilir.",
          "`docker network inspect shop` shows the containers on a network and their IPs. You can give a container an extra name on a network: `--network-alias db`, so different versions of a service answer to the same name.",
        ),
        l(
          "Günlük kuralın şu olsun: birlikte çalışan servisler için bir ağ kur (ya da Compose'a kurdur), servisleri **isimle** çağır, dışarıya sadece gereken portu aç.",
          "Make it your daily rule: create a network for services that work together (or let Compose do it), call services **by name**, and publish only the port that has to be public.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede `ping` ve `curl` sadece isim çözümünü dener. Gerçek image'ların bir kısmında bu araçlar yoktur (resmi nginx ve redis image'ları gibi); o yüzden denemeyi geçici bir `alpine` container'ından yapmak en kolayı.",
            "Here `ping` and `curl` only test name lookup. Some real images do not ship these tools (like the official nginx and redis images), so a throwaway `alpine` container is the easiest place to test from.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker network inspect shop" },
          { cmd: "docker run -d --name db --network shop --network-alias database -e POSTGRES_PASSWORD=secret postgres:17" },
          { cmd: "docker network disconnect shop web" },
          { cmd: "docker network rm shop", note: l("Bağlı container kalmadığında silinir.", "Removed once no container is attached.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "`web` ve `cache` varsayılan bridge'de çalışıyor ve birbirini isimle bulamıyor. Bir `shop` ağı kurabilir, container'ları bağlayabilir, `worker` başlatabilir ve `ping` ile deneyebilirsin.",
          "`web` and `cache` run on the default bridge and cannot find each other by name. You can create a `shop` network, connect containers, start a `worker`, and test with `ping`.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Varsayılan bridge'deki container'lar birbirini isimle bulamaz, sadece IP ile.", "Containers on the default bridge cannot find each other by name, only by IP."),
    l("`docker network create` ile kurduğun ağlarda container adı aynı zamanda host adıdır (Docker'ın DNS'i).", "On networks you create with `docker network create`, a container's name is also its host name (Docker's DNS)."),
    l("Bir container birden fazla ağda olabilir: `docker network connect` ya da `--network`.", "A container can be on several networks: `docker network connect` or `--network`."),
    l("Aynı ağdaki container'lar birbirine doğrudan bağlanır; `-p` sadece host'tan erişim içindir.", "Containers on one network connect directly; `-p` is only for access from the host."),
    l("`host` ağı host'un ağını paylaşır ve `-p`'yi yok sayar; `none` hiç ağ vermez.", "The `host` network shares the host's network and ignores `-p`; `none` gives no network at all."),
  ],
  quiz: [
    {
      question: l(
        "`app` ve `db` container'larını `--network` vermeden başlattın. `app`, `db`'ye `postgres://db:5432` ile bağlanamıyor. Neden?",
        "You started `app` and `db` without `--network`. `app` cannot connect to `postgres://db:5432`. Why?",
      ),
      options: [
        l("Postgres'in portu yayınlanmamış", "Postgres's port is not published"),
        l("Varsayılan bridge'de isimle DNS yok", "There is no DNS by name on the default bridge"),
        l("`db` adı ayrılmış bir kelime", "`db` is a reserved word"),
        l("İki container aynı image'dan değil", "The two containers are not from the same image"),
      ],
      answer: 1,
      explain: l("İsimle bulma sadece user-defined ağlarda çalışır; ikisini de kendi ağına koy.", "Name lookup only works on user-defined networks; put both on your own network."),
      reviewStep: 1,
    },
    {
      question: l("Aynı ağdaki `app`'in `db`'ye bağlanması için postgres'i `-p 5432:5432` ile mi başlatmalısın?", "For `app` to reach `db` on the same network, must postgres be started with `-p 5432:5432`?"),
      options: [
        l("Evet, yoksa kimse ulaşamaz", "Yes, otherwise nobody can reach it"),
        l("Hayır, `-p` sadece host'tan erişim için; aynı ağdakiler doğrudan bağlanır", "No, `-p` is only for access from the host; containers on the network connect directly"),
        l("Sadece `-P` ile", "Only with `-P`"),
        l("Sadece host ağında", "Only on the host network"),
      ],
      answer: 1,
      explain: l("Container'dan container'a trafik port yayınlamadan çalışır; veritabanını dışarı açmamak daha güvenli.", "Container-to-container traffic works without publishing; keeping the database closed is safer."),
      reviewStep: 4,
    },
    {
      question: l("Çalışan `web` container'ını `shop` ağına sonradan nasıl eklersin?", "How do you add the running `web` container to the `shop` network afterwards?"),
      options: [
        l("`docker network connect shop web`", "`docker network connect shop web`"),
        l("Silip `--network shop` ile yeniden başlatmak şart", "You must remove it and start again with `--network shop`"),
        l("`docker restart web --network shop`", "`docker restart web --network shop`"),
        l("`docker network create shop web`", "`docker network create shop web`"),
      ],
      answer: 0,
      explain: l("Ağlar port gibi değildir: çalışan bir container'ı bir ağa bağlayıp çıkarabilirsin.", "Networks are not like ports: you can connect and disconnect a running container."),
      reviewStep: 2,
    },
    {
      question: l("`--network host` ile başlatılan bir container'da `-p 8080:80`'in etkisi nedir?", "With `--network host`, what effect does `-p 8080:80` have?"),
      options: [l("8080'i 80'e eşler", "Maps 8080 to 80"), l("Yok sayılır", "It is ignored"), l("Container'ı başlatmaz", "It stops the container starting"), l("Sadece UDP için çalışır", "It only works for UDP")],
      answer: 1,
      explain: l("Host ağında container doğrudan host'un portlarını kullanır; eşlenecek ayrı bir ağ yoktur.", "On the host network the container uses the host's ports directly; there is no separate network to map."),
      reviewStep: 6,
    },
  ],
};
