import { l } from "@lets-explain/core/i18n";
import { apply, commitOf, freshWorld, type Bug, type Run } from "../../engine/ci";
import { deskOf, type Desk } from "../../engine/desk";
import { ciWorkflow } from "../../engine/presets";
import type { CiScenario, DeskCtx } from "../shared/ci";

/** CI on pushes to main: install, lint, test, build. */
const CI = ciWorkflow({ on: { push: { branches: ["main"] } } });

/** The tests next to the code, as they are in the repo. The cart test is the one CI's log names. */
const CART_TEST = `import { expect, it } from "vitest";
import { total } from "./cart";

it("total adds VAT", () => {
  expect(total([100])).toBe(120);
});`;

const CHECKOUT = `import { EventEmitter } from "node:events";
import { save } from "./db";

export const orders = new EventEmitter();

/** Saves the order in the background and announces it when it is stored. */
export function placeOrder(items: number[]) {
  save(items).then((order) => orders.emit("confirmed", order));
}`;

/** The flaky test: it places the order, then waits a little, then starts listening. A fast save is missed. */
export const RACY_TEST = `import { expect, it } from "vitest";
import { once } from "node:events";
import { orders, placeOrder } from "./checkout";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("confirms the order", async () => {
  placeOrder([42]);
  await sleep(100); // the save is usually still running by now
  const [order] = await once(orders, "confirmed");
  expect(order.items).toEqual([42]);
});`;

/** The same test listening before it places the order: nothing can slip past. */
export const FIXED_TEST = `import { expect, it } from "vitest";
import { once } from "node:events";
import { orders, placeOrder } from "./checkout";

it("confirms the order", async () => {
  const confirmed = once(orders, "confirmed");
  placeOrder([42]);
  const [order] = await confirmed;
  expect(order.items).toEqual([42]);
});`;

/**
 * main after a push whose CI run is red. `bugs` were there before (the flaky test), `add` came
 * with the push (the VAT bug). The folder shows both: the code and the tests.
 */
function red(bugs: Bug[], add: Bug[], message: string): Desk {
  const w = apply(freshWorld({ workflows: [CI], bugs }), { type: "push", add, paths: ["src/cart.ts"], message }).state;
  const flaky = bugs.includes("flaky") || add.includes("flaky");
  return deskOf(w, { "src/cart.test.ts": CART_TEST, "src/checkout.ts": CHECKOUT, "src/checkout.test.ts": flaky ? RACY_TEST : FIXED_TEST });
}

/** Runs started during the scenario. */
const fresh = (ctx: DeskCtx): Run[] => ctx.state.world.runs.filter((r) => r.id > ctx.start.world.runs.length);
const bugsOf = (ctx: DeskCtx, r: Run) => commitOf(ctx.state.world, r.sha).bugs;
const failedWith = (r: Run, text: string) => r.jobs.some((j) => j.steps.some((s) => s.status === "failure" && s.log.some((x) => x.includes(text))));
/** A green run on its first attempt: the code passed, not a lucky re-run. */
const greenFirstTry = (r: Run) => r.status === "success" && r.attempt === 1;

const READ = l(
  "Önce oku, sonra dokun: `gh run view --log-failed` kırılan adımın logunu gösterir. Hata satırı, exit code satırının hemen üstünde.",
  "Read before you touch anything: `gh run view --log-failed` shows the failed step's log. The error sits just above the exit code line.",
);

export const scenarios: CiScenario[] = [
  {
    id: "vat",
    title: l("KDV hatası", "The VAT bug"),
    story: l(
      "Sabah ilk iş `main`'deki run'ın kırmızı olduğunu gördün. Dün akşam sepete KDV eklenmişti; o push'tan beri CI geçmiyor.",
      "First thing in the morning you see the run on `main` is red. Yesterday evening someone added VAT to the cart, and CI hasn't passed since that push.",
    ),
    goal: l("Hatayı kodda düzelt ve yeni push'un run'ı **ilk denemede** yeşil olsun.", "Fix the bug in the code and get the new push's run green **on its first attempt**."),
    start: red([], ["test"], "cart: add VAT"),
    hints: [
      READ,
      l(
        "Log `expected 118 to be 120` diyor ve testin adı `total adds VAT`. `src/cart.ts`'te toplamı çarpan sayıya bak: KDV %20.",
        "The log says `expected 118 to be 120`, and the test is `total adds VAT`. Look at the number the total is multiplied by in `src/cart.ts`: VAT is 20%.",
      ),
      l(
        "`nano src/cart.ts` → `1.18`'i `1.2` yap → `git commit -am \"fix: VAT is 20%\"` → `git push`",
        "`nano src/cart.ts` → change `1.18` to `1.2` → `git commit -am \"fix: VAT is 20%\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => fresh(ctx).some((r) => greenFirstTry(r) && !bugsOf(ctx, r).includes("test")),
  },
  {
    id: "rerun-flaky",
    title: l("Bildik flaky", "The usual flaky one"),
    story: l(
      "Cuma 17:50, sürüm commit'i `main`'de. Run, `checkout.test.ts`'deki bir zaman aşımıyla kırıldı. Bu test haftalardır ara ara böyle yapıyor ve kodda değişen bir şey yok. Sürümün bugün çıkması lazım.",
      "Friday, 17:50, and the release commit is on `main`. Its run failed with a timeout in `checkout.test.ts`. That test has been doing this now and then for weeks, and nothing in the code changed. The release has to go out today.",
    ),
    goal: l("**Yeni bir commit atmadan**, aynı commit için yeşil bir run al.", "Get a green run for the same commit **without making a new commit**."),
    start: red(["flaky"], [], "release: 1.4.0"),
    hints: [
      READ,
      l("Log `Test timed out` diyor ve kod değişmedi: zamanlamaya bağlı bir test. Aynı commit'i bir kez daha çalıştırmak yeter.", "The log says `Test timed out` and the code didn't change: a timing-dependent test. Running the same commit once more is enough."),
      l("`gh run rerun`", "`gh run rerun`"),
    ],
    par: 1,
    check: (ctx) =>
      ctx.state.world.heads.main === ctx.start.world.heads.main && fresh(ctx).some((r) => r.status === "success" && r.attempt > 1 && r.sha === ctx.start.world.heads.main),
  },
  {
    id: "fix-flaky",
    title: l("Yarışı düzelt", "Fix the race"),
    story: l(
      "Sürüm çıktı, ama ekip her hafta aynı testi yeniden çalıştırmaktan bıktı: \"tekrar çalıştır\" alışkanlığı gerçek hataları da gizler. Test, siparişi verip **sonra** onayı dinlemeye başlıyor; kayıt hızlı biterse onay kaçıyor.",
      "The release went out, but the team is tired of re-running the same test every week: a \"just re-run\" habit hides real bugs too. The test places the order and **then** starts listening for the confirmation; when the save is quick, the confirmation is missed.",
    ),
    goal: l("Bir sonraki push'un run'ı **ilk denemede**, yeniden çalıştırmadan yeşil olsun ve commit'te flaky test kalmasın.", "Get the next push's run green **on its first attempt**, with no re-run, and leave no flaky test in the commit."),
    start: red(["flaky"], [], "release: 1.4.0"),
    hints: [
      l("Testi oku: `cat src/checkout.test.ts`. Onay olayı hangi satırda dinleniyor, sipariş hangi satırda veriliyor?", "Read the test: `cat src/checkout.test.ts`. On which line does it listen for the confirmation, and on which does it place the order?"),
      l("Dinlemeye siparişten **önce** başla: `once(...)`'ı bir değişkene al, `placeOrder`'ı sonra çağır, en son o değişkeni `await` et. `sleep` satırına gerek kalmaz.", "Start listening **before** the order: keep `once(...)` in a variable, call `placeOrder` after it, and `await` the variable last. The `sleep` line is no longer needed."),
      l(
        "`nano src/checkout.test.ts` → `const confirmed = once(orders, \"confirmed\");` satırını `placeOrder([42]);`'den önceye koy, `sleep`'i sil, `const [order] = await confirmed;` yaz → `git commit -am \"test: listen before ordering\"` → `git push`",
        "`nano src/checkout.test.ts` → put `const confirmed = once(orders, \"confirmed\");` before `placeOrder([42]);`, delete the `sleep`, write `const [order] = await confirmed;` → `git commit -am \"test: listen before ordering\"` → `git push`",
      ),
    ],
    par: 3,
    check: (ctx) => fresh(ctx).some((r) => greenFirstTry(r) && !bugsOf(ctx, r).includes("flaky")),
  },
  {
    id: "prove",
    title: l("\"Flaky o, geç\"", "\"It's flaky, ignore it\""),
    story: l(
      "Run yine kırmızı. Bora: \"O test flaky, bir daha çalıştır geçer.\" Sen bunun gerçek bir hata olduğundan şüpheleniyorsun. Önce Bora'ya göster, sonra düzelt.",
      "The run is red again. Bora: \"That test is flaky, run it again and it'll pass.\" You suspect a real bug. Show Bora first, then fix it.",
    ),
    goal: l(
      "Kırmızı run'ı bir kez yeniden çalıştır ve **yine** aynı hatayla (`AssertionError`) kırıldığını gör. Sonra hatayı düzeltip ilk denemede yeşil bir run al.",
      "Re-run the red run once and watch it fail **again** with the same error (`AssertionError`). Then fix the bug and get a run that is green on its first attempt.",
    ),
    start: red([], ["test"], "cart: free shipping over 500"),
    hints: [
      l("Flaky bir test bazen geçer; gerçek bir hata kod değişene kadar her denemede aynı yerde kırılır. Bunu görmenin yolu bir re-run.", "A flaky test passes sometimes; a real bug fails in the same place on every attempt until the code changes. A re-run shows which one it is."),
      l("`gh run rerun`, sonra `gh run view --log-failed`. Hata satırını okuyunca düzeltme `src/cart.ts`'te.", "`gh run rerun`, then `gh run view --log-failed`. Once you have read the error line, the fix is in `src/cart.ts`."),
      l(
        "`gh run rerun` → `nano src/cart.ts` (`1.18` → `1.2`) → `git commit -am \"fix: VAT is 20%\"` → `git push`",
        "`gh run rerun` → `nano src/cart.ts` (`1.18` → `1.2`) → `git commit -am \"fix: VAT is 20%\"` → `git push`",
      ),
    ],
    par: 4,
    check: (ctx) => {
      const runs = fresh(ctx);
      const proof = runs.findIndex((r) => r.attempt > 1 && failedWith(r, "AssertionError"));
      return proof >= 0 && runs.slice(proof + 1).some((r) => greenFirstTry(r) && !bugsOf(ctx, r).includes("test"));
    },
  },
  {
    id: "clean",
    title: l("Temiz yeşil", "A clean green"),
    story: l(
      "Run kırmızı ve logda bir KDV hatası var. Ama ekipten biri uyarıyor: aynı testlerin arkasında `checkout.test.ts`'deki flaky test de bekliyor; biri düzelince diğeri görünecek.",
      "The run is red, and the log shows a VAT bug. But someone on the team warns you: behind it, the flaky test in `checkout.test.ts` is waiting too; fix one and the other will show.",
    ),
    goal: l("İlk denemede yeşil bir run al ve o run'ın commit'inde **hiçbir sorun kalmasın**: ne KDV hatası ne flaky test.", "Get a run that is green on its first attempt, whose commit has **no problems left**: neither the VAT bug nor the flaky test."),
    start: red(["flaky"], ["test"], "cart: add VAT"),
    hints: [
      l("Re-run ile geçen bir test düzelmiş değildir. İki dosyayı da düzeltip tek seferde push'la.", "A test that passes on a re-run is not fixed. Fix both files and push them together."),
      l("KDV için `src/cart.ts` (`1.18` → `1.2`); flaky test için `src/checkout.test.ts`'de onayı siparişten önce dinle.", "For VAT, `src/cart.ts` (`1.18` → `1.2`); for the flaky test, listen for the confirmation before placing the order in `src/checkout.test.ts`."),
      l(
        "`nano src/cart.ts` → `nano src/checkout.test.ts` → `git commit -am \"fix: VAT and the checkout race\"` → `git push`",
        "`nano src/cart.ts` → `nano src/checkout.test.ts` → `git commit -am \"fix: VAT and the checkout race\"` → `git push`",
      ),
    ],
    par: 4,
    check: (ctx) => fresh(ctx).some((r) => greenFirstTry(r) && bugsOf(ctx, r).length === 0),
  },
];
