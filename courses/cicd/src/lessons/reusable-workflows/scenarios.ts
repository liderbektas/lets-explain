import { l } from "@lets-explain/core/i18n";
import { applyRw, FILE, freshRw, nodeOf, PLACES, WFS, type RW, type RwAction } from "./model";
import { filesOf, pushedChanges, readRw, rwDesk, type RwScenario } from "./shell";

/** A model state after some moves, for start states. */
const after = (actions: RwAction[]): RW => actions.reduce((s, a) => applyRw(s, a).state, freshRw());

const allOn = (rw: RW, node: number) => WFS.every((wf) => nodeOf(rw, wf) === node);
const allUseComposite = (rw: RW) => rw.composite.exists && PLACES.every((p) => !rw.places[p].exists || rw.places[p].setup === "composite");

/** ci and release use the composite action; nightly still has its own copy. */
const HALF_WAY = after([{ type: "createComposite" }, { type: "useComposite", place: "ci" }, { type: "useComposite", place: "release" }]);
/** Everything goes through the composite action, on Node 22. */
const SHARED_22 = after([{ type: "createComposite" }, { type: "setNode", where: "composite", node: 22 }, { type: "useComposite", place: "ci" }, { type: "useComposite", place: "release" }, { type: "useComposite", place: "nightly" }]);
/** test.yml exists as a copy of ci's test job, but nobody calls it yet. */
const WITH_TEST = after([{ type: "createReusable" }]);

/** Bora's half-finished move: ci.yml calls test.yml, but test.yml still runs on push. */
const BROKEN_CALL = (() => {
  const target = after([{ type: "createReusable" }, { type: "callReusable", wf: "ci" }]);
  const files = filesOf(target);
  files[FILE.test] = files[FILE.test]!.replace("on:\n  workflow_call:", "on:\n  push:\n    branches: [main]");
  const why = readRw(files, WITH_TEST);
  return rwDesk(WITH_TEST, files, typeof why === "string" ? why : null);
})();

const SETUP = "`- uses: ./.github/actions/setup`";

export const scenarios: RwScenario[] = [
  {
    id: "node-22",
    title: l("Herkes Node 22'de", "Everyone on Node 22"),
    story: l(
      "Node 20'nin desteği bitiyor ve ekip Node 22'ye geçmeye karar verdi. Setup adımları üç workflow'da üç ayrı kopya olarak duruyor: `ci.yml`, `release.yml` ve `nightly.yml`. Geçen sefer biri gece testini unutmuştu.",
      "Node 20 is reaching its end of life and the team decided to move to Node 22. The setup steps sit in three separate copies in three workflows: `ci.yml`, `release.yml` and `nightly.yml`. Last time someone forgot the nightly one.",
    ),
    goal: l("GitHub'daki üç workflow da Node 22 ile çalışsın.", "All three workflows on GitHub run on Node 22."),
    start: rwDesk(freshRw()),
    hints: [
      l("Her kopyada `actions/setup-node` adımının `node-version:` satırı var. Üçünü de bul.", "Every copy has an `actions/setup-node` step with a `node-version:` line. Find all three."),
      l("Üç dosyayı `nano` ile düzelt, sonra tek commit, tek push. `cat` ile hangi satır olduğunu görebilirsin.", "Fix the three files with `nano`, then one commit, one push. `cat` shows you which line it is."),
      l(
        "`nano .github/workflows/ci.yml`, `nano .github/workflows/release.yml`, `nano .github/workflows/nightly.yml` → `node-version: 22` → `git commit -am \"Node 22\"` → `git push`",
        "`nano .github/workflows/ci.yml`, `nano .github/workflows/release.yml`, `nano .github/workflows/nightly.yml` → `node-version: 22` → `git commit -am \"Node 22\"` → `git push`",
      ),
    ],
    par: 5,
    check: ({ state }) => !state.invalid && allOn(state.rw, 22),
  },
  {
    id: "one-place",
    title: l("Setup tek yerde", "Setup in one place"),
    story: l(
      "Ekip kopyalardan bıktı ve setup adımlarını bir composite action'a taşıdı: `.github/actions/setup/action.yml`. `ci.yml` ve `release.yml` onu kullanıyor, ama `nightly.yml` hâlâ kendi kopyasında. Şimdi Node 22'ye geçmek de gerekiyor.",
      "The team got tired of the copies and moved the setup steps into a composite action: `.github/actions/setup/action.yml`. `ci.yml` and `release.yml` use it, but `nightly.yml` still has its own copy. Now Node 22 is due too.",
    ),
    goal: l(
      "Her workflow setup'ı composite action'dan alsın ve hepsi Node 22 ile çalışsın.",
      "Every workflow gets its setup from the composite action, and all of them run on Node 22.",
    ),
    start: rwDesk(HALF_WAY),
    hints: [
      l("`cat .github/workflows/ci.yml` ile composite action'ın nasıl kullanıldığına bak, nightly'de aynısını yap.", "Look at how `ci.yml` uses the composite action with `cat`, and do the same in nightly."),
      l(`\`nightly.yml\`'deki setup-node ve \`npm ci\` adımlarının yerine tek satır: ${SETUP}. Node sürümü \`action.yml\`'deki \`default:\`.`, `Replace nightly's setup-node and \`npm ci\` steps with one line: ${SETUP}. The Node version is the \`default:\` in \`action.yml\`.`),
      l(
        `\`nano .github/workflows/nightly.yml\` → ${SETUP} → \`nano .github/actions/setup/action.yml\` → \`default: '22'\` → \`git commit -am "One setup"\` → \`git push\``,
        `\`nano .github/workflows/nightly.yml\` → ${SETUP} → \`nano .github/actions/setup/action.yml\` → \`default: '22'\` → \`git commit -am "One setup"\` → \`git push\``,
      ),
    ],
    par: 4,
    check: ({ state }) => !state.invalid && allUseComposite(state.rw) && allOn(state.rw, 22),
  },
  {
    id: "one-line",
    title: l("Tek satırlık yükseltme", "A one-line upgrade"),
    story: l(
      "Bütün workflow'lar setup'ı composite action'dan alıyor, hepsi Node 22'de. Node 24 çıktı ve ekip geçmek istiyor. Bu sefer üç dosyayı değil, tek bir satırı değiştirmen yeter.",
      "Every workflow gets its setup from the composite action, all on Node 22. Node 24 is out and the team wants to move. This time you change one line, not three files.",
    ),
    goal: l("Üç workflow da Node 24 ile çalışsın; GitHub'da sadece **bir** dosya değişsin.", "All three workflows run on Node 24, and only **one** file changes on GitHub."),
    start: rwDesk(SHARED_22),
    hints: [
      l("Node sürümü artık tek bir yerde duruyor.", "The Node version lives in one place now."),
      l("`.github/actions/setup/action.yml` içindeki `node-version` girdisinin `default:` değeri.", "The `default:` of the `node-version` input in `.github/actions/setup/action.yml`."),
      l("`nano .github/actions/setup/action.yml` → `default: '24'` → `git commit -am \"Node 24\"` → `git push`", "`nano .github/actions/setup/action.yml` → `default: '24'` → `git commit -am \"Node 24\"` → `git push`"),
    ],
    par: 3,
    check: (ctx) => !ctx.state.invalid && allOn(ctx.state.rw, 24) && pushedChanges(ctx).length === 1,
  },
  {
    id: "shared-job",
    title: l("Aynı job tek dosyada", "One job, one file"),
    story: l(
      "`ci.yml` ve `release.yml`'deki `test` job'ları birebir aynı: lint, test, aynı setup. Biri değişince öbürü unutuluyor. Bora job'ı `test.yml` diye çağrılabilir bir workflow'a çıkardı; şimdi iki workflow'un onu kullanması gerekiyor.",
      "The `test` jobs in `ci.yml` and `release.yml` are identical: lint, test, the same setup. When one changes, the other is forgotten. Bora moved the job into a callable workflow, `test.yml`; now the two workflows need to use it.",
    ),
    goal: l("`ci.yml` ve `release.yml` kendi `test` job'ı yerine `test.yml`'yi çağırsın.", "`ci.yml` and `release.yml` call `test.yml` instead of having their own `test` job."),
    start: rwDesk(WITH_TEST),
    hints: [
      l("Başka bir workflow'u çağıran job'ın `steps:` ve `runs-on:` satırları olmaz, sadece `uses:`.", "A job that calls another workflow has no `steps:` or `runs-on:`, only `uses:`."),
      l("`test:` job'ının gövdesi: `uses: ./.github/workflows/test.yml` ve `secrets: inherit`.", "The `test:` job's body: `uses: ./.github/workflows/test.yml` and `secrets: inherit`."),
      l(
        "`nano .github/workflows/ci.yml` ve `nano .github/workflows/release.yml` → `test:` altında sadece `uses: ./.github/workflows/test.yml` + `secrets: inherit` → `git commit -am \"Share the test job\"` → `git push`",
        "`nano .github/workflows/ci.yml` and `nano .github/workflows/release.yml` → under `test:` only `uses: ./.github/workflows/test.yml` + `secrets: inherit` → `git commit -am \"Share the test job\"` → `git push`",
      ),
    ],
    par: 4,
    check: ({ state }) => !state.invalid && state.rw.calls.ci && state.rw.calls.release,
  },
  {
    id: "make-callable",
    title: l("Çağrılabilir yap", "Make it callable"),
    story: l(
      "Bora `ci.yml`'yi `test.yml`'yi çağıracak şekilde değiştirip push'ladı, ama GitHub her push'ta \"Invalid workflow file\" diyor ve CI hiç çalışmıyor. Nedenini `cat` ile dosyalara bakarak bulabilirsin.",
      "Bora changed `ci.yml` to call `test.yml` and pushed, but GitHub says \"Invalid workflow file\" on every push and CI doesn't run at all. You can find out why from the files with `cat`.",
    ),
    goal: l("GitHub workflow'ları kabul etsin ve `ci.yml` test job'ını `test.yml`'den çalıştırsın.", "GitHub accepts the workflows and `ci.yml` runs its test job from `test.yml`."),
    start: BROKEN_CALL,
    hints: [
      l("Bir workflow'un başka bir workflow'dan çağrılabilmesi için bunu kendisinin söylemesi gerekir.", "For a workflow to be called from another one, it has to say so itself."),
      l("`test.yml`'nin `on:` kısmı `push` değil, `workflow_call` olmalı.", "`test.yml`'s `on:` must be `workflow_call`, not `push`."),
      l("`nano .github/workflows/test.yml` → `on:` altına `  workflow_call:` → `git commit -am \"Make test.yml callable\"` → `git push`", "`nano .github/workflows/test.yml` → under `on:` put `  workflow_call:` → `git commit -am \"Make test.yml callable\"` → `git push`"),
    ],
    par: 3,
    check: ({ state }) => !state.invalid && state.rw.calls.ci,
  },
];
