import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";
import { narration } from "./narration";

export const debugging: Lesson = {
  slug: "debugging",
  title: l("Sorun giderme", "Debugging"),
  summary: l(
    "Container neden hemen kapandı? Logları oku, exit code'u çöz, içine gir; port çakışmasını ve izin hatasını kendin düzelt.",
    "Why did the container stop at once? Read the logs, decode the exit code, get inside; fix a port clash and a permission error yourself.",
  ),
  minutes: 15,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  narration,
  objectives: [
    { text: l("Kapanan bir container'ın logunu okuyup sebebi bulmak", "Read an exited container's logs to find the reason"), step: 1 },
    { text: l("Exit code'lardan ne olduğunu anlamak: 0, 1, 127, 137, 143", "Tell what happened from exit codes: 0, 1, 127, 137, 143"), step: 3 },
    { text: l("Çalışan bir container'ın içine `exec` ile girmek", "Get inside a running container with `exec`"), step: 4 },
    { text: l("Port çakışmasını ve izin hatasını düzeltmek", "Fix a port clash and a permission error"), step: 8 },
  ],
  steps: [
    {
      short: l("Kapandı", "It stopped"),
      tag: "problem",
      title: l("Başladı ve hemen kapandı", "It started and stopped at once"),
      body: [
        l(
          "`docker run -d --name api acme/api:1.0` hata vermedi, ama `docker ps` boş. Container başladı ve bir saniye içinde kapandı: sahnede kırmızı duruyor.",
          "`docker run -d --name api acme/api:1.0` gave no error, yet `docker ps` is empty. The container started and stopped within a second: it stands red on stage.",
        ),
        l(
          "Bu, Docker'da en sık karşılaşılan durum. Docker sadece ana süreci başlatır; süreç kapanırsa container da kapanır. Neden kapandığını container'ın kendisi söyler, sadece nereye bakacağını bilmen gerek.",
          "This is the most common Docker surprise. Docker only starts the main process; when the process ends, so does the container. The container itself tells you why: you just need to know where to look.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker ps", note: l("Sadece çalışanlar. Kapanan burada görünmez.", "Running ones only. The stopped one is not here.") },
          { cmd: "docker ps -a", note: l("Hepsi: STATUS sütununda `Exited (1) 3 seconds ago` gibi.", "All of them: the STATUS column says something like `Exited (1) 3 seconds ago`.") },
        ],
      },
    },
    {
      short: l("Loglar", "Logs"),
      tag: "how",
      title: l("İlk bakılacak yer: loglar", "First place to look: the logs"),
      body: [
        l(
          "Container kapanmış olsa da logları durur. Alttaki terminalde `docker logs api` satırı sebebi açıkça yazıyor: `DATABASE_URL` ayarı verilmemiş.",
          "Even after a container stops, its logs stay. In the terminal below, `docker logs api` says it plainly: `DATABASE_URL` was never set.",
        ),
        l(
          "Uygulama ne yazdıysa (stdout ve stderr) log olarak saklanır. Bu yüzden uygulaman hataları dosyaya değil ekrana yazmalı; Docker'da logu okumanın tek kolay yolu bu.",
          "Whatever the app printed (stdout and stderr) is kept as the log. That is why your app should print errors to the screen, not to a file: in Docker it is the one easy way to read them.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker logs api", note: l("Bütün çıktı. Kapanmış container'da da çalışır.", "All of the output. Works on stopped containers too.") },
          { cmd: "docker logs --tail 50 -f api", note: l("Son 50 satır, sonra canlı izle.", "The last 50 lines, then follow live.") },
          { cmd: "docker logs --since 10m api", note: l("Sadece son 10 dakika.", "Only the last 10 minutes.") },
        ],
      },
    },
    {
      short: l("127", "127"),
      tag: "experiment",
      predict: {
        question: l("nginx'i komut adını yanlış yazarak (`ngnix`) başlatacağız. Container hangi exit code ile kapanır?", "We will start nginx with the command misspelled (`ngnix`). Which exit code does the container stop with?"),
        options: [l("1", "1"), l("127", "127"), l("137", "137")],
        answer: 1,
        why: l("127 \"komut bulunamadı\" demek: image'da `ngnix` adında bir program yok. Uygulama hiç başlamadı bile.", "127 means \"command not found\": the image has no program called `ngnix`. The app never even started."),
      },
      title: l("Exit code bir ipucudur", "An exit code is a clue"),
      body: [
        l(
          "`typo` container'ı 127 ile kapandı. Logda `executable file not found in $PATH` yazıyor. 1'den farkı şu: 1 uygulamanın kendi hatası, 127 ise uygulamanın hiç bulunamaması.",
          "The `typo` container stopped with 127. The log says `executable file not found in $PATH`. The difference from 1: 1 is the app's own error, 127 means the app could not be found at all.",
        ),
        l(
          "Sık görülenler: **0** işini bitirdi · **1** uygulama hatası · **126** komut var ama çalıştırılamadı (çoğu zaman izin) · **127** komut yok · **137** SIGKILL ile öldürüldü · **143** SIGTERM ile durdurulup kapandı.",
          "The common ones: **0** finished · **1** app error · **126** the command exists but cannot run (often permissions) · **127** no such command · **137** killed with SIGKILL · **143** stopped by SIGTERM.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker inspect -f '{{.State.ExitCode}}' typo", note: l("Sadece exit code.", "Just the exit code.") },
          { cmd: "docker ps -a --filter status=exited", note: l("Kapanmış bütün container'lar.", "Every stopped container.") },
        ],
      },
    },
    {
      short: l("137", "137"),
      tag: "experiment",
      predict: {
        question: l("`acme/report` yaklaşık 300 MB bellek kullanıyor. Onu `--memory 128m` ile başlatırsak ne olur?", "`acme/report` uses about 300 MB of memory. What happens if we start it with `--memory 128m`?"),
        options: [l("Yavaş çalışır ama çalışır", "It runs slowly but runs"), l("137 ile öldürülür, OOMKilled=true", "It is killed with 137, OOMKilled=true"), l("Docker başlatmayı reddeder", "Docker refuses to start it")],
        answer: 1,
        why: l(
          "Bellek sınırı aşılınca çekirdek süreci SIGKILL ile öldürür (OOM killer). Exit code 137 olur ve inspect'te `OOMKilled: true` görünür.",
          "When the memory limit is exceeded, the kernel kills the process with SIGKILL (the OOM killer). The exit code is 137 and inspect shows `OOMKilled: true`.",
        ),
      },
      title: l("137 ve OOMKilled", "137 and OOMKilled"),
      body: [
        l(
          "`report` 137 ile kapandı ve terminaldeki inspect satırı `137 true` diyor: ikinci değer `OOMKilled`. Uygulama bir hata yazmadı bile; çekirdek onu dışarıdan öldürdü.",
          "`report` stopped with 137, and the inspect line in the terminal says `137 true`: the second value is `OOMKilled`. The app did not even print an error; the kernel killed it from outside.",
        ),
        l(
          "137 her zaman bellek demek değildir: `docker kill` da 137 verir. Ayırt etmek için `OOMKilled` alanına bak.",
          "137 does not always mean memory: `docker kill` gives 137 too. Look at the `OOMKilled` field to tell them apart.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' report", note: l("`137 true` ise bellek sınırı aşıldı.", "`137 true` means the memory limit was hit.") },
          { cmd: "docker stats --no-stream", note: l("Çalışanların anlık bellek ve CPU kullanımı.", "Current memory and CPU of running containers.") },
        ],
      },
    },
    {
      short: l("exec", "exec"),
      tag: "how",
      title: l("Çalışan container'ın içine gir", "Get inside a running container"),
      body: [
        l(
          "`web` çalışıyor ve içine `docker exec` ile bir komut gönderdik: `whoami`, `root` cevabını verdi. Terminalde görünüyor.",
          "`web` is running, and we sent it a command with `docker exec`: `whoami` answered `root`. It shows in the terminal.",
        ),
        l(
          "`docker exec -it web sh` ile container'ın içinde bir kabuk açarsın: dosyalara bakar, ayarları kontrol eder, başka bir servise `ping` atarsın. Sadece **çalışan** container'a girebilirsin; kapanmış olana girilmez, onun için loglar var.",
          "`docker exec -it web sh` opens a shell inside the container: look at files, check settings, `ping` another service. You can only get into a **running** container; for a stopped one you have the logs.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "İçeride elle yaptığın değişiklikler container silinince gider ve image'a geçmez. Sorunu exec ile bul, çözümü Dockerfile'a yaz.",
            "Changes you make by hand inside are lost when the container is removed and never reach the image. Find the problem with exec; put the fix in the Dockerfile.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker exec -it web sh", note: l("İçeride kabuk. Çıkmak için `exit`. Bazı image'larda `bash` de var.", "A shell inside. `exit` to leave. Some images also have `bash`.") },
          { cmd: "docker exec web env", note: l("Container'ın gördüğü ortam değişkenleri.", "The environment variables the container sees.") },
          { cmd: "docker cp web:/etc/nginx/nginx.conf .", note: l("Container'dan dosya kopyala, rahatça incele.", "Copy a file out of the container to look at it.") },
        ],
      },
    },
    {
      short: l("Port çakışması", "Port clash"),
      tag: "problem",
      predict: {
        question: l("`site` zaten `-p 8080:80` ile çalışıyor. İkinci bir nginx'i (`site2`) yine `-p 8080:80` ile başlatırsak?", "`site` already runs with `-p 8080:80`. What if we start a second nginx (`site2`) with `-p 8080:80` too?"),
        options: [
          l("İkisi 8080'i paylaşır", "They share 8080"),
          l("`site2` başlamaz: port is already allocated", "`site2` does not start: port is already allocated"),
          l("`site` kapanır, `site2` başlar", "`site` stops and `site2` starts"),
        ],
        answer: 1,
        why: l("Host'ta bir port aynı anda tek bir yere bağlanabilir. Docker container'ı oluşturur ama başlatamaz.", "A host port can be bound to one thing at a time. Docker creates the container but cannot start it."),
      },
      title: l("Bir host portu, bir sahip", "One host port, one owner"),
      body: [
        l(
          "Docker `Bind for 0.0.0.0:8080 failed: port is already allocated` dedi. `site2` oluşturuldu ama hiç başlamadı (\"oluşturuldu\" durumunda).",
          "Docker said `Bind for 0.0.0.0:8080 failed: port is already allocated`. `site2` was created but never started (\"created\").",
        ),
        l(
          "Portu bazen başka bir container değil, bilgisayarındaki başka bir program tutar: yerelde çalışan bir veritabanı ya da geliştirme sunucusu.",
          "Sometimes it is not another container holding the port but another program on your machine: a local database or a dev server.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker ps --filter publish=8080", note: l("8080'i hangi container yayınlıyor?", "Which container publishes 8080?") },
          { cmd: "lsof -i :8080", note: l("macOS/Linux: portu tutan herhangi bir program. Windows'ta `netstat -ano | findstr :8080`.", "macOS/Linux: any program holding the port. On Windows, `netstat -ano | findstr :8080`.") },
        ],
      },
    },
    {
      short: l("Başka port", "Another port"),
      tag: "how",
      title: l("Çözüm: başka bir host portu", "The fix: a different host port"),
      body: [
        l(
          "Başlayamayan `site2`'yi sildik ve `-p 8081:80` ile yeniden başlattık. Container içinde hâlâ 80'i dinliyor; değişen sadece host tarafı. `curl localhost:8081` cevap verdi.",
          "We removed the `site2` that never started and ran it again with `-p 8081:80`. Inside, it still listens on 80; only the host side changed. `curl localhost:8081` answered.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker rm site2" },
          { cmd: "docker run -d --name site2 -p 8081:80 nginx:1.27" },
        ],
      },
    },
    {
      short: l("İzin hatası", "Permission"),
      tag: "problem",
      predict: {
        question: l(
          "`acme/uploader:1.0` `USER node` ile çalışıyor ve `/app/uploads` içine yazmaya çalışıyor. Ama `/app` klasörünü root kopyaladı. Ne olur?",
          "`acme/uploader:1.0` runs as `USER node` and tries to write into `/app/uploads`. But `/app` was copied by root. What happens?",
        ),
        options: [
          l("Yazar, container'ın içinde her şey serbest", "It writes: anything goes inside a container"),
          l("EACCES ile çöker, exit code 1", "It crashes with EACCES, exit code 1"),
          l("Docker kullanıcıyı root'a çevirir", "Docker switches the user to root"),
        ],
        answer: 1,
        why: l(
          "Container'ın içi de normal bir Linux: dosya izinleri geçerli. `COPY` varsayılan olarak dosyaları root'a ait kopyalar; `node` kullanıcısı oraya yazamaz.",
          "Inside a container it is ordinary Linux: file permissions apply. `COPY` makes files owned by root by default, so the `node` user cannot write there.",
        ),
      },
      title: l("Permission denied", "Permission denied"),
      body: [
        l(
          "`uploader` loguna `EACCES: permission denied` yazıp 1 ile kapandı. Root olmayan kullanıcıyla çalıştırmak doğru bir karar (Güvenlik dersinde göreceğiz), ama klasörün sahibi de o kullanıcı olmalı.",
          "`uploader` logged `EACCES: permission denied` and stopped with 1. Running as a non-root user is the right call (see the Security lesson), but the folder must belong to that user too.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker run --rm acme/uploader:1.0 ls -ld /app", note: l("Klasörün sahibini gör.", "See who owns the folder.") }],
      },
    },
    {
      short: l("--chown", "--chown"),
      tag: "how",
      title: l("Çözüm: dosyaları doğru kullanıcıya ver", "The fix: give the files to the right user"),
      body: [
        l(
          "1.1 sürümü dosyaları `COPY --chown=node:node` ile kopyalıyor. Aynı `USER node`, ama artık `/app` onun: `uploader` çalışıyor.",
          "Version 1.1 copies files with `COPY --chown=node:node`. Same `USER node`, but now `/app` is its own: `uploader` runs.",
        ),
        l(
          "Kolay ama yanlış çözüm `--user root` ile çalıştırmak olurdu. Çalışır, ama güvenlik kazancını çöpe atar. Sorun giderirken önce sebebi bul, sonra en küçük doğru değişikliği yap.",
          "The easy but wrong fix would be `--user root`. It works, and throws the security gain away. When debugging, find the cause first, then make the smallest right change.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede programlar ve izinler basit bir modelle anlatılıyor ve SIGTERM ile durdurulan her container 0 ile kapanıyor. Gerçekte bu uygulamaya bağlı: sinyali yakalamayan bir uygulama 143 ile kapanır, 10 saniyede kapanmazsa Docker SIGKILL gönderir (137).",
            "Here programs and permissions are a simple model, and every container stopped with SIGTERM exits 0. In reality it depends on the app: one that does not handle the signal exits 143, and if it does not stop within 10 seconds Docker sends SIGKILL (137).",
          ),
        },
      ],
      practice: {
        commands: [],
        snippets: [
          {
            label: "Dockerfile",
            code: "FROM node:22-slim\nWORKDIR /app\nCOPY --chown=node:node . .\nUSER node\nCMD [\"node\", \"server.js\"]",
            note: l("`--chown` dosyaları kopyalarken sahibini de belirler.", "`--chown` sets the owner while copying."),
          },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gece nöbetinden **4 senaryo** var: 127 ile kapanan bir proxy, izin hatası veren bir yükleyici, hiç başlamamış bir site ve her seferinde 137 ile biten bir rapor. Komutları terminale **kendin yaz**; önce ipucunu bul, sonra düzelt.",
          "Your turn. Below are **4 scenarios** from a night on call: a proxy that exits with 127, an uploader with a permission error, a site that never started and a report that ends with 137 every time. **Type the commands yourself** in the terminal; find the clue first, then fix it.",
        ),
        l(
          "Sıra hep aynı: `docker ps -a` (durum ve exit code), `docker logs <ad>` (sebep), gerekirse `docker inspect`. Sahnenin altındaki panel exit code'un ne demek olduğunu yazar. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "The order is always the same: `docker ps -a` (state and exit code), `docker logs <name>` (the reason), `docker inspect` if needed. The panel under the scene says what the exit code means. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Container ana süreci kapanınca kapanır; kapananlar `docker ps -a` ile görünür.", "A container stops when its main process ends; stopped ones show with `docker ps -a`."),
    l("İlk bakılacak yer `docker logs`: kapanmış container'da da çalışır.", "Look at `docker logs` first: it works on stopped containers too."),
    l("Exit code ipucudur: 1 uygulama hatası, 127 komut yok, 137 öldürüldü (`OOMKilled` ile bellek mi diye bak), 143 SIGTERM.", "Exit codes are clues: 1 app error, 127 no such command, 137 killed (check `OOMKilled` for memory), 143 SIGTERM."),
    l("`docker exec -it <ad> sh` çalışan container'ın içine sokar; çözümü yine Dockerfile'a yaz.", "`docker exec -it <name> sh` gets you inside a running container; still put the fix in the Dockerfile."),
    l("`port is already allocated`: o host portunu başkası tutuyor; başka bir host portu seç.", "`port is already allocated`: something else holds that host port; pick another."),
    l("`EACCES` çoğu zaman klasör sahibidir: `COPY --chown` ile düzelt, root'a kaçma.", "`EACCES` is usually folder ownership: fix it with `COPY --chown`, do not fall back to root."),
  ],
  quiz: [
    {
      question: l("Bir container `Exited (137)` durumunda ve `OOMKilled` false. En olası sebep?", "A container shows `Exited (137)` and `OOMKilled` is false. The most likely reason?"),
      options: [l("Bellek sınırı aşıldı", "The memory limit was hit"), l("Biri `docker kill` ile öldürdü", "Someone killed it with `docker kill`"), l("Komut bulunamadı", "The command was not found"), l("Uygulama hatası", "An app error")],
      answer: 1,
      explain: l("137 SIGKILL demek. OOMKilled false ise bellek değil, dışarıdan bir kill (örneğin `docker kill` ya da durmayan bir stop).", "137 means SIGKILL. With OOMKilled false it was not memory but a kill from outside (such as `docker kill`, or a stop that timed out)."),
      reviewStep: 3,
    },
    {
      question: l("Kapanmış bir container'a `docker exec -it api sh` ile girmeye çalışırsan ne olur?", "What happens if you try `docker exec -it api sh` on a stopped container?"),
      options: [l("Kabuk açılır", "A shell opens"), l("Hata verir: container çalışmıyor", "It fails: the container is not running"), l("Container yeniden başlar", "The container restarts"), l("Loglar gösterilir", "The logs are shown")],
      answer: 1,
      explain: l("exec sadece çalışan container'da çalışır. Kapanmış olanın sebebi için `docker logs` kullan.", "exec only works on running containers. For a stopped one, use `docker logs`."),
      reviewStep: 4,
    },
    {
      question: l("`docker run ... myapp` → `Exited (127)`. İlk neyi kontrol edersin?", "`docker run ... myapp` → `Exited (127)`. What do you check first?"),
      options: [
        l("Bellek sınırını", "The memory limit"),
        l("CMD/ENTRYPOINT'teki komutun adını ve image'da olup olmadığını", "The command name in CMD/ENTRYPOINT and whether the image has it"),
        l("Port ayarını", "The port setting"),
        l("Volume'u", "The volume"),
      ],
      answer: 1,
      explain: l("127 \"komut bulunamadı\": yazım hatası ya da o programın image'da olmaması.", "127 is \"command not found\": a typo or a program the image does not have."),
      reviewStep: 2,
    },
    {
      question: l("Root olmayan kullanıcıyla çalışan uygulaman `EACCES` veriyor. En doğru çözüm hangisi?", "Your app running as a non-root user gets `EACCES`. Which fix is best?"),
      options: [
        l("`--user root` ile çalıştırmak", "Run it with `--user root`"),
        l("Dosyaları `COPY --chown=<kullanıcı>` ile kopyalamak", "Copy the files with `COPY --chown=<user>`"),
        l("`chmod 777 /`", "`chmod 777 /`"),
        l("`USER` satırını silmek", "Delete the `USER` line"),
      ],
      answer: 1,
      explain: l("Sorun klasörün sahibi. `--chown` doğru kullanıcıya verir ve root olmamanın getirdiği güvenliği korursun.", "The problem is who owns the folder. `--chown` gives it to the right user and keeps the safety of not running as root."),
      reviewStep: 8,
    },
  ],
};
