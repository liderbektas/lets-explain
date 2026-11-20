import type { Cond, Filter, JobDef, StepDef, Workflow } from "./ci";

/**
 * Turns a workflow from the model into the GitHub Actions YAML you would write for it.
 * Scenes show this file next to the run, and lessons copy it into "In your project" cards,
 * so what the reader toggles in the sandbox is always a real, valid workflow.
 */

export function condYaml(c: Cond, where: "job" | "step"): string | null {
  switch (c) {
    case "success":
      return null;
    case "failure":
      return "failure()";
    case "always":
      return "always()";
    case "main":
      return "github.ref == 'refs/heads/main' && github.event_name == 'push'";
    case "push":
      return "github.event_name == 'push'";
    case "cache-miss":
      return "steps.cache.outputs.cache-hit != 'true'";
    case "not-fork":
      return "github.event.pull_request.head.repo.fork != true";
    default: {
      const glob = c.slice("changed:".length);
      return where === "job" ? `needs.changes.outputs.${filterName(glob)} == 'true'` : `steps.filter.outputs.${filterName(glob)} == 'true'`;
    }
  }
}

/** `src/**` → `src`, `docs/**` → `docs`: the name a paths-filter output gets. */
export const filterName = (glob: string) => glob.replace(/\/?\*.*$/, "").replace(/[^a-z0-9]+/gi, "-") || "all";

/** A `run:` command as YAML: plain when it can be, single-quoted when ": " or " #" would break it. */
export const runValue = (cmd: string) => (/: | #|:$|^[&*!|>'"%@`{[,?-]/.test(cmd) ? `'${cmd.replace(/'/g, "''")}'` : cmd);

const q = (s: string) => (/[*:{}[\],&#?|<>=!%@`'"]/.test(s) || s === "" ? `'${s}'` : s);
const list = (xs: string[]) => `[${xs.map(q).join(", ")}]`;

function filterYaml(name: string, f: Filter, out: string[]) {
  const keys = Object.keys(f).filter((k) => f[k as keyof Filter]);
  if (!keys.length) {
    out.push(`  ${name}:`);
    return;
  }
  out.push(`  ${name}:`);
  if (f.branches) out.push(`    branches: ${list(f.branches)}`);
  if (f.paths) out.push(`    paths: ${list(f.paths)}`);
  if (f.pathsIgnore) out.push(`    paths-ignore: ${list(f.pathsIgnore)}`);
}

export function stepYaml(s: StepDef, job: JobDef, indent = "      "): string[] {
  const out: string[] = [];
  const fix = (line: string) => (line.startsWith("run: ") ? `run: ${runValue(line.slice(5))}` : line);
  const first = (line: string) => out.push(`${indent}- ${fix(line)}`);
  const more = (line: string) => out.push(`${indent}  ${fix(line)}`);
  const head = (line: string) => {
    if (s.name) {
      first(`name: ${q(s.name)}`);
      more(line);
    } else first(line);
  };
  const withId = (id: string, line: string) => {
    if (s.name) {
      first(`name: ${q(s.name)}`);
      more(`id: ${id}`);
    } else first(`id: ${id}`);
    more(line);
  };
  const node = job.matrix ? "${{ matrix.node }}" : (s.with?.node ?? "22");
  const env = (v: string | undefined, fallback: string) => (v?.startsWith("input:") ? `\${{ inputs.${v.slice(6)} }}` : (v ?? fallback));
  switch (s.kind) {
    case "checkout":
      head("uses: actions/checkout@v4");
      break;
    case "setup-node":
      head("uses: actions/setup-node@v4");
      more("with:");
      more(`  node-version: ${node}`);
      if (s.with?.cache) more(`  cache: ${s.with.cache}`);
      break;
    case "cache":
      withId("cache", "uses: actions/cache@v4");
      more("with:");
      more(`  path: ${s.with?.path === "node_modules" ? "node_modules" : "~/.npm"}`);
      more(
        s.with?.key === "static"
          ? `  key: ${s.with?.path === "node_modules" ? "node_modules" : "npm"}-deps`
          : s.with?.key === "sha"
            ? `  key: ${s.with?.path === "node_modules" ? "node_modules" : "npm"}-\${{ github.sha }}`
            : `  key: ${s.with?.path === "node_modules" ? "node_modules" : "npm"}-\${{ hashFiles('package-lock.json') }}`,
      );
      break;
    case "install":
      head("run: npm ci");
      break;
    case "lint":
      head("run: npm run lint");
      break;
    case "typecheck":
      head("run: npx tsc --noEmit");
      break;
    case "test":
      head("run: npm test");
      break;
    case "e2e":
    case "hang":
      head("run: npm run e2e");
      break;
    case "build":
      head("run: npm run build");
      break;
    case "upload":
      head("uses: actions/upload-artifact@v4");
      more("with:");
      more("  name: dist");
      more("  path: dist/");
      break;
    case "download":
      head("uses: actions/download-artifact@v4");
      more("with:");
      more("  name: dist");
      more("  path: dist/");
      break;
    case "changes": {
      withId("filter", "uses: dorny/paths-filter@v3");
      more("with:");
      more("  filters: |");
      for (const f of (s.with?.filters ?? "src/**").split(",")) {
        more(`    ${filterName(f)}:`);
        more(`      - '${f}'`);
      }
      break;
    }
    case "docker-push":
      head("uses: docker/build-push-action@v6");
      more("with:");
      more("  push: true");
      more("  tags: ghcr.io/ada/shop:sha-${{ github.sha }}");
      break;
    case "deploy":
      head(`run: ./deploy.sh ${env(s.with?.env, "staging")}${s.with?.from === "registry" ? ` ${s.with?.version?.startsWith("input:") ? `\${{ inputs.${s.with.version.slice(6)} }}` : "sha-${{ github.sha }}"}` : ""}`);
      more("env:");
      more("  DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}");
      break;
    case "smoke":
      head(`run: curl --fail --retry 3 https://${env(s.with?.env, "staging")}.shop.example/health`);
      break;
    case "rollback":
      head(`run: ./deploy.sh ${env(s.with?.env, "staging")} --previous`);
      more("env:");
      more("  DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}");
      break;
    case "notify":
      head(`run: ./notify.sh "${s.with?.text ?? "${{ github.workflow }} failed on ${{ github.ref_name }}"}"`);
      break;
    case "summary":
      head(`run: echo "${s.with?.text ?? "### Tests: 128 passed"}" >> "$GITHUB_STEP_SUMMARY"`);
      break;
    case "output": {
      const name = s.with?.name ?? "version";
      withId("meta", `run: echo "${name}=${s.with?.value ?? "sha-${GITHUB_SHA::7}"}" >> "$GITHUB_OUTPUT"`);
      break;
    }
    case "print-secret": {
      const name = s.with?.secret ?? "NPM_TOKEN";
      head(`run: echo "token: $${name}"`);
      more("env:");
      more(`  ${name}: \${{ secrets.${name} }}`);
      break;
    }
    case "publish":
      head("run: npm publish");
      // No env at all (token ""), a value written into the file, or a secret (NPM_TOKEN by default).
      if (s.with?.token !== "") {
        more("env:");
        more(`  NODE_AUTH_TOKEN: ${s.with?.token ?? `\${{ secrets.${s.with?.secret ?? "NPM_TOKEN"} }}`}`);
      }
      break;
  }
  if (s.if && s.if !== "success") more(`if: ${condYaml(s.if, "step")}`);
  if (s.continueOnError) more("continue-on-error: true");
  return out;
}

export function jobYaml(j: JobDef, out: string[], jobs: JobDef[]) {
  out.push(`  ${j.id}:`);
  if (j.needs?.length) out.push(`    needs: ${j.needs.length === 1 ? j.needs[0] : list(j.needs)}`);
  if (j.if && j.if !== "success") out.push(`    if: ${condYaml(j.if, "job")}`);
  if (j.uses) {
    out.push(`    uses: ${j.uses}`);
    if (j.inputs && Object.keys(j.inputs).length) {
      out.push("    with:");
      for (const [k, v] of Object.entries(j.inputs)) out.push(`      ${k}: ${q(v)}`);
    }
    out.push("    secrets: inherit");
    return;
  }
  out.push("    runs-on: ubuntu-latest");
  if (j.environment) out.push(`    environment: ${j.environment}`);
  if (j.timeout !== undefined) out.push(`    timeout-minutes: ${j.timeout}`);
  if (j.steps.some((s) => s.kind === "changes")) {
    const f = j.steps.find((s) => s.kind === "changes")!;
    out.push("    outputs:");
    for (const g of (f.with?.filters ?? "src/**").split(",")) out.push(`      ${filterName(g)}: \${{ steps.filter.outputs.${filterName(g)} }}`);
  }
  if (j.steps.some((s) => s.kind === "output")) {
    const o = j.steps.find((s) => s.kind === "output")!;
    const name = o.with?.name ?? "version";
    out.push("    outputs:");
    out.push(`      ${name}: \${{ steps.meta.outputs.${name} }}`);
  }
  if (j.matrix) {
    out.push("    strategy:");
    if (j.failFast === false) out.push("      fail-fast: false");
    out.push("      matrix:");
    out.push(`        node: ${list(j.matrix.map(String))}`);
  }
  out.push("    steps:");
  for (const s of j.steps) out.push(...stepYaml(s, j));
  void jobs;
}

export function workflowYaml(wf: Workflow): string {
  const out: string[] = [`name: ${q(wf.name)}`, "on:"];
  if (wf.on.push) filterYaml("push", wf.on.push, out);
  if (wf.on.pull_request) filterYaml("pull_request", wf.on.pull_request, out);
  if (wf.on.schedule) {
    out.push("  schedule:");
    out.push(`    - cron: '${wf.on.schedule}'`);
  }
  if (wf.on.dispatch) {
    out.push("  workflow_dispatch:");
    if (wf.on.dispatch.length) {
      out.push("    inputs:");
      for (const name of wf.on.dispatch) {
        out.push(`      ${name}:`);
        out.push("        required: true");
        if (name === "environment") {
          out.push("        type: choice");
          out.push("        options: [staging, production]");
        }
      }
    }
  }
  if (wf.permissions) {
    out.push("");
    out.push("permissions:");
    out.push(`  contents: read`);
    if (wf.permissions === "write") out.push("  packages: write");
  }
  if (wf.concurrency) {
    out.push("");
    out.push("concurrency:");
    out.push("  group: ${{ github.workflow }}-${{ github.ref }}");
    out.push("  cancel-in-progress: true");
  }
  out.push("");
  out.push("jobs:");
  wf.jobs.forEach((j, i) => {
    if (i) out.push("");
    jobYaml(j, out, wf.jobs);
  });
  return out.join("\n");
}

/** The workflow file's path, from its name: `CI` → `.github/workflows/ci.yml`. */
export const workflowFile = (wf: Workflow) => `.github/workflows/${wf.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.yml`;
