import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { Segment, StorageLog, StoredRecord } from "../engine/storage";
import { segmentAge, isExpired } from "../engine/storage";
import { project, type Frame } from "@lets-explain/core/iso/geometry";
import "./segment-stage.css";
import { NameTag } from "./PartitionStage";
import { IsoBox, Parcel, Person, Pill, Shredder, TINTS, type ParcelState, type PersonState, type Shades, type Tint } from "@lets-explain/core/iso/shapes";

/**
 * One partition's log as it sits on disk: a row of segment trays, oldest at the back left.
 * Each tray is one segment file; parcels on it are its records. Deleted segments fall into
 * the shredder, and the producer stands behind the active (last) tray.
 */

export const SEGMENT_STAGE = { width: 860, height: 470 };
const FRAME: Frame = { ox: 150, oy: 112, s: 36 };
const SLOT = 1.05;
const PAD = 0.22;
const GAP = 0.7;
const VISIBLE = 4;
const spring = { type: "spring", stiffness: 160, damping: 22 } as const;
const at = (x: number, y: number, z = 0) => project(FRAME, x, y, z);

export interface Lookup {
  offset: number;
  /** Text above the reader's head, e.g. "offset 4?". */
  ask: string;
  /** Shown when the offset is not on the log any more. */
  missing?: string;
  name: string;
}

interface Props {
  log: StorageLog;
  shadesOf: (r: StoredRecord) => "order" | "cancel" | "payment" | "neutral";
  /** Small tag under a parcel, such as its key. */
  tagOf?: (r: StoredRecord) => { text: string; tint: Tint } | null;
  marks?: Map<number, ParcelState>;
  /** Segment bases to outline, e.g. the one a lookup lands in. */
  highlight?: number[];
  labels: {
    segment: (base: number) => string;
    active: string;
    closed: string;
    age: (days: number) => string;
    empty: string;
    shredder: string;
    hidden: (count: number) => string;
  };
  /** Show how old each segment's newest record is, red once past retention. */
  showAge?: boolean;
  producerName: string;
  producerState?: PersonState;
  producerPulse?: number;
  lookup?: Lookup | null;
  /** Speech-bubble notes pinned above particular records. */
  notes?: { offset: number; text: string; tone?: "plain" | "danger" | "ok" | "sun" }[];
  children?: ReactNode;
}

const TRAY_CLOSED: Shades = ["#f6efe2", "#e4d8c3", "#d3c4aa"];
const TRAY_ACTIVE: Shades = ["var(--tangerine-soft)", "#f7c9b3", "var(--tangerine)"];
const TRAY_HOT: Shades = ["var(--sun-soft)", "#f3dc93", "var(--sun)"];

export function SegmentStage({
  log,
  shadesOf,
  tagOf,
  marks,
  highlight = [],
  labels,
  showAge = false,
  producerName,
  producerState = "idle",
  producerPulse,
  lookup,
  notes = [],
  children,
}: Props) {
  const size = log.config.segmentRecords;
  const tray = size * SLOT + PAD * 2;
  const stride = tray + GAP;
  const shown = log.segments.slice(-VISIBLE);
  const hiddenCount = log.segments.length - shown.length;
  const indexOf = new Map(shown.map((seg, i) => [seg.base, i]));
  const s = FRAME.s;
  const shredder = at(-1.7, 0.1);
  const last = shown.length - 1;
  // The producer stands just past the end of the active tray, where records come in.
  const producer = at(last * stride + tray + 1.2, 0.35);
  // Keep the row centred on the stage however many segments it holds.
  const middle = at((shown.length * stride - GAP) / 2, 0);
  const shift = { x: 400 - middle[0], y: 245 - middle[1] };

  // What leaving looks like, decided against the log as it is now (AnimatePresence `custom`):
  // a segment file that is gone (retention, or merged away by the cleaner) falls into the shredder;
  // one that only scrolled out of view slides off; a record dropped by compaction vanishes in place.
  const segmentExit = (base: number, x: number, y: number) => (now: StorageLog) =>
    now.segments.some((sg) => sg.base === base)
      ? { x: x - 60, y: y - 30, opacity: 0 }
      : { x: shredder[0] - 10, y: shredder[1] - 30, opacity: 0, scale: 0.3 };
  const recordExit = (offset: number, x: number, y: number) => (now: StorageLog) =>
    offset < now.logStartOffset
      ? { x: shredder[0], y: shredder[1] - s * 0.6, opacity: 0, scale: 0.4 }
      : now.segments.some((sg) => sg.records.some((r) => r.offset === offset))
        ? { x: x - 60, y: y - 30, opacity: 0 }
        : { x, y, opacity: 0, scale: 0.2 };

  // Where a record sits: its segment's tray, at its position among the records still there.
  const place = (seg: Segment, i: number) => at((indexOf.get(seg.base) ?? 0) * stride + PAD + SLOT * (i + 0.5), 0);

  // The lookup reader stands behind the record it asks for, or behind the first tray if it is gone.
  let lookupAt: [number, number] | null = null;
  let lookupTarget: [number, number] | null = null;
  if (lookup) {
    const seg = shown.find((sg) => sg.records.some((r) => r.offset === lookup.offset));
    if (seg) {
      const i = seg.records.findIndex((r) => r.offset === lookup.offset);
      const x = (indexOf.get(seg.base) ?? 0) * stride + PAD + SLOT * (i + 0.5);
      // Behind the trays, looking down at the parcel: the front stays free for tray labels.
      lookupAt = at(x, -2.6);
      lookupTarget = at(x, -0.15, 0.8);
    } else {
      lookupAt = at(PAD + SLOT * 0.5, -2.6);
    }
  }

  return (
    <g>
      <motion.g initial={false} animate={shift} transition={spring}>
      <g transform={`translate(${shredder[0]} ${shredder[1]})`}>
        <Shredder s={s} />
        <text y={-s * 1.75} textAnchor="middle" className="label-soft">
          {labels.shredder}
        </text>
      </g>

      {hiddenCount > 0 && <Pill x={shredder[0] + 40} y={shredder[1] + 46} text={labels.hidden(hiddenCount)} animate={false} size={11} />}

      <AnimatePresence initial={false} custom={log}>
        {shown.map((seg, i) => {
          const active = i === last;
          const [x, y] = at(i * stride, 0);
          const hot = highlight.includes(seg.base);
          const expired = showAge && !active && isExpired(log, seg);
          return (
            <motion.g
              key={seg.base}
              initial={{ x: x + 40, y: y + 20, opacity: 0 }}
              animate={{ x, y, opacity: 1 }}
              variants={{ gone: segmentExit(seg.base, x, y) }}
              exit="gone"
              transition={spring}
            >
              <IsoBox
                s={s}
                at={[0, -0.65, -0.24]}
                size={[tray, 1.3, 0.24]}
                shades={hot ? TRAY_HOT : active ? TRAY_ACTIVE : TRAY_CLOSED}
                className={expired ? "tray-expired" : undefined}
              />
              {/* Faint slots show how much room the segment has left. */}
              {active &&
                Array.from({ length: size - seg.records.length }, (_, k) => {
                  const [gx, gy] = at(PAD + SLOT * (seg.records.length + k + 0.5), 0);
                  return (
                    <polygon
                      key={k}
                      className="ghost-slot"
                      transform={`translate(${gx - x} ${gy - y})`}
                      points={slotPoints(s)}
                    />
                  );
                })}
            </motion.g>
          );
        })}
      </AnimatePresence>

      {/* Tray labels sit apart so the parcels never cover them. */}
      <AnimatePresence initial={false}>
        {shown.map((seg, i) => {
          const active = i === last;
          // In front of the tray, down-left: the parcels never cover it there.
          const [lx, ly] = at(i * stride + tray / 2, 2.15);
          const expired = showAge && !active && isExpired(log, seg);
          const age = segmentAge(log, seg);
          return (
            <motion.g
              key={`label-${seg.base}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Pill
                x={lx}
                y={ly}
                text={`${labels.segment(seg.base)} · ${active ? labels.active : labels.closed}`}
                tone={active ? "sun" : "plain"}
                size={11}
              />
              {showAge && (
                <Pill
                  x={lx - 16}
                  y={ly + 26}
                  text={age === null ? labels.empty : labels.age(age)}
                  tone={expired ? "danger" : "plain"}
                  size={10.5}
                />
              )}
            </motion.g>
          );
        })}
      </AnimatePresence>

      <AnimatePresence initial={false} custom={log}>
        {shown.flatMap((seg) =>
          seg.records.map((r, i) => {
            const [x, y] = place(seg, i);
            const tag = tagOf?.(r);
            return (
              <motion.g
                key={`r-${r.offset}`}
                initial={{ x: producer[0], y: producer[1] - 50, opacity: 0, scale: 0.6 }}
                animate={{ x, y, opacity: 1, scale: 1 }}
                variants={{ gone: recordExit(r.offset, x, y) }}
                exit="gone"
                transition={spring}
              >
                <Parcel s={s} kind={shadesOf(r)} label={r.offset} state={marks?.get(r.offset) ?? "normal"} size={0.72} />
                {tag && (
                  <g transform={`translate(${-s * 0.42} ${s * 0.5})`}>
                    <rect x={-13} y={-9} width={26} height={17} rx={8.5} className="ink" style={{ fill: tag.tint.soft }} />
                    <text y={4} textAnchor="middle" className="key-tag">
                      {tag.text}
                    </text>
                  </g>
                )}
              </motion.g>
            );
          }),
        )}
      </AnimatePresence>

      {notes.map((note) => {
        const seg = shown.find((sg) => sg.records.some((r) => r.offset === note.offset));
        if (!seg) return null;
        const [x, y] = place(seg, seg.records.findIndex((r) => r.offset === note.offset));
        return <Pill key={`note-${note.offset}`} x={x} y={y - s * 1.75} text={note.text} tone={note.tone ?? "sun"} size={12} />;
      })}

      {lookup && lookupAt && (
        <g>
          {lookupTarget && (
            <motion.line
              initial={false}
              animate={{ x1: lookupAt[0] + 2, y1: lookupAt[1] - 50, x2: lookupTarget[0], y2: lookupTarget[1] }}
              className="sight-line"
              style={{ stroke: TINTS.lilac.deep }}
            />
          )}
          <motion.g initial={{ opacity: 0, x: lookupAt[0], y: lookupAt[1] + 20 }} animate={{ opacity: 1, x: lookupAt[0], y: lookupAt[1] }} transition={spring}>
            <Person tint={TINTS.lilac} state={lookupTarget ? "happy" : "busy"} scale={1.1} />
            <NameTag y={20} text={lookup.name} tint={TINTS.lilac} />
            <Pill x={0} y={-92} text={lookupTarget ? lookup.ask : (lookup.missing ?? lookup.ask)} tone={lookupTarget ? "sun" : "danger"} size={12} />
          </motion.g>
        </g>
      )}

      <motion.g initial={false} animate={{ x: producer[0], y: producer[1] }} transition={spring}>
        <Person
          key={producerState === "hop" ? producerPulse : "steady"}
          tint={TINTS.sky}
          state={producerState}
          scale={1.1}
          carrying={
            <g transform="scale(0.5)">
              <Parcel s={s} kind="order" />
            </g>
          }
        />
        <NameTag y={20} text={producerName} tint={TINTS.sky} />
      </motion.g>
      </motion.g>

      {children}
    </g>
  );
}

function slotPoints(s: number) {
  const h = 0.36;
  const p = (x: number, y: number) => project({ ox: 0, oy: 0, s }, x, y);
  return [p(-h, -h), p(h, -h), p(h, h), p(-h, h)].map(([x, y]) => `${x},${y}`).join(" ");
}

/** A paper card in the corner of a stage, for a list such as the files of a partition. */
export function InfoCard({
  x,
  y,
  width,
  title,
  rows,
}: {
  x: number;
  y: number;
  width: number;
  title: string;
  rows: { text: string; tone?: "plain" | "soft" | "strong" | "gone" }[];
}) {
  const h = 34 + rows.length * 19;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={0} y={4} width={width} height={h} rx={12} className="pill-shadow" />
      <rect x={0} y={0} width={width} height={h} rx={12} className="info-card ink" />
      <text x={14} y={22} className="info-card-title">
        {title}
      </text>
      <AnimatePresence initial={false}>
        {rows.map((row, i) => (
          <motion.text
            key={row.text}
            x={14}
            initial={{ opacity: 0, y: 42 + i * 19 + 6 }}
            animate={{ opacity: 1, y: 42 + i * 19 }}
            exit={{ opacity: 0 }}
            className={`info-card-row is-${row.tone ?? "plain"}`}
          >
            {row.text}
          </motion.text>
        ))}
      </AnimatePresence>
    </g>
  );
}
