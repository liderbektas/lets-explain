import { apply, createCluster } from "../../engine/cluster";
import { tp, type Action, type ClusterState, type Group, type SimEvent } from "../../engine/types";
import type { StageLane } from "../../iso/TopicStage";

/**
 * Helpers shared by the multi-partition lessons (topics, keys, groups).
 * A sandbox "move" is one button press, which may run several engine actions.
 */

export interface MoveRun {
  /** State after each move; states[0] is the start. */
  states: ClusterState[];
  /** Events of each move, concatenated over its actions. */
  events: SimEvent[][];
}

export function runMoves(start: ClusterState, moves: Action[][]): MoveRun {
  const states = [start];
  const events: SimEvent[][] = [];
  let state = start;
  for (const move of moves) {
    const evs: SimEvent[] = [];
    for (const action of move) {
      const r = apply(state, action);
      state = r.state;
      evs.push(...r.events);
    }
    states.push(state);
    events.push(evs);
  }
  return { states, events };
}

/** Runs setup actions on a fresh cluster and returns the resulting state. Never throws. */
export function stateAfter(actions: Action[], brokers = 1): ClusterState {
  let state = createCluster({ brokers });
  for (const a of actions) state = apply(state, a).state;
  return state;
}

/** Where a member would read next on a partition, even before its first poll. */
export function displayPosition(state: ClusterState, group: Group, topic: string, partition: number, memberId: string) {
  const member = group.members.find((m) => m.id === memberId);
  const p = state.topics[topic]?.partitions[partition];
  if (!member || !p) return undefined;
  const key = tp(topic, partition);
  const known = member.positions[key];
  if (known !== undefined) return Math.max(known, p.logStartOffset);
  const committed = group.committed[key];
  if (committed !== undefined && committed >= p.logStartOffset) return committed;
  return group.autoOffsetReset === "earliest" ? p.logStartOffset : p.logEndOffset;
}

/** The lanes a member owns, for the stage. */
export function lanesOf(state: ClusterState, groupId: string, memberId: string, topic: string): StageLane[] {
  const group = state.groups[groupId];
  const member = group?.members.find((m) => m.id === memberId);
  if (!group || !member) return [];
  return member.assigned
    .filter((t) => t.startsWith(`${topic}-`))
    .map((t) => {
      const partition = Number(t.slice(t.lastIndexOf("-") + 1));
      return {
        partition,
        position: displayPosition(state, group, topic, partition, memberId),
        committed: group.committed[t],
      };
    });
}

/** Records written but not yet read by the group, using each owner's position (like the consumer's records-lag metric). */
export function waiting(state: ClusterState, groupId: string, topic: string): number {
  const group = state.groups[groupId];
  const t = state.topics[topic];
  if (!group || !t) return 0;
  let total = 0;
  for (const p of t.partitions) {
    const key = tp(topic, p.index);
    const owner = group.members.find((m) => m.assigned.includes(key));
    const at = owner
      ? displayPosition(state, group, topic, p.index, owner.id)!
      : Math.max(group.committed[key] ?? (group.autoOffsetReset === "earliest" ? p.logStartOffset : p.logEndOffset), p.logStartOffset);
    total += Math.max(0, p.logEndOffset - at);
  }
  return total;
}

/** Offsets delivered in a list of events, as "P:offset" strings. */
export function deliveredIn(events: SimEvent[], groupId?: string): string[] {
  return events.flatMap((e) =>
    e.type === "delivered" && (!groupId || e.group === groupId) ? [`${e.tp.slice(e.tp.lastIndexOf("-") + 1)}:${e.offset}`] : [],
  );
}

/** Exhaustive search used by mission tests: the shortest move list (up to `depth`) that passes `check`. */
export function shortestWin<C>(
  start: ClusterState,
  movesIn: (state: ClusterState, history: Action[][]) => Action[][],
  ctxOf: (start: ClusterState, run: MoveRun, moves: Action[][]) => C,
  check: (ctx: C) => boolean,
  depth: number,
): Action[][] | null {
  // Breadth-first by depth so the first hit is the shortest.
  for (let d = 1; d <= depth; d++) {
    const found = walk(start, [], { states: [start], events: [] }, d, movesIn, ctxOf, check);
    if (found) return found;
  }
  return null;
}

function walk<C>(
  start: ClusterState,
  moves: Action[][],
  run: MoveRun,
  depth: number,
  movesIn: (state: ClusterState, history: Action[][]) => Action[][],
  ctxOf: (start: ClusterState, run: MoveRun, moves: Action[][]) => C,
  check: (ctx: C) => boolean,
): Action[][] | null {
  if (moves.length === depth) return check(ctxOf(start, run, moves)) ? moves : null;
  const state = run.states[run.states.length - 1]!;
  for (const move of movesIn(state, moves)) {
    const next = runMoves(state, [move]);
    const r: MoveRun = { states: [...run.states, next.states[1]!], events: [...run.events, next.events[0]!] };
    const found = walk(start, [...moves, move], r, depth, movesIn, ctxOf, check);
    if (found) return found;
  }
  return null;
}

/** What a mission in a multi-partition sandbox can look at. */
export interface TopicCtx {
  start: ClusterState;
  state: ClusterState;
  /** One entry per button press. */
  moves: Action[][];
  /** Events of each press. */
  events: SimEvent[][];
}

export const topicCtx = (start: ClusterState, run: MoveRun, moves: Action[][]): TopicCtx => ({
  start,
  state: run.states[run.states.length - 1]!,
  moves,
  events: run.events,
});
