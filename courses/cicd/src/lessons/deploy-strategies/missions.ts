import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { Ctx } from "../shared/SimScene";
import type { Fleet, FleetAction, FleetEvent } from "./model";

export type FleetCtx = Ctx<Fleet, FleetAction, FleetEvent>;

/** Did some v2 server ever exist in this run? */
const sawV2 = (ctx: FleetCtx) => ctx.states.some((s) => s.servers.some((x) => x.version === 2));

export const missions: Mission<FleetCtx>[] = [
  {
    id: "zero-downtime",
    title: l("Kesintisiz geçiş", "No downtime"),
    goal: l(
      "Sağlam v2'ye geç: son turda trafiğin **tamamı** v2'de olsun, hiç kesinti ve hata olmasın.",
      "Move to a healthy v2: in the last round **all** traffic is on v2, with no downtime and no errors.",
    ),
    hint: l("Yeni sürümü yanına kur, sonra trafiği tek hamlede çevir.", "Set the new version up next to the old one, then switch traffic in one move."),
    par: 3,
    check: (ctx) => {
      const f = ctx.state;
      return !f.bad && f.round?.v2 === 100 && f.failed === 0 && f.downRounds === 0;
    },
  },
  {
    id: "nobody-hurt",
    title: l("Kimse fark etmesin", "Nobody notices"),
    goal: l(
      "v2'ye bir bug koy, onu deploy et, sonra geri al. Hiçbir kullanıcı isteği hata almasın.",
      "Put a bug in v2, deploy it, then roll back. Not a single user request may fail.",
    ),
    hint: l("Yeni sürümü trafiğe açmadan önce ona içeriden bakabildiğin bir strateji var.", "One strategy lets you look at the new version from inside before any traffic reaches it."),
    par: 4,
    check: (ctx) => {
      const f = ctx.state;
      return f.bad && sawV2(ctx) && f.rolledBack && f.failed === 0 && f.downRounds === 0;
    },
  },
  {
    id: "canary",
    title: l("Küçük bir grupla dene", "Try it on a few"),
    goal: l(
      "Bug'lı v2'yi gerçek trafikte yakala ve geri al: en az bir istek hata alsın ama **20'den fazla değil**.",
      "Catch the buggy v2 with real traffic and roll back: at least one request fails, but **no more than 20**.",
    ),
    hint: l("Yeni sürüme önce trafiğin küçük bir payını ver.", "Give the new version a small share of traffic first."),
    par: 4,
    check: (ctx) => {
      const f = ctx.state;
      return f.bad && f.rolledBack && f.failed > 0 && f.failed <= 20 && f.downRounds === 0;
    },
  },
];
