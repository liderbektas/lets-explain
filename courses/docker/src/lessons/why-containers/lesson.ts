import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { narration } from "./narration";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const whyContainers: Lesson = {
  slug: "why-containers",
  title: l("Neden container?", "Why containers?"),
  summary: l(
    "\"Benim bilgisayarımda çalışıyordu\" sorunu, sanal makinelerle container'ların farkı ve bir makinede yan yana çalışan, birbirinden ayrı container'lar.",
    "The \"it works on my machine\" problem, how containers differ from virtual machines, and separate containers running side by side on one machine.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  narration,
  objectives: [
    { text: l("Container'ın hangi sorunu çözdüğünü anlamak", "Understand the problem containers solve"), step: 1 },
    { text: l("Sanal makine ile container farkını bilmek", "Know how a virtual machine differs from a container"), step: 3 },
    { text: l("Container'ların birbirinden yalıtıldığını görmek", "See that containers are isolated from each other"), step: 5 },
    { text: l("Container'ların atılıp yeniden yaratılabildiğini görmek", "See that containers are thrown away and recreated"), step: 6 },
  ],
  steps: [
    {
      short: l("Sorun", "Problem"),
      tag: "problem",
      title: l("\"Benim bilgisayarımda çalışıyordu\"", "\"It works on my machine\""),
      body: [
        l(
          "Uygulaman senin bilgisayarında sorunsuz çalışıyor: Node 22 kurulu, gereken kütüphaneler yerinde. Sunucuya kopyalıyorsun ve çöküyor. Sunucuda Node 18 var ve kodun kullandığı bir özellik orada yok.",
          "Your app runs fine on your laptop: Node 22 is installed and the libraries are there. You copy it to the server and it crashes. The server has Node 18, which lacks a feature your code uses.",
        ),
        l(
          "Sorun kodda değil, **ortamda**: işletim sistemi, dil sürümü, sistem kütüphaneleri, ayarlar. Her makine biraz farklı ve bu farklar ancak canlıda ortaya çıkıyor.",
          "The problem is not the code but the **environment**: the operating system, the language version, system libraries, settings. Every machine is a bit different, and the differences only show up in production.",
        ),
      ],
      practice: {
        intro: l("Kendi makinende ortamının ne olduğuna bak:", "Look at what your own environment is:"),
        commands: [
          { cmd: "node --version", note: l("Sunucudaki sürümle aynı mı?", "Is it the same version as on the server?") },
          { cmd: "uname -a", note: l("İşletim sistemi ve kernel.", "Operating system and kernel.") },
        ],
      },
    },
    {
      short: l("Fikir", "Idea"),
      tag: "idea",
      title: l("Uygulamayı ortamıyla birlikte paketle", "Ship the app together with its environment"),
      body: [
        l(
          "Çözüm: uygulamayı tek başına değil, ihtiyaç duyduğu her şeyle birlikte paketlemek: Node 22, kütüphaneler, minik bir Linux dosya sistemi. Bu pakete [[image]] denir.",
          "The fix: ship the app not alone but with everything it needs: Node 22, the libraries, a small Linux filesystem. That package is called an [[image]].",
        ),
        l(
          "Image'dan çalıştırılan kopyaya [[container]] denir. Aynı image senin bilgisayarında da sunucuda da aynı şekilde çalışır, çünkü ortam paketin içinde.",
          "A running copy of an image is a [[container]]. The same image runs the same way on your laptop and on the server, because the environment is inside the package.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker --version", note: l("Docker kurulu mu? Değilse docs.docker.com/get-docker adresinden kur.", "Is Docker installed? If not, get it from docs.docker.com/get-docker.") },
          { cmd: "docker run --rm node:22-slim node --version", note: l("Bilgisayarında Node olmasa bile Node 22 çalıştırır.", "Runs Node 22 even if your machine has no Node at all.") },
        ],
      },
    },
    {
      short: l("VM", "VMs"),
      tag: "how",
      title: l("Eski yol: sanal makine", "The old way: a virtual machine"),
      body: [
        l(
          "Bu sorunun eski cevabı sanal makineydi (VM). Bir hypervisor gerçek donanımın üstünde sahte bilgisayarlar yaratır; her VM'in **kendi tam işletim sistemi** vardır.",
          "The older answer was a virtual machine (VM). A hypervisor creates fake computers on top of the real hardware, and every VM has its **own full operating system**.",
        ),
        l(
          "Bu güçlü bir yalıtım sağlar, ama pahalıdır: her VM gigabaytlarca yer kaplar, kendi kernel'ini çalıştırır ve açılması dakikalar sürebilir. İki uygulama için iki işletim sistemi taşırsın.",
          "That gives strong isolation, but it is expensive: each VM takes gigabytes, runs its own kernel and can take minutes to boot. Two apps means carrying two operating systems.",
        ),
      ],
    },
    {
      short: l("Container", "Containers"),
      tag: "how",
      predict: {
        question: l(
          "Aynı makinede iki VM yerine üç container çalıştıracağız. Container'lar aralarında neyi **paylaşır**?",
          "We will run three containers on the machine instead of two VMs. What do the containers **share**?",
        ),
        options: [
          l("Hiçbir şeyi, her birinin kendi işletim sistemi var", "Nothing, each has its own operating system"),
          l("Host'un kernel'ini", "The host's kernel"),
          l("Her şeyi, dosyaları da", "Everything, files included"),
        ],
        answer: 1,
        why: l(
          "Container'lar host'un kernel'ini paylaşır ama her birinin kendi dosya sistemi, süreçleri ve ağı vardır. Bu yüzden MB'larca yer kaplar ve saniyeler içinde başlar.",
          "Containers share the host's kernel but each has its own filesystem, processes and network. That is why they take megabytes and start in seconds.",
        ),
      },
      title: l("Container: kernel paylaşılır, gerisi ayrı", "Containers: the kernel is shared, the rest is separate"),
      body: [
        l(
          "Sağdaki yığına bak: container'larda misafir işletim sistemi katmanı yok. Hepsi host'un kernel'i üzerinde, Docker Engine'in yönettiği normal süreçler olarak çalışır.",
          "Look at the stack on the right: containers have no guest operating system layer. They all run as ordinary processes on the host's kernel, managed by the Docker Engine.",
        ),
        l(
          "Linux kernel'inin iki özelliği bunu mümkün kılar: **namespace**'ler her container'a kendi süreç, ağ ve dosya görünümünü verir; **cgroup**'lar ne kadar CPU ve bellek kullanabileceğini sınırlar.",
          "Two Linux kernel features make this possible: **namespaces** give each container its own view of processes, network and files; **cgroups** limit how much CPU and memory it may use.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "VM'ler ayrı müstakil evler: her birinin kendi temeli, tesisatı var. Container'lar bir apartmanın daireleri: bina (kernel) ortak, ama her dairenin kendi kapısı ve kilidi var.",
            "VMs are detached houses, each with its own foundations and plumbing. Containers are flats in one building: the building (kernel) is shared, but each flat has its own door and lock.",
          ),
        },
      ],
    },
    {
      short: l("Üç container", "Three containers"),
      tag: "experiment",
      predict: {
        question: l(
          "Bu makinede hiç image yok. Aynı `nginx:1.27` image'ından üç container başlatacağız. Image kaç kez indirilir?",
          "This machine has no images yet. We will start three containers from the same `nginx:1.27` image. How many times is the image downloaded?",
        ),
        options: [l("3 kez, her container için bir", "3 times, once per container"), l("1 kez", "Once"), l("Hiç, container'lar indirmez", "Never, containers do not download")],
        answer: 1,
        why: l(
          "İlk `docker run` image'ı indirir. Sonraki container'lar aynı image'ı yerelden kullanır; image bir kez durur, container'lar onun üstünde çalışır.",
          "The first `docker run` pulls the image. Later containers use the same local image: the image is stored once, and containers run on top of it.",
        ),
      },
      title: l("Bir image, üç container", "One image, three containers"),
      body: [
        l(
          "İlk `docker run` `nginx:1.27`'yi indirdi, diğer ikisi indirmedi. Şimdi üç web sunucusu yan yana çalışıyor (yeşil ışıklar) ve rafta tek bir image var.",
          "The first `docker run` pulled `nginx:1.27`; the other two did not. Three web servers now run side by side (green lights), and there is a single image on the shelf.",
        ),
        l(
          "Container başlatmak ucuz: ayrı bir işletim sistemi açılmıyor, sadece bir süreç başlıyor. Bu yüzden bir container'ı başlatmak saniyeler sürer.",
          "Starting a container is cheap: no separate operating system boots, just a process starts. That is why it takes seconds.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name web-1 nginx:1.27" },
          { cmd: "docker run -d --name web-2 nginx:1.27", note: l("Bu sefer \"Unable to find image locally\" yazmaz: image zaten var.", "This time no \"Unable to find image locally\": the image is already here.") },
          { cmd: "docker ps", note: l("Üçü de aynı image'dan.", "All three come from the same image.") },
        ],
      },
    },
    {
      short: l("Yalıtım", "Isolation"),
      tag: "experiment",
      predict: {
        question: l(
          "`web-1`'in içine `/tmp/note.txt` yazacağız. Sonra aynı dosyayı `web-2`'nin içinde arayacağız. Bulur mu?",
          "We will write `/tmp/note.txt` inside `web-1`, then look for it inside `web-2`. Will it be there?",
        ),
        options: [
          l("Evet, aynı image'dan geliyorlar", "Yes, they come from the same image"),
          l("Hayır, her container'ın kendi dosya sistemi var", "No, each container has its own filesystem"),
          l("Sadece biri yeniden başlarsa", "Only after one restarts"),
        ],
        answer: 1,
        why: l(
          "Image ortak ama salt okunur. Her container kendi yazılabilir katmanına yazar; komşusu onu göremez.",
          "The image is shared but read-only. Each container writes into its own writable layer, which its neighbour cannot see.",
        ),
      },
      title: l("Herkesin kendi dosya sistemi var", "Each one has its own filesystem"),
      body: [
        l(
          "`web-1` notu yazdı. `web-2`'de `cat /tmp/note.txt` çalıştırınca \"No such file or directory\" aldık. Aynı image'dan gelseler de birbirlerinin dosyalarını göremiyorlar.",
          "`web-1` wrote the note. Running `cat /tmp/note.txt` in `web-2` gave \"No such file or directory\". Same image, but they cannot see each other's files.",
        ),
        l(
          "Bu yalıtım süreçler ve ağ için de geçerli: bir container çökse ya da dosyalarını bozsa diğerleri etkilenmez.",
          "The same isolation holds for processes and the network: if one container crashes or wrecks its files, the others are not affected.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker exec web-1 sh -c 'echo merhaba > /tmp/note.txt'", note: l("Çalışan bir container'ın içinde komut çalıştırır.", "Runs a command inside a running container.") },
          { cmd: "docker exec web-2 cat /tmp/note.txt", note: l("No such file or directory.", "No such file or directory.") },
        ],
      },
    },
    {
      short: l("Atılabilir", "Disposable"),
      tag: "experiment",
      predict: {
        question: l(
          "`web-1`'i silip aynı adla yeniden başlatacağız. İçine yazdığımız not durur mu?",
          "We will remove `web-1` and start it again with the same name. Is the note we wrote still there?",
        ),
        options: [l("Durur, adı aynı", "Yes, it has the same name"), l("Durmaz, yeni container temiz başlar", "No, the new container starts clean"), l("Sadece image güncellenirse durur", "Only if the image was updated")],
        answer: 1,
        why: l(
          "Yeni container, image'ın temiz bir kopyasından başlar. Eski container'ın yazılabilir katmanı onunla birlikte silindi.",
          "The new container starts from a clean copy of the image. The old one's writable layer was removed with it.",
        ),
      },
      title: l("Container'lar atılıp yeniden yaratılır", "Containers are thrown away and recreated"),
      body: [
        l(
          "`docker rm -f web-1`, sonra yeniden `docker run --name web-1`. Not gitti: yeni container image'ın tertemiz halinden başladı. İndirme de olmadı, image zaten raftaydı.",
          "`docker rm -f web-1`, then `docker run --name web-1` again. The note is gone: the new container started from the image's clean state. No download either; the image was on the shelf.",
        ),
        l(
          "Bu bir özellik: container'ı bozarsan silip yenisini açarsın. Saklanması gereken veri (veritabanı dosyaları, yüklenen resimler) container'ın içinde değil, **volume**'da tutulur. Bunu Veri ve ağ bölümünde göreceğiz.",
          "That is a feature: if you break a container you remove it and start a new one. Data that must survive (database files, uploads) does not live inside the container but in a **volume**. The Data and networking chapter shows how.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker rm -f web-1" },
          { cmd: "docker run -d --name web-1 nginx:1.27", note: l("Temiz bir container; eski dosyalar yok.", "A clean container; the old files are gone.") },
        ],
      },
    },
    {
      short: l("Mac ve Windows", "Mac and Windows"),
      tag: "reality",
      title: l("macOS ve Windows'ta: arada bir Linux VM", "On macOS and Windows: a Linux VM in between"),
      body: [
        l(
          "Container'lar host'un kernel'ini paylaşır ve neredeyse her image bir **Linux** image'ıdır. macOS ve Windows'un kernel'i Linux değil. Peki orada nasıl çalışıyor?",
          "Containers share the host's kernel, and almost every image is a **Linux** image. macOS and Windows do not have a Linux kernel. So how does it work there?",
        ),
        l(
          "Docker Desktop arka planda küçük bir Linux sanal makinesi çalıştırır ve container'lar onun içinde döner. Sen bunu fark etmezsin; `docker` komutları aynı çalışır. Linux'ta ise arada VM yoktur.",
          "Docker Desktop quietly runs a small Linux virtual machine, and the containers run inside it. You do not notice: `docker` commands work the same. On Linux there is no VM in between.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Windows'un kendi \"Windows container\"ları da var ama nadiren kullanılır. Mac'te Apple Silicon (arm64) kullanıyorsan bazı image'ların amd64 sürümleri emülasyonla ve daha yavaş çalışır; çoğu resmi image iki mimari için de yayınlanır.",
            "Windows has its own \"Windows containers\", but they are rarely used. On an Apple Silicon (arm64) Mac, amd64-only images run under emulation and more slowly; most official images ship for both architectures.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker info --format '{{.OperatingSystem}} {{.Architecture}}'", note: l("Docker'ın gerçekte hangi sistemde çalıştığını gösterir (Docker Desktop'ta Linux VM).", "Shows what system Docker really runs on (the Linux VM on Docker Desktop).") },
        ],
      },
    },
    {
      short: l("Hangisi?", "Which one?"),
      tag: "reality",
      title: l("VM'ler kaybolmadı", "VMs did not go away"),
      body: [
        l(
          "Container her şeyin cevabı değil. Farklı bir işletim sistemi ya da kernel gerektiğinde, ya da birbirine güvenmeyen müşterileri çok sıkı ayırman gerektiğinde VM daha doğru araçtır.",
          "Containers are not the answer to everything. When you need a different operating system or kernel, or very strict separation between tenants who do not trust each other, a VM is the better tool.",
        ),
        l(
          "Gerçekte ikisi çoğu zaman birlikte çalışır: bulutta kiraladığın sunucu bir VM'dir ve container'larını onun içinde çalıştırırsın.",
          "In practice they usually work together: the server you rent in the cloud is a VM, and you run your containers inside it.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede container'ın ne yaptığı küçük bir \"program\" ile anlatılıyor. Gerçek bir container, namespace ve cgroup'larla sınırlanmış sıradan bir Linux sürecidir; `ps` ile host'tan bile görebilirsin.",
            "On this stage what a container does is described by a small \"program\". A real container is an ordinary Linux process fenced in by namespaces and cgroups; on Linux you can even see it from the host with `ps`.",
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
          "Sıra sende. Bu makinede `nginx:1.27` image'ı var. Aşağıda gerçek işten **4 senaryo** var: komutları terminale **kendin yaz**, sahne her komutta ne olduğunu gösterir.",
          "Your turn. This machine has the `nginx:1.27` image. Below are **4 scenarios** from real work: **type the commands yourself** in the terminal, and the scene shows what each one does.",
        ),
        l(
          "`docker ps` neyin çalıştığını, `docker exec <ad> <komut>` bir container'ın içinde ne olduğunu gösterir. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "`docker ps` shows what runs, and `docker exec <name> <command>` looks inside a container. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Container'lar \"benim bilgisayarımda çalışıyordu\" sorununu çözer: uygulama ortamıyla birlikte paketlenir.", "Containers fix \"it works on my machine\": the app is packaged together with its environment."),
    l("VM'in kendi tam işletim sistemi vardır; container'lar host'un kernel'ini paylaşır, bu yüzden hafif ve hızlıdır.", "A VM carries its own full operating system; containers share the host's kernel, so they are light and fast."),
    l("Bir image'dan istediğin kadar container çalışır; image bir kez indirilir.", "One image can run many containers; it is downloaded once."),
    l("Her container'ın kendi dosya sistemi, süreçleri ve ağı vardır; birbirlerini etkilemezler.", "Each container has its own filesystem, processes and network; they do not affect each other."),
    l("Container'lar atılıp yeniden yaratılır; saklanması gereken veri volume'da tutulur.", "Containers are thrown away and recreated; data that must survive lives in a volume."),
    l("macOS ve Windows'ta Docker Desktop container'ları küçük bir Linux VM'in içinde çalıştırır.", "On macOS and Windows, Docker Desktop runs containers inside a small Linux VM."),
  ],
  quiz: [
    {
      question: l("Container'ları VM'lerden hafif yapan şey nedir?", "What makes containers lighter than VMs?"),
      options: [
        l("Daha az bellek kullanan bir programlama dili", "A programming language that uses less memory"),
        l("Kendi işletim sistemlerini taşımayıp host'un kernel'ini paylaşmaları", "They share the host's kernel instead of carrying their own OS"),
        l("Sadece bulutta çalışmaları", "They only run in the cloud"),
        l("Dosya sistemlerinin olmaması", "They have no filesystem"),
      ],
      answer: 1,
      explain: l("Misafir işletim sistemi yok: container'lar host kernel'i üzerinde yalıtılmış süreçlerdir.", "There is no guest OS: containers are isolated processes on the host kernel."),
      reviewStep: 3,
    },
    {
      question: l("Aynı image'dan iki container başlattın ve birinin içine dosya yazdın. Diğerinde ne görürsün?", "You start two containers from one image and write a file in one. What do you see in the other?"),
      options: [l("Aynı dosyayı", "The same file"), l("Dosyanın boş halini", "An empty version of it"), l("Hiçbir şey: dosya orada yok", "Nothing: the file is not there"), l("Bir hata ve container çöker", "An error, and the container crashes")],
      answer: 2,
      explain: l("Her container kendi yazılabilir katmanına yazar; image salt okunurdur ve paylaşılır.", "Each container writes into its own writable layer; the image is read-only and shared."),
      reviewStep: 5,
    },
    {
      question: l("Bir container'ın içinde önemli veri tuttun ve container'ı silip yeniden başlattın. Veri nerede?", "You kept important data inside a container, then removed and restarted it. Where is the data?"),
      options: [l("Yeni container'da", "In the new container"), l("Image'ın içinde", "Inside the image"), l("Gitti; saklanması gereken veri volume'a yazılmalı", "Gone; data that must survive belongs in a volume"), l("Docker Hub'da", "On Docker Hub")],
      answer: 2,
      explain: l("Container silinince yazılabilir katmanı da gider. Kalıcı veri volume'larda tutulur.", "Removing a container removes its writable layer too. Lasting data goes into volumes."),
      reviewStep: 6,
    },
    {
      question: l("Mac'inde bir Linux image'ı nasıl çalışıyor?", "How does a Linux image run on your Mac?"),
      options: [
        l("macOS kernel'i Linux image'larını doğrudan çalıştırır", "The macOS kernel runs Linux images directly"),
        l("Docker Desktop arka planda bir Linux VM çalıştırır ve container'lar onun içinde döner", "Docker Desktop runs a Linux VM in the background and the containers run inside it"),
        l("Image önce macOS'a dönüştürülür", "The image is converted to macOS first"),
        l("Çalışmaz, sadece Linux'ta olur", "It does not; it only works on Linux"),
      ],
      answer: 1,
      explain: l("Container'lar bir Linux kernel'i ister; Docker Desktop bunu küçük bir VM ile sağlar.", "Containers need a Linux kernel; Docker Desktop provides one with a small VM."),
      reviewStep: 7,
    },
  ],
};
