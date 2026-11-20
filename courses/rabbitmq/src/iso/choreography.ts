import type { Broker, BrokerEvent, Message } from "../engine/broker";

/**
 * Turns what the broker did in one action into motion on the stage, so every message moves
 * the way RabbitMQ really moves it:
 *
 * - publish: one message travels to its exchange; there it is copied once per matching queue,
 *   and each copy travels on along its binding into the tail of its queue (fanout shows one
 *   in, several out);
 * - unroutable: it reaches the exchange and is dropped there, or comes back to the producer
 *   when it was published as mandatory;
 * - delivery: the message leaves the head of the queue and lands in the consumer's hand;
 *   a stream hands out a copy and keeps the original in its log;
 * - ack: it is gone for good; nack with requeue, a crash or a cancel: it travels back to the
 *   head of its queue;
 * - dead lettering: it leaves through the dead letter exchange to its next queue, or is
 *   dropped where it stood when there is nowhere to go.
 *
 * Moving parcels are "ghosts" drawn on top; the real parcel disappears the moment its ghost
 * leaves and appears the moment its ghost lands. Times are seconds from the start of the action.
 */

export type Pt = [number, number];

/** Where things stand on the stage, for one broker state. */
export interface Places {
  queues: string[];
  consumers: string[];
  /** The producer that publishes this message, or null when none is drawn. */
  producer: (exchange: string, routingKey: string) => Pt | null;
  /** The point a parcel passes over an exchange, or null when it is not drawn. */
  exchange: (name: string) => Pt | null;
  slot: (queue: string, index: number) => Pt | null;
  hand: (tag: string, index: number) => Pt | null;
  /** A queue's tail, where messages come in, and its head, where they leave for consumers. */
  tail: (queue: string) => Pt | null;
  head: (queue: string) => Pt | null;
}

export interface Ghost {
  key: string;
  msg: Message;
  pts: Pt[];
  /** Time each point is reached; ts[0] is when the ghost sets off. */
  ts: number[];
  /** "land": hands over to the real parcel and vanishes; "drop": falls and fades where it ends. */
  end: "land" | "drop";
}

/** The broker's answer to a publisher in confirm mode, travelling back to it. */
export interface Token {
  key: string;
  ok: boolean;
  from: Pt;
  to: Pt;
  t0: number;
}

export interface Fate {
  /** leave: a ghost takes over; drop: falls and fades in place; done: acked, shrinks away. */
  how: "leave" | "drop" | "done";
  at: number;
}

export interface Plan {
  ghosts: Ghost[];
  tokens: Token[];
  /** When a parcel that just got somewhere should appear, by place key. */
  arrive: Map<string, number>;
  /** How a parcel that is no longer drawn should go, by place key. */
  fates: Map<string, Fate>;
  /**
   * When the parcels already waiting in a queue slide to their new slots: as the head leaves,
   * or just before a requeued message lands back at the head. A tail arrival moves nobody.
   */
  shift: Map<string, number>;
}

/** Seconds for one leg (producer → exchange, exchange → queue) and one hop (queue ↔ consumer). */
export const LEG = 0.45;
export const HOP = 0.5;
/** A producer publishing to the default exchange: one longer leg straight into the queue. */
export const DIRECT = LEG * 1.6;

/** When a published message lands in its queue, for panels drawn next to the stage. */
export const landsAt = (e: { exchange: string }) => (e.exchange === "" ? DIRECT : 2 * LEG);

/** Points along the same S-curve the stage draws its roads with, from a to b (ends excluded). */
export function bend(a: Pt, b: Pt): Pt[] {
  const mx = (a[0] + b[0]) / 2;
  return [0.25, 0.5, 0.75].map((t) => {
    const u = 1 - t;
    return [u * u * u * a[0] + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * b[1]];
  });
}

/** Times for points along a path: the first at t0, the last at t1, evenly between. */
const spread = (n: number, t0: number, t1: number) => Array.from({ length: n }, (_, i) => (n === 1 ? t1 : t0 + ((t1 - t0) * i) / (n - 1)));

/** Place keys: a parcel waiting in a queue, or held by a consumer. */
export const qKey = (queue: string, id: string) => `q:${queue}:${id}`;
export const hKey = (tag: string, id: string) => `h:${tag}:${id}`;
const queueOf = (key: string) => (key.startsWith("q:") ? key.slice(2, key.lastIndexOf(":")) : null);

interface Spot {
  key: string;
  xy: Pt;
  /** When the message is there (0 for where it already was before the action). */
  t: number;
  /** In a stream's log: reading copies it, it does not leave. */
  stays: boolean;
}

/** Every place a message is drawn in a broker state: fanout copies share one id. */
function locate(b: Broker, at: Places, id: string): Spot[] {
  const out: Spot[] = [];
  for (const name of at.queues) {
    const q = b.queues[name];
    if (!q) continue;
    const list = q.type === "stream" ? q.log : q.ready;
    const i = list.findIndex((m) => m.id === id);
    const xy = i >= 0 ? at.slot(name, i) : null;
    if (xy) out.push({ key: qKey(name, id), xy, t: 0, stays: q.type === "stream" });
  }
  for (const tag of at.consumers) {
    const k = b.consumers[tag]?.unacked.findIndex((m) => m.id === id) ?? -1;
    const xy = k >= 0 ? at.hand(tag, k) : null;
    if (xy) out.push({ key: hKey(tag, id), xy, t: 0, stays: false });
  }
  return out;
}

function findMessage(b: Broker, id: string): Message | undefined {
  for (const q of Object.values(b.queues)) {
    const m = q.ready.find((x) => x.id === id) ?? q.log.find((x) => x.id === id);
    if (m) return m;
  }
  for (const c of Object.values(b.consumers)) {
    const m = c.unacked.find((x) => x.id === id);
    if (m) return m;
  }
  return undefined;
}

export function choreograph(opts: { prev: Broker; cur: Broker; last: BrokerEvent[]; before: Places; here: Places; confirms?: boolean }): Plan {
  const { prev, cur, last, before, here } = opts;
  const plan: Plan = { ghosts: [], tokens: [], arrive: new Map(), fates: new Map(), shift: new Map() };
  /** Places a message reached during this action, and places it has left. */
  const moved = new Map<string, Spot[]>();
  const gone = new Set<string>();
  // Messages that left the system (dropped, refused) are only in the publish events.
  const published = new Map(last.flatMap((e) => (e.type === "routed" || e.type === "unroutable" ? [[e.id, e.message] as const] : [])));
  const msgOf = (id: string) => findMessage(cur, id) ?? findMessage(prev, id) ?? published.get(id);
  const touch = (queue: string | null, t: number) => {
    if (queue) plan.shift.set(queue, Math.min(plan.shift.get(queue) ?? Infinity, Math.max(0, t)));
  };
  const reach = (id: string, s: Spot) => {
    moved.set(id, [...(moved.get(id) ?? []).filter((x) => x.key !== s.key), s]);
    gone.delete(s.key);
    plan.arrive.set(s.key, s.t);
  };
  /** Where a message stands now that matches `want`: reached this action, or where it already was. */
  const whereIs = (id: string, want: (s: Spot) => boolean): Spot | null => {
    const spots = [...locate(prev, before, id), ...(moved.get(id) ?? [])].filter((s) => !gone.has(s.key) && want(s));
    return spots.sort((a, b) => a.t - b.t).at(-1) ?? null;
  };
  const leave = (spot: Spot, how: Fate["how"], t: number) => {
    if (spot.stays) return;
    gone.add(spot.key);
    plan.fates.set(spot.key, { how, at: t });
    touch(queueOf(spot.key), t);
  };
  const ghost = (key: string, id: string, pts: Pt[], ts: number[], end: Ghost["end"]) => {
    const msg = msgOf(id);
    if (msg && pts.length >= 2) plan.ghosts.push({ key, msg, pts, ts, end });
  };
  /**
   * The slot a message lands in: where it waits now, or the head if it is handed on in this
   * same action. `kept` is false when the queue never took it (full, or down).
   */
  const landing = (from: number, id: string, queue: string): { xy: Pt; kept: boolean } | null => {
    const q = cur.queues[queue];
    if (!q) return null;
    const list = q.type === "stream" ? q.log : q.ready;
    const i = list.findIndex((m) => m.id === id);
    const handedOn = last.slice(from + 1).some((e) => (e.type === "delivered" && e.id === id && e.queue === queue) || (e.type === "deadLettered" && e.id === id && e.from === queue));
    const refused = last.some((e) => e.type === "dropped" && e.id === id && e.queue === queue);
    const xy = here.slot(queue, i >= 0 ? i : handedOn ? 0 : list.length);
    return xy ? { xy, kept: !refused && (i >= 0 || handedOn) } : null;
  };
  const answers = new Map<string, { t: number; from: Pt; to: Pt }>();
  /**
   * From `from` along a road to the queue's tail, then up the line to its slot. A copy the
   * queue refuses stops at the tail and falls there.
   */
  const intoQueue = (key: string, id: string, from: Pt, queue: string, land: { xy: Pt; kept: boolean }, t0: number, dur: number) => {
    const tail = here.tail(queue);
    if (!tail) return ghost(key, id, [from, land.xy], [t0, t0 + dur], land.kept ? "land" : "drop");
    const road = [from, ...bend(from, tail), tail];
    const ts = spread(road.length, t0, t0 + dur * 0.65);
    if (!land.kept) return ghost(key, id, road, ts, "drop");
    ghost(key, id, [...road, land.xy], [...ts, t0 + dur], "land");
  };
  /** From a slot out of the queue's head and along the road to a consumer's hand, or the same way back. */
  const viaHead = (key: string, id: string, queue: string, slot: Pt, hand: Pt, t0: number, back: boolean) => {
    const head = here.head(queue);
    if (!head) return ghost(key, id, back ? [hand, slot] : [slot, hand], [t0, t0 + HOP], "land");
    const road = [head, ...bend(head, hand), hand];
    if (!back) return ghost(key, id, [slot, ...road], [t0, ...spread(road.length, t0 + HOP * 0.3, t0 + HOP)], "land");
    ghost(key, id, [...road].reverse().concat([slot]), [...spread(road.length, t0, t0 + HOP * 0.7), t0 + HOP], "land");
  };

  last.forEach((e, i) => {
    switch (e.type) {
      case "routed": {
        const start = here.producer(e.exchange, e.routingKey);
        const pts: Pt[] = [];
        const ts: number[] = [];
        if (start) {
          pts.push(start);
          ts.push(0);
        }
        for (const name of [e.exchange, e.via]) {
          const ex = name ? here.exchange(name) : null;
          if (!ex) continue;
          ts.push(pts.length ? ts.at(-1)! + LEG : 0);
          pts.push(ex);
        }
        // One message reaches the exchange; there each matching queue gets its own copy.
        ghost(`${e.id}-in-${i}`, e.id, pts, ts, "land");
        const split = pts.at(-1) ?? null;
        const t0 = ts.at(-1) ?? 0;
        const leg = pts.length >= 2 || !start ? LEG : DIRECT;
        for (const queue of e.queues) {
          const land = landing(i, e.id, queue);
          if (!land) continue;
          if (split) intoQueue(`${e.id}-to-${queue}-${i}`, e.id, split, queue, land, t0, leg);
          const t = split ? t0 + leg : 0;
          if (land.kept) reach(e.id, { key: qKey(queue, e.id), xy: land.xy, t, stays: cur.queues[queue]?.type === "stream" });
          // The broker answers once the queues have it (or refused it).
          if (start) answers.set(e.id, { t: Math.max(answers.get(e.id)?.t ?? 0, t), from: land.xy, to: start });
        }
        break;
      }
      case "unroutable": {
        const start = here.producer(e.exchange, e.routingKey);
        const ex = here.exchange(e.exchange);
        if (!start || !ex) break;
        // It reaches the exchange, matches no binding, and is dropped there or handed back.
        if (e.returned) ghost(`${e.id}-return-${i}`, e.id, [start, ex, start], [0, LEG, 2 * LEG], "land");
        else ghost(`${e.id}-unroutable-${i}`, e.id, [start, ex], [0, LEG], "drop");
        answers.set(e.id, { t: e.returned ? 2 * LEG : LEG, from: ex, to: start });
        break;
      }
      case "delivered": {
        const from = whereIs(e.id, (s) => s.key === qKey(e.queue, e.id));
        const unacked = cur.consumers[e.tag]?.unacked ?? [];
        const k = unacked.findIndex((m) => m.id === e.id);
        const dest = here.hand(e.tag, k >= 0 ? k : Math.min(unacked.length, 3));
        if (!dest) break;
        const t0 = from?.t ?? 0;
        // It leaves the head of the queue for the consumer; a stream hands out a copy and keeps it.
        if (from) {
          viaHead(`${e.id}-to-${e.tag}-${i}`, e.id, e.queue, from.xy, dest, t0, false);
          leave(from, "leave", t0);
        }
        reach(e.id, { key: hKey(e.tag, e.id), xy: dest, t: from ? t0 + HOP : 0, stays: false });
        break;
      }
      case "acked":
      case "processed": {
        for (const id of e.ids) {
          const spot = whereIs(id, (s) => s.key === hKey(e.tag, id));
          if (spot) leave(spot, "done", spot.t);
        }
        break;
      }
      case "requeued": {
        for (const id of e.ids) {
          const from = whereIs(id, (s) => s.key.startsWith("h:"));
          const land = landing(i, id, e.queue);
          if (!land) continue;
          const t0 = from?.t ?? 0;
          // Unacked messages go back to the head of their queue, first in line again.
          if (from) {
            viaHead(`${id}-back-${i}`, id, e.queue, land.xy, from.xy, t0, true);
            leave(from, "leave", t0);
          }
          reach(id, { key: qKey(e.queue, id), xy: land.xy, t: from ? t0 + HOP : 0, stays: false });
          touch(e.queue, (from ? t0 + HOP : 0) - 0.2);
        }
        break;
      }
      case "deadLettered": {
        const from = whereIs(e.id, (s) => s.key === qKey(e.from, e.id) || s.key.startsWith("h:"));
        if (!from) break;
        // A full queue pushes its oldest message out when the new one arrives, not before.
        const arrivals = e.reason === "maxlen" ? [...plan.arrive].filter(([k]) => queueOf(k) === e.from).map(([, t]) => t) : [];
        const t0 = Math.max(from.t, ...arrivals);
        if (e.to === null) {
          // Nowhere to go: it is dropped where it stood.
          leave(from, "drop", t0);
          break;
        }
        leave(from, "leave", t0);
        const dlx = (prev.queues[e.from] ?? cur.queues[e.from])?.args.dlx;
        const ex = dlx ? here.exchange(dlx) : null;
        let at = from.xy;
        let t = t0;
        if (ex) {
          ghost(`${e.id}-dlx-${i}`, e.id, [from.xy, ex], [t0, t0 + LEG], "land");
          at = ex;
          t = t0 + LEG;
        }
        // The dead letter exchange routes it like any exchange: a fanout one copies it to each bound queue.
        const targets = new Set<string>([e.to]);
        for (const q of here.queues) if (q !== e.from && cur.queues[q]?.ready.some((m) => m.id === e.id) && !locate(prev, before, e.id).some((s) => s.key === qKey(q, e.id))) targets.add(q);
        for (const q of targets) {
          const land = landing(i, e.id, q);
          if (!land) continue;
          intoQueue(`${e.id}-dead-${q}-${i}`, e.id, at, q, land, t, LEG);
          if (land.kept) reach(e.id, { key: qKey(q, e.id), xy: land.xy, t: t + LEG, stays: false });
        }
        break;
      }
      case "restarted": {
        // Consumers disconnect: what they held unacked goes back to the head of its queue.
        for (const q of here.queues) {
          const queue = cur.queues[q];
          if (!queue || queue.type === "stream") continue;
          queue.ready.forEach((m, idx) => {
            const held = whereIs(m.id, (s) => s.key.startsWith("h:"));
            const dest = here.slot(q, idx);
            if (!held || !dest) return;
            viaHead(`${m.id}-restart-${i}`, m.id, q, dest, held.xy, 0, true);
            leave(held, "leave", 0);
            reach(m.id, { key: qKey(q, m.id), xy: dest, t: HOP, stays: false });
            touch(q, HOP - 0.2);
          });
        }
        break;
      }
      case "confirmed": {
        const a = answers.get(e.id);
        if (opts.confirms && a) plan.tokens.push({ key: `${e.id}-confirm-${i}`, ok: e.ok, from: a.from, to: a.to, t0: a.t });
        break;
      }
      default:
        break;
    }
  });
  return plan;
}
