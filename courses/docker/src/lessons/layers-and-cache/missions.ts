import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { imageFor } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";

/** Seconds of each build in the try-it run, by the move that did it. */
function builds(ctx: DockerCtx) {
  return ctx.events.flatMap((evs, i) => evs.filter((e) => e.type === "built").map((e) => ({ at: i, seconds: (e as { seconds: number }).seconds })));
}

/** Was there an edit to `path` after the previous build and before the build at move `at`? */
function editedRightBefore(ctx: DockerCtx, at: number, path: string): boolean {
  for (let i = at - 1; i >= 0; i--) {
    const a = ctx.actions[i]!;
    if (a.type === "build") return false;
    if (a.type === "editHost" && a.path.endsWith(path)) return true;
  }
  return false;
}

export const missions: Mission<DockerCtx>[] = [
  {
    id: "fast-rebuild",
    title: l("Hızlı yeniden build", "Fast rebuild"),
    goal: l(
      "`server.js`'i değiştir; ondan **hemen sonraki** build 5 saniyenin altında bitsin.",
      "Change `server.js`; the build **right after** must finish in under 5 seconds.",
    ),
    hint: l(
      "Kod değişince `npm ci` neden yeniden çalışıyor? Sırayı düzelttikten sonra cache'i bir kez ısıtman gerekir.",
      "Why does `npm ci` rerun on a code change? After fixing the order, the cache needs one warm-up build.",
    ),
    par: 4,
    check: (ctx) => builds(ctx).some((b) => b.seconds < 5 && editedRightBefore(ctx, b.at, "server.js")),
  },
  {
    id: "small-image",
    title: l("Küçük image", "Small image"),
    goal: l("`shop` image'ı **400 MB'ın altında** olsun.", "Get the `shop` image **under 400 MB**."),
    hint: l("Kendi bilgisayarındaki `node_modules` da image'a kopyalanıyor.", "The `node_modules` from your own machine gets copied in too."),
    par: 2,
    check: (ctx) => {
      const img = imageFor(ctx.state, "shop");
      return Boolean(img && ctx.state.lastBuild && ctx.state.lastBuild.size < 400 && builds(ctx).length > 0);
    },
  },
  {
    id: "git-safe",
    title: l("Commit cache'i bozmasın", "Commits keep the cache"),
    goal: l(
      "Bir `git commit` at; ondan **hemen sonraki** build tamamen cache'ten gelsin (0 saniye).",
      "Make a `git commit`; the build **right after** must come entirely from the cache (0 seconds).",
    ),
    hint: l("`.git` klasörü de build context'e giriyor.", "The `.git` folder is part of the build context too."),
    par: 4,
    check: (ctx) => builds(ctx).some((b) => b.seconds === 0 && editedRightBefore(ctx, b.at, ".git/HEAD")),
  },
];
