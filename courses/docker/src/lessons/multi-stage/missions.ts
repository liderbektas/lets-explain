import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { imageFor, imageSize } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

const shopSize = (ctx: DockerCtx) => {
  const img = imageFor(ctx.state, "shop");
  return img ? imageSize(img) : Infinity;
};

export const missions: Mission<DockerCtx>[] = [
  {
    id: "under-200",
    title: l("200 MB altı", "Under 200 MB"),
    goal: l("`shop` image'ını **200 MB'ın altına** indir.", "Get the `shop` image **under 200 MB**."),
    hint: l("Derleme araçları çalışan image'a gerekmiyor; taban image da boyutun çoğu.", "The running image needs no build tools, and the base image is most of the size."),
    par: 3,
    check: (ctx) => shopSize(ctx) < 200,
  },
  {
    id: "under-150",
    title: l("En küçüğü", "The smallest"),
    goal: l("`shop` image'ı **150 MB'ın altında** olsun.", "Get the `shop` image **under 150 MB**."),
    hint: l("Shell'i, paket yöneticisi bile olmayan bir taban var.", "There is a base without even a shell or a package manager."),
    par: 3,
    check: (ctx) => shopSize(ctx) < 150,
  },
  {
    id: "no-shell",
    title: l("İçeri girilmeyen", "No way in"),
    goal: l(
      "Çalışan bir `app` container'ında `sh` açmayı dene ve **başarısız** olsun: o image'da shell olmasın.",
      "Try to open `sh` in a running `app` container and have it **fail**: that image has no shell.",
    ),
    hint: l("distroless image'larda shell yoktur.", "distroless images have no shell."),
    par: 5,
    check: (ctx) => eventsOf(ctx, "execOutput").some((e) => e.cmd === "sh" && e.code === 127),
  },
];
