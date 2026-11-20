import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { rel } from "@lets-explain/core/iso/geometry";
import { IsoBox, Parcel, Person, TINTS, type Shades, type Tint } from "@lets-explain/core/iso/shapes";
import { depth, queueAvailable, type Broker, type BrokerEvent, type ExchangeType, type Message } from "../engine/broker";
import { choreograph, hKey, qKey, type Fate, type Ghost, type Places, type Pt, type Token } from "./choreography";
import "./broker-stage.css";

/**
 * A RabbitMQ broker in four columns: producers carrying parcels, exchanges as sorting
 * machines (one shape colour per exchange type), queues as short belts of waiting parcels,
 * and consumers holding the messages they have not acked yet. Bindings are roads labelled
 * with their key. Every message moves the way RabbitMQ moves it (see choreography.ts): it
 * travels to its exchange, is copied there per matching queue, waits in line, goes to a
 * consumer and back on a requeue, or out through the dead letter exchange.
 */

export const BROKER_STAGE = { width: 860, height: 470 };

export interface ProducerSpec {
  id: string;
  label: string;
  /** Which exchange it publishes to ("" draws a road straight to the queue it names). */
  exchange: string;
  /** For the default exchange: the queue it targets. */
  queue?: string;
}

export interface BrokerLayout {
  producers: ProducerSpec[];
  /** Exchanges to draw, in order. Defaults to every exchange the lesson declared. */
  exchanges?: string[];
  queues?: string[];
  /** Consumer tags in order. Defaults to all. */
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
}

interface Props {
  broker: Broker;
  layout: BrokerLayout;
  labels: BrokerLabels;
  /** Events of the last action, to animate what moved. */
  last: BrokerEvent[];
  /** The state before the last action: where each message came from. */
  prev?: Broker;
  /** The publisher uses confirms: draw the broker's ack / nack going back to it. */
  confirms?: boolean;
  /** Colour for a message, e.g. by routing key. Defaults to mint. */
  kindOf?: (m: Message) => "order" | "cancel" | "payment" | "neutral";
  box?: { x: number; y: number; w: number; h: number };
}

const EX_SHADES: Record<ExchangeType, Shades> = {
  direct: ["var(--peach)", "var(--peach-mid)", "var(--peach-deep)"],
  fanout: ["var(--lilac)", "#a993ee", "var(--lilac-deep)"],
  topic: ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"],
  headers: ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"],
};
const CONSUMER_TINTS: Tint[] = [TINTS.coral, TINTS.lilac, TINTS.sun, TINTS.mint];
const SLOTS = 6;
const SLOT_W = 33;
const TRAY_W = SLOTS * SLOT_W + 12;
const S = 19;
function column(n: number, top: number, bottom: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(top + bottom) / 2];
  const gap = (bottom - top) / (n - 1);
  return Array.from({ length: n }, (_, i) => top + i * gap);
}

/** Where everything stands for one broker state; shared by the drawing and the choreography. */
function geometry(broker: Broker, layout: BrokerLayout, box: { x: number; y: number; w: number; h: number }) {
  const exNames = (layout.exchanges ?? Object.keys(broker.exchanges).filter((n) => n && !n.startsWith("amq."))).filter((n) => broker.exchanges[n]);
  const qNames = (layout.queues ?? Object.keys(broker.queues)).filter((n) => broker.queues[n]);
  // Consumers in name order, so a worker that reconnects keeps its place.
  const cTags = (layout.consumers ?? Object.keys(broker.consumers).sort()).filter((t) => broker.consumers[t]);

  const xP = box.x + 58;
  const xE = box.x + box.w * 0.3;
  const xQ = box.x + box.w * 0.56;
  const xC = box.x + box.w - 78;
  const top = box.y + 70;
  const bottom = box.y + box.h - 70;
  // A producer sending straight to a queue (default exchange) stands level with that queue,
  // so its road runs flat and never crosses an exchange box.
  const yQ0 = column(qNames.length, top, bottom);
  const qIndex = (n: string) => qNames.indexOf(n);
  const others = layout.producers.filter((p) => !(p.exchange === "" && p.queue && qIndex(p.queue) >= 0));
  const yOthers = column(others.length, top, bottom);
  const yP = layout.producers.map((p) => (p.exchange === "" && p.queue && qIndex(p.queue) >= 0 ? yQ0[qIndex(p.queue)]! : yOthers[others.indexOf(p)]!));
  const yE = column(exNames.length, top, bottom);
  const yQ = column(qNames.length, top, bottom);
  const yC = column(cTags.length, top, bottom);
  const exAt = (n: string) => [xE, yE[exNames.indexOf(n)]!] as const;
  const qAt = (n: string) => [xQ, yQ[qNames.indexOf(n)]!] as const;
  /** A parcel's offset inside its queue tray: the head is on the right, next to the consumers. */
  const slotX = (i: number) => TRAY_W / 2 - 6 - SLOT_W / 2 - Math.min(i, SLOTS - 1) * SLOT_W;
  /** A parcel's offset in a consumer's hand: two columns, two rows. */
  const handAt = (k: number) => [-52 - (Math.min(k, 3) % 2) * 18, -10 - Math.floor(Math.min(k, 3) / 2) * 17] as const;

  const places: Places = {
    queues: qNames,
    consumers: cTags,
    producer: (exchange, routingKey) => {
      const i = layout.producers.findIndex((x) => x.exchange === exchange && (x.exchange !== "" || x.queue === routingKey));
      return i >= 0 ? [xP + 26, yP[i]! - 10] : null;
    },
    exchange: (name) => (exNames.includes(name) ? [exAt(name)[0], exAt(name)[1] - 14] : null),
    slot: (queue, i) => (qNames.includes(queue) ? [qAt(queue)[0] + slotX(i), qAt(queue)[1] + SLOT_Y] : null),
    hand: (tag, k) => {
      const i = cTags.indexOf(tag);
      return i >= 0 ? [xC + handAt(k)[0], yC[i]! + 16 + handAt(k)[1]] : null;
    },
    tail: (queue) => (qNames.includes(queue) ? [qAt(queue)[0] - TRAY_W / 2 + 10, qAt(queue)[1] + SLOT_Y] : null),
    head: (queue) => (qNames.includes(queue) ? [qAt(queue)[0] + TRAY_W / 2 + 8, qAt(queue)[1] + SLOT_Y] : null),
  };
  return { exNames, qNames, cTags, xP, yP, xE, xQ, xC, yC, exAt, qAt, slotX, handAt, places };
}

const SLOT_Y = 10;

/** Gives each events array a stable number, so the moving parcels replay once per action. */
const actionIds = new WeakMap<object, number>();
let nextActionId = 1;
function actionId(last: BrokerEvent[]): number {
  let id = actionIds.get(last);
  if (id === undefined) {
    id = nextActionId++;
    actionIds.set(last, id);
  }
  return id;
}

export function BrokerStage({ broker, layout, labels, last, prev, confirms, kindOf = () => "order", box = { x: 0, y: 0, w: 860, h: 470 } }: Props) {
  const g = geometry(broker, layout, box);
  const { exNames, qNames, cTags, xP, yP, xE, xQ, xC, yC, exAt, qAt } = g;
  const plan = choreograph({ prev: prev ?? broker, cur: broker, last: prev ? last : [], before: geometry(prev ?? broker, layout, box).places, here: g.places, confirms });
  const fateOf = (key: string): Fate | undefined => plan.fates.get(key);

  // Roads: producer → exchange (or straight to a queue via the default exchange), exchange → queue.
  const roads: { key: string; from: readonly [number, number]; to: readonly [number, number]; label?: string; dashed?: boolean }[] = [];
  layout.producers.forEach((p, i) => {
    const from = [xP + 26, yP[i]!] as const;
    if (p.exchange === "" && p.queue && qNames.includes(p.queue)) roads.push({ key: `p-${p.id}`, from, to: [xQ - TRAY_W / 2 - 4, qAt(p.queue)[1]], dashed: true, label: "default" });
    else if (exNames.includes(p.exchange)) roads.push({ key: `p-${p.id}`, from, to: [xE - 34, exAt(p.exchange)[1]] });
  });
  // One road per exchange–queue pair; several keys on it share one label ("info · error").
  const pairs = new Map<string, string[]>();
  for (const b of broker.bindings) {
    if (!exNames.includes(b.exchange) || !qNames.includes(b.queue)) continue;
    const type = broker.exchanges[b.exchange]!.type;
    const label = type === "headers" ? Object.entries(b.headers ?? {}).map(([k, v]) => `${k}=${v}`).join(" ") + ` (${b.match ?? "all"})` : type === "fanout" ? "" : b.key;
    const id = `${b.exchange}\u0000${b.queue}`;
    pairs.set(id, [...(pairs.get(id) ?? []), label]);
  }
  for (const [id, keys] of pairs) {
    const [exName, qName] = id.split("\u0000") as [string, string];
    const label = [...new Set(keys.filter(Boolean))].join(" · ") || undefined;
    roads.push({ key: `b-${id}`, from: [xE + 34, exAt(exName)[1]], to: [xQ - TRAY_W / 2 - 4, qAt(qName)[1]], label });
  }
  // An exchange's alternate: where messages go when none of its bindings match.
  for (const name of exNames) {
    const alt = broker.exchanges[name]!.alternate;
    if (alt && exNames.includes(alt) && alt !== name) {
      roads.push({ key: `alt-${name}`, from: [xE, exAt(name)[1] + 26], to: [xE, exAt(alt)[1] - 30], label: "alternate", dashed: true });
    }
  }
  // Consumers hang off their queue.
  cTags.forEach((t, i) => {
    const c = broker.consumers[t]!;
    if (!qNames.includes(c.queue)) return;
    roads.push({ key: `c-${t}`, from: [xQ + TRAY_W / 2 + 8, qAt(c.queue)[1]], to: [xC - 34, yC[i]!], dashed: true });
  });

  return (
    <g className="broker">
      {roads.map((r) => (
        <Road key={r.key} from={r.from} to={r.to} label={r.label} dashed={r.dashed} />
      ))}

      {layout.producers.map((p, i) => (
        <g key={p.id} transform={`translate(${xP} ${yP[i]! + 16})`}>
          <Person tint={TINTS.sky} scale={1.2} carrying={<g transform="scale(0.45)"><Parcel s={24} /></g>} />
          <Tag y={24} text={p.label} fill="var(--sky-soft)" />
        </g>
      ))}

      {exNames.map((name) => {
        const ex = broker.exchanges[name]!;
        const [x, y] = exAt(name);
        return (
          <g key={name} transform={`translate(${x} ${y})`}>
            <g transform="translate(0 14)">
              <IsoBox s={S} at={[-1.1, -1.1, 0]} size={[2.2, 2.2, 1.5]} shades={EX_SHADES[ex.type]} className="ex-box" />
              <ExchangeGlyph type={ex.type} />
            </g>
            <Tag y={48} text={name} fill="var(--card)" />
            <Tag y={-44} text={ex.type} fill={EX_SHADES[ex.type][0]} small />
          </g>
        );
      })}

      {qNames.map((name) => {
        const q = broker.queues[name]!;
        const [x, y] = qAt(name);
        const d = depth(broker, name);
        const up = queueAvailable(broker, q);
        const items = q.type === "stream" ? q.log : q.ready;
        const shown = items.slice(0, SLOTS);
        const chips: string[] = [];
        if (q.type !== "classic") chips.push(q.type);
        if (q.args.ttl !== undefined) chips.push(`TTL ${q.args.ttl}`);
        if (q.args.maxLength !== undefined) chips.push(`max ${q.args.maxLength}`);
        if (q.args.dlx !== undefined) chips.push(`DLX → ${q.args.dlx || "default"}`);
        if (!q.durable) chips.push("transient");
        const shift = plan.shift.get(name) ?? 0;
        return (
          <g key={name} className={up ? "" : "is-down"}>
            <g transform={`translate(${x} ${y})`}>
              <QueueTrough />
              <AnimatePresence initial={false} custom={fateOf}>
                {shown.map((m, i) => (
                  <Held key={m.id} place={qKey(name, m.id)} x={g.slotX(i)} y={SLOT_Y} arrive={plan.arrive.get(qKey(name, m.id))} shift={shift}>
                    <Parcel s={17} size={0.8} kind={kindOf(m)} label={m.body.slice(0, 3)} state={m.redelivered ? "dup" : "normal"} />
                  </Held>
                ))}
              </AnimatePresence>
              {items.length > SLOTS && (
                <text x={-TRAY_W / 2 - 8} y={6} textAnchor="end" className="q-more">
                  +{items.length - SLOTS}
                </text>
              )}
            </g>
            <Tag x={x} y={y + 44} text={name} fill="var(--card)" />
            <text x={x} y={y + 70} textAnchor="middle" className="q-depth">
              {q.type === "stream" ? `${items.length} log` : `${labels.ready} ${d.ready} · ${labels.unacked} ${d.unacked}`}
            </text>
            {chips.length > 0 && (
              <text x={x} y={y - 36} textAnchor="middle" className="q-chips">
                {chips.join(" · ")}
              </text>
            )}
            {!up && <Tag x={x} y={y - 48} text={labels.down} fill="var(--red-soft)" small />}
          </g>
        );
      })}

      {cTags.map((t, i) => {
        const c = broker.consumers[t]!;
        const y = yC[i]!;
        const tint = CONSUMER_TINTS[i % CONSUMER_TINTS.length]!;
        const busy = c.unacked.length > 0;
        return (
          <g key={t} transform={`translate(${xC} ${y + 16})`}>
            <Person tint={tint} scale={1.2} state={busy ? "busy" : "idle"} />
            <AnimatePresence initial={false} custom={fateOf}>
              {/* Two columns, two rows: a full hand stays beside the head, not on it. */}
              {/* Keyed per delivery: a message requeued and handed straight back leaves and lands again. */}
              {c.unacked.slice(0, 4).map((m, k) => (
                <Held key={`${m.id}:${broker.deliveries.filter((d) => d.tag === t && d.id === m.id).length}`} place={hKey(t, m.id)} x={g.handAt(k)[0]} y={g.handAt(k)[1]} arrive={plan.arrive.get(hKey(t, m.id))} shift={0}>
                  <Parcel s={14} size={0.85} kind={kindOf(m)} label={m.body.slice(0, 2)} />
                </Held>
              ))}
            </AnimatePresence>
            <Tag y={24} text={layout.consumerNames?.[t] ?? t} fill={tint.soft} />
            <text y={50} textAnchor="middle" className="c-meta">
              {c.autoAck ? "auto-ack" : `${labels.prefetch} ${c.prefetch === 0 ? labels.noLimit : c.prefetch} · ${c.unacked.length}`}
            </text>
          </g>
        );
      })}

      {/* Between the exchange and queue columns, where no producer or consumer stands. */}
      {broker.lost.length > 0 && <Tag x={(xE + xQ) / 2} y={box.y + box.h - 18} text={`${labels.lost}: ${broker.lost.length}`} fill="var(--red-soft)" small />}

      <g key={actionId(last)}>
        {plan.ghosts.map((gh) => (
          <Flight key={gh.key} ghost={gh} kind={kindOf(gh.msg)} />
        ))}
        {plan.tokens.map((tk) => (
          <Answer key={tk.key} token={tk} />
        ))}
      </g>
    </g>
  );
}

const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

/**
 * A parcel sitting in a queue slot or a consumer's hand. It shows up when the parcel that
 * carried it lands, slides when the line moves up, and leaves the way its fate says.
 */
function Held({ place, x, y, arrive, shift, children }: { place: string; x: number; y: number; arrive?: number; shift: number; children: ReactNode }) {
  return (
    <motion.g
      initial={{ scale: 0, x, y }}
      animate={{ scale: 1, x, y }}
      exit="gone"
      variants={{
        gone: (fate: (key: string) => Fate | undefined) => {
          const f = fate(place);
          if (f?.how === "leave") return { scale: 0, transition: { duration: 0.01, delay: f.at } };
          if (f?.how === "drop") return { scale: 0, y: y + 22, transition: { duration: 0.45, delay: f.at } };
          if (f?.how === "done") return { scale: 0, transition: { duration: 0.35, delay: f.at } };
          return { scale: 0, transition: { duration: 0.3 } };
        },
      }}
      // Scale, not opacity, so it changes in the same frame as the ghost that hands it over.
      transition={{ x: { ...spring, delay: shift }, y: spring, scale: arrive === undefined ? { duration: 0.25 } : { duration: 0.01, delay: arrive } }}
    >
      {children}
    </motion.g>
  );
}

/** A moving parcel: invisible until it sets off, then along its points, then lands or falls. */
function Flight({ ghost, kind }: { ghost: Ghost; kind: ReturnType<NonNullable<Props["kindOf"]>> }) {
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
  if (end === "drop") push([pts.at(-1)![0], pts.at(-1)![1] + 26], tEnd + fall);
  push(xs.length ? [xs.at(-1)!, ys.at(-1)!] : pts[0]!, total);
  // Hidden until it sets off, visible while it travels, gone the instant it lands (or as it falls).
  // Shown through scale, not opacity: it then runs with x and y in one transform.
  const shown = appear(at(t0), at(tEnd));
  return (
    <motion.g
      initial={{ x: pts[0]![0], y: pts[0]![1], scale: 0 }}
      animate={{ x: xs, y: ys, scale: shown.values }}
      transition={{ x: { duration: total, times, ease: "easeInOut" }, y: { duration: total, times, ease: "easeInOut" }, scale: { duration: total, times: shown.times, ease: "linear" } }}
    >
      <Parcel s={15} size={0.8} kind={kind} label={ghost.msg.body.slice(0, 3)} state={ghost.msg.redelivered ? "dup" : "normal"} />
    </motion.g>
  );
}

/** The broker's ack or nack travelling back to the publisher. */
function Answer({ token }: { token: Token }) {
  const total = token.t0 + LEG_BACK + 0.25;
  const a = Math.max(token.t0 / total, 0.002);
  const b = (token.t0 + LEG_BACK) / total;
  const shown = appear(a, b);
  const [fx, fy] = [token.from[0], token.from[1] - 22];
  const [tx, ty] = [token.to[0], token.to[1] - 22];
  return (
    <motion.g
      initial={{ x: fx, y: fy, scale: 0 }}
      animate={{ x: [fx, fx, tx, tx], y: [fy, fy, ty, ty], scale: shown.values }}
      transition={{ x: { duration: total, times: [0, a, b, 1], ease: "easeInOut" }, y: { duration: total, times: [0, a, b, 1], ease: "easeInOut" }, scale: { duration: total, times: shown.times, ease: "linear" } }}
    >
      <Tag y={0} text={token.ok ? "ack" : "nack"} fill={token.ok ? "var(--mint)" : "var(--red-soft)"} small />
    </motion.g>
  );
}

const LEG_BACK = 0.45;

/** Visibility keyframes: 0 until `from`, 1 until `to`, then 0 by the end (times are fractions). */
function appear(from: number, to: number) {
  if (from <= 0.001) return { values: [0, 1, 1, 0], times: [0, 0.001, Math.max(to, 0.002), 1] };
  return { values: [0, 0, 1, 1, 0], times: [0, from - 0.001, from, Math.max(to, from + 0.001), 1] };
}

function Road({ from, to, label, dashed }: { from: readonly [number, number]; to: readonly [number, number]; label?: string; dashed?: boolean }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const d = `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  return (
    <g>
      <motion.path initial={false} animate={{ d }} transition={spring} className={`road ${dashed ? "is-dashed" : ""}`} />
      {label && (
        <g transform={`translate(${mx} ${(y1 + y2) / 2})`}>
          <Tag y={0} text={label} fill="var(--sun-soft)" small />
        </g>
      )}
    </g>
  );
}

function Tag({ x = 0, y, text, fill, small }: { x?: number; y: number; text: string; fill: string; small?: boolean }) {
  const size = small ? 11 : 12.5;
  const w = Math.round(text.length * size * 0.6 + (small ? 14 : 20));
  const h = small ? 18 : 22;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2 + 3} width={w} height={h} rx={h / 2} className="pill-shadow" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} className="ink" style={{ fill }} />
      <text y={size * 0.36} textAnchor="middle" className="tag-text" style={{ fontSize: size }}>
        {text}
      </text>
    </g>
  );
}

/** The queue as a tray of slots; messages wait in line, the head on the right. */
function QueueTrough() {
  const h = 50;
  return (
    <g className="q-trough">
      <rect x={-TRAY_W / 2} y={-h / 2 + 4} width={TRAY_W} height={h} rx={12} style={{ fill: "var(--ink)" }} />
      <rect x={-TRAY_W / 2} y={-h / 2} width={TRAY_W} height={h} rx={12} className="ink" style={{ fill: "var(--card)" }} />
      {Array.from({ length: SLOTS - 1 }, (_, i) => (
        <line key={i} x1={TRAY_W / 2 - 6 - (i + 1) * SLOT_W} x2={TRAY_W / 2 - 6 - (i + 1) * SLOT_W} y1={-h / 2 + 7} y2={h / 2 - 7} className="q-slot" />
      ))}
      <path d={`M${TRAY_W / 2 - 2} -6 l7 6 -7 6`} className="q-head" />
    </g>
  );
}

/** A small mark on the exchange's top face, so the type reads at a glance. */
function ExchangeGlyph({ type }: { type: ExchangeType }) {
  const [cx, cy] = rel(S, 0, 0, 1.5);
  if (type === "fanout") {
    return (
      <g transform={`translate(${cx} ${cy})`} className="ex-glyph">
        <path d="M-9 0h18M0 0l-8 -5M0 0l8 -5M0 0l-8 5M0 0l8 5" />
      </g>
    );
  }
  if (type === "topic") {
    return (
      <text x={cx} y={cy + 5} textAnchor="middle" className="ex-glyph-text">
        #
      </text>
    );
  }
  if (type === "headers") {
    return (
      <text x={cx} y={cy + 5} textAnchor="middle" className="ex-glyph-text">
        {"{ }"}
      </text>
    );
  }
  return (
    <g transform={`translate(${cx} ${cy})`} className="ex-glyph">
      <path d="M-9 0h16M3 -4l4 4-4 4" />
    </g>
  );
}
