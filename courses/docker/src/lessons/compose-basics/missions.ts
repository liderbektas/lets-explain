import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { findContainer } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

const running = (ctx: DockerCtx, name: string) => findContainer(ctx.state, name)?.state === "running";

export const missions: Mission<DockerCtx>[] = [
  {
    id: "all-up",
    title: l("Hepsi ayakta", "All up"),
    goal: l(
      "Üç servis de (`web`, `api`, `db`) çalışsın ve `localhost:8080` cevap versin.",
      "Get all three services (`web`, `api`, `db`) running and `localhost:8080` answering.",
    ),
    hint: l("Tek bir komut bütün projeyi ayağa kaldırır; api'nin ayarı .env'den gelir.", "One command starts the whole project; the api's setting comes from .env."),
    par: 2,
    check: (ctx) =>
      ["shop-web-1", "shop-api-1", "shop-db-1"].every((n) => running(ctx, n)) && eventsOf(ctx, "curlResult").some((e) => e.port === 8080 && e.ok),
  },
  {
    id: "keep-data",
    title: l("Veri kalsın", "Keep the data"),
    goal: l(
      "Projeyi kapatıp yeniden aç: `db` açılırken **eski verisini** bulsun (logunda \"existing data found\").",
      "Take the project down and up again: `db` finds its **old data** on start (its log says \"existing data found\").",
    ),
    hint: l("`down` container'ları siler ama named volume'lara dokunmaz.", "`down` removes containers but leaves named volumes alone."),
    par: 3,
    check: (ctx) => eventsOf(ctx, "log").some((e) => e.name === "shop-db-1" && e.line.includes("existing data found")),
  },
  {
    id: "missing-env",
    title: l("Eksik .env", "Missing .env"),
    goal: l(
      "`api` önce `.env` olmadan başlayıp **exit code 1** ile kapansın, sonra düzeltilip **çalışır** halde kalsın.",
      "Let `api` start without `.env` and stop with **exit code 1**, then fix it so it stays **running**.",
    ),
    hint: l("Compose, kapanmış bir servisi bir sonraki `up`'ta yeniden yaratır.", "Compose recreates an exited service on the next `up`."),
    par: 2,
    check: (ctx) => eventsOf(ctx, "exited").some((e) => e.name === "shop-api-1" && e.code === 1) && running(ctx, "shop-api-1"),
  },
  {
    id: "clean-slate",
    title: l("İz bırakma", "Leave no trace"),
    goal: l(
      "Projeyi bir kez ayağa kaldır, sonra **tamamen** kaldır: proje container'ı, ağı ve volume'u kalmasın.",
      "Start the project once, then remove it **completely**: no project container, network or volume left.",
    ),
    hint: l("`down` volume'ları korur; silmesi için bir bayrak gerekir.", "`down` keeps volumes; it needs a flag to remove them."),
    par: 2,
    check: (ctx) =>
      eventsOf(ctx, "composeUp").length > 0 &&
      !Object.values(ctx.state.containers).some((c) => c.project === "shop") &&
      !Object.values(ctx.state.networks).some((n) => n.project === "shop") &&
      !Object.values(ctx.state.volumes).some((v) => v.project === "shop"),
  },
];
