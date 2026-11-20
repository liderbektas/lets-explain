/**
 * A tiny Kubernetes for one lesson: three nodes, one Deployment and one Service. After every
 * action a controller compares what is running with what was asked for and fixes the gap,
 * which is the whole idea of Kubernetes. Deterministic, so missions can be searched.
 *
 * Simplifications (said in the lesson's "Gerçekte" notes): pods start instantly, the
 * scheduler only spreads pods evenly, a rolling update finishes in one step, and pods do
 * not move back when a node returns.
 */

export interface Pod {
  id: string;
  node: string;
  version: string;
}

export interface Cluster {
  nextId: number;
  nodes: { name: string; up: boolean }[];
  /** Replicas the Deployment asks for; null before it exists. */
  desired: number | null;
  version: string;
  pods: Pod[];
  service: boolean;
  rr: number;
  /** The version before the last rollout, for `kubectl rollout undo`. */
  previous?: string;
  /** The local port `kubectl port-forward` opened to the Service, if any. */
  forward?: number;
  /** Files in the reader's folder (web.yaml), for `nano` and `kubectl apply -f`. */
  files?: Record<string, string>;
}

export type KubeAction =
  | { type: "apply"; replicas: number; version: string }
  | { type: "expose" }
  | { type: "scale"; to: number }
  | { type: "killPod"; id?: string }
  | { type: "nodeDown"; node: string }
  | { type: "nodeUp"; node: string }
  | { type: "setImage"; version: string }
  | { type: "undo" }
  | { type: "forward"; port: number }
  | { type: "file"; path: string; content: string }
  /** `port`: curl localhost:port on the laptop, which only reaches the Service through a port-forward. */
  | { type: "curl"; port?: number };

export type KubeEvent =
  | { type: "podCreated"; id: string; node: string; version: string; why: "deploy" | "heal" | "scale" | "rollout" }
  | { type: "podGone"; id: string; why: "killed" | "node" | "scale" | "rollout" }
  | { type: "nodeChanged"; node: string; up: boolean }
  | { type: "scaled"; from: number; to: number }
  | { type: "exposed" }
  | { type: "rolledOut"; version: string }
  | { type: "served"; pod: string; version: string }
  | { type: "curlFailed"; why: "no-service" | "no-pods" | "no-forward" }
  | { type: "forwarding"; port: number }
  | { type: "error"; message: string };

export const NODES = ["node-1", "node-2", "node-3"];

export function createCluster(): Cluster {
  return { nextId: 1, nodes: NODES.map((name) => ({ name, up: true })), desired: null, version: "v1", pods: [], service: false, rr: 0 };
}

/** Short pod names like Kubernetes prints them: the Deployment's name and a suffix. */
function podName(n: number): string {
  return `web-${((n * 2654435761) >>> 0).toString(36).slice(0, 5)}`;
}

const alive = (c: Cluster) => c.nodes.filter((n) => n.up).map((n) => n.name);

/** Puts a new pod on the live node that has the fewest pods. */
function schedule(c: Cluster, version: string, why: "deploy" | "heal" | "scale" | "rollout", events: KubeEvent[]) {
  const nodes = alive(c);
  if (nodes.length === 0) return;
  const node = [...nodes].sort((a, b) => c.pods.filter((p) => p.node === a).length - c.pods.filter((p) => p.node === b).length || a.localeCompare(b))[0]!;
  const pod: Pod = { id: podName(c.nextId++), node, version };
  c.pods.push(pod);
  events.push({ type: "podCreated", id: pod.id, node, version, why });
}

/** The controller loop: make what runs match what was asked for. */
function reconcile(c: Cluster, events: KubeEvent[], why: "heal" | "scale") {
  if (c.desired === null) return;
  while (c.pods.length < c.desired && alive(c).length) schedule(c, c.version, why, events);
  while (c.pods.length > c.desired) {
    const gone = c.pods.pop()!;
    events.push({ type: "podGone", id: gone.id, why: "scale" });
  }
}

export function apply(prev: Cluster, a: KubeAction): { state: Cluster; events: KubeEvent[] } {
  const c = structuredClone(prev);
  const events: KubeEvent[] = [];
  const fail = (message: string) => ({ state: prev, events: [{ type: "error", message } as KubeEvent] });
  switch (a.type) {
    case "apply":
      c.desired = a.replicas;
      c.version = a.version;
      while (c.pods.length < a.replicas) schedule(c, a.version, "deploy", events);
      break;
    case "expose":
      if (c.service) return fail('services "web" already exists');
      c.service = true;
      events.push({ type: "exposed" });
      break;
    case "scale": {
      if (c.desired === null) return fail('deployments.apps "web" not found');
      if (a.to < 0 || a.to === c.desired) return fail("nothing to scale");
      events.push({ type: "scaled", from: c.desired, to: a.to });
      c.desired = a.to;
      reconcile(c, events, "scale");
      break;
    }
    case "killPod": {
      const pod = a.id ? c.pods.find((p) => p.id === a.id) : c.pods[0];
      if (!pod) return fail("No pods to delete");
      c.pods = c.pods.filter((p) => p.id !== pod.id);
      events.push({ type: "podGone", id: pod.id, why: "killed" });
      reconcile(c, events, "heal");
      break;
    }
    case "nodeDown":
    case "nodeUp": {
      const node = c.nodes.find((n) => n.name === a.node);
      if (!node) return fail(`node "${a.node}" not found`);
      const up = a.type === "nodeUp";
      if (node.up === up) return fail(`${a.node} is already ${up ? "up" : "down"}`);
      node.up = up;
      events.push({ type: "nodeChanged", node: node.name, up });
      if (!up) {
        for (const p of c.pods.filter((x) => x.node === node.name)) events.push({ type: "podGone", id: p.id, why: "node" });
        c.pods = c.pods.filter((p) => p.node !== node.name);
      }
      reconcile(c, events, "heal");
      break;
    }
    case "setImage": {
      if (c.desired === null) return fail('deployments.apps "web" not found');
      if (c.version === a.version) return fail("image is already set");
      c.previous = c.version;
      c.version = a.version;
      // Rolling update: one new pod up, then one old pod down, until none of the old are left.
      for (const old of c.pods.filter((p) => p.version !== a.version)) {
        schedule(c, a.version, "rollout", events);
        c.pods = c.pods.filter((p) => p.id !== old.id);
        events.push({ type: "podGone", id: old.id, why: "rollout" });
      }
      events.push({ type: "rolledOut", version: a.version });
      break;
    }
    case "undo": {
      if (c.desired === null) return fail('deployments.apps "web" not found');
      if (!c.previous) return fail('no rollout history found for deployment "web"');
      return apply(prev, { type: "setImage", version: c.previous });
    }
    case "file":
      c.files = { ...c.files, [a.path]: a.content };
      break;
    case "forward":
      if (!c.service) return fail('services "web" not found');
      c.forward = a.port;
      events.push({ type: "forwarding", port: a.port });
      break;
    case "curl": {
      if (a.port !== undefined && a.port !== c.forward) {
        events.push({ type: "curlFailed", why: "no-forward" });
        break;
      }
      if (!c.service) {
        events.push({ type: "curlFailed", why: "no-service" });
        break;
      }
      if (c.pods.length === 0) {
        events.push({ type: "curlFailed", why: "no-pods" });
        break;
      }
      const pod = c.pods[c.rr % c.pods.length]!;
      c.rr += 1;
      events.push({ type: "served", pod: pod.id, version: pod.version });
      break;
    }
  }
  return { state: c, events };
}

export function simulate(actions: KubeAction[], start: Cluster = createCluster()) {
  const states = [start];
  const events: KubeEvent[][] = [];
  let cur = start;
  for (const a of actions) {
    const r = apply(cur, a);
    cur = r.state;
    states.push(cur);
    events.push(r.events);
  }
  return { states, events };
}
