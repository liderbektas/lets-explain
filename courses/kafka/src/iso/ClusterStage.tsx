import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import "./cluster.css";
import { rel } from "@lets-explain/core/iso/geometry";
import { GhostWagon, NameTag, SignalBox, Station, Track, Wagon } from "./rail";
import { Person, Pill, TINTS, type ParcelState, type PersonState, type PillTone, type Tint } from "@lets-explain/core/iso/shapes";

/**
 * Brokers as railway stations in a row, each with a short siding per partition copy it holds:
 * the copy's records are wagons on it. A signal at the head of each siding shows the copy's
 * state: green with a flag for the leader, green for an in-sync follower, red when it fell out
 * of the ISR or is offline. Followers catch up by taking the wagons they miss from the leader.
 * Used for clusters, replication and the KRaft controller quorum (there the "partition"
 * is the metadata log).
 */

export interface StageRecord {
  offset: number;
  kind?: "order" | "cancel" | "payment" | "neutral";
  state?: ParcelState;
  /**
   * Set when the record reached this copy in the latest action: written by the producer onto
   * the leader, or copied from the leader by a follower. The wagon then rolls in from there.
   */
  arrived?: "producer" | "copy";
}

export interface StageReplica {
  broker: number;
  records: StageRecord[];
  /** Offset the next record on this copy would get. */
  end: number;
  role: "leader" | "follower" | "behind" | "offline";
}

export interface StagePartition {
  id: string;
  /** Short name of the siding, such as "P0". */
  label: string;
  replicas: StageReplica[];
  /** High watermark marker on the leader's siding; omit to hide. */
  hw?: number;
}

export interface StageBroker {
  id: number;
  name: string;
  alive: boolean;
  slow?: boolean;
  roof?: Tint;
  /** A station (broker) or a signal box (KRaft controller). */
  kind?: "station" | "signalbox";
  /** A signal box in charge has its cabin lit. */
  lit?: boolean;
  /** Small pill above the roof, e.g. "aktif". */
  badge?: { text: string; tone: PillTone };
}

export interface ClusterLabels {
  leader: string;
  follower: string;
  behind: string;
  offline: string;
  hw: string;
  slow: string;
}

interface Props {
  brokers: StageBroker[];
  partitions: StagePartition[];
  labels: ClusterLabels;
  /** Records shown per siding. */
  window?: number;
  producer?: { name: string; state: PersonState; pulse?: number; target?: string | null; tint?: Tint };
  /** Top-left of the row, and the gap between stations, in screen px. */
  top?: number;
  /** Extra drawing on top, given the layout so it can point at sidings. */
  overlay?: (layout: ClusterLayout) => ReactNode;
  s?: number;
}

export const CLUSTER_STAGE = { width: 860, height: 470 };
const SLOT = 0.95;
/** Wagon scale on a siding: a little smaller than on the main line, so five fit. */
const WAGON = 0.82;
const ROW = 1.5;
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;
/** Followers fetch from the leader after it has the record, so copies leave a beat later. */
const COPY_DELAY = 0.4;

export interface ClusterLayout {
  s: number;
  /** Screen position of a broker station's footprint centre. */
  broker: (id: number) => [number, number];
  /** Screen position of a slot on a broker's siding for a partition; slot 0 is the first shown. */
  slot: (brokerId: number, partitionId: string, slotIndex: number) => [number, number] | null;
  /** Screen position of the next free slot on the leader's siding for a partition. */
  ghost: (partitionId: string) => [number, number] | null;
  producer: [number, number];
}

export function ClusterStage({ brokers, partitions, labels, window: wanted = 5, producer, top = 150, overlay, s: wantedS = 30 }: Props) {
  const count = Math.max(brokers.length, 1);
  // Four stations leave less room, so sidings get shorter and the drawing a little smaller.
  const crowded = count >= 4;
  const window = crowded ? Math.min(wanted, 4) : wanted;
  const s = crowded ? Math.min(wantedS, 27) : wantedS;
  // Sidings run down-right from each station, so the row leans left to leave room for the last one.
  // The last broker's siding and its label must end inside the stage.
  const reach = (1.05 + window * SLOT + 0.45 + 1.35) * s + 58;
  const left = 90;
  const right = CLUSTER_STAGE.width - reach;
  const gap = count > 1 ? (right - left) / (count - 1) : 0;
  const anchor = (i: number): [number, number] => [count > 1 ? left + i * gap : (left + right) / 2, top];
  const index = new Map(brokers.map((b, i) => [b.id, i]));

  // Each broker lists the partitions it holds, in partition order, one siding per row.
  const rowsOf = (brokerId: number) => partitions.filter((p) => p.replicas.some((r) => r.broker === brokerId));
  const firstShown = (p: StagePartition) => Math.max(0, Math.max(...p.replicas.map((r) => r.end), 0) - window);
  const sidingStart = (brokerId: number, partitionId: string): [number, number] | null => {
    const i = index.get(brokerId);
    if (i === undefined) return null;
    const row = rowsOf(brokerId).findIndex((p) => p.id === partitionId);
    if (row < 0) return null;
    const [ax, ay] = anchor(i);
    const [dx, dy] = rel(s, 1.05, row * ROW);
    return [ax + dx, ay + dy];
  };
  const slotAt = (brokerId: number, partitionId: string, k: number): [number, number] | null => {
    const start = sidingStart(brokerId, partitionId);
    if (!start) return null;
    const [dx, dy] = rel(s, 0.55 + k * SLOT, 0);
    return [start[0] + dx, start[1] + dy];
  };
  const producerAt: [number, number] = [CLUSTER_STAGE.width / 2 - 40, CLUSTER_STAGE.height - 62];

  const layout: ClusterLayout = {
    s,
    broker: (id) => anchor(index.get(id) ?? 0),
    slot: slotAt,
    ghost: (pid) => {
      const p = partitions.find((x) => x.id === pid);
      const leader = p?.replicas.find((r) => r.role === "leader");
      if (!p || !leader) return null;
      return slotAt(leader.broker, pid, Math.min(leader.end - firstShown(p), window));
    },
    producer: producerAt,
  };

  const target = producer?.target ? layout.ghost(producer.target) : null;

  // Sidings that appear after the first draw (a reassigned replica) still animate their copies in.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);

  /** Where a wagon that just arrived on a siding starts, relative to that siding; null to roll in. */
  const arrivalFrom = (p: StagePartition, r: StageRecord, start: [number, number]): [number, number] | null => {
    if (r.arrived === "producer") return producer ? [producerAt[0] - start[0], producerAt[1] - 40 - start[1]] : null;
    if (r.arrived !== "copy") return null;
    const leader = p.replicas.find((x) => x.role === "leader");
    // The leader's own copy must already be there: a copy never comes from a record that is itself arriving.
    const source = leader?.records.find((x) => x.offset === r.offset);
    if (!leader || !source || source.arrived) return null;
    const at = slotAt(leader.broker, p.id, r.offset - firstShown(p));
    return at ? [at[0] - start[0], at[1] - start[1]] : null;
  };
  const copying = (p: StagePartition) => p.replicas.some((x) => x.records.some((r) => r.arrived === "copy"));

  return (
    <g>
      {brokers.map((b, i) => {
        const [ax, ay] = anchor(i);
        const rows = rowsOf(b.id);
        return (
          <g key={b.id}>
            <g transform={`translate(${ax} ${ay})`}>
              {b.kind === "signalbox" ? (
                <SignalBox s={s} tint={b.roof ?? TINTS.sun} status={b.alive ? "ok" : "down"} lit={b.lit} />
              ) : (
                <Station s={s} roof={b.roof ?? TINTS.sky} status={!b.alive ? "down" : b.slow ? "busy" : "ok"} w={1.45} h={0.95} />
              )}
              <NameTag y={b.kind === "signalbox" ? -s * 2.55 : -64} text={b.name} tint={b.alive ? (b.roof ?? TINTS.sky) : TINTS.grey} />
              {b.badge && <Pill x={0} y={b.kind === "signalbox" ? -s * 2.55 - 28 : -92} text={b.badge.text} tone={b.badge.tone} size={11} />}
              {b.alive && b.slow && <Pill x={-58} y={-30} text={labels.slow} tone="warn" size={11} />}
            </g>
            {rows.map((p) => {
              const replica = p.replicas.find((r) => r.broker === b.id)!;
              const start = sidingStart(b.id, p.id)!;
              const first = firstShown(p);
              const end = window * SLOT + 0.45;
              const [ex, ey] = rel(s, end + 1.35, 0.15);
              const tone: PillTone =
                replica.role === "leader" ? "sun" : replica.role === "offline" ? "danger" : replica.role === "behind" ? "danger" : "plain";
              const roleText = labels[replica.role];
              const dim = !b.alive || replica.role === "offline";
              return (
                <g key={p.id} transform={`translate(${start[0]} ${start[1]})`} className={dim ? "cluster-siding is-dim" : "cluster-siding"}>
                  <Track s={s} from={0} to={end} />
                  <SidingSignal s={s} role={b.alive ? replica.role : "offline"} />
                  {replica.role === "leader" && b.alive && (
                    <g transform={`translate(${rel(s, 0.55 + Math.min(replica.end - first, window) * SLOT, 0)[0]} ${rel(s, 0.55 + Math.min(replica.end - first, window) * SLOT, 0)[1]})`}>
                      <GhostWagon s={s} size={WAGON} />
                    </g>
                  )}
                  <AnimatePresence initial={mounted.current && replica.records.some((r) => r.arrived)}>
                    {replica.records
                      .filter((r) => r.offset >= first)
                      .map((r) => {
                        const [x, y] = rel(s, 0.55 + (r.offset - first) * SLOT, 0);
                        const from = arrivalFrom(p, r, start);
                        const copy = r.arrived === "copy" && from !== null;
                        return (
                          <motion.g
                            key={r.offset}
                            initial={from ? { x: from[0], y: from[1], opacity: 0, scale: copy ? 0.9 : 0.6 } : { x, y: y - 30, opacity: 0, scale: 0.6 }}
                            animate={{ x, y, opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, y: y + 10 }}
                            transition={copy ? { ...spring, delay: COPY_DELAY } : spring}
                          >
                            <Wagon s={s} size={WAGON} kind={r.kind ?? "order"} label={r.offset} state={r.state ?? "normal"} />
                          </motion.g>
                        );
                      })}
                  </AnimatePresence>
                  {p.hw !== undefined && replica.role === "leader" && b.alive && p.hw >= first && (
                    <HwMarker s={s} x={0.55 + (p.hw - first) * SLOT - SLOT / 2} label={`${labels.hw} ${p.hw}`} delay={copying(p) ? COPY_DELAY + 0.35 : 0} />
                  )}
                  <Pill x={ex} y={ey + 4} text={`${p.label} · ${roleText}`} tone={tone} size={11} animate={false} />
                </g>
              );
            })}
          </g>
        );
      })}

      {producer && (
        <>
          {target && (
            <motion.line
              initial={false}
              animate={{ x1: producerAt[0] + 14, y1: producerAt[1] - 52, x2: target[0], y2: target[1] - 4 }}
              transition={spring}
              className="sight-line"
              style={{ stroke: (producer.tint ?? TINTS.sky).deep }}
            />
          )}
          <g transform={`translate(${producerAt[0]} ${producerAt[1]})`}>
            <Person
              key={producer.state === "hop" ? producer.pulse : "steady"}
              tint={producer.tint ?? TINTS.sky}
              state={producer.state}
              scale={1.1}
              carrying={
                <g transform="translate(0 6) scale(0.42)">
                  <Wagon s={50} kind="order" />
                </g>
              }
            />
            <NameTag y={20} text={producer.name} tint={producer.tint ?? TINTS.sky} />
          </g>
        </>
      )}

      {overlay?.(layout)}
    </g>
  );
}

/**
 * The high watermark: a short post between the last readable record and the next one.
 * It moves only once the in-sync followers have the record, so it waits for the copies.
 */
function HwMarker({ s, x, label, delay }: { s: number; x: number; label: string; delay: number }) {
  const [bx, by] = rel(s, x, 0.7);
  const [tx, ty] = rel(s, x, 0.7, 1.9);
  const move = { ...spring, delay };
  return (
    <motion.g initial={false} animate={{ x: 0 }}>
      <motion.line initial={false} animate={{ x1: bx, y1: by, x2: tx, y2: ty }} transition={move} className="hw-post" />
      <motion.g initial={false} animate={{ x: tx, y: ty }} transition={move}>
        <rect x={-4} y={-17} width={label.length * 6.4 + 14} height={17} rx={8.5} className="hw-tag" />
        <text x={3} y={-5} className="hw-text">
          {label}
        </text>
      </motion.g>
    </motion.g>
  );
}

/**
 * A small semaphore at the head of a siding. Green: the copy is in sync (the leader also flies a
 * flag); red: it fell out of the ISR or is offline. It only reports state; it never moves wagons.
 */
function SidingSignal({ s, role }: { s: number; role: "leader" | "follower" | "behind" | "offline" }) {
  const [x, y] = rel(s, 0.05, -0.62);
  const h = s * 1.25;
  const ok = role === "leader" || role === "follower";
  return (
    <g transform={`translate(${x} ${y})`} className="siding-signal">
      <line x1={0} y1={0} x2={0} y2={-h} className="signal-mast" />
      <rect x={-5} y={-h - 9} width={10} height={16} rx={4} className="ink signal-head" />
      <circle cx={0} cy={-h - 1} r={3.2} className={`signal-lamp ${ok ? "is-lit" : "is-red"}`} />
      {role === "leader" && <path d={`M0 ${-h - 9}v-14h15l-3 4 3 4H0`} className="ink siding-flag" />}
    </g>
  );
}
