import { describe, expect, it } from "vitest";
import type { World } from "./ci";
import { problemText, readCond, readWorkflow } from "./readYaml";
import { workflowYaml } from "./yaml";

/** Every workflow any lesson shows, from every state of every lesson's story. */
const scenes = import.meta.glob<{ scene?: { run: { states: unknown[] } } }>("../lessons/*/Scene.tsx", { eager: true });
const texts = new Set<string>();
for (const mod of Object.values(scenes)) {
  for (const st of mod.scene?.run.states ?? []) {
    const w = st as Partial<World>;
    if (Array.isArray(w.workflows)) for (const wf of w.workflows) texts.add(workflowYaml(wf));
  }
}

describe("readWorkflow", () => {
  it("found the lessons' workflows", () => {
    expect(texts.size).toBeGreaterThan(30);
  });

  it("reads back every workflow the lessons write, unchanged", () => {
    for (const text of texts) {
      const r = readWorkflow(text);
      if (!r.ok) throw new Error(`${r.problems.map((p) => problemText("ci.yml", p)).join("\n")}\n---\n${text}`);
      expect(workflowYaml(r.workflow)).toBe(text);
    }
  });

  it("reads the short forms people write", () => {
    const r = readWorkflow("name: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n");
    expect(r.ok && r.workflow.on).toEqual({ push: {}, pull_request: {} });
    const s = readWorkflow("on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n");
    expect(s.ok && s.workflow.name).toBe("ci.yml");
  });

  it("rejects what GitHub rejects, with its wording and line", () => {
    const missing = readWorkflow("name: CI\non: push\njobs:\n  test:\n    steps:\n      - run: npm test\n");
    expect(!missing.ok && problemText(".github/workflows/ci.yml", missing.problems[0]!)).toBe(
      "Invalid workflow file: .github/workflows/ci.yml#L4\nThe workflow is not valid. .github/workflows/ci.yml (Line: 4, Col: 3): Required property is missing: runs-on",
    );
    const typo = readWorkflow("name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    step:\n      - run: npm test\n");
    expect(!typo.ok && typo.problems.map((p) => p.message)).toContain("Unexpected value 'step'");
    const syntax = readWorkflow("name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n   steps: [\n");
    expect(!syntax.ok && syntax.problems[0]!.message).toMatch(/^You have an error in your yaml syntax on line \d+$/);
    const needs = readWorkflow("on: push\njobs:\n  deploy:\n    needs: tset\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci\n");
    expect(!needs.ok && needs.problems[0]!.message).toBe("Job 'deploy' depends on unknown job 'tset'.");
  });

  it("says plainly what the sandbox cannot run", () => {
    const r = readWorkflow("on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: make deploy\n");
    expect(!r.ok && r.problems[0]!.kind).toBe("sandbox");
  });

  it("reads conditions with or without ${{ }}", () => {
    expect(readCond("${{ always() }}")).toBe("always");
    expect(readCond('github.ref == "refs/heads/main"')).toBe("main");
    expect(readCond("needs.changes.outputs.web == 'true'", { web: "web/**" })).toBe("changed:web/**");
  });
});
