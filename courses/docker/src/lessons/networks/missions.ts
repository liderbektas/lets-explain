import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { findContainer, resolves } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";

/** Pings with the index of the move that ran them. */
function pings(ctx: DockerCtx, from: string) {
  return ctx.events.flatMap((evs, i) => evs.flatMap((e) => (e.type === "execOutput" && e.name === from && e.cmd === "ping cache" ? [{ i, ok: e.code === 0 }] : [])));
}

export const missions: Mission<DockerCtx>[] = [
  {
    id: "hello-cache",
    title: l("Merhaba cache", "Hello, cache"),
    goal: l("`web`, `cache`'e **ismiyle** ulaşsın: `ping cache` başarılı olsun.", "Let `web` reach `cache` **by name**: `ping cache` succeeds."),
    hint: l("Varsayılan bridge'de isimle bulma yok. İkisini de kendi network'ünde buluştur.", "The default bridge has no name lookup. Bring both onto your own network."),
    par: 4,
    check: (ctx) => pings(ctx, "web").some((p) => p.ok),
  },
  {
    id: "newcomer",
    title: l("Yeni gelen", "The newcomer"),
    goal: l(
      "Yeni bir `worker` container'ı `cache`'e ismiyle ulaşsın, ama `web` ulaşamasın.",
      "Let a new `worker` container reach `cache` by name, while `web` still cannot.",
    ),
    hint: l("Bir container aynı anda birden fazla network'te olabilir; `web`'i oraya bağlama.", "A container can be on several networks; just do not connect `web`."),
    par: 4,
    check: (ctx) => {
      const web = findContainer(ctx.state, "web");
      return pings(ctx, "worker").some((p) => p.ok) && Boolean(web) && !resolves(ctx.state, web!, "cache");
    },
  },
  {
    id: "see-then-fix",
    title: l("Önce gör, sonra düzelt", "See it, then fix it"),
    goal: l(
      "Önce `web`'in `cache`'i bulamadığını gör (`ping` başarısız), sonra düzelt ve aynı `ping` başarılı olsun.",
      "First see `web` fail to find `cache` (`ping` fails), then fix it so the same `ping` succeeds.",
    ),
    hint: l("Hata mesajı `bad address`: isim çözülemiyor.", "The error says `bad address`: the name does not resolve."),
    par: 5,
    check: (ctx) => {
      const p = pings(ctx, "web");
      const fail = p.find((x) => !x.ok);
      return Boolean(fail && p.some((x) => x.i > fail.i && x.ok));
    },
  },
];
