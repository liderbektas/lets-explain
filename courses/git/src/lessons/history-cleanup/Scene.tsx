import { motion } from "motion/react";
import { l, type L } from "@lets-explain/core/i18n";
import {
  ADA,
  ancestors,
  apply,
  asRemote,
  cloned,
  createRepo,
  firstParents,
  headId,
  reachable,
  resolve,
  short,
  simulate,
  type GitAction,
  type PlanItem,
  type Repo,
} from "../../engine/git";
import { GraphStage } from "../../iso/GraphStage";
import { makeGitScene, type SandboxRow } from "../shared/GitScene";
import { missions } from "./missions";
import "./todo.css";

export const SLUG = "history-cleanup";
export const BASE = "origin/main";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });
const edit = (path: string, content: string, message: string): GitAction[] => [write(path, content), add(path), commit(message)];

/** One shared commit on origin, then five local commits written in a hurry. */
const origin = asRemote(simulate(edit("README.md", "Uygulama", "Proje başladı"), createRepo({ author: ADA })).states[3]!);

export const START: Repo = (() => {
  const r = simulate(
    [
      ...edit("login.js", "giriş formu", "Giriş formu"),
      ...edit("login.js", "giriş formu (e-posta doğrulamalı)", "yazım hatası düzeltildi"),
      ...edit("debug.js", "console.log(user)", "debug log"),
      ...edit("password.js", "şifre kontrolü (yarım)", "wip"),
      ...edit("password.js", "şifre kontrolü", "Şifre kontorlü"),
    ],
    cloned(origin),
  );
  return r.states[r.states.length - 1]!;
})();

/** Better messages the try-it step's reword and amend buttons use. */
export const REWORD: Record<string, string> = {
  wip: "Şifre kontrolü",
  "Şifre kontorlü": "Şifre kontrolü",
  "yazım hatası düzeltildi": "Giriş formunda e-posta doğrulaması",
  "debug log": "Kullanıcıyı konsola yaz",
};

/** The commits `git rebase -i origin/main` would list, oldest first. */
export function todo(repo: Repo): string[] {
  const base = resolve(repo, BASE);
  const chain = firstParents(repo, headId(repo));
  const cut = base ? chain.indexOf(base) : -1;
  return (cut < 0 ? chain : chain.slice(0, cut)).reverse();
}

/** A rebase -i plan: every commit picked, except the ones given another action. */
export function plan(repo: Repo, changes: Record<string, PlanItem["action"]>, messages: Record<string, string> = {}): PlanItem[] {
  return todo(repo).map((id) => {
    const msg = repo.commits[id]!.message;
    return { id, action: changes[msg] ?? "pick", message: messages[msg] };
  });
}

const rebaseI = (repo: Repo, changes: Record<string, PlanItem["action"]>, messages?: Record<string, string>): GitAction => ({
  type: "rebaseInteractive",
  base: BASE,
  plan: plan(repo, changes, messages),
});

/** Steps are built in order, because each plan needs the ids the previous step made. */
export const steps: GitAction[][] = (() => {
  const out: GitAction[][] = [[]];
  let s = START;
  const push = (actions: GitAction[]) => {
    out.push(actions);
    for (const a of actions) s = apply(s, a).state;
  };
  push([{ type: "commit", amend: true, message: "Şifre kontrolü" }]);
  push([]);
  push([rebaseI(s, { "yazım hatası düzeltildi": "fixup" })]);
  push([rebaseI(s, { "debug log": "drop" })]);
  push([rebaseI(s, { "Şifre kontrolü": "squash" }, { "Şifre kontrolü": "Şifre kontrolü" })]);
  push([]);
  push([]);
  push([]);
  return out;
})();

/** Only show ghosts the last action left behind; older ones would crowd the graph. */
export function withRecentGhosts(repo: Repo): Repo {
  const last = repo.reflog[repo.reflog.length - 1];
  const keep = new Set(reachable(repo));
  if (last?.from) for (const c of ancestors(repo, last.from)) keep.add(c);
  const commits = Object.fromEntries(Object.entries(repo.commits).filter(([id]) => keep.has(id)));
  return { ...repo, commits };
}

function rows(repo: Repo, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const list = todo(repo);
  const out: SandboxRow[] = list.map((id, i) => {
    const msg = repo.commits[id]!.message;
    return {
      label: `${short(id)} ${clip(msg, 14)}`,
      buttons: [
        { label: "fixup", action: rebaseI(repo, { [msg]: "fixup" }), disabled: i === 0 },
        { label: "drop", action: rebaseI(repo, { [msg]: "drop" }), tone: "danger", disabled: list.length <= 1 },
        { label: "reword", action: rebaseI(repo, { [msg]: "reword" }, { [msg]: REWORD[msg] ?? msg }), disabled: !REWORD[msg] },
      ],
    };
  });
  const head = headId(repo);
  const lastMsg = head ? repo.commits[head]!.message : "";
  out.push({
    label: tr ? "Son commit" : "Last commit",
    buttons: [
      {
        label: "commit --amend",
        action: { type: "commit", amend: true, message: REWORD[lastMsg] ?? lastMsg },
        tone: "ok",
        disabled: !REWORD[lastMsg] || list.length === 0,
      },
    ],
  });
  return out;
}

function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/* Text fills are inline: the stage's own text colour would win over a class. */
const ACTION_FILL: Record<PlanItem["action"], string> = {
  pick: "#fffdf8",
  reword: "var(--sun)",
  squash: "var(--lilac)",
  fixup: "var(--lilac)",
  drop: "var(--coral)",
};

/** The todo list `git rebase -i` opens in your editor, with the plan of this step. */
function TodoPanel({ repo, items, t }: { repo: Repo; items: PlanItem[]; t: (x: L) => string }) {
  const x = 556;
  const y = 40;
  const w = 292;
  const h = 46 + Math.max(items.length, 1) * 30 + 16;
  return (
    <g className="todo-panel">
      <rect x={x} y={y + 4} width={w} height={h} rx={14} style={{ fill: "var(--ink)" }} />
      <rect x={x} y={y} width={w} height={h} rx={14} className="todo-box" />
      <text x={x + 14} y={y + 26} className="todo-title" style={{ fill: "var(--mint)" }}>
        git rebase -i {BASE}
      </text>
      {items.length === 0 && (
        <text x={x + 14} y={y + 60} className="todo-line is-empty" style={{ fill: "#b9b2c2" }}>
          {t(l("(origin/main üstünde commit yok)", "(no commits on top of origin/main)"))}
        </text>
      )}
      {items.map((item, i) => {
        const c = repo.commits[item.id];
        const msg = item.action === "reword" || item.action === "squash" ? (item.message ?? c?.message ?? "") : (c?.message ?? "");
        return (
          // One row per commit: moving a line in the editor moves the row, changing its word changes it in place.
          <motion.g
            key={item.id}
            initial={{ opacity: 0, x: -8, y: i * 30 }}
            animate={{ opacity: 1, x: 0, y: i * 30 }}
            transition={{ y: { type: "spring", stiffness: 170, damping: 22 }, opacity: { delay: i * 0.05 }, x: { delay: i * 0.05 } }}
          >
            <rect x={x + 10} y={y + 42} width={w - 20} height={24} rx={7} className={`todo-row is-${item.action}`} />
            <text x={x + 18} y={y + 58} className={`todo-action is-${item.action}`} style={{ fill: ACTION_FILL[item.action] }}>
              {item.action}
            </text>
            <text x={x + 82} y={y + 58} className="todo-id" style={{ fill: "#b9b2c2" }}>
              {short(item.id)}
            </text>
            <text
              x={x + 146}
              y={y + 58}
              className={`todo-line ${item.action === "drop" ? "is-drop" : ""}`}
              style={{ fill: item.action === "drop" ? "#b9b2c2" : "#f4efe6" }}
            >
              {clip(msg.split("\n")[0]!, 17)}
            </text>
          </motion.g>
        );
      })}
    </g>
  );
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Commit grafiği ve rebase -i yapılacaklar listesi", "The commit graph and the rebase -i todo list"),
  view: (repo, info) => {
    // In lesson steps, show the plan this step applies; otherwise the plain pick list.
    const action = info.sandbox ? undefined : steps[info.step]?.find((a) => a.type === "rebaseInteractive");
    const items: PlanItem[] =
      action?.type === "rebaseInteractive" ? action.plan : todo(repo).map((id) => ({ id, action: "pick" as const }));
    return (
      <g>
        <GraphStage repo={withRecentGhosts(repo)} box={{ x: 0, y: 0, w: 552, h: 470 }} highlight={info.fresh} />
        <TodoPanel repo={repo} items={items} t={info.t} />
      </g>
    );
  },
  metrics: (repo, t) => {
    const ghosts = Object.keys(withRecentGhosts(repo).commits).length - reachable(repo).size;
    return [
      { label: t(l("Push edilmemiş commit", "Unpushed commits")), value: todo(repo).length },
      { label: t(l("Yeni hayalet", "New ghosts")), value: ghosts, tone: ghosts ? "warn" : "plain" },
    ];
  },
  sandbox: { start: () => START, rows: (repo, lang) => rows(repo, lang), missions },
});
