import { fromHex, sha1, toHex } from "./sha1";

/**
 * Git's object format, byte for byte, so the ids in the lessons are the ids real Git would
 * print for the same content, author and time. Checked against `git hash-object`,
 * `git write-tree` and `git commit` in objects.test.ts.
 */

export type Files = Record<string, string>;

const enc = new TextEncoder();

function hashObject(type: "blob" | "tree" | "commit", body: Uint8Array): string {
  const header = enc.encode(`${type} ${body.length}\0`);
  const all = new Uint8Array(header.length + body.length);
  all.set(header);
  all.set(body, header.length);
  return toHex(sha1(all));
}

/** A file's content as Git stores it. Lesson files are text, kept with a trailing newline. */
export function blobBytes(content: string): Uint8Array {
  return enc.encode(content.endsWith("\n") || content === "" ? content : `${content}\n`);
}

export function hashBlob(content: string): string {
  return hashObject("blob", blobBytes(content));
}

export interface TreeEntry {
  mode: "100644" | "40000";
  name: string;
  id: string;
  type: "blob" | "tree";
}

export interface TreeObject {
  id: string;
  entries: TreeEntry[];
}

/** Builds the tree objects for a set of files (paths may contain "/"), root first. */
export function buildTrees(files: Files): TreeObject[] {
  const out: TreeObject[] = [];
  const build = (prefix: string): string => {
    const names = new Map<string, "blob" | "tree">();
    for (const path of Object.keys(files)) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) names.set(rest, "blob");
      else names.set(rest.slice(0, slash), "tree");
    }
    const entries: TreeEntry[] = [...names].map(([name, type]) =>
      type === "blob"
        ? { mode: "100644", name, type, id: hashBlob(files[prefix + name]!) }
        : { mode: "40000", name, type, id: build(`${prefix}${name}/`) },
    );
    // Git sorts entries as if tree names ended in "/".
    const key = (e: TreeEntry) => (e.type === "tree" ? `${e.name}/` : e.name);
    entries.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    const parts: Uint8Array[] = [];
    for (const e of entries) {
      parts.push(enc.encode(`${e.mode} ${e.name}\0`));
      parts.push(fromHex(e.id));
    }
    const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      body.set(p, at);
      at += p.length;
    }
    const id = hashObject("tree", body);
    out.unshift({ id, entries });
    return id;
  };
  build("");
  return out;
}

export function hashTree(files: Files): string {
  return buildTrees(files)[0]!.id;
}

export interface CommitFields {
  tree: string;
  parents: string[];
  author: string;
  time: number;
  message: string;
}

export function commitText(c: CommitFields): string {
  const lines = [`tree ${c.tree}`, ...c.parents.map((p) => `parent ${p}`), `author ${c.author} ${c.time} +0000`, `committer ${c.author} ${c.time} +0000`];
  return `${lines.join("\n")}\n\n${c.message}\n`;
}

export function hashCommit(c: CommitFields): string {
  return hashObject("commit", enc.encode(commitText(c)));
}
