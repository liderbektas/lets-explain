import { describe, expect, it } from "vitest";
import { asRemote, cloned, createRepo, headId, simulate, status, type GitAction, type Repo } from "./git";
import { promptFor, runLine, type CliResult } from "./cli";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });

/** One commit with README.md and app.js. */
const base = simulate([write("README.md", "Merhaba"), write("app.js", "v1"), { type: "add", paths: "." }, { type: "commit", message: "Start" }], createRepo()).states[4]!;

/** Types lines one after another, saving any editor with `edits` in order. */
function type(start: Repo, typed: string[], edits: ((text: string) => string)[] = []): { repo: Repo; out: string[]; results: CliResult[] } {
  let repo = start;
  const out: string[] = [];
  const results: CliResult[] = [];
  const settle = (r: CliResult) => {
    results.push(r);
    out.push(...r.output.map((l) => l.text));
    repo = simulate(r.actions, repo).states.at(-1)!;
    if (r.editor) {
      const edit = edits.shift();
      if (!edit) throw new Error(`editor ${r.editor.file} left open`);
      settle(r.editor.save(repo, edit(r.editor.text)));
    }
  };
  for (const line of typed) settle(runLine(repo, line));
  return { repo, out, results };
}

describe("git cli", () => {
  it("stages and commits only what was added, and prints like Git", () => {
    const { repo, out } = type(base, ['echo "v2" > app.js', 'echo "hi" >> README.md', "git add app.js", 'git commit -m "Update app"']);
    expect(out.some((l) => /^\[main [0-9a-f]{7}\] Update app$/.test(l))).toBe(true);
    expect(out).toContain(" 1 file changed");
    expect(repo.work["README.md"]).toBe("Merhaba\nhi");
    expect(status(repo).unstaged.map((c) => c.path)).toEqual(["README.md"]);
  });

  it("prints git status with each section", () => {
    const { out } = type(base, ['echo "v2" > app.js', "echo x > notes.txt", "git add app.js", 'echo "v3" > README.md', "git status"]);
    expect(out).toContain("On branch main");
    expect(out).toContain("Changes to be committed:");
    expect(out).toContain("\tmodified:   app.js");
    expect(out).toContain("Changes not staged for commit:");
    expect(out).toContain("\tmodified:   README.md");
    expect(out).toContain("Untracked files:");
    expect(out).toContain("\tnotes.txt");
  });

  it("runs a chain with && and stops at the first error", () => {
    const ok = type(base, ['echo v2 > app.js && git add . && git commit -m "One go"']);
    expect(ok.results[0]!.moves).toBe(3);
    const bad = type(base, ['git switch nope && git commit -m "never"']);
    expect(bad.out).toContain("fatal: invalid reference: nope");
    expect(bad.repo).toBe(base);
  });

  it("opens an editor for a commit without -m, and aborts on an empty message", () => {
    const done = type(base, ["echo v2 > app.js", "git commit -a"], [(t) => `Fix the app\n${t}`]);
    expect(done.repo.commits[headId(done.repo)!]!.message).toBe("Fix the app");
    const empty = type(base, ["echo v2 > app.js", "git commit -a"], [(t) => t]);
    expect(empty.out).toContain("Aborting commit due to empty commit message.");
    expect(headId(empty.repo)).toBe(headId(base));
  });

  it("says nothing to commit when nothing is staged", () => {
    const { out } = type(base, ['git commit -m "x"']);
    expect(out).toContain("nothing to commit, working tree clean");
  });

  it("switches and creates branches with Git's messages", () => {
    const { repo, out } = type(base, ["git switch -c feature", "git switch main", "git checkout -b fix"]);
    expect(out).toEqual(["Switched to a new branch 'feature'", "Switched to branch 'main'", "Switched to a new branch 'fix'"]);
    expect(promptFor(repo)).toBe("~/shop (fix)$");
  });

  it("refuses unknown commands and flags plainly", () => {
    expect(type(base, ["git frobnicate"]).out[0]).toBe("git: 'frobnicate' is not a git command. See 'git --help'.");
    expect(type(base, ["git commit --wat"]).out[0]).toBe("error: unknown option `wat'");
    expect(type(base, ["dance"]).out[0]).toBe("bash: dance: command not found");
  });

  it("asks for an upstream on a new branch, and -u sets it", () => {
    const origin = asRemote(base);
    const clone = cloned(origin);
    const first = type(clone, ["git switch -c feature", "echo v2 > app.js", 'git commit -am "Feature"', "git push"]);
    expect(first.out).toContain("fatal: The current branch feature has no upstream branch.");
    const second = type(first.repo, ["git push -u origin feature"]);
    expect(second.out).toContain(" * [new branch]      feature -> feature");
    expect(second.repo.upstream.feature).toBe("origin/feature");
  });

  it("squashes with rebase -i through the todo editor", () => {
    const three = type(base, ["echo v2 > app.js", 'git commit -am "A"', "echo v3 > app.js", 'git commit -am "B"']).repo;
    const { repo, out } = type(three, ["git rebase -i HEAD~2"], [(t) => t.replace(/\npick /, "\nsquash "), () => "A and B"]);
    expect(out.at(-1)).toBe("Successfully rebased and updated refs/heads/main.");
    const head = repo.commits[headId(repo)!]!;
    expect(head.message).toBe("A and B");
    expect(head.parents[0]).toBe(headId(base));
  });

  it("shows a conflict like Git and resolves it with checkout --theirs", () => {
    const forked = type(base, ["git switch -c other", "echo theirs > app.js", 'git commit -am "Theirs"', "git switch main", "echo ours > app.js", 'git commit -am "Ours"']).repo;
    const merged = type(forked, ["git merge other"]);
    expect(merged.out).toContain("CONFLICT (content): Merge conflict in app.js");
    expect(promptFor(merged.repo)).toBe("~/shop (main|MERGING)$");
    const fixed = type(merged.repo, ["git checkout --theirs app.js", "git add app.js", "git commit"]);
    expect(fixed.repo.op).toBeNull();
    expect(fixed.repo.work["app.js"]).toBe("theirs");
  });

  it("resolves HEAD@{n} and ORIG_HEAD like Git", () => {
    const two = type(base, ["echo v2 > app.js", 'git commit -am "Two"']).repo;
    const reset = type(two, ["git reset --hard HEAD~1"]).repo;
    expect(headId(reset)).toBe(headId(base));
    const back = type(reset, ["git reset --hard HEAD@{1}"]).repo;
    expect(headId(back)).toBe(headId(two));
    const orig = type(reset, ["git reset --hard ORIG_HEAD"]).repo;
    expect(headId(orig)).toBe(headId(two));
  });

  it("lists stashes newest first with Git's labels", () => {
    const { out } = type(base, ["echo a > app.js", 'git stash push -m "first"', "echo b > app.js", 'git stash push -m "second"', "git stash list"]);
    expect(out.slice(-2)).toEqual(["stash@{0}: On main: second", "stash@{1}: On main: first"]);
  });

  it("pulls a named branch and pushes HEAD", () => {
    const origin = asRemote(base);
    const clone = cloned(origin);
    const mine = type(clone, ["git switch -c feature", "echo v2 > app.js", 'git commit -am "Feature"', "git push -u origin HEAD"]);
    expect(mine.repo.remote!.branches.feature).toBe(headId(mine.repo));
    const withMain = simulate([{ type: "teammate", branch: "main", path: "README.md", content: "news", message: "News" }], mine.repo).states.at(-1)!;
    const pulled = type(withMain, ["git pull --rebase origin main"]);
    expect(pulled.repo.commits[headId(pulled.repo)!]!.parents[0]).toBe(pulled.repo.remote!.branches.main);
  });

  it("switches back with git switch - and renames with branch -m", () => {
    const { repo, out } = type(base, ["git switch -c feature", "git switch main", "git switch -", "git branch -m feature login"]);
    expect(out[2]).toBe("Switched to branch 'feature'");
    expect(promptFor(repo)).toBe("~/shop (login)$");
  });

  it("reads ranges, paths and --stat in git log", () => {
    const repo = type(base, ["git switch -c feature", "echo v2 > app.js", 'git commit -am "App"', "echo x > notes.txt", "git add .", 'git commit -m "Notes"']).repo;
    expect(type(repo, ["git log --oneline main..feature"]).out).toHaveLength(2);
    expect(type(repo, ["git log --oneline -- notes.txt"]).out).toHaveLength(1);
    expect(type(repo, ["git log -1 --stat"]).out).toContain(" 1 file changed, 1 insertion(+), 0 deletions(-)");
    expect(type(repo, ['git log -1 --format="%s"']).out).toEqual(["Notes"]);
  });

  it("autosquashes fixup commits", () => {
    const repo = type(base, ["echo v2 > app.js", 'git commit -am "Login"', "echo n > notes.txt", "git add .", 'git commit -m "Notes"', "echo v3 > app.js", "git commit -a --fixup HEAD~1"]).repo;
    const done = type(repo, ["git rebase -i --autosquash HEAD~3"], [(t) => t]);
    const msgs = type(done.repo, ['git log --format="%s"']).out;
    expect(msgs).toEqual(["Notes", "Login", "Start"]);
    expect(done.repo.work["app.js"]).toBe("v3");
  });

  it("gives cherry-pick its own wording for a dirty tree", () => {
    const repo = type(base, ["git switch -c other", "echo x > notes.txt", "git add .", 'git commit -m "Notes"', "git switch main", "echo dirty > app.js"]).repo;
    expect(type(repo, ["git cherry-pick other"]).out[0]).toBe("error: your local changes would be overwritten by cherry-pick.");
  });
});
