import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { CiCtx } from "../shared/ci";

const stagingMoved = (ctx: CiCtx) => {
  const sha = ctx.state.envs.staging?.sha;
  return Boolean(sha) && sha !== ctx.start.envs.staging?.sha;
};
const artifactUsed = (ctx: CiCtx) => ctx.events.flat().some((e) => e.type === "artifact" && e.action !== "missing");

export const missions: Mission<CiCtx>[] = [
  {
    id: "no-code",
    title: l("Kod nerede?", "Where is the code?"),
    goal: l(
      "`deploy` job'ında `npm ci` çalışsın ve `package.json`'ı bulamadığı için **ENOENT** (exit 254) ile kırılsın.",
      "Have `npm ci` run in the `deploy` job and fail with **ENOENT** (exit 254) because it cannot find `package.json`.",
    ),
    hint: l("`build` job'ı kodu çekti, ama `deploy` başka bir makinede.", "The `build` job fetched the code, but `deploy` is on another machine."),
    par: 2,
    check: (ctx) => ctx.state.runs.some((r) => r.jobs.some((j) => j.id === "deploy" && j.steps.some((s) => s.kind === "install" && s.status === "failure" && s.exit === 254))),
  },
  {
    id: "hand-over",
    title: l("Elden ele", "Hand it over"),
    goal: l(
      "Build'i bir kez yap: `dist/` `build` job'ından `deploy` job'ına taşınsın ve staging yeni commit'i çalıştırsın.",
      "Build only once: `dist/` should travel from the `build` job to the `deploy` job, and staging should run the new commit.",
    ),
    hint: l("Bir job bir şeyi bırakmalı, diğeri onu almalı.", "One job has to leave something behind, the other has to pick it up."),
    par: 3,
    check: (ctx) => stagingMoved(ctx) && ctx.events.flat().some((e) => e.type === "artifact" && e.action === "downloaded"),
  },
  {
    id: "rebuild",
    title: l("Kendin yap", "Do it yourself"),
    goal: l(
      "Artifact **kullanmadan** staging yeni commit'i çalıştırsın: `deploy` job'ı `dist/`'i kendisi üretsin.",
      "Get staging onto the new commit **without** any artifact: the `deploy` job must produce `dist/` itself.",
    ),
    hint: l("Boş bir makinede build yapmak için neler gerektiğini hatırla: kod, Node, bağımlılıklar.", "Remember what a build needs on an empty machine: code, Node, dependencies."),
    par: 5,
    check: (ctx) => stagingMoved(ctx) && !artifactUsed(ctx),
  },
];
