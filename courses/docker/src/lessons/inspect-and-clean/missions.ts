import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { findContainer } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

export const missions: Mission<DockerCtx>[] = [
  {
    id: "make-room",
    title: l("Yer aç", "Make room"),
    goal: l(
      "Makinede sadece çalışan `web` ve onun image'ı (`nginx:1.27`) kalsın: başka container da, image da olmasın.",
      "Leave only the running `web` and its image (`nginx:1.27`): no other containers and no other images.",
    ),
    hint: l("Düz `prune` etiketli image'lara dokunmaz.", "Plain `prune` leaves tagged images alone."),
    par: 1,
    check: (ctx) => {
      const cs = Object.values(ctx.state.containers);
      const imgs = Object.keys(ctx.state.images);
      return cs.length === 1 && cs[0]!.name === "web" && cs[0]!.state === "running" && imgs.length === 1 && ctx.state.tags["nginx:1.27"] === imgs[0];
    },
  },
  {
    id: "drop-nginx",
    title: l("nginx'i kaldır", "Remove nginx"),
    goal: l("`nginx:1.27` image'ı bu makineden tamamen silinsin.", "Remove the `nginx:1.27` image from this machine completely."),
    hint: l("Bir container kullandığı sürece image silinmez.", "An image cannot go while a container uses it."),
    par: 2,
    check: (ctx) => !ctx.state.tags["nginx:1.27"] && !Object.values(ctx.state.images).some((i) => i.id === ctx.start.tags["nginx:1.27"]),
  },
  {
    id: "prune-trap",
    title: l("Prune tuzağı", "The prune trap"),
    goal: l(
      "`web`'i durdur ve `docker system prune` çalıştır: durmuş `web` de temizliğe gitsin, sonunda hiç container kalmasın.",
      "Stop `web` and run `docker system prune`: the stopped `web` goes too, and no containers are left.",
    ),
    hint: l("Prune, çalışmayan her container'ı siler, sebebini sormaz.", "Prune removes every container that is not running, no questions asked."),
    par: 2,
    check: (ctx) => eventsOf(ctx, "pruned").some((e) => e.containers.includes("web")) && Object.keys(ctx.state.containers).length === 0 && !findContainer(ctx.state, "web"),
  },
];
