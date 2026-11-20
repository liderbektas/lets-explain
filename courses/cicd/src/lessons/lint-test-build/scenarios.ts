import { l } from "@lets-explain/core/i18n";
import { apply, freshWorld, headOf, latestRun, type Bug, type Run, type StepKind, type Workflow } from "../../engine/ci";
import { deskOf } from "../../engine/desk";
import { liveWorkflow, type CiScenario, type DeskCtx } from "../shared/ci";
import { GOOD, SANDBOX, wf } from "./model";

/** The shop with this workflow, after a push that brought these bugs. */
const pushedWith = (w: Workflow, add: Bug[]) => deskOf(apply(freshWorld({ workflows: [w] }), { type: "push", add, message: "cart: round totals" }).state);

/** The good order, but lint is allowed to fail: its errors pile up on a green main. */
export const LENIENT: Workflow = { ...wf(GOOD), jobs: [{ ...wf(GOOD).jobs[0]!, steps: wf(GOOD).jobs[0]!.steps.map((s) => (s.kind === "lint" ? { ...s, continueOnError: true } : s)) }] };

const newest = (ctx: DeskCtx): Run | undefined => {
  const r = latestRun(ctx.state.world);
  return r && !ctx.start.world.runs.some((x) => x.id === r.id) ? r : undefined;
};
/** The checks a run really passed, in order. */
const passed = (r: Run): StepKind[] => r.jobs[0]?.steps.filter((s) => s.status === "success" && !s.allowed).map((s) => s.kind) ?? [];
const before = (ks: StepKind[], a: StepKind, b: StepKind) => ks.includes(a) && ks.includes(b) && ks.indexOf(a) < ks.indexOf(b);

const ORDER_HINT = l(
  "Adımlar yukarıdan aşağı çalışır ve ilk kırılan adım run'ı durdurur. Saniyeler süren kontroller (lint, tip) daha uzun süren testlerin önünde olmalı.",
  "Steps run top to bottom, and the first one that breaks stops the run. Checks that take seconds (lint, types) belong before the slower tests.",
);

export const scenarios: CiScenario[] = [
  {
    id: "fast-lint",
    title: l("Kötü haber çabuk gelsin", "Bad news, fast"),
    story: l(
      "Her push'ta önce testler, sonra tip kontrolü, build ve en sonda lint çalışıyor. Kullanılmayan bir değişken gibi saniyede bulunacak bir hata için bile iki dakikadan fazla bekliyorsun.",
      "Every push runs the tests first, then the type check, the build, and lint at the very end. Even a mistake found in seconds, like an unused variable, keeps you waiting for more than two minutes.",
    ),
    goal: l("Lint, `npm ci`'den hemen sonra çalışsın; yeni bir run lint'te, **70 saniye içinde** kırılsın.", "Lint runs right after `npm ci`; a new run breaks on lint **within 70 seconds**."),
    start: deskOf(SANDBOX),
    hints: [
      ORDER_HINT,
      l("Kodu düzeltme: önce pipeline'ın hatayı ne kadar çabuk gösterdiğini gör. `- run: npm run lint` satırını taşı.", "Don't fix the code yet: first see how fast the pipeline shows the error. Move the `- run: npm run lint` line."),
      l("`nano .github/workflows/ci.yml` → `- run: npm run lint` satırını `- run: npm ci`'nin hemen altına taşı → `git commit -am \"Lint first\"` → `git push`", "`nano .github/workflows/ci.yml` → move `- run: npm run lint` right below `- run: npm ci` → `git commit -am \"Lint first\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => {
      const r = newest(ctx);
      const failed = r?.jobs[0]?.steps.find((s) => s.status === "failure" && !s.allowed);
      return Boolean(r && r.status === "failure" && failed?.kind === "lint" && r.end - r.start <= 70);
    },
  },
  {
    id: "right-order",
    title: l("Doğru sırayla yeşil", "Green, in the right order"),
    story: l(
      "Aynı push'ta iki hata var: bir lint hatası ve bir tip hatası, ve kontroller yine yanlış sırada. Main'i yeşile döndür ve bir daha böyle hatalar için testleri beklemek zorunda kalma.",
      "The same push has two mistakes, a lint error and a type error, and the checks are still in the wrong order. Turn main green, and never wait for the tests on mistakes like these again.",
    ),
    goal: l("Yeşil bir run al; o run'da `lint` ve tip kontrolü `npm test`'ten **önce** çalışmış olsun.", "Get a green run in which `lint` and the type check both ran **before** `npm test`."),
    start: deskOf(SANDBOX),
    hints: [
      ORDER_HINT,
      l("`gh run view --log-failed` tip hatasını gösterir: `src/price.ts`'te fiyat bir string. Lint ise `src/cart.ts`'te kullanılmayan bir değişkene takılıyor.", "`gh run view --log-failed` shows the type error: the price in `src/price.ts` is a string. Lint trips on an unused variable in `src/cart.ts`."),
      l(
        "`nano .github/workflows/ci.yml` → lint ve `npx tsc --noEmit` satırlarını `npm ci`'nin altına taşı → `nano src/cart.ts` → `const total = subtotal;` satırını sil → `nano src/price.ts` → `\"19.90\"`'ı `19.9` yap → `git commit -am \"Checks first, fix lint and types\"` → `git push`",
        "`nano .github/workflows/ci.yml` → move the lint and `npx tsc --noEmit` lines below `npm ci` → `nano src/cart.ts` → delete the `const total = subtotal;` line → `nano src/price.ts` → change `\"19.90\"` to `19.9` → `git commit -am \"Checks first, fix lint and types\"` → `git push`",
      ),
    ],
    par: 5,
    check: (ctx) => {
      const r = newest(ctx);
      if (!r || r.status !== "success") return false;
      const k = passed(r);
      return before(k, "lint", "test") && before(k, "typecheck", "test");
    },
  },
  {
    id: "add-typecheck",
    title: l("Tip kontrolü yok", "No type check"),
    story: l(
      "CI yeşildi, ama production'da fiyatlar `\"19.90\"` diye string olarak göründü: TypeScript'in yakalayacağı bir hata, çünkü CI'da tip kontrolü hiç yok. Ekip `npx tsc --noEmit`'in testlerden önce çalışmasını istiyor.",
      "CI was green, but prices showed up in production as the string `\"19.90\"`: a mistake TypeScript would catch, except CI never runs the type check. The team wants `npx tsc --noEmit` to run before the tests.",
    ),
    goal: l("CI tipleri testlerden önce kontrol etsin ve main, tip hatası düzeltilmiş halde yeşil olsun.", "CI checks the types before the tests, and main is green with the type error fixed."),
    start: pushedWith(wf(["lint", "test", "build"]), ["type"]),
    hints: [
      l("Önce sadece kontrolü ekleyip push'larsan kırmızı göreceksin: o da iyi, demek ki kontrol işe yarıyor.", "If you add just the check and push, you'll see red: that's good, it means the check works."),
      l("Lint'in altına `- run: npx tsc --noEmit` ekle; `src/price.ts`'te fiyatı sayı yap.", "Add `- run: npx tsc --noEmit` under lint; make the price a number in `src/price.ts`."),
      l(
        "`nano .github/workflows/ci.yml` → `- run: npm run lint`'in altına `- run: npx tsc --noEmit` → `nano src/price.ts` → `\"19.90\"`'ı `19.9` yap → `git commit -am \"Type check in CI\"` → `git push`",
        "`nano .github/workflows/ci.yml` → under `- run: npm run lint` add `- run: npx tsc --noEmit` → `nano src/price.ts` → change `\"19.90\"` to `19.9` → `git commit -am \"Type check in CI\"` → `git push`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const r = newest(ctx);
      return Boolean(r && r.status === "success" && before(passed(r), "typecheck", "test")) && !headOf(ctx.state.world).bugs.includes("type");
    },
  },
  {
    id: "lint-may-fail",
    title: l("Lint susturulmuş", "Lint was silenced"),
    story: l(
      "Bir gün acele eden biri lint adımına `continue-on-error: true` ekledi. O günden beri lint kırmızı olsa da run yeşil görünüyor ve hatalar main'de birikiyor; son push'ta bile kullanılmayan bir değişken var.",
      "One day someone in a hurry added `continue-on-error: true` to the lint step. Since then the run looks green even when lint is red, and the mistakes pile up on main; even the last push has an unused variable.",
    ),
    goal: l("Lint hataları run'ı yine kırsın ve main, lint hatası düzeltilmiş halde yeşil olsun.", "Lint errors break the run again, and main is green with the lint error fixed."),
    start: pushedWith(LENIENT, ["lint"]),
    hints: [
      l("`gh run view --log` lint adımının aslında kırıldığını gösterir. Run'ı yeşil tutan şey workflow'daki bir satır.", "`gh run view --log` shows the lint step really failed. What keeps the run green is one line in the workflow."),
      l("`continue-on-error: true` satırını sil; `src/cart.ts`'teki kullanılmayan değişkeni de.", "Delete the `continue-on-error: true` line, and the unused variable in `src/cart.ts`."),
      l(
        "`nano .github/workflows/ci.yml` → `continue-on-error: true` satırını sil → `nano src/cart.ts` → `const total = subtotal;` satırını sil → `git commit -am \"Lint must pass\"` → `git push`",
        "`nano .github/workflows/ci.yml` → delete the `continue-on-error: true` line → `nano src/cart.ts` → delete the `const total = subtotal;` line → `git commit -am \"Lint must pass\"` → `git push`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const r = newest(ctx);
      const lint = liveWorkflow(ctx.state)?.jobs.flatMap((j) => j.steps).find((s) => s.kind === "lint");
      return Boolean(r && r.status === "success" && passed(r).includes("lint") && lint && !lint.continueOnError) && !headOf(ctx.state.world).bugs.includes("lint");
    },
  },
];
