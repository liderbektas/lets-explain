import { AnimatePresence, motion } from "motion/react";
import type { KafkaRecord, Partition } from "../engine/types";
import { project, type Frame } from "@lets-explain/core/iso/geometry";
import "./topic-stage.css";
import { NameTag } from "./PartitionStage";
import {
  Belt,
  CommitSeal,
  Flag,
  GhostSlot,
  IsoBox,
  PARCEL_SHADES,
  TINTS,
  type ParcelState,
  type PersonState,
  type Shades,
  type Tint,
  Person,
} from "@lets-explain/core/iso/shapes";

/**
 * A topic drawn as several partitions: one conveyor belt per partition, stacked
 * back to front. A producer stands behind the belts; readers stand at the left
 * end (side 0) or the right end (side 1) and plant a flag on every belt they own.
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
  /** 0 = left end of the belts, 1 = right end. Two groups use the two sides. */
  side?: 0 | 1;
}

export interface ParcelLook {
  shades?: Shades;
  /** A short label drawn on the parcel instead of the offset (the offset stays in the tag). */
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
  look?: (record: KafkaRecord, partition: Partition) => ParcelLook;
  labels: { partition: (index: number) => string; next: string };
  /** Partitions to draw empty and faded (e.g. ones about to be added). */
  highlightPartition?: number | null;
}

export const TOPIC_STAGE = { width: 860, height: 470 };

const SLOT = 1.1;
const WINDOW = 7;
const BELT_END = WINDOW * SLOT + 0.75;
const GAP = 2.15;
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;
const walk = { type: "spring", stiffness: 120, damping: 20 } as const;

const slotX = (i: number) => 0.55 + i * SLOT;
const laneY = (i: number) => i * GAP;

/** Frame for `n` partitions: smaller tiles for more belts, centred in the stage. */
function frameFor(n: number): Frame {
  const extremes: [number, number, number][] = [
    // Left: readers' column and the bench lane under it, with name tags.
    [-3.6, 0, 2.4],
    [-3.6, laneY(n) + 1.0, 0],
    // Right: belt ends and the producer with its name tag.
    [BELT_END, laneY(n - 1) + 1.4, 0],
    [BELT_END + 1.1, -1.9, 2.4],
    [BELT_END + 2.9, -1.9, 0],
    // Right-side readers (a second group), when a lesson uses them.
    [BELT_END + 2.5, 0, 2.4],
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

export function TopicStage({ partitions, readers, producer, marks, look, labels, highlightPartition = null }: Props) {
  const n = Math.max(1, partitions.length);
  const frame = frameFor(n);
  const s = frame.s;
  const at = (x: number, y: number, z = 0) => project(frame, x, y, z);
  const firstOf = (p: Partition) => Math.max(p.logStartOffset, p.logEndOffset - WINDOW);
  const xOf = (p: Partition, offset: number) => slotX(Math.max(offset, firstOf(p)) - firstOf(p));
  const producerAt = at(BELT_END + 1.1, -1.9);

  // Readers that own nothing wait in a row below the belts on their side.
  const idleCount: [number, number] = [0, 0];
  const placed = readers.map((r) => {
    const side = r.side ?? 0;
    const owned = r.lanes.filter((l) => partitions[l.partition]);
    let y: number;
    let x: number;
    if (owned.length > 0) {
      y = owned.reduce((sum, l) => sum + laneY(l.partition), 0) / owned.length;
      x = side === 0 ? -3.0 : BELT_END + 1.9;
    } else {
      // Idle readers wait on a bench lane below the belts, in the same column as the others.
      y = laneY(n) + idleCount[side] * 1.5;
      x = side === 0 ? -3.0 : BELT_END + 1.9;
      idleCount[side] += 1;
    }
    return { reader: r, side, y, x, owned };
  });

  return (
    <g>
      {partitions.map((p, i) => {
        const y = laneY(i);
        const first = firstOf(p);
        const visible = p.records.filter((r) => r.offset >= first);
        const ghost = at(xOf(p, p.logEndOffset), y);
        const tag = at(-0.8, y);
        const faded = highlightPartition === i;
        return (
          <motion.g
            key={`p${i}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
            className={faded ? "belt-new" : undefined}
          >
            <g transform={`translate(${at(0, y)[0]} ${at(0, y)[1]})`}>
              <Belt s={s} from={-0.05} to={BELT_END} slot={SLOT} />
            </g>
            <g transform={`translate(${tag[0]} ${tag[1]})`}>
              <rect x={-19} y={-10} width={38} height={22} rx={11} className="pill-shadow" />
              <rect x={-19} y={-13} width={38} height={22} rx={11} className="ink" style={{ fill: "var(--ink)" }} />
              <text y={2.5} textAnchor="middle" className="partition-tag">
                {labels.partition(i)}
              </text>
            </g>
            <motion.g animate={{ x: ghost[0], y: ghost[1] }} initial={false} transition={spring}>
              <GhostSlot s={s} />
              <text x={s * 0.9} y={-s * 0.05} className="label-soft">
                {labels.next}: {p.logEndOffset}
              </text>
            </motion.g>
            <AnimatePresence initial={false}>
              {visible.map((r) => {
                const [x, yy] = at(xOf(p, r.offset), y);
                const mark = marks?.get(`${i}:${r.offset}`);
                const l = look?.(r, p) ?? {};
                return (
                  <motion.g
                    key={r.offset}
                    initial={{ x: producerAt[0], y: producerAt[1] - 30, opacity: 0, scale: 0.6 }}
                    animate={{ x, y: yy, opacity: 1, scale: 1 }}
                    exit={{ x: at(-0.4, y)[0], y: at(-0.4, y)[1], opacity: 0 }}
                    transition={spring}
                  >
                    <StageParcel s={s} shades={l.shades} label={l.text ?? r.offset} state={mark?.state ?? "normal"} readTint={mark?.tint} />
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
          const edge = side === 0 ? 0.68 : -0.68;
          const [fx, fy] = at(xOf(p, lane.position), laneY(lane.partition) + edge);
          return (
            <motion.line
              key={`${reader.id}-l${lane.partition}`}
              initial={false}
              animate={{ x1: fx, y1: fy, x2: px + (side === 0 ? 10 : -10), y2: py - 40 }}
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
          const edge = side === 0 ? 0.68 : -0.68;
          const out = [];
          if (lane.committed !== undefined) {
            const [cx, cy] = at(xOf(p, lane.committed), laneY(lane.partition) + edge * 1.55);
            out.push(
              <motion.g key={`${reader.id}-c${lane.partition}`} initial={false} animate={{ x: cx, y: cy }} transition={spring}>
                <g transform="scale(0.95)">
                  <CommitSeal tint={reader.tint} label={lane.committed} />
                </g>
              </motion.g>,
            );
          }
          if (lane.position !== undefined && reader.state !== "crashed") {
            const [fx, fy] = at(xOf(p, lane.position), laneY(lane.partition) + edge);
            out.push(
              <motion.g key={`${reader.id}-f${lane.partition}`} initial={false} animate={{ x: fx, y: fy }} transition={walk}>
                <Flag tint={reader.tint} label={lane.position} height={44} />
              </motion.g>,
            );
          }
          return out;
        }),
      )}

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
            <StageParcel s={s} shades={l.shades} label="" state="normal" />
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
          <NameTag y={20} text={producer.name} tint={TINTS.sky} />
        </g>
      )}

      {placed.map(({ reader, x, y }) => {
        const [px, py] = at(x, y);
        return (
          <motion.g key={reader.id} initial={{ x: px, y: py + 20, opacity: 0 }} animate={{ x: px, y: py, opacity: 1 }} transition={walk}>
            <Person key={reader.state === "hop" ? reader.pulse : "steady"} tint={reader.tint} state={reader.state} scale={1} />
            <NameTag y={20} text={reader.name} tint={reader.state === "crashed" ? TINTS.grey : reader.tint} />
          </motion.g>
        );
      })}
    </g>
  );
}

/** A parcel with free colours, for records coloured by key. */
function StageParcel({
  s,
  shades = PARCEL_SHADES.order!,
  label,
  state,
  readTint,
}: {
  s: number;
  shades?: Shades;
  label: string | number;
  state: ParcelState;
  readTint?: Tint;
}) {
  const size = 0.78;
  const half = size / 2;
  const top = project({ ox: 0, oy: 0, s }, 0, 0, size)[1];
  return (
    <g className={`parcel is-${state}`}>
      <IsoBox s={s} at={[-half, -half, 0]} size={[size, size, size]} shades={shades} />
      <text x={0} y={top + 4} textAnchor="middle" className="parcel-label" style={{ fontSize: s < 34 ? 12 : 14 }}>
        {label}
      </text>
      {state === "dup" && (
        <g transform={`translate(0 ${top - s * 1.05})`}>
          <g className="pop">
            <rect x={-15} y={-11} width={30} height={20} rx={10} className="badge-dup" />
            <text y={4} textAnchor="middle" className="badge-dup-text">
              2×
            </text>
          </g>
        </g>
      )}
      {state === "read" && readTint && (
        <g transform={`translate(0 ${top - s * 1.0})`}>
          <g className="pop">
            <circle r={8} style={{ fill: readTint.body }} className="ink" />
            <path d="M-4 0l3 3 5-6" className="check" />
          </g>
        </g>
      )}
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
