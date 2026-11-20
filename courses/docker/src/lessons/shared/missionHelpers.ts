import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { shortestWin } from "@lets-explain/core/lib/missionSearch";
import { dockerShell } from "../../engine/cli";
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

/* -------------------------------------------------------------- scenarios */

/** The host after running `actions` from `from` (a fresh machine by default). */
export function hostAfter(actions: DockerAction[], from?: Host): Host {
  const r = simulate(actions, from);
  return r.states[r.states.length - 1]!;
}

/**
 * Types command lines into a scenario the way a reader would, saving each editor a command
 * opens with the next of `edits`. Returns what the scenario's check sees and the commands counted.
 */
export function typeInto(start: Host, typed: string[], edits: ((text: string) => string)[] = []): { ctx: DockerCtx; moves: number; output: string[] } {
  const r = typeLines(dockerShell, (h, actions) => hostAfter(actions, h), start, typed, edits);
  const run = simulate(r.actions, start);
  return { ctx: { start, state: run.states[run.states.length - 1]!, actions: r.actions, events: run.events, states: run.states }, moves: r.moves, output: r.output };
}
