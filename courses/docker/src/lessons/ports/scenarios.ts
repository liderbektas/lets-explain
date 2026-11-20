import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, type DockerAction, type Host } from "../../engine/docker";
import type { DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";

const nginx = (name: string, ports: string[]): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name, ports });

/** nginx is pulled; nothing runs. */
export const MACHINE: Host = createHost({ pulled: ["nginx:1.27"] });

/** The docs team's image: a Node app that listens on 3000 and says so with EXPOSE. */
const DOCS_BUILD: DockerAction = {
  type: "build",
  tag: "acme/docs:1.0",
  context: { "server.js": "docs" },
  dockerfile: [
    { op: "FROM", image: "node:22-slim" },
    { op: "WORKDIR", path: "/app" },
    { op: "COPY", src: ["server.js"], dest: "." },
    { op: "EXPOSE", port: 3000 },
    { op: "CMD", args: ["node", "server.js"], program: { kind: "app", listens: 3000 } },
  ],
};

/** A curl to `port` got an answer. */
const answered = (events: { type: string; port?: number; ok?: boolean }[], port: number) => events.some((e) => e.type === "curlResult" && e.port === port && e.ok);

/** `name` runs and publishes host `host` to container `inside`. */
const publishes = (h: Host, name: string, host: number, inside: number) => {
  const c = findContainer(h, name);
  return c?.state === "running" && c.ports.some((p) => p.host === host && p.container === inside);
};

export const scenarios: DockerScenario[] = [
  {
    id: "wrong-door",
    title: l("Yanlış kapı", "The wrong door"),
    story: l(
      "Takım arkadaşın `web2`'yi `-p 8081:8080` ile başlatmış. Container ayakta ama `curl localhost:8081` \"Connection reset by peer\" diyor. nginx container'ın içinde 80'i dinliyor.",
      "A teammate started `web2` with `-p 8081:8080`. The container is up, but `curl localhost:8081` says \"Connection reset by peer\". Inside the container, nginx listens on 80.",
    ),
    goal: l("`web2` `localhost:8081`'den cevap versin.", "`web2` answers on `localhost:8081`."),
    start: hostAfter([nginx("web2", ["8081:8080"])], MACHINE),
    hints: [
      l("`-p`'nin sağı container'ın içindeki port. İstek doğru container'a gidiyor ama orada kimse dinlemiyor.", "The right side of `-p` is the port inside the container. The request reaches the right container, but nobody listens there."),
      l("Çalışan bir container'ın portu değiştirilemez: sil ve sağ tarafı 80 yaparak yeniden başlat.", "A running container's ports can't be changed: remove it and start again with 80 on the right."),
      l("`docker rm -f web2` sonra `docker run -d --name web2 -p 8081:80 nginx:1.27`", "`docker rm -f web2` then `docker run -d --name web2 -p 8081:80 nginx:1.27`"),
    ],
    par: 2,
    check: (ctx) => publishes(ctx.state, "web2", 8081, 80),
  },
  {
    id: "who-holds-it",
    title: l("8080'i kim tutuyor?", "Who holds 8080?"),
    story: l(
      "Müşterilerin yer imleri `localhost:8080`'i gösteriyor, yeni `site` orada yayınlanmalı. Ama `docker run … -p 8080:80` \"port is already allocated\" diyor. Makinede birkaç container var; hangisinin 8080'i tuttuğunu bilmiyorsun. O eski deneme kapatılabilir, diğerleri çalışmaya devam etmeli.",
      "Customers' bookmarks point at `localhost:8080`, so the new `site` must be published there. But `docker run … -p 8080:80` says \"port is already allocated\". There are a few containers here and you don't know which one holds 8080. That old test can be shut down; the others must keep running.",
    ),
    goal: l("`site` `localhost:8080`'den cevap versin; 8080'i tutan eski container dursun, diğerleri çalışsın.", "`site` answers on `localhost:8080`; the old container that held 8080 is stopped, the others keep running."),
    start: hostAfter([nginx("api-docs", ["9000:80"]), nginx("blog-test", ["8080:80"]), nginx("status", ["9100:80"])], MACHINE),
    hints: [
      l("`docker ps`'in PORTS sütunu hangi container'ın hangi host portunu yayınladığını gösterir.", "The PORTS column of `docker ps` shows which container publishes which host port."),
      l("8080'i tutanı `docker stop` (ya da `rm -f`) ile bırak, sonra `site`'ı 8080 ile başlat.", "Let go of the one holding 8080 with `docker stop` (or `rm -f`), then start `site` on 8080."),
      l("`docker stop blog-test` sonra `docker run -d --name site -p 8080:80 nginx:1.27`", "`docker stop blog-test` then `docker run -d --name site -p 8080:80 nginx:1.27`"),
    ],
    par: 2,
    check: (ctx) =>
      publishes(ctx.state, "site", 8080, 80) &&
      findContainer(ctx.state, "blog-test")?.state !== "running" &&
      ["api-docs", "status"].every((n) => findContainer(ctx.state, n)?.state === "running"),
  },
  {
    id: "any-free-port",
    title: l("Boş bir port seçsin", "Any free port"),
    story: l(
      "Ortak bir test makinesindesin; herkes port çakışmasından şikayetçi. `preview` için hangi host portu olduğu önemli değil, yeter ki boş olsun. Docker seçsin, sen de hangisini seçtiğini bulup `curl` ile dene.",
      "You're on a shared test machine and everyone complains about port clashes. Which host port `preview` gets doesn't matter, as long as it's free. Let Docker pick one, then find out which and try it with `curl`.",
    ),
    goal: l("`preview` Docker'ın seçtiği bir host portundan yayınlansın ve o porta yapılan `curl` cevap alsın.", "`preview` is published on a host port Docker picked, and a `curl` to that port gets an answer."),
    start: MACHINE,
    hints: [
      l("`-p` sadece container portunu alırsa host portunu Docker seçer (32768'den yukarı).", "When `-p` gets only the container port, Docker picks the host port (32768 and up)."),
      l("`docker run -d --name preview -p 80 nginx:1.27`, sonra `docker port preview` seçilen portu söyler.", "`docker run -d --name preview -p 80 nginx:1.27`, then `docker port preview` tells you the port it picked."),
      l("`docker run -d --name preview -p 80 nginx:1.27`, `docker port preview`, sonra `curl localhost:32768`", "`docker run -d --name preview -p 80 nginx:1.27`, `docker port preview`, then `curl localhost:32768`"),
    ],
    par: 1,
    check: (ctx) => {
      const c = findContainer(ctx.state, "preview");
      const p = c?.state === "running" ? c.ports.find((x) => x.container === 80 && x.host >= 32768) : undefined;
      return Boolean(p && answered(ctx.events.flat(), p.host));
    },
  },
  {
    id: "unknown-port",
    title: l("Hangi port?", "Which port?"),
    story: l(
      "Docs ekibi `acme/docs:1.0` image'ını gönderdi ama README yok. Uygulamanın container'ın içinde hangi portu dinlediğini bilmiyorsun. Onu `docs` adıyla `localhost:8080`'den yayınlaman gerekiyor.",
      "The docs team sent the `acme/docs:1.0` image but no README. You don't know which port the app listens on inside the container. You need to publish it as `docs` on `localhost:8080`.",
    ),
    goal: l("`docs` `localhost:8080`'den **cevap versin**.", "`docs` **answers** on `localhost:8080`."),
    start: hostAfter([DOCS_BUILD], MACHINE),
    hints: [
      l("Image'ı yapan genelde portu `EXPOSE` ile yazar; `docker inspect` image'ın ayarlarını gösterir.", "Whoever builds an image usually writes the port with `EXPOSE`; `docker inspect` shows the image's settings."),
      l("`docker inspect acme/docs:1.0` içinde `ExposedPorts`'a bak; `-p 8080:<o port>` ile başlat.", "Look at `ExposedPorts` in `docker inspect acme/docs:1.0`, and start it with `-p 8080:<that port>`."),
      l("`docker inspect acme/docs:1.0` sonra `docker run -d --name docs -p 8080:3000 acme/docs:1.0`", "`docker inspect acme/docs:1.0` then `docker run -d --name docs -p 8080:3000 acme/docs:1.0`"),
    ],
    par: 1,
    check: (ctx) => publishes(ctx.state, "docs", 8080, 3000),
  },
];
