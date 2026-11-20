import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { ciShell } from "../../engine/cli";
import { replayDesk, type Desk, type DeskAction } from "../../engine/desk";
import type { DeskCtx } from "./ci";
import { shortestWin } from "@lets-explain/core/lib/missionSearch";
import { simulateWith, type Ctx, type SimScene } from "./SimScene";

/** The mission context for a list of moves from the try-it step's start. */
export function ctxFor<S, A, E>(scene: SimScene<S, A, E>, actions: A[]): Ctx<S, A, E> {
  const r = simulateWith(scene.sim, actions, scene.sandboxStart);
  return { start: scene.sandboxStart, state: r.states[r.states.length - 1]!, actions, events: r.events, states: r.states };
}

/** The shortest win within `depth` moves, using exactly the buttons the try-it step enables. */
export function searchWin<S, A, E>(scene: SimScene<S, A, E>, check: (c: Ctx<S, A, E>) => boolean, depth: number): A[] | null {
  return shortestWin<S, A, Ctx<S, A, E>>({
    start: scene.sandboxStart,
    moves: (state, history) => scene.moves(state, history),
    step: (state, move) => scene.sim.apply(state, move).state,
    context: (start, history, states) => {
      const r = simulateWith(scene.sim, history, start);
      void states;
      return { start, state: r.states[r.states.length - 1]!, actions: history, events: r.events, states: r.states };
    },
    check,
    depth,
  });
}

/**
 * Plays moves that may depend on the state (a toggle reads the current config), returning
 * the concrete actions, so a test can check them against the enabled buttons.
 */
export function play<S, A, E>(scene: SimScene<S, A, E>, moves: (A | ((s: S) => A))[]): A[] {
  let s = scene.sandboxStart;
  return moves.map((m) => {
    const a = typeof m === "function" ? (m as (x: S) => A)(s) : m;
    s = scene.sim.apply(s, a).state;
    return a;
  });
}

/** The standard checks every lesson's mission test runs. */
export function missionSuite<S, A, E>(
  scene: SimScene<S, A, E>,
  missions: { id: string; par: number; check: (c: Ctx<S, A, E>) => boolean }[],
  solutions: Record<string, (A | ((s: S) => A))[]>,
  t: { it: (name: string, fn: () => void) => void; expect: (v: unknown, msg?: string) => any },
) {
  t.it("no mission is won before any move", () => {
    for (const m of missions) t.expect(m.check(ctxFor(scene, [])), m.id).toBe(false);
  });
  for (const m of missions) {
    t.it(`${m.id}: the intended solution uses only enabled buttons and wins in exactly par moves`, () => {
      const actions = play(scene, solutions[m.id]!);
      t.expect(actions).toHaveLength(m.par);
      actions.forEach((a, i) => {
        const before = ctxFor(scene, actions.slice(0, i));
        t.expect(scene.moves(before.state, actions.slice(0, i)), `${m.id} move ${i}`).toContainEqual(a);
      });
      t.expect(m.check(ctxFor(scene, actions))).toBe(true);
    });
    t.it(`${m.id}: nothing shorter than par wins`, () => {
      t.expect(searchWin(scene, m.check, m.par - 1)).toBeNull();
    });
  }
}

/* -------------------------------------------------------------- scenarios */

/**
 * Types command lines into a CI scenario the way a reader would, saving each editor a command
 * opens with the next of `edits`. Returns what the scenario's check sees and the commands counted.
 */
export function typeInto(start: Desk, typed: string[], edits: ((text: string) => string)[] = []): { ctx: DeskCtx; moves: number; output: string[] } {
  const apply = (d: Desk, actions: DeskAction[]) => replayDesk(d, actions).states.at(-1)!;
  const r = typeLines(ciShell, apply, start, typed, edits);
  const run = replayDesk(start, r.actions);
  return { ctx: { start, state: run.states.at(-1)!, actions: r.actions, events: run.events, states: run.states }, moves: r.moves, output: r.output };
}
