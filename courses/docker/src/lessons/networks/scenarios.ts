import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, type DockerAction, type DockerEvent, type Host } from "../../engine/docker";
import type { DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";

const run = (name: string, image: string, extra: Partial<Extract<DockerAction, { type: "run" }>> = {}): DockerAction => ({ type: "run", image, detach: true, name, ...extra });

/** nginx, redis and alpine are pulled. */
const PULLED: Host = createHost({ pulled: ["nginx:1.27", "redis:7", "alpine:3.20"] });

/** `web` and `cache` run on the default bridge, so they cannot find each other by name. */
export const BRIDGE: Host = hostAfter([run("web", "nginx:1.27"), run("cache", "redis:7"), { type: "tick" }], PULLED);

/** A `shop` network with `web` and `cache` on it. */
const SHOP: Host = hostAfter([{ type: "networkCreate", name: "shop" }, run("web", "nginx:1.27", { network: "shop" }), run("cache", "redis:7", { network: "shop" }), { type: "tick" }], PULLED);

const userNets = (h: Host, name: string) => (findContainer(h, name)?.networks ?? []).filter((n) => !h.networks[n]?.builtin);
const share = (h: Host, a: string, b: string) => userNets(h, a).some((n) => userNets(h, b).includes(n));

/** A command run in `from` reached `target` by name. */
const reached = (events: DockerEvent[], from: string, target: string) =>
  events.some((e) => e.type === "execOutput" && e.name === from && e.cmd.includes(target) && e.code === 0);

export const scenarios: DockerScenario[] = [
  {
    id: "by-name",
    title: l("İsimle bul", "Find it by name"),
    story: l(
      "`web`'in ayarlarında redis'in adresi `cache` olarak yazılı, ama `web` onu bulamıyor: `ping cache` \"bad address\" diyor. İkisi de varsayılan `bridge` ağında çalışıyor.",
      "`web`'s settings give redis's address as `cache`, but `web` can't find it: `ping cache` says \"bad address\". Both run on the default `bridge` network.",
    ),
    goal: l("`web`'in içinden `ping cache` **başarılı** olsun.", "`ping cache` from inside `web` **succeeds**."),
    start: BRIDGE,
    hints: [
      l("Varsayılan bridge'de isimle bulma yok; kendi oluşturduğun bir ağda Docker isimleri çözer.", "The default bridge has no name lookup; on a network you create, Docker resolves names."),
      l("`docker network create`, sonra iki container'ı da `docker network connect` ile bağla.", "`docker network create`, then attach both containers with `docker network connect`."),
      l("`docker network create shop`, `docker network connect shop web`, `docker network connect shop cache`, `docker exec web ping cache`", "`docker network create shop`, `docker network connect shop web`, `docker network connect shop cache`, `docker exec web ping cache`"),
    ],
    par: 4,
    check: (ctx) => reached(ctx.events.flat(), "web", "cache"),
  },
  {
    id: "worker-only",
    title: l("Sadece worker", "Only the worker"),
    story: l(
      "`cache` oturum bilgilerini tutuyor. Yeni bir arka plan işi, `worker` (nginx), ona ismiyle ulaşabilmeli. Güvenlik ekibi ise `web`'in `cache`'e **ulaşamamasını** istiyor.",
      "`cache` holds session data. A new background job, `worker` (nginx), must reach it by name. The security team wants `web` to **not** reach `cache`.",
    ),
    goal: l("`worker` ve `cache` aynı ağda olsun; `web` `cache`'le hiçbir ağı paylaşmasın.", "`worker` and `cache` share a network; `web` shares no network with `cache`."),
    start: BRIDGE,
    hints: [
      l("Bir ağ, içindekileri birbirine açar; dışındakiler isimle bulamaz.", "A network opens its members to each other; those outside can't find them by name."),
      l("Yeni bir ağ yarat, `cache`'i bağla, `worker`'ı baştan o ağda `--network` ile başlat. `web`'e dokunma.", "Create a new network, attach `cache`, and start `worker` on it from the beginning with `--network`. Leave `web` alone."),
      l("`docker network create jobs`, `docker network connect jobs cache`, `docker run -d --name worker --network jobs nginx:1.27`", "`docker network create jobs`, `docker network connect jobs cache`, `docker run -d --name worker --network jobs nginx:1.27`"),
    ],
    par: 3,
    check: (ctx) => findContainer(ctx.state, "worker")?.state === "running" && share(ctx.state, "worker", "cache") && !share(ctx.state, "web", "cache"),
  },
  {
    id: "private-api",
    title: l("İçeride kalsın", "Keep it inside"),
    story: l(
      "Yeni bir iç servis, `api` (nginx), yayına çıkacak. Sadece `shop` ağındaki `web` ona ulaşmalı; makinenin dışına **hiç port açılmamalı**. Çalıştığını `web`'in içinden dene.",
      "A new internal service, `api` (nginx), is going live. Only `web` on the `shop` network should reach it; **no port** may be opened to the outside. Try it from inside `web`.",
    ),
    goal: l("`api` `shop` ağında, yayınlanmış portu olmadan çalışsın; `web`'in içinden `curl http://api` cevap alsın.", "`api` runs on `shop` with no published port; `curl http://api` from inside `web` gets an answer."),
    start: SHOP,
    hints: [
      l("Aynı ağdaki container'lar birbirine doğrudan ulaşır; `-p` sadece makinenin dışından gelenler için.", "Containers on the same network reach each other directly; `-p` is only for what comes from outside the machine."),
      l("`--network shop` ile, `-p` olmadan başlat; sonra `docker exec web curl http://api`.", "Start it with `--network shop` and no `-p`; then `docker exec web curl http://api`."),
      l("`docker run -d --name api --network shop nginx:1.27` sonra `docker exec web curl http://api`", "`docker run -d --name api --network shop nginx:1.27` then `docker exec web curl http://api`"),
    ],
    par: 2,
    check: (ctx) => {
      const api = findContainer(ctx.state, "api");
      return api?.state === "running" && api.ports.length === 0 && api.networks.includes("shop") && reached(ctx.events.flat(), "web", "api");
    },
  },
  {
    id: "quick-check",
    title: l("Hızlı kontrol", "A quick check"),
    story: l(
      "`shop` ağındaki `cache`'in ismiyle bulunabildiğinden emin olmak istiyorsun, ama `web`'e de `cache`'e de dokunmadan. Ağa geçici bir container sok, kontrol et ve arkanda hiçbir şey bırakma.",
      "You want to be sure `cache` on the `shop` network can be found by name, without touching `web` or `cache`. Put a throwaway container on the network, check, and leave nothing behind.",
    ),
    goal: l("Geçici bir container `shop`'tan `cache`'e ping atsın ve sonra **kendiliğinden silinsin**.", "A throwaway container pings `cache` from `shop` and is then **removed by itself**."),
    start: SHOP,
    hints: [
      l("`alpine:3.20` küçük bir image ve içinde `ping` var; `--rm` bitince container'ı siler.", "`alpine:3.20` is a small image with `ping`; `--rm` removes the container when it ends."),
      l("`docker run --rm --network shop alpine:3.20 ping …`", "`docker run --rm --network shop alpine:3.20 ping …`"),
      l("`docker run --rm --network shop alpine:3.20 ping -c 1 cache`", "`docker run --rm --network shop alpine:3.20 ping -c 1 cache`"),
    ],
    par: 1,
    check: (ctx) => {
      const names = new Set(Object.values(ctx.state.containers).map((c) => c.name));
      return ctx.events.flat().some((e) => e.type === "log" && e.line.startsWith("PING cache") && !names.has(e.name) && !Object.values(ctx.start.containers).some((c) => c.name === e.name));
    },
  },
];
