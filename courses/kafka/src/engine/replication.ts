/**
 * A small, deterministic model of how Kafka keeps copies of a partition on several brokers:
 * leaders and followers, the ISR, the high watermark, acks and leader election.
 *
 * Simplifications (each lesson that relies on one says so in a "Gerçekte" note):
 * - Healthy followers copy the leader at once. Real followers fetch in a loop, a few ms behind.
 * - A crashed broker leaves the ISR at once. Real brokers wait for replica.lag.time.max.ms
 *   (30 s) or the session timeout before the controller acts.
 * - A lagging follower leaves the ISR on a "tick", which stands for replica.lag.time.max.ms passing.
 * - Divergence is found by record identity. Real brokers use leader epochs to find where to truncate.
 * - Offsets start at 0 and nothing is deleted (no retention).
 */

export type Acks = 0 | 1 | "all";

export interface RRecord {
  /** Unique per produce call, so a record can be followed across replicas. */
  id: number;
  offset: number;
  value: string;
  /** Leader epoch the record was written in. */
  epoch: number;
}

export interface RPartition {
  index: number;
  /** Brokers that hold a copy; the first is the preferred leader. */
  replicas: number[];
  leader: number | null;
  /** In-sync replicas, the leader included. */
  isr: number[];
  /** High watermark: records below it are on every ISR member and readable by consumers. */
  hw: number;
  epoch: number;
  logs: Record<number, RRecord[]>;
}

export interface RBroker {
  id: number;
  alive: boolean;
  /** A slow follower stops copying (for example a busy disk or a slow network). */
  slow: boolean;
}

export type SendStatus = "pending" | "acked" | "sent" | "failed" | "lost";

/** One produce call, as the producer sees it. */
export interface Send {
  id: number;
  partition: number;
  value: string;
  acks: Acks;
  status: SendStatus;
  offset: number | null;
  reason?: "offline" | "notEnoughReplicas" | "notEnoughReplicasAfterAppend" | "leaderChanged";
}

export interface ReplicaConfig {
  acks: Acks;
  /** min.insync.replicas: with acks=all, fewer ISR members than this rejects the write. */
  minIsr: number;
  /** unclean.leader.election.enable: allow an out-of-sync replica to become leader. */
  unclean: boolean;
}

export interface RState {
  time: number;
  brokers: RBroker[];
  partitions: RPartition[];
  config: ReplicaConfig;
  sends: Send[];
  nextId: number;
  /** Round-robin cursor for produce calls without a partition. */
  rr: number;
}

export type RAction =
  | { type: "produce"; value: string; partition?: number }
  | { type: "crash"; broker: number }
  | { type: "restart"; broker: number }
  | { type: "setSlow"; broker: number; slow: boolean }
  /** replica.lag.time.max.ms passes: followers still behind leave the ISR. */
  | { type: "tick" }
  | { type: "setAcks"; acks: Acks }
  | { type: "setMinIsr"; value: number }
  | { type: "setUnclean"; value: boolean }
  | { type: "addBroker" }
  /** Move a partition's copies to other brokers (what kafka-reassign-partitions.sh does). */
  | { type: "reassign"; partition: number; replicas: number[] };

export type REvent =
  | { type: "produced"; partition: number; offset: number; leader: number; value: string; acks: Acks }
  | { type: "rejected"; partition: number; value: string; reason: "offline" | "notEnoughReplicas"; isr: number }
  | { type: "acked"; partition: number; offset: number; value: string; acks: Acks }
  | { type: "sendFailed"; partition: number; value: string; reason: "notEnoughReplicasAfterAppend" | "leaderChanged" }
  | { type: "replicated"; partition: number; broker: number; from: number; to: number }
  | { type: "hwAdvanced"; partition: number; from: number; to: number }
  | { type: "brokerDown"; broker: number }
  | { type: "brokerUp"; broker: number }
  | { type: "brokerAdded"; broker: number }
  | { type: "slowChanged"; broker: number; slow: boolean }
  | { type: "isrShrink"; partition: number; broker: number; reason: "crashed" | "lagging" }
  | { type: "isrExpand"; partition: number; broker: number }
  | { type: "leaderElected"; partition: number; from: number | null; to: number; clean: boolean }
  | { type: "offline"; partition: number; leader: number }
  | { type: "truncated"; partition: number; broker: number; from: number; to: number }
  | { type: "lost"; partition: number; offset: number; value: string }
  | { type: "reassigned"; partition: number; from: number[]; to: number[] }
  | { type: "configChanged"; key: "acks" | "minIsr" | "unclean"; value: string }
  | { type: "error"; message: string };

export interface RResult {
  state: RState;
  events: REvent[];
}

export interface ReplicaSetup {
  brokers: number;
  /** Replica lists per partition, preferred leader first. Broker ids start at 1. */
  partitions: number[][];
  config?: Partial<ReplicaConfig>;
}

export function createReplicated(setup: ReplicaSetup): RState {
  return {
    time: 0,
    brokers: Array.from({ length: setup.brokers }, (_, i) => ({ id: i + 1, alive: true, slow: false })),
    partitions: setup.partitions.map((replicas, index) => ({
      index,
      replicas: [...replicas],
      leader: replicas[0] ?? null,
      isr: [...replicas],
      hw: 0,
      epoch: 0,
      logs: Object.fromEntries(replicas.map((b) => [b, []])),
    })),
    config: { acks: "all", minIsr: 1, unclean: false, ...setup.config },
    sends: [],
    nextId: 1,
    rr: 0,
  };
}

const broker = (s: RState, id: number) => s.brokers.find((b) => b.id === id);
const isAlive = (s: RState, id: number) => broker(s, id)?.alive ?? false;
const leo = (p: RPartition, b: number) => p.logs[b]?.length ?? 0;

export function applyReplicated(prev: RState, action: RAction): RResult {
  const s = structuredClone(prev);
  s.time += 1;
  const events: REvent[] = [];
  const fail = (message: string): RResult => ({ state: prev, events: [{ type: "error", message }] });

  switch (action.type) {
    case "produce": {
      const index = action.partition ?? s.rr % s.partitions.length;
      if (action.partition === undefined) s.rr += 1;
      const p = s.partitions[index];
      if (!p) return fail(`Partition ${index} does not exist`);
      const acks = s.config.acks;
      const id = s.nextId++;
      const send: Send = { id, partition: index, value: action.value, acks, status: "pending", offset: null };
      s.sends.push(send);

      if (p.leader === null) {
        // With acks=0 the producer never hears back, so it believes the write went through.
        if (acks === 0) send.status = "lost";
        else {
          send.status = "failed";
          send.reason = "offline";
        }
        events.push({ type: "rejected", partition: index, value: action.value, reason: "offline", isr: p.isr.length });
        break;
      }
      if (acks === "all" && p.isr.length < s.config.minIsr) {
        send.status = "failed";
        send.reason = "notEnoughReplicas";
        events.push({ type: "rejected", partition: index, value: action.value, reason: "notEnoughReplicas", isr: p.isr.length });
        break;
      }
      const log = p.logs[p.leader]!;
      const offset = log.length;
      log.push({ id, offset, value: action.value, epoch: p.epoch });
      send.offset = offset;
      events.push({ type: "produced", partition: index, offset, leader: p.leader, value: action.value, acks });
      if (acks === 0) send.status = "sent";
      else if (acks === 1) {
        send.status = "acked";
        events.push({ type: "acked", partition: index, offset, value: action.value, acks });
      }
      break;
    }

    case "crash": {
      const b = broker(s, action.broker);
      if (!b) return fail(`Broker ${action.broker} does not exist`);
      if (!b.alive) return fail(`Broker ${action.broker} is already down`);
      b.alive = false;
      events.push({ type: "brokerDown", broker: b.id });
      for (const p of s.partitions) {
        if (!p.replicas.includes(b.id)) continue;
        if (p.leader === b.id) electLeader(s, p, events);
        else if (p.isr.includes(b.id)) {
          p.isr = p.isr.filter((x) => x !== b.id);
          events.push({ type: "isrShrink", partition: p.index, broker: b.id, reason: "crashed" });
        }
      }
      break;
    }

    case "restart": {
      const b = broker(s, action.broker);
      if (!b) return fail(`Broker ${action.broker} does not exist`);
      if (b.alive) return fail(`Broker ${action.broker} is already up`);
      b.alive = true;
      b.slow = false;
      events.push({ type: "brokerUp", broker: b.id });
      for (const p of s.partitions) {
        if (!p.replicas.includes(b.id) || p.leader !== null) continue;
        // An offline partition comes back when its last in-sync replica returns,
        // or, if unclean election is allowed, when any replica does.
        if (p.isr.includes(b.id)) {
          setLeader(s, p, b.id, true, events);
        } else if (s.config.unclean) {
          setLeader(s, p, b.id, false, events);
        }
      }
      break;
    }

    case "setSlow": {
      const b = broker(s, action.broker);
      if (!b || !b.alive) return fail(`Broker ${action.broker} is not running`);
      if (b.slow === action.slow) return fail("Nothing to change");
      b.slow = action.slow;
      events.push({ type: "slowChanged", broker: b.id, slow: b.slow });
      break;
    }

    case "tick": {
      for (const p of s.partitions) {
        if (p.leader === null) continue;
        const end = leo(p, p.leader);
        for (const f of [...p.isr]) {
          if (f === p.leader) continue;
          if (leo(p, f) < end) {
            p.isr = p.isr.filter((x) => x !== f);
            events.push({ type: "isrShrink", partition: p.index, broker: f, reason: "lagging" });
          }
        }
      }
      break;
    }

    case "setAcks":
      if (s.config.acks === action.acks) return fail("Nothing to change");
      s.config.acks = action.acks;
      events.push({ type: "configChanged", key: "acks", value: String(action.acks) });
      break;

    case "setMinIsr":
      if (action.value < 1) return fail("min.insync.replicas is at least 1");
      if (s.config.minIsr === action.value) return fail("Nothing to change");
      s.config.minIsr = action.value;
      events.push({ type: "configChanged", key: "minIsr", value: String(action.value) });
      break;

    case "setUnclean":
      if (s.config.unclean === action.value) return fail("Nothing to change");
      s.config.unclean = action.value;
      events.push({ type: "configChanged", key: "unclean", value: String(action.value) });
      // Turning it on lets an offline partition elect any live replica right away.
      if (action.value) {
        for (const p of s.partitions) {
          if (p.leader !== null) continue;
          const candidate = p.replicas.find((r) => isAlive(s, r));
          if (candidate !== undefined) setLeader(s, p, candidate, false, events);
        }
      }
      break;

    case "addBroker": {
      const id = Math.max(0, ...s.brokers.map((b) => b.id)) + 1;
      s.brokers.push({ id, alive: true, slow: false });
      events.push({ type: "brokerAdded", broker: id });
      break;
    }

    case "reassign": {
      const p = s.partitions[action.partition];
      if (!p) return fail(`Partition ${action.partition} does not exist`);
      if (action.replicas.length === 0) return fail("A partition needs at least one replica");
      if (action.replicas.some((r) => !broker(s, r))) return fail("Unknown broker");
      if (p.leader === null) return fail("The partition is offline: there is no leader to copy from");
      if (action.replicas.some((r) => !isAlive(s, r))) return fail("A target broker is down");
      const from = [...p.replicas];
      const source = p.logs[p.leader]!;
      for (const r of action.replicas) {
        if (!p.replicas.includes(r)) p.logs[r] = source.map((x) => ({ ...x }));
      }
      for (const r of from) if (!action.replicas.includes(r)) delete p.logs[r];
      p.replicas = [...action.replicas];
      p.isr = p.replicas.filter((r) => isAlive(s, r) && leo(p, r) === source.length);
      events.push({ type: "reassigned", partition: p.index, from, to: [...p.replicas] });
      if (!p.replicas.includes(p.leader)) setLeader(s, p, p.replicas[0]!, true, events);
      break;
    }
  }

  for (const p of s.partitions) sync(s, p, events);
  return { state: s, events };
}

/** Picks a new leader after the current one went down. */
function electLeader(s: RState, p: RPartition, events: REvent[]) {
  const old = p.leader!;
  const others = p.isr.filter((r) => r !== old && isAlive(s, r));
  const clean = p.replicas.find((r) => others.includes(r));
  if (clean !== undefined) {
    p.isr = p.isr.filter((r) => r !== old);
    setLeader(s, p, clean, true, events);
    return;
  }
  if (s.config.unclean) {
    const any = p.replicas.find((r) => r !== old && isAlive(s, r));
    if (any !== undefined) {
      setLeader(s, p, any, false, events);
      return;
    }
  }
  // No one in sync is left: Kafka keeps the last ISR member and waits for it to return.
  p.leader = null;
  events.push({ type: "offline", partition: p.index, leader: old });
}

function setLeader(s: RState, p: RPartition, to: number, clean: boolean, events: REvent[]) {
  const from = p.leader;
  p.leader = to;
  p.epoch += 1;
  if (!clean) p.isr = [to];
  else if (!p.isr.includes(to)) p.isr = [...p.isr, to];
  // An unclean leader may be missing records below the old high watermark.
  if (!clean) p.hw = Math.min(p.hw, leo(p, to));
  events.push({ type: "leaderElected", partition: p.index, from, to, clean });

  // Writes still waiting for replicas fail when leadership moves; the producer would retry.
  for (const send of s.sends) {
    if (send.partition === p.index && send.status === "pending") {
      send.status = "failed";
      send.reason = "leaderChanged";
      events.push({ type: "sendFailed", partition: p.index, value: send.value, reason: "leaderChanged" });
    }
  }
}

/** Followers catch up, the ISR and high watermark move, acks=all writes complete, losses show. */
function sync(s: RState, p: RPartition, events: REvent[]) {
  if (p.leader === null) return;
  const leaderLog = p.logs[p.leader]!;

  for (const r of p.replicas) {
    if (r === p.leader) continue;
    const b = broker(s, r);
    if (!b?.alive || b.slow) continue;
    const log = p.logs[r]!;
    // Cut the follower back to where it last agreed with the leader, then copy the rest.
    let same = 0;
    while (same < log.length && same < leaderLog.length && log[same]!.id === leaderLog[same]!.id) same++;
    if (same < log.length) {
      events.push({ type: "truncated", partition: p.index, broker: r, from: same, to: log.length });
      log.length = same;
    }
    if (log.length < leaderLog.length) {
      const from = log.length;
      for (let i = from; i < leaderLog.length; i++) log.push({ ...leaderLog[i]! });
      events.push({ type: "replicated", partition: p.index, broker: r, from, to: leaderLog.length });
    }
    if (!p.isr.includes(r)) {
      p.isr = p.replicas.filter((x) => x === r || p.isr.includes(x));
      events.push({ type: "isrExpand", partition: p.index, broker: r });
    }
  }

  const hw = Math.min(...p.isr.map((r) => leo(p, r)));
  if (hw > p.hw) {
    events.push({ type: "hwAdvanced", partition: p.index, from: p.hw, to: hw });
    p.hw = hw;
  } else if (hw < p.hw) {
    p.hw = hw;
  }

  for (const send of s.sends) {
    if (send.partition !== p.index || send.status !== "pending" || send.offset === null) continue;
    if (send.offset < p.hw) {
      if (p.isr.length < s.config.minIsr) {
        send.status = "failed";
        send.reason = "notEnoughReplicasAfterAppend";
        events.push({ type: "sendFailed", partition: p.index, value: send.value, reason: "notEnoughReplicasAfterAppend" });
      } else {
        send.status = "acked";
        events.push({ type: "acked", partition: p.index, offset: send.offset, value: send.value, acks: send.acks });
      }
    }
  }

  // A write the producer was told about is lost if the leader no longer has it.
  const present = new Set(leaderLog.map((r) => r.id));
  for (const send of s.sends) {
    if (send.partition !== p.index) continue;
    if ((send.status === "acked" || send.status === "sent") && !present.has(send.id)) {
      send.status = "lost";
      events.push({ type: "lost", partition: p.index, offset: send.offset ?? -1, value: send.value });
    }
  }
}

export function simulateReplicated(actions: RAction[], start: RState): { states: RState[]; events: REvent[][] } {
  const states = [start];
  const events: REvent[][] = [];
  let current = start;
  for (const a of actions) {
    const r = applyReplicated(current, a);
    current = r.state;
    states.push(current);
    events.push(r.events);
  }
  return { states, events };
}

/** Counts for the scene's top bar. */
export function sendStats(s: RState) {
  const by = (st: SendStatus) => s.sends.filter((x) => x.status === st).length;
  return { acked: by("acked") + by("sent"), pending: by("pending"), failed: by("failed"), lost: by("lost") };
}

export const leaderLog = (p: RPartition) => (p.leader === null ? [] : p.logs[p.leader]!);
