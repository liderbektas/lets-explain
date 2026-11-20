import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { commitOf } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

/** The message of the broken commit the sandbox pushes. */
export const BUG_MSG = "add VAT to cart total";

const bugCommits = (ctx: CiCtx) => ctx.state.commits.filter((c) => c.message === BUG_MSG);

export const missions: Mission<CiCtx>[] = [
  {
    id: "caught",
    title: l("Anında yakala", "Catch it at once"),
    goal: l("Hatalı bir commit, push'landığı anda **kendi** run'ında kırmızı olsun.", "Have a broken commit go red in **its own** run, right when it is pushed."),
    hint: l("Önce bir workflow gerek, sonra hatalı commit.", "First you need a workflow, then the broken commit."),
    par: 2,
    check: (ctx) => bugCommits(ctx).some((c) => ctx.state.runs.some((r) => r.sha === c.sha && r.status === "failure")),
  },
  {
    id: "late",
    title: l("Geç fark etmek", "Finding out late"),
    goal: l(
      "Hatalı bir commit main'e **hiç kontrol edilmeden** girsin; hata sonra **başka bir commit'in** run'ında ortaya çıksın.",
      "Let a broken commit land on main **with no check at all**; the bug then shows up in **another commit's** run.",
    ),
    hint: l("Workflow yokken push'la, sonra CI'ı ekle ve bir commit daha gönder.", "Push while there is no workflow, then add CI and send one more commit."),
    par: 3,
    check: (ctx) => {
      const unchecked = bugCommits(ctx).filter((c) => !ctx.state.runs.some((r) => r.sha === c.sha));
      return unchecked.length > 0 && ctx.state.runs.some((r) => r.status === "failure" && commitOf(ctx.state, r.sha).message !== BUG_MSG);
    },
  },
  {
    id: "safe-staging",
    title: l("Staging temiz kalsın", "Keep staging clean"),
    goal: l(
      "Hatalı bir commit push'la ve düzelt. Staging düzeltilmiş yeni bir commit'i çalıştırsın ve hatalı commit **hiçbir zaman** staging'e gitmesin.",
      "Push a broken commit and fix it. Staging should run a new, fixed commit, and the broken one must **never** reach staging.",
    ),
    hint: l("Deploy'u bir insana değil, yeşil testlere bağla.", "Tie the deploy to green tests, not to a person."),
    par: 3,
    check: (ctx) => {
      const env = ctx.state.envs.staging;
      if (!env?.sha || env.sha === ctx.start.envs.staging?.sha || bugCommits(ctx).length === 0) return false;
      return env.history.every((sha) => commitOf(ctx.state, sha).bugs.length === 0);
    },
  },
];
