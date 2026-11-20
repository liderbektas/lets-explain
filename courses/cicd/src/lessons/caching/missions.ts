import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { CiEvent, Run } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

const fresh = (ctx: CiCtx): Run[] => ctx.state.runs.filter((r) => r.id > ctx.start.runs.length);
const cacheEvents = (ctx: CiCtx) => ctx.events.flat().filter((e): e is Extract<CiEvent, { type: "cache" }> => e.type === "cache");

export const missions: Mission<CiCtx>[] = [
  {
    id: "warm",
    title: l("Sıcak cache", "A warm cache"),
    goal: l("Bir run'da `npm ci` **12 saniyede** bitsin: cache'ten gelen paketlerle.", "Get a run where `npm ci` finishes in **12 seconds**, using packages from the cache."),
    hint: l("Cache ilk run'da boştur; doldurulması için bir run gerekir.", "The cache is empty on the first run; it takes one run to fill it."),
    par: 3,
    check: (ctx) => fresh(ctx).some((r) => r.jobs[0]?.steps.some((s) => s.kind === "install" && s.status === "success" && s.seconds === 12)),
  },
  {
    id: "new-key",
    title: l("Yeni lockfile, yeni anahtar", "New lockfile, new key"),
    goal: l(
      "Cache'te zaten bir kayıt varken bir bağımlılık ekle ve run, **yeni bir anahtarla miss** olup yine de yeşil bitsin.",
      "With an entry already in the cache, add a dependency and have the run **miss on a new key** and still finish green.",
    ),
    hint: l("Anahtar `package-lock.json`'ın hash'inden geliyor.", "The key comes from the hash of `package-lock.json`."),
    par: 3,
    check: (ctx) => {
      const evs = cacheEvents(ctx);
      return evs.some((e, i) => e.result === "miss" && evs.slice(0, i).some((x) => x.result === "saved" && x.key !== e.key) && fresh(ctx).find((r) => r.id === e.run)?.status === "success");
    },
  },
  {
    id: "stale",
    title: l("Bayat cache", "A stale cache"),
    goal: l(
      "Cache yüzünden testlerin `Cannot find module` hatasıyla kırıldığı bir run üret.",
      "Produce a run whose tests fail with `Cannot find module` because of the cache.",
    ),
    hint: l("Anahtar hiç değişmezse, bağımlılıklar değişince cache ne getirir?", "If the key never changes, what does the cache bring back after the dependencies change?"),
    par: 3,
    check: (ctx) => fresh(ctx).some((r) => r.jobs.some((j) => j.steps.some((s) => s.status === "failure" && s.log.some((x) => x.includes("Cannot find module"))))),
  },
];
