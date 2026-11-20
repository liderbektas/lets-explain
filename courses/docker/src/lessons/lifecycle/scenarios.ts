import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, type DockerAction, type Host } from "../../engine/docker";
import type { DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";

export const NOTE = "/notes.txt";

/** The lesson's machine: nginx and hello-world are pulled, nothing exists yet. */
export const MACHINE: Host = hostAfter([{ type: "pull", ref: "nginx:1.27" }, { type: "pull", ref: "hello-world" }], createHost());

const web: DockerAction = { type: "run", image: "nginx:1.27", detach: true, name: "web", ports: ["8080:80"] };

/** `web` runs and holds a note the team needs. */
const WEB_WITH_NOTE = hostAfter([web, { type: "write", container: "web", path: NOTE, content: "alışveriş listesi" }], MACHINE);

export const scenarios: DockerScenario[] = [
  {
    id: "ready-not-running",
    title: l("Hazır ama kapalı", "Ready, not running"),
    story: l(
      "Yeni sitenin açılışı birazdan. `web` container'ını bütün ayarlarıyla (8080 portu) **şimdiden hazırlamak** istiyorsun ki açılışta tek komut yetsin. Sonra açılış saati geliyor ve onu başlatıyorsun.",
      "The new site launches soon. You want the `web` container **prepared now** with all its settings (port 8080), so launch takes a single command. Then launch time comes and you start it.",
    ),
    goal: l("`web` önce **oluşturulmuş ama çalışmayan** halde dursun, sonra başlasın ve 8080'de çalışsın.", "`web` first sits **created but not running**, then starts and runs on 8080."),
    start: MACHINE,
    hints: [
      l("`docker run` iki işi birden yapar: container'ı oluşturur ve başlatır. Bunlar ayrı ayrı da yapılabilir.", "`docker run` does two things at once: creates the container and starts it. They can be done separately."),
      l("`docker create` ayarlarıyla hazırlar ama başlatmaz; `docker start` başlatır.", "`docker create` prepares it with its settings but doesn't start it; `docker start` starts it."),
      l("`docker create --name web -p 8080:80 nginx:1.27` sonra `docker start web`", "`docker create --name web -p 8080:80 nginx:1.27` then `docker start web`"),
    ],
    par: 2,
    check: (ctx) => {
      const c = findContainer(ctx.state, "web");
      return ctx.actions.some((a) => a.type === "create") && c?.state === "running" && c.ports.some((p) => p.host === 8080 && p.container === 80);
    },
  },
  {
    id: "maintenance",
    title: l("Bakım arası", "Maintenance break"),
    story: l(
      "`web`'in içinde ekibin ihtiyaç duyduğu bir `/notes.txt` var. Sunucu bakımı için `web`'i bir süre **durdurman**, sonra geri açman gerekiyor. Not kaybolmamalı.",
      "`web` holds a `/notes.txt` the team needs. For server maintenance you must **stop** `web` for a while, then bring it back. The note must not be lost.",
    ),
    goal: l("`web` bir kez dursun, sonra **aynı** container tekrar çalışsın ve `/notes.txt` içinde olsun.", "`web` stops once, then the **same** container runs again with `/notes.txt` still inside."),
    start: WEB_WITH_NOTE,
    hints: [
      l("Durmuş bir container dosyalarını korur; silinmiş olanı korumaz.", "A stopped container keeps its files; a removed one doesn't."),
      l("`docker stop` durdurur, `docker start` aynı container'ı geri açar.", "`docker stop` stops it, and `docker start` brings the same container back."),
      l("`docker stop web` sonra `docker start web`", "`docker stop web` then `docker start web`"),
    ],
    par: 2,
    check: (ctx) => {
      const before = findContainer(ctx.start, "web")!;
      const now = findContainer(ctx.state, "web");
      const stopped = ctx.events.flat().some((e) => e.type === "exited" && e.name === "web" && e.reason === "stopped");
      return stopped && now?.id === before.id && now.state === "running" && now.files[NOTE] !== undefined;
    },
  },
  {
    id: "gentle-goodbye",
    title: l("Kibarca kapat", "Close it gently"),
    story: l(
      "`web` artık gereksiz, silinecek. `docker rm web` \"container is running\" diye reddetti. Ekibin kuralı: nginx açık bağlantılarını düzgünce kapatabilsin diye container önce **normal yoldan durdurulur**, sonra silinir; `-f` ile anında öldürmek yok.",
      "`web` isn't needed any more and should go. `docker rm web` refused with \"container is running\". The team's rule: so nginx can close open connections properly, a container is **stopped the normal way** first, then removed; no killing it on the spot with `-f`.",
    ),
    goal: l("`web` önce **durdurulsun**, sonra silinsin.", "`web` is **stopped** first, then removed."),
    start: hostAfter([web], MACHINE),
    hints: [
      l("Çalışan bir container silinmez. `rm -f` onu beklemeden öldürür; `stop` ise kapanması için ona zaman tanır.", "A running container can't be removed. `rm -f` kills it without waiting; `stop` gives it time to shut down."),
      l("Önce `docker stop`, sonra `docker rm`.", "`docker stop` first, then `docker rm`."),
      l("`docker stop web` sonra `docker rm web`", "`docker stop web` then `docker rm web`"),
    ],
    par: 2,
    check: (ctx) => !findContainer(ctx.state, "web") && ctx.events.flat().some((e) => e.type === "exited" && e.name === "web" && e.reason === "stopped"),
  },
  {
    id: "tidy-list",
    title: l("Listeyi temizle", "Tidy the list"),
    story: l(
      "`docker ps -a` kalabalık: kurulumu denediğin `hello` ve geçen haftadan kalma `old-web` kapanmış halde duruyor. Çalışan `web`'e dokunulmamalı.",
      "`docker ps -a` is crowded: `hello`, from when you tested the install, and `old-web`, from last week, sit there stopped. The running `web` must not be touched.",
    ),
    goal: l("Kapanmış container'lar gitsin; `web` çalışmaya devam etsin.", "The stopped containers go; `web` keeps running."),
    start: hostAfter(
      [{ type: "run", image: "hello-world", name: "hello" }, { type: "run", image: "nginx:1.27", detach: true, name: "old-web" }, { type: "stop", container: "old-web" }, web],
      MACHINE,
    ),
    hints: [
      l("Önce `docker ps -a` ile hangilerinin kapanmış olduğuna bak.", "First see which ones are stopped with `docker ps -a`."),
      l("Kapanmışları tek tek `docker rm` ile ya da hepsini birden `docker container prune -f` ile silebilirsin.", "Remove the stopped ones one by one with `docker rm`, or all at once with `docker container prune -f`."),
      l("`docker container prune -f`", "`docker container prune -f`"),
    ],
    par: 1,
    check: (ctx) => {
      const all = Object.values(ctx.state.containers);
      const w = findContainer(ctx.state, "web");
      return all.length === 1 && w?.state === "running" && w.id === findContainer(ctx.start, "web")!.id;
    },
  },
];
