import { describe, expect, it } from "vitest";
import type { Workflow } from "./ci";
import { bugsIn } from "./desk";
import { CHECKOUT, INSTALL, TEST, step } from "./presets";
import { readWorkflow } from "./readYaml";
import { workflowYaml } from "./yaml";

const wf = (steps: Workflow["jobs"][number]["steps"]): Workflow => ({ name: "CI", on: { push: { branches: ["main"] } }, jobs: [{ id: "test", steps }] });

describe("cache options and file-backed bugs", () => {
  it("setup-node's `cache: npm` and a commit-keyed actions/cache read back the way they were written", () => {
    for (const w of [wf([CHECKOUT, step("setup-node", { with: { cache: "npm" } }), INSTALL, TEST]), wf([CHECKOUT, step("setup-node"), step("cache", { with: { key: "sha" } }), INSTALL, TEST])]) {
      const r = readWorkflow(workflowYaml(w));
      expect(r.ok && workflowYaml(r.workflow)).toBe(workflowYaml(w));
    }
  });

  it("a setup-node cache other than npm is refused plainly", () => {
    const text = workflowYaml(wf([CHECKOUT, step("setup-node", { with: { cache: "npm" } }), INSTALL])).replace("cache: npm", "cache: yarn");
    const r = readWorkflow(text);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems[0]!.message).toContain("cache: yarn");
  });

  it("the flaky, Node 20 and hanging bugs follow their files when the files are there, and stay as they were when not", () => {
    expect(bugsIn({}, ["flaky", "node20", "hang"])).toEqual(["flaky", "node20", "hang"]);
    const racy = 'placeOrder([42]);\nawait sleep(100);\nconst [order] = await once(orders, "confirmed");';
    const fixed = 'const confirmed = once(orders, "confirmed");\nplaceOrder([42]);';
    expect(bugsIn({ "src/checkout.test.ts": racy }, [])).toContain("flaky");
    expect(bugsIn({ "src/checkout.test.ts": fixed }, ["flaky"])).not.toContain("flaky");
    expect(bugsIn({ "src/checkout.test.ts": racy.replace("it(", "it.skip(") + '\nit.skip("x", () => {})' }, ["flaky"])).not.toContain("flaky");
    expect(bugsIn({ "src/list.ts": "Object.groupBy(orders, f)" }, [])).toContain("node20");
    expect(bugsIn({ "src/list.ts": "orders.reduce(f, {})" }, ["node20"])).not.toContain("node20");
    expect(bugsIn({ "e2e/checkout.spec.ts": 'page.goto("/", { timeout: 0 })' }, [])).toContain("hang");
    expect(bugsIn({ "e2e/checkout.spec.ts": 'page.goto("/")' }, ["hang"])).not.toContain("hang");
  });
});
