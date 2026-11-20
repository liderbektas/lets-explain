import { l } from "@lets-explain/core/i18n";
import { projectSetup } from "../../engine/cli";
import { createHost, findContainer, normalize, type Host } from "../../engine/docker";
import type { DockerCtx, DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";
import { API_BUILD } from "./model";

/** The laptop: nginx and the team's API image are here, nothing runs; ~/project has the API's .env. */
export const LAPTOP: Host = hostAfter([API_BUILD, { type: "pull", ref: "nginx:1.27" }, ...projectSetup({ ".env": "DATABASE_URL=postgres://db/shop" })], createHost());

/** A running nginx container publishing `host` → 80. */
const servesOn = (h: Host, host: number, name?: string) =>
  Object.values(h.containers).some(
    (c) => c.state === "running" && c.ref === normalize("nginx:1.27") && (!name || c.name === name) && c.ports.some((p) => p.host === host && p.container === 80),
  );

/** A hello-world container ran to the end (with --rm it is created and gone within one command). */
const ranHello = (ctx: DockerCtx) => {
  const all = ctx.events.flat();
  const names = new Set(all.flatMap((e) => (e.type === "created" && e.ref === normalize("hello-world") ? [e.name] : [])));
  return all.some((e) => e.type === "exited" && e.code === 0 && names.has(e.name));
};

export const scenarios: DockerScenario[] = [
  {
    id: "preview",
    title: l("Önizleme", "Preview"),
    story: l(
      "Tasarımcı arkadaşın nginx'in sayfasını kendi tarayıcısında görmek istiyor. Makinede `nginx:1.27` image'ı hazır ama hiçbir şey çalışmıyor, terminalin de serbest kalmalı.",
      "Your designer friend wants to see nginx's page in their browser. The `nginx:1.27` image is on the machine but nothing runs, and your terminal should stay free.",
    ),
    goal: l("nginx arka planda çalışsın ve `localhost:8080`'den cevap versin.", "nginx runs in the background and answers on `localhost:8080`."),
    start: LAPTOP,
    hints: [
      l("Container'ın portu kendiliğinden bilgisayarına açılmaz; arka planda çalışması için de bir seçenek gerekir.", "A container's port isn't opened on your machine by itself, and running in the background takes an option too."),
      l("`-d` arka plana alır, `-p bilgisayar:container` portu açar. nginx container'ın içinde 80'i dinler.", "`-d` runs it in the background, `-p machine:container` opens the port. Inside the container nginx listens on 80."),
      l("`docker run -d -p 8080:80 nginx:1.27`", "`docker run -d -p 8080:80 nginx:1.27`"),
    ],
    par: 1,
    check: (ctx) => servesOn(ctx.state, 8080),
  },
  {
    id: "forgot-port",
    title: l("Port unutuldu", "Forgot the port"),
    story: l(
      "Sabah `web` adıyla bir nginx başlattın ama `-p` vermeyi unuttun: çalışıyor, ama kimse ulaşamıyor. Ekipteki herkes onu `web` adıyla tanıyor.",
      "This morning you started nginx as `web` but forgot `-p`: it runs, but nobody can reach it. Everyone on the team knows it as `web`.",
    ),
    goal: l("Yine `web` adlı bir container `localhost:8080`'den cevap versin.", "A container still named `web` answers on `localhost:8080`."),
    start: hostAfter([{ type: "run", image: "nginx:1.27", detach: true, name: "web" }], LAPTOP),
    hints: [
      l("Çalışan bir container'a sonradan port eklenemez; ve bir ad aynı anda iki container'da olamaz.", "You can't add a port to a running container, and two containers can't share a name."),
      l("Eskisini `docker rm -f` ile kaldır, sonra aynı adla doğru seçeneklerle yeniden başlat.", "Remove the old one with `docker rm -f`, then start it again under the same name with the right options."),
      l("`docker rm -f web` sonra `docker run -d --name web -p 8080:80 nginx:1.27`", "`docker rm -f web` then `docker run -d --name web -p 8080:80 nginx:1.27`"),
    ],
    par: 2,
    check: (ctx) => servesOn(ctx.state, 8080, "web"),
  },
  {
    id: "api-down",
    title: l("API kapanıyor", "The API keeps stopping"),
    story: l(
      "Ekibin API'sini `api` adıyla başlattın ama `docker ps`'te görünmüyor. Ayarlar `~/project/.env` dosyasında duruyor.",
      "You started the team's API as `api`, but it doesn't show in `docker ps`. The settings are in `~/project/.env`.",
    ),
    goal: l("`api` adlı container `DATABASE_URL` ayarıyla **çalışır** halde olsun.", "The container named `api` is **running**, with its `DATABASE_URL` set."),
    start: hostAfter([{ type: "run", image: "acme/api:1.0", detach: true, name: "api" }], LAPTOP),
    hints: [
      l("Önce neden kapandığına bak: `docker ps -a` kapanmış container'ları da gösterir, `docker logs api` sebebini söyler.", "First see why it stopped: `docker ps -a` shows stopped containers too, and `docker logs api` tells you why."),
      l("Ayar sonradan eklenmez. Kapanmış container ismini tutmaya devam eder: önce sil, sonra `-e` (ya da `--env-file`) ile yeniden başlat.", "A setting can't be added afterwards. A stopped container still holds its name: remove it, then start again with `-e` (or `--env-file`)."),
      l("`docker rm api` sonra `docker run -d --name api -e DATABASE_URL=postgres://db/shop acme/api:1.0`", "`docker rm api` then `docker run -d --name api -e DATABASE_URL=postgres://db/shop acme/api:1.0`"),
    ],
    par: 2,
    check: (ctx) => {
      const api = findContainer(ctx.state, "api");
      return api?.state === "running" && Boolean(api.env.DATABASE_URL);
    },
  },
  {
    id: "no-leftovers",
    title: l("İz bırakma", "Leave no trace"),
    story: l(
      "Yeni bir makineye Docker kurdun ve çalıştığını `hello-world` ile denemek istiyorsun. Ama `docker ps -a` listesinde kapanmış deneme container'ları birikmesinden bıktın.",
      "You installed Docker on a new machine and want to check it with `hello-world`. But you're tired of finished test containers piling up in `docker ps -a`.",
    ),
    goal: l("`hello-world` çalışıp bitsin ve geride hiçbir container kalmasın.", "`hello-world` runs to the end and leaves no container behind."),
    start: LAPTOP,
    hints: [
      l("Bir container işi bitince kapanır ama silinmez; silmesini başlatırken isteyebilirsin.", "A container stops when its work is done but isn't removed; you can ask for that when you start it."),
      l("`--rm` seçeneği container bitince onu siler.", "The `--rm` option removes the container when it ends."),
      l("`docker run --rm hello-world`", "`docker run --rm hello-world`"),
    ],
    par: 1,
    check: (ctx) => ranHello(ctx) && !Object.values(ctx.state.containers).some((c) => c.ref === normalize("hello-world")),
  },
  {
    id: "port-taken",
    title: l("Port dolu", "Port taken"),
    story: l(
      "Takım arkadaşın bu makinede `demo` adlı bir nginx'i 8080'de çalıştırıyor ve müşteriye gösteriyor; ona dokunmamalısın. Senin de kendi `web` container'ını açman gerekiyor.",
      "A teammate runs an nginx called `demo` on 8080 on this machine and is showing it to a client; don't touch it. You need your own `web` container up as well.",
    ),
    goal: l("`web` `localhost:8081`'den cevap versin; `demo` 8080'de çalışmaya devam etsin.", "`web` answers on `localhost:8081`; `demo` keeps running on 8080."),
    start: hostAfter([{ type: "run", image: "nginx:1.27", detach: true, name: "demo", ports: ["8080:80"] }], LAPTOP),
    hints: [
      l("Bilgisayarındaki bir port aynı anda tek bir container'a verilebilir. Container'ın içindeki port ise herkesinkinden bağımsız.", "A port on your machine can go to only one container at a time. The port inside each container is its own."),
      l("`-p`'nin solu senin bilgisayarının portu: oraya boş bir port yaz, sağı yine 80.", "The left side of `-p` is your machine's port: put a free one there; the right side is still 80."),
      l("`docker run -d --name web -p 8081:80 nginx:1.27`", "`docker run -d --name web -p 8081:80 nginx:1.27`"),
    ],
    par: 1,
    check: (ctx) => servesOn(ctx.state, 8081, "web") && servesOn(ctx.state, 8080, "demo"),
  },
];
