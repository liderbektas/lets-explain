import { l } from "@lets-explain/core/i18n";
import { apply, commitOf, freshWorld, type CiAction, type World } from "../../engine/ci";
import { deskOf, replayDesk } from "../../engine/desk";
import { workflowYaml } from "../../engine/yaml";
import type { CiScenario } from "../shared/ci";
import { PAGES, pagesWf, type Parts } from "./workflow";

const play = (w: World, actions: CiAction[]) => actions.reduce((x, a) => apply(x, a).state, w);
const site = (parts: Parts | null) => freshWorld({ workflows: parts ? [pagesWf(parts)] : [], envs: [{ name: PAGES }], secrets: { DEPLOY_TOKEN: "pages-oidc" } });

const FILE = ".github/workflows/pages.yml";

/** Half done: no tests, nothing uploaded, deploys from anywhere. */
const HALF = deskOf(site({ test: false, upload: false, deploy: true, onlyMain: false }));
/** Live and working, but PRs deploy too; a teammate's `docs-fix` branch waits for its PR. */
const PR_DEPLOYS = deskOf(play(site({ test: true, upload: true, deploy: true, onlyMain: false }), [{ type: "push", branch: "docs-fix", paths: ["README.md"], message: "docs: fix the install steps" }]));
/** No test step yet, and Bora's PR #1 changes the VAT rate (and breaks a test). */
const NO_TESTS = deskOf(
  play(site({ test: false, upload: true, deploy: true, onlyMain: true }), [
    { type: "push", branch: "vat", add: ["test"], message: "new VAT rate" },
    { type: "openPr", branch: "vat" },
  ]),
);
/** No workflow on GitHub; the finished one sits in the folder, not committed yet. */
const LOCAL_ONLY = replayDesk(deskOf(site(null)), [{ type: "write", path: FILE, content: workflowYaml(pagesWf({ test: true, upload: true, deploy: true, onlyMain: true })) }]).states.at(-1)!;

const UPLOAD = "`- uses: actions/upload-pages-artifact@v4` + `with: { path: dist/ }`";
const IF_MAIN = "`if: github.ref == 'refs/heads/main' && github.event_name == 'push'`";

export const scenarios: CiScenario[] = [
  {
    id: "live",
    title: l("Yayına al", "Go live"),
    story: l(
      "Pages workflow'u yarım kalmış: `build` job'ı siteyi derliyor ama hiçbir yere koymuyor, `deploy` job'ı da her seferinde \"artifact bulunamadı\" diye kırılıyor. Site hâlâ yayında değil.",
      "The Pages workflow is half done: the `build` job builds the site but puts it nowhere, and the `deploy` job fails every time with \"artifact not found\". The site isn't live yet.",
    ),
    goal: l("GitHub Pages, main'in en son commit'ini yayınlasın.", "GitHub Pages serves main's newest commit."),
    start: HALF,
    hints: [
      l("`deploy` job'ı başka bir makinede çalışır; `dist/` ona ancak bir artifact olarak gidebilir. `gh run view --log-failed` neden kırıldığını gösterir.", "The `deploy` job runs on another machine; `dist/` can only reach it as an artifact. `gh run view --log-failed` shows why it fails."),
      l("`build` job'ının sonuna, `npm run build`'den sonra, Pages'in artifact'ını yükleyen adımı ekle.", "At the end of the `build` job, after `npm run build`, add the step that uploads the Pages artifact."),
      l(`\`nano .github/workflows/pages.yml\` → ${UPLOAD} → \`git commit -am "Upload the site"\` → \`git push\``, `\`nano .github/workflows/pages.yml\` → ${UPLOAD} → \`git commit -am "Upload the site"\` → \`git push\``),
    ],
    par: 3,
    check: ({ state }) => Boolean(state.world.envs[PAGES]?.sha) && state.world.envs[PAGES]!.sha === state.world.heads.main,
  },
  {
    id: "pr-safe",
    title: l("PR'lar sadece build etsin", "PRs only build"),
    story: l(
      "Site yayında, ama geçen hafta bir PR açıldığı anda o PR'ın yarım kodu Pages'e çıktı: `deploy` job'ı PR'larda da çalışıyor. Ayşe `docs-fix` branch'ini push'ladı ve PR açmak üzere.",
      "The site is live, but last week a PR's half-finished code went to Pages the moment the PR opened: the `deploy` job runs on PRs too. Ayşe pushed the `docs-fix` branch and is about to open a PR.",
    ),
    goal: l("`docs-fix` için bir PR açılsın; PR'da `build` geçsin, `deploy` **atlansın**.", "A PR is opened for `docs-fix`; on it `build` passes and `deploy` is **skipped**."),
    start: PR_DEPLOYS,
    hints: [
      l("Deploy job'ına ne zaman çalışacağını söyleyen bir koşul gerek; önce o GitHub'a gitmeli, PR sonra açılmalı.", "The deploy job needs a condition that says when it may run; that has to reach GitHub first, and the PR comes after."),
      l(`\`deploy:\` job'ına ${IF_MAIN} ekle. PR'ı \`gh pr create --head docs-fix\` açar.`, `Add ${IF_MAIN} to the \`deploy:\` job. \`gh pr create --head docs-fix\` opens the PR.`),
      l(
        `\`nano .github/workflows/pages.yml\` → \`deploy:\` altına ${IF_MAIN} → \`git commit -am "Deploy only from main"\` → \`git push\` → \`gh pr create --head docs-fix\``,
        `\`nano .github/workflows/pages.yml\` → under \`deploy:\` add ${IF_MAIN} → \`git commit -am "Deploy only from main"\` → \`git push\` → \`gh pr create --head docs-fix\``,
      ),
    ],
    par: 4,
    check: ({ state }) =>
      state.world.runs.some((r) => r.event === "pull_request" && r.branch === "docs-fix" && r.jobs.find((j) => j.id === "build")?.status === "success" && r.jobs.find((j) => j.id === "deploy")?.status === "skipped"),
  },
  {
    id: "tests-guard",
    title: l("Kırık test yayına çıkmasın", "No broken test goes live"),
    story: l(
      "Bora'nın PR #1'i KDV oranını değiştiriyor ve ekip onu birazdan merge edecek. Ama pipeline hiç test çalıştırmıyor; değişiklik bir testi bozuyorsa bunu kimse görmeden yayına çıkar.",
      "Bora's PR #1 changes the VAT rate, and the team is about to merge it. But the pipeline runs no tests at all; if the change breaks a test, it goes live without anyone seeing.",
    ),
    goal: l(
      "PR #1 merge edilsin; kırık test varsa pipeline onu **testte** durdursun ve Pages'e hiç ulaşmasın.",
      "PR #1 is merged; if a test is broken, the pipeline stops it **at the tests** and it never reaches Pages.",
    ),
    start: NO_TESTS,
    hints: [
      l("Merge'den önce pipeline'ın gerçekten test çalıştırması gerek. Test kırılınca `build` job'ı kırılır ve `deploy` hiç başlamaz.", "Before the merge, the pipeline has to actually run the tests. When a test fails, the `build` job fails and `deploy` never starts."),
      l("`build` job'ında `npm ci`'dan sonra `- run: npm test`. Önce bunu push'la, sonra `gh pr merge 1`.", "In the `build` job, after `npm ci`, add `- run: npm test`. Push that first, then `gh pr merge 1`."),
      l("`nano .github/workflows/pages.yml` → `- run: npm test` → `git commit -am \"Run the tests\"` → `git push` → `gh pr merge 1`", "`nano .github/workflows/pages.yml` → `- run: npm test` → `git commit -am \"Run the tests\"` → `git push` → `gh pr merge 1`"),
    ],
    par: 4,
    check: ({ state }) =>
      state.world.prs.some((p) => p.id === 1 && p.state === "merged") &&
      state.world.runs.some((r) => r.jobs.some((j) => j.steps.some((s) => s.kind === "test" && s.status === "failure"))) &&
      !state.world.envs[PAGES]?.history.some((sha) => commitOf(state.world, sha).bugs.includes("test")),
  },
  {
    id: "via-pr",
    title: l("Önce PR", "PR first"),
    story: l(
      "Pages workflow'unu yazdın, dosya klasöründe duruyor ama commit'lenmedi. Ekibin kuralı: main'e doğrudan hiçbir şey push'lanmaz; her değişiklik bir branch'te gelir, PR'da build'in geçtiği görülür.",
      "You wrote the Pages workflow; the file is in your folder but not committed. The team's rule: nothing is pushed straight to main; every change comes on a branch, and the PR shows the build passing.",
    ),
    goal: l("Workflow bir branch'ten PR olarak gelsin ve PR'da `build` geçsin; main'e hiçbir şey push'lanmasın.", "The workflow arrives as a PR from a branch and `build` passes on it; nothing is pushed to main."),
    start: LOCAL_ONLY,
    hints: [
      l("Önce yeni bir branch, sonra commit, sonra o branch'i push'la. PR en son.", "First a new branch, then the commit, then push that branch. The PR comes last."),
      l("`git switch -c add-pages`, yeni dosya için `git add`; ilk push'ta `-u origin add-pages`; PR'ı `gh pr create --fill` açar.", "`git switch -c add-pages`, `git add` for the new file; on the first push `-u origin add-pages`; `gh pr create --fill` opens the PR."),
      l(
        '`git switch -c add-pages` → `git add .github/workflows/pages.yml` → `git commit -m "Deploy to GitHub Pages"` → `git push -u origin add-pages` → `gh pr create --fill`',
        '`git switch -c add-pages` → `git add .github/workflows/pages.yml` → `git commit -m "Deploy to GitHub Pages"` → `git push -u origin add-pages` → `gh pr create --fill`',
      ),
    ],
    par: 5,
    check: ({ start, state }) =>
      state.world.heads.main === start.world.heads.main &&
      state.world.runs.some((r) => r.event === "pull_request" && r.branch !== "main" && r.jobs.find((j) => j.id === "build")?.status === "success"),
  },
];
