import { l } from "@lets-explain/core/i18n";
import { projectSetup } from "../../engine/cli";
import { createHost, findContainer, type DockerAction, type Host } from "../../engine/docker";
import type { DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";

/** nginx, postgres and alpine are pulled; nothing runs, no volumes. */
export const MACHINE: Host = createHost({ pulled: ["nginx:1.27", "postgres:17", "alpine:3.20"] });

const app = (volumes?: string[]): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name: "app", ...(volumes ? { volumes } : {}) });
const db = (volumes?: string[]): DockerAction => ({ type: "run", image: "postgres:17", detach: true, name: "db", env: { POSTGRES_PASSWORD: "secret" }, ...(volumes ? { volumes } : {}) });

export const scenarios: DockerScenario[] = [
  {
    id: "upgrade-app",
    title: l("Notlar kalsın", "Keep the notes"),
    story: l(
      "`app` notlarını `/data` içindeki `notes-data` volume'una yazıyor. Yeni sürüm için container'ı silip yeniden yaratman gerekiyor. Notlar kaybolmamalı.",
      "`app` writes its notes to the `notes-data` volume at `/data`. For the new version you must remove the container and create it again. The notes must not be lost.",
    ),
    goal: l("**Yeni** bir `app` container'ı çalışsın ve `/data/notes.txt` içinde olsun.", "A **new** `app` container runs, with `/data/notes.txt` inside."),
    start: hostAfter([app(["notes-data:/data"]), { type: "write", container: "app", path: "/data/notes.txt", content: "ilk not" }], MACHINE),
    hints: [
      l("Container silinince kendi katmanı gider; volume ise kalır. Yeni container'a aynı volume'u takarsan veri oradadır.", "When a container goes, its own layer goes; the volume stays. Attach the same volume to the new container and the data is there."),
      l("Yeniden başlatırken `-v notes-data:/data`'yı unutma.", "Don't forget `-v notes-data:/data` when you start it again."),
      l("`docker rm -f app` sonra `docker run -d --name app -v notes-data:/data nginx:1.27`", "`docker rm -f app` then `docker run -d --name app -v notes-data:/data nginx:1.27`"),
    ],
    par: 2,
    check: (ctx) => {
      const c = findContainer(ctx.state, "app");
      const old = findContainer(ctx.start, "app")!;
      const vol = c?.mounts.find((m) => m.target === "/data" && m.type === "volume");
      return Boolean(c && c.id !== old.id && c.state === "running" && vol && ctx.state.volumes[vol.source]?.files["notes.txt"]);
    },
  },
  {
    id: "db-upgrade",
    title: l("Veritabanı yükseltmesi", "Database upgrade"),
    story: l(
      "Projeye bir postgres lazım ve container'lar sık sık yeniden yaratılıyor. Geçen sefer `db`'yi silip yeniden başlatınca bütün tablolar gitti. Bu sefer veriyi bir **adlı** volume'da tut ve dene: `db`'yi silip yeniden başlattığında eski veriyi bulmalı.",
      "The project needs a postgres, and containers get recreated often. Last time, removing and restarting `db` lost every table. This time keep the data in a **named** volume and test it: when you remove and restart `db`, it must find the old data.",
    ),
    goal: l("`db` silinip yeniden başlatıldıktan sonra loglarında **\"existing data found\"** yazsın.", "After `db` is removed and started again, its logs say **\"existing data found\"**."),
    start: MACHINE,
    hints: [
      l("postgres verisini `/var/lib/postgresql/data` içinde tutar. Oraya bir adlı volume takılmazsa her yeni container boş başlar.", "postgres keeps its data in `/var/lib/postgresql/data`. Without a named volume there, every new container starts empty."),
      l("`-v pgdata:/var/lib/postgresql/data` ile başlat, `docker rm -f db`, sonra aynı komutla yeniden başlat.", "Start it with `-v pgdata:/var/lib/postgresql/data`, `docker rm -f db`, then start it again with the same command."),
      l(
        "`docker run -d --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:17`, `docker rm -f db`, sonra aynı `docker run`",
        "`docker run -d --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:17`, `docker rm -f db`, then the same `docker run`",
      ),
    ],
    par: 3,
    check: (ctx) => {
      const c = findContainer(ctx.state, "db");
      const removed = ctx.events.flat().some((e) => e.type === "removed" && e.name === "db");
      return Boolean(c && c.state === "running" && removed && c.logs.some((x) => x.includes("existing data found")));
    },
  },
  {
    id: "live-site",
    title: l("Kaydet, yenile", "Save and refresh"),
    story: l(
      "Sitenin sayfası `~/project/site/index.html`. Her değişiklikte image yeniden yapmak istemiyorsun: nginx bu klasörü doğrudan göstersin, sen dosyayı değiştirince `curl` hemen yenisini görsün.",
      "The site's page is `~/project/site/index.html`. You don't want to rebuild an image for every change: nginx should serve this folder directly, so when you change the file `curl` sees the new one right away.",
    ),
    goal: l("`web` 8080'de bu klasörü göstersin; sayfayı değiştir ve `curl localhost:8080` **yeni** içeriği getirsin.", "`web` serves this folder on 8080; change the page and `curl localhost:8080` returns the **new** content."),
    start: hostAfter(projectSetup({ "site/index.html": "Merhaba v1" }), MACHINE),
    hints: [
      l("Bind mount bilgisayarındaki bir klasörü container'ın içine bağlar; iki taraf da aynı dosyaları görür.", "A bind mount puts a folder from your machine inside the container; both sides see the same files."),
      l("`-v ./site:/usr/share/nginx/html` ile başlat; sonra dosyayı `echo … > site/index.html` ile değiştir.", "Start it with `-v ./site:/usr/share/nginx/html`; then change the file with `echo … > site/index.html`."),
      l(
        "`docker run -d --name web -p 8080:80 -v ./site:/usr/share/nginx/html nginx:1.27`, `echo 'Merhaba v2' > site/index.html`, `curl localhost:8080`",
        "`docker run -d --name web -p 8080:80 -v ./site:/usr/share/nginx/html nginx:1.27`, `echo 'Hello v2' > site/index.html`, `curl localhost:8080`",
      ),
    ],
    par: 2,
    check: (ctx) => {
      const page = ctx.state.hostFiles["/home/ada/project/site/index.html"];
      if (page === undefined || page === "Merhaba v1") return false;
      return ctx.events.flat().some((e) => e.type === "curlResult" && e.port === 8080 && e.ok && e.body === page);
    },
  },
  {
    id: "volume-in-use",
    title: l("Volume silinmiyor", "Volume won't go"),
    story: l(
      "Dünkü testten kalma `scratch` volume'u artık gereksiz. `docker volume rm scratch` \"volume is in use\" dedi: testi çalıştıran, işi bitmiş `tester` container'ı hâlâ duruyor.",
      "The `scratch` volume from yesterday's test isn't needed any more. `docker volume rm scratch` said \"volume is in use\": the finished `tester` container that ran the test is still there.",
    ),
    goal: l("`scratch` volume'u silinsin.", "The `scratch` volume is removed."),
    start: hostAfter([{ type: "volumeCreate", name: "scratch" }, { type: "run", image: "alpine:3.20", name: "tester", volumes: ["scratch:/work"], cmd: ["echo", "test bitti"] }], MACHINE),
    hints: [
      l("Bir volume, onu kullanan container durmuş olsa bile silinmez.", "A volume can't be removed while a container uses it, even a stopped one."),
      l("Önce `docker rm tester`, sonra `docker volume rm scratch`.", "`docker rm tester` first, then `docker volume rm scratch`."),
      l("`docker rm tester` sonra `docker volume rm scratch`", "`docker rm tester` then `docker volume rm scratch`"),
    ],
    par: 2,
    check: (ctx) => ctx.state.volumes.scratch === undefined,
  },
  {
    id: "anonymous-pile",
    title: l("İsimsiz volume yığını", "A pile of nameless volumes"),
    story: l(
      "Geçen hafta postgres'i birkaç kez `-v` vermeden denedin; `docker volume ls` rastgele adlı volume'larla dolu ve disk yer kaplıyor. Ama ekibin gerçek verisi `pgdata` adlı volume'da; ona dokunulmamalı.",
      "Last week you tried postgres a few times without `-v`; `docker volume ls` is full of random-named volumes taking disk. But the team's real data lives in the volume called `pgdata`; it must not be touched.",
    ),
    goal: l("İsimsiz (anonim) volume'lar gitsin, `pgdata` kalsın.", "The nameless (anonymous) volumes go; `pgdata` stays."),
    start: hostAfter(
      [db(), { type: "rm", container: "db", force: true }, db(), { type: "rm", container: "db", force: true }, { type: "volumeCreate", name: "pgdata" }],
      MACHINE,
    ),
    hints: [
      l("`docker volume prune` kullanılmayan volume'ları siler; `-a` verilmezse sadece isimsiz olanları.", "`docker volume prune` removes unused volumes; without `-a`, only the nameless ones."),
      l("Onay sorusunu atlamak için `-f`. `-a` ekleme: o `pgdata`'yı da siler.", "`-f` skips the confirmation. Don't add `-a`: that removes `pgdata` too."),
      l("`docker volume prune -f`", "`docker volume prune -f`"),
    ],
    par: 1,
    check: (ctx) => Object.values(ctx.state.volumes).every((v) => !v.anonymous) && ctx.state.volumes.pgdata !== undefined,
  },
];

