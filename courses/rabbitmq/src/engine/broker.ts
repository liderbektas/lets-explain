/**
 * A small, deterministic RabbitMQ (AMQP 0-9-1) for teaching. The same actions always give
 * the same result, so lessons can rewind and missions can be searched exhaustively.
 *
 * Simplifications (lessons that rely on one say so in a "Gerçekte" note):
 * - Time moves in ticks, not milliseconds. TTLs and consumer speeds are counted in ticks.
 * - Messages expire only when they reach the head of their queue, as in RabbitMQ, but the
 *   check runs once per tick.
 * - One virtual host, one connection per app; channels are not modelled.
 * - The broker pushes messages to consumers right after every action (no network delay).
 * - Quorum queues have three members and need two alive; classic queues live on one node.
 */

export type ExchangeType = "direct" | "fanout" | "topic" | "headers";
export type QueueType = "classic" | "quorum" | "stream";
export type Overflow = "drop-head" | "reject-publish";
export type DeathReason = "rejected" | "expired" | "maxlen" | "delivery_limit";

export interface Exchange {
  name: string;
  type: ExchangeType;
  durable: boolean;
  /** Unroutable messages go here instead of being dropped. */
  alternate?: string;
}

export interface Binding {
  exchange: string;
  queue: string;
  key: string;
  /** Headers exchanges match on these instead of the key. */
  headers?: Record<string, string>;
  match?: "all" | "any";
}

export interface Death {
  reason: DeathReason;
  queue: string;
  count: number;
}

export interface Message {
  id: string;
  body: string;
  exchange: string;
  routingKey: string;
  headers: Record<string, string>;
  persistent: boolean;
  publishedAt: number;
  /** Per-message TTL in ticks. */
  ttl?: number;
  /** Times this message was handed back (nack with requeue, or a consumer died holding it). */
  deliveryCount: number;
  redelivered: boolean;
  deaths: Death[];
  replyTo?: string;
  correlationId?: string;
}

export interface QueueArgs {
  dlx?: string;
  dlxKey?: string;
  /** Queue-wide message TTL in ticks. */
  ttl?: number;
  maxLength?: number;
  overflow?: Overflow;
  /** Quorum queues only. RabbitMQ 4 sets 20 by default. */
  deliveryLimit?: number;
  /** The delivery limit above is RabbitMQ's default, not one the declare asked for (a policy may then set it). */
  deliveryLimitDefault?: boolean;
}

/** `rabbitmqctl set_policy`: settings for every queue whose name matches the pattern. */
export interface Policy {
  name: string;
  /** A regular expression, matched against queue names. */
  pattern: string;
  applyTo: "queues" | "exchanges" | "all";
  priority: number;
  definition: QueueArgs;
  /** The definition as it was written (JSON), for list_policies. */
  raw: string;
}

export interface Queue {
  name: string;
  durable: boolean;
  type: QueueType;
  args: QueueArgs;
  /** Messages waiting to be delivered, head first. */
  ready: Message[];
  /** Streams keep every message; consumers read by offset. */
  log: Message[];
  /** The node holding a classic queue, or the quorum leader. */
  node: string;
  members: string[];
}

export interface Consumer {
  tag: string;
  queue: string;
  /** Unacked messages it may hold at once; 0 means no limit. */
  prefetch: number;
  autoAck: boolean;
  /**
   * Delivered but not finished, oldest first. For manual acks the broker still owns these
   * (they come back if the consumer dies). With auto-ack the broker already forgot them:
   * they only live in the consumer's memory and are lost if it crashes.
   */
  unacked: Message[];
  /** Messages this consumer acks by itself per tick, to model work taking time. 0 = waits for you. */
  speed: number;
  /** Next stream offset to read (streams only). */
  offset: number;
  /** Ids this consumer finished (acked, or received with auto-ack). */
  done: string[];
}

export interface Node {
  name: string;
  alive: boolean;
}

export interface Broker {
  time: number;
  nextId: number;
  exchanges: Record<string, Exchange>;
  bindings: Binding[];
  queues: Record<string, Queue>;
  consumers: Record<string, Consumer>;
  /** Consumer order per queue, for round-robin delivery. */
  order: Record<string, string[]>;
  rr: Record<string, number>;
  nodes: Node[];
  /** Every delivery so far: who got which message, and whether it was a redelivery. */
  deliveries: { tag: string; id: string; redelivered: boolean; time: number }[];
  /** Messages that left the system without being processed, and why. */
  lost: { id: string; reason: LostReason }[];
  /** Policies set with rabbitmqctl; absent on brokers made before policies existed. */
  policies?: Policy[];
}

export type LostReason = "unroutable" | "expired" | "maxlen" | "rejected" | "restart" | "queue-down" | "delivery_limit" | "auto-ack-crash";

export const DEFAULT_EXCHANGE = "";
export const NODES = ["rabbit@1", "rabbit@2", "rabbit@3"];

export function createBroker(opts: { nodes?: number } = {}): Broker {
  const n = opts.nodes ?? 1;
  return {
    time: 0,
    nextId: 1,
    exchanges: {
      [DEFAULT_EXCHANGE]: { name: DEFAULT_EXCHANGE, type: "direct", durable: true },
      "amq.direct": { name: "amq.direct", type: "direct", durable: true },
      "amq.fanout": { name: "amq.fanout", type: "fanout", durable: true },
      "amq.topic": { name: "amq.topic", type: "topic", durable: true },
    },
    bindings: [],
    queues: {},
    consumers: {},
    order: {},
    rr: {},
    nodes: NODES.slice(0, Math.max(1, n)).map((name) => ({ name, alive: true })),
    deliveries: [],
    lost: [],
    policies: [],
  };
}

/* ----------------------------------------------------------------- actions */

export interface PublishOptions {
  exchange: string;
  routingKey: string;
  body: string;
  headers?: Record<string, string>;
  persistent?: boolean;
  mandatory?: boolean;
  ttl?: number;
  replyTo?: string;
  correlationId?: string;
}

export type BrokerAction =
  | { type: "declareExchange"; name: string; kind: ExchangeType; durable?: boolean; alternate?: string }
  | { type: "declareQueue"; name: string; durable?: boolean; queueType?: QueueType; args?: QueueArgs; node?: string }
  | { type: "deleteQueue"; name: string }
  | { type: "purge"; queue: string }
  | { type: "bind"; exchange: string; queue: string; key?: string; headers?: Record<string, string>; match?: "all" | "any" }
  | { type: "unbind"; exchange: string; queue: string; key?: string }
  | ({ type: "publish" } & PublishOptions)
  | { type: "consume"; tag: string; queue: string; prefetch?: number; autoAck?: boolean; speed?: number; offset?: "first" | "last" | "next" | number }
  | { type: "cancel"; tag: string }
  | { type: "ack"; tag: string; multiple?: boolean }
  | { type: "nack"; tag: string; requeue: boolean }
  | { type: "crashConsumer"; tag: string }
  | { type: "tick"; count?: number }
  | { type: "restart" }
  | { type: "nodeDown"; node: string }
  | { type: "nodeUp"; node: string }
  | { type: "setPolicy"; policy: Policy }
  | { type: "clearPolicy"; name: string };

export type BrokerEvent =
  | { type: "exchangeDeclared"; name: string; kind: ExchangeType }
  | { type: "queueDeclared"; name: string; queueType: QueueType; durable: boolean }
  | { type: "queueDeleted"; name: string; messages: number }
  | { type: "purged"; queue: string; messages: number }
  | { type: "bound"; exchange: string; queue: string; key: string }
  | { type: "unbound"; exchange: string; queue: string; key: string }
  /** `message` is the published message as it left the producer, so a drawing can show it even after it is gone. */
  | { type: "routed"; id: string; exchange: string; routingKey: string; queues: string[]; via?: string; message: Message }
  | { type: "unroutable"; id: string; exchange: string; routingKey: string; returned: boolean; message: Message }
  | { type: "confirmed"; id: string; ok: boolean; reason?: string }
  | { type: "delivered"; id: string; tag: string; queue: string; redelivered: boolean; autoAck: boolean }
  | { type: "acked"; ids: string[]; tag: string }
  | { type: "processed"; ids: string[]; tag: string }
  | { type: "requeued"; ids: string[]; queue: string; why: "nack" | "crash" | "cancel" }
  | { type: "deadLettered"; id: string; from: string; reason: DeathReason; to: string | null }
  | { type: "dropped"; id: string; queue: string; reason: LostReason }
  | { type: "consumerAdded"; tag: string; queue: string; prefetch: number; autoAck: boolean }
  | { type: "consumerGone"; tag: string; crashed: boolean; lostInFlight: string[] }
  | { type: "ticked"; time: number }
  | { type: "restarted"; lostMessages: string[]; lostQueues: string[] }
  | { type: "nodeChanged"; node: string; alive: boolean }
  | { type: "leaderMoved"; queue: string; from: string; to: string }
  | { type: "queueUnavailable"; queue: string }
  | { type: "policySet"; name: string; queues: string[] }
  | { type: "policyCleared"; name: string; queues: string[] }
  | { type: "error"; message: string };

export interface StepResult {
  state: Broker;
  events: BrokerEvent[];
}

/* -------------------------------------------------------------- routing */

/** RabbitMQ topic matching: words split by ".", "*" is exactly one word, "#" zero or more. */
export function topicMatches(pattern: string, key: string): boolean {
  const p = pattern.split(".");
  const k = key === "" ? [] : key.split(".");
  const go = (i: number, j: number): boolean => {
    if (i === p.length) return j === k.length;
    if (p[i] === "#") return go(i + 1, j) || (j < k.length && go(i, j + 1));
    if (j === k.length) return false;
    return (p[i] === "*" || p[i] === k[j]) && go(i + 1, j + 1);
  };
  return go(0, 0);
}

function bindingMatches(ex: Exchange, b: Binding, routingKey: string, headers: Record<string, string>): boolean {
  switch (ex.type) {
    case "fanout":
      return true;
    case "direct":
      return b.key === routingKey;
    case "topic":
      return topicMatches(b.key, routingKey);
    case "headers": {
      const want = Object.entries(b.headers ?? {});
      if (want.length === 0) return false;
      const hit = (([k, v]: [string, string]) => headers[k] === v);
      return (b.match ?? "all") === "all" ? want.every(hit) : want.some(hit);
    }
  }
}

/** Queues a message would reach from an exchange, without following alternates. */
export function route(s: Broker, exchange: string, routingKey: string, headers: Record<string, string> = {}): string[] {
  if (exchange === DEFAULT_EXCHANGE) return s.queues[routingKey] ? [routingKey] : [];
  const ex = s.exchanges[exchange];
  if (!ex) return [];
  const out = new Set<string>();
  for (const b of s.bindings) if (b.exchange === exchange && bindingMatches(ex, b, routingKey, headers)) out.add(b.queue);
  return [...out].filter((q) => s.queues[q]);
}

/* ----------------------------------------------------------------- reads */

/** The policy that applies to a queue: the matching one with the highest priority, as in RabbitMQ. */
export function policyFor(s: Broker, queue: string): Policy | null {
  let best: Policy | null = null;
  for (const p of s.policies ?? []) {
    if (p.applyTo === "exchanges") continue;
    let hit = false;
    try {
      hit = new RegExp(p.pattern).test(queue);
    } catch {
      hit = false;
    }
    if (hit && (!best || p.priority > best.priority)) best = p;
  }
  return best;
}

/**
 * A queue's settings with its policy applied. Where both set a value, RabbitMQ keeps the
 * queue's own argument for the dead letter exchange, its key and overflow, and the lower
 * number for TTL, max length and delivery limit.
 */
export function effectiveArgs(s: Broker, q: Queue): QueueArgs {
  const p = policyFor(s, q.name)?.definition;
  if (!p) return q.args;
  const a = q.args;
  const low = (x: number | undefined, y: number | undefined) => (x === undefined ? y : y === undefined ? x : Math.min(x, y));
  const out: QueueArgs = {
    dlx: a.dlx ?? p.dlx,
    dlxKey: a.dlxKey ?? p.dlxKey,
    overflow: a.overflow ?? p.overflow,
    ttl: low(a.ttl, p.ttl),
    maxLength: low(a.maxLength, p.maxLength),
    deliveryLimit: a.deliveryLimitDefault && p.deliveryLimit !== undefined ? p.deliveryLimit : low(a.deliveryLimit, q.type === "quorum" ? p.deliveryLimit : undefined),
  };
  for (const k of Object.keys(out) as (keyof QueueArgs)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** Queues a policy matches right now (by name), for the event. */
function matchedBy(s: Broker, name: string): string[] {
  return Object.keys(s.queues).filter((q) => policyFor(s, q)?.name === name);
}

export const nodeAlive = (s: Broker, node: string) => s.nodes.find((n) => n.name === node)?.alive ?? false;

/** Whether a queue can take and hand out messages right now. */
export function queueAvailable(s: Broker, q: Queue): boolean {
  if (q.type === "classic") return nodeAlive(s, q.node);
  const alive = q.members.filter((m) => nodeAlive(s, m)).length;
  return alive * 2 > q.members.length;
}

/** Messages the broker is still waiting to hear back about (auto-ack buffers are not counted). */
export function unackedIn(s: Broker, queue: string): number {
  return Object.values(s.consumers).filter((c) => c.queue === queue && !c.autoAck).reduce((n, c) => n + c.unacked.length, 0);
}

export function depth(s: Broker, queue: string) {
  const q = s.queues[queue];
  return { ready: q?.ready.length ?? 0, unacked: unackedIn(s, queue), total: (q?.ready.length ?? 0) + unackedIn(s, queue) };
}

/** How many times each message id was delivered, to spot duplicates. */
export function deliveryCounts(s: Broker): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of s.deliveries) m.set(d.id, (m.get(d.id) ?? 0) + 1);
  return m;
}

/* ----------------------------------------------------------------- apply */

export function apply(prev: Broker, action: BrokerAction): StepResult {
  const s = structuredClone(prev);
  const events: BrokerEvent[] = [];
  const fail = (message: string): StepResult => ({ state: prev, events: [{ type: "error", message }] });

  switch (action.type) {
    case "declareExchange": {
      const existing = s.exchanges[action.name];
      if (existing && existing.type !== action.kind) return fail(`PRECONDITION_FAILED: exchange '${action.name}' is a ${existing.type} exchange`);
      if (!action.name || action.name.startsWith("amq.")) return fail(`ACCESS_REFUSED: exchange name '${action.name}' is reserved`);
      s.exchanges[action.name] = { name: action.name, type: action.kind, durable: action.durable ?? true, alternate: action.alternate };
      events.push({ type: "exchangeDeclared", name: action.name, kind: action.kind });
      break;
    }

    case "declareQueue": {
      const type = action.queueType ?? "classic";
      const existing = s.queues[action.name];
      if (existing) {
        if (existing.type !== type || existing.durable !== (action.durable ?? true)) return fail(`PRECONDITION_FAILED: queue '${action.name}' exists with other settings`);
        break;
      }
      if (type !== "classic" && action.durable === false) return fail(`PRECONDITION_FAILED: ${type} queues must be durable`);
      const node = action.node ?? s.nodes[0]!.name;
      const members = type === "classic" ? [node] : s.nodes.length >= 3 ? s.nodes.slice(0, 3).map((n) => n.name) : s.nodes.map((n) => n.name);
      const args: QueueArgs = { ...action.args };
      if (type === "quorum" && args.deliveryLimit === undefined) {
        args.deliveryLimit = 20;
        args.deliveryLimitDefault = true;
      }
      s.queues[action.name] = { name: action.name, durable: action.durable ?? true, type, args, ready: [], log: [], node, members };
      s.order[action.name] = [];
      s.rr[action.name] = 0;
      events.push({ type: "queueDeclared", name: action.name, queueType: type, durable: action.durable ?? true });
      break;
    }

    case "deleteQueue": {
      const q = s.queues[action.name];
      if (!q) return fail(`NOT_FOUND: no queue '${action.name}'`);
      for (const c of Object.values(s.consumers)) if (c.queue === q.name) delete s.consumers[c.tag];
      s.bindings = s.bindings.filter((b) => b.queue !== q.name);
      delete s.queues[action.name];
      events.push({ type: "queueDeleted", name: action.name, messages: q.ready.length });
      break;
    }

    case "purge": {
      const q = s.queues[action.queue];
      if (!q) return fail(`NOT_FOUND: no queue '${action.queue}'`);
      const n = q.ready.length;
      q.ready = [];
      events.push({ type: "purged", queue: q.name, messages: n });
      break;
    }

    case "bind": {
      if (!s.exchanges[action.exchange] || action.exchange === DEFAULT_EXCHANGE) return fail(`NOT_FOUND: no exchange '${action.exchange}'`);
      if (!s.queues[action.queue]) return fail(`NOT_FOUND: no queue '${action.queue}'`);
      const key = action.key ?? "";
      const same = (b: Binding) => b.exchange === action.exchange && b.queue === action.queue && b.key === key && JSON.stringify(b.headers ?? {}) === JSON.stringify(action.headers ?? {});
      if (!s.bindings.some(same)) s.bindings.push({ exchange: action.exchange, queue: action.queue, key, headers: action.headers, match: action.match });
      events.push({ type: "bound", exchange: action.exchange, queue: action.queue, key });
      break;
    }

    case "unbind": {
      const key = action.key ?? "";
      const before = s.bindings.length;
      s.bindings = s.bindings.filter((b) => !(b.exchange === action.exchange && b.queue === action.queue && b.key === key));
      if (s.bindings.length === before) return fail("No such binding");
      events.push({ type: "unbound", exchange: action.exchange, queue: action.queue, key });
      break;
    }

    case "publish": {
      if (action.exchange !== DEFAULT_EXCHANGE && !s.exchanges[action.exchange]) return fail(`NOT_FOUND: no exchange '${action.exchange}'`);
      const msg: Message = {
        id: `m${s.nextId++}`,
        body: action.body,
        exchange: action.exchange,
        routingKey: action.routingKey,
        headers: { ...action.headers },
        persistent: action.persistent ?? false,
        publishedAt: s.time,
        ttl: action.ttl,
        deliveryCount: 0,
        redelivered: false,
        deaths: [],
        replyTo: action.replyTo,
        correlationId: action.correlationId,
      };
      publish(s, msg, action.mandatory ?? false, events);
      break;
    }

    case "consume": {
      const q = s.queues[action.queue];
      if (!q) return fail(`NOT_FOUND: no queue '${action.queue}'`);
      if (s.consumers[action.tag]) return fail(`Consumer tag '${action.tag}' is in use`);
      if (q.type === "stream" && (action.autoAck ?? false)) return fail("Stream consumers must use manual acks and a prefetch");
      if (!queueAvailable(s, q)) return fail(`Queue '${q.name}' is not available right now`);
      const off = action.offset ?? "next";
      const offset = q.type !== "stream" ? 0 : off === "first" ? 0 : off === "last" ? Math.max(0, q.log.length - 1) : off === "next" ? q.log.length : off;
      s.consumers[action.tag] = {
        tag: action.tag,
        queue: q.name,
        prefetch: action.prefetch ?? 0,
        autoAck: action.autoAck ?? false,
        unacked: [],
        speed: action.speed ?? 0,
        offset,
        done: [],
      };
      s.order[q.name] = [...(s.order[q.name] ?? []), action.tag];
      events.push({ type: "consumerAdded", tag: action.tag, queue: q.name, prefetch: action.prefetch ?? 0, autoAck: action.autoAck ?? false });
      break;
    }

    case "cancel": {
      const c = s.consumers[action.tag];
      if (!c) return fail(`No consumer '${action.tag}'`);
      removeConsumer(s, c, false, events);
      break;
    }

    case "ack": {
      const c = s.consumers[action.tag];
      if (!c) return fail(`No consumer '${action.tag}'`);
      if (c.autoAck) return fail("PRECONDITION_FAILED: an auto-ack consumer never acks");
      if (c.unacked.length === 0) return fail("Nothing to ack");
      const done = action.multiple ? c.unacked.splice(0) : c.unacked.splice(0, 1);
      c.done.push(...done.map((m) => m.id));
      events.push({ type: "acked", ids: done.map((m) => m.id), tag: c.tag });
      break;
    }

    case "nack": {
      const c = s.consumers[action.tag];
      if (!c) return fail(`No consumer '${action.tag}'`);
      if (c.autoAck) return fail("PRECONDITION_FAILED: an auto-ack consumer cannot nack");
      const m = c.unacked.shift();
      if (!m) return fail("Nothing to nack");
      const q = s.queues[c.queue]!;
      if (q.type === "stream") {
        events.push({ type: "acked", ids: [m.id], tag: c.tag });
        break;
      }
      if (action.requeue) requeue(s, q, [m], "nack", events);
      else deadLetter(s, q, m, "rejected", events);
      break;
    }

    case "crashConsumer": {
      const c = s.consumers[action.tag];
      if (!c) return fail(`No consumer '${action.tag}'`);
      removeConsumer(s, c, true, events);
      break;
    }

    case "tick": {
      const n = Math.max(1, action.count ?? 1);
      for (let i = 0; i < n; i++) {
        s.time += 1;
        // Busy consumers finish some work by themselves.
        for (const c of Object.values(s.consumers)) {
          if (c.speed <= 0 || c.unacked.length === 0) continue;
          const done = c.unacked.splice(0, c.speed);
          c.done.push(...done.map((m) => m.id));
          events.push({ type: c.autoAck ? "processed" : "acked", ids: done.map((m) => m.id), tag: c.tag });
        }
        for (const q of Object.values(s.queues)) expireHead(s, q, events);
        dispatch(s, events);
      }
      events.push({ type: "ticked", time: s.time });
      return { state: s, events };
    }

    case "restart": {
      const lostMessages: string[] = [];
      const lostQueues: string[] = [];
      // Consumers disconnect: what they held goes back to its queue first.
      for (const c of Object.values(s.consumers)) {
        const q = s.queues[c.queue];
        if (c.autoAck) {
          for (const m of c.unacked) s.lost.push({ id: m.id, reason: "auto-ack-crash" });
          continue;
        }
        if (q && q.type !== "stream") q.ready.unshift(...c.unacked.map((m) => ({ ...m, redelivered: true })));
      }
      s.consumers = {};
      for (const name of Object.keys(s.order)) s.order[name] = [];
      for (const q of Object.values(s.queues)) {
        if (!q.durable) {
          lostQueues.push(q.name);
          lostMessages.push(...q.ready.map((m) => m.id));
          delete s.queues[q.name];
          continue;
        }
        const keep = q.ready.filter((m) => m.persistent || q.type !== "classic");
        lostMessages.push(...q.ready.filter((m) => !keep.includes(m)).map((m) => m.id));
        q.ready = keep;
      }
      s.bindings = s.bindings.filter((b) => s.queues[b.queue] && s.exchanges[b.exchange]?.durable);
      for (const [name, ex] of Object.entries(s.exchanges)) if (!ex.durable) delete s.exchanges[name];
      for (const id of lostMessages) s.lost.push({ id, reason: "restart" });
      events.push({ type: "restarted", lostMessages, lostQueues });
      return { state: s, events };
    }

    case "setPolicy": {
      try {
        new RegExp(action.policy.pattern);
      } catch {
        return fail(`Validation failed: ${action.policy.pattern} is not a valid regular expression`);
      }
      s.policies = [...(s.policies ?? []).filter((p) => p.name !== action.policy.name), action.policy];
      events.push({ type: "policySet", name: action.policy.name, queues: matchedBy(s, action.policy.name) });
      for (const q of Object.values(s.queues)) expireHead(s, q, events);
      break;
    }

    case "clearPolicy": {
      if (!(s.policies ?? []).some((p) => p.name === action.name)) return fail(`Parameter does not exist`);
      const queues = matchedBy(s, action.name);
      s.policies = (s.policies ?? []).filter((p) => p.name !== action.name);
      events.push({ type: "policyCleared", name: action.name, queues });
      break;
    }

    case "nodeDown":
    case "nodeUp": {
      const node = s.nodes.find((n) => n.name === action.node);
      if (!node) return fail(`No node '${action.node}'`);
      const alive = action.type === "nodeUp";
      if (node.alive === alive) return fail(`${node.name} is already ${alive ? "up" : "down"}`);
      node.alive = alive;
      events.push({ type: "nodeChanged", node: node.name, alive });
      for (const q of Object.values(s.queues)) {
        // A node coming back can restore a majority whose leader is still down: elect a live member.
        if (q.type !== "classic" && alive && !nodeAlive(s, q.node) && queueAvailable(s, q)) {
          const next = q.members.find((m) => nodeAlive(s, m))!;
          events.push({ type: "leaderMoved", queue: q.name, from: q.node, to: next });
          q.node = next;
        }
        if (q.type !== "classic" && !alive && q.node === node.name) {
          const next = q.members.find((m) => m !== node.name && nodeAlive(s, m));
          if (next && queueAvailable(s, q)) {
            events.push({ type: "leaderMoved", queue: q.name, from: q.node, to: next });
            q.node = next;
          }
        }
        if (!queueAvailable(s, q) && !alive) {
          events.push({ type: "queueUnavailable", queue: q.name });
          for (const c of Object.values(s.consumers)) if (c.queue === q.name) removeConsumer(s, c, true, events);
        }
      }
      break;
    }
  }

  dispatch(s, events);
  return { state: s, events };
}

export function simulate(actions: BrokerAction[], start: Broker = createBroker()): { states: Broker[]; events: BrokerEvent[][] } {
  const states = [start];
  const events: BrokerEvent[][] = [];
  let current = start;
  for (const a of actions) {
    const r = apply(current, a);
    current = r.state;
    states.push(current);
    events.push(r.events);
  }
  return { states, events };
}

/* ------------------------------------------------------------- internals */

/** Routes a message from its exchange, following an alternate exchange when nothing matches. */
function publish(s: Broker, msg: Message, mandatory: boolean, events: BrokerEvent[]) {
  let queues = route(s, msg.exchange, msg.routingKey, msg.headers);
  let via: string | undefined;
  const alt = s.exchanges[msg.exchange]?.alternate;
  if (queues.length === 0 && alt && s.exchanges[alt]) {
    queues = route(s, alt, msg.routingKey, msg.headers);
    via = alt;
  }
  if (queues.length === 0) {
    events.push({ type: "unroutable", id: msg.id, exchange: msg.exchange, routingKey: msg.routingKey, returned: mandatory, message: msg });
    if (!mandatory) s.lost.push({ id: msg.id, reason: "unroutable" });
    // The broker confirms unroutable messages too: it took responsibility, even if it dropped them.
    events.push({ type: "confirmed", id: msg.id, ok: true });
    return;
  }
  events.push({ type: "routed", id: msg.id, exchange: msg.exchange, routingKey: msg.routingKey, queues, via, message: msg });
  let ok = true;
  let reason: string | undefined;
  for (const name of queues) {
    const r = enqueue(s, s.queues[name]!, { ...msg }, events);
    if (!r.ok) {
      ok = false;
      reason = r.reason;
    }
  }
  events.push({ type: "confirmed", id: msg.id, ok, reason });
}

function enqueue(s: Broker, q: Queue, msg: Message, events: BrokerEvent[]): { ok: boolean; reason?: string } {
  if (!queueAvailable(s, q)) {
    if (q.type === "classic") {
      s.lost.push({ id: msg.id, reason: "queue-down" });
      events.push({ type: "dropped", id: msg.id, queue: q.name, reason: "queue-down" });
      return { ok: true };
    }
    return { ok: false, reason: "no quorum" };
  }
  if (q.type === "stream") {
    q.log.push(msg);
    return { ok: true };
  }
  const eff = effectiveArgs(s, q);
  const max = eff.maxLength;
  if (max !== undefined && q.ready.length >= max) {
    if ((eff.overflow ?? "drop-head") === "reject-publish") {
      s.lost.push({ id: msg.id, reason: "maxlen" });
      events.push({ type: "dropped", id: msg.id, queue: q.name, reason: "maxlen" });
      return { ok: false, reason: "queue full (reject-publish)" };
    }
    const head = q.ready.shift()!;
    deadLetter(s, q, head, "maxlen", events);
  }
  q.ready.push(msg);
  return { ok: true };
}

/** Sends a message to the queue's dead letter exchange, or drops it when there is none. */
function deadLetter(s: Broker, q: Queue, msg: Message, reason: DeathReason, events: BrokerEvent[]) {
  const eff = effectiveArgs(s, q);
  const dlx = eff.dlx;
  if (dlx === undefined || (dlx !== DEFAULT_EXCHANGE && !s.exchanges[dlx])) {
    const lostReason: LostReason = reason === "rejected" ? "rejected" : reason === "expired" ? "expired" : reason === "maxlen" ? "maxlen" : "delivery_limit";
    s.lost.push({ id: msg.id, reason: lostReason });
    events.push({ type: "deadLettered", id: msg.id, from: q.name, reason, to: null });
    return;
  }
  const prior = msg.deaths.find((d) => d.queue === q.name && d.reason === reason);
  const deaths = prior
    ? msg.deaths.map((d) => (d === prior ? { ...d, count: d.count + 1 } : d))
    : [{ reason, queue: q.name, count: 1 }, ...msg.deaths];
  const routingKey = eff.dlxKey ?? msg.routingKey;
  const dead: Message = { ...msg, exchange: dlx, routingKey, deaths, redelivered: false, deliveryCount: 0, publishedAt: s.time, ttl: undefined };
  const targets = route(s, dlx, routingKey, dead.headers);
  events.push({ type: "deadLettered", id: msg.id, from: q.name, reason, to: targets[0] ?? null });
  if (targets.length === 0) {
    s.lost.push({ id: msg.id, reason: "unroutable" });
    return;
  }
  for (const t of targets) enqueue(s, s.queues[t]!, { ...dead }, events);
}

function requeue(s: Broker, q: Queue, msgs: Message[], why: "nack" | "crash" | "cancel", events: BrokerEvent[]) {
  const back: Message[] = [];
  for (const m of msgs) {
    const again = { ...m, redelivered: true, deliveryCount: m.deliveryCount + 1 };
    const limit = effectiveArgs(s, q).deliveryLimit;
    if (q.type === "quorum" && limit !== undefined && again.deliveryCount > limit) {
      deadLetter(s, q, again, "delivery_limit", events);
      continue;
    }
    back.push(again);
  }
  // Requeued messages go back to the front, so they are delivered next.
  q.ready.unshift(...back);
  if (back.length) events.push({ type: "requeued", ids: back.map((m) => m.id), queue: q.name, why });
}

function removeConsumer(s: Broker, c: Consumer, crashed: boolean, events: BrokerEvent[]) {
  const q = s.queues[c.queue];
  delete s.consumers[c.tag];
  s.order[c.queue] = (s.order[c.queue] ?? []).filter((t) => t !== c.tag);
  if (c.autoAck) {
    // The broker forgot these at delivery; only the consumer had them.
    const lost = crashed ? c.unacked.map((m) => m.id) : [];
    for (const id of lost) s.lost.push({ id, reason: "auto-ack-crash" });
    events.push({ type: "consumerGone", tag: c.tag, crashed, lostInFlight: lost });
    return;
  }
  events.push({ type: "consumerGone", tag: c.tag, crashed, lostInFlight: [] });
  if (q && q.type !== "stream" && c.unacked.length) requeue(s, q, c.unacked, crashed ? "crash" : "cancel", events);
}

function expiry(s: Broker, q: Queue, m: Message): number | undefined {
  const a = effectiveArgs(s, q).ttl;
  const b = m.ttl;
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

/** Expired messages leave when they reach the head of the queue. */
function expireHead(s: Broker, q: Queue, events: BrokerEvent[]) {
  if (q.type === "stream") return;
  while (q.ready.length) {
    const m = q.ready[0]!;
    const ttl = expiry(s, q, m);
    if (ttl === undefined || s.time - m.publishedAt < ttl) return;
    q.ready.shift();
    deadLetter(s, q, m, "expired", events);
  }
}

/** Hands ready messages to consumers in turn, as long as they have prefetch room. */
function dispatch(s: Broker, events: BrokerEvent[]) {
  for (const q of Object.values(s.queues)) {
    if (!queueAvailable(s, q)) continue;
    const tags = (s.order[q.name] ?? []).filter((t) => s.consumers[t]);
    if (tags.length === 0) continue;
    const room = (c: Consumer) => c.autoAck || c.prefetch === 0 || c.unacked.length < c.prefetch;

    if (q.type === "stream") {
      for (const t of tags) {
        const c = s.consumers[t]!;
        while (c.offset < q.log.length && room(c)) {
          const m = q.log[c.offset]!;
          c.offset += 1;
          c.unacked.push(m);
          s.deliveries.push({ tag: c.tag, id: m.id, redelivered: false, time: s.time });
          events.push({ type: "delivered", id: m.id, tag: c.tag, queue: q.name, redelivered: false, autoAck: false });
        }
      }
      continue;
    }

    let guard = 0;
    while (q.ready.length && guard++ < 10_000) {
      let picked: Consumer | null = null;
      for (let i = 0; i < tags.length; i++) {
        const idx = (s.rr[q.name]! + i) % tags.length;
        const c = s.consumers[tags[idx]!]!;
        if (room(c)) {
          picked = c;
          s.rr[q.name] = (idx + 1) % tags.length;
          break;
        }
      }
      if (!picked) break;
      const m = q.ready.shift()!;
      s.deliveries.push({ tag: picked.tag, id: m.id, redelivered: m.redelivered, time: s.time });
      events.push({ type: "delivered", id: m.id, tag: picked.tag, queue: q.name, redelivered: m.redelivered, autoAck: picked.autoAck });
      if (picked.autoAck && picked.speed === 0) picked.done.push(m.id);
      else picked.unacked.push(m);
    }
  }
}
