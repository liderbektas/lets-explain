import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { DockerCtx } from "../shared/DockerScene";
import { isNaive } from "./project";

/** Index of the first code edit in the try-it run, or -1. */
const firstEdit = (ctx: DockerCtx) => ctx.actions.findIndex((a) => a.type === "editHost");

/** Seconds each build in the run took, with its position. */
function builds(ctx: DockerCtx) {
  return ctx.actions.flatMap((a, i) => {
    if (a.type !== "build") return [];
    const done = ctx.events[i]!.find((e) => e.type === "built");
    return done && done.type === "built" ? [{ i, naive: isNaive(a), seconds: done.seconds }] : [];
  });
}

export const missions: Mission<DockerCtx>[] = [
  {
    id: "ship-it",
    title: l("Yeni sürüm yayında", "New version live"),
    goal: l(
      "`index.html`'i değiştir ve `localhost:3000` **yeni sürümü** göstersin.",
      "Change `index.html` and make `localhost:3000` show the **new version**.",
    ),
    hint: l(
      "Çalışan container eski image'dan çalışıyor. Yeni kod yeni bir image ve yeni bir container ister.",
      "The running container runs the old image. New code needs a new image and a new container.",
    ),
    par: 5,
    check: (ctx) =>
      ctx.events.flat().some((e) => e.type === "curlResult" && e.ok && /v([2-9])/.test(e.body)),
  },
  {
    id: "fast-rebuild",
    title: l("Cache'ten hızlı", "Fast from cache"),
    goal: l(
      "Kodu değiştir ve yeniden build et: `npm ci` cache'ten gelsin, build **5 saniyenin altında** bitsin.",
      "Change the code and rebuild: `npm ci` comes from cache and the build finishes in **under 5 seconds**.",
    ),
    hint: l("Hangi Dockerfile bağımlılıkları kaynak koddan önce kopyalıyordu?", "Which Dockerfile copies the dependencies before the source code?"),
    par: 2,
    check: (ctx) => {
      const edit = firstEdit(ctx);
      return edit >= 0 && builds(ctx).some((b) => b.i > edit && b.seconds < 5);
    },
  },
  {
    id: "slow-way",
    title: l("Yavaş yolu gör", "See the slow way"),
    goal: l(
      "Önce her şeyi kopyalayan Dockerfile ile build et, sonra kodu değiştir ve **aynı** Dockerfile ile tekrar build et: `npm ci` baştan çalışsın (30 saniye ya da daha uzun).",
      "Build with the copy-everything Dockerfile, then change the code and build again with the **same** one: `npm ci` runs from scratch (30 seconds or more).",
    ),
    hint: l("Kaynak kod değişince `COPY . .` cache'i kırılır ve ondan sonraki her satır baştan çalışır.", "When the source changes, `COPY . .` misses the cache and every line after it runs again."),
    par: 3,
    check: (ctx) => {
      const edit = firstEdit(ctx);
      const all = builds(ctx);
      return edit >= 0 && all.some((b) => b.naive && b.i < edit) && all.some((b) => b.naive && b.i > edit && b.seconds >= 30);
    },
  },
];
