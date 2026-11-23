import { AnimatePresence, motion } from "motion/react";
import { Person, TINTS, type Shades, type Tint } from "@lets-explain/core/iso/shapes";
import { effectiveArgs, depth, nodeAlive, queueAvailable, type Broker, type BrokerEvent, type ExchangeType, type Message, type Queue } from "../engine/broker";
import { bend, choreograph, hKey, LEG, qKey, type Fate, type Ghost, type Places, type Pt, type Token } from "./choreography";
import {
  AckStamp,
  appear,
  CARDBOARD,
  Chute,
  Desk,
  Envelope,
  GREYED,
  handAt,
  Held,
  iso,
  Laptop,
  Ledger,
  LEDGER_STEP,
  LG,
  Machine,
  Mailbox,
  MB,
  MX,
  ON_FACE,
  Path,
  Receipt,
  RETURNED,
  Sign,
  SLOT_STEP,
  SLOTS,
  Tag,
  WasteBin,
  type Kind,
  type LetterMarks,
  type MailboxLook,
} from "./mailroom-parts";
import "./mailroom.css";

/**
 * The broker drawn as a post room. The app drops each letter into the hopper of a sorting
 * machine (the exchange); the machine has one slot per binding, and each slot feeds a chute
 * with its binding key on a sign, down to a curbside mailbox (the queue). Letters wait in line
 * inside the mailbox, visible through its side window, head at the door. A clerk at a desk
 * (the consumer) holds the letters it has not acked yet, on a tray with one place per prefetch.
 * A letter that matches no binding drops out of the machine into the waste bin.
 *
 * The same room shows the rest of RabbitMQ: a queue that collects dead letters is a red
 * "returned mail" box; a transient queue is a cardboard box; a quorum queue is the mailbox with
 * its two copies behind it (greyed while their node is down); a stream is a pigeonhole cabinet
 * that keeps every letter, numbered by offset. Letters carry their marks: a postmark with the
 * delivery count when they come back, a timer while a TTL runs, a seal when persistent.
 *
 * Every motion comes from the broker's events (see choreography.ts); this file only bends the
 * paths to follow the drawing (into the hopper, out of the slot of the matching binding, along
 * its chute).
 */

export const MAILROOM_STAGE = { width: 860, height: 470 };

export interface ProducerSpec {
  id: string;
  label: string;
  /** Which exchange it publishes to ("" sends straight to the queue it names, through the default exchange). */
  exchange: string;
  /** For the default exchange: the queue it targets. */
  queue?: string;
}

export interface BrokerLayout {
  producers: ProducerSpec[];
  /** Exchanges to draw, in order. Defaults to every exchange the lesson declared. */
  exchanges?: string[];
  queues?: string[];
  /** Consumer tags in order. Defaults to all, by name. */
  consumers?: string[];
  /** Friendly names for consumers, by tag. */
  consumerNames?: Record<string, string>;
}

export interface BrokerLabels {
  unacked: string;
  ready: string;
  prefetch: string;
  noLimit: string;
  down: string;
  lost: string;
  /** The red mailbox where dead letters collect. */
  returned?: string;
  consumers?: string;
}

interface Props {
  broker: Broker;
  layout: BrokerLayout;
  labels: BrokerLabels;
  /** Events of the last action, to animate what moved. */
  last: BrokerEvent[];
  /** The state before the last action: where each letter came from. */
  prev?: Broker;
  /** Every event so far: which machine's bin each lost letter fell into. */
  history?: BrokerEvent[];
  /** The publisher uses confirms: the broker's receipt (ack / nack) flies back to it. */
  confirms?: boolean;
  /** Persistent letters sealed, transient ones loose paper notes. */
  persistence?: boolean;
  /** A gauge board over each mailbox: ready, unacked and consumers. */
  gauges?: boolean;
  kindOf?: (m: Message) => Kind;
  box?: { x: number; y: number; w: number; h: number };
}

/* ------------------------------------------------------------------ helpers */

/** Gives each events array a stable number, so the moving letters replay once per action. */
const actionIds = new WeakMap<object, number>();
let nextActionId = 1;
export function actionId(last: BrokerEvent[]): number {
  let id = actionIds.get(last);
  if (id === undefined) {
    id = nextActionId++;
    actionIds.set(last, id);
  }
  return id;
}

const EX_SHADES: Record<ExchangeType, Shades> = {
  direct: ["var(--peach)", "var(--peach-mid)", "var(--peach-deep)"],
  fanout: ["var(--lilac)", "#a993ee", "var(--lilac-deep)"],
  topic: ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"],
  headers: ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"],
};
const MAILBOX_SHADES: Shades[] = [
  ["var(--lilac)", "#a993ee", "var(--lilac-deep)"],
  ["var(--sun)", "#f2bd3a", "#d9a826"],
  ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"],
  ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"],
];
const CONSUMER_TINTS: Tint[] = [TINTS.coral, TINTS.lilac, TINTS.sun, TINTS.mint];

function column(n: number, top: number, bottom: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(top + bottom) / 2];
  const gap = (bottom - top) / (n - 1);
  return Array.from({ length: n }, (_, i) => top + i * gap);
}

/** Moves wanted heights apart so neighbours keep `gap` (less if the range is too short), inside [lo, hi]. */
function spreadOut(want: number[], gap: number, lo: number, hi: number): number[] {
  const n = want.length;
  if (n === 0) return [];
  const g = n > 1 ? Math.min(gap, (hi - lo) / (n - 1)) : 0;
  const order = want.map((_, i) => i).sort((a, b) => want[a]! - want[b]! || a - b);
  const out = [...want];
  order.forEach((i, j) => {
    out[i] = j === 0 ? Math.max(lo, want[i]!) : Math.max(want[i]!, out[order[j - 1]!]! + g);
  });
  for (let j = n - 1; j >= 0; j--) {
    const i = order[j]!;
    out[i] = Math.min(out[i]!, j === n - 1 ? hi : out[order[j + 1]!]! - g);
  }
  return out.map((y) => Math.max(lo, y));
}

/** A point on the S-curve the chutes and paths are drawn with (see bend in choreography.ts). */
function curveAt(a: Pt, b: Pt, t: number): Pt {
  const mx = (a[0] + b[0]) / 2;
  const u = 1 - t;
  return [u * u * u * a[0] + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * b[1]];
}

/** Half the width of a Tag with this text (see Tag). */
const tagHalf = (text: string) => Math.round(text.length * 12.5 * 0.6 + 20) / 2;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Exchanges whose letters end up as dead letters: some queue's dead letter exchange. */
function deadLetterExchanges(b: Broker): Set<string> {
  const out = new Set<string>();
  for (const q of Object.values(b.queues)) {
    const dlx = effectiveArgs(b, q).dlx;
    if (dlx) out.add(dlx);
  }
  return out;
}

/* ------------------------------------------------------------------ geometry */

function geometry(broker: Broker, layout: BrokerLayout, box: { x: number; y: number; w: number; h: number }) {
  const exNames = (layout.exchanges ?? Object.keys(broker.exchanges).filter((n) => n && !n.startsWith("amq."))).filter((n) => broker.exchanges[n]);
  const qNames = (layout.queues ?? Object.keys(broker.queues)).filter((n) => broker.queues[n]);
  const cTags = (layout.consumers ?? Object.keys(broker.consumers).sort()).filter((t) => broker.consumers[t]);
  const sy = box.h / MAILROOM_STAGE.height;
  /** Copies drawn behind a quorum queue's mailbox: one per follower, at most two. */
  const replicas = (q: string) => {
    const queue = broker.queues[q];
    return queue?.type === "quorum" ? Math.min(2, queue.members.length - 1) : 0;
  };
  const bound = (ex: string, q: string) => broker.bindings.some((b) => b.exchange === ex && b.queue === q);

  // Mailboxes shrink when more queues have to share the height.
  const nQ = Math.max(qNames.length, 1);
  // Three or more mailboxes stack closer: each one's name, counts and settings go beside it,
  // to its right when nobody reads from the room, else under its back, left of the post.
  const labelSide: "below" | "left" | "right" = qNames.length < 3 ? "below" : cTags.length === 0 ? "right" : "left";
  // A narrow room (a panel beside it) scales the furniture down with it.
  const sx = Math.min(1, 0.4 + (0.6 * box.w) / MAILROOM_STAGE.width);
  const k =
    sx *
    (labelSide === "below"
      ? Math.max(0.42, Math.min(1, (box.h - 84 - 86 * (nQ - 1)) / (150 * nQ)))
      : labelSide === "left"
        ? Math.max(0.36, Math.min(0.8, (box.h - 66 - 58 * (nQ - 1)) / (150 + 96 * (nQ - 1))))
        : Math.max(0.36, Math.min(0.85, (box.h - 56) / (150 + 165 * (nQ - 1)))));
  const ms = MB.s * k;
  const MP = iso(ms);
  const hasEx = exNames.length > 0;
  // Clerks stand at the right edge; the mailboxes keep clear of their desks.
  const xC = box.x + box.w - 60;
  const xQ =
    labelSide === "right"
      ? box.x + box.w - 94 * k - 196 - (qNames.some((q) => replicas(q) > 0) ? 3.5 * MB.s * k : 0)
      : Math.min(box.x + box.w * (!hasEx ? 0.52 : labelSide === "left" ? 0.72 : 0.7), cTags.length ? xC - 104 - 94 * k : Infinity);
  const yQ =
    qNames.length === 1
      ? [box.y + box.h / 2 + 40 * sy]
      : labelSide === "below"
        ? column(qNames.length, box.y + 26 + 150 * k, box.y + box.h - 58)
        : column(qNames.length, box.y + (labelSide === "left" ? 30 : 18) + 150 * k, box.y + box.h - (labelSide === "left" ? 36 : 24));
  const qAt = (n: string): Pt => [xQ, yQ[qNames.indexOf(n)]!];
  const isStream = (q: string) => broker.queues[q]?.type === "stream";

  /** Inside the mailbox, along its window: the head (i = 0) next to the door. A stream's cabinet counts from the left. */
  const slotLocal = (q: string, i: number): Pt =>
    isStream(q) ? MP(-LG.L / 2 + 0.65 + Math.min(i, SLOTS - 1) * LEDGER_STEP, LG.d, LG.z0 + LG.h * 0.55) : MP(MB.L / 2 - 0.95 - Math.min(i, SLOTS - 1) * SLOT_STEP, MB.d / 2, MB.z0 + MB.h * 0.48);
  const tailLocal = (q: string): Pt => (isStream(q) ? MP(-LG.L / 2 - 0.2, LG.d / 2, LG.z0 + LG.h * 0.6) : MP(-MB.L / 2, MB.d / 2, MB.z0 + MB.h * 0.5));
  const headLocal = (q: string): Pt => (isStream(q) ? MP(LG.L / 2 + 0.4, LG.d / 2, LG.z0 + LG.h * 0.5) : MP(MB.L / 2 + 0.5, 0, MB.z0 + MB.h * 0.42));
  /** The top of the drawing, for labels above it. */
  const topLocal = (q: string) => (isStream(q) ? -(LG.L / 2) * ms * 0.5 - (LG.z0 + LG.h) * ms : -(MB.L / 2 + MB.d / 2) * ms * 0.5 - (MB.z0 + MB.h + MB.d / 2) * ms);

  // Machines: each one level with the mailboxes it feeds.
  const nE = Math.max(exNames.length, 1);
  const kE = sx * Math.min(1, 1.25 / nE + 0.25, Math.max(0.62, sy));
  const es = MX.s * kE;
  const EP = iso(es);
  const xE = box.x + box.w * 0.275;
  const eLo = box.y + 100 * kE;
  const eHi = box.y + box.h - 66 * kE;
  const eFree = column(exNames.length, box.y + 150, box.y + box.h - 70);
  const eWant = exNames.map((ex, i) => {
    const ys = qNames.filter((q) => bound(ex, q)).map((q) => qAt(q)[1]);
    return ys.length ? mean(ys) - 18 : eFree[i]!;
  });
  const yE = exNames.length === 1 && !qNames.some((q) => bound(exNames[0]!, q)) ? [box.y + 272 * sy] : spreadOut(eWant, 225 * kE, eLo, eHi);
  const exAt = (n: string): Pt => [xE, yE[exNames.indexOf(n)]!];
  const mouthLocal = EP(0, 0, MX.h + MX.hop * 0.9);
  const binLocal = EP(-0.9, MX.d / 2 + 1.25, 0);
  const rejectLocal = EP(-0.75, MX.d / 2, 0.5);

  // Producers: level with the mailbox they send to, or just above their machine's hopper.
  const xP = box.x + 56;
  const pWant = layout.producers.map((p, i) => {
    if (p.exchange === "" && p.queue && qNames.includes(p.queue)) return qAt(p.queue)[1] + tailLocal(p.queue)[1] + 30;
    if (exNames.includes(p.exchange)) return exAt(p.exchange)[1] - 50 * kE;
    return column(layout.producers.length, box.y + 130, box.y + box.h - 80)[i]!;
  });
  const yP = spreadOut(pWant, 128, box.y + 86, box.y + box.h - 46);

  // Clerks: grouped beside the mailbox they read from.
  const cFree = column(cTags.length, box.y + 120, box.y + box.h - 70);
  const cWant = cTags.map((t, i) => {
    const q = broker.consumers[t]!.queue;
    if (!qNames.includes(q)) return cFree[i]!;
    const mates = cTags.filter((x) => broker.consumers[x]!.queue === q);
    return qAt(q)[1] + 26 * k + (mates.indexOf(t) - (mates.length - 1) / 2) * 140;
  });
  const yC = spreadOut(cWant, 140, box.y + 82, box.y + box.h - 58);

  // One chute per exchange–queue pair, each from its own slot on the machine's right face.
  const lanes = new Map<string, { ex: string; q: string; from: Pt; to: Pt; lines: string[] }>();
  const slotYs = new Map<string, number[]>();
  const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
  for (const ex of exNames) {
    const type = broker.exchanges[ex]!.type;
    const mine = qNames.filter((q) => bound(ex, q));
    const ys = mine.map((_, i) => (mine.length === 1 ? 0 : -0.78 + (1.56 * i) / (mine.length - 1)));
    slotYs.set(ex, ys);
    mine.forEach((q, i) => {
      const own = broker.bindings.filter((b) => b.exchange === ex && b.queue === q);
      let lines: string[] = [];
      if (type === "headers") {
        lines = own.flatMap((b) => [`x-match: ${b.match ?? "all"}`, Object.entries(b.headers ?? {}).map(([kk, v]) => `${kk}=${v}`).join(", ")]);
      } else if (type !== "fanout") {
        const keys = [...new Set(own.map((b) => b.key).filter(Boolean))].join(" · ");
        if (keys) lines = [keys];
      }
      lanes.set(`${ex}\u0000${q}`, { ex, q, from: add(exAt(ex), EP(MX.w / 2, ys[i]!, 1.05)), to: add(qAt(q), tailLocal(q)), lines: lines.filter(Boolean) });
    });
  }

  const places: Places = {
    queues: qNames,
    consumers: cTags,
    producer: (exchange, routingKey) => {
      const i = layout.producers.findIndex((x) => x.exchange === exchange && (x.exchange !== "" || x.queue === routingKey));
      return i >= 0 ? [xP + 6, yP[i]! - 30] : null;
    },
    exchange: (name) => (exNames.includes(name) ? add(exAt(name), mouthLocal) : null),
    slot: (queue, i) => (qNames.includes(queue) ? add(qAt(queue), slotLocal(queue, i)) : null),
    hand: (tag, k2) => {
      const i = cTags.indexOf(tag);
      return i >= 0 ? add([xC, yC[i]!], handAt(k2)) : null;
    },
    tail: (queue) => (qNames.includes(queue) ? add(qAt(queue), tailLocal(queue)) : null),
    head: (queue) => (qNames.includes(queue) ? add(qAt(queue), headLocal(queue)) : null),
  };
  return { exNames, qNames, cTags, labelSide, k, ms, es, kE, xP, yP, xE, xQ, xC, yC, exAt, qAt, slotLocal, tailLocal, headLocal, topLocal, lanes, slotYs, binLocal, rejectLocal, places };
}

type Geo = ReturnType<typeof geometry>;

/* ------------------------------------------------------------------ paths */

const near = (a: Pt | null | undefined, b: Pt | null | undefined) => Boolean(a && b && Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01);

/** Times along a path, proportional to distance travelled. */
function byLength(pts: Pt[], t0: number, t1: number): number[] {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const total = d.at(-1)! || 1;
  return d.map((x) => t0 + ((t1 - t0) * x) / total);
}

/**
 * The choreography's flights, bent to the drawing. Who moves, where to and when stays exactly
 * as planned; only the route changes: letters drop into the hopper from above, copies leave
 * through the slot of their binding and ride its chute, a letter no binding wants leaves by the
 * reject flap (into the bin, or on to the alternate exchange's hopper).
 */
function reshape(ghosts: Ghost[], g: Geo, bins: Set<string>): Ghost[] {
  const mouths = g.exNames.map((n) => [n, g.places.exchange(n)!] as const);
  const mouthAt = (p: Pt) => mouths.find(([, m]) => near(p, m))?.[0];
  const lift = (m: Pt): Pt => [m[0] - 8, m[1] - 46 * (g.es / MX.s)];
  const flap = (ex: string): Pt => {
    const at = g.exAt(ex);
    return [at[0] + g.rejectLocal[0] - 14 * g.kE, at[1] + g.rejectLocal[1] + 10 * g.kE];
  };
  const out: Ghost[] = [];
  for (const gh of ghosts) {
    const { pts, ts } = gh;
    // A copy leaving an exchange for a queue: out of its slot, along its chute.
    const ex = mouthAt(pts[0]!);
    if (ex) {
      const qi = pts.findIndex((p, i) => i > 0 && g.qNames.some((q) => near(p, g.places.tail(q)) && g.lanes.has(`${ex}\u0000${q}`)));
      if (qi > 0) {
        const q = g.qNames.find((x) => near(pts[qi], g.places.tail(x)))!;
        const lane = g.lanes.get(`${ex}\u0000${q}`)!;
        const road = [lane.from, ...bend(lane.from, lane.to), lane.to];
        out.push({ ...gh, pts: [...road, ...pts.slice(qi + 1)], ts: [...byLength(road, ts[0]! + 0.08, ts[qi]!), ...ts.slice(qi + 1)] });
        continue;
      }
    }
    // Unroutable and not returned: in through the hopper, then out of the reject flap into the bin.
    const last = pts.at(-1)!;
    const lastEx = mouthAt(last);
    if (gh.end === "drop" && lastEx && pts.length === 2 && bins.has(lastEx)) {
      const t1 = ts[1]!;
      out.push({ ...gh, pts: [pts[0]!, lift(last), last], ts: [ts[0]!, ts[0]! + (t1 - ts[0]!) * 0.72, t1], end: "land" });
      const at = g.exAt(lastEx);
      const from: Pt = [at[0] + g.rejectLocal[0], at[1] + g.rejectLocal[1]];
      const bin: Pt = [at[0] + g.binLocal[0], at[1] + g.binLocal[1] - 34 * (g.es / MX.s)];
      out.push({ ...gh, key: `${gh.key}-bin`, pts: [from, bin], ts: [t1 + 0.1, t1 + 0.42], end: "drop" });
      continue;
    }
    // Anything reaching an exchange arrives over the hopper rim; anything leaving one, the same
    // way; from one machine to its alternate, out of the reject flap and into the next hopper.
    const p2: Pt[] = [pts[0]!];
    const t2: number[] = [ts[0]!];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const ea = mouthAt(a);
      const eb = mouthAt(b);
      const dt = ts[i]! - ts[i - 1]!;
      if (ea && eb) {
        p2.push(flap(ea), lift(b));
        t2.push(ts[i - 1]! + dt * 0.25, ts[i - 1]! + dt * 0.75);
      } else if (eb) {
        p2.push(lift(b));
        t2.push(ts[i - 1]! + dt * 0.72);
      } else if (ea) {
        p2.push(lift(a));
        t2.push(ts[i - 1]! + dt * 0.28);
      }
      p2.push(b);
      t2.push(ts[i]!);
    }
    out.push({ ...gh, pts: p2, ts: t2 });
  }
  return out;
}

/* ------------------------------------------------------------------ stage */

export function MailroomStage({ broker, layout, labels, last, prev, history, confirms, persistence, gauges, kindOf = () => "order", box = { x: 0, y: 0, w: 860, h: 470 } }: Props) {
  const g = geometry(broker, layout, box);
  const { exNames, qNames, cTags, xP, yP, xC, yC, exAt, qAt } = g;
  const before = geometry(prev ?? broker, layout, box).places;
  const plan = choreograph({ prev: prev ?? broker, cur: broker, last: prev ? last : [], before, here: g.places, confirms });
  const fateOf = (key: string): Fate | undefined => plan.fates.get(key);

  // Waste bins: beside every machine an app publishes to, and wherever a lost letter fell.
  const fedBy = new Set(layout.producers.map((p) => p.exchange).filter((e) => exNames.includes(e)));
  const fellIn = new Map<string, string>();
  const droppedInBox = new Set<string>();
  for (const e of history ?? []) {
    if (e.type === "unroutable" && !e.returned) fellIn.set(e.id, e.exchange);
    if (e.type === "deadLettered" && e.to === null) droppedInBox.add(e.id);
  }
  const fallback = [...fedBy].find((e) => !broker.exchanges[e]!.alternate) ?? [...fedBy][0];
  const binOf = (b: Broker) => {
    const m = new Map<string, number>();
    for (const x of b.lost) {
      if (x.reason !== "unroutable" || droppedInBox.has(x.id)) continue;
      const ex = fellIn.get(x.id) ?? fallback;
      if (ex && exNames.includes(ex)) m.set(ex, (m.get(ex) ?? 0) + 1);
    }
    return m;
  };
  const balls = binOf(broker);
  const ballsBefore = prev ? binOf(prev) : balls;
  const bins = new Set([...[...fedBy].filter((e) => !broker.exchanges[e]!.alternate), ...balls.keys()]);
  const ghosts = reshape(plan.ghosts, g, bins);
  // A ball lands in the bin when the letter that makes it falls in, not before.
  const binAt = Math.max(0, ...ghosts.filter((gh) => gh.key.endsWith("-bin")).map((gh) => gh.ts.at(-1)! + 0.35));

  const dead = deadLetterExchanges(broker);
  const isReturned = (q: string) => broker.bindings.some((b) => b.queue === q && dead.has(b.exchange));
  const marks = (m: Message, q?: Queue): LetterMarks => {
    const out: LetterMarks = {};
    if (m.redelivered) out.again = Math.max(2, m.deliveryCount + 1);
    if (persistence) {
      if (m.persistent) out.seal = true;
      else out.note = true;
    }
    if (m.correlationId) out.corr = m.correlationId;
    if (q && q.type !== "stream") {
      const qt = effectiveArgs(broker, q).ttl;
      const ttl = qt === undefined ? m.ttl : m.ttl === undefined ? qt : Math.min(qt, m.ttl);
      if (ttl !== undefined) out.ttl = ttl - (broker.time - m.publishedAt);
    }
    return out;
  };

  // The clerks' stamps: each acked letter is stamped where it lies, just before it goes.
  const stamps: { key: string; at: Pt; t: number }[] = [];
  last.forEach((e, i) => {
    if (e.type !== "acked") return;
    for (const id of e.ids) {
      const f = plan.fates.get(hKey(e.tag, id));
      const k2 = (prev ?? broker).consumers[e.tag]?.unacked.findIndex((m) => m.id === id) ?? -1;
      const at = k2 >= 0 ? before.hand(e.tag, k2) : null;
      if (f && at) stamps.push({ key: `${id}-stamp-${i}`, at, t: f.at });
    }
  });

  return (
    <g className="broker mailroom">
      {/* Producer → hopper: a dashed flight line; default-exchange producers go straight to their mailbox. */}
      {layout.producers.map((p, i) => {
        const from: Pt = [xP + 24, yP[i]! - 30];
        if (p.exchange === "" && p.queue && qNames.includes(p.queue)) return <Path key={p.id} from={from} to={g.places.tail(p.queue)!} dashed label="default" />;
        if (!exNames.includes(p.exchange)) return null;
        const m = g.places.exchange(p.exchange)!;
        return <path key={p.id} d={`M${from[0]} ${from[1]} Q ${(from[0] + m[0]) / 2} ${m[1] - 60 * (g.es / MX.s)}, ${m[0] - 10} ${m[1] - 40 * (g.es / MX.s)}`} className="mr-throw" />;
      })}

      {/* Chutes: one per binding pair, from the machine's slot to the mailbox's back. */}
      {[...g.lanes.values()].map((ln) => (
        <Chute key={`${ln.ex}-${ln.q}`} from={ln.from} to={ln.to} />
      ))}
      {/* An alternate exchange: what no binding wants leaves by the reject flap for the next machine. */}
      {exNames.map((name) => {
        const alt = broker.exchanges[name]!.alternate;
        if (!alt || !exNames.includes(alt) || alt === name) return null;
        const a = exAt(name);
        const m = g.places.exchange(alt)!;
        const from: Pt = [a[0] + g.rejectLocal[0] - 14 * g.kE, a[1] + g.rejectLocal[1] + 10 * g.kE];
        const to: Pt = [m[0] - 8, m[1] - 46 * g.kE];
        const bulge = Math.min(from[0], to[0]) - 95 * g.kE;
        return (
          <g key={`alt-${name}`}>
            <path d={`M${from[0]} ${from[1]} C ${bulge} ${from[1] + 30}, ${bulge} ${to[1] - 30}, ${to[0]} ${to[1]}`} className="road is-dashed" />
            <Tag x={bulge - 30} y={(from[1] + to[1]) / 2} text="alternate" fill="var(--sun-soft)" small />
          </g>
        );
      })}
      {/* Clerks read from their mailbox's door. */}
      {cTags.map((t, i) => {
        const c = broker.consumers[t]!;
        if (!qNames.includes(c.queue)) return null;
        return <Path key={`c-${t}`} from={g.places.head(c.queue)!} to={[xC - 62, yC[i]! - 10]} dashed />;
      })}

      {layout.producers.map((p, i) => (
        <g key={p.id} transform={`translate(${xP} ${yP[i]!})`}>
          <Person tint={TINTS.sky} scale={1.4} carrying={<Envelope kind="neutral" w={20} />} />
          <Laptop />
          <Tag x={Math.max(0, box.x + tagHalf(p.label) + 12 - xP)} y={28} text={p.label} fill="var(--sky-soft)" />
        </g>
      ))}

      {exNames.map((name) => {
        const ex = broker.exchanges[name]!;
        const [x, y] = exAt(name);
        return (
          <g key={name} transform={`translate(${x} ${y})`}>
            <Machine s={g.es} shades={EX_SHADES[ex.type]} name={name} slots={g.slotYs.get(name) ?? []} />
            {bins.has(name) && <WasteBin s={g.es} at={g.binLocal} lost={balls.get(name) ?? 0} before={ballsBefore.get(name) ?? 0} landsAt={binAt} />}
            <Tag y={(MX.w + MX.d) * g.es * 0.25 + 22} x={g.es * 1.1} text={`${ex.type} exchange`} fill={EX_SHADES[ex.type][0]} small />
          </g>
        );
      })}

      {/* A queue that goes away (deleted, or a transient one at a restart) fades out where it stood. */}
      <AnimatePresence initial={false}>
      {qNames.map((name, qi) => {
        const q = broker.queues[name]!;
        const [x, y] = qAt(name);
        const d = depth(broker, name);
        const up = queueAvailable(broker, q);
        const stream = q.type === "stream";
        const items = stream ? q.log : q.ready;
        const shown = items.slice(0, SLOTS);
        const args = effectiveArgs(broker, q);
        const returned = isReturned(name);
        const look: MailboxLook = returned ? "returned" : q.durable ? "paint" : "cardboard";
        const paint = MAILBOX_SHADES[qi % MAILBOX_SHADES.length]!;
        const shades = look === "returned" ? RETURNED : look === "cardboard" ? CARDBOARD : paint;
        const chips: string[] = [];
        if (q.type !== "classic") chips.push(q.type);
        if (args.ttl !== undefined) chips.push(`TTL ${args.ttl}`);
        if (args.maxLength !== undefined) chips.push(`max ${args.maxLength}${args.overflow === "reject-publish" ? " (reject)" : ""}`);
        if (args.deliveryLimit !== undefined && q.type === "quorum") chips.push(`limit ${args.deliveryLimit}`);
        if (args.dlx !== undefined) chips.push(`DLX → ${args.dlx || "default"}`);
        if (!q.durable) chips.push("transient");
        const shift = plan.shift.get(name) ?? 0;
        // The flag goes up when the first letter is in, not when the publish starts.
        const flagAt = shown.length ? Math.min(...shown.map((m) => plan.arrive.get(qKey(name, m.id)) ?? 0)) : 0;
        // A quorum queue's copies stand behind it (up and to the right): labels above clear them.
        const nRep = q.type === "quorum" ? Math.min(2, q.members.length - 1) : 0;
        const topY = y + g.topLocal(name) - 0.875 * nRep * g.ms;
        const topX = x + 0.875 * nRep * g.ms;
        // Where the name, counts and settings go (see labelSide).
        const side = g.labelSide;
        // A queue that is down says so on its name tag.
        const nameText = !up ? `${name} · ${labels.down}` : returned && labels.returned ? `${name} · ${labels.returned}` : name;
        const rx = x + (4.1 + 1.75 * nRep) * g.ms + 10;
        const ry = y - 34 * g.k - 4;
        const tagW = Math.round(nameText.length * 12.5 * 0.6 + 20);
        // Under a mailbox the name hangs on its post; a cabinet stands lower, so it goes below its feet.
        const under = stream ? (LG.L / 2 + LG.d) * g.ms * 0.5 + 12 : 22;
        const lEnd = x - 30;
        const lx = side === "left" ? lEnd - tagW / 2 : side === "right" ? rx + tagW / 2 : x;
        const anchor = side === "right" ? "start" : side === "left" ? "end" : "middle";
        const dx = side === "right" ? rx : side === "left" ? lEnd : lx;
        const letters = (
          <AnimatePresence initial={false} custom={fateOf}>
            {shown.map((m, i) => (
              <Held key={m.id} place={qKey(name, m.id)} x={g.slotLocal(name, i)[0]} y={g.slotLocal(name, i)[1]} arrive={plan.arrive.get(qKey(name, m.id))} shift={shift}>
                <g transform={ON_FACE}>
                  <Envelope kind={kindOf(m)} label={m.body.slice(0, 3)} w={26 * Math.max(g.k, 0.7)} {...marks(m, q)} />
                </g>
              </Held>
            ))}
          </AnimatePresence>
        );
        // A quorum queue's copies stand behind it, one per follower; a copy on a node that is down is greyed.
        // The front box is the leader: the model keeps a down leader's name until a re-election, so
        // a live member stands in front once the queue works again (as the node cards show it).
        const leader = nodeAlive(broker, q.node) ? q.node : (q.members.find((n) => nodeAlive(broker, n)) ?? q.node);
        const followers = q.type === "quorum" ? q.members.filter((n) => n !== leader).slice(0, 2) : [];
        return (
          <motion.g key={name} className={up ? "" : "is-down"} exit={{ opacity: 0, transition: { duration: 0.45 } }}>
            <g transform={`translate(${x} ${y})`}>
              {followers
                .map((n, i) => ({ n, i }))
                .reverse()
                .map(({ n, i }) => {
                  const [ox, oy] = iso(g.ms)(0, -1.75 * (i + 1), 0);
                  return (
                    <g key={n} transform={`translate(${ox} ${oy})`} className="mr-replica">
                      <Mailbox s={g.ms} shades={nodeAlive(broker, n) ? shades : GREYED} look={look} flagUp={false} flagAt={0} />
                    </g>
                  );
                })}
              {stream ? (
                <Ledger s={g.ms} shades={paint} count={items.length}>
                  {letters}
                </Ledger>
              ) : (
                <Mailbox s={g.ms} shades={shades} look={look} flagUp={items.length > 0} flagAt={flagAt} capacity={args.maxLength} slotAt={(i) => g.slotLocal(name, i)}>
                  {letters}
                </Mailbox>
              )}
              {items.length > SLOTS && (
                <text x={g.tailLocal(name)[0] - 8} y={g.tailLocal(name)[1] + 4} textAnchor="end" className="q-more">
                  +{items.length - SLOTS}
                </text>
              )}
            </g>
            <Tag x={lx} y={side === "below" ? y + under : side === "left" ? y + 8 : ry} text={nameText} fill={returned || !up ? "var(--red-soft)" : "var(--card)"} />
            <text x={dx} y={side === "below" ? y + under + 24 : side === "left" ? y + 31 : ry + 24} textAnchor={anchor} className="q-depth">
              {stream ? `${items.length} log` : `${labels.ready} ${d.ready} · ${labels.unacked} ${d.unacked}`}
            </text>
            {chips.length > 0 && (
              <text x={side === "below" ? topX : dx} y={side === "below" ? topY - 10 : side === "left" ? y - 12 : ry + 41} textAnchor={anchor} className="q-chips">
                {chips.join(" · ")}
              </text>
            )}
            {gauges && <Gauges x={x} y={topY - (chips.length && side === "below" ? 30 : 12)} broker={broker} queue={name} labels={labels} />}
          </motion.g>
        );
      })}
      </AnimatePresence>

      {/* Binding keys on signs over their chutes. */}
      {[...g.lanes.values()].map((ln) => {
        if (!ln.lines.length) return null;
        // A little past the middle, where the chutes have spread apart and the machine's label is behind.
        // On a short chute the sign would cover its ends: it hangs above the chute instead.
        const wide = Math.max(...ln.lines.map((x) => x.length)) * 7.5 + 20;
        const short = Math.abs(ln.to[0] - ln.from[0]) < wide + 40;
        const [px, py] = short ? [(ln.from[0] + ln.to[0]) / 2, Math.min(ln.from[1], ln.to[1]) - 14 - ln.lines.length * 11] : curveAt(ln.from, ln.to, 0.62);
        return <Sign key={`k-${ln.ex}-${ln.q}`} x={px} y={py} lines={ln.lines} />;
      })}

      {cTags.map((t, i) => {
        const c = broker.consumers[t]!;
        const tint = CONSUMER_TINTS[i % CONSUMER_TINTS.length]!;
        const busy = c.unacked.length > 0;
        const q = broker.queues[c.queue];
        return (
          <g key={t} transform={`translate(${xC} ${yC[i]!})`}>
            <Person tint={tint} scale={1.25} state={busy ? "busy" : "idle"} />
            <Desk places={c.autoAck ? 0 : c.prefetch} />
            <AnimatePresence initial={false} custom={fateOf}>
              {c.unacked.slice(0, 4).map((m, k2) => (
                <Held key={`${m.id}:${broker.deliveries.filter((dd) => dd.tag === t && dd.id === m.id).length}`} place={hKey(t, m.id)} x={handAt(k2)[0]} y={handAt(k2)[1]} arrive={plan.arrive.get(hKey(t, m.id))} shift={0}>
                  <Envelope kind={kindOf(m)} label={m.body.slice(0, 2)} w={22} {...marks(m)} ttl={undefined} corr={q?.type === "stream" ? undefined : m.correlationId} />
                </Held>
              ))}
            </AnimatePresence>
            {c.unacked.length > 4 && (
              <text x={-70} y={-20} textAnchor="end" className="q-more">
                +{c.unacked.length - 4}
              </text>
            )}
            <Tag x={Math.min(0, box.x + box.w - tagHalf(layout.consumerNames?.[t] ?? t) - 12 - xC)} y={28} text={layout.consumerNames?.[t] ?? t} fill={tint.soft} />
            <text x={Math.min(0, box.x + box.w - 72 - xC)} y={52} textAnchor="middle" className="c-meta">
              {c.autoAck ? "auto-ack" : `${labels.prefetch} ${c.prefetch === 0 ? labels.noLimit : c.prefetch} · ${c.unacked.length}`}
            </text>
          </g>
        );
      })}

      {/* The lost count sits under the bin; with no bin in the room, the counters above carry it. */}
      {broker.lost.length > 0 &&
        (() => {
          const at = [...bins].find((e) => (balls.get(e) ?? 0) > 0) ?? [...bins][0];
          return at ? <Tag x={exAt(at)[0] + g.binLocal[0]} y={exAt(at)[1] + g.binLocal[1] + 22} text={`${labels.lost}: ${broker.lost.length}`} fill="var(--red-soft)" small /> : null;
        })()}

      <g key={actionId(last)}>
        {ghosts.map((gh) => (
          <Flight key={gh.key} ghost={gh} kind={kindOf(gh.msg)} marks={marks(gh.msg)} />
        ))}
        {stamps.map((s) => (
          <Stamp key={s.key} at={s.at} t={s.t} />
        ))}
        {plan.tokens.map((tk) => (
          <Answer key={tk.key} token={tk} />
        ))}
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ moving things */

function Flight({ ghost, kind, marks }: { ghost: Ghost; kind: Kind; marks: LetterMarks }) {
  const { pts, ts, end } = ghost;
  const t0 = ts[0]!;
  const tEnd = ts[ts.length - 1]!;
  const fall = end === "drop" ? 0.45 : 0;
  const total = tEnd + fall + 0.02;
  const at = (t: number) => t / total;
  const xs: number[] = [];
  const ys: number[] = [];
  const times: number[] = [];
  const push = (p: Pt, t: number) => {
    xs.push(p[0]);
    ys.push(p[1]);
    times.push(at(t));
  };
  if (t0 > 0) push(pts[0]!, 0);
  pts.forEach((p, i) => push(p, ts[i]!));
  if (end === "drop") push([pts.at(-1)![0], pts.at(-1)![1] + 24], tEnd + fall);
  push([xs.at(-1)!, ys.at(-1)!], total);
  const shown = appear(at(t0), at(tEnd));
  return (
    <motion.g
      initial={{ x: pts[0]![0], y: pts[0]![1], scale: 0 }}
      animate={{ x: xs, y: ys, scale: shown.values }}
      transition={{ x: { duration: total, times, ease: "easeInOut" }, y: { duration: total, times, ease: "easeInOut" }, scale: { duration: total, times: shown.times, ease: "linear" } }}
    >
      <Envelope kind={kind} label={ghost.msg.body.slice(0, 3)} w={26} {...marks} ttl={undefined} />
    </motion.g>
  );
}

/** A clerk's stamp: pressed on the letter as it is acked, gone with the letter. */
function Stamp({ at, t }: { at: Pt; t: number }) {
  const total = t + 0.75;
  const a = Math.max(t / total, 0.002);
  return (
    <motion.g
      initial={{ x: at[0] + 2, y: at[1] - 2, scale: 0 }}
      animate={{ scale: [0, 0, 1.25, 1, 1, 0] }}
      transition={{ scale: { duration: total, times: [0, a - 0.001, a + 0.06, a + 0.12, 0.92, 1], ease: "linear" } }}
    >
      <AckStamp />
    </motion.g>
  );
}

/** The broker's receipt travelling back to the publisher, over the room. */
function Answer({ token }: { token: Token }) {
  const total = token.t0 + LEG + 0.35;
  const a = Math.max(token.t0 / total, 0.002);
  const b = (token.t0 + LEG) / total;
  const shown = appear(a, b);
  const [fx, fy] = [token.from[0], token.from[1] - 24];
  const [tx, ty] = [token.to[0] + 6, token.to[1] - 24];
  const mx = (fx + tx) / 2;
  const my = Math.min(fy, ty) - 70;
  return (
    <motion.g
      initial={{ x: fx, y: fy, scale: 0 }}
      animate={{ x: [fx, fx, mx, tx, tx], y: [fy, fy, my, ty, ty], scale: shown.values }}
      transition={{
        x: { duration: total, times: [0, a, (a + b) / 2, b, 1], ease: "easeInOut" },
        y: { duration: total, times: [0, a, (a + b) / 2, b, 1], ease: "easeInOut" },
        scale: { duration: total, times: shown.times, ease: "linear" },
      }}
    >
      <Receipt ok={token.ok} />
    </motion.g>
  );
}

/* ------------------------------------------------------------------ gauges */

/** Three dials on a board over the mailbox: ready, unacked and how many consumers read it. */
function Gauges({ x, y, broker, queue, labels }: { x: number; y: number; broker: Broker; queue: string; labels: BrokerLabels }) {
  const d = depth(broker, queue);
  const consumers = Object.values(broker.consumers).filter((c) => c.queue === queue).length;
  const dials = [
    { label: labels.ready, value: d.ready, max: 8, tone: d.ready >= 3 ? "var(--red)" : d.ready ? "var(--sun)" : "var(--mint)" },
    { label: labels.unacked, value: d.unacked, max: 8, tone: d.unacked ? "var(--sun)" : "var(--mint)" },
    { label: labels.consumers ?? "consumers", value: consumers, max: 4, tone: consumers === 0 ? "var(--red)" : "var(--mint)" },
  ];
  const cw = 104;
  const w = cw * dials.length + 8;
  const h = 84;
  return (
    <g transform={`translate(${x - w / 2} ${y - h})`} className="mr-gauges">
      <rect y={4} width={w} height={h} rx={14} style={{ fill: "var(--ink)" }} />
      <rect width={w} height={h} rx={14} className="mr-gauge-board" />
      {dials.map((dl, i) => {
        const cx = 4 + cw * i + cw / 2;
        const cy = 36;
        const r = 25;
        const f = Math.min(dl.value, dl.max) / dl.max;
        const ang = Math.PI * (1 - f);
        return (
          <g key={dl.label}>
            <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`} className="mr-dial" />
            {[0.25, 0.5, 0.75].map((tk) => (
              <line key={tk} x1={cx + Math.cos(Math.PI * (1 - tk)) * (r - 5)} y1={cy - Math.sin(Math.PI * (1 - tk)) * (r - 5)} x2={cx + Math.cos(Math.PI * (1 - tk)) * r} y2={cy - Math.sin(Math.PI * (1 - tk)) * r} className="mr-tick" />
            ))}
            <motion.line x1={cx} y1={cy} initial={false} animate={{ x2: cx + Math.cos(ang) * (r - 6), y2: cy - Math.sin(ang) * (r - 6) }} transition={{ type: "spring", stiffness: 120, damping: 16 }} className="mr-needle" />
            <circle cx={cx} cy={cy} r={4.5} style={{ fill: dl.tone }} className="mr-needle-hub" />
            <text x={cx} y={cy + 22} textAnchor="middle" className="mr-dial-value">
              {dl.value}
            </text>
            <text x={cx} y={cy + 38} textAnchor="middle" className="mr-dial-label">
              {dl.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export { Envelope, LetterSwatch, PostOffice, Tag } from "./mailroom-parts";
