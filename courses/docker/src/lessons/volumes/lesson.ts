import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { narration } from "./narration";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const volumes: Lesson = {
  slug: "volumes",
  title: l("Volume ve bind mount", "Volumes and bind mounts"),
  summary: l(
    "Container silinince içine yazılan veri de gider. Named volume, bind mount ve bir veritabanının verisini korumayı gör.",
    "When a container is removed, the data written inside it goes too. See named volumes, bind mounts and how to keep a database's data safe.",
  ),
  minutes: 14,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  narration,
  objectives: [
    { text: l("Container'a yazılan verinin container'la birlikte gittiğini görmek", "See data written in a container go away with it"), step: 1 },
    { text: l("Named volume ile verinin container'dan uzun yaşadığını görmek", "See a named volume outlive the container"), step: 3 },
    { text: l("Bind mount ile host'taki dosyaları container'a açmak", "Open host files inside a container with a bind mount"), step: 5 },
    { text: l("Bir veritabanının verisini volume ile korumak", "Keep a database's data safe with a volume"), step: 7 },
  ],
  steps: [
    {
      short: l("Container'a yaz", "Write inside"),
      tag: "how",
      title: l("Container'ın kendi katmanı", "The container's own layer"),
      body: [
        l(
          "`app` adlı bir container başlattık ve içine `/data/notes.txt` dosyasını yazdık. Dosya şu an orada, container da çalışıyor.",
          "We started a container called `app` and wrote `/data/notes.txt` inside it. The file is there and the container is running.",
        ),
        l(
          "Image salt okunurdur. Container içinde yazılan her şey, o container'a ait ince bir **yazılabilir katmana** gider. Bu katman container'ın kendisine aittir.",
          "An image is read-only. Everything written inside a container goes into a thin **writable layer** that belongs to that container alone.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name app nginx:1.27" },
          { cmd: "docker exec app sh -c 'mkdir -p /data && echo \"ilk not\" > /data/notes.txt'", note: l("Container'ın içinde bir dosya yazar.", "Writes a file inside the container.") },
          { cmd: "docker diff app", note: l("Container'ın image'a göre değiştirdiği dosyaları listeler (A eklendi, C değişti).", "Lists files the container changed compared with its image (A added, C changed).") },
        ],
      },
    },
    {
      short: l("Sil, yeniden başlat", "Remove, restart"),
      tag: "problem",
      predict: {
        question: l(
          "`app`'i silip aynı image'dan yeni bir `app` başlatacağız. `/data/notes.txt` yeni container'da olacak mı?",
          "We will remove `app` and start a new `app` from the same image. Will `/data/notes.txt` be in the new container?",
        ),
        options: [
          l("Evet, aynı image'dan başladı", "Yes, it started from the same image"),
          l("Hayır, not eski container'la birlikte gitti", "No, the note went away with the old container"),
          l("Docker dosyayı bir yere yedekledi, geri gelir", "Docker backed it up and brings it back"),
        ],
        answer: 1,
        why: l(
          "Not, eski container'ın yazılabilir katmanındaydı. Container silinince katman da silinir; yeni container image'ın temiz haliyle başlar.",
          "The note lived in the old container's writable layer. Removing the container removes that layer; the new one starts from the clean image.",
        ),
      },
      title: l("Container gidince veri de gider", "When the container goes, so does the data"),
      body: [
        l(
          "`docker rm -f app` ve yeni bir `app`. `cat /data/notes.txt` artık `No such file or directory` diyor. Not kayboldu.",
          "`docker rm -f app` and a new `app`. `cat /data/notes.txt` now says `No such file or directory`. The note is gone.",
        ),
        l(
          "Bu bir hata değil, tasarım: container'lar **geçici** düşünülür. İstediğin an silip yenisini açabilmelisin. Saklanması gereken veri container'ın dışında durmalı.",
          "This is not a bug, it is the design: containers are meant to be **disposable**. You should be able to remove one and start another at any time. Data you need to keep must live outside the container.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker rm -f app" },
          { cmd: "docker run -d --name app nginx:1.27" },
          { cmd: "docker exec app cat /data/notes.txt", note: l("Dosya yok: yeni container temiz başladı.", "No file: the new container started clean.") },
        ],
      },
    },
    {
      short: l("Named volume", "Named volume"),
      tag: "how",
      title: l("Named volume: Docker'ın sakladığı veri alanı", "A named volume: a data area Docker keeps"),
      body: [
        l(
          "`docker volume create notes-data` bir [[volume]] oluşturdu: sağda bir varil. `-v notes-data:/data` ile yeni `app`'e bağladık. Container'ın içinde `/data` artık o volume.",
          "`docker volume create notes-data` made a [[volume]]: a barrel on the right. With `-v notes-data:/data` we attached it to the new `app`. Inside the container, `/data` is now that volume.",
        ),
        l(
          "Notu tekrar yazdık. Bu sefer dosya container'ın katmanına değil, volume'a gitti. Olay listesinde de \"'notes-data' volume'una\" yazıyor.",
          "We wrote the note again. This time it went into the volume, not the container's layer, and the event list says \"to volume 'notes-data'\".",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker volume create notes-data" },
          { cmd: "docker run -d --name app -v notes-data:/data nginx:1.27" },
          { cmd: "docker volume ls" },
          { cmd: "docker volume inspect notes-data", note: l("`Mountpoint` volume'un diskte durduğu yer (Linux'ta /var/lib/docker/volumes/...).", "`Mountpoint` is where it lives on disk (on Linux, /var/lib/docker/volumes/...).") },
        ],
      },
    },
    {
      short: l("Volume yaşar", "It survives"),
      tag: "experiment",
      predict: {
        question: l(
          "`app`'i yine sileceğiz, sonra aynı `notes-data` volume'u ile yeni bir `app` başlatacağız. Not orada mı?",
          "We will remove `app` again, then start a new `app` with the same `notes-data` volume. Is the note there?",
        ),
        options: [l("Evet", "Yes"), l("Hayır, container'la gitti", "No, it went with the container"), l("Sadece ilk satırı", "Only the first line")],
        answer: 0,
        why: l(
          "Volume container'dan bağımsız yaşar. Container silinir, volume ve içindeki veri kalır; yeni container aynı volume'u bağlayınca veriyi görür.",
          "A volume lives apart from containers. The container is removed, the volume and its data stay, and a new container that mounts it sees the data.",
        ),
      },
      title: l("Container gitti, veri kaldı", "The container went, the data stayed"),
      body: [
        l(
          "`cat /data/notes.txt` artık `ilk not` diyor. Container'ı istediğimiz kadar silip yeniden yaratabiliriz; veri volume'da güvende.",
          "`cat /data/notes.txt` now says `ilk not`. We can remove and recreate the container as often as we like; the data is safe in the volume.",
        ),
        l(
          "Bir image'ı güncellemek de böyle olur: eski container'ı sil, yeni image'la yenisini aynı volume'la başlat.",
          "Updating to a new image works the same way: remove the old container, start the new one with the same volume.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker rm -f app" },
          { cmd: "docker run -d --name app -v notes-data:/data nginx:1.27" },
          { cmd: "docker exec app cat /data/notes.txt" },
        ],
      },
    },
    {
      short: l("Bind mount", "Bind mount"),
      tag: "how",
      title: l("Bind mount: host'taki klasörü aç", "A bind mount: open a host folder"),
      body: [
        l(
          "Bilgisayarında `/home/ada/site` klasöründe bir `index.html` var. `-v /home/ada/site:/usr/share/nginx/html` bu klasörü nginx'in sayfa klasörü olarak container'a açtı. Buna [[bindMount]] denir.",
          "On your machine, `/home/ada/site` holds an `index.html`. `-v /home/ada/site:/usr/share/nginx/html` opened that folder inside the container as nginx's page folder. This is a [[bindMount]].",
        ),
        l(
          "`curl localhost:8080` host'taki dosyanın içeriğini getirdi: `Merhaba v1`. Kaynak bir yolla (`/` ya da `./` ile) başlıyorsa bind mount, düz bir adsa named volume.",
          "`curl localhost:8080` returned the host file's content: `Merhaba v1`. If the source starts with a path (`/` or `./`) it is a bind mount; a plain name is a named volume.",
        ),
      ],
      practice: {
        commands: [
          { cmd: 'docker run -d --name web -p 8080:80 -v "$(pwd)/site:/usr/share/nginx/html:ro" nginx:1.27', note: l("`:ro` container'ın dosyaları değiştirmesini engeller (salt okunur).", "`:ro` stops the container changing the files (read-only).") },
          {
            cmd: 'docker run -d --name web -p 8080:80 --mount type=bind,source="$(pwd)"/site,target=/usr/share/nginx/html,readonly nginx:1.27',
            note: l("Aynısı `--mount` ile: daha uzun ama her şey adıyla yazılı. Kaynak yoksa `--mount` hata verir, `-v` ise boş klasör açar.", "The same with `--mount`: longer, but every part is named. If the source is missing `--mount` errors, while `-v` creates an empty folder."),
          },
        ],
      },
    },
    {
      short: l("Canlı düzenle", "Live edit"),
      tag: "experiment",
      predict: {
        question: l(
          "Host'ta `index.html`'i `Merhaba v2` diye değiştireceğiz. Container'ı yeniden başlatmadan `curl` ne getirir?",
          "We will change `index.html` on the host to `Merhaba v2`. Without restarting the container, what does `curl` return?",
        ),
        options: [
          l("Hâlâ `Merhaba v1`: container eski dosyayı kopyaladı", "Still `Merhaba v1`: the container copied the old file"),
          l("`Merhaba v2`: iki taraf aynı dosyaya bakıyor", "`Merhaba v2`: both sides look at the same file"),
          l("Hata: dosya değişince container durur", "An error: the container stops when the file changes"),
        ],
        answer: 1,
        why: l(
          "Bind mount kopya değildir; container host'taki dosyanın kendisini görür. Değişiklik anında içeride de geçerli olur.",
          "A bind mount is not a copy; the container sees the host file itself. A change is visible inside at once.",
        ),
      },
      title: l("Değişiklik anında içeride", "Changes show up inside at once"),
      body: [
        l(
          "Dosyayı host'ta değiştirdik ve `curl` hemen `Merhaba v2` getirdi. Image'ı yeniden build etmedik, container'ı yeniden başlatmadık.",
          "We changed the file on the host and `curl` returned `Merhaba v2` right away. No image rebuild, no container restart.",
        ),
        l(
          "Geliştirme sırasında bind mount bu yüzden çok kullanılır: kodu editörde değiştirirsin, container anında görür. Üretimde ise kod image'ın içinde olmalı; bind mount sunucunun klasör düzenine bağımlılık yaratır.",
          "That is why bind mounts are popular during development: edit code in your editor and the container sees it at once. In production the code should be inside the image; a bind mount ties you to the server's folder layout.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "echo 'Merhaba v2' > site/index.html" },
          { cmd: "curl localhost:8080" },
        ],
      },
    },
    {
      short: l("Volume'suz DB", "DB, no volume"),
      tag: "problem",
      title: l("Volume'suz veritabanı: her seferinde boş", "A database without a volume: empty every time"),
      body: [
        l(
          "`postgres:17`'yi `-v` vermeden başlattık, sildik ve yeniden başlattık. İkisinde de log aynı: `initialized a new, empty database`. Bütün tablolar her seferinde gitti.",
          "We started `postgres:17` without `-v`, removed it and started it again. Both logs say the same: `initialized a new, empty database`. Every table was gone each time.",
        ),
        l(
          "Sağa bak: iki tane **anonim** volume var. Postgres image'ı veri klasörünü volume olarak tanımlar, `-v` vermezsen Docker rastgele adlı bir volume açar. Eski veri aslında o varilde duruyor, ama yeni container onu bulamıyor: adı yok.",
          "Look right: there are two **anonymous** volumes. The postgres image declares its data folder as a volume, so without `-v` Docker makes one with a random name. The old data is actually still in that barrel, but the new container cannot find it: it has no name.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Volume'suz çalışan bir veritabanında veri, container silinene kadar \"var gibi\" görünür. `docker rm` ya da `docker compose down` sonrası fark edersin. Veritabanına her zaman named volume ver.",
            "A database without a named volume looks fine until the container is removed. You notice after `docker rm` or `docker compose down`. Always give a database a named volume.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker volume ls", note: l("Uzun, rastgele adlı volume'lar anonim volume'lardır.", "Long, random names are anonymous volumes.") },
        ],
      },
    },
    {
      short: l("pgdata", "pgdata"),
      tag: "how",
      predict: {
        question: l(
          "Postgres'i `-v pgdata:/var/lib/postgresql/data` ile başlatıp silecek, sonra aynı volume'la yeniden başlatacağız. Veritabanı nasıl başlar?",
          "We will start postgres with `-v pgdata:/var/lib/postgresql/data`, remove it, then start it again with the same volume. How does the database start?",
        ),
        options: [l("Yine boş", "Empty again"), l("Eski veriyi bularak", "Finding the old data"), l("Hata vererek", "With an error")],
        answer: 1,
        why: l(
          "Veri klasörü artık isimli bir volume. Yeni container aynı volume'u bağlayınca eski dosyaları bulur ve kaldığı yerden devam eder.",
          "The data folder is now a named volume. The new container mounts it, finds the old files and carries on.",
        ),
      },
      title: l("Veritabanı verisini korumak", "Keeping a database's data safe"),
      body: [
        l(
          "İkinci başlangıçta log `database system is ready to accept connections (existing data found)` diyor. Veri `pgdata` volume'unda, container'lar gelip geçiyor.",
          "On the second start the log says `database system is ready to accept connections (existing data found)`. The data is in the `pgdata` volume; containers come and go.",
        ),
        l(
          "Hedef klasör image'a göre değişir: postgres için `/var/lib/postgresql/data`, MySQL için `/var/lib/mysql`, Redis için `/data`. Image'ın Docker Hub sayfası bunu yazar.",
          "The target folder depends on the image: `/var/lib/postgresql/data` for postgres, `/var/lib/mysql` for MySQL, `/data` for Redis. The image's Docker Hub page says which.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:17" },
          {
            cmd: 'docker run --rm -v pgdata:/data -v "$(pwd)":/backup alpine tar czf /backup/pgdata.tgz -C /data .',
            note: l("Volume'un yedeğini almak: geçici bir alpine container'ı volume'u okuyup host'a arşivler. Canlı veritabanı için `pg_dump` daha güvenli.", "Backing up a volume: a throwaway alpine container reads it and writes an archive to the host. For a live database, `pg_dump` is safer."),
          },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Volume'ları yönetmek", "Managing volumes"),
      body: [
        l(
          "`-v` kısa yazımdır; `--mount` aynı işi her parçayı adıyla yazarak yapar (`type`, `source`, `target`, `readonly`). Docker'ın belgeleri yeni projelerde `--mount`'u önerir, çünkü daha okunaklıdır ve yanlış yazımı sessizce geçmez.",
          "`-v` is the short form; `--mount` does the same with every part named (`type`, `source`, `target`, `readonly`). Docker's docs suggest `--mount` for new work: it is easier to read and does not silently accept typos.",
        ),
        l(
          "Volume'u ancak onu kullanan container yoksa silebilirsin. `docker volume prune` artık (Docker 23'ten beri) sadece kullanılmayan **anonim** volume'ları siler; isimlileri de silmek için `-a` gerekir. Silinen volume'un verisi geri gelmez.",
          "You can only remove a volume no container is using. `docker volume prune` (since Docker 23) removes only unused **anonymous** volumes; add `-a` to remove named ones too. A removed volume's data does not come back.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede dosyalar tek satırlık metin ve yazma anında oluyor. Docker Desktop'ta (Mac, Windows) volume'lar küçük bir Linux sanal makinesinin içinde durur, bind mount'lar ise oraya aktarılır; bu yüzden büyük klasörlerde bind mount yavaş olabilir.",
            "Here files are one-line text and writes are instant. On Docker Desktop (Mac, Windows) volumes live inside a small Linux VM and bind mounts are shared into it, so bind mounts of big folders can be slow.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name app --mount type=volume,source=notes-data,target=/data nginx:1.27" },
          { cmd: "docker volume rm notes-data", note: l("Kullanan container varken: `volume is in use`.", "While a container uses it: `volume is in use`.") },
          { cmd: "docker volume prune -a", note: l("Kullanılmayan bütün volume'ları siler. Dikkatli kullan.", "Removes every unused volume. Use with care.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **5 senaryo** var: container'ı yenilerken notları korumak, postgres verisini kalıcı yapmak, klasörü canlı göstermek, kullanımdaki bir volume'u silmek ve isimsiz volume'ları temizlemek. Komutları terminale **kendin yaz**; sahne verinin nerede durduğunu gösterir.",
          "Your turn. Below are **5 scenarios** from real work: keeping notes while recreating a container, making postgres data last, serving a folder live, removing a volume in use and clearing nameless volumes. **Type the commands yourself** in the terminal; the scene shows where the data lives.",
        ),
        l(
          "`docker volume ls` volume'ları, `docker exec <ad> cat <dosya>` bir container'ın içindeki dosyayı gösterir. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "`docker volume ls` lists volumes, and `docker exec <name> cat <file>` shows a file inside a container. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Container'ın içine yazılan veri onun yazılabilir katmanındadır ve container silinince gider.", "Data written inside a container lives in its writable layer and goes when the container is removed."),
    l("Named volume (`-v ad:/yol`) Docker'ın sakladığı, container'lardan bağımsız yaşayan veri alanıdır.", "A named volume (`-v name:/path`) is a data area Docker keeps, living apart from containers."),
    l("Bind mount (`-v /host/yol:/yol`) host'taki klasörü container'a açar; değişiklikler iki tarafta anında görünür.", "A bind mount (`-v /host/path:/path`) opens a host folder inside the container; changes show on both sides at once."),
    l("Veritabanlarına her zaman named volume ver; yoksa her yeni container boş başlar.", "Always give databases a named volume; otherwise every new container starts empty."),
    l("Kullanımdaki volume silinmez; `docker volume prune` varsayılan olarak sadece anonim volume'ları siler.", "A volume in use cannot be removed; `docker volume prune` removes only anonymous volumes by default."),
  ],
  quiz: [
    {
      question: l("Bir container'a `docker exec` ile dosya yazdın, sonra `docker rm -f` ile sildin. Dosya nerede?", "You wrote a file in a container with `docker exec`, then removed it with `docker rm -f`. Where is the file?"),
      options: [l("Image'ın içinde", "In the image"), l("Hiçbir yerde, container'la gitti", "Nowhere, it went with the container"), l("Bir volume'da", "In a volume"), l("Host'un /tmp klasöründe", "In the host's /tmp")],
      answer: 1,
      explain: l("Volume'suz yazılan dosya container'ın yazılabilir katmanındaydı; container silinince o da silinir.", "Written without a volume, the file was in the container's writable layer, which is removed with it."),
      reviewStep: 1,
    },
    {
      question: l("`-v pgdata:/var/lib/postgresql/data` ile `-v ./pgdata:/var/lib/postgresql/data` arasındaki fark nedir?", "What is the difference between `-v pgdata:/var/lib/postgresql/data` and `-v ./pgdata:/var/lib/postgresql/data`?"),
      options: [
        l("Fark yok", "None"),
        l("İlki named volume, ikincisi bulunduğun klasördeki `pgdata` klasörünü bind mount eder", "The first is a named volume; the second bind-mounts the `pgdata` folder in your current directory"),
        l("İlki salt okunur", "The first is read-only"),
        l("İkincisi geçersiz", "The second is invalid"),
      ],
      answer: 1,
      explain: l("Kaynak bir yolla başlıyorsa bind mount, düz bir adsa named volume'dur.", "A source that starts with a path is a bind mount; a plain name is a named volume."),
      reviewStep: 4,
    },
    {
      question: l("Geliştirme sırasında kodu editörde değiştirip container'da anında görmek için ne kullanırsın?", "During development, what lets you edit code in your editor and see it in the container at once?"),
      options: [l("Named volume", "A named volume"), l("Bind mount", "A bind mount"), l("Her seferinde `docker build`", "`docker build` every time"), l("`docker cp`", "`docker cp`")],
      answer: 1,
      explain: l("Bind mount host'taki klasörün kendisini açar; dosya değişince container da görür.", "A bind mount opens the host folder itself; when a file changes, the container sees it."),
      reviewStep: 5,
    },
    {
      question: l("`docker volume rm pgdata` `volume is in use` hatası verdi. Ne yaparsın?", "`docker volume rm pgdata` fails with `volume is in use`. What do you do?"),
      options: [
        l("`-f` ile zorla silerim, container çalışmaya devam eder", "Force it with `-f` and the container keeps running"),
        l("Önce volume'u kullanan container'ı kaldırırım", "Remove the container using it first"),
        l("Docker'ı yeniden başlatırım", "Restart Docker"),
        l("Volume'un adını değiştiririm", "Rename the volume"),
      ],
      answer: 1,
      explain: l("Bir volume, onu kullanan container durduğu ya da silindiği sürece silinemez; önce container'ı kaldır.", "A volume cannot be removed while a container uses it; remove the container first."),
      reviewStep: 8,
    },
  ],
};
