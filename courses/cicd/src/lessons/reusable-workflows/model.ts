import type { Change } from "@lets-explain/core/course/types";
import { l, type Lang } from "@lets-explain/core/i18n";
import type { Line } from "../../engine/describe";
import type { Sim } from "../shared/SimScene";

/**
 * Three workflows that each copy the same setup steps (checkout is theirs; setup-node and
 * `npm ci` are the copied part). Moves pull that setup into a composite action, or pull the
 * whole `test` job into a reusable workflow, and change the Node version in one place or many.
 * `run` starts every workflow once and reports the Node each one really got.
 */

export type Wf = "ci" | "release" | "nightly";
/** Every place a setup block can live: the three workflows and the reusable test.yml. */
export type Place = Wf | "test";
export const WFS: Wf[] = ["ci", "release", "nightly"];
export const PLACES: Place[] = ["ci", "release", "nightly", "test"];

export interface Block {
  exists: boolean;
  setup: "inline" | "composite";
  node: number;
}

export interface RW {
  places: Record<Place, Block>;
  /** ci / release run their tests through `uses: ./.github/workflows/test.yml`. */
  calls: Record<"ci" | "release", boolean>;
  composite: { exists: boolean; node: number };
  /** Edits made to files so far. */
  edits: number;
}

export type RwAction =
  | { type: "createComposite" }
  | { type: "useComposite"; place: Place }
  | { type: "setNode"; where: Place | "composite"; node: number }
  | { type: "createReusable" }
  | { type: "callReusable"; wf: "ci" | "release" }
  | { type: "run" };

export type RwEvent =
  | { type: "created"; file: string }
  | { type: "edited"; file: string; what: "composite" | "node" | "call"; node?: number }
  | { type: "ran"; wf: Wf; node: number; via?: string }
  | { type: "error"; code: string };

const block = (): Block => ({ exists: true, setup: "inline", node: 20 });

export function freshRw(): RW {
  return {
    places: { ci: block(), release: block(), nightly: block(), test: { exists: false, setup: "inline", node: 20 } },
    calls: { ci: false, release: false },
    composite: { exists: false, node: 20 },
    edits: 0,
  };
}

export const FILE: Record<Place | "composite", string> = {
  ci: ".github/workflows/ci.yml",
  release: ".github/workflows/release.yml",
  nightly: ".github/workflows/nightly.yml",
  test: ".github/workflows/test.yml",
  composite: ".github/actions/setup/action.yml",
};

/** The Node a workflow really runs its setup with. */
export function nodeOf(s: RW, wf: Wf): number {
  const p = wf !== "nightly" && s.calls[wf] ? s.places.test : s.places[wf];
  return p.setup === "composite" ? s.composite.node : p.node;
}

/** How many copies of the setup block exist (the composite action counts once, if used). */
export function copies(s: RW): number {
  const live = PLACES.filter((p) => s.places[p].exists);
  const inline = live.filter((p) => s.places[p].setup === "inline").length;
  return inline + (live.some((p) => s.places[p].setup === "composite") ? 1 : 0);
}

const refuse = (s: RW, code: string) => ({ state: s, events: [{ type: "error", code } as RwEvent] });

export function applyRw(s: RW, a: RwAction): { state: RW; events: RwEvent[] } {
  const n = structuredClone(s);
  switch (a.type) {
    case "createComposite":
      if (s.composite.exists) return refuse(s, "exists");
      n.composite.exists = true;
      n.edits++;
      return { state: n, events: [{ type: "created", file: FILE.composite }] };
    case "useComposite": {
      const p = s.places[a.place];
      if (!s.composite.exists || !p.exists || p.setup === "composite") return refuse(s, "cannot");
      n.places[a.place].setup = "composite";
      n.edits++;
      return { state: n, events: [{ type: "edited", file: FILE[a.place], what: "composite" }] };
    }
    case "setNode": {
      if (a.where === "composite") {
        if (!s.composite.exists || s.composite.node === a.node) return refuse(s, "cannot");
        n.composite.node = a.node;
      } else {
        const p = s.places[a.where];
        if (!p.exists || p.setup !== "inline" || p.node === a.node) return refuse(s, "cannot");
        n.places[a.where].node = a.node;
      }
      n.edits++;
      return { state: n, events: [{ type: "edited", file: FILE[a.where], what: "node", node: a.node }] };
    }
    case "createReusable":
      if (s.places.test.exists) return refuse(s, "exists");
      // test.yml starts as a copy of ci.yml's test job.
      n.places.test = { ...s.places.ci, exists: true };
      n.edits++;
      return { state: n, events: [{ type: "created", file: FILE.test }] };
    case "callReusable":
      if (!s.places.test.exists || s.calls[a.wf]) return refuse(s, "cannot");
      n.calls[a.wf] = true;
      n.places[a.wf].exists = false;
      n.edits++;
      return { state: n, events: [{ type: "edited", file: FILE[a.wf], what: "call" }] };
    case "run":
      return { state: n, events: WFS.map((wf) => ({ type: "ran", wf, node: nodeOf(s, wf), via: wf !== "nightly" && s.calls[wf] ? "test.yml" : undefined })) };
  }
}

function describeRw(e: RwEvent, lang: Lang): Line {
  const tr = lang === "tr";
  switch (e.type) {
    case "created":
      return { text: tr ? `Yeni dosya: ${e.file}` : `New file: ${e.file}`, tone: "produce" };
    case "edited":
      return {
        text:
          e.what === "node"
            ? tr ? `${e.file}: node-version → ${e.node}` : `${e.file}: node-version → ${e.node}`
            : e.what === "composite"
              ? tr ? `${e.file}: setup adımları yerine uses: ./.github/actions/setup` : `${e.file}: setup steps replaced with uses: ./.github/actions/setup`
              : tr ? `${e.file}: test job'ı artık test.yml'yi çağırıyor` : `${e.file}: the test job now calls test.yml`,
        tone: "plain",
      };
    case "ran":
      return { text: tr ? `${e.wf}.yml çalıştı: Node ${e.node}${e.via ? ` (${e.via} üzerinden)` : ""}` : `${e.wf}.yml ran: Node ${e.node}${e.via ? ` (via ${e.via})` : ""}`, tone: e.node === 22 ? "ok" : "read" };
    case "error":
      return { text: tr ? "Bu hamle şu an yapılamaz." : "That move is not possible now.", tone: "bad" };
  }
}

function rwChanges(before: RW, after: RW): Change[] {
  const out: Change[] = [];
  if (!before.composite.exists && after.composite.exists) out.push({ kind: "add", text: l(`\`${FILE.composite}\` oluşturuldu`, `\`${FILE.composite}\` created`) });
  if (!before.places.test.exists && after.places.test.exists) out.push({ kind: "add", text: l(`\`${FILE.test}\` oluşturuldu`, `\`${FILE.test}\` created`) });
  for (const p of PLACES) {
    const a = before.places[p];
    const b = after.places[p];
    if (a.exists && b.exists && a.setup !== b.setup) out.push({ kind: "change", text: l(`\`${FILE[p]}\` composite action'ı kullanıyor`, `\`${FILE[p]}\` uses the composite action`) });
    if (a.exists && b.exists && a.node !== b.node) out.push({ kind: "change", text: l(`\`${FILE[p]}\`: Node ${b.node}`, `\`${FILE[p]}\`: Node ${b.node}`) });
  }
  if (before.composite.node !== after.composite.node) out.push({ kind: "change", text: l(`Composite action: Node ${after.composite.node}`, `Composite action: Node ${after.composite.node}`) });
  for (const wf of ["ci", "release"] as const) if (!before.calls[wf] && after.calls[wf]) out.push({ kind: "change", text: l(`\`${FILE[wf]}\` test job'ını test.yml'den çağırıyor`, `\`${FILE[wf]}\` calls its test job from test.yml`) });
  const c0 = copies(before);
  const c1 = copies(after);
  if (c0 !== c1) out.push({ kind: c1 < c0 ? "good" : "change", text: l(`Setup kopyası: ${c0} → ${c1}`, `Copies of the setup: ${c0} → ${c1}`) });
  return out;
}

export const rwSim: Sim<RW, RwAction, RwEvent> = { apply: applyRw, describe: describeRw, changes: rwChanges };

/* ------------------------------------------------------------------ YAML */

function setupLines(b: Block, composite: RW["composite"], indent: string): string[] {
  if (b.setup === "composite") return [`${indent}- uses: ./.github/actions/setup`];
  void composite;
  return [`${indent}- uses: actions/setup-node@v4`, `${indent}  with:`, `${indent}    node-version: ${b.node}`, `${indent}- run: npm ci`];
}

/** The `jobs:` part of a workflow, as it reads in the repo right now. */
export function wfYaml(s: RW, wf: Wf): string {
  const out: string[] = ["jobs:"];
  if (wf !== "nightly" && s.calls[wf]) {
    out.push("  test:", "    uses: ./.github/workflows/test.yml", "    secrets: inherit");
  } else {
    out.push(`  ${wf === "nightly" ? "e2e" : "test"}:`, "    runs-on: ubuntu-latest", "    steps:", "      - uses: actions/checkout@v4", ...setupLines(s.places[wf], s.composite, "      "));
    out.push(...(wf === "nightly" ? ["      - run: npm run e2e"] : ["      - run: npm run lint", "      - run: npm test"]));
  }
  if (wf === "release") out.push("  publish:", "    needs: test", "    # npm publish ...");
  return out.join("\n");
}

export function testYaml(s: RW): string {
  return ["on:", "  workflow_call:", "jobs:", "  test:", "    runs-on: ubuntu-latest", "    steps:", "      - uses: actions/checkout@v4", ...setupLines(s.places.test, s.composite, "      "), "      - run: npm run lint", "      - run: npm test"].join("\n");
}

export function compositeYaml(s: RW): string {
  return [
    "name: Setup",
    "inputs:",
    "  node-version:",
    `    default: '${s.composite.node}'`,
    "runs:",
    "  using: composite",
    "  steps:",
    "    - uses: actions/setup-node@v4",
    "      with:",
    "        node-version: ${{ inputs.node-version }}",
    "    - run: npm ci",
    "      shell: bash",
  ].join("\n");
}
