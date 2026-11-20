import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const runFlags: Lesson = {
  slug: "run-flags",
  title: l("docker run ve parametreleri", "docker run and its flags"),
  summary: l(
    "`docker run` bir image'dan container başlatır. `-d`, `--name`, `-p`, `-e`, `--rm` ve `-v` ile neyin değiştiğini tek tek gör.",
    "`docker run` starts a container from an image. See what `-d`, `--name`, `-p`, `-e`, `--rm` and `-v` each change.",
  ),
  minutes: 14,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("`docker run`'ın image'ı indirip container başlattığını görmek", "See `docker run` pull an image and start a container"), step: 0 },
    { text: l("`-d` ve `--name` ile arka planda, isimle çalıştırmak", "Run in the background with a name using `-d` and `--name`"), step: 1 },
    { text: l("`-p` ile bir container'ı host'tan erişilir yapmak", "Make a container reachable from the host with `-p`"), step: 3 },
    { text: l("`-e` ile ayar vermek, `--rm` ile kendini silen container", "Pass settings with `-e`; a container that removes itself with `--rm`"), step: 6 },
  ],
  steps: [
    {
      short: l("İlk run", "First run"),
      tag: "how",
      title: l("docker run: image'dan container", "docker run: from image to container"),
      body: [
        l(
          "`docker run hello-world` iki şey yaptı. Önce bu makinede `hello-world` [[image]]'ı yoktu, Docker onu Docker Hub'dan indirdi. Sonra o image'dan bir [[container]] başlattı.",
          "`docker run hello-world` did two things. The `hello-world` [[image]] was not on this machine, so Docker pulled it from Docker Hub. Then it started a [[container]] from it.",
        ),
        l(
          "Container bir mesaj yazdı ve kapandı: işi buydu. Sahnede gri duruyor, \"kapandı (0)\". 0, \"sorunsuz bitti\" demek.",
          "The container printed a message and stopped: that was its whole job. It stands grey on stage, \"exited (0)\". 0 means \"finished fine\".",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Image bir tarif, container o tariften pişen yemek. Aynı tariften istediğin kadar yemek yapabilirsin; yemeklerden biri bozulsa tarif yerinde durur.",
            "An image is a recipe; a container is a dish cooked from it. You can cook as many dishes as you like, and if one goes wrong the recipe is still there.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker run hello-world", note: l("Kurulumun çalıştığını gösteren en küçük deneme.", "The smallest check that your install works.") },
          { cmd: "docker ps -a", note: l("Bütün container'lar, kapanmış olanlar dahil. `-a` olmadan sadece çalışanlar.", "All containers, exited ones too. Without `-a`, only running ones.") },
        ],
      },
    },
    {
      short: l("-d --name", "-d --name"),
      tag: "how",
      title: l("-d ve --name: arka planda, isimle", "-d and --name: in the background, with a name"),
      body: [
        l(
          "`docker run -d --name web nginx:1.27` bir web sunucusu başlattı. Sunucunun işi bitmez, istek bekler; bu yüzden container çalışmaya devam ediyor (yeşil ışık).",
          "`docker run -d --name web nginx:1.27` started a web server. A server never finishes, it waits for requests, so the container keeps running (green light).",
        ),
        l(
          "`-d` (detached) terminali bırakır, container arka planda çalışır. `--name web` ona okunabilir bir ad verir; vermezsen Docker `eager_turing` gibi rastgele bir ad seçer.",
          "`-d` (detached) gives your terminal back while the container runs in the background. `--name web` gives it a readable name; without it Docker picks a random one like `eager_turing`.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name web nginx:1.27" },
          { cmd: "docker ps", note: l("Çalışan container'lar: ad, image, durum, portlar.", "Running containers: name, image, status, ports.") },
          { cmd: "docker logs web", note: l("Container'ın çıktısı. `-f` ile canlı izlersin.", "The container's output. Add `-f` to follow it live.") },
        ],
      },
    },
    {
      short: l("Port yok", "No port"),
      tag: "problem",
      predict: {
        question: l("nginx container içinde 80 portunu dinliyor. Bilgisayarından `curl localhost:80` yaparsan ne olur?", "nginx listens on port 80 inside the container. What happens if you run `curl localhost:80` on your machine?"),
        options: [l("nginx sayfası gelir", "The nginx page comes back"), l("Bağlantı reddedilir", "The connection is refused"), l("Docker portu otomatik açar", "Docker opens the port automatically")],
        answer: 1,
        why: l(
          "Container'ın kendi ağı var. İçeride 80 dinlemek, host'ta 80'in açık olduğu anlamına gelmez; portu sen yayınlamalısın.",
          "A container has its own network. Listening on 80 inside does not open 80 on the host; you have to publish the port.",
        ),
      },
      title: l("İçeride çalışıyor, dışarıdan görünmüyor", "Running inside, invisible from outside"),
      body: [
        l(
          "`curl localhost:80` reddedildi. nginx çalışıyor ama kendi küçük ağında; host'un portlarıyla arasında hiçbir bağ yok.",
          "`curl localhost:80` was refused. nginx is running, but on its own little network, with no link to the host's ports.",
        ),
      ],
      practice: {
        commands: [{ cmd: "curl localhost:80", note: l("Port yayınlanmadıysa: Connection refused.", "Without a published port: Connection refused.") }],
      },
    },
    {
      short: l("-p", "-p"),
      tag: "how",
      title: l("-p host:container ile kapıyı aç", "Open the door with -p host:container"),
      body: [
        l(
          "`-p 8080:80` şunu der: host'un **8080** portuna gelen her şeyi container'ın **80** portuna ver. Sahnede container'ın altında `localhost:8080 → 80` etiketi var ve curl artık nginx sayfasını getiriyor.",
          "`-p 8080:80` says: send whatever reaches the host's **8080** to the container's **80**. Under the container there is now a `localhost:8080 → 80` tag, and curl gets the nginx page.",
        ),
        l(
          "Sıra hep **host:container**. Soldaki senin bilgisayarın, sağdaki container'ın içi. Bunu [[portMapping]] dersinde daha derin açacağız.",
          "The order is always **host:container**. Left is your machine, right is inside the container. The [[portMapping]] lesson goes deeper.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name web2 -p 8080:80 nginx:1.27" },
          { cmd: "curl localhost:8080", note: l("Ya da tarayıcıda http://localhost:8080 aç.", "Or open http://localhost:8080 in a browser.") },
        ],
      },
    },
    {
      short: l("İsim çakışması", "Name clash"),
      tag: "experiment",
      predict: {
        question: l("`web` adında bir container zaten var. Aynı adla, bu sefer portlu bir tane daha başlatmayı deneyeceğiz. Ne olur?", "A container called `web` already exists. We will try to start another one with the same name, this time with a port. What happens?"),
        options: [
          l("Eskisinin yerine yenisi başlar", "The new one replaces the old one"),
          l("Docker reddeder: isim kullanımda", "Docker refuses: the name is in use"),
          l("İki tane `web` olur", "There are two `web`s"),
        ],
        answer: 1,
        why: l(
          "Container adları tekildir. Aynı adı yeniden kullanmak için önce eskisini silmen gerekir (`docker rm -f web`).",
          "Container names are unique. To reuse a name, remove the old one first (`docker rm -f web`).",
        ),
      },
      title: l("Bir isim, bir container", "One name, one container"),
      body: [
        l(
          "Docker reddetti: `Conflict. The container name \"/web\" is already in use`. İsim, çalışmayan bir container'da bile durur.",
          "Docker refused: `Conflict. The container name \"/web\" is already in use`. A name stays taken even by a container that is not running.",
        ),
        l(
          "Ayrıca çalışan bir container'a sonradan port eklenemez. Ayar değiştirmek = container'ı silip yeni ayarla yeniden başlatmak. Container'lar bu yüzden \"atılıp yeniden yaratılacak\" şekilde düşünülür.",
          "You also cannot add a port to a running container. Changing settings means removing it and starting a new one. That is why containers are meant to be thrown away and recreated.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker rm -f web", note: l("Çalışıyor olsa da durdurup siler.", "Stops it if needed, then removes it.") },
          { cmd: "docker run -d --name web -p 8080:80 nginx:1.27" },
        ],
      },
    },
    {
      short: l("-e", "-e"),
      tag: "experiment",
      predict: {
        question: l("`acme/api` çalışmak için `DATABASE_URL` ayarına ihtiyaç duyuyor. Onu vermeden başlatırsak ne olur?", "`acme/api` needs a `DATABASE_URL` setting to run. What happens if we start it without one?"),
        options: [
          l("Çalışır, ayarı sonra okur", "It runs and reads the setting later"),
          l("Başlar ve hemen exit code 1 ile kapanır", "It starts and exits right away with code 1"),
          l("Docker container'ı oluşturmayı reddeder", "Docker refuses to create the container"),
        ],
        answer: 1,
        why: l(
          "Docker ayarın gerekip gerekmediğini bilmez; container'ı başlatır. Uygulama ayarı bulamayınca hata yazıp 1 ile çıkar.",
          "Docker does not know the app needs the setting; it starts the container. The app cannot find it, prints an error and exits with 1.",
        ),
      },
      title: l("-e ile ayar ver", "Pass settings with -e"),
      body: [
        l(
          "İlk deneme kırmızı oldu: `Error: environment variable DATABASE_URL is not set`, exit code 1. Kapanan container'ı sildik ve `-e DATABASE_URL=...` ile yeniden başlattık; artık çalışıyor.",
          "The first try went red: `Error: environment variable DATABASE_URL is not set`, exit code 1. We removed it and started again with `-e DATABASE_URL=...`; now it runs.",
        ),
        l(
          "Aynı image'ı farklı ortamlarda çalıştırmanın yolu budur: kod aynı, ayarlar `-e` ile dışarıdan gelir.",
          "This is how one image runs in different places: the code is the same, settings come from outside with `-e`.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name api -e DATABASE_URL=postgres://db/shop acme/api:1.0" },
          { cmd: "docker run -d --env-file .env acme/api:1.0", note: l("Çok sayıda ayar için bir dosyadan okut.", "Read many settings from a file.") },
          { cmd: "docker logs api", note: l("Kapanan bir container'ın da logları okunur: hatanın sebebi orada.", "Logs work on exited containers too: the reason is there.") },
        ],
      },
    },
    {
      short: l("--rm", "--rm"),
      tag: "how",
      predict: {
        question: l("`docker run --rm hello-world` çalışıp işini bitirince container'a ne olur?", "After `docker run --rm hello-world` finishes, what happens to the container?"),
        options: [l("Kapanmış olarak durur", "It stays, exited"), l("Kendini siler", "It removes itself"), l("Yeniden başlar", "It starts again")],
        answer: 1,
        why: l("`--rm` \"bitince beni sil\" demek. Tek seferlik işlerde artık container yığılmasını önler.", "`--rm` means \"remove me when I am done\". For one-off jobs it stops leftover containers piling up."),
      },
      title: l("--rm: iş bitince temizle", "--rm: clean up when done"),
      body: [
        l(
          "`once` adlı container mesajını yazdı, kapandı ve hemen silindi. Sahnede görünmüyor. Kısa ömürlü işler (bir script, bir test, bir migration) için ideal.",
          "The `once` container printed its message, stopped and was removed at once; it is not on stage. Ideal for short jobs: a script, a test, a migration.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker run --rm alpine:3.20 echo merhaba", note: l("Çalıştır, çıktıyı gör, iz bırakma.", "Run, see the output, leave nothing behind.") }],
      },
    },
    {
      short: l("-v", "-v"),
      tag: "how",
      title: l("-v: veriyi container'ın dışında tut", "-v: keep data outside the container"),
      body: [
        l(
          "`-v site:/usr/share/nginx/html` bir [[volume]] açtı ve container'ın içinde o klasöre bağladı. Container oraya `index.html` yazınca dosya volume'a gitti (sağda varil).",
          "`-v site:/usr/share/nginx/html` created a [[volume]] and attached it to that folder inside the container. When the container wrote `index.html` there, the file went into the volume (the barrel on the right).",
        ),
        l(
          "Container silinse de volume ve içindeki veri kalır. Neden önemli olduğunu Veri ve ağ bölümünde göreceğiz.",
          "Remove the container and the volume, with its data, stays. The Data and networking chapter shows why that matters.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name files -v site:/usr/share/nginx/html nginx:1.27" },
          { cmd: "docker volume ls" },
        ],
      },
    },
    {
      short: l("Hepsi bir arada", "All together"),
      tag: "reality",
      title: l("Gerçek bir komut", "A real command"),
      body: [
        l(
          "Sıra her zaman şöyle: `docker run [SEÇENEKLER] IMAGE [KOMUT]`. Seçenekler image adından **önce** gelir; image'dan sonra yazılan her şey container'ın içinde çalışacak komuttur.",
          "The order is always `docker run [OPTIONS] IMAGE [COMMAND]`. Options come **before** the image name; anything after the image is the command to run inside the container.",
        ),
        l(
          "Yani `docker run nginx -p 8080:80` çalışmaz: `-p 8080:80` nginx'e komut olarak gider. Bir web servisini günlük kullanımda böyle başlatırsın:",
          "So `docker run nginx -p 8080:80` does not work: `-p 8080:80` is passed to nginx as its command. In daily use you start a web service like this:",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede container'ların ne yaptığı küçük bir \"program\" ile anlatılıyor ve süre adım adım ilerliyor. Gerçek container'lar gerçek süreçlerdir; image çekmek de ağına göre saniyeler sürer.",
            "On this stage what a container does is described by a small \"program\", and time moves step by step. Real containers are real processes, and pulling an image takes seconds depending on your network.",
          ),
        },
      ],
      practice: {
        commands: [
          {
            cmd: "docker run -d --name api -p 3000:3000 -e DATABASE_URL=postgres://db/shop --restart unless-stopped acme/api:1.0",
            note: l("Arka planda, isimle, port yayınlı, ayarlı ve çökerse yeniden başlayan bir servis.", "A service in the background, named, port published, configured, and restarted if it crashes."),
          },
          { cmd: "docker run --help", note: l("Bütün seçenekler.", "Every option.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Bu dizüstünde `nginx:1.27` ve ekibin `acme/api:1.0` image'ı var. Aşağıda gerçek işten **5 senaryo** var: komutları terminale **kendin yaz**, sahne her komutta ne olduğunu gösterir.",
          "Your turn. This laptop has `nginx:1.27` and the team's `acme/api:1.0` image. Below are **5 scenarios** from real work: **type the commands yourself** in the terminal, and the scene shows what each one does.",
        ),
        l(
          "Takılırsan `docker ps -a` ve `docker logs <ad>` yaz: neyin çalıştığını ve neden kapandığını gösterirler. `curl localhost:8080` ile portu deneyebilirsin. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "If you're stuck, type `docker ps -a` and `docker logs <name>`: they show what runs and why something stopped. `curl localhost:8080` tries a port. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("`docker run` image yoksa indirir, sonra ondan bir container başlatır.", "`docker run` pulls the image if needed, then starts a container from it."),
    l("`-d` arka planda çalıştırır, `--name` okunabilir ve tekil bir ad verir.", "`-d` runs in the background; `--name` gives a readable, unique name."),
    l("`-p host:container` container'ın portunu bilgisayarına açar; vermezsen dışarıdan erişilemez.", "`-p host:container` opens a container port on your machine; without it there is no way in."),
    l("`-e` ayarları dışarıdan verir; eksik ayar uygulamayı exit code 1 ile kapatabilir.", "`-e` passes settings in; a missing one can stop the app with exit code 1."),
    l("`--rm` bitince container'ı siler; `-v` veriyi container'dan bağımsız bir volume'da tutar.", "`--rm` removes the container when it ends; `-v` keeps data in a volume that outlives it."),
    l("Ayar değiştirmek için container silinip yeniden başlatılır; seçenekler image adından önce gelir.", "To change settings you remove and recreate the container; options come before the image name."),
  ],
  quiz: [
    {
      question: l("`docker run -p 3000:8080 acme/api` komutunda uygulama container'ın içinde hangi portu dinlemeli?", "In `docker run -p 3000:8080 acme/api`, which port should the app listen on inside the container?"),
      options: [l("3000", "3000"), l("8080", "8080"), l("İkisi de", "Both"), l("Fark etmez", "It does not matter")],
      answer: 1,
      explain: l("Sıra host:container. 3000 senin bilgisayarın, 8080 container'ın içi.", "The order is host:container. 3000 is your machine, 8080 is inside the container."),
      reviewStep: 3,
    },
    {
      question: l("Bir container başlar başlamaz kapanıyor ve `docker ps`'te görünmüyor. Nereye bakarsın?", "A container stops right after starting and does not show in `docker ps`. Where do you look?"),
      options: [l("`docker images`", "`docker images`"), l("`docker ps -a` ve `docker logs <ad>`", "`docker ps -a` and `docker logs <name>`"), l("`docker pull`", "`docker pull`"), l("Hiçbir yere, kayboldu", "Nowhere, it is gone")],
      answer: 1,
      explain: l("Kapanmış container'lar `-a` ile görünür; logları da durur ve hatanın sebebini söyler.", "Exited containers show with `-a`, and their logs stay and tell you why."),
      reviewStep: 5,
    },
    {
      question: l("`docker run nginx -d -p 8080:80` neden beklediğin gibi çalışmaz?", "Why does `docker run nginx -d -p 8080:80` not work as expected?"),
      options: [
        l("nginx bu portları desteklemez", "nginx does not support those ports"),
        l("Seçenekler image adından sonra geldiği için nginx'e komut olarak gider", "The options come after the image, so they go to nginx as its command"),
        l("`-d` ile `-p` birlikte kullanılamaz", "`-d` and `-p` cannot be used together"),
        l("Önce `docker pull` gerekir", "You must `docker pull` first"),
      ],
      answer: 1,
      explain: l("`docker run [SEÇENEKLER] IMAGE [KOMUT]`: image'dan sonrası container'ın komutudur.", "`docker run [OPTIONS] IMAGE [COMMAND]`: everything after the image is the container's command."),
      reviewStep: 8,
    },
    {
      question: l("Çalışan `web` container'ına yeni bir port eklemek istiyorsun. Ne yaparsın?", "You want to add a port to the running `web` container. What do you do?"),
      options: [
        l("`docker port web 8080:80`", "`docker port web 8080:80`"),
        l("Container'ı silip yeni portla yeniden başlatırım", "Remove it and start it again with the new port"),
        l("`docker restart web -p 8080:80`", "`docker restart web -p 8080:80`"),
        l("Container'ın içinden portu açarım", "Open the port from inside the container"),
      ],
      answer: 1,
      explain: l("Container'ın ayarları başlarken sabitlenir. Değiştirmek için silip yeniden yaratırsın.", "A container's settings are fixed when it starts. To change them, remove and recreate it."),
      reviewStep: 4,
    },
  ],
};
