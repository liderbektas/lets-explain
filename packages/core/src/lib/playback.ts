import { createContext, useContext, useEffect, useState } from "react";

/**
 * While the narrator tells a step, it decides how many of the step's actions have happened, so
 * the scene moves when the words say it does. `null` lets the scene play on its own timer.
 */
export const NarrationCursor = createContext<number | null>(null);

/**
 * Plays a step's actions one at a time: returns how many have happened so far.
 * Starts over whenever `resetKey` changes (a new step, or the replay button).
 * The first frame after a reset is already 0, so nothing flashes the old state.
 */
export function usePlayback(count: number, paused: boolean, resetKey: string, interval = 850): number {
  const forced = useContext(NarrationCursor);
  const [pb, setPb] = useState({ key: resetKey, cursor: 0 });
  const cursor = pb.key === resetKey ? Math.min(pb.cursor, count) : 0;

  useEffect(() => {
    if (paused || cursor >= count) return;
    const id = setTimeout(
      () => setPb((p) => ({ key: resetKey, cursor: (p.key === resetKey ? p.cursor : 0) + 1 })),
      cursor === 0 ? 450 : interval,
    );
    return () => clearTimeout(id);
  }, [cursor, count, paused, resetKey, interval]);

  return forced === null ? cursor : Math.min(forced, count);
}

/**
 * A counter that ticks while not paused; for scenes that loop on their own.
 * Starts again from 0 whenever `resetKey` changes (a new step, or replay).
 */
export function useTicker(active: boolean, paused: boolean, ms = 1000, resetKey = ""): number {
  const [state, setState] = useState({ key: resetKey, tick: 0 });
  const tick = state.key === resetKey ? state.tick : 0;
  useEffect(() => {
    if (!active || paused) return;
    const id = setInterval(
      () => setState((s) => ({ key: resetKey, tick: (s.key === resetKey ? s.tick : 0) + 1 })),
      ms,
    );
    return () => clearInterval(id);
  }, [active, paused, ms, resetKey]);
  return tick;
}
