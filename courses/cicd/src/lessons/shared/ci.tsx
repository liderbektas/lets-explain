import type { Change, Scenario } from "@lets-explain/core/course/types";
import { l, type L } from "@lets-explain/core/i18n";
import { apply, fmt, globMatch, latestRun, totalMinutes, type CiAction, type CiEvent, type Run, type Workflow, type World } from "../../engine/ci";
import { describeCi } from "../../engine/describe";
import { workflowFile, workflowYaml } from "../../engine/yaml";
import { AssemblyStage } from "../../iso/AssemblyLine";
import { HOLD_MS } from "../../iso/replay";
import { YamlPanel } from "../../iso/panels";
import type { Box } from "../../iso/parts";
import { ciShell } from "../../engine/cli";
import { deskOf, replayDesk, type Desk, type DeskAction } from "../../engine/desk";
import type { Ctx, Sim, TypedSim, ViewInfo } from "./SimScene";

/** The course's GitHub Actions model as a scene simulation. */
export const ciSim: Sim<World, CiAction, CiEvent> = {
  apply,
  describe: describeCi,
  changes: ciChanges,
  // A run (or a run an approval let go on) is played back on the stage; wait for it.
  hold: (events) => (events.some((e) => e.type === "triggered" || e.type === "approved") ? HOLD_MS : 1000),
};

export type CiCtx = Ctx<World, CiAction, CiEvent>;
export type CiInfo = ViewInfo<World, CiAction, CiEvent>;

const STATUS: Record<Run["status"], L> = {
  queued: l("sırada", "queued"),
  waiting: l("onay bekliyor", "waiting for approval"),
  success: l("başarılı", "succeeded"),
  failure: l("başarısız", "failed"),
  skipped: l("atlandı", "skipped"),
  cancelled: l("iptal edildi", "cancelled"),
};

/** "What changed" between two worlds, in both languages. */
export function ciChanges(before: World, after: World): Change[] {
  const out: Change[] = [];
  for (const wf of after.workflows) {
    const old = before.workflows.find((x) => x.name === wf.name);
    if (!old) out.push({ kind: "add", text: l(`Workflow dosyası: \`${workflowFile(wf)}\``, `Workflow file: \`${workflowFile(wf)}\``) });
    else if (workflowYaml(old) !== workflowYaml(wf)) out.push({ kind: "change", text: l(`\`${workflowFile(wf)}\` değişti`, `\`${workflowFile(wf)}\` changed`) });
  }
  for (const wf of before.workflows) if (!after.workflows.some((x) => x.name === wf.name)) out.push({ kind: "remove", text: l(`\`${workflowFile(wf)}\` silindi`, `\`${workflowFile(wf)}\` removed`) });
  if (JSON.stringify(before.protection) !== JSON.stringify(after.protection)) {
    out.push(
      after.protection
        ? { kind: "change", text: l(`main korumalı: zorunlu check'ler ${after.protection.map((c) => `\`${c}\``).join(", ")}`, `main is protected: required checks ${after.protection.map((c) => `\`${c}\``).join(", ")}`) }
        : { kind: "change", text: l("main korumasız: her şey merge edilebilir", "main is unprotected: anything can merge") },
    );
  }
  const commits = after.commits.length - before.commits.length;
  if (commits > 0) out.push({ kind: "add", text: l(`${commits} yeni commit`, `${commits} new commit${commits > 1 ? "s" : ""}`) });
  for (const p of after.prs) {
    const old = before.prs.find((x) => x.id === p.id);
    if (!old) out.push({ kind: "add", text: l(`PR #${p.id} açıldı (${p.branch} → main)`, `PR #${p.id} opened (${p.branch} → main)`) });
    else if (old.state !== p.state) out.push({ kind: "good", text: l(`PR #${p.id} merge edildi`, `PR #${p.id} merged`) });
  }
  for (const r of after.runs) {
    const old = before.runs.find((x) => x.id === r.id);
    if (old && old.status === r.status) continue;
    const kind: Change["kind"] = r.status === "success" ? "good" : r.status === "failure" ? "bad" : "change";
    const failed = r.jobs.find((j) => j.status === "failure");
    const why = failed?.failedStep ? ` (${failed.label}: ${failed.failedStep.replace(/^Run /, "")})` : "";
    out.push({
      kind,
      text: l(`Run #${r.id} ${r.workflow}: ${STATUS[r.status].tr}, ${fmt(r.end - r.start)}${why}`, `Run #${r.id} ${r.workflow}: ${STATUS[r.status].en}, ${fmt(r.end - r.start)}${why}`),
    });
  }
  const mins = totalMinutes(after) - totalMinutes(before);
  if (mins > 0) out.push({ kind: "change", text: l(`${mins} dakika faturalandı`, `${mins} minutes billed`) });
  for (const k of Object.keys(after.cache)) if (!before.cache[k]) out.push({ kind: "add", text: l(`Cache kaydı: \`${k}\``, `Cache entry: \`${k}\``) });
  for (const k of Object.keys(after.registry)) if (!before.registry[k]) out.push({ kind: "add", text: l(`Registry'de image: \`${k}\``, `Image in the registry: \`${k}\``) });
  for (const [name, e] of Object.entries(after.envs)) {
    const old = before.envs[name];
    if ((old?.sha ?? null) !== e.sha) out.push({ kind: "good", text: l(`${name} artık \`${e.sha}\` çalıştırıyor`, `${name} now runs \`${e.sha}\``) });
    if (old && old.approval !== e.approval) out.push({ kind: "change", text: e.approval ? l(`${name} için onay şartı açıldı`, `${name} now needs an approval`) : l(`${name} için onay şartı kalktı`, `${name} no longer needs an approval`) });
  }
  for (const k of Object.keys(after.secrets)) if (!(k in before.secrets)) out.push({ kind: "add", text: l(`Secret \`${k}\` eklendi`, `Secret \`${k}\` added`) });
  return out;
}

/** The run the last action started, or the newest one. */
export function focusRun(w: World, info: Pick<CiInfo, "last">, workflow?: string): Run | undefined {
  const started = [...info.last].reverse().find((e) => e.type === "triggered" || e.type === "approved" || e.type === "runDone");
  if (started && "run" in started) return w.runs.find((r) => r.id === started.run);
  return latestRun(w, workflow);
}

/** The last action pushed a commit but started no run (a filter, `[skip ci]`, or no workflow at all). */
export const startedNothing = (info: Pick<CiInfo, "last">) => info.last.some((e) => e.type === "pushed") && !info.last.some((e) => e.type === "triggered");

/** What a commit that started nothing says on the stage. */
export const nothingStarted = (tr: boolean) => (tr ? "Bu push hiçbir run başlatmadı." : "This push started no run.");

/** A workflow's file on the left, its latest run on the right. Changed lines light up. */
export function YamlAndRun({ world, prev, workflow, run, focus, blocked, yamlBox = { x: 16, y: 14, w: 350, h: 444 }, runBox = { x: 384, y: 14, w: 462, h: 444 } }: { world: World; prev?: World; workflow?: string; run?: Run; focus?: string; blocked?: string; yamlBox?: Box; runBox?: Box }) {
  const wf: Workflow | undefined = workflow ? world.workflows.find((x) => x.name === workflow) : world.workflows[0];
  const old = wf && prev ? prev.workflows.find((x) => x.name === wf.name) : undefined;
  return (
    <g>
      {wf && <YamlPanel yaml={workflowYaml(wf)} prev={old ? workflowYaml(old) : undefined} box={yamlBox} title={workflowFile(wf)} />}
      {blocked ? <AssemblyStage box={runBox} blocked empty={blocked} /> : <AssemblyStage run={run ?? (wf ? latestRun(world, wf.name) : latestRun(world))} box={runBox} focus={focus} />}
    </g>
  );
}

/** Common counters for the scene's top bar. */
export function runMetrics(w: World, t: (x: L) => string, run?: Run) {
  const r = run ?? latestRun(w);
  return [
    { label: t(l("Son run", "Last run")), value: r ? `#${r.id} ${t(STATUS[r.status])}` : "—", tone: r?.status === "failure" ? ("danger" as const) : r?.status === "success" ? ("ok" as const) : ("plain" as const) },
    { label: t(l("Süre", "Duration")), value: r ? fmt(r.end - r.start) : "—" },
    { label: t(l("Toplam dakika", "Minutes billed")), value: totalMinutes(w) },
  ];
}

/* -------------------------------------------------------------- typing */

/** What a typed scenario's check sees: the desks (laptop + GitHub) from start to now. */
export interface DeskCtx {
  start: Desk;
  state: Desk;
  actions: DeskAction[];
  events: CiEvent[][];
  states: Desk[];
}

export type CiScenario = Scenario<DeskCtx, Desk>;

/**
 * The try-it step played by typing, for a lesson drawn from the GitHub model: the terminal
 * works on a desk, the scene draws the desk's GitHub side. Free play starts from the lesson's
 * end state, checked out on main.
 */
export function ciTyped(scenarios: CiScenario[], freeStart: (end: World) => Desk = (end) => deskOf(end)): TypedSim<World, CiEvent, Desk, DeskAction, DeskCtx> {
  return {
    scenarios,
    freeStart,
    shell: ciShell,
    replay: replayDesk,
    project: (d) => d.world,
    context: (start, actions, r) => ({ start, state: r.states[r.states.length - 1]!, actions, events: r.events, states: r.states }),
  };
}

/**
 * Would this workflow start for an event? The same branch and path rules GitHub (and the
 * engine) use, so a scenario can check a workflow's triggers without pushing every case.
 */
export function wouldStart(wf: Workflow | undefined, event: "push" | "pull_request", branch: string, paths: string[]): boolean {
  const f = wf?.on[event];
  if (!f) return false;
  if (f.branches && !f.branches.some((b) => globMatch(b, branch))) return false;
  if (f.paths && !paths.some((p) => f.paths!.some((g) => globMatch(g, p)))) return false;
  if (f.pathsIgnore && paths.every((p) => f.pathsIgnore!.some((g) => globMatch(g, p)))) return false;
  return true;
}

/** The workflow called `name` as GitHub has it now (what was pushed, not what is in the folder). */
export const liveWorkflow = (d: Desk, name = "CI") => d.world.workflows.find((w) => w.name === name);
