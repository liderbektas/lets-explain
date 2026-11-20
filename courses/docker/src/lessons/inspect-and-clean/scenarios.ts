import { l } from "@lets-explain/core/i18n";
import { findContainer, imageFor, type Host } from "../../engine/docker";
import type { DockerScenario } from "../shared/DockerScene";
import { dangling } from "../../engine/format";
import { hostAfter } from "../shared/missionHelpers";
import { START } from "./model";

const containerNames = (h: Host) => Object.values(h.containers).map((c) => c.name).sort();
const tagged = (h: Host) => Object.keys(h.tags).sort();

export const scenarios: DockerScenario[] = [
  {
    id: "make-room",
    title: l("Yer aç", "Make room"),
    story: l(
      "Disk %95 dolu ve deploy yer bulamıyor. Bu makinede tek gerçekten lazım olan çalışan `web` ve onun image'ı. Kapanmış container'lar, kullanılmayan image'lar (etiketli olsalar bile) gidebilir.",
      "The disk is 95% full and the deploy can't find room. The only thing really needed on this machine is the running `web` and its image. Stopped containers and unused images (even tagged ones) can go.",
    ),
    goal: l("Sadece çalışan `web` ve `nginx:1.27` kalsın.", "Only the running `web` and `nginx:1.27` are left."),
    start: START,
    hints: [
      l("`docker system prune` kapanmışları ve sahipsiz image'ları siler; kullanılmayan **etiketli** image'lar için bir seçenek daha gerekir.", "`docker system prune` removes stopped containers and dangling images; unused **tagged** images take one more option."),
      l("`-a` kullanılmayan bütün image'ları da alır; `-f` onay sorusunu atlar.", "`-a` takes every unused image too; `-f` skips the confirmation."),
      l("`docker system prune -a -f`", "`docker system prune -a -f`"),
    ],
    par: 1,
    check: (ctx) =>
      containerNames(ctx.state).join() === "web" &&
      findContainer(ctx.state, "web")?.state === "running" &&
      Object.keys(ctx.state.images).length === 1 &&
      Boolean(imageFor(ctx.state, "nginx:1.27")),
  },
  {
    id: "dangling-only",
    title: l("Sadece sahipsizler", "Only the dangling ones"),
    story: l(
      "`acme/site:dev`'i yeniden build edince eski sürüm `<none>` adıyla ortada kaldı. Sadece bu sahipsiz image'lar gitsin. Kapanmış `broken` container'ına dokunma: ekip dünkü hatanın loglarına bakacak.",
      "Rebuilding `acme/site:dev` left the old version lying around as `<none>`. Only these dangling images should go. Don't touch the stopped `broken` container: the team will read yesterday's error in its logs.",
    ),
    goal: l("Sahipsiz (`<none>`) image kalmasın; container'lar ve etiketli image'lar olduğu gibi dursun.", "No dangling (`<none>`) images are left; containers and tagged images stay as they are."),
    start: START,
    hints: [
      l("`docker images`'ta `<none>` görünen image'lar sahipsiz. `system prune` kapanmış container'ları da siler; daha dar bir komut var.", "Images shown as `<none>` in `docker images` are dangling. `system prune` also removes stopped containers; there is a narrower command."),
      l("`docker image prune` sadece image'lara bakar; `-a` vermezsen sadece sahipsizleri siler.", "`docker image prune` looks at images only; without `-a` it removes just the dangling ones."),
      l("`docker image prune -f`", "`docker image prune -f`"),
    ],
    par: 1,
    check: (ctx) =>
      dangling(ctx.state).length === 0 && containerNames(ctx.state).join() === containerNames(ctx.start).join() && tagged(ctx.state).join() === tagged(ctx.start).join(),
  },
  {
    id: "move-out",
    title: l("Taşınma", "Moving out"),
    story: l(
      "`web` başka bir sunucuya taşındı. Bu makinede ne `web` ne de `nginx:1.27` image'ı kalsın. `docker rmi nginx:1.27` denedin ama reddetti.",
      "`web` has moved to another server. Neither `web` nor the `nginx:1.27` image should stay on this machine. You tried `docker rmi nginx:1.27`, but it refused.",
    ),
    goal: l("`web` ve `nginx:1.27` makineden gitsin; diğer her şey kalsın.", "`web` and `nginx:1.27` are gone from the machine; everything else stays."),
    start: START,
    hints: [
      l("Bir image, onu kullanan container durdukça silinmez; `web` hâlâ çalışıyor.", "An image can't go while a container uses it; `web` is still running."),
      l("Önce `docker rm -f web`, sonra `docker rmi nginx:1.27`.", "`docker rm -f web` first, then `docker rmi nginx:1.27`."),
      l("`docker rm -f web` sonra `docker rmi nginx:1.27`", "`docker rm -f web` then `docker rmi nginx:1.27`"),
    ],
    par: 2,
    check: (ctx) =>
      !findContainer(ctx.state, "web") &&
      !imageFor(ctx.state, "nginx:1.27") &&
      containerNames(ctx.state).join() === "broken,hello" &&
      Object.keys(ctx.state.images).length === Object.keys(ctx.start.images).length - 1,
  },
  {
    id: "prune-trap",
    title: l("Temizlik tuzağı", "The cleanup trap"),
    story: l(
      "`web` bakım için birkaç dakikalığına durduruldu. Bu sırada kapanmış `hello` ve `broken`'ı temizlemek için `docker system prune -f` çalıştırmak istiyorsun. Ama prune durmuş **her** container'ı siler.",
      "`web` was stopped for a few minutes of maintenance. Meanwhile you want to run `docker system prune -f` to clear out the stopped `hello` and `broken`. But prune removes **every** stopped container.",
    ),
    goal: l("`hello` ve `broken` gitsin; `web` kalsın ve çalışsın.", "`hello` and `broken` are gone; `web` stays and runs."),
    start: hostAfter([{ type: "stop", container: "web" }], START),
    hints: [
      l("Prune çalışan container'lara dokunmaz.", "Prune doesn't touch running containers."),
      l("Önce `web`'i `docker start` ile başlat; sonra prune (ya da kapanmışları adlarıyla `docker rm`).", "Start `web` first with `docker start`; then prune (or `docker rm` the stopped ones by name)."),
      l("`docker start web` sonra `docker system prune -f`", "`docker start web` then `docker system prune -f`"),
    ],
    par: 2,
    check: (ctx) => containerNames(ctx.state).join() === "web" && findContainer(ctx.state, "web")?.id === findContainer(ctx.start, "web")!.id && findContainer(ctx.state, "web")?.state === "running",
  },
];
