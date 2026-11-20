import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const resourcesAndRestart: Lesson = {
  slug: "resources-and-restart",
  title: l("Kaynaklar ve restart policy", "Resources and restart policies"),
  summary: l(
    "`--memory` ve `--cpus` ile bir container'ın ne kadar kaynak kullanacağını sınırla; restart policy ile çöken servisi Docker kendisi ayağa kaldırsın.",
    "Limit what a container may use with `--memory` and `--cpus`, and let Docker bring a crashed service back with a restart policy.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bellek sınırının aşılınca OOM ile öldürmeye yol açtığını görmek", "See that going over the memory limit means an OOM kill"), step: 2 },
    { text: l("CPU sınırının öldürmediğini, yavaşlattığını bilmek", "Know that a CPU limit slows down instead of killing"), step: 4 },
    { text: l("on-failure, always ve unless-stopped farkını görmek", "See how on-failure, always and unless-stopped differ"), step: 7 },
    { text: l("`docker stats` ve `docker update` ile izleyip ayarlamak", "Watch and adjust with `docker stats` and `docker update`"), step: 8 },
  ],
  steps: [
    {
      short: l("Sınırsız", "No limits"),
      tag: "how",
      title: l("Varsayılan: sınır yok", "By default: no limits"),
      body: [
        l(
          "`docker run -d --name api acme/api:2.0` hiçbir sınır vermeden başladı. Alttaki `docker stats` satırı belleği `120MiB / sınırsız` gösteriyor.",
          "`docker run -d --name api acme/api:2.0` started with no limits. The `docker stats` row below shows memory as `120MiB / no limit`.",
        ),
        l(
          "Sınır yoksa bir container makinenin bütün belleğini ve CPU'sunu kullanabilir. Bir bellek sızıntısı yalnız kendini değil, aynı makinedeki her şeyi yavaşlatır ya da çökertir.",
          "Without limits a container may use all of the machine's memory and CPU. A memory leak then slows down or crashes everything else on the machine, not just itself.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker stats", note: l("Canlı tablo: CPU %, bellek kullanımı ve sınırı, ağ, disk.", "A live table: CPU %, memory use and limit, network, disk.") },
          { cmd: "docker stats --no-stream", note: l("Tek bir anlık görüntü.", "A single snapshot.") },
        ],
      },
    },
    {
      short: l("--memory", "--memory"),
      tag: "how",
      title: l("--memory: bellek sınırı", "--memory: a memory limit"),
      body: [
        l(
          "`api-lim` aynı image, ama `--memory 256m` ile. Tabloda `120MiB / 256MiB` yazıyor: uygulamanın rahat çalışacağı kadar yer var.",
          "`api-lim` is the same image, with `--memory 256m`. The table says `120MiB / 256MiB`: enough room for the app to run comfortably.",
        ),
        l(
          "Sınırı uygulamanın **en yoğun** anına göre seç, ortalamasına göre değil. Önce sınırsız çalıştırıp `docker stats` ile gerçek kullanımı ölç.",
          "Pick the limit for the app's **busiest** moment, not its average. Run it without a limit first and measure real use with `docker stats`.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker run -d --name api --memory 256m acme/api:2.0", note: l("Birimler: `b`, `k`, `m`, `g`.", "Units: `b`, `k`, `m`, `g`.") }],
      },
    },
    {
      short: l("Fazla dar", "Too tight"),
      tag: "experiment",
      predict: {
        question: l("Uygulama yaklaşık 120 MB kullanıyor. `--memory 64m` ile başlatırsak?", "The app uses about 120 MB. What if we start it with `--memory 64m`?"),
        options: [l("Yavaş ama çalışır", "Slow, but it runs"), l("137 ile öldürülür (OOM)", "It is killed with 137 (OOM)"), l("Docker başlatmayı reddeder", "Docker refuses to start it")],
        answer: 1,
        why: l(
          "Docker sınırı başlatırken kontrol etmez; uygulama sınırı aştığı an çekirdeğin OOM killer'ı onu SIGKILL ile öldürür.",
          "Docker does not check the limit at start; the moment the app goes over it, the kernel's OOM killer kills it with SIGKILL.",
        ),
      },
      title: l("Sınırı aşan öldürülür", "Over the limit means killed"),
      body: [
        l(
          "`api-small` başladı ve hemen `Exited (137) OOM` oldu. Uygulamaya \"yavaşla\" denmedi, durdurmak için bir sinyal de gelmedi: doğrudan öldürüldü.",
          "`api-small` started and went straight to `Exited (137) OOM`. Nobody told the app to slow down, no polite signal came: it was simply killed.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker inspect -f '{{.State.OOMKilled}}' api-small", note: l("`true` ise bellek yüzünden öldürüldü.", "`true` means it was killed for memory.") }],
      },
    },
    {
      short: l("Yük altında", "Under load"),
      tag: "experiment",
      title: l("Çalışırken de aşılabilir", "It can go over while running too"),
      body: [
        l(
          "`api-lim` 256 MB sınırla rahat çalışıyordu. Sonra 300 MB isteyen büyük bir istek geldi ve container 137 ile öldürüldü.",
          "`api-lim` was running fine with 256 MB. Then a big request needing 300 MB arrived, and the container was killed with 137.",
        ),
        l(
          "Gerçekte bu \"bazen sebepsiz kapanıyor\" diye görünür. Exit code 137 ve `OOMKilled: true` gördüğünde iki seçenek var: sınırı yükselt ya da uygulamanın en yoğun anda daha az bellek kullanmasını sağla.",
          "In real life this looks like \"it sometimes dies for no reason\". When you see exit code 137 and `OOMKilled: true` there are two choices: raise the limit, or make the app use less memory at its peak.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker events --filter event=oom", note: l("OOM olaylarını canlı izle.", "Watch OOM events live.") }],
      },
    },
    {
      short: l("--cpus", "--cpus"),
      tag: "how",
      predict: {
        question: l("`api-cpu` `--cpus 0.5` ile çalışıyor. Uygulama daha fazla CPU isterse ne olur?", "`api-cpu` runs with `--cpus 0.5`. What happens if the app wants more CPU?"),
        options: [
          l("137 ile öldürülür", "It is killed with 137"),
          l("Yavaşlar ama çalışmaya devam eder", "It slows down but keeps running"),
          l("Docker onu durdurur", "Docker stops it"),
        ],
        answer: 1,
        why: l(
          "CPU, bellek gibi \"biterse ölünen\" bir kaynak değil: çekirdek süreci sırayla bekletir (throttling). Uygulama yavaşlar ama öldürülmez.",
          "CPU is not a resource you die without, like memory: the kernel makes the process wait its turn (throttling). The app slows down but is not killed.",
        ),
      },
      title: l("--cpus: CPU payı", "--cpus: a share of CPU"),
      body: [
        l(
          "`--cpus 0.5` \"bir çekirdeğin en fazla yarısı\" demek. Tabloda CPUS sütununda 0.5 görünüyor. Bellek sınırı öldürür, CPU sınırı yavaşlatır.",
          "`--cpus 0.5` means \"at most half of one core\". The CPUS column shows 0.5. A memory limit kills; a CPU limit slows down.",
        ),
        l(
          "Aynı makinede birden fazla servis çalışıyorsa CPU sınırı, birinin yoğun anının diğerlerini boğmasını engeller.",
          "When several services share a machine, a CPU limit stops one service's busy moment from starving the others.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name api --cpus 0.5 --memory 256m acme/api:2.0" },
          { cmd: "docker stats --no-stream api", note: l("CPU % sütunu, 0.5 çekirdekte en fazla %50'ye çıkar.", "The CPU % column tops out around 50% for 0.5 cores.") },
        ],
      },
    },
    {
      short: l("Policy yok", "No policy"),
      tag: "problem",
      title: l("Varsayılan: çöken çökük kalır", "By default a crash stays a crash"),
      body: [
        l(
          "`flaky` bir kuyruğa bağlanamayıp 1 ile kapandı. Zaman geçti ama hiçbir şey olmadı: restart policy verilmediyse (`no`) Docker onu yeniden başlatmaz.",
          "`flaky` could not reach its queue and stopped with 1. Time passed and nothing happened: without a restart policy (`no`), Docker does not restart it.",
        ),
        l(
          "Gece yarısı kısa bir ağ kesintisi, sabaha kadar kapalı bir servis demek olabilir.",
          "A short network hiccup at midnight can mean a service that stays down until morning.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' flaky", note: l("Boş ya da `no`: politika yok.", "Empty or `no`: no policy.") }],
      },
    },
    {
      short: l("on-failure", "on-failure"),
      tag: "experiment",
      predict: {
        question: l(
          "`flaky2` `--restart on-failure` ile, `backup` da aynı ayarla çalışıyor. flaky2 1 ile, backup 0 ile kapanıyor. Biraz zaman geçince?",
          "`flaky2` and `backup` both run with `--restart on-failure`. flaky2 exits with 1, backup with 0. After a while?",
        ),
        options: [
          l("İkisi de yeniden başlatılır", "Both are restarted"),
          l("Sadece flaky2 yeniden başlatılır", "Only flaky2 is restarted"),
          l("Hiçbiri, elle başlatmak gerekir", "Neither; you have to start them by hand"),
        ],
        answer: 1,
        why: l("`on-failure` sadece sıfırdan farklı exit code'da devreye girer. 0, \"işim bitti\" demek; yeniden başlatmaya gerek yok.", "`on-failure` only acts on a non-zero exit code. 0 means \"I am done\": no restart needed."),
      },
      title: l("on-failure: sadece hata olunca", "on-failure: only on errors"),
      body: [
        l(
          "`flaky2` her kapanışında yeniden başlatıldı: tabloda RESTARTS 3. `backup` işini 0 ile bitirdi ve öyle kaldı. Bu, tek seferlik işler için tam istenen davranış.",
          "`flaky2` was restarted each time it stopped: RESTARTS is 3 in the table. `backup` finished with 0 and stayed that way. Exactly what you want for one-off jobs.",
        ),
        l(
          "`--restart on-failure:5` en fazla 5 deneme der. Docker denemeler arasında bekleme süresini katlayarak artırır (100 ms'den başlar), böylece sürekli çöken bir servis makineyi meşgul etmez.",
          "`--restart on-failure:5` allows at most 5 tries. Docker doubles the wait between tries (starting at 100 ms), so a service that keeps crashing does not keep the machine busy.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name worker --restart on-failure:5 acme/flaky:1.0" },
          { cmd: "docker inspect -f '{{.RestartCount}}' worker", note: l("Kaç kez yeniden başlatıldı.", "How many times it was restarted.") },
        ],
      },
    },
    {
      short: l("always / unless-stopped", "always / unless-stopped"),
      tag: "experiment",
      predict: {
        question: l(
          "`web-a` `always`, `web-b` `unless-stopped` ile çalışıyor. İkisini de elle durdurduk. Docker daemon yeniden başlayınca hangisi geri gelir?",
          "`web-a` runs with `always`, `web-b` with `unless-stopped`. We stopped both by hand. When the Docker daemon restarts, which one comes back?",
        ),
        options: [l("İkisi de", "Both"), l("Sadece web-a", "Only web-a"), l("Hiçbiri", "Neither")],
        answer: 1,
        why: l(
          "`always` elle durdurulsa bile daemon yeniden başlayınca geri gelir. `unless-stopped` ise \"ben durdurduysam durdurulmuş kalsın\" der.",
          "`always` comes back on a daemon restart even after a manual stop. `unless-stopped` says \"if I stopped it, keep it stopped\".",
        ),
      },
      title: l("always ve unless-stopped", "always and unless-stopped"),
      body: [
        l(
          "İkisi de çökünce yeniden başlar. Fark, sen durdurduğunda ortaya çıkıyor: makine ya da Docker yeniden başlayınca `web-a` (always) geri geldi, `web-b` (unless-stopped) kapalı kaldı.",
          "Both restart after a crash. The difference shows when you stop them: after Docker or the machine restarts, `web-a` (always) came back and `web-b` (unless-stopped) stayed down.",
        ),
        l(
          "Uzun süre çalışan servisler için çoğu zaman `unless-stopped` iyi bir varsayılan: çökünce ve makine açılınca gelir, bakım için durdurduğunda durur.",
          "For long-running services `unless-stopped` is usually a good default: it comes back after crashes and reboots, and stays down when you stop it for maintenance.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker run -d --name web --restart unless-stopped -p 8080:80 nginx:1.27" }],
      },
    },
    {
      short: l("docker update", "docker update"),
      tag: "reality",
      title: l("Çalışan container'ı ayarlamak", "Adjusting a running container"),
      body: [
        l(
          "Port gibi çoğu ayar için container'ı yeniden yaratman gerekir, ama kaynak sınırları ve restart policy istisna: `docker update` ile çalışan bir container'da değiştirilebilir. Bu sahnede `docker update` modellenmedi.",
          "Most settings, like ports, need a new container, but resource limits and the restart policy are exceptions: `docker update` changes them on a running container. `docker update` is not modelled on this stage.",
        ),
        l(
          "Compose'da aynı ayarlar servis tanımına yazılır; böylece kimse komut satırını hatırlamak zorunda kalmaz.",
          "In Compose the same settings go into the service definition, so nobody has to remember the command line.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede bellek kullanımı sabit sayılarla ve zaman adım adım modelleniyor. Gerçekte kullanım sürekli değişir; swap açıksa `--memory` verildiğinde container varsayılan olarak bir o kadar swap da kullanabilir (`--memory-swap` ile ayarlanır).",
            "Here memory use is fixed numbers and time moves in steps. In reality use changes all the time; with swap enabled, a container given `--memory` may by default use as much again in swap (set with `--memory-swap`).",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker update --memory 512m --memory-swap 512m api", note: l("Bellek sınırını çalışırken değiştir.", "Change the memory limit while it runs.") },
          { cmd: "docker update --cpus 1 api" },
          { cmd: "docker update --restart unless-stopped api", note: l("Restart policy'yi sonradan ekle.", "Add a restart policy afterwards.") },
        ],
        snippets: [
          {
            label: "compose.yaml",
            code: "services:\n  api:\n    image: acme/api:2.0\n    restart: unless-stopped\n    deploy:\n      resources:\n        limits:\n          cpus: \"0.5\"\n          memory: 256M",
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
          "Sıra sende. Aşağıda gerçek işten **4 senaryo** var: bellek yüzünden 137 ile kapanan bir API, çöktükçe kendini toparlayan bir worker, sonsuza kadar tekrar başlayan bir yedek ve bakımda kalması gereken bir site. Komutları terminale **kendin yaz**; alttaki tablo bellek kullanımını ve sınırları gösterir.",
          "Your turn. Below are **4 scenarios** from real work: an API that exits with 137 for memory, a worker that recovers when it crashes, a backup that restarts forever and a site that must stay down for maintenance. **Type the commands yourself** in the terminal; the table underneath shows memory use and limits.",
        ),
        l(
          "`docker ps -a` exit code'u, `docker stats --no-stream` belleği gösterir; `sleep 3` zamanı ilerletir, böylece restart'ları görürsün. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "`docker ps -a` shows exit codes, `docker stats --no-stream` shows memory, and `sleep 3` moves time forward so you see restarts. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Varsayılan olarak bir container makinenin bütün belleğini ve CPU'sunu kullanabilir.", "By default a container may use all of the machine's memory and CPU."),
    l("`--memory` aşılırsa container 137 ile OOM-kill olur: bazen hemen, bazen yoğun bir anda.", "Going over `--memory` means an OOM kill with 137: sometimes at once, sometimes at a busy moment."),
    l("`--cpus` öldürmez, yavaşlatır; servislerin birbirini boğmasını engeller.", "`--cpus` slows down instead of killing; it stops services starving each other."),
    l("`on-failure` sadece hatada yeniden başlatır; `always` elle durdurulsa da daemon açılınca gelir; `unless-stopped` elle durdurulduysa gelmez.", "`on-failure` restarts only on errors; `always` comes back on daemon start even after a manual stop; `unless-stopped` does not if you stopped it."),
    l("`docker stats` ile ölç, `docker update` ile sınırları ve policy'yi çalışırken değiştir.", "Measure with `docker stats`; change limits and policy on a running container with `docker update`."),
  ],
  quiz: [
    {
      question: l("Bir servis yoğun saatlerde arada bir `Exited (137)` oluyor ve `OOMKilled: true`. Ne yaparsın?", "A service sometimes ends up `Exited (137)` at busy hours, with `OOMKilled: true`. What do you do?"),
      options: [
        l("`--cpus` değerini artırırım", "Raise `--cpus`"),
        l("Gerçek en yüksek kullanımı ölçüp bellek sınırını ona göre ayarlarım ya da kullanımı düşürürüm", "Measure the real peak and set the memory limit to fit, or lower the use"),
        l("Restart policy'yi kaldırırım", "Remove the restart policy"),
        l("Port'u değiştiririm", "Change the port"),
      ],
      answer: 1,
      explain: l("137 + OOMKilled bellek demek. Sınır en yoğun ana yetmiyor; ya sınırı ya kullanımı değiştir.", "137 with OOMKilled means memory. The limit does not cover the peak; change the limit or the use."),
      reviewStep: 3,
    },
    {
      question: l("`--restart on-failure` ile çalışan bir yedekleme işi 0 ile bitti. Docker ne yapar?", "A backup job running with `--restart on-failure` exits with 0. What does Docker do?"),
      options: [l("Hemen yeniden başlatır", "Restarts it at once"), l("Hiçbir şey: 0 başarı demek", "Nothing: 0 means success"), l("Container'ı siler", "Removes the container"), l("5 kez dener", "Tries 5 times")],
      answer: 1,
      explain: l("on-failure sadece sıfırdan farklı exit code'da devreye girer.", "on-failure only acts on a non-zero exit code."),
      reviewStep: 6,
    },
    {
      question: l("Bakım için bir servisi elle durdurdun ve makine yeniden başladı. Servisin kapalı kalmasını istiyorsan hangi policy?", "You stopped a service by hand for maintenance and the machine rebooted. Which policy keeps it down?"),
      options: [l("`always`", "`always`"), l("`unless-stopped`", "`unless-stopped`"), l("`on-failure`", "`on-failure`"), l("Hiçbiri kapalı tutmaz", "None keep it down")],
      answer: 1,
      explain: l("unless-stopped elle durdurulanı durdurulmuş bırakır; always ise daemon açılınca yeniden başlatır.", "unless-stopped leaves a manually stopped container stopped; always restarts it when the daemon starts."),
      reviewStep: 7,
    },
    {
      question: l("CPU sınırı (`--cpus 0.5`) olan bir container daha fazla CPU isterse ne olur?", "What happens when a container limited with `--cpus 0.5` wants more CPU?"),
      options: [l("OOM-kill olur", "It is OOM-killed"), l("Yavaşlar (throttle edilir)", "It slows down (throttled)"), l("Durdurulur", "It is stopped"), l("Sınır yok sayılır", "The limit is ignored")],
      answer: 1,
      explain: l("CPU sınırı süreci bekletir ama öldürmez; öldüren bellek sınırıdır.", "A CPU limit makes the process wait but does not kill it; it is the memory limit that kills."),
      reviewStep: 4,
    },
  ],
};
