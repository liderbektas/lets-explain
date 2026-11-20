import { l } from "@lets-explain/core/i18n";
import { parse } from "yaml";
import { applyLp, freshLp, GOOD_SHA, type LP } from "./model";
import { DEPENDABOT, lpDesk, type LpScenario } from "./shell";

/** Did bad code get anything into main or the registry? */
const hit = (s: LP) => s.tampered || s.runs.some((r) => r.attack?.registry);
const published = (s: LP) => s.runs.some((r) => r.publish === "pushed");

/** A model state after some pushes, for start states that already have runs. */
const after = (lp: LP, pushes: number) => {
  let s = lp;
  for (let i = 0; i < pushes; i++) s = applyLp(s, { type: "push" }).state;
  return s;
};

/** Is this a Dependabot file that keeps the workflow's actions up to date? */
export function watchesActions(text: string | undefined): boolean {
  if (!text) return false;
  try {
    const js = parse(text) as { version?: number; updates?: { "package-ecosystem"?: string; directory?: string; schedule?: { interval?: string } }[] };
    return js?.version === 2 && Boolean(js.updates?.some((u) => u["package-ecosystem"] === "github-actions" && u.directory && u.schedule?.interval));
  } catch {
    return false;
  }
}

const PIN = `\`uses: acme/lint-action@${GOOD_SHA} # v1.4.2\``;

export const scenarios: LpScenario[] = [
  {
    id: "contain",
    title: l("Zararı önle", "Stop the damage"),
    story: l(
      "Bir güvenlik bülteni geldi: `acme/lint-action`'ın `v1` etiketi gece kötü bir commit'e taşınmış. Senin workflow'un hâlâ `@v1` kullanıyor ve token'ı her şeye yazabiliyor. Bugünkü sürümü yine de yayınlaman gerek.",
      "A security advisory arrived: `acme/lint-action`'s `v1` tag was moved to a bad commit overnight. Your workflow still uses `@v1`, and its token can write everywhere. You still need to ship today's release.",
    ),
    goal: l("Bir push'ta image yayınlansın; ne main'e ne registry'ye kötü bir şey girsin.", "One push publishes the image, and nothing bad reaches main or the registry."),
    start: lpDesk(freshLp({ tagMoved: true })),
    hints: [
      l("`v1` bir etiket, taşınabilir. Bülten, güvenli sürümün `v1.4.2` olduğunu söylüyor: onun commit'ine sabitle.", "`v1` is a tag; it can move. The advisory says `v1.4.2` is safe: pin to its commit."),
      l(
        "Etiketin gösterdiği SHA: `git ls-remote https://github.com/acme/lint-action refs/tags/v1.4.2`. Workflow'da `@v1` yerine bu tam SHA'yı yaz.",
        "The SHA the tag points at: `git ls-remote https://github.com/acme/lint-action refs/tags/v1.4.2`. Put that full SHA in the workflow instead of `@v1`.",
      ),
      l(`\`nano .github/workflows/ci.yml\` → ${PIN} → \`git commit -am "Pin lint-action"\` → \`git push\``, `\`nano .github/workflows/ci.yml\` → ${PIN} → \`git commit -am "Pin lint-action"\` → \`git push\``),
    ],
    par: 3,
    check: ({ state }) => published(state.lp) && !hit(state.lp),
  },
  {
    id: "both-locks",
    title: l("İki kilit birden", "Both locks"),
    story: l(
      "Olaydan sonra ekip iki kural koydu: üçüncü parti action'lar commit SHA'sına sabitlenir **ve** token her job'da sadece gerekeni yapabilir. Biri tutmazsa diğeri tutsun.",
      "After the incident the team set two rules: third-party actions are pinned to a commit SHA **and** the token can do only what each job needs. If one fails, the other holds.",
    ),
    goal: l(
      "Action SHA'ya sabit, en üstte `contents: read`, sadece `publish` job'ında `packages: write`; bu ayarlarla bir run image'ı yayınlasın.",
      "The action is pinned to a SHA, `contents: read` at the top, `packages: write` only in the `publish` job; a run with these settings publishes the image.",
    ),
    start: lpDesk(freshLp({ tagMoved: true })),
    hints: [
      l("İki değişiklik aynı dosyada: `uses:` satırı ve `permissions:` blokları.", "Both changes are in one file: the `uses:` line and the `permissions:` blocks."),
      l(
        "En üstte `permissions:` altına `contents: read`; `publish` job'ına kendi `permissions:` bloğu: `contents: read` ve `packages: write`. Lint için tam SHA'yı `git ls-remote` verir.",
        "At the top, `permissions:` with `contents: read`; the `publish` job gets its own `permissions:` block: `contents: read` and `packages: write`. `git ls-remote` gives the full SHA for lint.",
      ),
      l(
        `\`nano .github/workflows/ci.yml\` → ${PIN}, en üstte \`permissions: { contents: read }\`, publish'te \`permissions: { contents: read, packages: write }\` → \`git commit -am "Least privilege"\` → \`git push\``,
        `\`nano .github/workflows/ci.yml\` → ${PIN}, \`permissions: { contents: read }\` at the top, \`permissions: { contents: read, packages: write }\` on publish → \`git commit -am "Least privilege"\` → \`git push\``,
      ),
    ],
    par: 3,
    check: ({ state }) => !hit(state.lp) && state.lp.runs.some((r) => r.pinned && r.perms === "per-job" && r.publish === "pushed"),
  },
  {
    id: "too-tight",
    title: l("Fazla sıkı", "Too tight"),
    story: l(
      "Bir arkadaşın güvenlik için workflow'un tepesine `permissions: read-all` yazdı. Lint artık hiçbir şeye yazamıyor, güzel; ama dünkü sürüm yayınlanamadı: `publish` 403 aldı.",
      "A teammate put `permissions: read-all` at the top of the workflow for safety. Lint can't write anything now, which is good, but yesterday's release didn't ship: `publish` got a 403.",
    ),
    goal: l("Image yine yayınlansın, ama `lint` job'ının token'ı hâlâ hiçbir şeye yazamasın.", "The image is published again, while the `lint` job's token still can't write anything."),
    start: lpDesk(after(freshLp({ perms: "read-all", pinned: true }), 1)),
    hints: [
      l("`gh run view --log` neden reddedildiğini gösterir. Yazma yetkisi sadece onu gerçekten isteyen job'a verilmeli.", "`gh run view --log` shows why it was denied. Write access belongs only to the job that really needs it."),
      l("Bir job'ın kendi `permissions:` bloğu, en üsttekinin yerine geçer.", "A job's own `permissions:` block replaces the one at the top."),
      l(
        "`nano .github/workflows/ci.yml` → `publish:` altına `permissions:` + `contents: read` + `packages: write` → `git commit -am \"Let publish push\"` → `git push`",
        "`nano .github/workflows/ci.yml` → under `publish:` add `permissions:` + `contents: read` + `packages: write` → `git commit -am \"Let publish push\"` → `git push`",
      ),
    ],
    par: 3,
    check: ({ start, state }) => {
      const fresh = state.lp.runs.slice(start.lp.runs.length);
      return fresh.some((r) => r.publish === "pushed" && r.perms !== "write-all");
    },
  },
  {
    id: "keep-fresh",
    title: l("SHA'yı güncel tut", "Keep the SHA fresh"),
    story: l(
      "Action'lar artık SHA'ya sabit. Ama sabit bir SHA kendi kendine güncellenmez: `acme/lint-action` yarın bir güvenlik düzeltmesi yayınlarsa kimsenin haberi olmaz. Dependabot bunu senin yerine takip edebilir.",
      "Actions are pinned to SHAs now. But a pinned SHA never updates itself: if `acme/lint-action` ships a security fix tomorrow, nobody will notice. Dependabot can watch it for you.",
    ),
    goal: l(
      "GitHub'daki repoda, workflow'daki action'ları her hafta kontrol eden bir `.github/dependabot.yml` olsun.",
      "The repo on GitHub has a `.github/dependabot.yml` that checks the workflow's actions every week.",
    ),
    start: lpDesk(freshLp({ perms: "per-job", pinned: true })),
    hints: [
      l("Dependabot'un ayarı ayrı bir dosya: `.github/dependabot.yml`. İzlenecek ekosistem `github-actions`.", "Dependabot's settings are a separate file: `.github/dependabot.yml`. The ecosystem to watch is `github-actions`."),
      l(
        "Dosya: `version: 2`, `updates:` altında `package-ecosystem: github-actions`, `directory: /`, `schedule:` → `interval: weekly`. Yeni dosya: `git commit -a` onu almaz, önce `git add`.",
        "The file: `version: 2`, under `updates:` `package-ecosystem: github-actions`, `directory: /`, `schedule:` → `interval: weekly`. A new file: `git commit -a` won't pick it up, `git add` it first.",
      ),
      l(
        "`nano .github/dependabot.yml` → yukarıdaki dört satır → `git add .github/dependabot.yml` → `git commit -m \"Dependabot for actions\"` → `git push`",
        "`nano .github/dependabot.yml` → the lines above → `git add .github/dependabot.yml` → `git commit -m \"Dependabot for actions\"` → `git push`",
      ),
    ],
    par: 4,
    check: ({ state }) => watchesActions(state.repo.remote[DEPENDABOT]),
  },
];
