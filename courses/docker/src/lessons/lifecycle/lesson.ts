import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { narration } from "./narration";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const STATE = "docker inspect --format '{{.State.Status}} {{.State.ExitCode}}' web";

export const lifecycle: Lesson = {
  slug: "lifecycle",
  title: l("Container yaşam döngüsü", "The container lifecycle"),
  summary: l(
    "Bir container oluşturulur, çalışır, durur ve silinir. Her geçişte neyin kaldığını, neyin gittiğini gör.",
    "A container is created, runs, stops and is removed. See what stays and what goes at each step.",
  ),
  minutes: 12,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  narration,
  objectives: [
    { text: l("Dört hali tanımak: created, running, exited, silindi", "Know the four states: created, running, exited, removed"), step: 0 },
    { text: l("Durdurmanın dosyaları silmediğini görmek", "See that stopping does not delete files"), step: 3 },
    { text: l("Çalışan container'ın neden doğrudan silinemediğini anlamak", "Understand why a running container cannot simply be removed"), step: 4 },
    { text: l("`stop` ile `kill` farkını bilmek", "Know the difference between `stop` and `kill`"), step: 7 },
  ],
  steps: [
    {
      short: l("created", "created"),
      tag: "how",
      title: l("Oluşturuldu ama çalışmıyor", "Created, but not running"),
      body: [
        l(
          "`docker create --name web nginx:1.27` bir [[container]] hazırladı ama başlatmadı. Sahnede beyaz duruyor, ışığı sönük; alttaki şeritte \"created\" yanıyor.",
          "`docker create --name web nginx:1.27` prepared a [[container]] but did not start it. It stands white on stage with its lamp off; the strip below lights \"created\".",
        ),
        l(
          "Bir container'ın dört hali var: **created** (hazır), **running** (çalışıyor), **exited** (durdu) ve **silindi**. Komutlar onu bu hallerin arasında taşır.",
          "A container has four states: **created**, **running**, **exited** and **removed**. Commands move it between them.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker create --name web nginx:1.27", note: l("Ayarlarıyla birlikte hazırlar, başlatmaz.", "Prepares it with its settings but does not start it.") },
          { cmd: "docker ps -a --filter status=created", note: l("Sadece oluşturulmuş, hiç başlamamış container'lar.", "Only containers that were created and never started.") },
        ],
      },
    },
    {
      short: l("start", "start"),
      tag: "how",
      title: l("start: çalışmaya başla", "start: begin running"),
      body: [
        l(
          "`docker start web` container'ın ana sürecini başlattı: nginx çalışıyor, ışık yeşil, şeritte \"running\" yanıyor.",
          "`docker start web` started the container's main process: nginx is running, the lamp is green, the strip lights \"running\".",
        ),
        l(
          "Önceki derste kullandığın `docker run`, aslında `docker create` ile `docker start`'ın tek komutta birleşmiş hali.",
          "The `docker run` you used before is just `docker create` and `docker start` in one command.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker start web" },
          { cmd: "docker ps", note: l("Çalışan container'lar listesinde artık web var.", "web now shows in the list of running containers.") },
        ],
      },
    },
    {
      short: l("stop", "stop"),
      tag: "how",
      predict: {
        question: l("Container'ın içine bir not yazdık ve şimdi `docker stop web` çalıştıracağız. Container'a ne olur?", "We wrote a note inside the container and will now run `docker stop web`. What happens to the container?"),
        options: [
          l("Silinir, notla birlikte", "It is removed, note and all"),
          l("Durur ama diskte kalır; `docker ps -a` ile görünür", "It stops but stays on disk; `docker ps -a` still shows it"),
          l("Bellekte duraklatılır", "It is paused in memory"),
        ],
        answer: 1,
        why: l(
          "`stop` ana süreci kapatır, container'ı silmez. Container \"exited\" haline geçer ve kendi dosyalarıyla birlikte diskte bekler.",
          "`stop` ends the main process but does not remove the container. It moves to \"exited\" and waits on disk with its files.",
        ),
      },
      title: l("stop: durdu ama yerinde", "stop: stopped, but still there"),
      body: [
        l(
          "Önce container'ın içine `/notes.txt` yazdık, sonra `docker stop web` ile durdurduk. Container gri: \"exited (0)\". 0, nginx'in kendisine gelen kapanma isteğine uyup temiz kapandığını söylüyor.",
          "First we wrote `/notes.txt` inside the container, then stopped it with `docker stop web`. It is grey: \"exited (0)\". 0 says nginx obeyed the shutdown request and closed cleanly.",
        ),
        l(
          "`docker ps` artık onu göstermez, `docker ps -a` gösterir. Sayaçlara bak: ps 0, ps -a 1.",
          "`docker ps` no longer shows it; `docker ps -a` does. Look at the counters: ps 0, ps -a 1.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker exec web sh -c 'echo alışveriş listesi > /notes.txt'", note: l("Çalışan container'ın içinde bir komut çalıştırır.", "Runs a command inside the running container.") },
          { cmd: "docker stop web" },
          { cmd: STATE, note: l("Container'ın durumu ve çıkış kodu.", "The container's state and exit code.") },
        ],
      },
    },
    {
      short: l("Yeniden start", "Start again"),
      tag: "experiment",
      predict: {
        question: l("Durdurduğumuz `web`'i yeniden başlatıp `/notes.txt`'yi okuyacağız. Ne çıkar?", "We will start the stopped `web` again and read `/notes.txt`. What comes out?"),
        options: [l("Not hâlâ orada", "The note is still there"), l("Dosya yok: durdurmak her şeyi sıfırlar", "No file: stopping resets everything"), l("Container başlamaz", "The container does not start")],
        answer: 0,
        why: l(
          "Aynı container yeniden başladı, yeni bir container değil. Kendi yazılabilir katmanı (writable layer) container silinene kadar durur.",
          "The same container started again, not a new one. Its own writable layer lasts until the container is removed.",
        ),
      },
      title: l("Aynı container, aynı dosyalar", "Same container, same files"),
      body: [
        l(
          "`docker start web` aynı container'ı yeniden çalıştırdı ve `cat /notes.txt` notu getirdi. Durdurmak, bilgisayarı kapatıp açmak gibi: masaüstündeki dosyalar yerinde.",
          "`docker start web` ran the same container again and `cat /notes.txt` returned the note. Stopping is like turning a computer off and on: the files on the desktop are still there.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "Bu \"kalıcılık\" sadece container yaşadıkça geçerli. Önemli veriyi container'ın kendi katmanında tutma; Veri ve ağ bölümünde volume'ları göreceğiz.",
            "This \"persistence\" only lasts as long as the container. Do not keep important data in the container's own layer; the Data and networking chapter covers volumes.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker start web" },
          { cmd: "docker exec web cat /notes.txt" },
        ],
      },
    },
    {
      short: l("rm", "rm"),
      tag: "experiment",
      predict: {
        question: l("`web` çalışırken `docker rm web` çalıştıracağız. Ne olur?", "We will run `docker rm web` while `web` is running. What happens?"),
        options: [
          l("Silinir", "It is removed"),
          l("Docker reddeder: önce durdur ya da -f kullan", "Docker refuses: stop it first or use -f"),
          l("Önce durdurur, sonra siler", "It stops it, then removes it"),
        ],
        answer: 1,
        why: l(
          "Docker çalışan bir container'ı kazara silmeni engeller. Ya önce `docker stop`, ya da bilerek `docker rm -f` gerekir.",
          "Docker protects you from removing a running container by accident. Either `docker stop` first, or `docker rm -f` on purpose.",
        ),
      },
      title: l("rm: silmeden önce durdur", "rm: stop before you remove"),
      body: [
        l(
          "İlk `docker rm web` reddedildi: `cannot remove container \"web\": container is running`. Durdurup tekrar denedik; bu sefer silindi ve şeritte \"silindi\" yanıyor.",
          "The first `docker rm web` was refused: `cannot remove container \"web\": container is running`. We stopped it and tried again; this time it was removed, and the strip lights \"removed\".",
        ),
        l(
          "Silinen container geri gelmez: kendi katmanı ve içindeki not da gitti.",
          "A removed container does not come back: its own layer and the note in it are gone.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker stop web && docker rm web" },
          { cmd: "docker rm -f web", note: l("Tek adımda durdurup siler. Bilerek kullan.", "Stops and removes in one step. Use it on purpose.") },
        ],
      },
    },
    {
      short: l("Yeni container", "New container"),
      tag: "how",
      predict: {
        question: l("Aynı adla (`web`) yeni bir container başlatıp `/notes.txt`'yi okuyacağız. Not orada mı?", "We will start a new container with the same name (`web`) and read `/notes.txt`. Is the note there?"),
        options: [l("Evet, isim aynı", "Yes, the name is the same"), l("Hayır: bu tamamen yeni bir container", "No: this is a brand new container"), l("Sadece -v ile", "Only with -v")],
        answer: 1,
        why: l(
          "İsim sadece bir etiket. Yeni container image'ın temiz bir kopyasıyla başlar; eskisinin katmanı silindiğinde not da gitti.",
          "A name is just a label. The new container starts from a clean copy of the image; the old one's layer, and the note, went with it.",
        ),
      },
      title: l("Aynı isim, yepyeni container", "Same name, brand new container"),
      body: [
        l(
          "`docker run -d --name web nginx:1.27` yeni bir container başlattı. `cat /notes.txt`: `No such file or directory`. Her container image'ın temiz bir kopyasıyla doğar.",
          "`docker run -d --name web nginx:1.27` started a new container. `cat /notes.txt`: `No such file or directory`. Every container is born from a clean copy of its image.",
        ),
        l(
          "Bu bir kusur değil, özellik: container'ı silip yeniden yaratmak, \"bilinen temiz hale dönmek\" demek.",
          "This is a feature, not a flaw: removing and recreating a container means \"back to a known clean state\".",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name web nginx:1.27" },
          { cmd: "docker exec web cat /notes.txt", note: l("Yeni container'da dosya yok.", "The new container has no such file.") },
        ],
      },
    },
    {
      short: l("Kendi biten", "Ends by itself"),
      tag: "how",
      title: l("İşi bitince kendiliğinden kapanan container", "A container that stops when its job is done"),
      body: [
        l(
          "`hello-world` dört hali çok hızlı geçti: oluşturuldu, çalıştı, mesajını yazdı ve kendiliğinden \"exited (0)\" oldu. Kimse `stop` demedi.",
          "`hello-world` raced through: created, running, printed its message and went \"exited (0)\" on its own. Nobody said `stop`.",
        ),
        l(
          "Kural basit: **container, ana süreci yaşadıkça yaşar.** Sunucu (nginx) sonsuza kadar çalışır; bir script işini bitirince çıkar ve container da kapanır.",
          "The rule is simple: **a container lives as long as its main process.** A server (nginx) runs forever; a script exits when done, and the container stops with it.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run --name hello hello-world" },
          { cmd: "docker ps -a --filter name=hello", note: l("Durum: Exited (0).", "Status: Exited (0).") },
        ],
      },
    },
    {
      short: l("kill", "kill"),
      tag: "how",
      title: l("stop ile kill farkı", "stop versus kill"),
      body: [
        l(
          "`docker stop` önce ana sürece SIGTERM gönderir: \"toparlan ve kapan\". Süreç 10 saniye içinde kapanmazsa SIGKILL ile zorla öldürür. nginx SIGTERM'e uyduğu için kod 0'dı.",
          "`docker stop` first sends the main process SIGTERM: \"tidy up and exit\". If it does not exit within 10 seconds, SIGKILL forces it. nginx obeys SIGTERM, so the code was 0.",
        ),
        l(
          "`docker kill web` doğrudan SIGKILL gönderdi: süreç hiçbir şeyi toparlayamadan öldü. Çıkış kodu **137** (128 + 9, yani SIGKILL). Açık dosyalar ve yarım işler yarım kalır.",
          "`docker kill web` sent SIGKILL straight away: the process died without tidying anything. The exit code is **137** (128 + 9, SIGKILL). Open files and half-done work stay half done.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Exit code 137 gördüğünde iki şüpheli var: biri `docker kill` dedi ya da container bellek sınırını aştı (OOM). `docker inspect` içindeki `OOMKilled` alanı hangisi olduğunu söyler.",
            "When you see exit code 137 there are two suspects: someone ran `docker kill`, or the container went over its memory limit (OOM). The `OOMKilled` field in `docker inspect` tells you which.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker stop -t 30 web", note: l("Kapanmak için 10 yerine 30 saniye tanır.", "Allows 30 seconds instead of 10 to shut down.") },
          { cmd: "docker kill web", note: l("Beklemeden SIGKILL. Son çare.", "SIGKILL without waiting. Last resort.") },
          { cmd: "docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}}' web" },
        ],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Diğer geçişler", "Other transitions"),
      body: [
        l(
          "`docker restart` = stop + start. `docker pause` süreçleri yerinde dondurur (\"paused\" hali) ve `docker unpause` çözer; bu sahnede pause modellenmedi.",
          "`docker restart` is stop + start. `docker pause` freezes the processes in place (a \"paused\" state) and `docker unpause` thaws them; pause is not modelled here.",
        ),
        l(
          "Kapanmış container'lar sen silene kadar yer kaplar. Tek seferlik işler için `--rm` kullan; birikenleri sonraki derste `docker container prune` ile temizleyeceğiz.",
          "Exited containers take up space until you remove them. Use `--rm` for one-off jobs; the next lesson cleans up leftovers with `docker container prune`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede `stop` her zaman 0 ile biter ve süre beklenmez. Gerçekte uygulaman SIGTERM'i yakalamıyorsa `docker stop` 10 saniye bekler ve 137 görürsün. Bunu CMD ve ENTRYPOINT dersinde açacağız.",
            "Here `stop` always ends with 0 and nothing waits. In reality, if your app ignores SIGTERM, `docker stop` waits 10 seconds and you see 137. The CMD and ENTRYPOINT lesson explains why.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker restart web" },
          { cmd: "docker pause web && docker unpause web" },
          { cmd: "docker ps -a --filter status=exited", note: l("Kapanmış container'ları listeler.", "Lists exited containers.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **4 senaryo** var: bir container'ı önceden hazırlamak, bakım için durdurup geri açmak, kibarca kapatıp silmek ve kapanmışları temizlemek. Komutları terminale **kendin yaz**; alttaki şerit `web`'in hangi halde olduğunu gösterir.",
          "Your turn. Below are **4 scenarios** from real work: preparing a container ahead of time, stopping and restarting it for maintenance, closing and removing it gently, and clearing out stopped ones. **Type the commands yourself** in the terminal; the strip shows which state `web` is in.",
        ),
        l(
          "`docker ps -a` her container'ın STATUS'unu gösterir: Created, Up, Exited. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "`docker ps -a` shows every container's STATUS: Created, Up, Exited. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Container'ın dört hali var: created, running, exited ve silindi.", "A container has four states: created, running, exited and removed."),
    l("`docker run` = `docker create` + `docker start`.", "`docker run` is `docker create` plus `docker start`."),
    l("`stop` container'ı silmez; yeniden başlatınca kendi dosyaları yerinde durur.", "`stop` does not remove a container; started again, its files are still there."),
    l("Çalışan container `rm` ile silinmez: önce `stop`, ya da bilerek `rm -f`. Silinen container'ın dosyaları gider.", "A running container cannot be `rm`ed: `stop` first, or `rm -f` on purpose. A removed container's files are gone."),
    l("Container, ana süreci yaşadıkça yaşar; işi biten script container'ı da kapatır.", "A container lives as long as its main process; a script that finishes stops the container."),
    l("`stop` önce SIGTERM, 10 saniye sonra SIGKILL gönderir; `kill` hemen SIGKILL gönderir (exit 137).", "`stop` sends SIGTERM, then SIGKILL after 10 seconds; `kill` sends SIGKILL at once (exit 137)."),
  ],
  quiz: [
    {
      question: l("`docker stop web` sonra `docker start web`. Container'ın içine daha önce yazdığın dosya?", "`docker stop web` then `docker start web`. The file you wrote inside before?"),
      options: [l("Gitti", "Gone"), l("Duruyor", "Still there"), l("Sadece -v ile durur", "Only kept with -v"), l("Boşaldı", "Emptied")],
      answer: 1,
      explain: l("Aynı container yeniden başladı; kendi katmanı silinmedi.", "The same container started again; its layer was never removed."),
      reviewStep: 3,
    },
    {
      question: l("`docker rm web` şu hatayı verdi: \"container is running\". En temiz çözüm?", "`docker rm web` said \"container is running\". The cleanest fix?"),
      options: [
        l("`docker stop web` sonra `docker rm web`", "`docker stop web`, then `docker rm web`"),
        l("Docker'ı yeniden başlatmak", "Restart Docker"),
        l("`docker rmi web`", "`docker rmi web`"),
        l("Bilgisayarı yeniden başlatmak", "Reboot the machine"),
      ],
      answer: 0,
      explain: l("Önce temizce durdur, sonra sil. `rm -f` de olur ama süreci SIGKILL ile öldürür.", "Stop it cleanly, then remove it. `rm -f` also works but kills the process with SIGKILL."),
      reviewStep: 4,
    },
    {
      question: l("Bir container başlıyor ve hemen \"Exited (0)\" oluyor. En olası sebep?", "A container starts and goes \"Exited (0)\" at once. Most likely reason?"),
      options: [
        l("Bellek yetmedi", "It ran out of memory"),
        l("Ana süreci işini bitirdi ve çıktı", "Its main process finished its job and exited"),
        l("Port çakıştı", "A port clashed"),
        l("Image bozuk", "The image is broken"),
      ],
      answer: 1,
      explain: l("0 başarı demek. Container ana süreci kadar yaşar: bir script bitince container da kapanır.", "0 means success. A container lives as long as its main process; when a script finishes, the container stops."),
      reviewStep: 6,
    },
    {
      question: l("Exit code 137 ne anlama gelir?", "What does exit code 137 mean?"),
      options: [
        l("Komut bulunamadı", "Command not found"),
        l("Süreç SIGKILL ile öldürüldü (kill ya da bellek sınırı)", "The process was killed with SIGKILL (kill or memory limit)"),
        l("Uygulama hata verdi", "The app reported an error"),
        l("Temiz kapandı", "It exited cleanly"),
      ],
      answer: 1,
      explain: l("137 = 128 + 9 (SIGKILL). `docker kill` ya da OOM; `docker inspect` içindeki OOMKilled hangisi olduğunu söyler.", "137 = 128 + 9 (SIGKILL): `docker kill` or OOM. OOMKilled in `docker inspect` tells which."),
      reviewStep: 7,
    },
  ],
};
