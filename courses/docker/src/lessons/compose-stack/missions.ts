import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { containerFiles, findContainer } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

const ORDERS = "/var/lib/postgresql/data/orders.dat";
const appRunning = (ctx: DockerCtx) => findContainer(ctx.state, "shop-app-1")?.state === "running";
const appCrashed = (ctx: DockerCtx) => eventsOf(ctx, "exited").some((e) => e.name === "shop-app-1" && e.code === 1);
/** Whether any `up` in the try-it step used `condition: service_healthy`. */
const usedHealthy = (ctx: DockerCtx) =>
  ctx.actions.some((a) => a.type === "composeUp" && Object.values(a.file.services).some((s) => s.depends_on && !Array.isArray(s.depends_on)));

export const missions: Mission<DockerCtx>[] = [
  {
    id: "first-try",
    title: l("İlk seferde", "First time"),
    goal: l(
      "`app` **hiç çökmeden** ilk denemede ayağa kalksın ve `localhost:3000` cevap versin.",
      "Get `app` up on the first try **without a single crash**, and `localhost:3000` answering.",
    ),
    hint: l("Compose'a veritabanının hazır olmasını beklemesini söyleyebilirsin.", "You can tell Compose to wait until the database is ready."),
    par: 2,
    check: (ctx) => appRunning(ctx) && !appCrashed(ctx) && eventsOf(ctx, "curlResult").some((e) => e.port === 3000 && e.ok),
  },
  {
    id: "crash-then-up",
    title: l("Çök, sonra kalk", "Crash, then rise"),
    goal: l(
      "`app` önce çöksün (exit 1). Sonra **`service_healthy` kullanmadan**, kısa `depends_on` ile ayağa kalksın.",
      "Let `app` crash first (exit 1). Then bring it up **without `service_healthy`**, with the short `depends_on`.",
    ),
    hint: l("Veritabanı birkaç an sonra hazır olur; o zaman tekrar dene.", "The database is ready a moment later; try again then."),
    par: 4,
    check: (ctx) => appCrashed(ctx) && appRunning(ctx) && !usedHealthy(ctx),
  },
  {
    id: "keep-orders",
    title: l("Sipariş kalsın", "Keep the order"),
    goal: l(
      "Veritabanına bir sipariş yaz, projeyi `down` ile kapatıp yeniden aç: sipariş **hâlâ orada** olsun.",
      "Write an order to the database, take the project `down` and up again: the order is **still there**.",
    ),
    hint: l("Veri bir named volume'da duruyor; hangi `down` onu korur?", "The data lives in a named volume; which `down` keeps it?"),
    par: 4,
    check: (ctx) => {
      const db = findContainer(ctx.state, "shop-db-1");
      return eventsOf(ctx, "composeDown").length > 0 && db?.state === "running" && containerFiles(ctx.state, db)[ORDERS] !== undefined;
    },
  },
];
