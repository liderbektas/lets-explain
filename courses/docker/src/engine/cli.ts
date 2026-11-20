import type { CommandLine, ShellEditor, ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { complete as completeWord, lines, out, shellWords, splitCommands, type TermLine } from "@lets-explain/core/lib/terminal";
import {
  apply,
  findContainer,
  imageFor,
  imageSize,
  normalize,
  shortHash,
  type Container,
  type DockerAction,
  type DockerEvent,
  type Files,
  type Host,
  type RestartPolicy,
  type RunOptions,
} from "./docker";
import { memoryMB, mergeYaml, parseComposeDoc, parseDockerfile, parseEnv, parseYaml, type Yaml } from "./files";
import { images as imagesTable, inspect, ps as psTable, stats as statsTable, status as containerStatus } from "./format";

/**
 * A command line on top of the model: what a reader types (`docker run -d -p 8080:80 nginx`,
 * `nano Dockerfile`, `docker compose up -d`) becomes the same actions the lessons play, and the
 * terminal prints what the real Docker CLI prints. Commands it does not know say so plainly.
 *
 * The reader works in ~/project, which is /home/ada/project on the host: the Dockerfile,
 * compose.yaml, .env and source files live there, and `-v ./x:/y` binds from there.
 */

export type DockerResult = ShellResult<DockerAction, Host>;
export type DockerEditor = ShellEditor<DockerAction, Host>;

export const PROJECT_DIR = "/home/ada/project";
const PROJECT = "project";

/** The project's files, relative to ~/project. */
export function projectFiles(h: Host): Files {
  const out: Files = {};
  for (const [p, v] of Object.entries(h.hostFiles)) if (p.startsWith(`${PROJECT_DIR}/`)) out[p.slice(PROJECT_DIR.length + 1)] = v;
  return out;
}

/** Actions that put files into ~/project, for scenario start states. */
export const projectSetup = (files: Files): DockerAction[] => Object.entries(files).map(([p, content]) => ({ type: "editHost", path: `${PROJECT_DIR}/${p}`, content }));

/* ------------------------------------------------------------------ entry */

export function runLine(start: Host, line: string): DockerResult {
  const result: DockerResult = { actions: [], output: [], moves: 0 };
  let h = start;
  for (const words of splitCommands(shellWords(line))) {
    const r = runCommand(h, words);
    result.actions.push(...r.actions);
    result.output.push(...r.output);
    if (r.clear) {
      result.clear = true;
      result.output = [];
    }
    // Looking (curl, sleep alone) is free; changing something counts.
    if (r.actions.some((a) => a.type !== "curl")) result.moves++;
    for (const a of r.actions) h = apply(h, a).state;
    if (r.editor) {
      result.editor = r.editor;
      break;
    }
    if (r.failed) break;
  }
  return result;
}

export const promptFor = (): string => "ada@laptop:~/project$";

const SHELL = ["docker", "ls", "cat", "echo", "nano", "curl", "sleep", "clear", "help"];
const DOCKER_SUB = ["run", "ps", "logs", "exec", "stop", "start", "restart", "kill", "rm", "images", "pull", "push", "build", "tag", "rmi", "inspect", "stats", "network", "volume", "compose", "image", "container", "system"];
const FLAGS = ["-d", "-p", "--name", "-e", "-v", "--network", "--rm", "--restart", "-m", "--memory", "-f", "-a", "-t", "--build", "--no-stream"];

export function completeLine(h: Host, input: string) {
  const words = input.trimStart().split(/\s+/);
  let candidates: string[];
  if (words.length <= 1) candidates = SHELL;
  else if (words[0] === "docker" && words.length === 2) candidates = DOCKER_SUB;
  else {
    candidates = [
      ...Object.values(h.containers).map((c) => c.name),
      ...Object.keys(h.tags).map((t) => t.replace(/:latest$/, "")),
      ...Object.keys(h.tags),
      ...Object.keys(projectFiles(h)),
      ...Object.keys(h.volumes).filter((v) => !h.volumes[v]!.anonymous),
      ...Object.keys(h.networks),
      ...FLAGS,
      "up",
      "down",
      "localhost:",
    ];
  }
  return completeWord(input, candidates);
}

export const dockerShell: CommandLine<DockerAction, Host> = { run: runLine, prompt: promptFor, complete: completeLine, title: "bash" };

/* --------------------------------------------------------------- commands */

interface Run {
  actions: DockerAction[];
  output: TermLine[];
  failed?: boolean;
  editor?: DockerEditor;
  clear?: boolean;
}

const say = (text: string, tone: TermLine["tone"] = "out"): Run => ({ actions: [], output: text ? lines(text, tone) : [] });
const fail = (text: string): Run => ({ actions: [], output: lines(text, "err"), failed: true });

function runCommand(h: Host, words: string[], stdin?: string, env: Record<string, string> = {}): Run {
  // `a | b`: what a prints is what b reads (docker login --password-stdin, mostly).
  const bar = words.indexOf("|");
  if (bar > 0) {
    const left = runCommand(h, words.slice(0, bar), stdin, env);
    if (left.failed) return left;
    return runCommand(h, words.slice(bar + 1), left.output.map((l) => l.text).join("\n"), env);
  }
  // `TAG=sha-3f2a1c9 docker compose …`: variables for this one command.
  const assign = /^([A-Za-z_]\w*)=(.*)$/.exec(words[0] ?? "");
  if (assign && words.length > 1) return runCommand(h, words.slice(1), stdin, { ...env, [assign[1]!]: assign[2]! });
  const [cmd, ...args] = words;
  if (cmd === "docker" && args[0] === "login") return login(h, args.slice(1), stdin);
  if (cmd === "docker" && args[0] === "logout") return logout(h, args.slice(1));
  if (cmd === "docker" && args[0] === "compose") return compose(h, args.slice(1), env);
  if (cmd === "docker-compose") return compose(h, args, env);
  switch (cmd) {
    case "docker":
      return docker(h, args);
    case "docker-compose":
      return compose(h, args);
    case "sudo":
      return runCommand(h, args);
    case "clear":
      return { actions: [], output: [], clear: true };
    case "help":
      return say(HELP);
    case "ls": {
      const files = Object.keys(projectFiles(h)).filter((p) => args.includes("-a") || !p.startsWith("."));
      const top = [...new Set(files.map((p) => p.split("/")[0]!))].sort();
      return say(top.join("  "));
    }
    case "pwd":
      return say(PROJECT_DIR);
    case "cd":
      return say("cd: this sandbox stays in ~/project", "dim");
    case "cat": {
      if (!args.length) return fail("cat: missing file operand");
      const files = projectFiles(h);
      const output: TermLine[] = [];
      for (const p of args) {
        if (files[p] === undefined) return { actions: [], output: [...output, out(`cat: ${p}: No such file or directory`, "err")], failed: true };
        output.push(...lines(files[p]!));
      }
      return { actions: [], output };
    }
    case "echo": {
      const at = args.findIndex((a) => a === ">" || a === ">>");
      if (at === -1) return say(args.join(" "));
      const path = args[at + 1];
      if (!path) return fail("bash: syntax error near unexpected token `newline'");
      const text = args.slice(0, at).join(" ");
      const old = projectFiles(h)[path];
      return { actions: [{ type: "editHost", path: `${PROJECT_DIR}/${path}`, content: args[at] === ">>" && old ? `${old}\n${text}` : text }], output: [] };
    }
    case "rm": {
      const paths = args.filter((a) => !a.startsWith("-"));
      if (!paths.length) return fail("rm: missing operand");
      const files = projectFiles(h);
      for (const p of paths) if (files[p] === undefined) return fail(`rm: cannot remove '${p}': No such file or directory`);
      return { actions: paths.map((p) => ({ type: "removeHost", path: `${PROJECT_DIR}/${p}` })), output: [] };
    }
    case "touch":
      return { actions: args.filter((p) => projectFiles(h)[p] === undefined).map((p) => ({ type: "editHost", path: `${PROJECT_DIR}/${p}`, content: "" })), output: [] };
    case "nano":
    case "vim":
    case "vi":
    case "code": {
      const path = args.find((a) => !a.startsWith("-"));
      if (!path) return fail(`${cmd}: give the file to open, e.g. ${cmd} Dockerfile`);
      return {
        actions: [],
        output: [],
        editor: {
          file: path,
          text: projectFiles(h)[path] ?? "",
          save: (host, text) => {
            const content = text.replace(/\n+$/, "");
            if (projectFiles(host)[path] === content) return { actions: [], output: [], moves: 0 };
            return { actions: [{ type: "editHost", path: `${PROJECT_DIR}/${path}`, content }], output: [], moves: 1 };
          },
        },
      };
    }
    case "curl": {
      const target = args.find((a) => !a.startsWith("-"));
      const m = target ? /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1):(\d+)/.exec(target) : null;
      if (!target) return fail("curl: try 'curl --help' for more information");
      if (!m) return say(`(only localhost:<port> is reachable from this sandbox)`, "dim");
      return run(h, [{ type: "curl", port: Number(m[1]) }]);
    }
    case "sleep": {
      const n = Math.max(1, Math.min(60, Math.round(Number(args[0]) || 1)));
      return run(h, [{ type: "tick", count: n }]);
    }
    case "systemctl":
    case "service":
      if (args.includes("docker") && args.includes("restart")) return run(h, [{ type: "daemonRestart" }]);
      return say(`(${cmd} here only knows: systemctl restart docker)`, "dim");
    default:
      return fail(`bash: ${cmd}: command not found`);
  }
}

/* --------------------------------------------------------------- flags */

interface Parsed {
  flags: Map<string, string | true>;
  all: Map<string, string[]>;
  rest: string[];
}

/** Docker-style flags: `-p 8080:80`, `--name=web`, combined `-dit`. Parsing stops at the first word that is not a flag when `stopAtWord`. */
function parse(args: string[], known: Record<string, string>, stopAtWord = false): Parsed | string {
  const p: Parsed = { flags: new Map(), all: new Map(), rest: [] };
  const takes = (f: string) => known[f]?.endsWith("=") ?? false;
  const nameOf = (f: string) => (known[f] ?? "").replace(/=$/, "") || f;
  const set = (f: string, v: string | true) => {
    const name = nameOf(f);
    p.flags.set(name, v);
    if (typeof v === "string") p.all.set(name, [...(p.all.get(name) ?? []), v]);
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (stopAtWord && !a.startsWith("-")) {
      p.rest.push(...args.slice(i));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const flag = eq > 0 ? a.slice(0, eq) : a;
      if (!(flag in known)) return `unknown flag: ${flag}`;
      if (takes(flag)) {
        const v = eq > 0 ? a.slice(eq + 1) : args[++i];
        if (v === undefined) return `flag needs an argument: ${flag}`;
        set(flag, v);
      } else set(flag, true);
    } else if (/^-[a-zA-Z]/.test(a)) {
      const letters = a.slice(1);
      for (let j = 0; j < letters.length; j++) {
        const flag = `-${letters[j]}`;
        if (!(flag in known)) return `unknown shorthand flag: '${letters[j]}' in ${a}`;
        if (takes(flag)) {
          const v = letters.slice(j + 1) || args[++i];
          if (v === undefined) return `flag needs an argument: '${letters[j]}' in ${a}`;
          set(flag, v);
          break;
        }
        set(flag, true);
      }
    } else p.rest.push(a);
  }
  return p;
}

const usage = (err: string, cmd: string) => fail(`${err}\nSee 'docker ${cmd} --help'.`);

/* ----------------------------------------------------------------- docker */

function docker(h: Host, args: string[]): Run {
  const [sub, ...rest] = args;
  if (!sub || sub === "--help" || sub === "help") return say(DOCKER_HELP);
  if (sub === "--version" || sub === "version") return say("Docker version 27.3.1, build ce12230");
  // `docker container ls`, `docker image rm` and friends are the same commands.
  if (sub === "container" || sub === "image") {
    const [verb, ...more] = rest;
    const map: Record<string, string> = sub === "container" ? { ls: "ps", list: "ps", rm: "rm", run: "run", create: "create", port: "port", stop: "stop", start: "start", logs: "logs", inspect: "inspect", prune: "container-prune", exec: "exec", restart: "restart", kill: "kill" } : { ls: "images", list: "images", rm: "rmi", pull: "pull", push: "push", build: "build", tag: "tag", inspect: "inspect", prune: "image-prune" };
    const to = verb ? map[verb] : undefined;
    if (!to) return fail(`docker: '${sub} ${verb ?? ""}' is not a docker command.\nSee 'docker --help'`);
    return docker(h, [to, ...more]);
  }
  const handler = DOCKER[sub];
  if (!handler) return fail(`docker: '${sub}' is not a docker command.\nSee 'docker --help'`);
  return handler(h, rest);
}

const RUN_FLAGS: Record<string, string> = {
  "-d": "-d", "--detach": "-d", "-p": "-p=", "--publish": "-p=", "--name": "--name=", "-e": "-e=", "--env": "-e=", "-v": "-v=", "--volume": "-v=",
  "--network": "--network=", "--net": "--network=", "--rm": "--rm", "--restart": "--restart=", "-m": "-m=", "--memory": "-m=", "--cpus": "--cpus=",
  "-u": "-u=", "--user": "-u=", "--entrypoint": "--entrypoint=", "-i": "-i", "--interactive": "-i", "-t": "-t", "--tty": "-t", "--env-file": "--env-file=",
  "-P": "-P",
};

function runOptions(h: Host, args: string[], cmd: string): { opts: RunOptions } | Run {
  const p = parse(args, RUN_FLAGS, true);
  if (typeof p === "string") return usage(p, cmd);
  const [image, ...command] = p.rest;
  if (!image) return usage(`"docker ${cmd}" requires at least 1 argument.\nUsage:  docker ${cmd} [OPTIONS] IMAGE [COMMAND] [ARG...]`, cmd);
  const env: Record<string, string> = {};
  for (const kv of p.all.get("-e") ?? []) {
    const [k, ...v] = kv.split("=");
    env[k!] = v.join("=");
  }
  const envFile = p.flags.get("--env-file");
  if (typeof envFile === "string") {
    const text = projectFiles(h)[envFile.replace(/^\.\//, "")];
    if (text === undefined) return fail(`docker: open ${envFile}: no such file or directory.`);
    Object.assign(env, parseEnv(text));
  }
  const restart = p.flags.get("--restart");
  if (typeof restart === "string" && !["no", "always", "unless-stopped", "on-failure"].includes(restart.split(":")[0]!))
    return fail(`docker: Error response from daemon: invalid restart policy '${restart}'.`);
  const mem = p.flags.get("-m");
  const memory = typeof mem === "string" ? memoryMB(mem) : undefined;
  if (typeof mem === "string" && memory === undefined) return fail(`invalid argument "${mem}" for "-m, --memory" flag: invalid size: '${mem}'`);
  const entry = p.flags.get("--entrypoint");
  const opts: RunOptions = {
    image,
    ...(p.flags.has("-d") ? { detach: true } : {}),
    ...(p.flags.has("--rm") ? { rm: true } : {}),
    ...(typeof p.flags.get("--name") === "string" ? { name: p.flags.get("--name") as string } : {}),
    ...(p.all.get("-p") ? { ports: p.all.get("-p")!.map((x) => x.replace(/^0\.0\.0\.0:/, "").replace(/\/tcp$/, "")) } : {}),
    ...(Object.keys(env).length ? { env } : {}),
    ...(p.all.get("-v") ? { volumes: p.all.get("-v") } : {}),
    ...(typeof p.flags.get("--network") === "string" ? { network: p.flags.get("--network") as string } : {}),
    ...(typeof restart === "string" ? { restart: restart.split(":")[0] as RestartPolicy } : {}),
    ...(memory !== undefined ? { memory } : {}),
    ...(typeof p.flags.get("--cpus") === "string" ? { cpus: Number(p.flags.get("--cpus")) } : {}),
    ...(typeof p.flags.get("-u") === "string" ? { user: p.flags.get("-u") as string } : {}),
    ...(typeof entry === "string" ? { entrypoint: [entry] } : {}),
    ...(command.length ? { cmd: command } : {}),
  };
  // -P publishes every EXPOSEd port on a random host port.
  if (p.flags.has("-P")) {
    const img = imageFor(h, image) ?? (h.registry.tags[normalize(image)] ? h.registry.images[h.registry.tags[normalize(image)]!] : undefined);
    opts.ports = [...(opts.ports ?? []), ...(img?.config.exposed ?? []).map(String)];
  }
  return { opts };
}

type Handler = (h: Host, args: string[]) => Run;

const DOCKER: Record<string, Handler> = {
  /** `docker port web`: where each published container port is on the host. */
  port(h, args) {
    const name = args.find((a) => !a.startsWith("-"));
    if (!name) return usage(`"docker port" requires at least 1 argument.`, "port");
    const c = findContainer(h, name);
    if (!c) return fail(`Error response from daemon: No such container: ${name}`);
    return say(c.ports.map((p) => `${p.container}/tcp -> 0.0.0.0:${p.host}`).join("\n"));
  },

  run(h, args) {
    const r = runOptions(h, args, "run");
    if ("actions" in r) return r;
    const interactive = args.some((a) => /^-[a-zA-Z]*[it]/.test(a) && !a.startsWith("--"));
    const res = run(h, [{ type: "run", ...r.opts }], { cmd: "run", detach: r.opts.detach });
    if (res.failed) return res;
    if (interactive) res.output.push(out("(no interactive session here: the container runs, and you type the next command)", "dim"));
    else if (!r.opts.detach) {
      let after = h;
      for (const a of res.actions) after = apply(after, a).state;
      const created = Object.values(after.containers).find((c) => !h.containers[c.id]);
      if (created?.state === "running") res.output.push(out("(attached: a real terminal would stay on this container until Ctrl+C; here it keeps running and the prompt comes back. Use -d to run it in the background)", "dim"));
    }
    return res;
  },

  create(h, args) {
    const r = runOptions(h, args, "create");
    if ("actions" in r) return r;
    return run(h, [{ type: "create", ...r.opts }], { cmd: "create", detach: true });
  },

  ps(h, args) {
    const p = parse(args, { "-a": "-a", "--all": "-a", "-q": "-q", "--quiet": "-q" });
    if (typeof p === "string") return usage(p, "ps");
    if (p.flags.has("-q")) return say(Object.values(h.containers).filter((c) => p.flags.has("-a") || c.state === "running").map((c) => c.id.slice(0, 12)).join("\n"));
    const table = psTable(h, p.flags.has("-a"));
    return { actions: [], output: [out(table[0]!, "dim"), ...table.slice(1).map((t) => out(t))] };
  },

  images(h, args) {
    const p = parse(args, { "-q": "-q", "--quiet": "-q", "-a": "-a" });
    if (typeof p === "string") return usage(p, "images");
    if (p.flags.has("-q")) return say([...new Set(Object.values(h.tags))].map((id) => id.slice(0, 12)).join("\n"));
    const table = imagesTable(h);
    return { actions: [], output: [out(table[0]!, "dim"), ...table.slice(1).map((t) => out(t))] };
  },

  logs(h, args) {
    const p = parse(args, { "-f": "-f", "--follow": "-f", "--tail": "--tail=", "-n": "--tail=", "-t": "-t" });
    if (typeof p === "string") return usage(p, "logs");
    const name = p.rest[0];
    if (!name) return usage(`"docker logs" requires exactly 1 argument.`, "logs");
    const c = findContainer(h, name);
    if (!c) return fail(`Error response from daemon: No such container: ${name}`);
    const tail = p.flags.get("--tail");
    const logs = typeof tail === "string" ? c.logs.slice(-Number(tail)) : c.logs;
    const o = logs.map((l) => out(l, /error|denied|killed|not found/i.test(l) ? "err" : "out"));
    if (p.flags.has("-f")) o.push(out("(-f follows new lines in a real terminal; here it shows what is there)", "dim"));
    return { actions: [], output: o };
  },

  exec(h, args) {
    const p = parse(args, { "-i": "-i", "-t": "-t", "--interactive": "-i", "--tty": "-t", "-u": "-u=", "--user": "-u=", "-e": "-e=", "-w": "-w=" }, true);
    if (typeof p === "string") return usage(p, "exec");
    const [name, ...command] = p.rest;
    if (!name || !command.length) return usage(`"docker exec" requires at least 2 arguments.\nUsage:  docker exec [OPTIONS] CONTAINER COMMAND [ARG...]`, "exec");
    if (command.length === 1 && ["sh", "bash", "/bin/sh", "/bin/bash", "ash"].includes(command[0]!)) {
      // An image without that shell fails like the real one (distroless has none); otherwise a shell needs a terminal.
      const c = findContainer(h, name);
      const img = c ? h.images[c.image] : undefined;
      if (!img || img.config.binaries.includes(command[0]!.split("/").pop()!))
        return say(`(no interactive shell in this sandbox: run one command at a time, e.g. docker exec ${name} ls /)`, "dim");
      return run(h, [{ type: "exec", container: name, cmd: command[0]! }], { cmd: "exec" });
    }
    // `sh -c "cmd"` runs cmd.
    const text = command[0] === "sh" && command[1] === "-c" ? command.slice(2).join(" ") : command.join(" ");
    return run(h, [{ type: "exec", container: name, cmd: text }], { cmd: "exec" });
  },

  stop: (h, args) => each(h, args, "stop", (container) => ({ type: "stop", container })),
  kill: (h, args) => each(h, args, "kill", (container) => ({ type: "kill", container })),
  start: (h, args) => each(h, args, "start", (container) => ({ type: "start", container })),
  restart: (h, args) => each(h, args, "restart", (container) => ({ type: "restart", container })),
  rm(h, args) {
    const p = parse(args, { "-f": "-f", "--force": "-f", "-v": "-v", "--volumes": "-v" });
    if (typeof p === "string") return usage(p, "rm");
    if (!p.rest.length) return usage(`"docker rm" requires at least 1 argument.`, "rm");
    return each(h, p.rest, "rm", (container) => ({ type: "rm", container, force: p.flags.has("-f") || undefined, volumes: p.flags.has("-v") || undefined }));
  },

  pull(h, args) {
    const ref = args.find((a) => !a.startsWith("-"));
    if (!ref) return usage(`"docker pull" requires exactly 1 argument.`, "pull");
    return run(h, [{ type: "pull", ref }], { cmd: "pull" });
  },

  push(h, args) {
    const ref = args.find((a) => !a.startsWith("-"));
    if (!ref) return usage(`"docker push" requires exactly 1 argument.`, "push");
    for (const fl of args.filter((a) => a.startsWith("-"))) if (!["-a", "--all-tags", "-q", "--quiet"].includes(fl)) return fail(`unknown flag: ${fl}`);
    // --all-tags: every local tag of the repository, one push each.
    if (args.includes("-a") || args.includes("--all-tags")) {
      if (ref.includes(":") && !ref.endsWith(":") && /:[^/]+$/.test(ref)) return fail(`tag can't be used with --all-tags/-a`);
      const repo = ref;
      const tags = Object.keys(h.tags).filter((t) => t.slice(0, t.lastIndexOf(":")) === repo).sort();
      if (!tags.length) return fail(`An image does not exist locally with the tag: ${repo}`);
      if (!loggedIn(h, registryOf(repo))) return fail(`The push refers to repository [${repo}]\nunauthorized: unauthenticated: User cannot be authenticated with the token provided.`);
      return run(h, tags.map((t) => ({ type: "push", ref: t }) as DockerAction), { cmd: "push" });
    }
    // Pushing needs a login to that registry, as for real; pulling public images does not.
    const server = registryOf(ref);
    if (h.tags[normalize(ref)] && !loggedIn(h, server)) {
      const repo = normalize(ref).replace(/:[^:/]+$/, "");
      return fail(
        server === "docker.io"
          ? `The push refers to repository [docker.io/${repo}]\npush access denied for ${repo}, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed`
          : `The push refers to repository [${repo}]\nunauthorized: unauthenticated: User cannot be authenticated with the token provided.`,
      );
    }
    return run(h, [{ type: "push", ref }], { cmd: "push" });
  },

  tag(h, args) {
    const [source, target] = args.filter((a) => !a.startsWith("-"));
    if (!source || !target) return usage(`"docker tag" requires exactly 2 arguments.\nUsage:  docker tag SOURCE_IMAGE[:TAG] TARGET_IMAGE[:TAG]`, "tag");
    return run(h, [{ type: "tag", source, target }]);
  },

  rmi(h, args) {
    const p = parse(args, { "-f": "-f", "--force": "-f" });
    if (typeof p === "string") return usage(p, "rmi");
    if (!p.rest.length) return usage(`"docker rmi" requires at least 1 argument.`, "rmi");
    return run(h, p.rest.map((ref) => ({ type: "rmi", ref, force: p.flags.has("-f") || undefined }) as DockerAction));
  },

  build(h, args) {
    const p = parse(args, { "-t": "-t=", "--tag": "-t=", "-f": "-f=", "--file": "-f=", "--target": "--target=", "--build-arg": "--build-arg=", "--no-cache": "--no-cache", "-q": "-q" });
    if (typeof p === "string") return usage(p, "build");
    const ctx = p.rest[0];
    if (!ctx) return fail(`ERROR: "docker buildx build" requires exactly 1 argument.\nSee 'docker buildx build --help'.\n\nUsage:  docker buildx build [OPTIONS] PATH | URL | -`);
    const files = projectFiles(h);
    const prefix = ctx === "." || ctx === "./" ? "" : `${ctx.replace(/^\.\//, "").replace(/\/$/, "")}/`;
    const context: Files = {};
    for (const [path, v] of Object.entries(files)) if (path.startsWith(prefix)) context[path.slice(prefix.length)] = v;
    const dfName = typeof p.flags.get("-f") === "string" ? (p.flags.get("-f") as string).replace(/^\.\//, "") : `${prefix}Dockerfile`;
    const text = files[dfName];
    if (text === undefined) return fail(`ERROR: failed to solve: failed to read dockerfile: open ${dfName.split("/").pop()}: no such file or directory`);
    const parsed = parseDockerfile(text, context);
    if (parsed.errors.length) return fail(`ERROR: failed to solve: ${parsed.errors[0]!.replace(/^failed to solve: /, "")}`);
    const tag = typeof p.flags.get("-t") === "string" ? (p.flags.get("-t") as string) : `sha256-${shortHash(text)}`;
    const args2: Record<string, string> = {};
    for (const kv of p.all.get("--build-arg") ?? []) args2[kv.split("=")[0]!] = kv.split("=").slice(1).join("=");
    const ignore = (context[".dockerignore"] ?? "").split("\n").map((x) => x.trim()).filter((x) => x && !x.startsWith("#"));
    const actions: DockerAction[] = [];
    const target = p.flags.get("--target");
    actions.push({ type: "build", tag, dockerfile: parsed.instructions, context, ignore, ...(Object.keys(args2).length ? { args: args2 } : {}), ...(typeof target === "string" ? { target } : {}), ...(p.flags.has("--no-cache") ? { noCache: true } : {}) });
    return run(h, actions, { cmd: "build" });
  },

  inspect(h, args) {
    const p = parse(args, { "-f": "-f=", "--format": "-f=", "--type": "--type=" });
    if (typeof p === "string") return usage(p, "inspect");
    const name = p.rest[0];
    if (!name) return usage(`"docker inspect" requires at least 1 argument.`, "inspect");
    const c = findContainer(h, name);
    const format = p.flags.get("-f");
    if (c) {
      if (typeof format === "string") {
        const v = formatInspect(c, format);
        return v === null ? say(`(this sandbox knows .State.Status, .State.ExitCode, .State.OOMKilled, .Config.Env, .HostConfig.RestartPolicy.Name, .NetworkSettings.Networks)`, "dim") : say(v);
      }
      return say(inspect(c).join("\n"));
    }
    const img = imageFor(h, name);
    if (img) {
      return say(
        [
          "[{",
          `  "Id": "sha256:${img.id}…",`,
          `  "RepoTags": ${JSON.stringify(Object.keys(h.tags).filter((t) => h.tags[t] === img.id))},`,
          `  "Config": { "Cmd": ${JSON.stringify(img.config.cmd)}, "Entrypoint": ${JSON.stringify(img.config.entrypoint)}, "WorkingDir": "${img.config.workdir}", "User": "${img.config.user === "root" ? "" : img.config.user}", "ExposedPorts": ${JSON.stringify(Object.fromEntries(img.config.exposed.map((x) => [`${x}/tcp`, {}])))} },`,
          `  "Size": ${imageSize(img)}MB,`,
          `  "RootFS": { "Layers": ${img.layers.length} }`,
          "}]",
        ].join("\n"),
      );
    }
    return fail(`Error: No such object: ${name}`);
  },

  stats(h, args) {
    const table = statsTable(h);
    const o = [out(table[0]!, "dim"), ...table.slice(1).map((t) => out(t))];
    if (!args.includes("--no-stream")) o.push(out("(stats streams live in a real terminal; here it shows one reading)", "dim"));
    return { actions: [], output: o };
  },

  network(h, args) {
    const [verb, ...rest] = args;
    if (verb === "ls" || verb === "list") {
      return {
        actions: [],
        output: [
          out("NETWORK ID     NAME                DRIVER    SCOPE", "dim"),
          ...Object.values(h.networks).map((n) => out(`${shortHash(`net:${n.name}`)}   ${n.name.padEnd(19)} ${n.driver.padEnd(9)} local`)),
        ],
      };
    }
    if (verb === "create") {
      const name = rest.find((a) => !a.startsWith("-"));
      if (!name) return usage(`"docker network create" requires exactly 1 argument.`, "network create");
      const r = run(h, [{ type: "networkCreate", name }]);
      return r.failed ? r : { ...r, output: [out(longId(`network:${name}`))] };
    }
    if (verb === "connect") {
      const [network, container] = rest.filter((a) => !a.startsWith("-"));
      if (!network || !container) return usage(`"docker network connect" requires exactly 2 arguments.`, "network connect");
      return run(h, [{ type: "networkConnect", network, container }]);
    }
    if (verb === "prune") return run(h, [{ type: "prune" }], { cmd: "prune" });
    return say(`(docker network here knows: ls, create, connect)`, "dim");
  },

  volume(h, args) {
    const [verb, ...rest] = args;
    if (verb === "ls" || verb === "list") {
      return { actions: [], output: [out("DRIVER    VOLUME NAME", "dim"), ...Object.values(h.volumes).map((v) => out(`local     ${v.name}`))] };
    }
    if (verb === "create") {
      const name = rest.find((a) => !a.startsWith("-"));
      if (!name) return say(`(give the volume a name: docker volume create <name>)`, "dim");
      const r = run(h, [{ type: "volumeCreate", name }]);
      return r.failed ? r : { ...r, output: [out(name)] };
    }
    if (verb === "rm") {
      const names = rest.filter((a) => !a.startsWith("-"));
      if (!names.length) return usage(`"docker volume rm" requires at least 1 argument.`, "volume rm");
      return run(h, names.map((name) => ({ type: "volumeRm", name }) as DockerAction), { echo: names });
    }
    if (verb === "prune") {
      if (!rest.includes("-f") && !rest.includes("--force")) return confirmNote("volume prune");
      return run(h, [{ type: "prune", volumes: true, all: rest.includes("-a") || rest.includes("--all") }], { cmd: "prune" });
    }
    if (verb === "inspect") {
      const v = h.volumes[rest[0] ?? ""];
      if (!v) return fail(`Error response from daemon: get ${rest[0]}: no such volume`);
      return say(`[{\n  "Driver": "local",\n  "Mountpoint": "/var/lib/docker/volumes/${v.name}/_data",\n  "Name": "${v.name}"\n}]`);
    }
    return say(`(docker volume here knows: ls, create, rm, prune, inspect)`, "dim");
  },

  "image-prune"(h, args) {
    if (!args.includes("-f") && !args.includes("--force")) return confirmNote("image prune");
    return run(h, [{ type: "prune", all: args.includes("-a") || args.includes("--all"), only: "images" }], { cmd: "prune" });
  },

  "container-prune"(h, args) {
    if (!args.includes("-f") && !args.includes("--force")) return confirmNote("container prune");
    return run(h, [{ type: "prune" }], { cmd: "prune" });
  },

  system(h, args) {
    const [verb, ...rest] = args;
    if (verb === "prune") {
      if (!rest.includes("-f") && !rest.includes("--force")) return confirmNote("system prune");
      return run(h, [{ type: "prune", all: rest.includes("-a") || rest.includes("--all"), volumes: rest.includes("--volumes") }], { cmd: "prune" });
    }
    if (verb === "df") {
      const imgs = Object.values(h.images);
      return say(`TYPE            TOTAL     ACTIVE    SIZE\nImages          ${imgs.length}         ${new Set(Object.values(h.containers).map((c) => c.image)).size}         ${imgs.reduce((n, i) => n + imageSize(i), 0)}MB\nContainers      ${Object.keys(h.containers).length}         ${Object.values(h.containers).filter((c) => c.state === "running").length}\nLocal Volumes   ${Object.keys(h.volumes).length}`);
    }
    return say(`(docker system here knows: prune, df)`, "dim");
  },

  compose: (h, args) => compose(h, args),
};

/** Commands that act on several containers print each name back, as Docker does. */
function each(h: Host, names: string[], cmd: string, make: (name: string) => DockerAction): Run {
  const refs = names.filter((n) => !n.startsWith("-"));
  if (!refs.length) return usage(`"docker ${cmd}" requires at least 1 argument.`, cmd);
  return run(h, refs.map(make), { cmd, echo: refs });
}

function confirmNote(what: string): Run {
  return say(`WARNING! This will remove ${what.startsWith("volume") ? "anonymous local volumes not used by at least one container" : what.startsWith("container") ? "all stopped containers" : what.startsWith("system") ? "all stopped containers, unused networks and dangling images" : "all dangling images"}.\nAre you sure you want to continue? [y/N]\n(this sandbox can't answer prompts: add -f to confirm)`, "dim");
}

/* ---------------------------------------------------------------- compose */

const CONFIG_JSON = "/home/ada/.docker/config.json";

/** The registry a reference lives in: `ghcr.io/ada/shop:1.0` → ghcr.io, `acme/api` → docker.io. */
export function registryOf(ref: string): string {
  const first = ref.split("/")[0]!;
  return ref.includes("/") && (first.includes(".") || first.includes(":") || first === "localhost") ? first : "docker.io";
}

/** Registries ~/.docker/config.json has credentials for. */
function logins(h: Host): string[] {
  const raw = h.hostFiles[CONFIG_JSON];
  if (!raw) return [];
  try {
    return Object.keys((JSON.parse(raw) as { auths?: Record<string, unknown> }).auths ?? {}).map((k) => (k.includes("docker.io") ? "docker.io" : k));
  } catch {
    return [];
  }
}
const loggedIn = (h: Host, server: string) => logins(h).includes(server);

function writeLogins(servers: string[]): DockerAction {
  const auths = Object.fromEntries(servers.map((x) => [x === "docker.io" ? "https://index.docker.io/v1/" : x, {}]));
  return { type: "editHost", path: CONFIG_JSON, content: JSON.stringify({ auths, credsStore: "desktop" }, null, 2) };
}

function login(h: Host, args: string[], stdin?: string): Run {
  const p = parse(args, { "-u": "-u=", "--username": "-u=", "-p": "-p=", "--password": "-p=", "--password-stdin": "--stdin" });
  if (typeof p === "string") return fail(p);
  const server = p.rest[0] ?? "docker.io";
  const user = p.flags.get("-u");
  const pass = p.flags.has("--stdin") ? (stdin ?? "").trim() : p.flags.get("-p");
  if (p.flags.has("--stdin") && stdin === undefined) return fail("Error: Cannot perform an interactive login from a non TTY device");
  if (typeof user !== "string" || !pass) {
    return say(
      `Username:\n(this sandbox can't answer prompts: pipe a token in, e.g. echo $GITHUB_TOKEN | docker login ${server === "docker.io" ? "" : `${server} `}-u ada --password-stdin)`,
      "dim",
    );
  }
  const o = typeof p.flags.get("-p") === "string" ? [out("WARNING! Using --password via the CLI is insecure. Use --password-stdin.", "dim")] : [];
  if (loggedIn(h, server)) return { actions: [], output: [...o, out("Login Succeeded")] };
  return { actions: [writeLogins([...logins(h), server])], output: [...o, out("Login Succeeded")] };
}

function logout(h: Host, args: string[]): Run {
  const server = args.find((a) => !a.startsWith("-")) ?? "docker.io";
  if (!loggedIn(h, server)) return say(`Not logged in to ${server}`);
  const rest = logins(h).filter((x) => x !== server);
  const action: DockerAction = rest.length ? writeLogins(rest) : { type: "removeHost", path: CONFIG_JSON };
  return { actions: [action], output: [out(`Removing login credentials for ${server === "docker.io" ? "https://index.docker.io/v1/" : server}`)] };
}

const COMPOSE_NAMES = ["compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml"];

interface ComposeSetup {
  project: string;
  doc: Yaml;
  env: Record<string, string>;
  names: string[];
}

/** Reads the compose files: -f ones, or compose.yaml plus compose.override.yaml, merged; and the variables. */
function loadCompose(h: Host, fileArgs: string[], projectArg: string | undefined, envFile: string | undefined, shellEnv: Record<string, string>): ComposeSetup | string {
  const files = projectFiles(h);
  let names = fileArgs.map((f) => f.replace(/^\.\//, ""));
  if (!names.length) {
    const main = COMPOSE_NAMES.find((f) => files[f] !== undefined);
    if (!main) return "no configuration file provided: not found";
    names = [main, ...["compose.override.yaml", "compose.override.yml", "docker-compose.override.yml"].filter((f) => files[f] !== undefined).slice(0, 1)];
  }
  let doc: Yaml = {};
  for (const n of names) {
    if (files[n] === undefined) return `open /home/ada/project/${n}: no such file or directory`;
    try {
      doc = mergeYaml(doc, parseYaml(files[n]!));
    } catch (e) {
      return `yaml: ${n}: ${(e as Error).message.replace(/^yaml: /, "")}`;
    }
  }
  const envPath = (envFile ?? ".env").replace(/^\.\//, "");
  if (envFile && files[envPath] === undefined) return `couldn't find env file: /home/ada/project/${envPath}`;
  const env = { ...(files[envPath] ? parseEnv(files[envPath]!) : {}), ...shellEnv };
  const named = typeof doc === "object" && !Array.isArray(doc) && typeof doc.name === "string" ? doc.name : undefined;
  return { project: projectArg ?? named ?? PROJECT, doc, env, names };
}

/** Variables a compose file uses that are set nowhere: Compose warns and uses "". */
function unsetVars(text: string, env: Record<string, string>): string[] {
  return [...new Set([...text.matchAll(/\$\{(\w+)(?::?-[^}]*)?\}|\$(\w+)/g)].filter((m) => !/:?-/.test(m[0]!)).map((m) => (m[1] ?? m[2])!))].filter((v) => env[v] === undefined);
}

/** Writes YAML back out, for `docker compose config`. */
function dumpYaml(v: Yaml, indent = 0): string[] {
  const pad = " ".repeat(indent);
  if (Array.isArray(v)) return v.flatMap((x) => (typeof x === "object" ? [`${pad}- ${dumpYaml(x, indent + 2).join("\n").trimStart()}`] : [`${pad}- ${x}`]));
  if (typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) =>
      typeof x === "object" && (Array.isArray(x) ? x.length : Object.keys(x).length) ? [`${pad}${k}:`, ...dumpYaml(x, indent + 2)] : [`${pad}${k}: ${typeof x === "object" ? (Array.isArray(x) ? "[]" : "{}") : x === "" ? "null" : x}`],
    );
  }
  return [`${pad}${v}`];
}

const fill = (text: string, env: Record<string, string>) =>
  text.replace(/\$\{(\w+)(?::?-([^}]*))?\}/g, (_, k: string, d?: string) => env[k] ?? d ?? "").replace(/\$(\w+)/g, (_, k: string) => env[k] ?? "");

function compose(h: Host, args: string[], shellEnv: Record<string, string> = {}): Run {
  // Global options come before the verb: -f (repeatable), -p, --profile, --env-file.
  const fileArgs: string[] = [];
  const profiles: string[] = [];
  let projectArg: string | undefined;
  let envFile: string | undefined;
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-f" || a === "--file") fileArgs.push(args[++i] ?? "");
    else if (a === "-p" || a === "--project-name") projectArg = args[++i];
    else if (a === "--profile") profiles.push(args[++i] ?? "");
    else if (a === "--env-file") envFile = args[++i];
    else if (a.startsWith("-")) return fail(`unknown flag: ${a}`);
    else break;
  }
  const verb = args[i];
  const rest = args.slice(i + 1);
  if (!verb || verb === "version") return say(verb ? "Docker Compose version v2.29.7" : "Usage:  docker compose [OPTIONS] COMMAND\n\nCommands: up, down, ps, logs, config, build, exec, pull, restart, stop, start", verb ? "out" : "dim");
  const setup = loadCompose(h, fileArgs, projectArg, envFile, shellEnv);
  // ps/logs/down/stop work from what runs, like Compose, when no file is there.
  const project = typeof setup === "string" ? (projectArg ?? PROJECT) : setup.project;
  const mine = (svc?: string) => Object.values(h.containers).filter((c) => c.project === project && (!svc || c.service === svc));
  const container = (svc: string) => mine(svc)[0];

  if (verb === "ps") {
    const list = mine().filter((c) => rest.includes("-a") || rest.includes("--all") || c.state === "running");
    const ports = (c: Container) => (c.state === "running" ? c.ports.map((p) => `0.0.0.0:${p.host}->${p.container}/tcp`).join(", ") : "");
    return {
      actions: [],
      output: [
        out("NAME                 IMAGE              SERVICE   STATUS                PORTS", "dim"),
        ...list.map((c) => out(`${c.name.padEnd(20)} ${c.ref.replace(/:latest$/, "").padEnd(18)} ${(c.service ?? "").padEnd(9)} ${`${containerStatus(c)}${c.health ? ` (${c.health})` : ""}`.padEnd(21)} ${ports(c)}`)),
      ],
    };
  }
  if (verb === "logs") {
    const svc = rest.find((a) => !a.startsWith("-"));
    const o = mine(svc).flatMap((c) => c.logs.map((l) => out(`${(c.service ?? c.name).padEnd(8)} | ${l}`, /error/i.test(l) ? "err" : "out")));
    if (rest.includes("-f") || rest.includes("--follow")) o.push(out("(-f follows new lines in a real terminal; here it shows what is there)", "dim"));
    return { actions: [], output: o };
  }
  if (verb === "down") {
    const r = run(h, [{ type: "composeDown", project, volumes: rest.includes("-v") || rest.includes("--volumes") || undefined }], { cmd: "compose-down" });
    return r;
  }
  if (verb === "restart" || verb === "stop" || verb === "start") {
    const svc = rest.find((a) => !a.startsWith("-"));
    if (svc && !mine(svc).length) return fail(`no such service: ${svc}`);
    return run(h, mine(svc).map((c) => ({ type: verb, container: c.name }) as DockerAction), { cmd: `compose-${verb}`, echo: [] });
  }
  if (verb === "exec") {
    const words = rest.filter((a) => a !== "-T" && a !== "-it" && a !== "-i" && a !== "-t");
    const [svc, ...cmd] = words;
    if (!svc || !cmd.length) return fail(`"docker compose exec" requires at least 2 arguments.`);
    const c = container(svc);
    if (!c || c.state !== "running") return fail(`service "${svc}" is not running`);
    return run(h, [{ type: "exec", container: c.name, cmd: cmd.join(" ") }], { cmd: "exec" });
  }

  if (typeof setup === "string") return fail(setup);
  const parsed = parseComposeDoc(setup.doc, projectFiles(h));
  if ("error" in parsed) return fail(parsed.error);
  const text = setup.names.map((n) => projectFiles(h)[n] ?? "").join("\n");
  const warnings = unsetVars(text, setup.env).map((v) => out(`WARN[0000] The "${v}" variable is not set. Defaulting to a blank string.`, "dim"));

  if (verb === "config") {
    const doc = setup.doc as { [k: string]: Yaml };
    const shown: Yaml = { name: project, ...Object.fromEntries(Object.entries(doc).filter(([k]) => k !== "name")) };
    return { actions: [], output: [...warnings, ...lines(fill(dumpYaml(shown).join("\n"), setup.env).replace(/: $/gm, ': ""'))] };
  }
  if (verb === "build") {
    const only = rest.filter((a) => !a.startsWith("-"));
    const actions: DockerAction[] = Object.entries(parsed.file.services)
      .filter(([name, svc]) => svc.build && (!only.length || only.includes(name)))
      .map(([name, svc]) => ({ type: "build", tag: svc.image ?? `${project}-${name}`, dockerfile: svc.build!.dockerfile, context: svc.build!.context, ignore: svc.build!.ignore, ...(svc.build!.target ? { target: svc.build!.target } : {}) }));
    if (!actions.length) return say("(no service here has a build: section)", "dim");
    return run(h, actions, { cmd: "build" });
  }
  if (verb === "pull") {
    const refs = [...new Set(Object.values(parsed.file.services).flatMap((svc) => (svc.image && !svc.build ? [fill(svc.image, setup.env)] : [])))];
    return run(h, refs.map((ref) => ({ type: "pull", ref }) as DockerAction), { cmd: "pull" });
  }
  if (verb === "up") {
    const flags = rest.filter((a) => a.startsWith("-"));
    for (const fl of flags) if (!["-d", "--detach", "--build", "--wait", "--force-recreate", "--remove-orphans", "--no-build"].includes(fl)) return fail(`unknown flag: ${fl}`);
    const asked = rest.filter((a) => !a.startsWith("-"));
    for (const a of asked) if (!parsed.file.services[a]) return fail(`no such service: ${a}`);
    // `up db`: that service and what it depends on.
    let file = parsed.file;
    if (asked.length) {
      const keep = new Set<string>();
      const add = (n: string) => {
        if (keep.has(n)) return;
        keep.add(n);
        const d = file.services[n]!.depends_on;
        for (const x of Array.isArray(d) ? d : Object.keys(d ?? {})) add(x);
      };
      asked.forEach(add);
      file = { ...file, services: Object.fromEntries(Object.entries(file.services).filter(([n]) => keep.has(n)).map(([n, svc]) => [n, { ...svc, profiles: undefined }])) };
    }
    file = { ...file, services: Object.fromEntries(Object.entries(file.services).map(([n, svc]) => [n, svc.image ? { ...svc, image: fill(svc.image, setup.env) } : svc])) };
    const before = h;
    const action: DockerAction = {
      type: "composeUp",
      project,
      file,
      env: setup.env,
      ...(rest.includes("--build") ? { build: true } : {}),
      ...(profiles.length ? { profiles } : {}),
      ...(rest.includes("--wait") ? { wait: true } : {}),
      ...(rest.includes("--force-recreate") ? { force: true } : {}),
    };
    const pulled = Object.fromEntries(Object.entries(file.services).flatMap(([n, svc]) => (svc.image && !svc.build ? [[normalize(svc.image), n]] : [])));
    const r = run(h, [action], { cmd: "compose-up", project, pulled });
    if (r.failed) return { ...r, output: [...warnings, ...r.output] };
    const after = apply(before, action).state;
    // Compose says which containers it recreated and which it left running.
    const output = r.output.map((l) => {
      const m = /^ ✔ Container (\S+)  Created$/.exec(l.text);
      return m && findContainer(before, m[1]!) ? out(` ✔ Container ${m[1]}  Recreated`) : l;
    });
    const kept = Object.values(before.containers).filter((c) => c.project === project && c.state === "running" && after.containers[c.id]?.state === "running");
    output.push(...kept.map((c) => out(` ✔ Container ${c.name}  Running`, "dim")));
    if (!rest.includes("-d") && !rest.includes("--detach") && !rest.includes("--wait")) output.push(out("(attached in a real terminal until Ctrl+C; here the services keep running and the prompt comes back)", "dim"));
    return { ...r, output: [...warnings, ...output] };
  }
  return say(`(docker compose here knows: up [-d] [--build] [--wait] [service], down [-v], ps, logs [service], config, build, pull, exec <service> <command>, restart/stop/start [service])`, "dim");
}

/* ----------------------------------------------------------------- output */

interface OutCtx {
  cmd?: string;
  /** The Compose project, for its container and network names. */
  project?: string;
  /** Compose: which service each pulled image belongs to. */
  pulled?: Record<string, string>;
  detach?: boolean;
  /** Names to print back, one per successful action. */
  echo?: string[];
}

/** Runs actions in order and prints what Docker prints; stops at the first error. */
function run(h: Host, actions: DockerAction[], ctx: OutCtx = {}): Run {
  let host = h;
  const done: DockerAction[] = [];
  const output: TermLine[] = [];
  for (const [i, a] of actions.entries()) {
    const r = apply(host, a);
    const err = r.events.find((e) => e.type === "error");
    // A run whose start failed (port taken) has created the container and then errored.
    output.push(...eventLines(r.events, host, r.state, ctx));
    if (err && r.state === host) return { actions: done, output, failed: true };
    done.push(a);
    host = r.state;
    if (ctx.echo?.[i] !== undefined && !err) output.push(out(ctx.echo[i]!));
    if (err) return { actions: done, output, failed: true };
  }
  return { actions: done, output };
}

/** A 64-character id from a short one, as `docker run -d` prints. */
function longId(seed: string): string {
  let s = "";
  for (let i = 0; s.length < 64; i++) s += shortHash(`${seed}:${i}`);
  return s.slice(0, 64);
}

function eventLines(events: DockerEvent[], before: Host, after: Host, ctx: OutCtx): TermLine[] {
  const o: TermLine[] = [];
  const build = ctx.cmd === "build" || ctx.cmd === "compose-up";
  // BuildKit lists only the instructions that touch the filesystem; CMD, ENV, EXPOSE, USER, ARG… are settings.
  const steps = events.flatMap((e) => (e.type === "buildStep" && /^(FROM|RUN|COPY|ADD|WORKDIR)\b/.test(e.step.text) ? [e.step] : []));
  if (ctx.cmd === "build" && steps.length) {
    const total = steps.reduce((n, s) => n + s.seconds, 0);
    o.push(out(`[+] Building ${total.toFixed(1)}s (${steps.length + 2}/${steps.length + 2}) FINISHED`, "hl"));
    o.push(out(" => [internal] load build definition from Dockerfile", "dim"));
  }
  const stageSteps = (n: number) => steps.filter((s) => s.stage === n).length;
  for (const e of events) {
    switch (e.type) {
      case "pulled": {
        // Compose shows a pull as one line per service.
        if (ctx.cmd === "compose-up" && ctx.pulled) {
          // A build's base image is pulled inside the build, not as a service.
          if (ctx.pulled[e.ref]) o.push(out(` ✔ ${ctx.pulled[e.ref]} Pulled`, "add"));
          break;
        }
        const [repo, tag] = [e.ref.slice(0, e.ref.lastIndexOf(":")), e.ref.slice(e.ref.lastIndexOf(":") + 1)];
        if (ctx.cmd === "run" || ctx.cmd === "create") o.push(out(`Unable to find image '${e.ref}' locally`));
        if (build && ctx.cmd === "build") break;
        o.push(out(`${tag}: Pulling from ${repo.includes("/") ? repo : `library/${repo}`}`));
        const img = after.images[e.id] ?? after.registry.images[e.id];
        for (const l of img?.layers ?? []) o.push(out(`${l.id}: ${e.reused ? "Already exists" : "Pull complete"}`));
        o.push(out(`Digest: sha256:${longId(e.id)}`), out(`Status: Downloaded newer image for ${e.ref}`));
        break;
      }
      case "pushed": {
        const [repo] = [e.ref.slice(0, e.ref.lastIndexOf(":"))];
        o.push(out(`The push refers to repository [docker.io/${repo.includes("/") ? repo : `library/${repo}`}]`));
        const img = after.images[e.id];
        for (const [k, l] of (img?.layers ?? []).entries()) o.push(out(`${l.id}: ${k < e.skipped ? "Layer already exists" : "Pushed"}`));
        o.push(out(`${e.ref.slice(e.ref.lastIndexOf(":") + 1)}: digest: sha256:${longId(e.id)} size: ${1000 + (img?.layers.length ?? 1) * 300}`));
        break;
      }
      case "tagged":
        break;
      case "imageRemoved":
        o.push(out(`Untagged: ${e.ref}`));
        if (!e.untaggedOnly) o.push(out(`Deleted: sha256:${longId(e.id)}`));
        break;
      case "buildStep": {
        if (ctx.cmd !== "build" || !steps.includes(e.step)) break;
        const s = e.step;
        const n = stageSteps(s.stage);
        const k = steps.filter((x) => x.stage === s.stage && x.index <= s.index).length;
        const stage = steps.some((x) => x.stage > 0) ? `stage-${s.stage} ` : "";
        const from = s.text.slice(5).replace(/ AS .*/, "");
        // Docker Hub's official images get docker.io/library/; others keep their registry path.
        const text = s.text.startsWith("FROM ") ? `FROM ${from.includes("/") ? (from.split("/")[0]!.includes(".") ? from : `docker.io/${from}`) : `docker.io/library/${from}`}` : s.text;
        o.push(out(` => ${s.cached && !s.text.startsWith("FROM") ? "CACHED " : ""}[${stage}${k}/${n}] ${text}${s.seconds ? `${" ".repeat(Math.max(1, 46 - text.length))}${s.seconds.toFixed(1)}s` : ""}`, s.cached ? "dim" : "out"));
        break;
      }
      case "built":
        if (ctx.cmd === "build") {
          o.push(out(" => exporting to image", "dim"), out(` => => writing image sha256:${longId(e.id)}`, "dim"), out(` => => naming to docker.io/${e.tag.includes("/") ? e.tag : `library/${e.tag}`}`, "dim"));
        }
        break;
      case "created":
        if (ctx.cmd === "compose-up") o.push(out(` ✔ Container ${e.name}  Created`));
        else if (ctx.cmd === "create" || (ctx.cmd === "run" && ctx.detach)) o.push(out(longId(e.id)));
        break;
      case "started":
        if (ctx.cmd === "compose-up") o.push(out(` ✔ Container ${e.name}  Started`, "add"));
        break;
      case "log":
        if (ctx.cmd === "run" && !ctx.detach) o.push(out(e.line, /error|killed|not found|denied/i.test(e.line) ? "err" : "out"));
        break;
      case "exited":
        if (ctx.cmd === "run" && !ctx.detach && e.code !== 0 && e.reason === "not-found")
          o.push(out(`docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: exec: "${(findContainer(after, e.name) ?? findContainer(before, e.name))?.cmd[0] ?? ""}": executable file not found in $PATH: unknown.`, "err"));
        break;
      case "execOutput":
        o.push(...e.output.map((l) => out(l, e.code ? "err" : "out")));
        break;
      case "curlResult":
        o.push(...lines(e.body, e.ok ? "out" : "err"));
        break;
      case "volumeCreated":
        break;
      case "networkCreated":
        break;
      case "pruned": {
        if (e.containers.length) o.push(out("Deleted Containers:"), ...e.containers.map((n) => out(n)), out(""));
        if (e.images.length) o.push(out("Deleted Images:"), ...e.images.map((id) => out(`deleted: sha256:${longId(id)}`)), out(""));
        if (e.volumes.length) o.push(out("Deleted Volumes:"), ...e.volumes.map((v) => out(v)), out(""));
        if (e.networks.length) o.push(out("Deleted Networks:"), ...e.networks.map((n) => out(n)), out(""));
        o.push(out(`Total reclaimed space: ${e.images.reduce((n, id) => n + (before.images[id] ? imageSize(before.images[id]!) : 0), 0)}MB`));
        break;
      }
      case "composeUp":
        break;
      case "composeWaiting":
        o.push(out(` ✔ Container ${ctx.project ?? PROJECT}-${e.for}-1  Waiting`, "dim"));
        break;
      case "healthy":
        if (ctx.cmd === "compose-up") o.push(out(` ✔ Container ${e.name}  Healthy`, "add"));
        break;
      case "composeDown":
        for (const n of e.removed) o.push(out(` ✔ Container ${n}  Removed`));
        for (const v of e.volumes) o.push(out(` ✔ Volume ${v}  Removed`));
        if (before.networks[`${e.project}_default`]) o.push(out(` ✔ Network ${e.project}_default  Removed`));
        break;
      case "error": {
        const msg = e.message;
        const runLike = ctx.cmd === "run" || ctx.cmd === "create";
        const buildLike = ctx.cmd === "build" && msg.startsWith("failed to solve");
        o.push(...lines(runLike && !msg.startsWith("docker:") && !msg.startsWith("Unable") ? `docker: ${msg}` : buildLike ? `ERROR: ${msg}` : msg, "err"));
        if (runLike) o.push(out("Run 'docker run --help' for more information", "dim"));
        break;
      }
      default:
        break;
    }
  }
  // Compose prints the networks and volumes it made first.
  if (ctx.cmd === "compose-up" && events.some((e) => e.type === "composeUp")) {
    const nets = Object.keys(after.networks).filter((n) => !before.networks[n]);
    const vols = Object.keys(after.volumes).filter((v) => !before.volumes[v] && !after.volumes[v]!.anonymous);
    const head = [...nets.map((n) => out(` ✔ Network ${n}  Created`)), ...vols.map((v) => out(` ✔ Volume "${v}"  Created`))];
    const count = head.length + events.filter((e) => e.type === "started").length;
    o.unshift(out(`[+] Running ${count}/${count}`, "hl"), ...head);
  }
  return o;
}

function formatInspect(c: Container, format: string): string | null {
  const f = format.replace(/\s+/g, "");
  const map: Record<string, string> = {
    "{{.State.Status}}": c.state,
    "{{.State.ExitCode}}": String(c.exitCode ?? 0),
    "{{.State.OOMKilled}}": String(c.oomKilled),
    "{{.State.Running}}": String(c.state === "running"),
    "{{.Config.Env}}": `[${Object.entries(c.env).map(([k, v]) => `${k}=${v}`).join(" ")}]`,
    "{{.HostConfig.RestartPolicy.Name}}": c.restart,
    "{{.RestartCount}}": String(c.restarts),
    "{{.Name}}": `/${c.name}`,
    "{{.Config.User}}": c.user === "root" ? "" : c.user,
    "{{.NetworkSettings.Networks}}": `map[${c.networks.map((n) => `${n}:0xc000`).join(" ")}]`,
  };
  return map[f] ?? null;
}

const HELP = `This sandbox understands:
  docker <command>   run, ps, logs, exec, stop, start, rm, images, pull, build,
                     tag, push, rmi, inspect, stats, network, volume, compose …
  ls, cat <file>     list and print the project's files (~/project)
  echo "x" > file    write a file (>> adds a line)
  nano <file>        edit a file (Dockerfile, compose.yaml, .env …)
  curl localhost:N   call a published port
  sleep N            let N seconds pass (healthchecks, restarts)
  clear              clear the screen
Keys: ↑ ↓ for earlier commands, Tab to complete.`;

const DOCKER_HELP = `Usage:  docker [OPTIONS] COMMAND

Common Commands:
  run         Create and run a new container from an image
  exec        Execute a command in a running container
  ps          List containers
  build       Build an image from a Dockerfile
  pull        Download an image from a registry
  push        Upload an image to a registry
  images      List images
  compose     Docker Compose

Management Commands:
  container   Manage containers
  image       Manage images
  network     Manage networks
  volume      Manage volumes
  system      Manage Docker

Commands:
  inspect, logs, restart, rm, rmi, start, stats, stop, tag, kill`;
