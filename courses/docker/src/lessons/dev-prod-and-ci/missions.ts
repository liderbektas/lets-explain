import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { DockerCtx } from "../shared/DockerScene";

const version = (body: string) => Number(/v(\d+)/.exec(body)?.[1] ?? 0);

/** Every successful curl in the run, with where it happened. */
function curls(ctx: DockerCtx) {
  return ctx.events.flatMap((evs, i) => evs.flatMap((e) => (e.type === "curlResult" && e.ok ? [{ i, port: e.port, v: version(e.body) }] : [])));
}
const lastEdit = (ctx: DockerCtx) => ctx.actions.map((a) => a.type).lastIndexOf("editHost");

export const missions: Mission<DockerCtx>[] = [
  {
    id: "instant",
    title: l("Anında gör", "See it at once"),
    goal: l(
      "Kodu değiştir ve dev ortamı (`localhost:3000`) yeni hali göstersin, **hiç build yapmadan**.",
      "Change the code and have dev (`localhost:3000`) show it, **without any build**.",
    ),
    hint: l("Dev container'ı kodu image'dan değil, klasörünün kendisinden okuyor.", "The dev container reads the code from your folder, not from an image."),
    par: 2,
    check: (ctx) => !ctx.actions.some((a) => a.type === "build") && curls(ctx).some((c) => c.port === 3000 && c.v >= 2),
  },
  {
    id: "ship",
    title: l("Prod'a çıkar", "Ship to prod"),
    goal: l("Kodu değiştir ve prod (`localhost:8080`) yeni hali göstersin.", "Change the code and have prod (`localhost:8080`) show it."),
    hint: l("Prod kodu image'ın içinde taşır: önce yeni bir image gerek.", "Prod carries its code inside the image: it needs a new image first."),
    par: 4,
    check: (ctx) => curls(ctx).some((c) => c.port === 8080 && c.v >= 2),
  },
  {
    id: "two-worlds",
    title: l("İki dünya", "Two worlds"),
    goal: l(
      "Son değişiklikten sonra dev (`3000`) **yeni**, prod (`8080`) **eski** sürümü göstersin; ikisini de curl ile kanıtla.",
      "After your last change, dev (`3000`) shows the **new** version and prod (`8080`) the **old** one; prove both with curl.",
    ),
    hint: l("Prod'u önce başlat, kodu sonra değiştir.", "Start prod first, change the code after."),
    par: 5,
    check: (ctx) => {
      const edit = lastEdit(ctx);
      if (edit < 0) return false;
      const after = curls(ctx).filter((c) => c.i > edit);
      const dev = after.find((c) => c.port === 3000);
      const prod = after.find((c) => c.port === 8080);
      return Boolean(dev && prod && dev.v > prod.v);
    },
  },
];
