import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { narration } from "./narration";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const inspectAndClean: Lesson = {
  slug: "inspect-and-clean",
  title: l("İncele ve temizle", "Inspect and clean up"),
  summary: l(
    "`ps`, `images`, `logs`, `exec`, `inspect` ve `stats` ile makinende neler olduğunu oku; `rm`, `rmi` ve `prune` ile biriken her şeyi güvenle temizle.",
    "Read what is happening on your machine with `ps`, `images`, `logs`, `exec`, `inspect` and `stats`; clean up the leftovers safely with `rm`, `rmi` and `prune`.",
  ),
  minutes: 14,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  narration,
  objectives: [
    { text: l("`ps` ile `ps -a` farkını bilmek", "Know `ps` versus `ps -a`"), step: 1 },
    { text: l("Kapanmış bir container'ın neden kapandığını loglardan okumak", "Read from the logs why a container stopped"), step: 3 },
    { text: l("Çalışan bir container'ın içine girmek ve ayrıntılarına bakmak", "Get inside a running container and look at its details"), step: 5 },
    { text: l("`prune`'un neyi silip neyi bıraktığını bilmek", "Know what `prune` removes and what it leaves"), step: 8 },
  ],
  steps: [
    {
      short: l("docker ps", "docker ps"),
      tag: "how",
      title: l("docker ps: şu an ne çalışıyor?", "docker ps: what is running now?"),
      body: [
        l(
          "Birkaç gündür bu makinede çalışıyorsun. Sağda makinenin özeti var: container'lar ve image'lar. Soldaki terminalde `docker ps` çalıştı.",
          "You have been working on this machine for a few days. On the right is a summary of it: containers and images. In the terminal on the left, `docker ps` ran.",
        ),
        l(
          "Listede sadece `web` var: `docker ps` yalnızca **çalışan** container'ları gösterir. Her satırda kimlik, image, durum, portlar ve ad var.",
          "Only `web` is listed: `docker ps` shows **running** containers only. Each row has the id, image, status, ports and name.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker ps" },
          { cmd: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"', note: l("Sadece istediğin sütunlar.", "Only the columns you want.") },
        ],
      },
    },
    {
      short: l("docker ps -a", "docker ps -a"),
      tag: "how",
      predict: {
        question: l("`docker ps` sadece `web`'i gösterdi. Sağdaki özete bak: `docker ps -a` kaç container listeler?", "`docker ps` showed only `web`. Look at the summary on the right: how many containers does `docker ps -a` list?"),
        options: [l("1", "1"), l("3", "3"), l("0", "0")],
        answer: 1,
        why: l("`-a` (all) kapanmış ve hiç başlamamış container'ları da gösterir: web, hello ve broken.", "`-a` (all) also shows exited and never-started containers: web, hello and broken."),
      },
      title: l("ps -a: kapanmış olanlar da", "ps -a: the exited ones too"),
      body: [
        l(
          "`docker ps -a` üç container gösterdi. `hello` işini bitirip **Exited (0)** oldu; `broken` ise **Exited (1)**: bir şeyler ters gitmiş.",
          "`docker ps -a` lists three containers. `hello` finished its job, **Exited (0)**; `broken` shows **Exited (1)**: something went wrong.",
        ),
        l(
          "Kapanmış container'lar sen silene kadar diskte durur. \"Container kayboldu\" sandığında ilk bakacağın yer `docker ps -a`.",
          "Exited containers stay on disk until you remove them. When a container \"disappeared\", `docker ps -a` is the first place to look.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker ps -a" },
          { cmd: "docker ps -a --filter status=exited", note: l("Sadece kapanmışlar.", "Only exited ones.") },
          { cmd: "docker ps -aq", note: l("Sadece kimlikler; script'lerde işe yarar.", "Just the ids; handy in scripts.") },
        ],
      },
    },
    {
      short: l("docker images", "docker images"),
      tag: "how",
      title: l("docker images: diskteki image'lar", "docker images: the images on disk"),
      body: [
        l(
          "`docker images` bu makinedeki her image'ı boyutuyla listeler. Bir satır dikkat çekiyor: `<none>` `<none>`.",
          "`docker images` lists every image on this machine with its size. One row stands out: `<none>` `<none>`.",
        ),
        l(
          "Bu bir **dangling** (sahipsiz) image: `acme/site:dev`'i yeniden build ettiğinde etiket yeni image'a geçti, eskisi etiketsiz kaldı. Kimse kullanmıyor ama yer kaplıyor.",
          "That is a **dangling** image: when you rebuilt `acme/site:dev`, the tag moved to the new image and the old one was left without a tag. Nobody uses it, but it takes space.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker images", note: l("`docker image ls` ile aynı.", "Same as `docker image ls`.") },
          { cmd: "docker images --filter dangling=true", note: l("Sadece etiketsiz kalanlar.", "Only the untagged leftovers.") },
        ],
      },
    },
    {
      short: l("docker logs", "docker logs"),
      tag: "experiment",
      predict: {
        question: l("`broken` kapanmış durumda. `docker logs broken` çalışır mı?", "`broken` has exited. Does `docker logs broken` work?"),
        options: [
          l("Hayır, kapanmış container'ın logu olmaz", "No, an exited container has no logs"),
          l("Evet: loglar container silinene kadar durur", "Yes: logs stay until the container is removed"),
          l("Sadece `-f` ile", "Only with `-f`"),
        ],
        answer: 1,
        why: l(
          "Docker, ana sürecin yazdığı her şeyi container'la birlikte saklar. Kapanmış bir container'ın neden kapandığını öğrenmenin en hızlı yolu budur.",
          "Docker keeps whatever the main process printed, together with the container. It is the fastest way to learn why a container stopped.",
        ),
      },
      title: l("docker logs: neden kapandı?", "docker logs: why did it stop?"),
      body: [
        l(
          "`docker logs broken` cevabı verdi: `Error: disk full, cannot write /tmp/report.csv`. Exit code 1'in sebebi bu.",
          "`docker logs broken` gave the answer: `Error: disk full, cannot write /tmp/report.csv`. That is why it exited with 1.",
        ),
        l(
          "Container'ın içindeki uygulama loglarını dosyaya değil, ekrana (stdout/stderr) yazmalı; Docker'ın topladığı da o.",
          "An app in a container should log to the screen (stdout/stderr), not to a file; that is what Docker collects.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker logs broken" },
          { cmd: "docker logs -f --tail 50 web", note: l("Son 50 satır, sonra canlı izle (Ctrl+C ile çık).", "The last 50 lines, then follow live (Ctrl+C to quit).") },
          { cmd: "docker logs --since 10m web", note: l("Son 10 dakika.", "The last 10 minutes.") },
        ],
      },
    },
    {
      short: l("exec -it", "exec -it"),
      tag: "how",
      title: l("docker exec -it: içine gir", "docker exec -it: step inside"),
      body: [
        l(
          "`docker exec -it web sh` çalışan container'ın içinde bir kabuk açtı. İçeride `whoami` → `root`, `env` → container'ın ortam değişkenleri. Terminalde ikisinin çıktısı var.",
          "`docker exec -it web sh` opened a shell inside the running container. Inside, `whoami` gives `root` and `env` shows the container's environment. The terminal shows both outputs.",
        ),
        l(
          "`-i` girişi açık tutar, `-t` bir terminal verir; ikisi birlikte etkileşimli kabuk demek. `exit` ile çıkarsın, container çalışmaya devam eder.",
          "`-i` keeps input open, `-t` gives you a terminal; together they mean an interactive shell. `exit` leaves it, and the container keeps running.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "`exec` ile içeride yaptığın değişiklikler container'ın kendi katmanında kalır ve container yeniden yaratılınca gider. Kalıcı bir düzeltmeyi Dockerfile'a yaz.",
            "Changes you make inside with `exec` stay in the container's own layer and vanish when it is recreated. Put a lasting fix in the Dockerfile.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker exec -it web sh", note: l("Küçük image'larda `bash` olmayabilir; `sh` hemen hemen her yerde var.", "Small images may lack `bash`; `sh` is almost always there.") },
          { cmd: "docker exec web env", note: l("Kabuk açmadan tek bir komut.", "One command, no shell.") },
        ],
      },
    },
    {
      short: l("inspect · stats", "inspect · stats"),
      tag: "how",
      title: l("docker inspect ve docker stats", "docker inspect and docker stats"),
      body: [
        l(
          "`docker inspect web` container'ın bütün ayarlarını JSON olarak döker: durum, exit code, komut, ortam değişkenleri, portlar, mount'lar. Terminalde öne çıkan alanlar var.",
          "`docker inspect web` dumps all of a container's settings as JSON: state, exit code, command, environment, ports, mounts. The terminal shows the main fields.",
        ),
        l(
          "`docker stats` çalışan container'ların CPU ve bellek kullanımını canlı gösterir. Sınır koymadıysan LIMIT makinenin bütün belleğidir.",
          "`docker stats` shows running containers' CPU and memory use live. Without a limit, LIMIT is the machine's whole memory.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker inspect web" },
          { cmd: "docker inspect --format '{{.State.ExitCode}}' broken", note: l("Tek bir alanı Go şablonuyla çek.", "Pull out one field with a Go template.") },
          { cmd: "docker stats --no-stream", note: l("Canlı yerine tek seferlik ölçüm.", "One reading instead of a live view.") },
        ],
      },
    },
    {
      short: l("rmi", "rmi"),
      tag: "experiment",
      predict: {
        question: l("`web`, `nginx:1.27` image'ından çalışıyor. `docker rmi nginx:1.27` dersek ne olur?", "`web` runs from the `nginx:1.27` image. What happens with `docker rmi nginx:1.27`?"),
        options: [
          l("Image silinir, web çalışmaya devam eder", "The image is removed and web keeps running"),
          l("Docker reddeder: image kullanımda", "Docker refuses: the image is in use"),
          l("web de silinir", "web is removed too"),
        ],
        answer: 1,
        why: l(
          "Bir container (çalışan ya da kapanmış) image'ı kullandığı sürece Docker onu silmez. Önce container gitmeli.",
          "As long as a container, running or exited, uses an image, Docker will not delete it. The container has to go first.",
        ),
      },
      title: l("rmi: kullanılan image silinmez", "rmi: an image in use stays"),
      body: [
        l(
          "Docker reddetti: `conflict: unable to remove repository reference \"nginx:1.27\" ... container ... is using its referenced image`. Image'ı silmek için önce onu kullanan container'ları silmen gerekir.",
          "Docker refused: `conflict: unable to remove repository reference \"nginx:1.27\" ... container ... is using its referenced image`. Remove the containers that use it first.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker rmi nginx:1.27", note: l("`docker image rm` ile aynı.", "Same as `docker image rm`.") },
          { cmd: "docker rm -f web && docker rmi nginx:1.27", note: l("Önce container, sonra image.", "Container first, then the image.") },
        ],
      },
    },
    {
      short: l("stop · start · rm", "stop · start · rm"),
      tag: "how",
      title: l("Tek tek: stop, start, rm", "One by one: stop, start, rm"),
      body: [
        l(
          "`web`'i durdurup yeniden başlattık; `hello`'yu da `docker rm` ile sildik. Tek bir container'la uğraşırken bu komutlar yeter, ve hangisini sildiğini tam olarak bilirsin.",
          "We stopped `web` and started it again, and removed `hello` with `docker rm`. For a single container these commands are enough, and you know exactly what you removed.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker stop web && docker start web" },
          { cmd: "docker rm hello" },
          { cmd: "docker rm $(docker ps -aq --filter status=exited)", note: l("Kapanmış bütün container'lar, tek tek değil hepsi birden.", "Every exited container at once.") },
        ],
      },
    },
    {
      short: l("prune", "prune"),
      tag: "how",
      predict: {
        question: l("Şimdi `docker system prune` çalıştıracağız. Çalışan `web`'e ne olur?", "Now we will run `docker system prune`. What happens to the running `web`?"),
        options: [l("Silinir", "It is removed"), l("Dokunulmaz", "It is left alone"), l("Durdurulur", "It is stopped")],
        answer: 1,
        why: l(
          "Prune sadece **kullanılmayanları** siler: durmuş container'lar, etiketsiz ve kullanılmayan image'lar, kullanılmayan network'ler. Çalışan bir container kullanımdadır.",
          "Prune removes only **unused** things: stopped containers, untagged unused images, unused networks. A running container is in use.",
        ),
      },
      title: l("docker system prune: toplu temizlik", "docker system prune: tidy up in one go"),
      body: [
        l(
          "Prune `broken`'ı ve sahipsiz `<none>` image'ı sildi. `web` çalışıyor; `acme/old:0.1` de duruyor çünkü etiketi var.",
          "Prune removed `broken` and the dangling `<none>` image. `web` is still running, and `acme/old:0.1` stays because it has a tag.",
        ),
        l(
          "Varsayılan prune **volume'lara dokunmaz**: veritabanı verilerin güvende. `--volumes` eklersen kullanılmayan anonim volume'lar da gider (Docker 23'ten beri). Adlı volume'ları silmek bilinçli bir iş: `docker volume prune -a`.",
          "By default prune **leaves volumes alone**: your database data is safe. Add `--volumes` and unused anonymous volumes go too (since Docker 23). Removing named volumes is a deliberate step: `docker volume prune -a`.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Prune durmuş her container'ı siler. Bir container'ı \"sonra bakarım\" diye durdurduysan, prune onu da götürür. Görevlerden biri tam olarak bunu gösteriyor.",
            "Prune removes every stopped container. If you stopped one to \"look at it later\", prune takes it too. One of the missions shows exactly that.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker system prune", note: l("Durmuş container'lar, sahipsiz image'lar, kullanılmayan network'ler ve build cache. Onay ister.", "Stopped containers, dangling images, unused networks and build cache. Asks to confirm.") },
          { cmd: "docker system prune -a", note: l("Kullanılmayan **bütün** image'lar da gider, etiketli olsalar bile.", "Also **every** unused image, tagged or not.") },
          { cmd: "docker container prune", note: l("Sadece durmuş container'lar.", "Only stopped containers.") },
          { cmd: "docker volume prune -a", note: l("Kullanılmayan adlı volume'lar da. İçindeki veri geri gelmez.", "Unused named volumes too. Their data does not come back.") },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Disk nereye gitti?", "Where did the disk go?"),
      body: [
        l(
          "`docker system df` Docker'ın ne kadar yer kapladığını türe göre özetler: image'lar, container'lar, volume'lar ve build cache. Temizliğe başlamadan önce buraya bak.",
          "`docker system df` sums up how much space Docker uses, by kind: images, containers, volumes and build cache. Look here before you start cleaning.",
        ),
        l(
          "Geliştirme makinesinde en çok yer genelde eski image'lar ve build cache'tir. `docker builder prune` sadece cache'i temizler.",
          "On a dev machine most of the space usually goes to old images and the build cache. `docker builder prune` clears just the cache.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede terminal çıktıları modelden üretiliyor ve sütunlar kısaltıldı. Gerçek `docker ps` daha çok sütun (COMMAND, CREATED) gösterir; `docker stats` da CPU'yu gerçekten ölçer.",
            "Here the terminal output is built from the model and the columns are trimmed. Real `docker ps` shows more columns (COMMAND, CREATED), and `docker stats` really measures CPU.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker system df" },
          { cmd: "docker system df -v", note: l("Her image, container ve volume ayrı ayrı.", "Every image, container and volume one by one.") },
          { cmd: "docker builder prune", note: l("Sadece build cache.", "Only the build cache.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Bu makinede birkaç günlük iş birikmiş: çalışan `web`, kapanmış `hello` ve `broken`, kullanılmayan ve sahipsiz image'lar. Aşağıda **4 senaryo** var: yer açmak, sadece sahipsizleri silmek, bir servisi taşımak ve temizlik tuzağından kaçmak. Komutları alttaki terminale **kendin yaz**.",
          "Your turn. A few days of work have piled up on this machine: a running `web`, stopped `hello` and `broken`, unused and dangling images. Below are **4 scenarios**: making room, removing only the dangling images, moving a service out and dodging the cleanup trap. **Type the commands yourself** in the terminal below.",
        ),
        l(
          "Sahnedeki pencere sürekli `docker ps -a` gösterir; sağdaki özet de container ve image'ları. Silmeden önce `docker ps -a` ve `docker images` ile bak. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "The window in the scene keeps showing `docker ps -a`, and the summary on the right lists containers and images. Look with `docker ps -a` and `docker images` before you remove anything. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("`docker ps` çalışanları, `docker ps -a` bütün container'ları gösterir.", "`docker ps` shows running containers; `docker ps -a` shows them all."),
    l("`docker logs` kapanmış bir container'ın bile neden kapandığını söyler.", "`docker logs` tells you why a container stopped, even after it exited."),
    l("`docker exec -it ad sh` çalışan container'ın içine girer; oradaki değişiklikler kalıcı değildir.", "`docker exec -it name sh` steps inside a running container; changes there do not last."),
    l("`docker inspect` bütün ayarları, `docker stats` canlı CPU ve bellek kullanımını gösterir.", "`docker inspect` shows every setting; `docker stats` shows live CPU and memory use."),
    l("Bir container kullandığı sürece image silinmez; önce container, sonra `rmi`.", "An image cannot be removed while a container uses it; container first, then `rmi`."),
    l("`docker system prune` durmuş container'ları ve sahipsiz image'ları siler; `-a` kullanılmayan bütün image'ları da götürür, volume'lar ise `--volumes` olmadan hiç silinmez.", "`docker system prune` removes stopped containers and dangling images; `-a` takes every unused image, and volumes are never removed without `--volumes`."),
  ],
  quiz: [
    {
      question: l("Bir container \"kayboldu\": `docker ps`'te yok. İlk ne yaparsın?", "A container \"vanished\": it is not in `docker ps`. What do you do first?"),
      options: [l("Yeniden kurarım", "Reinstall it"), l("`docker ps -a` ile bakarım, sonra `docker logs`", "Look with `docker ps -a`, then `docker logs`"), l("`docker system prune`", "`docker system prune`"), l("`docker pull`", "`docker pull`")],
      answer: 1,
      explain: l("Büyük ihtimalle kapanmış duruyor: `ps -a` gösterir, `logs` sebebini söyler.", "Most likely it exited: `ps -a` shows it and `logs` says why."),
      reviewStep: 1,
    },
    {
      question: l("`docker images` listesinde `<none>` `<none>` satırı ne demek?", "What does a `<none>` `<none>` row in `docker images` mean?"),
      options: [l("Bozuk bir image", "A broken image"), l("Etiketi başka image'a geçmiş, sahipsiz kalmış bir image", "An image whose tag moved to another image, left dangling"), l("İndirilmekte olan image", "An image being downloaded"), l("Gizli bir image", "A hidden image")],
      answer: 1,
      explain: l("Aynı etiketle yeniden build edince eski image etiketsiz kalır; prune onları temizler.", "Rebuilding with the same tag leaves the old image untagged; prune cleans those up."),
      reviewStep: 2,
    },
    {
      question: l("`docker system prune` (seçeneksiz) neyi **silmez**?", "What does plain `docker system prune` **not** remove?"),
      options: [l("Durmuş container'ları", "Stopped containers"), l("Sahipsiz image'ları", "Dangling images"), l("Volume'ları", "Volumes"), l("Kullanılmayan network'leri", "Unused networks")],
      answer: 2,
      explain: l("Volume'lar ancak `--volumes` ile silinir; veriler varsayılan olarak korunur.", "Volumes only go with `--volumes`; data is protected by default."),
      reviewStep: 8,
    },
    {
      question: l("`docker rmi nginx:1.27` \"is using its referenced image\" hatası verdi. Neden?", "`docker rmi nginx:1.27` failed with \"is using its referenced image\". Why?"),
      options: [
        l("Image bozuk", "The image is broken"),
        l("Bir container (kapanmış olsa bile) o image'ı kullanıyor", "A container, even an exited one, uses that image"),
        l("Registry'de yok", "It is not on the registry"),
        l("Yetkin yok", "You lack permission"),
      ],
      answer: 1,
      explain: l("Önce o image'dan oluşan container'ları sil, sonra image'ı.", "Remove the containers made from it first, then the image."),
      reviewStep: 6,
    },
  ],
};
