import { copySourceMatches, type ComposeFile, type ComposeService, type Files, type Instruction, type Program, type RestartPolicy } from "./docker";

/**
 * Reading the project's own files the way Docker does: a Dockerfile into instructions, a
 * compose.yaml into services, a .env into variables. What a program does when it starts is
 * read from its source (the port it listens on, the variables it refuses to start without),
 * so the reader's files decide what happens, not a hidden script.
 */

/* ------------------------------------------------------------ Dockerfile */

export interface ParsedDockerfile {
  instructions: Instruction[];
  errors: string[];
}

/** JSON exec form `["a","b"]`, or shell form, which Docker runs through /bin/sh -c. */
function argsOf(rest: string): string[] {
  const t = rest.trim();
  if (t.startsWith("[")) {
    try {
      const v = JSON.parse(t) as unknown;
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
    } catch {
      // falls through to shell form
    }
  }
  return ["/bin/sh", "-c", t];
}

/** What a RUN line adds, roughly: an install brings a folder of packages, a build brings dist/. */
function runEffect(cmd: string, workdir: string, files: Files): Pick<Extract<Instruction, { op: "RUN" }>, "size" | "seconds" | "files"> {
  const wd = workdir.replace(/\/$/, "");
  if (/\bnpm (ci|install|i)\b/.test(cmd)) return { size: 60, seconds: 20, files: { [`${wd}/node_modules/.package-lock.json`]: "deps" } };
  if (/\bnpm run build\b/.test(cmd)) {
    const src = files[`${wd}/src/server.js`] ?? files[`${wd}/src/server.ts`];
    return { size: 2, seconds: 8, files: { [`${wd}/dist/server.js`]: src ?? "size:2" } };
  }
  if (/\bpip3? install\b/.test(cmd)) return { size: 50, seconds: 15, files: { "/usr/local/lib/python3.12/site-packages/.installed": "deps" } };
  if (/\b(apt-get|apk) (install|add)\b/.test(cmd)) return { size: 40, seconds: 15, files: {} };
  const echo = /^echo\s+(.+?)\s*>\s*(\S+)$/.exec(cmd.trim());
  if (echo) {
    const path = echo[2]!.startsWith("/") ? echo[2]! : `${wd}/${echo[2]}`;
    return { size: 1, seconds: 1, files: { [path]: echo[1]!.replace(/^["']|["']$/g, "") } };
  }
  return { size: 1, seconds: 2, files: {} };
}

/**
 * Parses a Dockerfile. `context` is the build context, used to read the source of the program
 * CMD starts. Line continuations and comments are handled; unknown instructions are errors.
 */
export function parseDockerfile(text: string, context: Files = {}): ParsedDockerfile {
  const instructions: Instruction[] = [];
  const errors: string[] = [];
  const joined = text.replace(/\\\n/g, " ");
  let workdir = "/";
  // What the image will hold, so CMD can read the program it starts; each named stage's files too.
  let imageFiles: Files = {};
  const stageFiles: Record<string, Files> = {};
  let stageName: string | undefined;
  for (const [n, raw] of joined.split("\n").entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(\w+)\s*(.*)$/.exec(line);
    if (!m) {
      errors.push(`dockerfile parse error on line ${n + 1}: unknown instruction: ${line}`);
      continue;
    }
    const op = m[1]!.toUpperCase();
    const rest = m[2]!;
    switch (op) {
      case "FROM": {
        const [image, as, name] = rest.split(/\s+/);
        instructions.push(as?.toUpperCase() === "AS" && name ? { op: "FROM", image: image!, as: name } : { op: "FROM", image: image! });
        if (stageName) stageFiles[stageName] = imageFiles;
        stageName = as?.toUpperCase() === "AS" ? name : undefined;
        workdir = "/";
        // A stage built FROM an earlier one starts with its files.
        imageFiles = { ...(stageFiles[image!] ?? {}) };
        break;
      }
      case "RUN": {
        const effect = runEffect(rest, workdir, imageFiles);
        Object.assign(imageFiles, effect.files);
        instructions.push({ op: "RUN", cmd: rest, ...effect });
        break;
      }
      case "COPY":
      case "ADD": {
        const words = rest.split(/\s+/);
        let from: string | undefined;
        let chown: string | undefined;
        while (words[0]?.startsWith("--")) {
          const flag = words.shift()!;
          if (flag.startsWith("--from=")) from = flag.slice(7);
          else if (flag.startsWith("--chown=")) chown = flag.slice(8);
        }
        const dest = words.pop();
        if (!dest || !words.length) {
          errors.push(`dockerfile parse error on line ${n + 1}: ${op} requires at least two arguments`);
          continue;
        }
        const ins: Instruction = op === "COPY" ? { op: "COPY", src: words, dest, ...(from ? { from } : {}), ...(chown ? { chown } : {}) } : { op: "ADD", src: words, dest };
        if (from) {
          // Like the build: a directory's contents land in dest; a file keeps its name.
          if (stageName) stageFiles[stageName] = imageFiles;
          const at = (d: string) => (d.startsWith("/") ? d : `${workdir.replace(/\/$/, "")}/${d.replace(/^\.\//, "")}`);
          for (const [p, v] of Object.entries(stageFiles[from] ?? {})) {
            for (const s of words) {
              const dir = at(s).replace(/\/$/, "");
              const to = (dest === "." || dest === "./" ? workdir : at(dest)).replace(/\/$/, "");
              if (p.startsWith(`${dir}/`)) imageFiles[`${to}${p.slice(dir.length)}`] = v;
              else if (p === dir) imageFiles[`${to}/${p.split("/").pop()}`] = v;
            }
          }
        } else {
          const target = dest === "." || dest === "./" ? workdir : dest;
          for (const [p, v] of Object.entries(context)) {
            if (words.some((s) => copySourceMatches(s, p))) imageFiles[`${target.replace(/\/$/, "")}/${p}`] = v;
          }
        }
        instructions.push(ins);
        break;
      }
      case "WORKDIR":
        workdir = rest.startsWith("/") ? rest : `${workdir.replace(/\/$/, "")}/${rest}`;
        instructions.push({ op: "WORKDIR", path: workdir });
        break;
      case "ENV": {
        const eq = /^(\w+)=(.*)$/.exec(rest) ?? /^(\w+)\s+(.*)$/.exec(rest);
        if (!eq) errors.push(`dockerfile parse error on line ${n + 1}: ENV names can not be blank`);
        else instructions.push({ op: "ENV", key: eq[1]!, value: eq[2]!.replace(/^["']|["']$/g, "") });
        break;
      }
      case "ARG": {
        const [key, value] = rest.split("=");
        instructions.push(value !== undefined ? { op: "ARG", key: key!, value } : { op: "ARG", key: key! });
        break;
      }
      case "EXPOSE":
        for (const p of rest.split(/\s+/)) instructions.push({ op: "EXPOSE", port: Number(p.split("/")[0]) });
        break;
      case "USER":
        instructions.push({ op: "USER", name: rest.trim() });
        break;
      case "CMD":
      case "ENTRYPOINT": {
        const args = argsOf(rest);
        const program = inferProgram(args, imageFiles, workdir);
        instructions.push(program ? { op, args, program } : { op, args });
        break;
      }
      case "HEALTHCHECK":
        instructions.push({ op: "HEALTHCHECK", cmd: rest.replace(/^CMD\s+/i, "") });
        break;
      default:
        errors.push(`dockerfile parse error on line ${n + 1}: unknown instruction: ${m[1]}`);
    }
  }
  if (!instructions.some((i) => i.op === "FROM") && !errors.length) errors.push("failed to solve: the Dockerfile has no FROM");
  return { instructions, errors };
}

/* --------------------------------------------------------------- programs */

/** The script a command starts: `node server.js`, `python app.py`, `npm start` (via package.json). */
function scriptOf(args: string[], files: Files, workdir: string): string | null {
  const cmd = args[0] === "/bin/sh" && args[1] === "-c" ? (args[2] ?? "").split(/\s+/) : args;
  const at = (p: string) => (p.startsWith("/") ? p : `${workdir.replace(/\/$/, "")}/${p}`);
  if ((cmd[0] === "node" || cmd[0] === "python" || cmd[0] === "python3") && cmd[1]) return at(cmd[1]);
  if (cmd[0] === "npm" && (cmd[1] === "start" || (cmd[1] === "run" && cmd[2]))) {
    const pkg = files[at("package.json")];
    const name = cmd[1] === "start" ? "start" : cmd[2]!;
    const m = pkg ? new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`).exec(pkg) : null;
    return m ? scriptOf(m[1]!.split(/\s+/), files, workdir) : null;
  }
  if (cmd[0]?.endsWith(".js") || cmd[0]?.endsWith(".py")) return at(cmd[0]);
  return null;
}

/**
 * What a program does, read from its source: `listen(3000)` makes a server; a required
 * `process.env.X` (`if (!process.env.X)`) must be set; `connect("db:5432")` must resolve;
 * `writeFile("/app/x")` must be writable. Without a listen it is a job that prints its
 * console.log lines and exits with its process.exit code.
 */
export function programFromSource(source: string): Program {
  const listens = /listen\(\s*(\d+)/.exec(source) ?? /PORT\s*\|\|\s*(\d+)/.exec(source);
  const needsEnv = [...source.matchAll(/if\s*\(\s*!\s*process\.env\.(\w+)\s*\)/g), ...source.matchAll(/os\.environ\[["'](\w+)["']\]/g)].map((x) => x[1]!);
  const connects = [...source.matchAll(/connect\(\s*["']([\w.-]+:\d+)["']/g)].map((x) => x[1]!);
  const writes = /writeFile(?:Sync)?\(\s*["']([^"']+)["']/.exec(source)?.[1];
  const memory = /\/\/\s*uses\s+(\d+)\s*MB/i.exec(source);
  if (listens) {
    return {
      kind: "app",
      listens: Number(listens[1]),
      ...(needsEnv.length ? { needsEnv: [...new Set(needsEnv)] } : {}),
      ...(connects.length ? { connects } : {}),
      ...(writes ? { writes } : {}),
      ...(memory ? { memory: Number(memory[1]) } : {}),
    };
  }
  const output = [...source.matchAll(/(?:console\.log|print)\(\s*["'`]([^"'`]*)["'`]/g)].map((x) => x[1]!);
  const code = /process\.exit\(\s*(\d+)\s*\)|sys\.exit\(\s*(\d+)\s*\)/.exec(source);
  return { kind: "job", output, ...(code ? { exitCode: Number(code[1] ?? code[2]) } : {}), ...(memory ? { memory: Number(memory[1]) } : {}) };
}

export function inferProgram(args: string[], files: Files, workdir: string): Program | undefined {
  const script = scriptOf(args, files, workdir);
  const source = script ? files[script] : undefined;
  return source === undefined || source.startsWith("size:") ? undefined : programFromSource(source);
}

/* ------------------------------------------------------------------- YAML */

export type Yaml = string | Yaml[] | { [k: string]: Yaml };

const scalar = (v: string): string => v.trim().replace(/^["']|["']$/g, "");

/**
 * A small YAML reader for compose files: maps, lists, scalars, inline [a, b] lists, quotes and
 * comments. Anchors, multi-line strings and flow maps are not supported.
 */
export function parseYaml(text: string): Yaml {
  const rows = text
    .split("\n")
    .map((raw) => raw.replace(/\s+#.*$/, "").replace(/^\s*#.*$/, ""))
    .filter((r) => r.trim())
    .map((r) => ({ indent: r.length - r.trimStart().length, text: r.trim() }));
  let i = 0;
  const block = (indent: number): Yaml => {
    if (rows[i]?.text.startsWith("- ") || rows[i]?.text === "-") {
      const list: Yaml[] = [];
      while (i < rows.length && rows[i]!.indent === indent && rows[i]!.text.startsWith("-")) {
        const item = rows[i]!.text.slice(1).trim();
        i++;
        if (/^[\w.-]+:\s/.test(item) || /^[\w.-]+:$/.test(item)) {
          // "- key: value" opens a map item; following deeper lines belong to it.
          rows.splice(i, 0, { indent: indent + 2, text: item });
          list.push(block(indent + 2));
        } else list.push(inline(item));
      }
      return list;
    }
    const map: { [k: string]: Yaml } = {};
    while (i < rows.length && rows[i]!.indent === indent) {
      const m = /^([^:]+):\s*(.*)$/.exec(rows[i]!.text);
      if (!m) throw new Error(`yaml: line ${i + 1}: could not find expected ':'`);
      i++;
      const key = scalar(m[1]!);
      if (m[2]) map[key] = inline(m[2]);
      else if (i < rows.length && rows[i]!.indent > indent) map[key] = block(rows[i]!.indent);
      else if (i < rows.length && rows[i]!.indent === indent && rows[i]!.text.startsWith("-")) map[key] = block(indent);
      else map[key] = "";
    }
    return map;
  };
  const inline = (v: string): Yaml => {
    const t = v.trim();
    if (t.startsWith("[") && t.endsWith("]")) return t.slice(1, -1).split(",").map((x) => scalar(x)).filter(Boolean);
    return scalar(t);
  };
  if (!rows.length) return {};
  return block(rows[0]!.indent);
}

const asList = (v: Yaml | undefined): string[] => (Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : "")) : typeof v === "string" && v ? [v] : []);
const asMap = (v: Yaml | undefined): Record<string, Yaml> => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** MB from "512m", "1g", "256M". */
export function memoryMB(v: string): number | undefined {
  const m = /^(\d+(?:\.\d+)?)\s*([kmg]?)b?$/i.exec(v.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  return Math.round(unit === "g" ? n * 1024 : unit === "k" ? n / 1024 : unit === "m" ? n : n / (1024 * 1024));
}

/**
 * Reads compose.yaml into the model's shape. `build: .` builds the project's Dockerfile with
 * the project's files as context.
 */
export function parseCompose(text: string, project: Files): { file: ComposeFile } | { error: string } {
  let doc: Yaml;
  try {
    doc = parseYaml(text);
  } catch (e) {
    return { error: (e as Error).message };
  }
  return parseComposeDoc(doc, project);
}

/** Merges compose files the way `-f a -f b` and compose.override.yaml do: maps merge, everything else is replaced. */
export function mergeYaml(base: Yaml, over: Yaml): Yaml {
  if (typeof base !== "object" || Array.isArray(base) || typeof over !== "object" || Array.isArray(over)) return over;
  const out: { [k: string]: Yaml } = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? mergeYaml(out[k]!, v) : v;
  return out;
}

export function parseComposeDoc(doc: Yaml, project: Files): { file: ComposeFile } | { error: string } {
  const services = asMap(asMap(doc).services);
  if (!Object.keys(services).length) return { error: "no service selected" };
  const out: ComposeFile = { services: {} };
  if (typeof asMap(doc).name === "string") out.name = asMap(doc).name as string;
  for (const [name, raw] of Object.entries(services)) {
    const s = asMap(raw);
    const svc: ComposeService = {};
    if (typeof s.image === "string") svc.image = s.image;
    if (s.profiles !== undefined) svc.profiles = asList(s.profiles);
    if (s.build !== undefined) {
      const dir = typeof s.build === "string" ? s.build : String(asMap(s.build).context ?? ".");
      const dockerfileName = typeof s.build === "string" ? "Dockerfile" : String(asMap(s.build).dockerfile ?? "Dockerfile");
      const prefix = dir === "." || dir === "./" ? "" : `${dir.replace(/^\.\//, "").replace(/\/$/, "")}/`;
      const context: Files = {};
      for (const [p, v] of Object.entries(project)) if (p.startsWith(prefix)) context[p.slice(prefix.length)] = v;
      const df = context[dockerfileName];
      if (df === undefined) return { error: `failed to solve: failed to read dockerfile: open ${dockerfileName}: no such file or directory` };
      const parsed = parseDockerfile(df, context);
      if (parsed.errors.length) return { error: parsed.errors[0]! };
      const ignore = (context[".dockerignore"] ?? "").split("\n").map((x) => x.trim()).filter((x) => x && !x.startsWith("#"));
      const target = typeof s.build === "string" ? undefined : asMap(s.build).target;
      svc.build = { dockerfile: parsed.instructions, context, ignore, ...(typeof target === "string" ? { target } : {}) };
    }
    if (s.ports) svc.ports = asList(s.ports);
    if (s.environment) {
      const env = s.environment;
      svc.environment = Array.isArray(env)
        ? Object.fromEntries(asList(env).map((kv) => [kv.split("=")[0]!, kv.split("=").slice(1).join("=")]))
        : Object.fromEntries(Object.entries(asMap(env)).map(([k, v]) => [k, String(v)]));
    }
    // env_file: its values come first; `environment:` wins over them.
    if (s.env_file !== undefined) {
      const fromFiles: Record<string, string> = {};
      for (const f of asList(s.env_file)) {
        const path = f.replace(/^\.\//, "");
        if (project[path] === undefined) return { error: `env file ${path} not found: stat ${path}: no such file or directory` };
        Object.assign(fromFiles, parseEnv(project[path]!));
      }
      svc.environment = { ...fromFiles, ...svc.environment };
    }
    if (s.depends_on) {
      if (Array.isArray(s.depends_on)) svc.depends_on = asList(s.depends_on);
      else
        svc.depends_on = Object.fromEntries(
          Object.entries(asMap(s.depends_on)).map(([k, v]) => [k, { condition: asMap(v).condition === "service_healthy" ? "service_healthy" : "service_started" }]),
        );
    }
    if (s.volumes) svc.volumes = asList(s.volumes);
    if (s.networks) svc.networks = Array.isArray(s.networks) ? asList(s.networks) : Object.keys(asMap(s.networks));
    if (s.healthcheck !== undefined) svc.healthcheck = true;
    if (typeof s.restart === "string") svc.restart = s.restart as RestartPolicy;
    if (s.command !== undefined) svc.command = Array.isArray(s.command) ? asList(s.command) : String(s.command).split(/\s+/);
    if (typeof s.mem_limit === "string") svc.mem_limit = memoryMB(s.mem_limit);
    out.services[name] = svc;
  }
  const vols = asMap(doc).volumes;
  if (vols !== undefined) out.volumes = Array.isArray(vols) ? asList(vols) : Object.keys(asMap(vols));
  const nets = asMap(doc).networks;
  if (nets !== undefined) out.networks = Array.isArray(nets) ? asList(nets) : Object.keys(asMap(nets));
  return { file: out };
}

/** A .env file: KEY=value lines. */
export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Za-z_][\w]*)\s*=\s*(.*)$/.exec(line);
    if (m) env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, "");
  }
  return env;
}
