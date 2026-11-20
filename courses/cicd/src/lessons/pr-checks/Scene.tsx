import { l } from "@lets-explain/core/i18n";
import { blockingChecks, freshWorld, latestRun, type CiAction, type Workflow, type World } from "../../engine/ci";
import { ciWorkflow, withJob } from "../../engine/presets";
import { RunStage } from "../../iso/RunStage";
import { PrPanel } from "../../iso/panels";
import { Sticker } from "../../iso/parts";
import { ciSim, ciTyped, focusRun } from "../shared/ci";
import { makeSimScene, resolveSteps, type Spec } from "../shared/SimScene";
import { FREE, scenarios } from "./scenarios";

export const SLUG = "pr-checks";

export const CI: Workflow = ciWorkflow();
/** The same workflow after someone renamed the job from `ci` to `test`. */
export const RENAMED: Workflow = withJob(CI, "ci", (j) => ({ ...j, id: "test" }));

export const REQUIRED = "CI / ci";

export const START: World = freshWorld({ workflows: [CI] });

const specs: Spec<World, CiAction>[][] = [
  [{ type: "push", branch: "feature", add: ["test"], message: "cart: add VAT" }, { type: "openPr", branch: "feature" }],
  [{ type: "merge", pr: 1 }],
  [{ type: "push", fix: ["test"], message: "fix: VAT rounding" }, { type: "setProtection", required: [REQUIRED] }],
  [{ type: "push", branch: "coupons", add: ["lint"], message: "add coupons" }, { type: "openPr", branch: "coupons" }, { type: "merge", pr: 2 }],
  [{ type: "push", branch: "coupons", fix: ["lint"], message: "fix: unused variable" }, { type: "merge", pr: 2 }],
  [{ type: "setWorkflow", workflow: RENAMED }, { type: "push", branch: "search", message: "add search" }, { type: "openPr", branch: "search" }, { type: "merge", pr: 3 }],
  [],
  [],
];

export const steps = resolveSteps(ciSim, START, specs);

export const scene = makeSimScene({
  slug: SLUG,
  sim: ciSim,
  start: START,
  steps,
  label: l("Solda pull request ve check'leri, sağda son run", "The pull request and its checks on the left, the latest run on the right"),
  view: (w, info) => {
    const pr = w.prs[w.prs.length - 1];
    const tr = info.lang === "tr";
    return (
      <g>
        {pr ? (
          <PrPanel world={w} pr={pr.id} box={{ x: 16, y: 14, w: 420, h: 300 }} />
        ) : (
          <g className="ci">
            <Sticker x={16} y={14} w={420} h={90} fill="var(--paper-2)">
              <text x={226} y={66} textAnchor="middle" className="muted">
                {tr ? "Henüz açık bir pull request yok." : "No pull request yet."}
              </text>
            </Sticker>
          </g>
        )}
        <MainCard world={w} tr={tr} />
        <RunStage run={focusRun(w, info)} box={{ x: 452, y: 14, w: 394, h: 444 }} />
      </g>
    );
  },
  metrics: (w, t) => {
    const main = latestRun(w) && [...w.runs].reverse().find((r) => r.branch === "main" && r.event === "push");
    const pr = w.prs[w.prs.length - 1];
    return [
      { label: t(l("main", "main")), value: main ? (main.status === "success" ? t(l("yeşil", "green")) : t(l("kırmızı", "red"))) : "—", tone: main?.status === "failure" ? ("danger" as const) : main ? ("ok" as const) : ("plain" as const) },
      { label: t(l("Koruma", "Protection")), value: w.protection ? w.protection.join(", ") : t(l("yok", "none")) },
      { label: t(l("Merge", "Merge")), value: !pr ? "—" : pr.state === "merged" ? t(l("edildi", "done")) : blockingChecks(w, pr.id).length ? t(l("engelli", "blocked")) : t(l("açık", "allowed")), tone: pr && pr.state === "open" && blockingChecks(w, pr.id).length ? ("warn" as const) : ("plain" as const) },
    ];
  },
  // Free play: main unprotected, PR #1 red on a real test bug, as in the first scenario.
  sandbox: { typed: ciTyped(scenarios, () => FREE) },
});

/** A small card for main: the latest run on main and what is merged. */
function MainCard({ world, tr }: { world: World; tr: boolean }) {
  const main = [...world.runs].reverse().find((r) => r.branch === "main" && r.event === "push");
  const merged = world.prs.filter((p) => p.state === "merged").map((p) => `#${p.id}`);
  const red = main?.status === "failure";
  return (
    <g className="ci">
      <Sticker x={16} y={334} w={420} h={124} head={main ? (red ? "var(--red-soft)" : "var(--mint-soft)") : "var(--paper-2)"} headH={40}>
        <text x={34} y={334 + 26} className="title">
          main · {world.heads.main}
        </text>
        <text x={420} y={334 + 26} textAnchor="end" className="sub">
          {main ? (red ? (tr ? `kırmızı (run #${main.id})` : `red (run #${main.id})`) : tr ? `yeşil (run #${main.id})` : `green (run #${main.id})`) : tr ? "henüz run yok" : "no run yet"}
        </text>
        <text x={34} y={334 + 70} className="muted">
          {merged.length ? (tr ? `Merge edilen PR'lar: ${merged.join(", ")}` : `Merged PRs: ${merged.join(", ")}`) : tr ? "Henüz merge edilen PR yok." : "No PR merged yet."}
        </text>
        <text x={34} y={334 + 96} className="muted">
          {red ? (tr ? "Herkes kırık bir main'den branch açıyor." : "Everyone now branches off a broken main.") : tr ? "main'den açılan her branch sağlam başlıyor." : "Every branch off main starts healthy."}
        </text>
      </Sticker>
    </g>
  );
}
