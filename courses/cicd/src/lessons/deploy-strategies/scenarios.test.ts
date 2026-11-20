import { describe, expect, it } from "vitest";
import { scenarios } from "./scenarios";
import { manifest, readManifest, typeIntoCluster } from "./shell";
import { scene, steps } from "./Scene";

const NANO = "nano shop.yaml";
const APPLY = "kubectl apply -f shop.yaml";

type Edit = (t: string) => string;
const v2: Edit = (t) => t.replace("shop:v1", "shop:v2");
const rolling: Edit = (t) => v2(t.replace("    type: Recreate", "    type: RollingUpdate\n    rollingUpdate:\n      maxUnavailable: 0\n      maxSurge: 1"));
const plainRolling: Edit = (t) => v2(t.replace("    type: Recreate", "    type: RollingUpdate"));

const solutions: Record<string, { typed: string[]; edits: Edit[] }> = {
  "no-downtime": { typed: [NANO, APPLY, "kubectl rollout status deployment/shop"], edits: [rolling] },
  "look-first": { typed: [NANO, APPLY, "curl https://preview.shop.example/health", "kubectl argo rollouts abort shop"], edits: [v2] },
  "canary-catch": { typed: [NANO, APPLY, "kubectl argo rollouts abort shop"], edits: [v2] },
  "canary-promote": { typed: [NANO, APPLY, "kubectl argo rollouts promote shop", "kubectl argo rollouts promote shop"], edits: [v2] },
  "stop-rolling": { typed: [NANO, APPLY, "curl https://shop.example/health", "kubectl rollout undo deployment/shop"], edits: [v2] },
};

const alternatives: Record<string, { typed: string[]; edits: Edit[] }[]> = {
  // RollingUpdate without the extra settings is fine too: Kubernetes' defaults never drop below 3 of 4 here.
  "no-downtime": [{ typed: ["cat shop.yaml", NANO, "kubectl apply --filename=shop.yaml", "kubectl rollout status deploy/shop"], edits: [plainRolling] }],
  "look-first": [{ typed: [NANO, APPLY, "kubectl argo rollouts get rollout shop", "kubectl argo rollouts abort shop"], edits: [v2] }],
  // Going back by applying the old image again.
  "canary-catch": [{ typed: [NANO, APPLY, NANO, APPLY], edits: [v2, (t) => t.replace("shop:v2", "shop:v1")] }],
  "canary-promote": [{ typed: [NANO, APPLY, "kubectl argo rollouts get rollout shop", "kubectl argo rollouts promote shop", "kubectl argo rollouts status shop", "kubectl argo rollouts promote shop"], edits: [v2] }],
  "stop-rolling": [{ typed: [NANO, APPLY, NANO, APPLY], edits: [v2, (t) => t.replace("shop:v2", "shop:v1")] }],
};

const wrong: Record<string, { typed: string[]; edits: Edit[] }> = {
  // A new image with Recreate: one round with nothing up.
  "no-downtime": { typed: [NANO, APPLY, "kubectl rollout status deployment/shop"], edits: [v2] },
  // Promoting the broken green: every user gets 500.
  "look-first": { typed: [NANO, APPLY, "kubectl argo rollouts promote shop", "kubectl argo rollouts abort shop"], edits: [v2] },
  // One step further before backing out: 50% of traffic hits the bug.
  "canary-catch": { typed: [NANO, APPLY, "kubectl argo rollouts promote shop", "kubectl argo rollouts abort shop"], edits: [v2] },
  // Stuck at 50%.
  "canary-promote": { typed: [NANO, APPLY, "kubectl argo rollouts promote shop"], edits: [v2] },
  // Watching a broken rollout to the end, then undoing it.
  "stop-rolling": { typed: [NANO, APPLY, "kubectl rollout status deployment/shop", "kubectl rollout undo deployment/shop"], edits: [v2] },
};

describe("deploy-strategies", () => {
  it("the story: recreate goes down, rolling mixes, bad rolling hurts, blue-green switches, canary limits", () => {
    expect(steps).toHaveLength(8);
    expect(scene.at(0).round).toEqual({ v1: 100, v2: 0, failed: 0, down: false });
    expect(scene.at(1)).toMatchObject({ failed: 100, downRounds: 1 });
    expect(scene.at(1).round!.v2).toBe(100);
    const rolling = scene.run.states.slice(scene.stepStart(2) + 2, scene.stepEnd(2) + 1).map((s) => s.round!.v2);
    expect(rolling).toEqual([25, 50, 75, 100]);
    expect(scene.at(3)).toMatchObject({ failed: 125, rolledBack: true, downRounds: 0 });
    expect(scene.at(4)).toMatchObject({ failed: 0, downRounds: 0, live: "green", greenCheck: "ok" });
    expect(scene.at(4).round!.v2).toBe(100);
    expect(scene.at(5)).toMatchObject({ failed: 10, rolledBack: true });
  });

  it("reads manifests like kubectl: strategies, images, and what a Deployment cannot do", () => {
    expect(readManifest(manifest("canary", 2))).toMatchObject({ kind: "Rollout", strategy: "canary", version: 2 });
    expect(readManifest(manifest("recreate").replace("Recreate", "BlueGreen"))).toMatch(/Unsupported value: "BlueGreen"/);
    expect(readManifest(manifest("rolling").replace("shop:v1", "shop:latest"))).toMatch(/two builds/);
  });

  it("the blue-green preview answers 500 when v2 is broken", () => {
    const s = scenarios.find((x) => x.id === "look-first")!;
    const r = typeIntoCluster(s.start, [NANO, APPLY, "curl https://preview.shop.example/health"], [v2]);
    expect(r.output.at(-1)).toBe("curl: (22) The requested URL returned error: 500");
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeIntoCluster(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const { typed, edits } = solutions[s.id]!;
      const r = typeIntoCluster(s.start, typed, [...edits]);
      expect(r.output.filter((x) => /^(error|Error)/.test(x)), r.output.join("\n")).toEqual([]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const [i, alt] of (alternatives[s.id] ?? []).entries()) {
      it(`${s.id}: also wins another way (${i + 1})`, () => {
        const r = typeIntoCluster(s.start, alt.typed, [...alt.edits]);
        expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const { typed, edits } = wrong[s.id]!;
      expect(s.check(typeIntoCluster(s.start, typed, [...edits]).ctx)).toBe(false);
    });
  }
});
