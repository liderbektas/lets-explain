import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { commitOf } from "../../engine/ci";
import type { CiCtx } from "../shared/ci";

const PAGES = "github-pages";

export const missions: Mission<CiCtx>[] = [
  {
    id: "live",
    title: l("Yayına al", "Go live"),
    goal: l("GitHub Pages, main'in son commit'ini yayınlasın.", "Get GitHub Pages serving main's newest commit."),
    hint: l("Deploy job'ı ayrı bir makinede; build'in çıktısı ona bir artifact olarak gitmeli.", "The deploy job runs on another machine; the build output has to reach it as an artifact."),
    par: 2,
    check: (ctx) => Boolean(ctx.state.envs[PAGES]?.sha) && ctx.state.envs[PAGES]!.sha === ctx.state.heads.main,
  },
  {
    id: "pr-safe",
    title: l("PR'lar sadece build etsin", "PRs only build"),
    goal: l(
      "Bir PR'da build job'ı geçsin, deploy job'ı ise **atlansın**.",
      "On a PR, the build job passes and the deploy job is **skipped**.",
    ),
    hint: l("Deploy job'ına ne zaman çalışacağını söyleyen bir koşul gerek.", "The deploy job needs a condition that says when it may run."),
    par: 3,
    check: (ctx) =>
      ctx.state.runs.some((r) => r.event === "pull_request" && r.jobs.find((j) => j.id === "build")?.status === "success" && r.jobs.find((j) => j.id === "deploy")?.status === "skipped"),
  },
  {
    id: "tests-guard",
    title: l("Kırık test yayına çıkmasın", "No broken test goes live"),
    goal: l(
      "main'e kırık testli bir commit gelsin; pipeline onu **testte** durdursun ve Pages'e hiç ulaşmasın.",
      "A commit with a broken test lands on main; the pipeline stops it **at the tests** and it never reaches Pages.",
    ),
    hint: l("Pipeline'ın şu an hiç test çalıştırmadığına dikkat et.", "Notice that the pipeline runs no tests at all right now."),
    par: 2,
    check: (ctx) =>
      ctx.state.runs.some((r) => r.jobs.some((j) => j.steps.some((s) => s.kind === "test" && s.status === "failure"))) &&
      !ctx.states.some((s) => {
        const sha = s.envs[PAGES]?.sha;
        return Boolean(sha) && commitOf(s, sha!).bugs.includes("test");
      }),
  },
];
