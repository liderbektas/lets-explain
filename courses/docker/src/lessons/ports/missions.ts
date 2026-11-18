import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { findContainer } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

/** Curl results with the index of the move that made them. */
function curls(ctx: DockerCtx) {
  return ctx.events.flatMap((evs, i) => evs.flatMap((e) => (e.type === "curlResult" ? [{ i, e }] : [])));
}

export const missions: Mission<DockerCtx>[] = [
  {
    id: "side-by-side",
    title: l("Yan yana", "Side by side"),
    goal: l(
      "`old` 8080'de çalışmaya devam ederken `web` de dışarıdan cevap versin: `localhost:8081`.",
      "While `old` keeps running on 8080, make `web` answer from outside too: `localhost:8081`.",
    ),
    hint: l("İki container içeride aynı portu dinleyebilir; host tarafı farklı olmalı.", "Two containers can listen on the same port inside; the host side must differ."),
    par: 2,
    check: (ctx) => eventsOf(ctx, "curlResult").some((e) => e.port === 8081 && e.ok) && findContainer(ctx.state, "old")?.state === "running",
  },
  {
    id: "make-room",
    title: l("Yer aç", "Make room"),
    goal: l("`web`, `localhost:8080`'den cevap versin. 8080'i şu an `old` tutuyor.", "Make `web` answer on `localhost:8080`. Right now `old` holds 8080."),
    hint: l("Bir host portunu aynı anda tek bir container kullanabilir.", "Only one container can use a host port at a time."),
    par: 3,
    check: (ctx) => {
      const web = findContainer(ctx.state, "web");
      return Boolean(web && web.state === "running" && web.ports.some((p) => p.host === 8080)) && eventsOf(ctx, "curlResult").some((e) => e.port === 8080 && e.ok);
    },
  },
  {
    id: "wrong-door",
    title: l("Yanlış kapı", "Wrong door"),
    goal: l(
      "Önce `localhost:8081`'e gelen istek container'a ulaşıp **reset** yesin (yanlış container portu), sonra düzelt: aynı port cevap versin.",
      "First let a request to `localhost:8081` reach a container and get **reset** (wrong container port), then fix it so the same port answers.",
    ),
    hint: l("`-p host:container`: sağdaki sayı nginx'in içeride dinlediği port olmalı.", "`-p host:container`: the right number must be the port nginx listens on inside."),
    par: 5,
    check: (ctx) => {
      const list = curls(ctx);
      const reset = list.find((x) => x.e.port === 8081 && !x.e.ok && x.e.body.includes("reset"));
      return Boolean(reset && list.some((x) => x.i > reset.i && x.e.port === 8081 && x.e.ok));
    },
  },
];
