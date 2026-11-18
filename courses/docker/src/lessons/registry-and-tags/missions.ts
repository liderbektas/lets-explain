import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

const V1 = "ghcr.io/ada/shop:1.0.0";
const LATEST = "ghcr.io/ada/shop:latest";

export const missions: Mission<DockerCtx>[] = [
  {
    id: "publish",
    title: l("Yayınla", "Publish"),
    goal: l("Uygulamanın image'ı registry'de `ghcr.io/ada/shop:1.0.0` adıyla dursun.", "Get the app's image into the registry as `ghcr.io/ada/shop:1.0.0`."),
    hint: l("Registry'ye göndermeden önce image'a o adı vermelisin.", "Give the image that name before you send it."),
    par: 2,
    check: (ctx) => ctx.state.registry.tags[V1] !== undefined && ctx.state.registry.tags[V1] === ctx.state.tags["shop:dev"],
  },
  {
    id: "surprise-latest",
    title: l("Sürpriz latest", "Surprise latest"),
    goal: l(
      "Bu makinede `:latest` ile `:1.0.0` **farklı** image'ları göstersin.",
      "Make `:latest` and `:1.0.0` on this machine point at **different** images.",
    ),
    hint: l("`latest` sadece en son kimin ne gönderdiğine bakar.", "`latest` is just whatever was pushed last."),
    par: 3,
    check: (ctx) => Boolean(ctx.state.tags[LATEST] && ctx.state.tags[V1] && ctx.state.tags[LATEST] !== ctx.state.tags[V1]),
  },
  {
    id: "untag",
    title: l("Sadece etiket", "Just the label"),
    goal: l(
      "`:latest` etiketini sil, ama image bu makinede **kalsın**.",
      "Remove the `:latest` tag, but the image **stays** on this machine.",
    ),
    hint: l("Bir image'ın birden fazla adı varsa `rmi` sadece birini kaldırır.", "When an image has several names, `rmi` removes only one."),
    par: 2,
    check: (ctx) => eventsOf(ctx, "imageRemoved").some((e) => e.ref === LATEST && e.untaggedOnly) && ctx.state.images[ctx.state.tags["shop:dev"] ?? ""] !== undefined,
  },
];
