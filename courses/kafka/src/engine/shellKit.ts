import type { ShellEditor, ShellResult } from "@lets-explain/core/components/TypedSandbox";
import { lines, out, shellWords, splitCommands, type TermLine } from "@lets-explain/core/lib/terminal";
import { spacePipes, textOf } from "./cli";

/**
 * What the replication, storage and KRaft shells share: files in the project folder, the
 * shell basics around Kafka's tools (cat, echo >, nano, sleep), `docker ps/stop/start` for a
 * docker-compose dev cluster, and the loop that runs a typed line.
 */

export type FileAction = { type: "$file"; path: string; content: string | null };

export interface FileBox {
  files: Record<string, string>;
}

export interface Run<A, B> {
  actions: A[];
  output: TermLine[];
  failed?: boolean;
  editor?: ShellEditor<A, B>;
  clear?: boolean;
}

export const say = <A, B>(text: string, tone: TermLine["tone"] = "out"): Run<A, B> => ({ actions: [], output: text ? lines(text, tone) : [] });
export const fail = <A, B>(text: string): Run<A, B> => ({ actions: [], output: lines(text, "err"), failed: true });

export const isFileAction = (a: { type: string }): a is FileAction => a.type === "$file";

export function applyFile<B extends FileBox>(box: B, a: FileAction): B {
  const files = { ...box.files };
  if (a.content === null) delete files[a.path];
  else files[a.path] = a.content;
  return { ...box, files };
}

/**
 * Runs a typed line: commands split at `&&` and `;`, stopping at the first failure. A command
 * counts as a move when one of its actions changes the model (not just a file).
 */
export function makeRunner<A extends { type: string }, B>(o: {
  pipeline: (box: B, words: string[]) => Run<A, B>;
  apply: (box: B, actions: A[]) => B;
}) {
  return (start: B, line: string): ShellResult<A, B> => {
    const result: ShellResult<A, B> = { actions: [], output: [], moves: 0 };
    let box = start;
    for (const words of splitCommands(shellWords(spacePipes(line)))) {
      const r = o.pipeline(box, words);
      result.actions.push(...r.actions);
      result.output.push(...r.output);
      if (r.clear) {
        result.clear = true;
        result.output = [];
      }
      if (r.actions.some((a) => !a.type.startsWith("$"))) result.moves++;
      box = o.apply(box, r.actions);
      if (r.editor) {
        result.editor = r.editor;
        return result;
      }
      if (r.failed) break;
    }
    return result;
  };
}

/** The lines a pipe feeds a tool: `echo`, `printf` or `cat file`. */
export function pipeLines(files: Record<string, string>, words: string[]): string[] | string {
  const [cmd = "", ...args] = words;
  if (cmd === "echo" || cmd === "printf") return textOf(cmd, args).replace(/\n$/, "").split("\n");
  if (cmd === "cat") {
    const path = args[0];
    if (!path || !(path in files)) return `cat: ${path ?? ""}: No such file or directory`;
    return files[path]!.split("\n").filter((l) => l !== "");
  }
  return "(in this sandbox, a pipe starts with echo, printf or cat)";
}

/**
 * The shell basics every Kafka shell has. Returns null for a command it does not handle.
 * `cat` also reads `extraFiles` (for example files on the broker's disk).
 */
export function fileCommand<A, B extends FileBox>(
  box: B,
  cmd: string,
  args: string[],
  opts: { home: string; help: string; extraFiles?: (path: string) => string | null },
): Run<A | FileAction, B> | null {
  switch (cmd) {
    case "clear":
      return { actions: [], output: [], clear: true };
    case "help":
      return say(opts.help);
    case "pwd":
      return say(opts.home);
    case "cd":
      return say(`cd: this sandbox stays in ${opts.home}`, "dim");
    case "cat": {
      if (!args.length) return fail("cat: missing file operand");
      const o: TermLine[] = [];
      for (const p of args) {
        const extra = opts.extraFiles?.(p) ?? null;
        if (extra !== null) o.push(...lines(extra));
        else if (p in box.files) o.push(...lines(box.files[p]!));
        else return { actions: [], output: [...o, out(`cat: ${p}: No such file or directory`, "err")], failed: true };
      }
      return { actions: [], output: o };
    }
    case "echo":
    case "printf": {
      const at = args.findIndex((a) => a === ">" || a === ">>");
      const text = textOf(cmd, at === -1 ? args : args.slice(0, at));
      if (at === -1) return say(text.replace(/\n$/, ""));
      const path = args[at + 1];
      if (!path) return fail("bash: syntax error near unexpected token `newline'");
      const old = box.files[path];
      const content = args[at] === ">>" && old ? `${old}\n${text.replace(/\n$/, "")}` : text.replace(/\n$/, "");
      return { actions: [{ type: "$file", path, content }], output: [] };
    }
    case "rm": {
      const paths = args.filter((a) => !a.startsWith("-"));
      if (!paths.length) return fail("rm: missing operand");
      for (const p of paths) if (!(p in box.files)) return fail(`rm: ${p}: No such file or directory`);
      return { actions: paths.map((p) => ({ type: "$file", path: p, content: null }) as FileAction), output: [] };
    }
    case "nano":
    case "vim":
    case "vi":
    case "code": {
      const path = args.find((a) => !a.startsWith("-"));
      if (!path) return fail(`${cmd}: give the file to open, e.g. ${cmd} producer.properties`);
      return {
        actions: [],
        output: [],
        editor: {
          file: path,
          text: box.files[path] ?? "",
          save: (b, text) => {
            const content = text.replace(/\n+$/, "");
            if (b.files[path] === content) return { actions: [], output: [], moves: 0 };
            return { actions: [{ type: "$file", path, content }], output: [], moves: 0 };
          },
        },
      };
    }
  }
  return null;
}

/** `sleep 30`, `sleep 2m`, `sleep 3d` (GNU sleep's suffixes), in seconds; null if it is not a duration. */
export function sleepSeconds(args: string[]): number | null {
  if (!args.length) return null;
  let total = 0;
  for (const a of args) {
    const m = /^(\d+(?:\.\d+)?)([smhd]?)$/.exec(a);
    if (!m) return null;
    const n = Number(m[1]);
    total += n * ({ "": 1, s: 1, m: 60, h: 3600, d: 86400 } as Record<string, number>)[m[2]!]!;
  }
  return total;
}

/* ------------------------------------------------------------------ docker */

export interface Container {
  name: string;
  image: string;
  state: "running" | "paused" | "exited";
  ports?: string;
}

/** A stable 12-character container id from its name. */
export function containerId(name: string): string {
  let h = 2166136261;
  let id = "";
  for (let i = 0; i < 12; i++) {
    h = Math.imul(h ^ (name.charCodeAt(i % name.length) + i * 7), 16777619) >>> 0;
    id += (h % 16).toString(16);
  }
  return id;
}

const pad = (s: string, n: number) => (s.length >= n ? `${s} ` : s + " ".repeat(n - s.length));

export function dockerPs(containers: Container[], all: boolean): TermLine[] {
  const rows = containers.filter((c) => all || c.state !== "exited");
  return [
    out(pad("CONTAINER ID", 15) + pad("IMAGE", 22) + pad("STATUS", 28) + pad("PORTS", 24) + "NAMES"),
    ...rows.map((c) =>
      out(
        pad(containerId(c.name), 15) +
          pad(c.image, 22) +
          pad(c.state === "exited" ? "Exited (143) 1 second ago" : c.state === "paused" ? "Up 10 minutes (Paused)" : "Up 10 minutes", 28) +
          pad(c.state === "exited" ? "" : (c.ports ?? ""), 24) +
          c.name,
        c.state === "exited" ? "dim" : "out",
      ),
    ),
  ];
}

export const noContainer = (name: string) => `Error response from daemon: No such container: ${name}`;

/** A deterministic log-line timestamp, as Kafka's tools print them. */
export function logTime(tick: number): string {
  const s = 10 * 60 + tick;
  const two = (n: number) => String(n).padStart(2, "0");
  return `[2026-11-20 ${two(10 + Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)},${String((tick * 137) % 1000).padStart(3, "0")}]`;
}
