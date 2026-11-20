import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { StepKind } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

/** Did some run have a step of this kind end with this status? */
const stepEnded = (ctx: CiCtx, kind: StepKind, status: "success" | "failure", exit?: number) =>
  ctx.state.runs.some((r) => r.jobs.some((j) => j.steps.some((s) => s.kind === kind && s.status === status && (exit === undefined || s.exit === exit))));

export const missions: Mission<CiCtx>[] = [
  {
    id: "no-node",
    title: l("npm nerede?", "Where is npm?"),
    goal: l(
      "Bir run'da `npm ci` adımı **exit code 127** (`npm: command not found`) ile kırılsın.",
      "Get a run where the `npm ci` step fails with **exit code 127** (`npm: command not found`).",
    ),
    hint: l("Runner'da kod olsun ama Node kurulmasın.", "Give the runner the code but no Node."),
    par: 3,
    check: (ctx) => stepEnded(ctx, "install", "failure", 127),
  },
  {
    id: "first-green",
    title: l("İlk yeşil", "First green"),
    goal: l("`npm test`'in gerçekten çalışıp geçtiği yeşil bir run al.", "Get a green run in which `npm test` really ran and passed."),
    hint: l("Testin çalışması için önce kod, sonra Node, sonra bağımlılıklar gerek.", "Tests need the code, then Node, then the dependencies."),
    par: 5,
    check: (ctx) => ctx.state.runs.some((r) => r.status === "success" && r.jobs.some((j) => j.steps.some((s) => s.kind === "test" && s.status === "success"))),
  },
  {
    id: "test-then-build",
    title: l("Önce test, sonra build", "Test first, then build"),
    goal: l(
      "Yeşil bir run'da hem `npm test` hem `npm run build` çalışsın ve build **testten sonra** gelsin.",
      "Get a green run where both `npm test` and `npm run build` ran, with the build **after** the tests.",
    ),
    hint: l("Adımlar dosyadaki sırayla, yukarıdan aşağı çalışır.", "Steps run in the file's order, top to bottom."),
    par: 6,
    check: (ctx) =>
      ctx.state.runs.some((r) => {
        if (r.status !== "success") return false;
        const kinds = r.jobs[0]?.steps.filter((s) => s.status === "success").map((s) => s.kind) ?? [];
        const t = kinds.indexOf("test");
        const b = kinds.indexOf("build");
        return t >= 0 && b > t;
      }),
  },
];
