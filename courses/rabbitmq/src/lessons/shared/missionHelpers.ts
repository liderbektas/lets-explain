import { shortestWin } from "@lets-explain/core/lib/missionSearch";
import { apply, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import type { BrokerCtx, BrokerScene } from "./BrokerScene";

/** The mission context for a list of moves from the try-it step's start. */
export function ctxFor(scene: BrokerScene, actions: BrokerAction[]): BrokerCtx {
  const r = simulate(actions, scene.sandboxStart);
  return { start: scene.sandboxStart, state: r.states[r.states.length - 1]!, actions, events: r.events, states: r.states };
}

/** The shortest win within `depth` moves, using exactly the buttons the try-it step enables. */
export function searchWin(scene: BrokerScene, check: (c: BrokerCtx) => boolean, depth: number): BrokerAction[] | null {
  return shortestWin<Broker, BrokerAction, BrokerCtx>({
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
export function eventsOf<T extends import("../../engine/broker").BrokerEvent["type"]>(ctx: BrokerCtx, type: T) {
  return ctx.events.flat().filter((e): e is Extract<import("../../engine/broker").BrokerEvent, { type: T }> => e.type === type);
}

/** Messages lost during the try-it step (not already lost when it started). */
export function lostSince(ctx: BrokerCtx) {
  return ctx.state.lost.slice(ctx.start.lost.length);
}
