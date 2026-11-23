import { AnimatePresence, motion } from "motion/react";
import type { KafkaRecord, Partition } from "../engine/types";
import { project, type Frame } from "@lets-explain/core/iso/geometry";
import "./topic-stage.css";
import { Bed, BufferStop, GhostWagon, NameTag, Track, Wagon } from "./rail";
import { CommitSeal, Flag, TINTS, type ParcelState, type PersonState, type Shades, type Tint, Person } from "@lets-explain/core/iso/shapes";

/**
 * A topic drawn as a little rail yard: one track per partition, side by side on one bed, each
 * record a numbered wagon. The producer stands behind the tracks; each consumer is a worker
 * standing at the head of the tracks it owns (side 0) or at the far end (side 1), with a flag on
 * every one of those tracks at the next offset it reads, and how far behind it is (lag) per track.
 */

export interface StageLane {
  partition: number;
  /** Next offset to read on this partition; undefined while not reading it. */
  position?: number;
  committed?: number;
}

export interface StageReader {
  id: string;
  name: string;
  tint: Tint;
  state: PersonState;
  pulse?: number;
  lanes: StageLane[];
  /** 0 = head of the tracks, 1 = far end. Two groups use the two sides. */
  side?: 0 | 1;
}

export interface RecordLook {
  shades?: Shades;
  /** A short label painted on the wagon instead of the offset. */
  text?: string;
}

interface Props {
  partitions: Partition[];
  readers: StageReader[];
  producer?: { name: string; state: PersonState; pulse?: number } | null;
  /**
   * Highlights keyed by `${partition}:${offset}`. `to` names the reader that fetched the record in
   * this action: a copy travels to that reader, while the record itself stays on the log.
   */
  marks?: Map<string, { state: ParcelState; tint?: Tint; to?: string }>;
  look?: (record: KafkaRecord, partition: Partition) => RecordLook;
  labels: { partition: (index: number) => string; next: string; lag?: string };
  /** Partitions to draw empty and faded (e.g. ones about to be added). */
  highlightPartition?: number | null;
  /** Show each reader's lag on each track it owns. */
  showLag?: boolean;
}

export const TOPIC_STAGE = { width: 860, height: 470 };

const SLOT = 1.1;
const WINDOW = 7;
const TRACK_END = WINDOW * SLOT + 0.75;
const GAP = 2.55;
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;
const walk = { type: "spring", stiffness: 120, damping: 20 } as const;

const slotX = (i: number) => 0.55 + i * SLOT;
/** The column past the track ends where every reader's lag per track is listed. */
const LAG_X = TRACK_END + 0.95;
/** The producer stands past the far end, a little behind the first track. */
const PRODUCER: [number, number] = [TRACK_END + 1.5, -2.0];
/** A second group's readers stand in a row behind the tracks, halfway along. */
const BACK_X = TRACK_END * 0.5;
const BACK_Y = -3.1;
/** Where flags and seals stand: on the near edge of a track (side 0) or its far edge (side 1). */
const FLAG_EDGE = 0.68;
const SEAL_EDGE = 0.98;
const laneY = (i: number) => i * GAP;

/** Frame for `n` partitions: smaller tiles for more tracks, centred in the stage. */
function frameFor(n: number): Frame {
  const extremes: [number, number, number][] = [
    // Left: readers' column and the bench lane under it, with name tags.
    [-3.6, 0, 2.4],
    [-3.6, laneY(n) + 1.0, 0],
    // Right: track ends, the lag column past them, and the producer with its name tag.
    [TRACK_END, laneY(n - 1) + 1.4, 0],
    [LAG_X + 2.4, laneY(n - 1) + 0.9, 0],
    [PRODUCER[0], PRODUCER[1], 3.0],
    // Its name tag is wider than the person: leave room for half of it.
    [PRODUCER[0] + 2.0, PRODUCER[1], 2.6],
    // Far-end readers (a second group) stand behind the tracks.
    [BACK_X - 4, BACK_Y, 3.0],
  ];
  // Size tiles so the whole drawing fits, but never larger than looks right.
  const unit = extremes.map(([x, y, z]) => project({ ox: 0, oy: 0, s: 1 }, x, y, z));
  const w = Math.max(...unit.map((p) => p[0])) - Math.min(...unit.map((p) => p[0]));
  const h = Math.max(...unit.map((p) => p[1])) - Math.min(...unit.map((p) => p[1]));
  const s = Math.min(44, (TOPIC_STAGE.width - 30) / w, (TOPIC_STAGE.height - 30) / h);
  const pts = extremes.map(([x, y, z]) => project({ ox: 0, oy: 0, s }, x, y, z));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const ox = (TOPIC_STAGE.width - (Math.max(...xs) + Math.min(...xs))) / 2;
  const oy = (TOPIC_STAGE.height - (Math.max(...ys) + Math.min(...ys))) / 2;
  return { ox, oy, s };
}

export function TopicStage({ partitions, readers, producer, marks, look, labels, highlightPartition = null, showLag = true }: Props) {
  const n = Math.max(1, partitions.length);
  const frame = frameFor(n);
  const s = frame.s;
  const at = (x: number, y: number, z = 0) => project(frame, x, y, z);
  const firstOf = (p: Partition) => Math.max(p.logStartOffset, p.logEndOffset - WINDOW);
  const xOf = (p: Partition, offset: number) => slotX(Math.max(offset, firstOf(p)) - firstOf(p));
  const producerAt = at(PRODUCER[0], PRODUCER[1]);

  // Side 0 readers stand at the head of the tracks they own; ones that own nothing wait on a bench
  // lane below the tracks. Side 1 readers (a second group) stand in a row behind the tracks.
  let idle = 0;
  let back = 0;
  const placed = readers.map((r) => {
    const side = r.side ?? 0;
    const owned = r.lanes.filter((l) => partitions[l.partition]);
    let y: number;
    let x: number;
    if (side === 1) {
      x = BACK_X - back * 1.9;
      y = BACK_Y;
      back += 1;
    } else if (owned.length > 0) {
      y = owned.reduce((sum, l) => sum + laneY(l.partition), 0) / owned.length;
      x = -3.0;
    } else {
      y = laneY(n) + idle * 1.5;
      x = -3.0;
      idle += 1;
    }
    return { reader: r, side, y, x, owned };
  });

  const [bedX, bedY] = at(0, 0);
  const person = ({ reader, x, y, side }: (typeof placed)[number]) => {
    const [px, py] = at(x, y);
    return (
      <motion.g key={reader.id} initial={{ x: px, y: py + 20, opacity: 0 }} animate={{ x: px, y: py, opacity: 1 }} transition={walk}>
        <Person key={reader.state === "hop" ? reader.pulse : "steady"} tint={reader.tint} state={reader.state} scale={1} />
        {/* Behind the tracks a tag under the feet would sit on the wagons, so it goes above the head. */}
        <NameTag y={side === 1 ? -84 : 20} text={reader.name} tint={reader.state === "crashed" ? TINTS.grey : reader.tint} />
      </motion.g>
    );
  };
  return (
    <g>
      {/* Readers behind the tracks are further away, so they are drawn first. */}
      {placed.filter((p) => p.side === 1).map(person)}
      <g transform={`translate(${bedX} ${bedY})`}>
        <Bed s={s} x0={-1.55} x1={TRACK_END + 0.45} y0={-0.85} y1={laneY(n - 1) + 0.85} />
      </g>
      {partitions.map((p, i) => {
        const y = laneY(i);
        const first = firstOf(p);
        const visible = p.records.filter((r) => r.offset >= first);
        const ghost = at(xOf(p, p.logEndOffset), y);
        const tag = at(-1.05, y + 0.1);
        const faded = highlightPartition === i;
        return (
          <motion.g
            key={`p${i}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
            className={faded ? "track-new" : undefined}
          >
            <g transform={`translate(${at(0, y)[0]} ${at(0, y)[1]})`}>
              <Track s={s} from={-0.75} to={TRACK_END + 0.2} tone={faded ? "new" : undefined} />
              <BufferStop s={s} x={-0.6} />
            </g>
            <g transform={`translate(${tag[0]} ${tag[1]})`}>
              <rect x={-19} y={-10} width={38} height={22} rx={11} className="pill-shadow" />
              <rect x={-19} y={-13} width={38} height={22} rx={11} className="ink" style={{ fill: "var(--ink)" }} />
              <text y={2.5} textAnchor="middle" className="partition-tag">
                {labels.partition(i)}
              </text>
            </g>
            {/* The next free place carries the offset it will get; only the first track says so in words. */}
            <motion.g animate={{ x: ghost[0], y: ghost[1] }} initial={false} transition={spring}>
              <GhostWagon s={s} label={p.logEndOffset} />
              {i === 0 && (
                <text x={0} y={-s * 1.75} textAnchor="middle" className="label-soft">
                  {labels.next}
                </text>
              )}
            </motion.g>
            <AnimatePresence initial={false}>
              {visible.map((r) => {
                const [x, yy] = at(xOf(p, r.offset), y);
                const mark = marks?.get(`${i}:${r.offset}`);
                const l = look?.(r, p) ?? {};
                return (
                  <motion.g
                    key={r.offset}
                    initial={{ x: at(TRACK_END + 0.6, y)[0], y: at(TRACK_END + 0.6, y)[1], opacity: 0 }}
                    animate={{ x, y: yy, opacity: 1 }}
                    exit={{ x: at(-0.3, y)[0], y: at(-0.3, y)[1], opacity: 0 }}
                    transition={{ type: "spring", stiffness: 90, damping: 18, opacity: { duration: 0.25 } }}
                  >
                    <Wagon s={s} shades={l.shades} label={l.text ?? r.offset} state={mark?.state ?? "normal"} readTint={mark?.tint} />
                  </motion.g>
                );
              })}
            </AnimatePresence>
          </motion.g>
        );
      })}

      {/* Sight lines first, so people and flags are drawn over them. */}
      {placed.map(({ reader, x, y, side, owned }) => {
        if (reader.state === "crashed") return null;
        const [px, py] = at(x, y);
        return owned.map((lane) => {
          const p = partitions[lane.partition]!;
          if (lane.position === undefined) return null;
          const edge = side === 0 ? FLAG_EDGE : -FLAG_EDGE;
          const [fx, fy] = at(xOf(p, lane.position), laneY(lane.partition) + edge);
          return (
            <motion.line
              key={`${reader.id}-l${lane.partition}`}
              initial={false}
              animate={{ x1: fx, y1: fy, x2: px + (side === 0 ? 10 : 0), y2: py - (side === 0 ? 40 : 10) }}
              transition={walk}
              className="sight-line"
              style={{ stroke: reader.tint.deep }}
            />
          );
        });
      })}

      {placed.map(({ reader, side, owned }) =>
        owned.map((lane) => {
          const p = partitions[lane.partition]!;
          const sign = side === 0 ? 1 : -1;
          const out = [];
          // The seal sits just outside the flag's edge, a little before the slot, so a flag at the same
          // offset stands right behind its seal instead of on top of it.
          if (lane.committed !== undefined) {
            const [cx, cy] = at(xOf(p, lane.committed) - 0.28, laneY(lane.partition) + sign * SEAL_EDGE);
            out.push(
              <motion.g key={`${reader.id}-c${lane.partition}`} initial={false} animate={{ x: cx, y: cy }} transition={spring}>
                <g transform="scale(0.72)">
                  <CommitSeal tint={reader.tint} label={lane.committed} />
                </g>
              </motion.g>,
            );
          }
          if (lane.position !== undefined && reader.state !== "crashed") {
            const [fx, fy] = at(xOf(p, lane.position), laneY(lane.partition) + sign * FLAG_EDGE);
            out.push(
              <motion.g key={`${reader.id}-f${lane.partition}`} initial={false} animate={{ x: fx, y: fy }} transition={walk}>
                <Flag tint={reader.tint} label={lane.position} height={side === 0 ? 40 : 30} />
              </motion.g>,
            );
          }
          return out;
        }),
      )}

      {/* Lag per track, in one column past the track ends: one row per track, one pill per reader. */}
      {showLag &&
        partitions.map((p, pi) => {
          const owners = placed.flatMap(({ reader, owned }) => owned.filter((l) => l.partition === pi).map((lane) => ({ reader, lane })));
          return owners.map(({ reader, lane }, k) => {
            const done = Math.max(lane.committed ?? p.logStartOffset, p.logStartOffset);
            const lag = Math.max(0, p.logEndOffset - done);
            const text = `${labels.lag ?? "lag"} ${lag}`;
            const w = text.length * 6.2 + 18;
            const [lx, ly] = at(LAG_X, laneY(pi) + 0.1);
            return (
              <motion.g key={`${reader.id}-lag${pi}`} initial={false} animate={{ x: lx, y: ly - 10 + k * 21 }} transition={spring}>
                <rect x={0} y={-9} width={w} height={18} rx={9} className={`ink topic-lag ${lag > 0 ? "" : "is-zero"}`} style={{ fill: reader.tint.soft }} />
                <circle cx={9} cy={0} r={3.5} style={{ fill: reader.tint.body }} className="ink" />
                <text x={w / 2 + 5} y={3.8} textAnchor="middle" className="topic-lag-text">
                  {text}
                </text>
              </motion.g>
            );
          });
        })}

      {/* Reading copies a record to the reader; the original stays where it is. */}
      {[...(marks ?? [])].map(([key, mark]) => {
        const target = mark.to === undefined ? undefined : placed.find((p) => p.reader.id === mark.to && p.reader.state !== "crashed");
        const [pi, offset] = key.split(":").map(Number) as [number, number];
        const p = partitions[pi];
        const record = p?.records.find((r) => r.offset === offset && r.offset >= firstOf(p));
        if (!target || !p || !record || (mark.state !== "read" && mark.state !== "dup")) return null;
        const [rx, ry] = at(xOf(p, offset), laneY(pi));
        const [tx, ty] = at(target.x, target.y);
        const l = look?.(record, p) ?? {};
        return (
          <motion.g
            key={`copy-${key}-${mark.to}-${target.reader.pulse ?? 0}`}
            initial={{ x: rx, y: ry - s * 0.3, opacity: 0, scale: 0.6 }}
            animate={{ x: tx, y: ty - 40, opacity: [0, 1, 1, 0], scale: 0.6 }}
            transition={{ duration: 0.75, ease: "easeInOut", opacity: { duration: 0.75, times: [0, 0.15, 0.8, 1] } }}
          >
            <Wagon s={s} shades={l.shades} />
          </motion.g>
        );
      })}

      {producer && (
        <g transform={`translate(${producerAt[0]} ${producerAt[1]})`}>
          <Person
            key={producer.state === "hop" ? producer.pulse : "steady"}
            tint={TINTS.sky}
            state={producer.state}
            scale={1}
          />
          <NameTag y={-92} text={producer.name} tint={TINTS.sky} />
        </g>
      )}

      {placed.filter((p) => p.side === 0).map(person)}
    </g>
  );
}

/** Colours for records by key, in the order keys first appear. */
export const KEY_SHADES: Shades[] = [
  ["var(--sun)", "#f0c24f", "#d9a826"],
  ["var(--lilac)", "#a996ec", "var(--lilac-deep)"],
  ["var(--coral)", "var(--coral-deep)", "var(--coral-deep)"],
  ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"],
];
