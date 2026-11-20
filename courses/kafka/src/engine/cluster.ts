import { partitionForKey } from "./murmur2";
import {
  tp,
  type Action,
  type ClusterState,
  type Group,
  type Member,
  type Partition,
  type SimEvent,
  type StepResult,
  type TP,
} from "./types";

/**
 * A small, deterministic Kafka model for teaching. The same actions always give
 * the same result, which is what lets lessons rewind and compare runs.
 *
 * Simplifications (each lesson that relies on one says so in a "Gerçekte" note):
 * - Records without a key go round-robin. Real producers use the sticky partitioner,
 *   which fills a batch for one partition before moving on.
 * - A crashed member leaves the group at once. Real brokers wait for session.timeout.ms.
 * - Assignment is the range strategy, recomputed from scratch on every rebalance.
 */

export function createCluster(opts: { brokers?: number } = {}): ClusterState {
  const count = opts.brokers ?? 1;
  return {
    time: 0,
    brokers: Array.from({ length: count }, (_, i) => ({ id: i + 1, alive: true })),
    topics: {},
    groups: {},
    roundRobin: {},
  };
}

export function apply(prev: ClusterState, action: Action): StepResult {
  const state = structuredClone(prev);
  state.time += 1;
  const events: SimEvent[] = [];
  const fail = (message: string): StepResult => ({
    state: prev,
    events: [{ type: "error", message }],
  });

  switch (action.type) {
    case "createTopic": {
      if (state.topics[action.name]) return fail(`Topic "${action.name}" already exists`);
      if (action.partitions < 1) return fail("A topic needs at least one partition");
      const alive = state.brokers.filter((b) => b.alive);
      if (alive.length === 0) return fail("No broker is alive");
      state.topics[action.name] = {
        name: action.name,
        partitions: Array.from({ length: action.partitions }, (_, i) => ({
          topic: action.name,
          index: i,
          leader: alive[i % alive.length]!.id,
          logStartOffset: 0,
          logEndOffset: 0,
          records: [],
        })),
      };
      events.push({ type: "topicCreated", topic: action.name, partitions: action.partitions });
      for (const group of Object.values(state.groups)) {
        if (group.topics.includes(action.name)) rebalance(state, group, events);
      }
      break;
    }

    case "produce": {
      const topic = state.topics[action.topic];
      if (!topic) return fail(`Topic "${action.topic}" does not exist`);
      const n = topic.partitions.length;
      const key = action.key ?? null;
      let index: number;
      let routedBy: "key" | "round-robin" | "explicit";
      if (action.partition !== undefined) {
        if (action.partition < 0 || action.partition >= n) {
          return fail(`Partition ${action.partition} does not exist`);
        }
        index = action.partition;
        routedBy = "explicit";
      } else if (key !== null) {
        index = partitionForKey(key, n);
        routedBy = "key";
      } else {
        const cursor = state.roundRobin[topic.name] ?? 0;
        index = cursor % n;
        state.roundRobin[topic.name] = cursor + 1;
        routedBy = "round-robin";
      }
      const partition = topic.partitions[index]!;
      const offset = partition.logEndOffset;
      const producer = action.producer ?? "producer";
      partition.records.push({ offset, key, value: action.value, producer, time: state.time });
      partition.logEndOffset = offset + 1;
      events.push({
        type: "produced",
        topic: topic.name,
        partition: index,
        offset,
        key,
        value: action.value,
        producer,
        routedBy,
      });
      break;
    }

    case "joinGroup": {
      for (const name of action.topics) {
        if (!state.topics[name]) return fail(`Topic "${name}" does not exist`);
      }
      let group = state.groups[action.group];
      if (!group) {
        group = {
          id: action.group,
          topics: [...action.topics],
          members: [],
          committed: {},
          generation: 0,
          autoOffsetReset: action.autoOffsetReset ?? "latest",
          deliveries: [],
          skipped: 0,
        };
        state.groups[action.group] = group;
      } else {
        for (const name of action.topics) {
          if (!group.topics.includes(name)) group.topics.push(name);
        }
      }
      if (group.members.some((m) => m.id === action.member)) {
        return fail(`"${action.member}" is already in group "${action.group}"`);
      }
      group.members.push({ id: action.member, assigned: [], positions: {} });
      events.push({ type: "memberJoined", group: group.id, member: action.member });
      rebalance(state, group, events);
      break;
    }

    case "leaveGroup":
    case "crashMember": {
      const group = state.groups[action.group];
      const member = group?.members.find((m) => m.id === action.member);
      if (!group || !member) return fail(`"${action.member}" is not in group "${action.group}"`);
      const uncommitted = member.assigned
        .filter((p) => member.positions[p] !== undefined && member.positions[p] !== group.committed[p])
        .map((p) => ({ tp: p, committed: group.committed[p] ?? null, position: member.positions[p]! }));
      group.members = group.members.filter((m) => m.id !== member.id);
      events.push({
        type: "memberLeft",
        group: group.id,
        member: member.id,
        crashed: action.type === "crashMember",
        uncommitted,
      });
      rebalance(state, group, events);
      break;
    }

    case "poll": {
      const group = state.groups[action.group];
      const member = group?.members.find((m) => m.id === action.member);
      if (!group || !member) return fail(`"${action.member}" is not in group "${action.group}"`);
      const max = action.max ?? 500;
      let delivered = 0;
      // Walk partitions in turn so one busy partition cannot starve the others.
      let progress = true;
      while (delivered < max && progress) {
        progress = false;
        for (const p of member.assigned) {
          if (delivered >= max) break;
          const partition = findPartition(state, p)!;
          const position = ensurePosition(group, member, partition, events);
          const record = partition.records.find((r) => r.offset >= position);
          if (!record) continue;
          const duplicate = group.deliveries.some((d) => d.tp === p && d.offset === record.offset);
          group.deliveries.push({ tp: p, offset: record.offset, member: member.id, time: state.time });
          member.positions[p] = record.offset + 1;
          events.push({
            type: "delivered",
            group: group.id,
            member: member.id,
            tp: p,
            offset: record.offset,
            duplicate,
          });
          delivered += 1;
          progress = true;
        }
      }
      if (delivered === 0) events.push({ type: "pollEmpty", group: group.id, member: member.id });
      break;
    }

    case "commit": {
      const group = state.groups[action.group];
      const member = group?.members.find((m) => m.id === action.member);
      if (!group || !member) return fail(`"${action.member}" is not in group "${action.group}"`);
      const offsets: Record<TP, number> = {};
      for (const p of member.assigned) {
        const position = member.positions[p];
        if (position === undefined) continue;
        group.committed[p] = position;
        offsets[p] = position;
      }
      events.push({ type: "committed", group: group.id, member: member.id, offsets });
      break;
    }

    case "seek": {
      const group = state.groups[action.group];
      const member = group?.members.find((m) => m.id === action.member);
      if (!group || !member) return fail(`"${action.member}" is not in group "${action.group}"`);
      if (!member.assigned.includes(action.tp)) {
        return fail(`"${action.member}" is not assigned ${action.tp}`);
      }
      const partition = findPartition(state, action.tp)!;
      const from = ensurePosition(group, member, partition, events);
      member.positions[action.tp] = action.offset;
      events.push({
        type: "seeked",
        group: group.id,
        member: member.id,
        tp: action.tp,
        from,
        to: action.offset,
      });
      break;
    }

    case "addPartitions": {
      const topic = state.topics[action.topic];
      if (!topic) return fail(`Topic "${action.topic}" does not exist`);
      const from = topic.partitions.length;
      if (action.count <= from) return fail("Partitions can only be added, never removed");
      const alive = state.brokers.filter((b) => b.alive);
      if (alive.length === 0) return fail("No broker is alive");
      for (let i = from; i < action.count; i++) {
        topic.partitions.push({
          topic: topic.name,
          index: i,
          leader: alive[i % alive.length]!.id,
          logStartOffset: 0,
          logEndOffset: 0,
          records: [],
        });
      }
      events.push({ type: "partitionsAdded", topic: topic.name, from, to: action.count });
      for (const group of Object.values(state.groups)) {
        if (group.topics.includes(topic.name)) rebalance(state, group, events);
      }
      break;
    }

    case "resetOffsets": {
      const group = state.groups[action.group];
      if (!group) return fail(`Group "${action.group}" does not exist`);
      if (group.members.length > 0) return fail(`Assignments can only be reset if the group '${group.id}' is inactive`);
      const offsets: Record<TP, { from: number | null; to: number }> = {};
      for (const [p, offset] of Object.entries(action.offsets)) {
        const partition = findPartition(state, p);
        if (!partition) return fail(`${p} does not exist`);
        const to = Math.max(partition.logStartOffset, Math.min(offset, partition.logEndOffset));
        offsets[p] = { from: group.committed[p] ?? null, to };
        group.committed[p] = to;
      }
      events.push({ type: "offsetsReset", group: group.id, offsets });
      break;
    }

    case "deleteRecordsBefore": {
      const partition = state.topics[action.topic]?.partitions[action.partition];
      if (!partition) return fail(`${tp(action.topic, action.partition)} does not exist`);
      const to = Math.min(action.offset, partition.logEndOffset);
      const from = partition.logStartOffset;
      if (to <= from) break;
      const p = tp(action.topic, action.partition);
      // Count what each group loses: records it had not read yet.
      for (const group of Object.values(state.groups)) {
        if (!group.topics.includes(action.topic)) continue;
        const owner = group.members.find((m) => m.assigned.includes(p));
        const next = owner?.positions[p] ?? group.committed[p];
        if (next !== undefined && next < to) group.skipped += to - Math.max(next, from);
      }
      partition.records = partition.records.filter((r) => r.offset >= to);
      partition.logStartOffset = to;
      events.push({ type: "recordsDeleted", topic: action.topic, partition: action.partition, from, to });
      break;
    }
  }

  return { state, events };
}

/** Runs actions in order and keeps every intermediate state, so a view can rewind. */
export function simulate(
  actions: Action[],
  start: ClusterState = createCluster(),
): { states: ClusterState[]; events: SimEvent[][] } {
  const states = [start];
  const events: SimEvent[][] = [];
  let current = start;
  for (const action of actions) {
    const result = apply(current, action);
    current = result.state;
    states.push(current);
    events.push(result.events);
  }
  return { states, events };
}

export function findPartition(state: ClusterState, p: TP): Partition | undefined {
  const dash = p.lastIndexOf("-");
  const topic = state.topics[p.slice(0, dash)];
  return topic?.partitions[Number(p.slice(dash + 1))];
}

/** Where a member starts reading a partition when it has no position in memory. */
function ensurePosition(group: Group, member: Member, partition: Partition, events: SimEvent[]): number {
  const p = tp(partition.topic, partition.index);
  const known = member.positions[p];
  if (known !== undefined && known >= partition.logStartOffset) return known;

  const committed = group.committed[p];
  let reason: "no-commit" | "out-of-range";
  let from: number | null;
  if (known !== undefined) {
    // Our position points at records retention already deleted.
    from = known;
    reason = "out-of-range";
  } else if (committed !== undefined && committed >= partition.logStartOffset) {
    member.positions[p] = committed;
    return committed;
  } else {
    from = committed ?? null;
    reason = committed === undefined ? "no-commit" : "out-of-range";
  }
  // auto.offset.reset decides where to go when there is no valid offset.
  const to = group.autoOffsetReset === "earliest" ? partition.logStartOffset : partition.logEndOffset;
  member.positions[p] = to;
  events.push({ type: "positionReset", group: group.id, member: member.id, tp: p, from, to, reason });
  return to;
}

/** Range assignment: per topic, sorted members get contiguous slices of partitions. */
function rebalance(state: ClusterState, group: Group, events: SimEvent[]) {
  group.generation += 1;
  const members = [...group.members].sort((a, b) => a.id.localeCompare(b.id));
  const assignment: Record<string, TP[]> = Object.fromEntries(members.map((m) => [m.id, []]));

  for (const name of group.topics) {
    const topic = state.topics[name];
    if (!topic || members.length === 0) continue;
    const n = topic.partitions.length;
    const per = Math.floor(n / members.length);
    const extra = n % members.length;
    let next = 0;
    members.forEach((m, i) => {
      const count = per + (i < extra ? 1 : 0);
      for (let k = 0; k < count; k++) assignment[m.id]!.push(tp(name, next++));
    });
  }

  for (const member of group.members) {
    member.assigned = assignment[member.id] ?? [];
    // Positions are not handed over: the new owner starts from the committed offset.
    member.positions = {};
  }
  events.push({ type: "rebalanced", group: group.id, generation: group.generation, assignment });
}

export interface GroupStats {
  delivered: number;
  unique: number;
  duplicates: number;
  skipped: number;
  /** Records written but not yet committed by the group, summed over partitions. */
  lag: number;
}

export function groupStats(state: ClusterState, groupId: string): GroupStats {
  const group = state.groups[groupId];
  if (!group) return { delivered: 0, unique: 0, duplicates: 0, skipped: 0, lag: 0 };
  const seen = new Set(group.deliveries.map((d) => `${d.tp}@${d.offset}`));
  let lag = 0;
  for (const name of group.topics) {
    for (const partition of state.topics[name]?.partitions ?? []) {
      const committed = group.committed[tp(name, partition.index)] ?? partition.logStartOffset;
      lag += Math.max(0, partition.logEndOffset - Math.max(committed, partition.logStartOffset));
    }
  }
  return {
    delivered: group.deliveries.length,
    unique: seen.size,
    duplicates: group.deliveries.length - seen.size,
    skipped: group.skipped,
    lag,
  };
}
