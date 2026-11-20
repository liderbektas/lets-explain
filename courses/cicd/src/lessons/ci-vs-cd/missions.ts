import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { commitOf } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

const prodMoved = (ctx: CiCtx) => {
  const sha = ctx.state.envs.production?.sha;
  return Boolean(sha) && sha !== ctx.start.envs.production?.sha;
};
const approvals = (ctx: CiCtx) => ctx.events.flat().filter((e) => e.type === "approved" && e.env === "production").length;

export const missions: Mission<CiCtx>[] = [
  {
    id: "delivery",
    title: l("Continuous Delivery", "Continuous Delivery"),
    goal: l("Production yeni bir commit'i çalıştırsın, ama **bir insan onayladıktan sonra**.", "Have production run a new commit, but **only after a person approves it**."),
    hint: l("Production'ın onay şartı açık. Pipeline orada durup seni bekleyecek.", "Production's approval rule is on. The pipeline will stop there and wait for you."),
    par: 2,
    check: (ctx) => prodMoved(ctx) && approvals(ctx) > 0,
  },
  {
    id: "deployment",
    title: l("Continuous Deployment", "Continuous Deployment"),
    goal: l("Production yeni bir commit'i çalıştırsın, **hiç onay vermeden**.", "Have production run a new commit **without any approval**."),
    hint: l("Kapıda kimse beklemesin.", "Let nobody wait at the gate."),
    par: 2,
    check: (ctx) => prodMoved(ctx) && approvals(ctx) === 0,
  },
  {
    id: "gate",
    title: l("Kapı tutuyor", "The gate holds"),
    goal: l(
      "Hatalı bir commit push'la, sonra düzelt. Production düzeltilmiş commit'i çalıştırsın; hatalı commit **hiçbir ortama** gitmesin.",
      "Push a broken commit, then fix it. Production should run the fixed commit; the broken one must reach **no environment at all**.",
    ),
    hint: l("Testler kırık commit'i build'de durdurur. Sonra düzeltmeyi production'a kadar götür.", "The tests stop the broken commit at the build. Then take the fix all the way to production."),
    par: 3,
    check: (ctx) => {
      const pushedBug = ctx.state.commits.some((c) => c.n > ctx.start.commits.length && c.bugs.length > 0);
      const clean = Object.values(ctx.state.envs).every((e) => e.history.every((sha) => commitOf(ctx.state, sha).bugs.length === 0));
      return pushedBug && clean && prodMoved(ctx);
    },
  },
];
