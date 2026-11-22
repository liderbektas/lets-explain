import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { narration } from "./narration";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const architecture: Lesson = {
  slug: "architecture",
  title: l("Docker mimarisi", "How Docker is built"),
  summary: l(
    "Yazdığın `docker` komutu işi kendisi yapmaz: daemon'a istek gönderir. Daemon image'ları ve container'ları yönetir, gerekirse registry'den indirir.",
    "The `docker` command you type does not do the work itself: it sends requests to the daemon, which manages images and containers and pulls from a registry when needed.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  narration,
  objectives: [
    { text: l("CLI ile daemon'ın ayrı parçalar olduğunu bilmek", "Know that the CLI and the daemon are separate parts"), step: 0 },
    { text: l("Image'ı kimin indirdiğini görmek", "See who actually downloads an image"), step: 2 },
    { text: l("Image adının hangi registry'yi gösterdiğini okumak", "Read which registry an image name points at"), step: 6 },
    { text: l("Daemon yeniden başlayınca container'lara ne olduğunu görmek", "See what happens to containers when the daemon restarts"), step: 7 },
  ],
  steps: [
    {
      short: l("Parçalar", "The parts"),
      tag: "how",
      title: l("Üç parça: CLI, daemon, registry", "Three parts: CLI, daemon, registry"),
      body: [
        l(
          "Solda terminalde yazdığın `docker` komutu, yani **CLI** var. Ortada asıl işi yapan [[daemon|Docker daemon]] (`dockerd`): image'ları saklar, container'ları başlatır ve durdurur. Sağda image'ların yaşadığı [[registry]], varsayılanı Docker Hub.",
          "On the left is the `docker` command you type in a terminal: the **CLI**. In the middle is the [[daemon|Docker daemon]] (`dockerd`), which does the real work: it stores images and starts and stops containers. On the right is the [[registry]] where images live; the default is Docker Hub.",
        ),
        l(
          "CLI sadece bir istemci. Her komutu daemon'a bir istek (HTTP API çağrısı) olarak gönderir ve cevabı ekrana yazar. Hepsine birden **Docker Engine** denir.",
          "The CLI is only a client. It sends every command to the daemon as a request (an HTTP API call) and prints the answer. Together they are called the **Docker Engine**.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Restorandaki garson ve mutfak gibi: sen garsona (CLI) siparişi söylersin, yemeği mutfak (daemon) yapar. Malzeme yoksa mutfak toptancıdan (registry) getirtir.",
            "Like a waiter and a kitchen: you tell the waiter (CLI) your order, the kitchen (daemon) cooks it, and if an ingredient is missing the kitchen gets it from the wholesaler (registry).",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker ps", note: l("CLI daemon'a \"çalışan container'ları listele\" diye sorar.", "The CLI asks the daemon to list running containers.") },
          { cmd: "docker info", note: l("Daemon hakkında her şey: sürüm, kaç container ve image, depolama sürücüsü.", "Everything about the daemon: version, how many containers and images, storage driver.") },
        ],
      },
    },
    {
      short: l("version", "version"),
      tag: "how",
      title: l("docker version: istemci ve sunucu", "docker version: client and server"),
      body: [
        l(
          "`docker version` iki bölüm yazar: **Client** (CLI'nin sürümü) ve **Server** (Engine, yani daemon ve onun altındaki `containerd` ve `runc`). İkisi farklı programlardır; hatta farklı makinelerde bile olabilirler.",
          "`docker version` prints two parts: **Client** (the CLI's version) and **Server** (the Engine: the daemon and the `containerd` and `runc` beneath it). They are separate programs and can even live on different machines.",
        ),
        l(
          "Daemon çalışmıyorsa CLI şöyle der: `Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?` Yani CLI yerinde ama konuşacak kimse yok.",
          "If the daemon is not running, the CLI says: `Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?` The CLI is there, but there is nobody to talk to.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker version", note: l("Client ve Server sürümleri ayrı ayrı.", "Client and Server versions, separately.") },
          { cmd: "sudo systemctl status docker", note: l("Linux'ta daemon'ın durumu. Mac ve Windows'ta Docker Desktop açık olmalı.", "On Linux, the daemon's status. On Mac and Windows, Docker Desktop must be open.") },
        ],
      },
    },
    {
      short: l("pull", "pull"),
      tag: "how",
      predict: {
        question: l("`docker pull nginx:1.27` yazıyoruz. Image'ı internetten kim indirir?", "We type `docker pull nginx:1.27`. Who downloads the image from the internet?"),
        options: [l("docker CLI'nin kendisi", "The docker CLI itself"), l("Docker daemon", "The Docker daemon"), l("Docker Hub image'ı kendisi gönderir", "Docker Hub pushes it over on its own")],
        answer: 1,
        why: l(
          "CLI sadece \"şu image'ı indir\" diye daemon'a söyler. Registry'ye bağlanıp katmanları indiren ve saklayan daemon'dır.",
          "The CLI only tells the daemon \"pull this image\". The daemon connects to the registry, downloads the layers and stores them.",
        ),
      },
      title: l("pull: daemon registry'ye gider", "pull: the daemon goes to the registry"),
      body: [
        l(
          "Ok'lara bak: CLI daemon'a istek gönderdi, daemon da Docker Hub'a gidip `nginx:1.27`'yi getirdi. Image artık daemon'ın listesinde.",
          "Follow the arrows: the CLI sent a request to the daemon, and the daemon went to Docker Hub and fetched `nginx:1.27`. The image is now in the daemon's list.",
        ),
        l(
          "Image CLI'nin olduğu yerde değil, daemon'ın olduğu yerde saklanır. Linux'ta genelde `/var/lib/docker` altında; Docker Desktop'ta onun Linux VM'inin içinde.",
          "The image is stored where the daemon is, not where the CLI is: usually under `/var/lib/docker` on Linux, and inside the Linux VM with Docker Desktop.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker pull nginx:1.27" },
          { cmd: "docker info --format '{{.DockerRootDir}}'", note: l("Daemon'ın image ve container'ları sakladığı klasör.", "The folder where the daemon keeps images and containers.") },
        ],
      },
    },
    {
      short: l("run", "run"),
      tag: "how",
      title: l("run: daemon container'ı başlatır", "run: the daemon starts the container"),
      body: [
        l(
          "`docker run -d --name web nginx:1.27` için daemon image'ı zaten buldu, registry'ye gitmedi. Container'ı başlatma işini de kendi altındaki `containerd`'ye verdi; o da `runc` ile süreci namespace ve cgroup'larla ayırarak başlattı.",
          "For `docker run -d --name web nginx:1.27` the daemon already had the image and did not go to the registry. It handed the start to `containerd` beneath it, which used `runc` to launch the process inside its namespaces and cgroups.",
        ),
        l(
          "`-d` yüzünden CLI hemen döndü ve kapandı. Container ise çalışmaya devam ediyor, çünkü onu CLI değil daemon tutuyor.",
          "Because of `-d`, the CLI returned and exited at once. The container keeps running, because the daemon holds it, not the CLI.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name web nginx:1.27" },
          { cmd: "docker ps", note: l("Terminali kapatsan da container çalışır.", "It keeps running even if you close the terminal.") },
        ],
      },
    },
    {
      short: l("Otomatik pull", "Auto pull"),
      tag: "experiment",
      predict: {
        question: l("`redis:7` bu makinede yok. `docker run -d --name cache redis:7` ne yapar?", "`redis:7` is not on this machine. What does `docker run -d --name cache redis:7` do?"),
        options: [
          l("Hata verir: önce pull gerekir", "Errors: you must pull first"),
          l("Daemon önce image'ı indirir, sonra container'ı başlatır", "The daemon pulls the image first, then starts the container"),
          l("Container'ı Docker Hub'da çalıştırır", "Runs the container on Docker Hub"),
        ],
        answer: 1,
        why: l(
          "Daemon image'ı yerelde bulamayınca \"Unable to find image locally\" der, registry'den çeker ve sonra çalıştırır. Container her zaman senin makinende çalışır.",
          "When the daemon cannot find the image locally it says \"Unable to find image locally\", pulls it from the registry and then runs it. Containers always run on your machine.",
        ),
      },
      title: l("Eksik image: daemon önce indirir", "A missing image: the daemon pulls it first"),
      body: [
        l(
          "Bu sefer iki ok birden yandı: daemon `redis:7`'yi bulamadı, Docker Hub'dan çekti ve sonra `cache` container'ını başlattı. Ayrı bir `docker pull` gerekmedi.",
          "This time both arrows lit up: the daemon could not find `redis:7`, pulled it from Docker Hub, then started the `cache` container. No separate `docker pull` was needed.",
        ),
        l(
          "`docker pull`'u yine de kullanırsın: image'ı önceden indirip ilk açılışı hızlandırmak ya da bir tag'in en güncel halini almak için.",
          "You still use `docker pull`: to fetch an image ahead of time so the first start is quick, or to get the latest version of a tag.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker run -d --name cache redis:7", note: l("Çıktıda önce \"Unable to find image 'redis:7' locally\", sonra pull satırları.", "The output starts with \"Unable to find image 'redis:7' locally\", then the pull lines.") }],
      },
    },
    {
      short: l("Olmayan image", "Missing image"),
      tag: "problem",
      title: l("Registry'de olmayan image", "An image the registry does not have"),
      body: [
        l(
          "`docker run acme/ghost:1.0` için daemon registry'ye gitti ve eli boş döndü: `pull access denied for acme/ghost, repository does not exist or may require 'docker login'`. Hiçbir container oluşmadı.",
          "For `docker run acme/ghost:1.0` the daemon went to the registry and came back empty: `pull access denied for acme/ghost, repository does not exist or may require 'docker login'`. No container was created.",
        ),
        l(
          "Bu mesajın iki anlamı olabilir: ad yanlış yazılmıştır, ya da image özel (private) bir repository'dedir ve önce `docker login` gerekir.",
          "That message means one of two things: the name is misspelt, or the image is in a private repository and you need `docker login` first.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker search nginx", note: l("Docker Hub'da isim ara.", "Search Docker Hub by name.") },
          { cmd: "docker login", note: l("Özel bir repository'den çekmeden önce.", "Before pulling from a private repository.") },
        ],
      },
    },
    {
      short: l("Image adı", "Image names"),
      tag: "how",
      predict: {
        question: l("Sadece `nginx` yazınca daemon tam olarak hangi image'ı çeker?", "When you write just `nginx`, which image does the daemon really pull?"),
        options: [
          l("`docker.io/library/nginx:latest`", "`docker.io/library/nginx:latest`"),
          l("En son çektiğin nginx sürümünü", "The nginx version you pulled last"),
          l("`nginx:1.27`", "`nginx:1.27`"),
        ],
        answer: 0,
        why: l(
          "Kısa adlar tamamlanır: registry yazılmazsa `docker.io`, namespace yoksa resmi image'lar için `library`, tag yoksa `latest`.",
          "Short names are filled in: no registry means `docker.io`, no namespace means `library` for official images, no tag means `latest`.",
        ),
      },
      title: l("Bir image adının anatomisi", "Anatomy of an image name"),
      body: [
        l(
          "Tam bir image adı şöyledir: `registry/namespace/repository:tag`. `gcr.io/distroless/nodejs22-debian12`'de registry `gcr.io` (Google), namespace `distroless`. Daemon bu image'ı Docker Hub'dan değil, oradan çekti.",
          "A full image name is `registry/namespace/repository:tag`. In `gcr.io/distroless/nodejs22-debian12`, the registry is `gcr.io` (Google) and the namespace is `distroless`. The daemon pulled it from there, not from Docker Hub.",
        ),
        l(
          "`nginx` gibi kısa adlar `docker.io/library/nginx:latest`'e tamamlanır. Kendi image'ların genelde `kullanıcıadı/uygulama:sürüm` ya da `ghcr.io/şirket/uygulama:sürüm` gibi olur.",
          "Short names like `nginx` expand to `docker.io/library/nginx:latest`. Your own images usually look like `username/app:version` or `ghcr.io/company/app:version`.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker pull docker.io/library/nginx:1.27", note: l("`docker pull nginx:1.27` ile aynı image.", "The same image as `docker pull nginx:1.27`.") },
          { cmd: "docker pull ghcr.io/OWNER/IMAGE:TAG", note: l("GitHub'ın registry'si; özel ise önce `docker login ghcr.io`.", "GitHub's registry; for a private image run `docker login ghcr.io` first.") },
        ],
      },
    },
    {
      short: l("Daemon restart", "Daemon restart"),
      tag: "experiment",
      predict: {
        question: l(
          "web ve cache çalışıyor, ikisinin de restart policy'si yok. Daemon yeniden başlarsa ne olur?",
          "web and cache are running, neither has a restart policy. What happens if the daemon restarts?",
        ),
        options: [
          l("Hiçbir şey, container'lar daemon'dan bağımsız", "Nothing; containers do not depend on the daemon"),
          l("İkisi de durur ve öyle kalır", "Both stop and stay stopped"),
          l("İkisi de silinir", "Both are removed"),
        ],
        answer: 1,
        why: l(
          "Container'ları daemon yönetir. Daemon durunca container'lar da durur; geri geldiğinde sadece restart policy'si olanları yeniden başlatır.",
          "The daemon manages the containers. When it stops, they stop; when it comes back it restarts only the ones with a restart policy.",
        ),
      },
      title: l("Daemon yeniden başlayınca", "When the daemon restarts"),
      body: [
        l(
          "Daemon yeniden başladı ve `web` ile `cache` \"Exited\" oldu. Silinmediler: `docker ps -a`'da duruyorlar ve `docker start` ile geri gelirler.",
          "The daemon restarted and `web` and `cache` went to \"Exited\". They were not removed: they are in `docker ps -a` and come back with `docker start`.",
        ),
        l(
          "Sunucu yeniden başlayınca servislerinin kendiliğinden geri gelmesini istiyorsan container'ı `--restart unless-stopped` (ya da `always`) ile başlatırsın. Kaynaklar ve restart policy dersinde ayrıntısı var.",
          "To have your services come back by themselves after a reboot, start them with `--restart unless-stopped` (or `always`). The resources and restart policy lesson goes deeper.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "sudo systemctl restart docker", note: l("Linux'ta daemon'ı yeniden başlatır.", "Restarts the daemon on Linux.") },
          { cmd: "docker start web", note: l("Kapanan container'ı aynı ayarlarla geri getirir.", "Brings the exited container back with the same settings.") },
          { cmd: "docker run -d --name web --restart unless-stopped nginx:1.27" },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Uzaktaki daemon'lar ve docker.sock", "Remote daemons and docker.sock"),
      body: [
        l(
          "CLI ve daemon ayrı olduğu için CLI başka bir makinedeki daemon'la da konuşabilir: `docker context` ya da `DOCKER_HOST` ile. Docker Desktop da aslında böyle çalışır: CLI senin Mac'inde, daemon Linux VM'in içinde.",
          "Since the CLI and the daemon are separate, the CLI can talk to a daemon on another machine with `docker context` or `DOCKER_HOST`. Docker Desktop works exactly this way: the CLI on your Mac, the daemon inside the Linux VM.",
        ),
        l(
          "Bir güvenlik notu: `/var/run/docker.sock`'a erişebilen herkes daemon'a her şeyi yaptırabilir; bu pratikte o makinede root olmak demektir. Bu soketi bir container'a bağlamadan önce iki kez düşün.",
          "A security note: anyone who can reach `/var/run/docker.sock` can make the daemon do anything, which in practice means root on that machine. Think twice before mounting that socket into a container.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede daemon, containerd ve runc tek bir kutu olarak gösteriliyor ve registry'ye gidiş anında oluyor. Gerçekte image indirmek katman katman, ağına göre saniyeler ya da dakikalar sürer.",
            "On this stage the daemon, containerd and runc are drawn as one box, and trips to the registry are instant. In reality pulling an image goes layer by layer and takes seconds or minutes depending on your network.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker context ls", note: l("CLI'nin konuştuğu daemon'lar; `*` olan şu an kullanılan.", "The daemons the CLI can talk to; the `*` marks the current one.") },
          { cmd: "docker context create prod --docker host=ssh://ada@sunucu", note: l("SSH üzerinden uzaktaki bir daemon.", "A remote daemon over SSH.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek bir sunucudan **4 senaryo** var: daemon'ın image'ı kendisi indirmesi, başka bir registry'den image, gece yeniden başlayan daemon ve kapanan container'ı geri getirmek. Komutları terminale **kendin yaz**; sahne CLI'ın daemon'a ne dediğini gösterir.",
          "Your turn. Below are **4 scenarios** from a real server: the daemon pulling images itself, an image from another registry, a daemon that restarts at night and bringing a stopped container back. **Type the commands yourself** in the terminal; the scene shows what the CLI asks the daemon.",
        ),
        l(
          "`docker ps -a` kapanmış container'ları da gösterir. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "`docker ps -a` shows stopped containers too. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("`docker` CLI sadece bir istemci; işi Docker daemon (`dockerd`) yapar.", "The `docker` CLI is only a client; the Docker daemon (`dockerd`) does the work."),
    l("CLI daemon'la bir API üzerinden, genelde `/var/run/docker.sock` soketiyle konuşur.", "The CLI talks to the daemon over an API, usually through the `/var/run/docker.sock` socket."),
    l("Image'ları registry'den indiren ve saklayan daemon'dır; eksik image `run` sırasında otomatik çekilir.", "The daemon pulls and stores images; a missing image is pulled automatically during `run`."),
    l("Image adı `registry/namespace/repository:tag`; kısa adlar `docker.io/library/...:latest`'e tamamlanır.", "An image name is `registry/namespace/repository:tag`; short names expand to `docker.io/library/...:latest`."),
    l("Container'ları daemon tutar: CLI kapansa da çalışırlar, daemon durunca dururlar.", "The daemon holds the containers: they keep running when the CLI exits and stop when the daemon stops."),
    l("Daemon geri gelince sadece restart policy'si olan container'lar kendiliğinden başlar.", "When the daemon comes back, only containers with a restart policy start by themselves."),
  ],
  quiz: [
    {
      question: l("`Cannot connect to the Docker daemon at unix:///var/run/docker.sock` hatası ne demek?", "What does `Cannot connect to the Docker daemon at unix:///var/run/docker.sock` mean?"),
      options: [
        l("Docker kurulu değil", "Docker is not installed"),
        l("CLI çalışıyor ama daemon çalışmıyor ya da ona erişim yok", "The CLI works but the daemon is not running or cannot be reached"),
        l("Image bulunamadı", "The image was not found"),
        l("İnternet bağlantısı yok", "There is no internet connection"),
      ],
      answer: 1,
      explain: l("CLI daemon'a soket üzerinden ulaşamıyor. Daemon'ı (ya da Docker Desktop'ı) başlat veya kullanıcının sokete iznini kontrol et.", "The CLI cannot reach the daemon over the socket. Start the daemon (or Docker Desktop), or check your permission on the socket."),
      reviewStep: 1,
    },
    {
      question: l("`docker run postgres:17` yazdın ve image makinende yok. Ne olur?", "You type `docker run postgres:17` and the image is not on your machine. What happens?"),
      options: [
        l("Hata: önce `docker pull` gerekir", "An error: you need `docker pull` first"),
        l("Daemon image'ı Docker Hub'dan çeker, sonra container'ı başlatır", "The daemon pulls the image from Docker Hub, then starts the container"),
        l("Container Docker Hub'ın sunucusunda çalışır", "The container runs on Docker Hub's servers"),
        l("CLI image'ı indirir ve daemon'a verir", "The CLI downloads the image and hands it to the daemon"),
      ],
      answer: 1,
      explain: l("Eksik image `run` sırasında daemon tarafından otomatik çekilir; container her zaman yerelde çalışır.", "The daemon pulls a missing image during `run`; the container always runs locally."),
      reviewStep: 4,
    },
    {
      question: l("`ghcr.io/acme/api:2.1` adında registry hangisi?", "In `ghcr.io/acme/api:2.1`, which part is the registry?"),
      options: [l("`acme`", "`acme`"), l("`ghcr.io`", "`ghcr.io`"), l("`api`", "`api`"), l("`2.1`", "`2.1`")],
      answer: 1,
      explain: l("İlk parça (nokta ya da port içeriyorsa) registry'dir: `ghcr.io`. `acme` namespace, `api` repository, `2.1` tag.", "The first part (when it has a dot or a port) is the registry: `ghcr.io`. `acme` is the namespace, `api` the repository, `2.1` the tag."),
      reviewStep: 6,
    },
    {
      question: l("Sunucu yeniden başladıktan sonra web servisin kendiliğinden geri gelsin istiyorsun. Ne yaparsın?", "You want your web service to come back by itself after the server reboots. What do you do?"),
      options: [
        l("Hiçbir şey, container'lar her zaman geri gelir", "Nothing; containers always come back"),
        l("Container'ı `--restart unless-stopped` ile başlatırım", "Start the container with `--restart unless-stopped`"),
        l("Terminali açık bırakırım", "Keep the terminal open"),
        l("`docker pull` ile image'ı güncellerim", "Update the image with `docker pull`"),
      ],
      answer: 1,
      explain: l("Daemon geri gelince sadece restart policy'si olan container'ları başlatır.", "When the daemon returns it starts only the containers with a restart policy."),
      reviewStep: 7,
    },
  ],
};
