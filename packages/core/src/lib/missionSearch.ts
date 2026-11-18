/**
 * Exhaustive search for mission tests: is there any sequence of at most `depth` moves that
 * completes the mission? Each course gives its own state, moves and check. Returns the
 * shortest winning move list found, or null.
 */
export function shortestWin<S, A, C>(opts: {
  start: S;
  /** The moves the sandbox buttons allow in a state (only enabled buttons). */
  moves: (state: S, history: A[]) => A[];
  step: (state: S, move: A) => S;
  /** Builds the mission context from the start, the moves made and the states they gave. */
  context: (start: S, history: A[], states: S[]) => C;
  check: (ctx: C) => boolean;
  depth: number;
}): A[] | null {
  for (let d = 1; d <= opts.depth; d++) {
    const found = walk(opts, [], [opts.start], d);
    if (found) return found;
  }
  return null;
}

function walk<S, A, C>(
  o: Parameters<typeof shortestWin<S, A, C>>[0],
  history: A[],
  states: S[],
  depth: number,
): A[] | null {
  if (history.length === depth) return o.check(o.context(o.start, history, states)) ? history : null;
  const at = states[states.length - 1]!;
  for (const m of o.moves(at, history)) {
    const next = o.step(at, m);
    if (next === at) continue; // a refused move changes nothing
    const found = walk(o, [...history, m], [...states, next], depth);
    if (found) return found;
  }
  return null;
}
