import type { CommandLine, ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete as completeWord, lines, out, shellWords, splitCommands, type TermLine } from "@lets-explain/core/lib/terminal";
import { parseYaml, type Yaml } from "../../engine/files";
import { apply, type Cluster, type KubeAction, type KubeEvent } from "./model";

/**
 * `kubectl` on the lesson's small cluster: what a reader types (`kubectl scale deployment web
 * --replicas=4`, `kubectl apply -f web.yaml`) becomes the same actions the lesson plays, and the
 * terminal prints what kubectl prints. The cluster runs one Deployment, `web`, from the shop image.
 */

export type KubeResult = ShellResult<KubeAction, Cluster>;

export const REPO = "ghcr.io/ada/shop";
/** The two images CI published; the scene draws them as v1 and v2. */
export const IMAGES: Record<string, string> = { [`${REPO}:sha-8b1d24e`]: "v1", [`${REPO}:sha-9c4e7b2`]: "v2" };
const imageOf = (version: string) => Object.keys(IMAGES).find((k) => IMAGES[k] === version) ?? `${REPO}:${version}`;
const versionOf = (image: string) => IMAGES[image] ?? image.slice(image.lastIndexOf(":") + 1);

const say = (text: string, tone: TermLine["tone"] = "out"): Run => ({ actions: [], output: text ? lines(text, tone) : [] });
const fail = (text: string): Run => ({ actions: [], output: lines(text, "err"), failed: true });

interface Run {
  actions: KubeAction[];
  output: TermLine[];
  failed?: boolean;
  editor?: KubeResult["editor"];
  clear?: boolean;
}

/** Runs actions, printing kubectl's line for each; stops at the first error. */
function act(c: Cluster, actions: KubeAction[], ok: (events: KubeEvent[]) => string[]): Run {
  let state = c;
  const done: KubeAction[] = [];
  const output: TermLine[] = [];
  for (const a of actions) {
    const r = apply(state, a);
    const err = r.events.find((e) => e.type === "error");
    if (err && err.type === "error") return { actions: done, output: [...output, out(`Error from server: ${err.message}`, "err")], failed: true };
    done.push(a);
    state = r.state;
    output.push(...ok(r.events).map((t) => out(t)));
  }
  return { actions: done, output };
}

export function runKubeLine(start: Cluster, line: string): KubeResult {
  const result: KubeResult = { actions: [], output: [], moves: 0 };
  let c = start;
  for (const words of splitCommands(shellWords(line))) {
    const r = command(c, words.filter((w) => w !== "&"));
    result.actions.push(...r.actions);
    result.output.push(...r.output);
    if (r.clear) {
      result.clear = true;
      result.output = [];
    }
    // Looking (get, describe, curl) is free; changing the cluster or a file counts.
    if (r.actions.some((a) => a.type !== "curl")) result.moves++;
    for (const a of r.actions) c = apply(c, a).state;
    if (r.editor) {
      result.editor = r.editor;
      break;
    }
    if (r.failed) break;
  }
  return result;
}

export const kubePrompt = (): string => "ada@laptop:~/k8s$";

const VERBS = ["get", "create", "expose", "scale", "delete", "set", "rollout", "apply", "port-forward", "logs", "describe"];

export function completeKube(c: Cluster, input: string) {
  const words = input.trimStart().split(/\s+/);
  const candidates =
    words.length <= 1
      ? ["kubectl", "curl", "nano", "cat", "ls", "clear"]
      : words[0] === "kubectl" && words.length === 2
        ? VERBS
        : ["pods", "deployment", "deployments", "service", "nodes", "web", "deployment/web", "service/web", "status", "undo", "-o", "wide", "--replicas=", "--image=", "-f", "web.yaml", ...c.pods.map((p) => p.id), ...Object.keys(IMAGES), "localhost:8080"];
  return completeWord(input, candidates);
}

export const kubeShell: CommandLine<KubeAction, Cluster> = { run: runKubeLine, prompt: kubePrompt, complete: completeKube, title: "bash" };

/* --------------------------------------------------------------- commands */

function command(c: Cluster, words: string[]): Run {
  const [cmd, ...args] = words;
  switch (cmd) {
    case "kubectl":
      return kubectl(c, args);
    case "k":
      return kubectl(c, args);
    case "clear":
      return { actions: [], output: [], clear: true };
    case "help":
      return say(HELP);
    case "ls":
      return say(Object.keys(c.files ?? {}).sort().join("  "));
    case "cat": {
      const f = args[0];
      if (!f || c.files?.[f] === undefined) return fail(`cat: ${f ?? ""}: No such file or directory`);
      return say(c.files[f]!);
    }
    case "echo": {
      const at = args.findIndex((a) => a === ">" || a === ">>");
      if (at === -1) return say(args.join(" "));
      const path = args[at + 1];
      if (!path) return fail("bash: syntax error near unexpected token `newline'");
      const text = args.slice(0, at).join(" ");
      const old = c.files?.[path];
      return { actions: [{ type: "file", path, content: args[at] === ">>" && old ? `${old}\n${text}` : text }], output: [] };
    }
    case "nano":
    case "vim":
    case "vi":
    case "code": {
      const path = args.find((a) => !a.startsWith("-"));
      if (!path) return fail(`${cmd}: give the file to open, e.g. ${cmd} web.yaml`);
      return {
        actions: [],
        output: [],
        editor: {
          file: path,
          text: c.files?.[path] ?? "",
          save: (state, text) => (state.files?.[path] === text ? { actions: [], output: [], moves: 0 } : { actions: [{ type: "file", path, content: text }], output: [], moves: 1 }),
        },
      };
    }
    case "curl": {
      const m = /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1):(\d+)/.exec(args.find((a) => !a.startsWith("-")) ?? "");
      if (!m) return say("(from this laptop the cluster is reached through kubectl port-forward: curl localhost:<port>)", "dim");
      const port = Number(m[1]);
      const r = apply(c, { type: "curl", port });
      const e = r.events[0];
      if (e?.type === "served") return { actions: [{ type: "curl", port }], output: [out(`shop ${e.version} · served by ${e.pod}`)] };
      if (e?.type === "curlFailed" && e.why === "no-forward") return { actions: [{ type: "curl", port }], output: [out(`curl: (7) Failed to connect to localhost port ${port}: Connection refused`, "err")] };
      return { actions: [{ type: "curl", port }], output: [out("curl: (52) Empty reply from server", "err")] };
    }
    default:
      return fail(`bash: ${cmd}: command not found`);
  }
}

const one = (c: Cluster) => c.desired !== null;
const notFound = () => fail('Error from server (NotFound): deployments.apps "web" not found');
/** "deployment web", "deployment/web", "deploy/web", "deployments.apps/web". */
function deploymentArg(args: string[]): string | null {
  const words = args.filter((a) => !a.startsWith("-"));
  const joined = words[0]?.includes("/") ? words[0] : words.length >= 2 ? `${words[0]}/${words[1]}` : null;
  if (!joined) return null;
  const [kind, name] = joined.split("/");
  return /^(deployment|deployments|deploy|deployments\.apps)$/.test(kind ?? "") ? (name ?? null) : null;
}
const flag = (args: string[], name: string) => {
  const i = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (i < 0) return undefined;
  return args[i]!.includes("=") ? args[i]!.slice(name.length + 1) : args[i + 1];
};

function kubectl(c: Cluster, args: string[]): Run {
  const [verb, ...rest] = args;
  switch (verb) {
    case undefined:
    case "help":
      return say(KUBECTL_HELP);
    case "version":
      return say("Client Version: v1.31.0\nKustomize Version: v5.4.2\nServer Version: v1.31.0");
    case "get":
      return get(c, rest);
    case "create": {
      if (rest[0] !== "deployment" && rest[0] !== "deploy") return say(`(this sandbox creates Deployments: kubectl create deployment web --image=… --replicas=N)`, "dim");
      const name = rest[1];
      const image = flag(rest, "--image");
      if (!name || !image) return fail("error: required flag(s) \"image\" not set");
      if (name !== "web") return say("(this cluster runs one Deployment, called web)", "dim");
      if (one(c)) return fail('error: failed to create deployment: deployments.apps "web" already exists');
      const replicas = Number(flag(rest, "--replicas") ?? 1);
      return act(c, [{ type: "apply", replicas, version: versionOf(image) }], () => ["deployment.apps/web created"]);
    }
    case "expose": {
      if (deploymentArg(rest) !== "web") return fail('error: the server doesn\'t have a resource type "' + (rest[0] ?? "") + '"');
      if (!one(c)) return notFound();
      if (c.service) return fail('Error from server (AlreadyExists): services "web" already exists');
      return act(c, [{ type: "expose" }], () => ["service/web exposed"]);
    }
    case "scale": {
      if (deploymentArg(rest) !== "web") return fail("error: no objects passed to scale");
      if (!one(c)) return notFound();
      const to = Number(flag(rest, "--replicas"));
      if (!Number.isInteger(to) || to < 0) return fail("error: --replicas=COUNT is required, and COUNT must be greater than or equal to 0");
      if (to === c.desired) return say("deployment.apps/web scaled");
      return act(c, [{ type: "scale", to }], () => ["deployment.apps/web scaled"]);
    }
    case "delete": {
      const [kind, name] = rest[0]?.includes("/") ? rest[0].split("/") : [rest[0], rest[1]];
      if (kind !== "pod" && kind !== "pods" && kind !== "po") return say("(here you can delete pods: kubectl delete pod <name>)", "dim");
      if (!name) return fail("error: resource(s) were provided, but no name was specified");
      if (!c.pods.some((p) => p.id === name)) return fail(`Error from server (NotFound): pods "${name}" not found`);
      return act(c, [{ type: "killPod", id: name }], () => [`pod "${name}" deleted`]);
    }
    case "set": {
      if (rest[0] !== "image") return say("(kubectl set image deployment/web shop=<image>)", "dim");
      if (deploymentArg(rest.slice(1)) !== "web") return fail("error: you must specify resources by --filename when --local is set.");
      if (!one(c)) return notFound();
      const pair = rest.find((a) => a.includes("=") && !a.startsWith("-"));
      if (!pair) return fail("error: at least one image update is required");
      const [container, image] = pair.split("=");
      if (container !== "shop") return fail(`error: unable to find container named "${container}"`);
      if (versionOf(image!) === c.version) return say("deployment.apps/web image updated");
      return act(c, [{ type: "setImage", version: versionOf(image!) }], () => ["deployment.apps/web image updated"]);
    }
    case "rollout": {
      const sub = rest[0];
      if (deploymentArg(rest.slice(1)) !== "web") return fail("error: required resource not specified");
      if (!one(c)) return notFound();
      if (sub === "status") return say(c.pods.length === c.desired ? 'deployment "web" successfully rolled out' : `Waiting for deployment "web" rollout to finish: ${c.pods.length} of ${c.desired} updated replicas are available...`);
      if (sub === "undo") return act(c, [{ type: "undo" }], () => ["deployment.apps/web rolled back"]);
      if (sub === "history") return say(["deployment.apps/web", "REVISION  CHANGE-CAUSE", ...(c.previous ? ["1         <none>", "2         <none>"] : ["1         <none>"])].join("\n"));
      return say("(kubectl rollout status | undo | history deployment/web)", "dim");
    }
    case "apply":
      return applyFile(c, rest);
    case "port-forward": {
      const target = rest.find((a) => !a.startsWith("-") && !/^\d+:\d+$/.test(a) && !/^\d+$/.test(a));
      const ports = rest.find((a) => /^\d+(:\d+)?$/.test(a));
      if (!target || !ports) return fail("error: TYPE/NAME and list of ports are required for port-forward");
      if (!/^(service|svc|services)\/web$/.test(target) && !/^(deployment|deploy)\/web$/.test(target)) return fail(`Error from server (NotFound): ${target.split("/")[0]} "${target.split("/")[1] ?? target}" not found`);
      const local = Number(ports.split(":")[0]);
      const r = act(c, [{ type: "forward", port: local }], () => [`Forwarding from 127.0.0.1:${local} -> 3000`, `Forwarding from [::1]:${local} -> 3000`]);
      if (!r.failed) r.output.push(out("(a real terminal stays here until Ctrl+C; this sandbox keeps the forward open and gives the prompt back)", "dim"));
      return r;
    }
    case "logs": {
      const name = rest.find((a) => !a.startsWith("-"));
      const pod = c.pods.find((p) => p.id === name || name === "deployment/web");
      if (!pod) return fail(`Error from server (NotFound): pods "${name ?? ""}" not found`);
      return say(`shop ${pod.version} listening on :3000`);
    }
    case "describe":
      return say("(kubectl describe is not in this sandbox: kubectl get … -o wide shows the essentials)", "dim");
    case "drain":
    case "cordon":
    case "uncordon":
      return say(`(kubectl ${verb} is not in this sandbox; here nodes go down on their own)`, "dim");
    default:
      return fail(`error: unknown command "${verb}" for "kubectl"\nRun 'kubectl --help' for usage.`);
  }
}

const pad = (s: string, n: number) => s.padEnd(n);
const ip = (i: number) => `10.244.${(i % 3) + 1}.${10 + i}`;

function get(c: Cluster, args: string[]): Run {
  const what = (args.find((a) => !a.startsWith("-") && a !== "wide") ?? "").split(",");
  const wide = args.includes("wide") || args.includes("-owide");
  if (args.includes("-w") || args.includes("--watch")) args = args.filter((a) => a !== "-w" && a !== "--watch");
  if (!what[0]) return fail('You must specify the type of resource to get. Use "kubectl api-resources" for a complete list of supported resources.');
  const o: TermLine[] = [];
  const kinds = what.flatMap((w) => (w === "all" ? ["pods", "services", "deployments"] : [w]));
  for (const [k, kind] of kinds.entries()) {
    if (k > 0 && o.length) o.push(out(""));
    if (/^(po|pod|pods)$/.test(kind)) {
      if (!c.pods.length) {
        o.push(out("No resources found in default namespace."));
        continue;
      }
      o.push(out(`${pad("NAME", 12)}${pad("READY", 8)}${pad("STATUS", 10)}${pad("RESTARTS", 11)}${wide ? `${pad("AGE", 6)}${pad("IP", 14)}NODE` : "AGE"}`, "dim"));
      c.pods.forEach((p, i) => o.push(out(`${pad(p.id, 12)}${pad("1/1", 8)}${pad("Running", 10)}${pad("0", 11)}${wide ? `${pad("2m", 6)}${pad(ip(i), 14)}${p.node}` : "2m"}`)));
    } else if (/^(deploy|deployment|deployments)$/.test(kind)) {
      if (!one(c)) {
        o.push(out("No resources found in default namespace."));
        continue;
      }
      const n = c.pods.length;
      const updated = c.pods.filter((p) => p.version === c.version).length;
      o.push(out(`${pad("NAME", 7)}${pad("READY", 8)}${pad("UP-TO-DATE", 13)}${pad("AVAILABLE", 12)}AGE`, "dim"), out(`${pad("web", 7)}${pad(`${n}/${c.desired}`, 8)}${pad(String(updated), 13)}${pad(String(n), 12)}5m`));
      if (wide) o.push(out(`(image: ${imageOf(c.version)})`, "dim"));
    } else if (/^(svc|service|services)$/.test(kind)) {
      o.push(out(`${pad("NAME", 13)}${pad("TYPE", 12)}${pad("CLUSTER-IP", 15)}${pad("EXTERNAL-IP", 14)}${pad("PORT(S)", 10)}AGE`, "dim"));
      o.push(out(`${pad("kubernetes", 13)}${pad("ClusterIP", 12)}${pad("10.96.0.1", 15)}${pad("<none>", 14)}${pad("443/TCP", 10)}12d`));
      if (c.service) o.push(out(`${pad("web", 13)}${pad("ClusterIP", 12)}${pad("10.96.142.17", 15)}${pad("<none>", 14)}${pad("80/TCP", 10)}1m`));
    } else if (/^(no|node|nodes)$/.test(kind)) {
      o.push(out(`${pad("NAME", 9)}${pad("STATUS", 11)}${pad("ROLES", 8)}${pad("AGE", 6)}VERSION`, "dim"));
      for (const n of c.nodes) o.push(out(`${pad(n.name, 9)}${pad(n.up ? "Ready" : "NotReady", 11)}${pad("<none>", 8)}${pad("12d", 6)}v1.31.0`, n.up ? "out" : "err"));
    } else return fail(`error: the server doesn't have a resource type "${kind}"`);
  }
  return { actions: [], output: o };
}

/* ------------------------------------------------------------- apply -f */

const map = (v: Yaml | undefined): Record<string, Yaml> => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function applyFile(c: Cluster, args: string[]): Run {
  const file = flag(args, "-f") ?? flag(args, "--filename");
  if (!file) return fail("error: must specify one of -f and -k");
  const text = c.files?.[file];
  if (text === undefined) return fail(`error: the path "${file}" does not exist`);
  const docs: Record<string, Yaml>[] = [];
  for (const part of text.split(/^---\s*$/m)) {
    if (!part.trim()) continue;
    try {
      docs.push(map(parseYaml(part)));
    } catch (e) {
      return fail(`error: error parsing ${file}: ${(e as Error).message}`);
    }
  }
  const actions: KubeAction[] = [];
  const said: string[] = [];
  let state = c;
  const push = (a: KubeAction) => {
    actions.push(a);
    state = apply(state, a).state;
  };
  for (const d of docs) {
    const kind = d.kind;
    const name = map(d.metadata).name;
    if (kind === "Deployment") {
      if (name !== "web") return say("(this cluster runs one Deployment, called web)", "dim");
      const spec = map(d.spec);
      const containers = map(map(spec.template).spec).containers;
      const first = Array.isArray(containers) ? map(containers[0]) : {};
      if (typeof first.image !== "string") return fail(`error: error validating "${file}": spec.template.spec.containers[0].image: Required value`);
      const replicas = typeof spec.replicas === "string" ? Number(spec.replicas) : 1;
      const version = versionOf(first.image);
      if (!one(state)) {
        push({ type: "apply", replicas, version });
        said.push("deployment.apps/web created");
      } else {
        const changed = replicas !== state.desired || version !== state.version;
        if (version !== state.version) push({ type: "setImage", version });
        if (replicas !== state.desired) push({ type: "scale", to: replicas });
        said.push(changed ? "deployment.apps/web configured" : "deployment.apps/web unchanged");
      }
    } else if (kind === "Service") {
      if (name !== "web") return say("(this cluster's Service is called web)", "dim");
      if (!state.service) {
        if (!one(state)) return fail('Error from server (NotFound): deployments.apps "web" not found (the Service has no pods to send to yet)');
        push({ type: "expose" });
        said.push("service/web created");
      } else said.push("service/web unchanged");
    } else return fail(`error: resource mapping not found for name: "${String(name ?? "")}" kind: "${String(kind ?? "")}"`);
  }
  return { actions, output: said.map((t) => out(t)) };
}

const HELP = `This sandbox understands:
  kubectl get pods|deployments|services|nodes [-o wide]
  kubectl create deployment web --image=… --replicas=N
  kubectl expose deployment web --port=80 --target-port=3000
  kubectl scale deployment web --replicas=N
  kubectl delete pod <name>
  kubectl set image deployment/web shop=<image>
  kubectl rollout status|undo|history deployment/web
  kubectl apply -f web.yaml       (edit it with nano web.yaml)
  kubectl port-forward service/web 8080:80, then curl localhost:8080
  ls, cat, nano, clear`;

const KUBECTL_HELP = `kubectl controls the Kubernetes cluster manager.

Basic Commands: create, expose, run, set, get, delete
Deploy Commands: rollout, scale
Advanced Commands: apply
Troubleshooting: logs, port-forward`;
