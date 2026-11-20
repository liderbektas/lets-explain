import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { kubeShell } from "./kubectl";
import { simulate, type Cluster, type KubeAction } from "./model";
import { run, stepEnd, stepStart, steps } from "./Scene";
import { EMPTY, LEAKY, RUNNING, scenarios, V1, V2, WEB_YAML, type KubeCtx } from "./scenarios";

const after = (c: Cluster, actions: KubeAction[]) => simulate(actions, c).states.at(-1)!;

/** Types lines into a scenario the way a reader would; returns what the check sees. */
function typeInto(start: Cluster, typed: string[], edits: ((t: string) => string)[] = []) {
  const r = typeLines(kubeShell, after, start, typed, edits);
  const sim = simulate(r.actions, start);
  const ctx: KubeCtx = { start, state: sim.states.at(-1)!, actions: r.actions, events: sim.events };
  return { ctx, moves: r.moves, output: r.output };
}

type Way = { lines: string[]; edits?: ((t: string) => string)[] };

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Way> = {
  "first-deploy": { lines: ["kubectl apply -f web.yaml", "kubectl port-forward service/web 8080:80", "curl localhost:8080"] },
  "leaky-pod": { lines: [`kubectl delete pod ${LEAKY}`] },
  "busy-night": { lines: ["kubectl scale deployment web --replicas=4"] },
  "new-version": { lines: [`kubectl set image deployment/web shop=${V2}`, "kubectl rollout status deployment/web"] },
  "roll-back": { lines: ["kubectl rollout undo deployment/web"] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  "first-deploy": [
    { lines: [`kubectl create deployment web --image=${V1} --replicas=3`, "kubectl expose deployment web --port=80 --target-port=3000", "kubectl port-forward svc/web 8080:80 &", "curl localhost:8080"] },
  ],
  "leaky-pod": [{ lines: ["kubectl get pods", `kubectl delete pod/${LEAKY}`, "kubectl get pods -o wide"] }],
  "busy-night": [{ lines: ["kubectl get nodes", "kubectl scale deploy/web --replicas=4"] }, { lines: ["nano web.yaml", "kubectl apply -f web.yaml"], edits: [(t) => t.replace("replicas: 3", "replicas: 4")] }],
  "new-version": [{ lines: ["nano web.yaml", "kubectl apply -f web.yaml"], edits: [(t) => t.replace(V1, V2)] }],
  "roll-back": [{ lines: [`kubectl set image deployment/web shop=${V1}`] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  "first-deploy": { lines: [`kubectl create deployment web --image=${V1}`, "kubectl expose deployment web --port=80 --target-port=3000", "kubectl port-forward service/web 8080:80", "curl localhost:8080"] },
  "leaky-pod": { lines: ["kubectl scale deployment web --replicas=2", "kubectl scale deployment web --replicas=3"] },
  "busy-night": { lines: ["kubectl scale deployment web --replicas=3"] },
  "new-version": { lines: [`kubectl delete pod ${LEAKY}`] },
  "roll-back": { lines: ["kubectl rollout restart deployment/web"] },
};

describe("kubernetes-intro", () => {
  it("every lesson step runs without an error", () => {
    expect(run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(10);
  });

  it("the story: spread, round-robin, self-healing, rescheduling, scaling, a rolling update", () => {
    const at = (step: number) => run.states[stepEnd(step)]!;
    expect(new Set(at(1).pods.map((p) => p.node)).size).toBe(3);
    const answered = run.events.slice(stepStart(2), stepEnd(2)).flat().flatMap((e) => (e.type === "served" ? [e.pod] : []));
    expect(new Set(answered).size).toBe(3);
    expect(at(3).pods).toHaveLength(3);
    expect(at(3).pods.map((p) => p.id)).not.toEqual(at(2).pods.map((p) => p.id));
    expect(at(4).pods.every((p) => p.node !== "node-2")).toBe(true);
    expect(at(5).pods).toHaveLength(5);
    expect(at(6).pods.every((p) => p.version === "v2")).toBe(true);
    let pods = at(5).pods.length;
    for (const e of run.events.slice(stepStart(6), stepEnd(6)).flat()) {
      if (e.type === "podCreated") pods += 1;
      if (e.type === "podGone") pods -= 1;
      expect(pods).toBeGreaterThanOrEqual(5);
    }
    expect(at(7).pods.filter((p) => p.node === "node-2")).toHaveLength(0);
  });

  it("kubectl prints what kubectl prints", () => {
    const r = typeInto(RUNNING, ["kubectl get deployments", "kubectl get pods -o wide", "kubectl scale deployment web --replicas=4", "kubectl get nodes"]);
    expect(r.output[0]).toMatch(/^NAME\s+READY\s+UP-TO-DATE\s+AVAILABLE\s+AGE$/);
    expect(r.output[1]).toMatch(/^web\s+3\/3\s+3\s+3\s+5m$/);
    expect(r.output).toContain("deployment.apps/web scaled");
    expect(typeInto(EMPTY, ["kubectl get pods"]).output).toEqual(["No resources found in default namespace."]);
    expect(typeInto(RUNNING, ["kubectl delete pod nope"]).output[0]).toBe('Error from server (NotFound): pods "nope" not found');
    expect(typeInto(RUNNING, ["curl localhost:8080"]).output[0]).toContain("Failed to connect");
    expect(typeInto(EMPTY, ["cat web.yaml"]).output.join("\n")).toBe(WEB_YAML);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const sol = solutions[s.id]!;
      const r = typeInto(s.start, sol.lines, [...(sol.edits ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.lines.join(" && ")}`, () => {
        const r = typeInto(s.start, alt.lines, [...(alt.edits ?? [])]);
        expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const w = wrong[s.id]!;
      expect(s.check(typeInto(s.start, w.lines, [...(w.edits ?? [])]).ctx)).toBe(false);
    });
  }
});
