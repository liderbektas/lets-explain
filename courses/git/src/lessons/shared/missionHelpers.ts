import { shortestWin } from "@lets-explain/core/lib/missionSearch";
import { apply, simulate, type GitAction, type Repo } from "../../engine/git";
import type { GitCtx, GitScene } from "./GitScene";

/** Commits made during the try-it step (not there when it started). */
export function newCommits(ctx: GitCtx): string[] {
  return Object.keys(ctx.state.commits).filter((c) => !ctx.start.commits[c]);
}

/** Paths a commit changed compared with its first parent. */
export function changedIn(repo: Repo, id: string): string[] {
  const c = repo.commits[id]!;
  const parent = c.parents[0] ? repo.commits[c.parents[0]]!.files : {};
  const paths = new Set([...Object.keys(parent), ...Object.keys(c.files)]);
  return [...paths].filter((p) => parent[p] !== c.files[p]).sort();
}

/** The mission context for a list of moves from the try-it step's start. */
export function ctxFor(scene: GitScene, actions: GitAction[]): GitCtx {
  const r = simulate(actions, scene.sandboxStart);
  return { start: scene.sandboxStart, state: r.states[r.states.length - 1]!, actions, events: r.events, states: r.states };
}

/** The shortest win within `depth` moves, using exactly the buttons the try-it step enables. */
export function searchWin(scene: GitScene, check: (c: GitCtx) => boolean, depth: number): GitAction[] | null {
  return shortestWin<Repo, GitAction, GitCtx>({
    start: scene.sandboxStart,
    moves: (state, history) => scene.moves(state, history),
    step: (state, move) => apply(state, move).state,
    context: (start, history) => {
      const r = simulate(history, start);
      return { start, state: r.states[r.states.length - 1]!, actions: history, events: r.events, states: r.states };
    },
    check,
    depth,
  });
}
