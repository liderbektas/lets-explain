import { l } from "@lets-explain/core/i18n";
import { projectSetup } from "../../engine/cli";
import { createHost, findContainer, imageFor, normalize, type DockerAction, type Host } from "../../engine/docker";
import type { DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";

export const PAGE = "/usr/share/nginx/html/index.html";

/** A machine with Docker installed and no images yet. */
export const FRESH: Host = createHost();

/** nginx is pulled; nothing runs. */
export const WITH_NGINX: Host = hostAfter([{ type: "pull", ref: "nginx:1.27" }], FRESH);

const nginx = (name: string, port: number): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name, ports: [`${port}:80`] });

/** The project folder for a small site: a Dockerfile and its page. */
const SITE_PROJECT = projectSetup({
  Dockerfile: "FROM nginx:1.27\nCOPY index.html /usr/share/nginx/html/",
  "index.html": "Benim sitem",
});

export const scenarios: DockerScenario[] = [
  {
    id: "pull-ahead",
    title: l("Yolda internet yok", "No internet on the way"),
    story: l(
      "Yarın trende çalışacaksın ve orada internet olmayacak. İş için `nginx:1.27` ve `redis:7` lazım. Şimdi indirip hazır tutmak istiyorsun; bir şey başlatmana gerek yok.",
      "Tomorrow you'll work on a train with no internet. You'll need `nginx:1.27` and `redis:7`. You want them downloaded and ready now; nothing needs to start.",
    ),
    goal: l("İki image da makinede olsun, ama **hiç container** olmasın.", "Both images are on the machine, and there are **no containers**."),
    start: FRESH,
    hints: [
      l("Image indirmek ile container başlatmak ayrı işler.", "Downloading an image and starting a container are separate things."),
      l("`docker pull` sadece image'ı indirir.", "`docker pull` only downloads the image."),
      l("`docker pull nginx:1.27` sonra `docker pull redis:7`", "`docker pull nginx:1.27` then `docker pull redis:7`"),
    ],
    par: 2,
    check: (ctx) => Boolean(imageFor(ctx.state, "nginx:1.27") && imageFor(ctx.state, "redis:7")) && Object.keys(ctx.state.containers).length === 0,
  },
  {
    id: "only-web1",
    title: l("Sadece birinde", "Only in one"),
    story: l(
      "`web1` (8080) ve `web2` (8081) aynı nginx image'ından çalışıyor. Kampanya sayfasını önce sadece `web1`'de denemek istiyorsun; `web2` eski sayfayı göstermeye devam etmeli.",
      "`web1` (8080) and `web2` (8081) run from the same nginx image. You want to try the campaign page on `web1` only; `web2` must keep showing the old page.",
    ),
    goal: l("`web1`'in sayfası (`/usr/share/nginx/html/index.html`) değişsin; `web2`'ninki aynı kalsın.", "`web1`'s page (`/usr/share/nginx/html/index.html`) changes; `web2`'s stays the same."),
    start: hostAfter([nginx("web1", 8080), nginx("web2", 8081)], WITH_NGINX),
    hints: [
      l("Her container image'ın üstünde **kendi** yazılabilir katmanını taşır.", "Each container carries its **own** writable layer on top of the image."),
      l("`docker exec web1 sh -c 'echo … > dosya'` sadece `web1`'in içine yazar.", "`docker exec web1 sh -c 'echo … > file'` writes inside `web1` only."),
      l("`docker exec web1 sh -c 'echo Kampanya > /usr/share/nginx/html/index.html'`", "`docker exec web1 sh -c 'echo Campaign > /usr/share/nginx/html/index.html'`"),
    ],
    par: 1,
    check: (ctx) => findContainer(ctx.state, "web1")?.files[PAGE] !== undefined && findContainer(ctx.state, "web2")?.files[PAGE] === undefined,
  },
  {
    id: "in-use",
    title: l("Kullanımdaki image", "An image in use"),
    story: l(
      "Disk dolmak üzere ve `nginx:1.27` artık lazım değil. `docker rmi nginx:1.27` dedin ama Docker reddetti: dün denediğin, kapanmış `web` container'ı hâlâ o image'ı kullanıyor.",
      "The disk is almost full and you don't need `nginx:1.27` any more. You typed `docker rmi nginx:1.27` but Docker refused: the stopped `web` container you tried yesterday still uses that image.",
    ),
    goal: l("`nginx:1.27` image'ı makineden tamamen gitsin.", "The `nginx:1.27` image is gone from the machine completely."),
    start: hostAfter([nginx("web", 8080), { type: "stop", container: "web" }], WITH_NGINX),
    hints: [
      l("Bir container kullandığı sürece image silinmez; kapanmış olsa bile.", "An image can't go while a container uses it, even a stopped one."),
      l("Önce container'ı `docker rm` ile sil, sonra image'ı `docker rmi` ile.", "Remove the container with `docker rm` first, then the image with `docker rmi`."),
      l("`docker rm web` sonra `docker rmi nginx:1.27`", "`docker rm web` then `docker rmi nginx:1.27`"),
    ],
    par: 2,
    check: (ctx) => !imageFor(ctx.state, "nginx:1.27") && !Object.values(ctx.state.images).some((i) => i.id === ctx.start.tags[normalize("nginx:1.27")]),
  },
  {
    id: "new-name",
    title: l("Yeni isim", "A new name"),
    story: l(
      "Ekip, test ettiği nginx'i `mysite:base` adıyla kullanmaya karar verdi. Kimse yanlışlıkla doğrudan `nginx:1.27` adını kullanmasın diye o isim makineden kalksın, ama image'ın kendisi kalmalı.",
      "The team decided to use the nginx it tested under the name `mysite:base`. So nobody uses `nginx:1.27` by mistake, that name should go from the machine, but the image itself must stay.",
    ),
    goal: l("Aynı image sadece `mysite:base` adıyla dursun; `nginx:1.27` adı olmasın.", "The same image stays, named only `mysite:base`; no `nginx:1.27` name."),
    start: WITH_NGINX,
    hints: [
      l("Bir image'ın birden fazla adı olabilir; bir adı silmek image'ı silmez, başka adı varsa.", "An image can have several names; removing one name doesn't remove the image if it has another."),
      l("Önce `docker tag` ile yeni adı ver, sonra eski adı `docker rmi` ile kaldır.", "Give it the new name with `docker tag`, then drop the old name with `docker rmi`."),
      l("`docker tag nginx:1.27 mysite:base` sonra `docker rmi nginx:1.27`", "`docker tag nginx:1.27 mysite:base` then `docker rmi nginx:1.27`"),
    ],
    par: 2,
    check: (ctx) => {
      const id = ctx.start.tags[normalize("nginx:1.27")];
      return ctx.state.tags["mysite:base"] === id && ctx.state.tags[normalize("nginx:1.27")] === undefined && Boolean(id && ctx.state.images[id]);
    },
  },
  {
    id: "own-image",
    title: l("Kendi image'ın", "Your own image"),
    story: l(
      "`~/project` içinde bir `Dockerfile` ve `index.html` var: nginx'in üstüne kendi sayfan. Bunu `mysite:1.0` adıyla paketleyip `site` adıyla 8082'den yayınlaman gerekiyor.",
      "`~/project` has a `Dockerfile` and `index.html`: your own page on top of nginx. Package it as `mysite:1.0` and publish it on 8082 as `site`.",
    ),
    goal: l("`site` container'ı `mysite:1.0`'dan çalışsın ve `localhost:8082`'den cevap versin.", "The `site` container runs from `mysite:1.0` and answers on `localhost:8082`."),
    start: hostAfter(SITE_PROJECT, WITH_NGINX),
    hints: [
      l("Önce Dockerfile'dan bir image yap, sonra o image'dan container başlat.", "First make an image from the Dockerfile, then start a container from it."),
      l("`docker build -t ad:tag .` bu klasörden image yapar; sondaki nokta klasörün kendisi.", "`docker build -t name:tag .` builds an image from this folder; the final dot is the folder itself."),
      l("`docker build -t mysite:1.0 .` sonra `docker run -d --name site -p 8082:80 mysite:1.0`", "`docker build -t mysite:1.0 .` then `docker run -d --name site -p 8082:80 mysite:1.0`"),
    ],
    par: 2,
    check: (ctx) => {
      const c = findContainer(ctx.state, "site");
      return c?.state === "running" && c.ref === "mysite:1.0" && c.ports.some((p) => p.host === 8082 && p.container === 80);
    },
  },
];
