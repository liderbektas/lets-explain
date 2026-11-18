import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { route } from "../../engine/broker";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf, lostSince } from "../shared/missionHelpers";

/** Message bodies waiting in a queue at the end ("pe" = pdf/eu, "cu" = csv/us, ...). */
const bodies = (ctx: BrokerCtx, q: string) => new Set((ctx.state.queues[q]?.ready ?? []).map((m) => m.body));
const exactly = (got: Set<string>, want: string[]) => got.size === want.length && want.every((k) => got.has(k));
/** Whether pdf-eu's binding at the end takes a header set: the rule must be right, not the timing. */
const takes = (ctx: BrokerCtx, format: string, region: string) => route(ctx.state, "docs", "", { format, region }).includes("pdf-eu");
const sent = (ctx: BrokerCtx) => new Set(eventsOf(ctx, "confirmed").map((e) => e.id));

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "nothing-lost",
    title: l("Kaybolmasın", "Nothing lost"),
    goal: l("`csv/us` belgesini gönder. Hiçbir kuyruğa uymuyor, ama **kaybolmasın**.", "Send the `csv/us` document. It matches no queue, but it must **not be lost**."),
    hint: l("Kimseye uymayan mesajlar için bir yedek exchange tanımlanabilir.", "You can set a fallback exchange for messages that match nobody."),
    par: 2,
    check: (ctx) => bodies(ctx, "lost-found").has("cu") && lostSince(ctx).length === 0,
  },
  {
    id: "both-required",
    title: l("İkisi birden", "Both required"),
    goal: l(
      "`pdf/eu` ve `pdf/us` gönder. `pdf-eu` kuyruğu **sadece** hem pdf hem eu olanı alsın.",
      "Send `pdf/eu` and `pdf/us`. The `pdf-eu` queue takes **only** the one that is both pdf and eu.",
    ),
    hint: l("`x-match` bütün header'ların mı yoksa birinin mi uyması gerektiğini söyler.", "`x-match` says whether all headers must match or just one."),
    par: 3,
    check: (ctx) => sent(ctx).size >= 2 && exactly(bodies(ctx, "pdf-eu"), ["pe"]) && !takes(ctx, "pdf", "us") && takes(ctx, "pdf", "eu"),
  },
  {
    id: "either",
    title: l("Biri yeter", "Either one"),
    goal: l(
      "`pdf/us` ve `csv/eu` belgeleri `pdf-eu` kuyruğuna girsin; ama kuralı `csv/us`'yi **almasın**.",
      "Get `pdf/us` and `csv/eu` into the `pdf-eu` queue, but its rule must **not** take `csv/us`.",
    ),
    hint: l("Header'lardan sadece birinin uyması yetsin.", "Let a single matching header be enough."),
    par: 3,
    check: (ctx) => exactly(bodies(ctx, "pdf-eu"), ["pu", "ce"]) && !takes(ctx, "csv", "us"),
  },
];
