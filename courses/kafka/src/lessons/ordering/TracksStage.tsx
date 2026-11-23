import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { project, type Frame } from "@lets-explain/core/iso/geometry";
import { Bed, BufferStop, GhostWagon, NameTag, Track, Wagon } from "../../iso/rail";
import { CommitSeal, Flag, Person, Pill, TINTS, type ParcelState, type PersonState, type PillTone, type Tint } from "@lets-explain/core/iso/shapes";

/**
 * A topic as parallel tracks, one per partition, records as wagons. The producer stands at the
 * far end and puts wagons on; consumers stand at the head of the partitions they own, with a
 * flag on each track at the next offset they will read. Shared by the ordering and lag lessons.
 */

export type WagonKind = "order" | "cancel" | "payment" | "neutral";

export interface TrackRecord {
  offset: number;
  label: string;
  kind: WagonKind;
  state?: ParcelState;
  tint?: Tint;
  /** A red "!" over the wagon: it was handled out of order. */
  alert?: boolean;
  /** Screen point it arrives from when it is not a fresh send from the producer (a request already in flight). */
  from?: [number, number];
}

export interface TrackPartition {
  logStart: number;
  logEnd: number;
  records: TrackRecord[];
  /** Next offset its owner reads, drawn as the owner's flag. */
  position?: number;
  committed?: number;
  ownerTint?: Tint;
  /** A sticker past the far end of the track, such as "lag 4". */
  badge?: { text: string; tone: PillTone };
  hot?: boolean;
}

export interface TrackReader {
  id: string;
  name: string;
  tint: Tint;
  state: PersonState;
  pulse?: number;
  /** Partition indexes it owns. An empty list means it stands aside, idle. */
  partitions: number[];
  bubble?: { text: string; tone: PillTone };
}

interface Props {
  partitions: TrackPartition[];
  readers: TrackReader[];
  producer: { name: string; state: PersonState; pulse?: number; kind?: WagonKind };
  partitionLabel: (i: number) => string;
  nextLabel?: string;
  /** How many slots each track shows; older wagons scroll off the head. */
  window?: number;
  /** Extra drawing on top, in stage pixels. */
  children?: ReactNode;
  /** Where the stage sits; the lag lesson leaves more room on the right for its badges. */
  origin?: { ox: number; oy: number };
}

export const STAGE = { width: 860, height: 470 };
const S = 34;
const SLOT = 1.1;
/** Wagons a little smaller than on the main line, so three tracks fit. */
export const WAGON = 0.86;
const GAP = 2.4;
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;
const walk = { type: "spring", stiffness: 120, damping: 20 } as const;

/** Where things sit on the stage, so a scene can draw extras (records in flight) in the same place. */
export function tracksGeometry(count: number, window = 7, origin?: { ox: number; oy: number }, badges = false) {
  // Keep the group centred whatever the partition count.
  const frame: Frame = {
    // More tracks stack further down-left, so the whole group shifts right to stay on stage.
    ox: (origin?.ox ?? 330) + (count - 3) * 60,
    oy: (origin?.oy ?? 130) + ((4 - count) * GAP * S) / 4,
    s: S,
  };
  const at = (x: number, y: number, z = 0) => project(frame, x, y, z);
  const trackEnd = window * SLOT + 0.4;
  const laneY = (i: number) => i * GAP;
  const slotX = (slot: number) => 0.55 + slot * SLOT;
  // Badges sit just past the track ends, so the producer steps back to make room.
  const producerAt = at(trackEnd + (badges ? 2.9 : 1.9), laneY(count - 1) / 2);
  return { s: S, at, trackEnd, laneY, slotX, producerAt };
}

export function TracksStage({ partitions, readers, producer, partitionLabel, nextLabel, window = 7, children, origin }: Props) {
  const count = partitions.length;
  const { at, trackEnd, laneY, slotX, producerAt } = tracksGeometry(count, window, origin, partitions.some((p) => p.badge));
  const firstOf = (p: TrackPartition) => Math.max(p.logStart, p.logEnd - window);
  const xOf = (p: TrackPartition, offset: number) => slotX(Math.max(offset, firstOf(p)) - firstOf(p));

  const idle = readers.filter((r) => r.partitions.length === 0);
  const homeOf = (r: TrackReader) => {
    if (r.partitions.length > 0) return at(-2.6, laneY(r.partitions[0]!));
    const k = idle.indexOf(r);
    // Idle readers wait in front of the last track, out of the way.
    return at(5 + k * 2.2, laneY(count - 1) + 3.6);
  };

  const layers: ReactNode[] = [];
  const [bx, by] = at(0, 0);
  layers.push(
    <g key="bed" transform={`translate(${bx} ${by})`}>
      <Bed s={S} x0={-1.0} x1={trackEnd + 0.45} y0={-0.85} y1={laneY(count - 1) + 0.85} />
    </g>,
  );
  partitions.forEach((p, i) => {
    const y = laneY(i);
    const first = firstOf(p);
    const ghost = at(xOf(p, p.logEnd), y);
    const [lx, ly] = at(-0.95, y + 0.15);
    layers.push(
      <g key={`track-${i}`}>
        <text x={lx} y={ly + 4} textAnchor="end" className={`label-soft belts-plabel ${p.hot ? "is-hot" : ""}`}>
          {partitionLabel(i)}
        </text>
        <g transform={`translate(${at(0, y)[0]} ${at(0, y)[1]})`}>
          <Track s={S} from={-0.6} to={trackEnd + 0.2} tone={p.hot ? "hot" : undefined} />
          <BufferStop s={S} x={-0.45} />
        </g>
        <motion.g initial={false} animate={{ x: ghost[0], y: ghost[1] }} transition={spring}>
          <GhostWagon s={S} size={WAGON} />
        </motion.g>
        {nextLabel && p.logEnd - first < window && (
          <motion.text initial={false} animate={{ x: ghost[0] + S * 0.9, y: ghost[1] + 4 }} transition={spring} className="label-soft belts-next">
            {nextLabel}: {p.logEnd}
          </motion.text>
        )}
        <AnimatePresence initial={false}>
          {p.records
            .filter((r) => r.offset >= first)
            .map((r) => {
              const [x, py] = at(xOf(p, r.offset), y);
              return (
                <motion.g
                  key={r.offset}
                  initial={r.from ? { x: r.from[0], y: r.from[1], opacity: 1, scale: 1 } : { x: at(trackEnd + 0.6, y)[0], y: at(trackEnd + 0.6, y)[1], opacity: 0, scale: 1 }}
                  animate={{ x, y: py, opacity: 1, scale: 1 }}
                  exit={{ x: at(-0.3, y)[0], y: at(-0.3, y)[1], opacity: 0 }}
                  transition={r.from ? spring : { type: "spring", stiffness: 90, damping: 18, opacity: { duration: 0.25 } }}
                >
                  <Wagon s={S} kind={r.kind} open={false} label={r.label || r.offset} state={r.state ?? "normal"} readTint={r.tint} size={WAGON} />
                  {r.alert && (
                    <g transform={`translate(0 ${-S * 1.55})`}>
                      <g className="pop">
                        <circle r={10} className="badge-down" />
                        <text y={4.5} textAnchor="middle" className="belts-alert">
                          !
                        </text>
                      </g>
                    </g>
                  )}
                  {r.label !== "" && (
                    <text y={S * 0.72} textAnchor="middle" className="belts-offset">
                      {r.offset}
                    </text>
                  )}
                </motion.g>
              );
            })}
        </AnimatePresence>
        {p.committed !== undefined && p.ownerTint && (
          <motion.g
            initial={false}
            animate={{ x: at(xOf(p, p.committed) - 0.1, y + 1.05)[0], y: at(xOf(p, p.committed) - 0.1, y + 1.05)[1] }}
            transition={spring}
          >
            <CommitSeal tint={p.ownerTint} label={p.committed} />
          </motion.g>
        )}
        {p.position !== undefined && p.ownerTint && (
          <motion.g
            initial={false}
            animate={{ x: at(xOf(p, p.position) - 0.5, y + 0.45)[0], y: at(xOf(p, p.position) - 0.5, y + 0.45)[1] }}
            transition={walk}
          >
            <Flag tint={p.ownerTint} label={p.position} height={44} />
          </motion.g>
        )}
        {p.badge && (
          <Pill key={`badge-${i}-${p.badge.text}`} x={at(trackEnd + 0.95, y)[0]} y={at(trackEnd + 0.95, y)[1] - 4} text={p.badge.text} tone={p.badge.tone} size={12} />
        )}
      </g>,
    );

    // Readers stand by the first partition they own, drawn after that track so depth is right.
    for (const r of readers.filter((x) => x.partitions[0] === i)) layers.push(readerNode(r));
  });
  for (const r of idle) layers.push(readerNode(r));

  function readerNode(r: TrackReader) {
    const [hx, hy] = homeOf(r);
    const down = r.state === "crashed";
    return (
      <g key={`reader-${r.id}`}>
        {/* A dotted line to every other partition this reader owns. */}
        {!down &&
          r.partitions.slice(1).map((pi) => {
            const [tx, ty] = at(-0.1, laneY(pi));
            return <motion.line key={pi} initial={false} animate={{ x1: hx + 6, y1: hy - 40, x2: tx, y2: ty }} transition={walk} className="sight-line" style={{ stroke: r.tint.deep }} />;
          })}
        <motion.g initial={false} animate={{ x: hx, y: hy }} transition={walk}>
          <Person key={r.state === "hop" ? r.pulse : "steady"} tint={r.tint} state={r.state} scale={0.95} />
          <NameTag y={18} text={r.name} tint={down || r.partitions.length === 0 ? TINTS.grey : r.tint} />
          {r.bubble && <Pill key={`${r.bubble.text}-${r.pulse}`} x={0} y={-94} text={r.bubble.text} tone={r.bubble.tone} size={11.5} />}
        </motion.g>
      </g>
    );
  }

  return (
    <g>
      {layers}
      <g transform={`translate(${producerAt[0]} ${producerAt[1]})`}>
        <Person
          key={producer.state === "hop" ? producer.pulse : "steady"}
          tint={TINTS.sky}
          state={producer.state}
          scale={1.05}
          carrying={
            <g transform="translate(0 6) scale(0.42)">
              <Wagon s={50} kind={producer.kind ?? "order"} open={false} />
            </g>
          }
        />
        <NameTag y={20} text={producer.name} tint={TINTS.sky} />
      </g>
      {children}
    </g>
  );
}
