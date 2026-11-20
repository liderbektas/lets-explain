import { describe, expect, it } from "vitest";
import { apply, blockingChecks, checksFor, freshWorld, globMatch, latestRun, simulate, totalMinutes, type CiAction, type Workflow } from "./ci";
import { BUILD, CHECKOUT, INSTALL, LINT, PREP, SETUP, TEST, ciWorkflow, step, withJob } from "./presets";
import { workflowYaml } from "./yaml";

const run = (actions: CiAction[], init: Parameters<typeof freshWorld>[0] = {}) => {
  const r = simulate(actions, freshWorld(init));
  return { w: r.states[r.states.length - 1]!, events: r.events };
};

describe("ci engine", () => {
  it("a push to main runs CI: every step succeeds, durations add up, minutes round up", () => {
    const { w } = run([{ type: "push" }], { workflows: [ciWorkflow()] });
    const r = latestRun(w)!;
    expect(r.status).toBe("success");
    expect(r.jobs[0]!.steps.map((s) => s.status)).toEqual(["success", "success", "success", "success", "success", "success"]);
    expect(r.end - r.start).toBe(3 + 5 + 45 + 15 + 70 + 35);
    expect(r.minutes).toBe(3);
  });

  it("each job starts on a fresh runner: no checkout means no package.json", () => {
    const wf: Workflow = { name: "CI", on: { push: {} }, jobs: [{ id: "test", steps: [SETUP, INSTALL, TEST] }] };
    const { w } = run([{ type: "push" }], { workflows: [wf] });
    const job = latestRun(w)!.jobs[0]!;
    expect(job.status).toBe("failure");
    expect(job.failedStep).toBe("Run npm ci");
    expect(job.steps.map((s) => s.status)).toEqual(["success", "failure", "skipped"]);
  });

  it("a later job does not see an earlier job's files unless they go through an artifact", () => {
    const wf: Workflow = {
      name: "CI",
      on: { push: {} },
      jobs: [
        { id: "build", steps: [...PREP, BUILD] },
        { id: "deploy", needs: ["build"], steps: [step("deploy")] },
      ],
    };
    const { w } = run([{ type: "push" }], { workflows: [wf], secrets: { DEPLOY_TOKEN: "x" } });
    expect(latestRun(w)!.jobs[1]!.failedStep).toBe("Run ./deploy.sh staging");
    const fixed = withJob(withJob(wf, "build", (j) => ({ ...j, steps: [...j.steps, step("upload")] })), "deploy", (j) => ({ ...j, steps: [step("download"), ...j.steps] }));
    const { w: w2 } = run([{ type: "push" }], { workflows: [fixed], secrets: { DEPLOY_TOKEN: "x" } });
    expect(latestRun(w2)!.status).toBe("success");
    expect(w2.envs.staging!.sha).toBe(w2.heads.main);
  });

  it("bugs fail their own step; flaky tests pass on the second attempt", () => {
    const { w } = run([{ type: "push", add: ["lint"] }], { workflows: [ciWorkflow()] });
    expect(latestRun(w)!.jobs[0]!.failedStep).toBe("Run npm run lint");
    const { w: f } = run([{ type: "push", add: ["flaky"] }, { type: "rerun" }], { workflows: [ciWorkflow()] });
    expect(f.runs.map((r) => r.status)).toEqual(["failure", "success"]);
    expect(f.runs[1]!.attempt).toBe(2);
  });

  it("parallel jobs: the run is as long as its slowest path", () => {
    const wf: Workflow = {
      name: "CI",
      on: { push: {} },
      jobs: [
        { id: "lint", steps: [...PREP, LINT] },
        { id: "test", steps: [...PREP, TEST] },
        { id: "build", needs: ["lint", "test"], steps: [...PREP, BUILD] },
      ],
    };
    const { w } = run([{ type: "push" }], { workflows: [wf] });
    const r = latestRun(w)!;
    expect(r.end - r.start).toBe(53 + 70 + 53 + 35);
    expect(r.jobs.find((j) => j.id === "build")!.start).toBe(r.start + 53 + 70);
  });

  it("matrix: one leg per node version; fail-fast cancels the slower legs", () => {
    const wf = ciWorkflow({ jobs: [{ id: "test", matrix: [20, 22], steps: [CHECKOUT, SETUP, INSTALL, TEST] }] });
    const { w } = run([{ type: "push", add: ["node20"] }], { workflows: [wf] });
    const legs = latestRun(w)!.jobs;
    expect(legs.map((j) => j.label)).toEqual(["test (20)", "test (22)"]);
    expect(legs.map((j) => j.status)).toEqual(["failure", "success"]); // same length: nothing left to cancel
    const slow = ciWorkflow({ jobs: [{ id: "test", matrix: [20, 22], steps: [CHECKOUT, SETUP, INSTALL, TEST, step("e2e")] }] });
    const { w: w2 } = run([{ type: "push", add: ["node20"] }], { workflows: [slow] });
    expect(latestRun(w2)!.jobs.map((j) => j.status)).toEqual(["failure", "cancelled"]);
    const { w: w3 } = run([{ type: "push", add: ["node20"] }], { workflows: [{ ...slow, jobs: [{ ...slow.jobs[0]!, failFast: false }] }] });
    expect(latestRun(w3)!.jobs.map((j) => j.status)).toEqual(["failure", "success"]);
  });

  it("cache: miss then save, hit on the next run, new key when the lockfile changes", () => {
    const wf = ciWorkflow({ jobs: [{ id: "ci", steps: [CHECKOUT, SETUP, step("cache"), INSTALL, TEST] }] });
    const { w, events } = run([{ type: "push" }, { type: "push" }, { type: "push", lock: true }], { workflows: [wf] });
    const results = events.flat().flatMap((e) => (e.type === "cache" ? [e.result] : []));
    expect(results).toEqual(["miss", "saved", "hit", "miss", "saved"]);
    const installs = w.runs.map((r) => r.jobs[0]!.steps.find((s) => s.kind === "install")!.seconds);
    expect(installs).toEqual([45, 12, 45]);
  });

  it("a static cache key on node_modules hands back stale dependencies", () => {
    const wf = ciWorkflow({ jobs: [{ id: "ci", steps: [CHECKOUT, SETUP, step("cache", { with: { path: "node_modules", key: "static" } }), step("install", { if: "cache-miss" }), TEST] }] });
    const { w } = run([{ type: "push" }, { type: "push", lock: true }], { workflows: [wf] });
    expect(w.runs.map((r) => r.status)).toEqual(["success", "failure"]);
    expect(w.runs[1]!.jobs[0]!.steps.at(-1)!.log.join("\n")).toContain("Cannot find module");
  });

  it("path filters, branch filters and [skip ci]", () => {
    const wf = ciWorkflow({ on: { push: { branches: ["main"], pathsIgnore: ["docs/**", "**/*.md"] } } });
    const { w, events } = run(
      [{ type: "push", paths: ["README.md"] }, { type: "push", paths: ["src/a.ts"], message: "wip [skip ci]" }, { type: "push", branch: "feature" }, { type: "push", paths: ["src/a.ts"] }],
      { workflows: [wf] },
    );
    expect(events.flat().flatMap((e) => (e.type === "notTriggered" ? [e.reason] : []))).toEqual(["paths", "skip-ci", "branch"]);
    expect(w.runs).toHaveLength(1);
    expect(globMatch("src/**", "src/a/b.ts")).toBe(true);
    expect(globMatch("*.md", "docs/a.md")).toBe(false);
    expect(globMatch("**/*.md", "docs/a.md")).toBe(true);
  });

  it("concurrency cancels the older run still going; minutes drop", () => {
    const wf = ciWorkflow();
    const pushes: CiAction[] = [{ type: "push" }, { type: "push" }, { type: "push" }];
    const plain = run(pushes, { workflows: [wf] }).w;
    const grouped = run(pushes, { workflows: [{ ...wf, concurrency: true }] }).w;
    expect(plain.runs.map((r) => r.status)).toEqual(["success", "success", "success"]);
    expect(grouped.runs.map((r) => r.status)).toEqual(["cancelled", "cancelled", "success"]);
    expect(totalMinutes(grouped)).toBeLessThan(totalMinutes(plain));
    // Turning concurrency on does not cancel runs that started without a group.
    const later = simulate([...pushes, { type: "setWorkflow", workflow: { ...wf, concurrency: true } }, { type: "push" }], freshWorld({ workflows: [wf] }));
    expect(later.states.at(-1)!.runs.map((r) => r.status)).toEqual(["success", "success", "success", "success"]);
  });

  it("timeout-minutes stops a stuck job", () => {
    const wf = ciWorkflow({ jobs: [{ id: "e2e", steps: [...PREP, step("hang")] }] });
    const stuck = run([{ type: "push" }], { workflows: [wf] }).w;
    expect(latestRun(stuck)!.minutes).toBe(360);
    const capped = run([{ type: "push" }], { workflows: [{ ...wf, jobs: [{ ...wf.jobs[0]!, timeout: 15 }] }] }).w;
    expect(latestRun(capped)!.jobs[0]!.reason).toBe("timeout");
    expect(latestRun(capped)!.minutes).toBe(15);
  });

  it("protected main: a red required check blocks the merge; fixing it unblocks", () => {
    const init = { workflows: [ciWorkflow()], protection: ["CI / ci"] };
    let w = run([{ type: "push", branch: "feature", add: ["test"] }, { type: "openPr", branch: "feature" }], init).w;
    expect(checksFor(w, 1)).toEqual([{ name: "CI / ci", state: "failure", required: true }]);
    const blocked = apply(w, { type: "merge", pr: 1 });
    expect(blocked.state).toBe(w);
    expect(blocked.events[0]).toMatchObject({ type: "mergeBlocked" });
    w = apply(w, { type: "push", branch: "feature", fix: ["test"] }).state;
    expect(blockingChecks(w, 1)).toEqual([]);
    w = apply(w, { type: "merge", pr: 1 }).state;
    expect(w.prs[0]!.state).toBe("merged");
    expect(latestRun(w)!.event).toBe("push");
  });

  it("a required check that a path filter never starts stays expected", () => {
    const wf = ciWorkflow({ on: { pull_request: { paths: ["src/**"] } } });
    const w = run([{ type: "push", branch: "docs", paths: ["docs/intro.md"] }, { type: "openPr", branch: "docs" }], { workflows: [wf], protection: ["CI / ci"] }).w;
    expect(blockingChecks(w, 1)).toEqual(["CI / ci"]);
  });

  it("environments: approval holds the deploy job until a reviewer approves", () => {
    const wf: Workflow = {
      name: "Deploy",
      on: { push: { branches: ["main"] } },
      jobs: [
        { id: "build", steps: [...PREP, BUILD, step("upload")] },
        { id: "prod", needs: ["build"], environment: "production", steps: [step("download"), step("deploy", { with: { env: "production" } })] },
      ],
    };
    let w = run([{ type: "push" }], { workflows: [wf], envs: [{ name: "production", approval: true }], secrets: { DEPLOY_TOKEN: "x" } }).w;
    expect(latestRun(w)!.status).toBe("waiting");
    expect(w.envs.production!.sha).toBeNull();
    w = apply(w, { type: "approve" }).state;
    expect(latestRun(w)!.status).toBe("success");
    expect(w.envs.production!.sha).toBe(w.heads.main);
  });

  it("forks get no secrets", () => {
    const wf: Workflow = { name: "Release", on: { pull_request: {} }, jobs: [{ id: "publish", steps: [...PREP, step("publish")] }] };
    // A token shaped like npm's: npm turns away anything else with a 401.
    const secrets = { NPM_TOKEN: "npm_8f2kQx7Lr0aW3mZt9" };
    const own = run([{ type: "push", branch: "f" }, { type: "openPr", branch: "f" }], { workflows: [wf], secrets }).w;
    const fork = run([{ type: "push", branch: "f" }, { type: "openPr", branch: "f", fork: true }], { workflows: [wf], secrets }).w;
    expect(latestRun(own)!.status).toBe("success");
    expect(latestRun(fork)!.status).toBe("failure");
  });

  it("smoke test catches a crashing build; an if: failure() step rolls back", () => {
    const wf: Workflow = {
      name: "Deploy",
      on: { push: { branches: ["main"] } },
      jobs: [{ id: "deploy", steps: [...PREP, BUILD, step("deploy"), step("smoke"), step("rollback", { if: "failure" })] }],
    };
    const w = run([{ type: "push" }, { type: "push", add: ["crash"] }], { workflows: [wf], secrets: { DEPLOY_TOKEN: "x" } }).w;
    expect(w.runs.map((r) => r.status)).toEqual(["success", "failure"]);
    expect(w.envs.staging!.sha).toBe(w.runs[0]!.sha);
    // Each step that changed the environment says what it left there, in order.
    expect(w.runs[1]!.jobs[0]!.steps.flatMap((st) => (st.delivered ? [st.delivered] : []))).toEqual([
      { env: "staging", sha: w.runs[1]!.sha },
      { env: "staging", sha: w.runs[0]!.sha },
    ]);
  });

  it("job outputs and job-level if on changed paths", () => {
    const wf: Workflow = {
      name: "CI",
      on: { push: {} },
      jobs: [
        { id: "changes", steps: [step("changes", { with: { filters: "src/**,docs/**" } })] },
        { id: "test", needs: ["changes"], if: "changed:src/**", steps: [...PREP, TEST] },
      ],
    };
    const w = run([{ type: "push", paths: ["docs/a.md"] }, { type: "push", paths: ["src/a.ts"] }], { workflows: [wf] }).w;
    expect(w.runs.map((r) => r.jobs[1]!.status)).toEqual(["skipped", "success"]);
    expect(w.runs[0]!.jobs[0]!.outputs).toEqual({ "src/**": "false", "docs/**": "true" });
  });

  it("a job whose needed job was skipped is skipped too, unless it runs always()", () => {
    const wf: Workflow = {
      name: "CI",
      on: { push: {} },
      jobs: [
        { id: "build", steps: [...PREP, BUILD] },
        { id: "staging", needs: ["build"], if: "main", steps: [step("notify")] },
        { id: "prod", needs: ["staging"], steps: [step("notify")] },
        { id: "report", needs: ["staging"], if: "always", steps: [step("summary")] },
      ],
    };
    const w = run([{ type: "push", branch: "feature" }], { workflows: [wf] }).w;
    expect(latestRun(w)!.jobs.map((j) => j.status)).toEqual(["success", "skipped", "skipped", "success"]);
    expect(latestRun(w)!.jobs[2]!.reason).toBe("needs");
  });

  it("refused moves return the same state", () => {
    const w = freshWorld();
    expect(apply(w, { type: "rerun" }).state).toBe(w);
    expect(apply(w, { type: "approve" }).state).toBe(w);
    expect(apply(w, { type: "merge", pr: 1 }).state).toBe(w);
  });

  it("renders a valid-looking workflow file", () => {
    const yaml = workflowYaml(ciWorkflow({ concurrency: true, jobs: [{ id: "test", matrix: [20, 22], failFast: false, timeout: 10, steps: [CHECKOUT, SETUP, step("cache"), INSTALL, TEST] }] }));
    expect(yaml).toContain("name: CI");
    expect(yaml).toContain("  push:\n    branches: [main]");
    expect(yaml).toContain("cancel-in-progress: true");
    expect(yaml).toContain("node-version: ${{ matrix.node }}");
    expect(yaml).toContain("key: npm-${{ hashFiles('package-lock.json') }}");
    expect(yaml).toContain("fail-fast: false");
    expect(yaml).toContain("timeout-minutes: 10");
  });
});
