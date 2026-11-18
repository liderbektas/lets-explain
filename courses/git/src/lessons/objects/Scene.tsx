import { l } from "@lets-explain/core/i18n";
import { ADA, createRepo, headId, simulate, status, type GitAction, type Repo } from "../../engine/git";
import { buildTrees, hashBlob } from "../../engine/objects";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";
import { ObjectsStage } from "./ObjectsStage";

export const SLUG = "objects";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const addAll: GitAction = { type: "add", paths: "." };
const commit = (message: string): GitAction => ({ type: "commit", message });

/** A fresh repository with one file written but not added: nothing is in `.git` yet. */
export const START: Repo = simulate([write("README.md", "Merhaba")], createRepo({ author: ADA })).states[1]!;

export const steps: GitAction[][] = [
  [],
  [add("README.md")],
  [commit("İlk commit")],
  [write("notes.txt", "Merhaba"), addAll, commit("Not eklendi")],
  [write("src/app.js", "v1"), addAll, commit("src eklendi")],
  [write("src/app.js", "v2"), addAll, commit("app v2")],
  [],
  [],
  [],
];

/** Every distinct object in the repository: what `.git/objects` would hold (loose, uncompressed). */
export function objectCounts(repo: Repo) {
  const blobs = new Set<string>();
  const trees = new Set<string>();
  for (const c of Object.values(repo.commits)) {
    for (const t of buildTrees(c.files)) trees.add(t.id);
    for (const content of Object.values(c.files)) blobs.add(hashBlob(content));
  }
  for (const content of Object.values(repo.index)) blobs.add(hashBlob(content));
  return { blobs: blobs.size, trees: trees.size, commits: Object.keys(repo.commits).length };
}

/** The sandbox: one commit with README.md "Merhaba". */
const sandboxStart = (): Repo => simulate([write("README.md", "Merhaba"), addAll, commit("Başlangıç")], createRepo({ author: ADA })).states[3]!;

const CONTENTS = ["Merhaba", "Selam"];

function rows(repo: Repo, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const st = status(repo);
  const fileRow = (path: string): SandboxRow => ({
    label: path,
    buttons: CONTENTS.map((content) => ({
      label: `"${content}"`,
      action: write(path, content),
      tone: "producer" as const,
      disabled: repo.work[path] === content,
    })),
  });
  return [
    fileRow("README.md"),
    fileRow("notes.txt"),
    {
      label: tr ? "Kaydet" : "Save",
      buttons: [
        { label: "add .", action: addAll, disabled: st.unstaged.length === 0 && st.untracked.length === 0 },
        { label: "commit", action: commit(`Commit ${Object.keys(repo.commits).length + 1}`), tone: "ok", disabled: st.staged.length === 0 },
      ],
    },
  ];
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Git'in nesneleri: commit'ler tree'leri, tree'ler blob'ları gösterir", "Git's objects: commits point to trees, trees point to blobs"),
  view: (repo, info) => (
    <ObjectsStage
      repo={repo}
      labels={{
        newTag: info.t(l("yeni", "new")),
        shared: info.t(l("paylaşılıyor", "shared")),
        staged: info.t(l("add ile yazıldı", "written by add")),
        notYet: info.t(l("henüz .git'te değil", "not in .git yet")),
        empty: info.t(l("Henüz nesne yok", "No objects yet")),
      }}
    />
  ),
  metrics: (repo, t) => {
    const n = objectCounts(repo);
    const head = headId(repo);
    return [
      { label: "blob", value: n.blobs, dot: "var(--mint)" },
      { label: "tree", value: n.trees, dot: "var(--sky)" },
      { label: "commit", value: n.commits, dot: "var(--sun)" },
      { label: t(l("Dosya", "Files")), value: head ? Object.keys(repo.commits[head]!.files).length : Object.keys(repo.work).length },
    ];
  },
  legend: (t) => [
    { swatch: <rect x={-8} y={-7} width={16} height={12} rx={3} style={{ fill: "var(--sun-soft)", stroke: "var(--ink)", strokeWidth: 1.5 }} />, label: t(l("commit: tree + parent + mesaj", "commit: tree + parent + message")) },
    { swatch: <rect x={-8} y={-7} width={16} height={12} rx={3} style={{ fill: "var(--sky-soft)", stroke: "var(--ink)", strokeWidth: 1.5 }} />, label: t(l("tree: bir klasör (adlar + kimlikler)", "tree: a folder (names + ids)")) },
    { swatch: <rect x={-8} y={-7} width={16} height={12} rx={3} style={{ fill: "var(--mint-soft)", stroke: "var(--ink)", strokeWidth: 1.5 }} />, label: t(l("blob: bir dosyanın içeriği", "blob: a file's content")) },
  ],
  sandbox: { start: sandboxStart, rows, missions },
});
