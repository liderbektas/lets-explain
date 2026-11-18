import { shortestWin } from "@lets-explain/core/lib/missionSearch";
import { apply, simulate, type Host, type DockerAction } from "../../engine/docker";
import type { DockerCtx, DockerScene } from "./DockerScene";

/** The mission context for a list of moves from the try-it step's start. */
export function ctxFor(scene: DockerScene, actions: DockerAction[]): DockerCtx {
  const r = simulate(actions, scene.sandboxStart);
  return { start: scene.sandboxStart, state: r.states[r.states.length - 1]!, actions, events: r.events, states: r.states };
}

/** The shortest win within `depth` moves, using exactly the buttons the try-it step enables. */
export function searchWin(scene: DockerScene, check: (c: DockerCtx) => boolean, depth: number): DockerAction[] | null {
  return shortestWin<Host, DockerAction, DockerCtx>({
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

/** Every event of a type across the try-it run, typed. */
export function eventsOf<T extends import("../../engine/docker").DockerEvent["type"]>(ctx: DockerCtx, type: T) {
  return ctx.events.flat().filter((e): e is Extract<import("../../engine/docker").DockerEvent, { type: T }> => e.type === type);
}
