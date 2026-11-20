import type { Workflow } from "../../engine/ci";
import { CHECKOUT, PREP, SETUP, TEST, step } from "../../engine/presets";

export function relWf(pushOnly: boolean): Workflow {
  return {
    name: "Release",
    on: { push: { branches: ["main"] }, pull_request: {} },
    jobs: [
      { id: "test", steps: [...PREP, TEST] },
      { id: "publish", needs: ["test"], ...(pushOnly ? { if: "push" as const } : {}), steps: [CHECKOUT, SETUP, step("print-secret"), step("publish")] },
    ],
  };
}

/** What people do before they learn about secrets: the token right in the file. */
export const LEAKED = `name: Release
on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: npm_8f2kQx7Lr0aW3mZt9`;
