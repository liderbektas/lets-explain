import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

export const missions: Mission<DockerCtx>[] = [
  {
    id: "keep-image",
    title: l("Image kalsın", "Keep the image"),
    goal: l(
      "`localhost:8080` bir kez cevap versin; sonunda container **silinmiş**, image ise makinede **kalmış** olsun.",
      "Make `localhost:8080` answer once; in the end the container is **removed** but the image **stays** on the machine.",
    ),
    hint: l("Container'ı silmek, onu başlatan image'ı silmez.", "Removing a container does not remove the image it came from."),
    par: 3,
    check: (ctx) =>
      eventsOf(ctx, "curlResult").some((e) => e.port === 8080 && e.ok) && Object.keys(ctx.state.containers).length === 0 && Boolean(ctx.state.tags["nginx:1.27"]),
  },
  {
    id: "clean",
    title: l("Tertemiz", "Spotless"),
    goal: l(
      "nginx'i bir kez çalıştır, sonra makinede **ne container ne image** kalsın.",
      "Run nginx once, then leave **no container and no image** on the machine.",
    ),
    hint: l("Bir container kullandığı sürece image silinemez.", "An image cannot be removed while a container uses it."),
    par: 3,
    check: (ctx) => eventsOf(ctx, "created").length > 0 && Object.keys(ctx.state.containers).length === 0 && Object.keys(ctx.state.images).length === 0,
  },
  {
    id: "rename",
    title: l("Yeni isim", "A new name"),
    goal: l(
      "nginx image'ına `mysite:1.0` adını da ver, sonra `nginx:1.27` etiketini kaldır: image sadece `mysite:1.0` olarak kalsın.",
      "Give the nginx image the name `mysite:1.0` too, then drop the `nginx:1.27` tag: the image stays, only as `mysite:1.0`.",
    ),
    hint: l("Bir image'ın birden fazla etiketi olabilir; etiket silmek image'ı silmez.", "An image can have several tags; removing a tag does not remove the image."),
    par: 3,
    check: (ctx) => Boolean(ctx.state.tags["mysite:1.0"]) && !ctx.state.tags["nginx:1.27"] && Boolean(ctx.state.images[ctx.state.tags["mysite:1.0"]!]),
  },
];
