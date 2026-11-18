import { AnimatePresence, motion } from "motion/react";
import type { Partition } from "../engine/types";
import { project, type Frame } from "@lets-explain/core/iso/geometry";
import { Belt, CommitSeal, Flag, GhostSlot, Parcel, Person, Shredder, TINTS, type ParcelState, type PersonState, type Tint } from "@lets-explain/core/iso/shapes";

export interface Reader {
  id: string;
  name: string;
  tint: Tint;
  /** Next offset to read; undefined while the reader is down. */
  position?: number;
  committed?: number;
  state: PersonState;
  /** Changes on every action, so a one-shot animation (hop) can play again. */
  pulse?: number;
}

interface Props {
  partition: Partition;
  readers: Reader[];
  producerName: string;
  producerState: PersonState;
  producerPulse?: number;
  /** Per-offset highlight for this moment: who just read it, or that it was read again. */
  marks: Map<number, { state: ParcelState; tint?: Tint }>;
  kindOf: (value: string) => "order" | "cancel" | "payment";
  labels: { next: string; retention: string };
  showShredder?: boolean;
}

export const STAGE = { width: 860, height: 470 };
const FRAME: Frame = { ox: 222, oy: 112, s: 44 };
const SLOT = 1.1;
const WINDOW = 9;
const BELT_END = WINDOW * SLOT + 0.75;
const LANES = [1.75, 3.15];
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

const at = (x: number, y: number, z = 0) => project(FRAME, x, y, z);
const slotX = (i: number) => 0.55 + i * SLOT;

/**
 * One partition as a conveyor belt of parcels, a producer at the far end, and
 * readers standing in lanes in front of it, each next to its bookmark flag.
 */
export function PartitionStage({
  partition,
  readers,
  producerName,
  producerState,
  producerPulse,
  marks,
  kindOf,
  labels,
  showShredder = true,
}: Props) {
  const first = Math.max(partition.logStartOffset, partition.logEndOffset - WINDOW);
  const xOf = (offset: number) => slotX(Math.max(offset, first) - first);
  const visible = partition.records.filter((r) => r.offset >= first);
  const producerAt = at(BELT_END + 2.1, 1.25);
  const shredderAt = at(-1.15, 0);
  const ghost = at(xOf(partition.logEndOffset), 0);
  const s = FRAME.s;

  // Exit animation: deleted records fall into the shredder, others just slide off.
  // The latest logStartOffset reaches exiting parcels through AnimatePresence's `custom`.
  const exitFor = (offset: number) => (logStart: number) =>
    offset < logStart
      ? { x: shredderAt[0], y: shredderAt[1] - s * 0.6, opacity: 0, scale: 0.4 }
      : { x: at(-0.4, 0)[0], y: at(-0.4, 0)[1], opacity: 0 };

  return (
    <g>
      {showShredder && (
        <g transform={`translate(${shredderAt[0]} ${shredderAt[1]})`}>
          <Shredder s={s} />
          <text y={-s * 1.75} textAnchor="middle" className="label-soft">
            {labels.retention}
          </text>
        </g>
      )}

      <g transform={`translate(${FRAME.ox} ${FRAME.oy})`}>
        <Belt s={s} from={-0.05} to={BELT_END} slot={SLOT} />
      </g>

      <motion.g animate={{ x: ghost[0], y: ghost[1] }} initial={false} transition={spring}>
        <GhostSlot s={s} />
        <text x={s * 0.95} y={-s * 0.1} className="label-soft">
          {labels.next}: {partition.logEndOffset}
        </text>
      </motion.g>

      <AnimatePresence initial={false} custom={partition.logStartOffset}>
        {visible.map((r) => {
          const [x, y] = at(xOf(r.offset), 0);
          const mark = marks.get(r.offset);
          return (
            <motion.g
              key={r.offset}
              initial={{ x: producerAt[0], y: producerAt[1] - 40, opacity: 0, scale: 0.6 }}
              animate={{ x, y, opacity: 1, scale: 1 }}
              variants={{ gone: exitFor(r.offset) }}
              exit="gone"
              transition={spring}
            >
              <Parcel s={s} kind={kindOf(r.value)} label={r.offset} state={mark?.state ?? "normal"} readTint={mark?.tint} />
            </motion.g>
          );
        })}
      </AnimatePresence>

      {readers.map((reader, i) => {
        const lane = LANES[i] ?? LANES[0]! + i * 1.4;
        const alive = reader.position !== undefined;
        const standX = xOf(alive ? reader.position! : (reader.committed ?? first));
        const [px, py] = at(standX, lane);
        // Where the reader is looking: the front edge of the belt at its slot.
        const [fx, fy] = at(standX, 0.68);
        // Seals sit on opposite sides per lane so one reader never hides the other's seal.
        const sealOffset: [number, number] = i % 2 === 0 ? [0.75, -0.35] : [-1.0, 0.3];
        const seal = reader.committed !== undefined ? at(xOf(reader.committed) + sealOffset[0], lane + sealOffset[1]) : null;
        const walk = { type: "spring", stiffness: 120, damping: 20 } as const;
        return (
          <g key={reader.id}>
            {seal && (
              <motion.g initial={false} animate={{ x: seal[0], y: seal[1] }} transition={spring}>
                <g transform="scale(1.3)">
                  <CommitSeal tint={reader.tint} label={reader.committed!} />
                </g>
              </motion.g>
            )}
            {alive && (
              <motion.line
                initial={false}
                animate={{ x1: fx, y1: fy, x2: px + 4, y2: py - 92 }}
                transition={walk}
                className="sight-line"
                style={{ stroke: reader.tint.deep }}
              />
            )}
            {alive && (
              <motion.circle initial={false} animate={{ cx: fx, cy: fy }} transition={walk} r={4} className="ink" style={{ fill: reader.tint.body }} />
            )}
            <motion.g initial={false} animate={{ x: px, y: py }} transition={walk}>
              <Person key={reader.state === "hop" ? reader.pulse : "steady"} tint={reader.tint} state={reader.state} scale={1.2} />
              {alive && (
                <g transform="translate(19 -8)">
                  <Flag tint={reader.tint} label={reader.position!} height={86} />
                </g>
              )}
              <NameTag y={22} text={reader.name} tint={reader.state === "crashed" ? TINTS.grey : reader.tint} />
            </motion.g>
          </g>
        );
      })}

      <g transform={`translate(${producerAt[0]} ${producerAt[1]})`}>
        <Person
          key={producerState === "hop" ? producerPulse : "steady"}
          tint={TINTS.sky}
          state={producerState}
          scale={1.2}
          carrying={
            <g transform="scale(0.55)">
              <Parcel s={s} kind="order" />
            </g>
          }
        />
        <NameTag y={22} text={producerName} tint={TINTS.sky} />
      </g>
    </g>
  );
}

export function NameTag({ y, text, tint }: { y: number; text: string; tint: Tint }) {
  const w = Math.round(text.length * 7.4 + 20);
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x={-w / 2} y={-8} width={w} height={22} rx={11} className="pill-shadow" />
      <rect x={-w / 2} y={-11} width={w} height={22} rx={11} style={{ fill: tint.soft }} className="ink" />
      <text y={4.5} textAnchor="middle" style={{ fontSize: 12.5, fontWeight: 800 }}>
        {text}
      </text>
    </g>
  );
}
