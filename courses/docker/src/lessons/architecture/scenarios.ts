import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, imageFor, type Host } from "../../engine/docker";
import type { DockerCtx, DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";

/** A fresh server: Docker installed, nothing pulled. */
export const SERVER: Host = createHost();

const running = (h: Host, name: string) => findContainer(h, name)?.state === "running";

/** The daemon restarted after `name` was created, and `name` runs at the end. */
function survivedRestart(ctx: DockerCtx, name: string): boolean {
  const all = ctx.events.flat();
  const born = all.findIndex((e) => e.type === "created" && e.name === name);
  const restarted = all.findIndex((e, i) => i > born && e.type === "daemonRestarted");
  return born !== -1 && restarted !== -1 && running(ctx.state, name);
}

export const scenarios: DockerScenario[] = [
  {
    id: "no-pull",
    title: l("pull'a gerek yok", "No pull needed"),
    story: l(
      "Yeni kurulmuş bir sunucudasın; hiç image yok. `web` adıyla `nginx:1.27`, `cache` adıyla `redis:7` çalışmalı. Bir arkadaşın \"önce her şeyi `docker pull` ile indirmen lazım\" diyor; sen daha kısa bir yol biliyorsun.",
      "You're on a freshly installed server with no images. `nginx:1.27` must run as `web`, and `redis:7` as `cache`. A friend says \"you have to `docker pull` everything first\"; you know a shorter way.",
    ),
    goal: l("`web` ve `cache` arka planda çalışsın, `docker pull` **hiç** kullanılmadan.", "`web` and `cache` run in the background, **without** ever using `docker pull`."),
    start: SERVER,
    hints: [
      l("CLI isteği daemon'a iletir; image makinede yoksa daemon onu registry'den kendisi indirir.", "The CLI passes the request to the daemon; if the image isn't on the machine, the daemon fetches it from the registry itself."),
      l("`docker run -d --name …` image yoksa önce indirir, sonra başlatır.", "`docker run -d --name …` pulls the image if it's missing, then starts it."),
      l("`docker run -d --name web nginx:1.27` sonra `docker run -d --name cache redis:7`", "`docker run -d --name web nginx:1.27` then `docker run -d --name cache redis:7`"),
    ],
    par: 2,
    check: (ctx) => running(ctx.state, "web") && running(ctx.state, "cache") && !ctx.actions.some((a) => a.type === "pull"),
  },
  {
    id: "full-name",
    title: l("Başka bir registry", "Another registry"),
    story: l(
      "Güvenlik ekibi, Google'ın registry'sindeki küçük Node image'ını istiyor: `gcr.io/distroless/nodejs22-debian12`. Sunucuya önceden indirilmiş olmalı ki deploy sırasında beklenmesin.",
      "The security team wants the small Node image from Google's registry: `gcr.io/distroless/nodejs22-debian12`. It must be on the server ahead of time so the deploy doesn't wait for it.",
    ),
    goal: l("`gcr.io/distroless/nodejs22-debian12` image'ı makinede olsun.", "The `gcr.io/distroless/nodejs22-debian12` image is on the machine."),
    start: SERVER,
    hints: [
      l("Bir image adının başı hangi registry'den geldiğini söyler; başı yoksa Docker Hub varsayılır.", "The start of an image name says which registry it comes from; without one, Docker Hub is assumed."),
      l("`docker pull` adı **tamamıyla**, `gcr.io/` dahil alır.", "`docker pull` takes the **whole** name, `gcr.io/` included."),
      l("`docker pull gcr.io/distroless/nodejs22-debian12`", "`docker pull gcr.io/distroless/nodejs22-debian12`"),
    ],
    par: 1,
    check: (ctx) => Boolean(imageFor(ctx.state, "gcr.io/distroless/nodejs22-debian12")),
  },
  {
    id: "survive-restart",
    title: l("Gece güncellemesi", "Nightly update"),
    story: l(
      "Sunucu her gece güncelleniyor ve Docker daemon yeniden başlıyor. Dün gece `web` kapalı kaldı ve sabaha kadar site çöktü. Bu sefer `web` kendiliğinden geri gelmeli; emin olmak için daemon'ı kendin yeniden başlatıp dene.",
      "The server updates every night and the Docker daemon restarts. Last night `web` stayed down and the site was out until morning. This time `web` must come back by itself; to be sure, restart the daemon yourself and check.",
    ),
    goal: l("`web` (nginx) çalışsın, daemon yeniden başladıktan **sonra da** kendiliğinden çalışıyor olsun.", "`web` (nginx) runs, and is running by itself **after** the daemon restarts too."),
    start: SERVER,
    hints: [
      l("Daemon yeniden başlayınca container'lar kapanır; sadece restart policy'si olanları daemon geri açar.", "When the daemon restarts, containers stop; it brings back only those with a restart policy."),
      l("`--restart unless-stopped` ile başlat, sonra `sudo systemctl restart docker` ile dene.", "Start it with `--restart unless-stopped`, then test with `sudo systemctl restart docker`."),
      l("`docker run -d --name web --restart unless-stopped nginx:1.27` sonra `sudo systemctl restart docker`", "`docker run -d --name web --restart unless-stopped nginx:1.27` then `sudo systemctl restart docker`"),
    ],
    par: 2,
    check: (ctx) => survivedRestart(ctx, "web"),
  },
  {
    id: "bring-back",
    title: l("Aynı container'ı geri getir", "Bring the same one back"),
    story: l(
      "Gece daemon yeniden başladı ve restart policy'si olmayan `web` kapandı. Onu 8080 portu ve bütün ayarlarıyla geri istiyorsun; yeniden yaratmak, ayarları tekrar yazmak demek.",
      "The daemon restarted overnight and `web`, which had no restart policy, stopped. You want it back with port 8080 and all its settings; recreating it means typing every setting again.",
    ),
    goal: l("**Aynı** `web` container'ı tekrar çalışsın.", "The **same** `web` container runs again."),
    start: hostAfter([{ type: "run", image: "nginx:1.27", detach: true, name: "web", ports: ["8080:80"] }, { type: "daemonRestart" }], SERVER),
    hints: [
      l("Kapanmış bir container silinmedikçe ayarlarıyla yerinde durur.", "A stopped container stays with its settings until it's removed."),
      l("`docker start` kapanmış bir container'ı olduğu gibi yeniden çalıştırır.", "`docker start` runs a stopped container again, as it was."),
      l("`docker start web`", "`docker start web`"),
    ],
    par: 1,
    check: (ctx) => {
      const before = findContainer(ctx.start, "web")!;
      const now = findContainer(ctx.state, "web");
      return now?.id === before.id && now.state === "running";
    },
  },
];
