import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { ciWorkflow } from "./presets";
import { ciShell } from "./cli";
import { freshDesk, replayDesk, type Desk, type DeskAction } from "./desk";
import { workflowYaml } from "./yaml";

const apply = (d: Desk, actions: DeskAction[]) => replayDesk(d, actions).states.at(-1)!;
const type = (d: Desk, typed: string[], edits: ((t: string) => string)[] = []) => typeLines(ciShell, apply, d, typed, edits);

const CI = ".github/workflows/ci.yml";
const desk = (bugs: ("lint" | "test")[] = []) => freshDesk({ workflows: [ciWorkflow()], bugs });

describe("cicd command line", () => {
  it("a workflow edited in nano takes effect with the push that carries it", () => {
    const d = desk();
    const r = type(d, [`nano ${CI}`, 'git commit -am "Run CI on PRs to main only"', "git push"], [(t) => t.replace("  push:\n    branches: [main]\n", "")]);
    expect(r.moves).toBe(3);
    expect(r.state.world.workflows[0]!.on.push).toBeUndefined();
    // The push itself no longer starts CI: only pull requests do now.
    expect(r.state.world.runs).toHaveLength(0);
    expect(r.output).toContain(`To https://github.com/ada/shop.git`);
  });

  it("a new branch needs -u, then a PR runs the checks", () => {
    const d = desk();
    const first = type(d, ["git switch -c feature", "echo 'x' >> README.md", 'git commit -am "Docs"', "git push"]);
    expect(first.output.join("\n")).toContain("fatal: The current branch feature has no upstream branch.");
    const second = type(first.state, ["git push -u origin feature", "gh pr create --fill"]);
    expect(second.output).toContain(" * [new branch]      feature -> feature");
    expect(second.output).toContain("https://github.com/ada/shop/pull/1");
    expect(second.state.world.runs.at(-1)!.event).toBe("pull_request");
    expect(type(second.state, ["gh pr checks"]).output[0]).toBe("All checks were successful");
  });

  it("GitHub refuses an invalid workflow with its own wording", () => {
    const d = desk();
    const r = type(d, [`nano ${CI}`, 'git commit -am "ci"', "git push", "gh run list"], [(t) => t.replace("runs-on: ubuntu-latest", "runs_on: ubuntu-latest")]);
    expect(r.output.join("\n")).toContain("Invalid workflow file: .github/workflows/ci.yml#L");
    expect(r.state.world.runs).toHaveLength(0);
    expect(r.output.at(-1)).toContain("Invalid workflow file");
  });

  it("the failing log points at the code, and fixing the file fixes CI", () => {
    const d = desk(["lint"]);
    const broken = type(d, ["echo '# Shop!' > README.md", 'git commit -am "Readme"', "git push", "gh run view --log-failed"]);
    expect(broken.state.world.runs.at(-1)!.status).toBe("failure");
    expect(broken.output.join("\n")).toContain("'total' is assigned a value but never used");
    const fixed = type(broken.state, ["nano src/cart.ts", 'git commit -am "Remove unused total"', "git push"], [(t) => t.replace(/^\s*const total = .*\n/m, "")]);
    expect(fixed.state.world.runs.at(-1)!.status).toBe("success");
  });

  it("gh workflow run needs workflow_dispatch, like GitHub", () => {
    const d = desk();
    expect(type(d, ["gh workflow run ci.yml"]).output[0]).toContain("HTTP 422: Workflow does not have 'workflow_dispatch' trigger");
    const withDispatch = freshDesk({ workflows: [ciWorkflow({ on: { dispatch: [] } })] });
    const r = type(withDispatch, ["gh workflow run CI"]);
    expect(r.state.world.runs.at(-1)!.event).toBe("dispatch");
  });

  it("sets secrets with --body or the hidden prompt", () => {
    const d = desk();
    expect(type(d, ["gh secret set NPM_TOKEN --body s3cret"]).state.world.secrets.NPM_TOKEN).toBe("s3cret");
    expect(type(d, ["gh secret set DEPLOY_TOKEN"], [() => "abc"]).state.world.secrets.DEPLOY_TOKEN).toBe("abc");
  });

  it("a merged PR moves main on GitHub: push is refused until pull", () => {
    const d = desk();
    const merged = type(d, ["git switch -c feature", "echo 'x' >> README.md", 'git commit -am "Docs"', "git push -u origin feature", "gh pr create", "gh pr merge", "git switch main", "echo y > docs/guide.md", 'git commit -am "Guide"', "git push"]);
    expect(merged.output.join("\n")).toContain("! [rejected]        main -> main (fetch first)");
    const pulled = type(merged.state, ["git pull"]);
    expect(pulled.output.join("\n")).toContain("Not possible to fast-forward");
  });

  it("keeps the course's own YAML as the file's text", () => {
    const d = desk();
    expect(type(d, [`cat ${CI}`]).output.join("\n")).toBe(workflowYaml(ciWorkflow()));
  });

  it("says plainly what it does not know", () => {
    const d = desk();
    expect(type(d, ["kubectl apply"]).output[0]).toBe("bash: kubectl: command not found");
    expect(type(d, ["gh frob"]).output[0]).toBe('unknown command "frob" for "gh"');
  });
});
