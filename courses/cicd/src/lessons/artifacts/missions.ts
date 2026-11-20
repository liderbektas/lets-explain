import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { CiEvent, Run } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

const fresh = (ctx: CiCtx): Run[] => ctx.state.runs.filter((r) => r.id > ctx.start.runs.length);
const deployedRuns = (ctx: CiCtx) => ctx.events.flat().filter((e): e is Extract<CiEvent, { type: "deployed" }> => e.type === "deployed").map((e) => e.run);
const builds = (r: Run) => r.jobs.reduce((n, j) => n + j.steps.filter((s) => s.kind === "build" && s.status === "success").length, 0);

export const missions: Mission<CiCtx>[] = [
  {
    id: "ship",
    title: l("Staging'e ulaş", "Reach staging"),
    goal: l("Yeni bir commit'i staging'e deploy et, nasıl olursa olsun.", "Deploy a new commit to staging, any way you like."),
    hint: l("deploy job'ı boş bir makinede başlıyor: `dist/` oraya bir şekilde gelmeli.", "The deploy job starts on an empty machine: `dist/` has to get there somehow."),
    par: 2,
    check: (ctx) => deployedRuns(ctx).length > 0,
  },
  {
    id: "build-once",
    title: l("Bir kez build et", "Build once"),
    goal: l(
      "Staging'e deploy et, ama o run'da `npm run build` **sadece bir kez** çalışsın.",
      "Deploy to staging, but have `npm run build` run **only once** in that run.",
    ),
    hint: l("build job'ının ürettiği `dist/`, aynı run'daki deploy job'ına artifact olarak taşınabilir.", "The `dist/` the build job made can travel to the deploy job of the same run as an artifact."),
    par: 3,
    check: (ctx) => {
      const ids = deployedRuns(ctx);
      return fresh(ctx).some((r) => ids.includes(r.id) && builds(r) === 1);
    },
  },
  {
    id: "missing",
    title: l("Kayıp artifact", "The missing artifact"),
    goal: l("Bir run'da deploy job'ı `Artifact not found for name: dist` hatasıyla kırılsın.", "Get a run whose deploy job fails with `Artifact not found for name: dist`."),
    hint: l("İndirilecek bir şey yoksa download-artifact ne der?", "What does download-artifact say when there is nothing to download?"),
    par: 2,
    check: (ctx) => ctx.events.flat().some((e) => e.type === "artifact" && e.action === "missing"),
  },
];
