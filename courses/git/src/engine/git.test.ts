import { describe, expect, it } from "vitest";
import { hashBlob, hashTree } from "./objects";
import { sha1, toHex } from "./sha1";
import {
  ADA,
  apply,
  asRemote,
  cloned,
  createRepo,
  currentBranch,
  headId,
  isAncestor,
  resolve,
  simulate,
  status,
  type GitAction,
  type Repo,
} from "./git";

const run = (actions: GitAction[], start?: Repo) => {
  const r = simulate(actions, start);
  return { s: r.states[r.states.length - 1]!, events: r.events };
};
const ok = (actions: GitAction[], start?: Repo) => {
  const { s, events } = run(actions, start);
  const errors = events.flat().filter((e) => e.type === "error");
  expect(errors).toEqual([]);
  return s;
};

describe("object ids match real Git", () => {
  it("sha1 known vector", () => {
    expect(toHex(sha1(new TextEncoder().encode("abc")))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });

  it("blob, tree and commit ids", () => {
    // `printf 'hello\n' | git hash-object --stdin`
    expect(hashBlob("hello")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
    // The empty tree.
    expect(hashTree({})).toBe("4b825dc642cb6eb9a060e54bf8d69288fbee4904");
    // `git write-tree` for README.md + src/app.py.
    expect(hashTree({ "README.md": "Merhaba", "src/app.py": "print(1)" })).toBe("b8a6588b10186c11f392a15b84c8e327acdda417");
    const s = ok([
      { type: "write", path: "README.md", content: "Merhaba" },
      { type: "write", path: "src/app.py", content: "print(1)" },
      { type: "add", paths: "." },
      { type: "commit", message: "İlk commit" },
      { type: "write", path: "README.md", content: "Merhaba dünya" },
      { type: "add", paths: ["README.md"] },
      { type: "commit", message: "README güncellendi" },
    ]);
    expect(s.author).toBe(ADA);
    // Same files, author and times as a real `git commit` run.
    expect(resolve(s, "HEAD~1")).toBe("c59e1d14985aa645bd8f3e19d67886d68693fd59");
    expect(headId(s)).toBe("318b994c3d806574cb582ca8f30daef2f7812bcb");
  });
});

/** main: A — B, feature from A: A — F. */
function forked(featureFile = "feature.txt", mainFile = "main.txt"): GitAction[] {
  return [
    { type: "write", path: "README.md", content: "v1" },
    { type: "add", paths: "." },
    { type: "commit", message: "A" },
    { type: "switch", target: "feature", create: true },
    { type: "write", path: featureFile, content: "f" },
    { type: "add", paths: "." },
    { type: "commit", message: "F" },
    { type: "switch", target: "main" },
    { type: "write", path: mainFile, content: "m" },
    { type: "add", paths: "." },
    { type: "commit", message: "B" },
  ];
}

describe("the three areas", () => {
  it("tracks untracked, staged and modified files", () => {
    let s = ok([{ type: "write", path: "a.txt", content: "1" }]);
    expect(status(s).untracked).toEqual(["a.txt"]);
    s = ok([{ type: "add", paths: ["a.txt"] }], s);
    expect(status(s).staged).toEqual([{ path: "a.txt", change: "added" }]);
    s = ok([{ type: "commit", message: "a" }, { type: "write", path: "a.txt", content: "2" }], s);
    expect(status(s).unstaged).toEqual([{ path: "a.txt", change: "modified" }]);
    expect(run([{ type: "commit", message: "x" }], s).events[0]![0]!.type).toBe("error");
    s = ok([{ type: "restore", path: "a.txt" }], s);
    expect(status(s).clean).toBe(true);
  });

  it("ignores files listed in .gitignore, unless already tracked", () => {
    const s = ok([
      { type: "write", path: ".gitignore", content: "*.log\nnode_modules/" },
      { type: "write", path: "app.log", content: "x" },
      { type: "write", path: "node_modules/lib.js", content: "x" },
      { type: "add", paths: "." },
    ]);
    expect(Object.keys(s.index)).toEqual([".gitignore"]);
    expect(status(s).ignored).toEqual(["app.log", "node_modules/lib.js"]);
    expect(run([{ type: "add", paths: ["app.log"] }], s).events[0]![0]).toMatchObject({ code: "ignored" });
  });
});

describe("branches and merges", () => {
  it("fast-forwards when main has not moved", () => {
    const s = ok([
      { type: "write", path: "a", content: "1" },
      { type: "add", paths: "." },
      { type: "commit", message: "A" },
      { type: "switch", target: "f", create: true },
      { type: "write", path: "b", content: "1" },
      { type: "add", paths: "." },
      { type: "commit", message: "B" },
      { type: "switch", target: "main" },
      { type: "merge", target: "f" },
    ]);
    expect(s.branches.main).toBe(s.branches.f);
    expect(s.work.b).toBe("1");
  });

  it("makes a merge commit with two parents when both moved", () => {
    const s = ok([...forked(), { type: "merge", target: "feature" }]);
    const head = s.commits[headId(s)!]!;
    expect(head.parents).toHaveLength(2);
    expect(head.message).toBe("Merge branch 'feature'");
    expect(Object.keys(head.files).sort()).toEqual(["README.md", "feature.txt", "main.txt"]);
  });

  it("stops on a conflict, then finishes after resolve + add + commit", () => {
    const { s, events } = run([...forked("README.md", "README.md"), { type: "merge", target: "feature" }]);
    expect(events.at(-1)![0]).toMatchObject({ type: "conflict", paths: ["README.md"] });
    expect(s.work["README.md"]).toBe("<<<<<<< HEAD\nm\n=======\nf\n>>>>>>> feature");
    expect(run([{ type: "commit" }], s).events[0]![0]).toMatchObject({ code: "conflicts-left" });
    const done = ok([{ type: "resolve", path: "README.md", take: "both" }, { type: "add", paths: ["README.md"] }, { type: "commit" }], s);
    expect(done.op).toBeNull();
    expect(done.commits[headId(done)!]!.files["README.md"]).toBe("m\nf");
    expect(done.commits[headId(done)!]!.parents).toHaveLength(2);
  });

  it("abort puts everything back", () => {
    const { s } = run([...forked("README.md", "README.md"), { type: "merge", target: "feature" }]);
    const back = ok([{ type: "abort" }], s);
    expect(back.op).toBeNull();
    expect(back.work["README.md"]).toBe("m");
  });

  it("refuses to switch when local changes would be overwritten, carries them otherwise", () => {
    const s = ok([...forked("README.md", "README.md")]);
    const dirty = ok([{ type: "write", path: "README.md", content: "local" }], s);
    expect(run([{ type: "switch", target: "feature" }], dirty).events[0]![0]).toMatchObject({ code: "would-overwrite" });
    const other = ok([{ type: "write", path: "notes.txt", content: "n" }, { type: "switch", target: "feature" }], s);
    expect(other.work["notes.txt"]).toBe("n");
  });
});

describe("rebase", () => {
  it("replays feature on top of main as new commits", () => {
    const before = ok([...forked(), { type: "switch", target: "feature" }]);
    const oldF = before.branches.feature!;
    const s = ok([{ type: "rebase", onto: "main" }], before);
    expect(s.branches.feature).not.toBe(oldF);
    expect(s.commits[s.branches.feature!]!.parents).toEqual([s.branches.main]);
    expect(s.commits[s.branches.feature!]!.message).toBe("F");
    expect(currentBranch(s)).toBe("feature");
    // The old commit is still in the object store, reachable from the reflog.
    expect(s.commits[oldF]).toBeDefined();
  });

  it("stops on a conflict and continues", () => {
    const { s } = run([...forked("README.md", "README.md"), { type: "switch", target: "feature" }, { type: "rebase", onto: "main" }]);
    expect(s.op?.kind).toBe("rebase");
    const done = ok([{ type: "resolve", path: "README.md", take: "theirs" }, { type: "add", paths: ["README.md"] }, { type: "continue" }], s);
    expect(done.op).toBeNull();
    expect(currentBranch(done)).toBe("feature");
    expect(isAncestor(done, done.branches.main!, done.branches.feature!)).toBe(true);
  });

  it("interactive rebase squashes commits", () => {
    const s0 = ok([
      { type: "write", path: "a", content: "1" },
      { type: "add", paths: "." },
      { type: "commit", message: "base" },
      { type: "write", path: "a", content: "2" },
      { type: "commit", all: true, message: "wip" },
      { type: "write", path: "a", content: "3" },
      { type: "commit", all: true, message: "wip 2" },
    ]);
    const [w2, w1] = [resolve(s0, "HEAD")!, resolve(s0, "HEAD~1")!];
    const s = ok([{ type: "rebaseInteractive", base: "HEAD~2", plan: [{ id: w1, action: "reword", message: "Add a" }, { id: w2, action: "fixup" }] }], s0);
    const head = s.commits[headId(s)!]!;
    expect(head.message).toBe("Add a");
    expect(head.files.a).toBe("3");
    expect(head.parents).toEqual([resolve(s0, "HEAD~2")]);
  });
});

describe("undoing", () => {
  const three: GitAction[] = [
    { type: "write", path: "a", content: "1" },
    { type: "add", paths: "." },
    { type: "commit", message: "one" },
    { type: "write", path: "a", content: "2" },
    { type: "commit", all: true, message: "two" },
  ];

  it("reset soft, mixed and hard", () => {
    const base = ok(three);
    const soft = ok([{ type: "reset", target: "HEAD~1", mode: "soft" }], base);
    expect(status(soft).staged).toEqual([{ path: "a", change: "modified" }]);
    const mixed = ok([{ type: "reset", target: "HEAD~1", mode: "mixed" }], base);
    expect(status(mixed).unstaged).toEqual([{ path: "a", change: "modified" }]);
    const hard = ok([{ type: "reset", target: "HEAD~1", mode: "hard" }], base);
    expect(status(hard).clean).toBe(true);
    expect(hard.work.a).toBe("1");
    // The reflog still remembers where HEAD was.
    expect(hard.reflog.at(-1)!.from).toBe(headId(base));
  });

  it("revert adds an undo commit", () => {
    const s = ok([...three, { type: "revert", target: "HEAD" }]);
    expect(s.work.a).toBe("1");
    expect(s.commits[headId(s)!]!.message.startsWith('Revert "two"')).toBe(true);
  });

  it("amend replaces the last commit", () => {
    const base = ok(three);
    const s = ok([{ type: "commit", amend: true, message: "two, fixed" }], base);
    expect(s.commits[headId(s)!]!.parents).toEqual(base.commits[headId(base)!]!.parents);
  });

  it("stash and pop", () => {
    const s = ok([...three, { type: "write", path: "a", content: "wip" }, { type: "stash" }]);
    expect(s.work.a).toBe("2");
    const back = ok([{ type: "stashPop" }], s);
    expect(back.work.a).toBe("wip");
    expect(back.stash).toHaveLength(0);
  });

  it("cherry-pick copies a commit", () => {
    const s = ok([...forked(), { type: "cherryPick", target: "feature" }]);
    expect(s.work["feature.txt"]).toBe("f");
    expect(s.commits[headId(s)!]!.message).toBe("F");
  });
});

describe("remotes", () => {
  const origin = asRemote(
    ok([
      { type: "write", path: "README.md", content: "v1" },
      { type: "add", paths: "." },
      { type: "commit", message: "first" },
    ]),
  );

  it("push is rejected when the remote moved, then pull and push works", () => {
    const s = ok([
      { type: "teammate", branch: "main", path: "team.txt", content: "t", message: "team" },
      { type: "write", path: "mine.txt", content: "m" },
      { type: "add", paths: "." },
      { type: "commit", message: "mine" },
    ], cloned(origin));
    expect(run([{ type: "push" }], s).events[0]![0]).toMatchObject({ type: "pushRejected", reason: "non-fast-forward" });
    const pushed = ok([{ type: "pull" }, { type: "push" }], s);
    expect(pushed.remote!.branches.main).toBe(pushed.branches.main);
    expect(pushed.work["team.txt"]).toBe("t");
  });

  it("force-with-lease refuses when it has not seen the latest remote work", () => {
    const s = ok([
      { type: "write", path: "mine.txt", content: "m" },
      { type: "add", paths: "." },
      { type: "commit", message: "mine" },
      { type: "teammate", branch: "main", path: "team.txt", content: "t", message: "team" },
    ], cloned(origin));
    expect(run([{ type: "push", force: "lease" }], s).events[0]![0]).toMatchObject({ reason: "stale" });
    expect(run([{ type: "push", force: "force" }], s).events[0]![0]).toMatchObject({ type: "pushed", forced: true });
  });

  it("a new branch needs -u the first time", () => {
    const s = ok([{ type: "switch", target: "feat", create: true }, { type: "write", path: "x", content: "1" }, { type: "add", paths: "." }, { type: "commit", message: "x" }], cloned(origin));
    expect(run([{ type: "push" }], s).events[0]![0]).toMatchObject({ reason: "no-upstream" });
    const pushed = ok([{ type: "push", setUpstream: true }], s);
    expect(pushed.upstream.feat).toBe("origin/feat");
  });
});

describe("bisect", () => {
  it("finds the first bad commit by halving", () => {
    const actions: GitAction[] = [];
    for (let i = 1; i <= 8; i++) {
      actions.push({ type: "write", path: "app.js", content: i >= 6 ? `v${i} bug` : `v${i}` });
      actions.push({ type: "add", paths: "." });
      actions.push({ type: "commit", message: `c${i}` });
    }
    let s = ok(actions);
    const first = resolve(s, "HEAD~7")!;
    s = ok([{ type: "bisectStart", bad: "HEAD", good: first }], s);
    let guard = 0;
    while (!s.bisect!.found && guard++ < 10) {
      const bad = s.work["app.js"]!.includes("bug");
      s = ok([{ type: "bisectMark", verdict: bad ? "bad" : "good" }], s);
    }
    expect(s.commits[s.bisect!.found!]!.message).toBe("c6");
    expect(guard).toBeLessThanOrEqual(3);
    s = ok([{ type: "bisectReset" }], s);
    expect(currentBranch(s)).toBe("main");
  });
});

it("an empty repo is on an unborn main", () => {
  const s = createRepo();
  expect(headId(s)).toBeNull();
  expect(apply(s, { type: "branch", name: "x" }).events[0]).toMatchObject({ code: "unborn" });
});
