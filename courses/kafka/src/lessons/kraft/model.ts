import { buildRun, type ControlRow, type Model, type SandboxCtx } from "../cluster-kit/kit";

/**
 * A small model of KRaft: three controllers keep the cluster's metadata log with Raft.
 * One is active; a change is committed once a majority has it. Brokers follow the log.
 *
 * Simplifications (said in the lesson's "Gerçekte" notes):
 * - A broker's missed heartbeats are noticed at once (really broker.session.timeout.ms, 9 s).
 * - Elections pick the live controller with the longest log, lowest id on a tie.
 * - Partition leaders move to the next live broker in replica order, ignoring the ISR.
 */

export type MetaRecord =
  | { kind: "register"; broker: number }
  | { kind: "fence"; broker: number }
  | { kind: "unfence"; broker: number }
  | { kind: "leader"; partition: number; from: number | null; to: number | null }
  | { kind: "topic"; name: string };

export interface Controller {
  id: number;
  alive: boolean;
  log: MetaRecord[];
}

export interface KBroker {
  id: number;
  alive: boolean;
  /** Fenced brokers are not given any partition leadership. */
  fenced: boolean;
  /** How far into the metadata log this broker has applied. */
  applied: number;
}

export interface KPartition {
  index: number;
  replicas: number[];
  leader: number | null;
}

export interface KState {
  controllers: Controller[];
  active: number | null;
  epoch: number;
  committed: number;
  brokers: KBroker[];
  partitions: KPartition[];
  topics: string[];
}

export type KAction =
  | { type: "crashController"; id: number }
  | { type: "restartController"; id: number }
  | { type: "crashBroker"; id: number }
  | { type: "restartBroker"; id: number }
  | { type: "createTopic"; name: string };

export type KEvent =
  | { type: "controllerDown"; id: number; wasActive: boolean }
  | { type: "controllerUp"; id: number }
  | { type: "elected"; id: number; epoch: number }
  | { type: "quorumLost"; alive: number }
  | { type: "appended"; offset: number; record: MetaRecord; by: number }
  | { type: "brokerDown"; id: number; noticed: boolean }
  | { type: "brokerUp"; id: number; noticed: boolean }
  | { type: "leaderMoved"; partition: number; from: number | null; to: number | null }
  | { type: "topicCreated"; name: string }
  | { type: "rejected"; what: "topic"; name: string }
  | { type: "error"; message: string };

const MAJORITY = 2;

export function createKraft(): KState {
  const log: MetaRecord[] = [
    { kind: "register", broker: 1 },
    { kind: "register", broker: 2 },
    { kind: "register", broker: 3 },
    { kind: "topic", name: "orders" },
  ];
  return {
    controllers: [1, 2, 3].map((id) => ({ id, alive: true, log: log.map((r) => ({ ...r })) })),
    active: 1,
    epoch: 1,
    committed: log.length,
    brokers: [1, 2, 3].map((id) => ({ id, alive: true, fenced: false, applied: log.length })),
    // Replica lists rotate, the way Kafka spreads leadership: P0 [1,2,3], P1 [2,3,1], P2 [3,1,2].
    partitions: [0, 1, 2].map((index) => ({ index, replicas: [0, 1, 2].map((k) => ((index + k) % 3) + 1), leader: index + 1 })),
    topics: ["orders"],
  };
}

const aliveControllers = (s: KState) => s.controllers.filter((c) => c.alive);

export function applyKraft(prev: KState, action: KAction): { state: KState; events: KEvent[] } {
  const s = structuredClone(prev);
  const events: KEvent[] = [];
  const fail = (message: string) => ({ state: prev, events: [{ type: "error", message } as KEvent] });

  switch (action.type) {
    case "crashController": {
      const c = s.controllers.find((x) => x.id === action.id);
      if (!c?.alive) return fail("Controller is not running");
      c.alive = false;
      const wasActive = s.active === c.id;
      events.push({ type: "controllerDown", id: c.id, wasActive });
      if (aliveControllers(s).length < MAJORITY) {
        // Without a majority nothing can be committed, so no controller may act.
        if (s.active !== null) events.push({ type: "quorumLost", alive: aliveControllers(s).length });
        s.active = null;
      } else if (wasActive) {
        s.active = null;
        elect(s, events);
      }
      break;
    }
    case "restartController": {
      const c = s.controllers.find((x) => x.id === action.id);
      if (!c || c.alive) return fail("Controller is already running");
      c.alive = true;
      events.push({ type: "controllerUp", id: c.id });
      if (s.active !== null) c.log = activeLog(s).map((r) => ({ ...r }));
      else elect(s, events);
      break;
    }
    case "crashBroker": {
      const b = s.brokers.find((x) => x.id === action.id);
      if (!b?.alive) return fail("Broker is not running");
      b.alive = false;
      const noticed = s.active !== null;
      events.push({ type: "brokerDown", id: b.id, noticed });
      if (noticed) fence(s, b.id, events);
      break;
    }
    case "restartBroker": {
      const b = s.brokers.find((x) => x.id === action.id);
      if (!b || b.alive) return fail("Broker is already running");
      b.alive = true;
      const noticed = s.active !== null;
      events.push({ type: "brokerUp", id: b.id, noticed });
      if (noticed) unfence(s, b.id, events);
      break;
    }
    case "createTopic": {
      if (s.active === null) {
        events.push({ type: "rejected", what: "topic", name: action.name });
        break;
      }
      append(s, { kind: "topic", name: action.name }, events);
      s.topics.push(action.name);
      events.push({ type: "topicCreated", name: action.name });
      break;
    }
  }

  // Live brokers keep up with what is committed; a dead one stays where it stopped.
  for (const b of s.brokers) if (b.alive) b.applied = s.committed;
  return { state: s, events };
}

function activeLog(s: KState) {
  return s.controllers.find((c) => c.id === s.active)!.log;
}

function append(s: KState, record: MetaRecord, events: KEvent[]) {
  const leader = s.controllers.find((c) => c.id === s.active)!;
  leader.log.push(record);
  events.push({ type: "appended", offset: leader.log.length - 1, record, by: leader.id });
  // Followers that are up copy at once; with a majority up, the record is committed.
  for (const c of aliveControllers(s)) if (c.id !== leader.id) c.log = leader.log.map((r) => ({ ...r }));
  s.committed = leader.log.length;
}

function elect(s: KState, events: KEvent[]) {
  const alive = aliveControllers(s);
  if (alive.length < MAJORITY) return;
  const best = [...alive].sort((a, b) => b.log.length - a.log.length || a.id - b.id)[0]!;
  s.active = best.id;
  s.epoch += 1;
  for (const c of alive) if (c.id !== best.id) c.log = best.log.map((r) => ({ ...r }));
  s.committed = best.log.length;
  events.push({ type: "elected", id: best.id, epoch: s.epoch });
  // The new controller catches up with what happened while nobody was in charge.
  for (const b of s.brokers) {
    if (!b.alive && !b.fenced) fence(s, b.id, events);
    else if (b.alive && b.fenced) unfence(s, b.id, events);
  }
}

function fence(s: KState, id: number, events: KEvent[]) {
  const b = s.brokers.find((x) => x.id === id)!;
  b.fenced = true;
  append(s, { kind: "fence", broker: id }, events);
  for (const p of s.partitions) {
    if (p.leader !== id) continue;
    const to = p.replicas.find((r) => r !== id && usable(s, r)) ?? null;
    moveLeader(s, p, to, events);
  }
}

function unfence(s: KState, id: number, events: KEvent[]) {
  const b = s.brokers.find((x) => x.id === id)!;
  b.fenced = false;
  append(s, { kind: "unfence", broker: id }, events);
  // Partitions left without a leader get one again as soon as a broker can take it.
  for (const p of s.partitions) if (p.leader === null && p.replicas.includes(id)) moveLeader(s, p, id, events);
}

function moveLeader(s: KState, p: KPartition, to: number | null, events: KEvent[]) {
  const from = p.leader;
  append(s, { kind: "leader", partition: p.index, from, to }, events);
  p.leader = to;
  events.push({ type: "leaderMoved", partition: p.index, from, to });
}

const usable = (s: KState, id: number) => {
  const b = s.brokers.find((x) => x.id === id);
  return Boolean(b?.alive && !b.fenced);
};

/** A partition whose leader broker is down: nobody serves it. */
export const stranded = (s: KState) => s.partitions.filter((p) => p.leader === null || !s.brokers.find((b) => b.id === p.leader)?.alive);

/* -------------------------------------------------------------- the lesson */

export const SLUG = "kraft";
export const model: Model<KState, KAction, KEvent> = { apply: applyKraft };
export type Ctx = SandboxCtx<KState, KAction, KEvent>;
export const START = createKraft();

export const stepActions: KAction[][] = [
  [],
  [],
  [],
  [{ type: "createTopic", name: "payments" }],
  [{ type: "crashBroker", id: 2 }],
  [{ type: "restartBroker", id: 2 }],
  [{ type: "crashController", id: 1 }],
  [{ type: "crashController", id: 2 }, { type: "crashBroker", id: 3 }],
  [{ type: "restartController", id: 1 }],
  [],
  // Not shown: the try-it step starts with everything running again.
  [{ type: "restartController", id: 2 }, { type: "restartBroker", id: 3 }],
];

export const SANDBOX_STEP = stepActions.length - 1;
export const run = buildRun(model, START, stepActions);
export const sandboxStart = run.states[run.ends[SANDBOX_STEP]!]!;

export const topicsIn = (actions: KAction[]) => actions.filter((a) => a.type === "createTopic").length;

export function controls(s: KState, made: number): ControlRow<KAction>[] {
  return [
    {
      key: "controllers",
      name: { tr: "Controller", en: "Controllers" },
      dot: "var(--sun)",
      buttons: s.controllers.map((c) => ({
        key: `c${c.id}`,
        label: c.alive ? { tr: `C${c.id} çökert`, en: `Crash C${c.id}` } : { tr: `C${c.id} başlat`, en: `Start C${c.id}` },
        action: (c.alive ? { type: "crashController", id: c.id } : { type: "restartController", id: c.id }) as KAction,
        tone: c.alive ? ("danger" as const) : ("ok" as const),
      })),
    },
    {
      key: "brokers",
      name: { tr: "Broker", en: "Brokers" },
      dot: "var(--sky)",
      buttons: s.brokers.map((b) => ({
        key: `b${b.id}`,
        label: b.alive ? { tr: `B${b.id} çökert`, en: `Crash B${b.id}` } : { tr: `B${b.id} başlat`, en: `Start B${b.id}` },
        action: (b.alive ? { type: "crashBroker", id: b.id } : { type: "restartBroker", id: b.id }) as KAction,
        tone: b.alive ? ("danger" as const) : ("ok" as const),
      })),
    },
    {
      key: "admin",
      name: { tr: "Yönetici", en: "Admin" },
      dot: "var(--mint)",
      buttons: [
        { key: "topic", label: { tr: "Topic oluştur", en: "Create topic" }, action: { type: "createTopic", name: `topic-${made + 1}` }, tone: "producer" },
      ],
    },
  ];
}
