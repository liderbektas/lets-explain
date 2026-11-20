import { apply, freshWorld, type StepKind, type Workflow, type World } from "../../engine/ci";
import { step } from "../../engine/presets";

const PREP: StepKind[] = ["checkout", "setup-node", "install"];

/** A one-job CI whose checks run in the given order after checkout, setup-node and npm ci. */
export const wf = (order: StepKind[]): Workflow => ({
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: [{ id: "ci", steps: [...PREP, ...order].map((k) => step(k)) }],
});

export const GOOD: StepKind[] = ["lint", "typecheck", "test", "build"];
/** The slow order: the expensive checks first, lint at the very end. */
export const SLOW: StepKind[] = ["test", "typecheck", "build", "lint"];

export const orderOf = (w: World): StepKind[] => (w.workflows[0]?.jobs[0]?.steps.map((s) => s.kind) ?? []).filter((k) => !PREP.includes(k));

/** Move a check to the front, right after `npm ci`. */
export const toFront = (order: StepKind[], kind: StepKind) => [kind, ...order.filter((k) => k !== kind)];

/** The slow order with a lint and a type error pushed: red on typecheck, after the tests. */
export const SANDBOX: World = apply(freshWorld({ bugs: ["lint", "type"], workflows: [wf(SLOW)] }), { type: "push", message: "cart: add VAT" }).state;
