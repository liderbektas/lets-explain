import { AnimatePresence, motion, type TargetAndTransition } from "motion/react";
import type { ReactNode } from "react";
import type { Segment, StorageLog, StoredRecord } from "../engine/storage";
import { segmentAge, isExpired } from "../engine/storage";
import { project, rel, type Frame } from "@lets-explain/core/iso/geometry";
import "./segment-stage.css";
import { Bed, BufferStop, GhostWagon, NameTag, SignPost, Station, Track, TunnelBack, TunnelPortal, Wagon, WAGON_SHADES, wagonTop, type TunnelBox, type WagonKind } from "./rail";
import { Person, Pill, TINTS, type ParcelState, type PersonState, type Tint } from "@lets-explain/core/iso/shapes";

/**
 * One partition's log as it sits on disk, drawn as a railway line cut into trains: each segment
 * file is a train of coupled wagons on its own stretch of track, oldest at the head of the line.
 * The open (active) segment is the last train, with room left for more wagons, and the producer
 * stands at the end of the line. Retention takes whole trains off through the tunnel at the
 * head; compaction lifts single wagons off where they stand, leaving gaps in the offsets.
 * The newest train always stands at the same place, so nothing moves when old trains leave.
 */

export const SEGMENT_STAGE = { width: 860, height: 470 };
const SLOT = 1.05;
const PAD = 0.14;
const GAP = 0.5;
const VISIBLE = 4;
const WAGON = 1;
const spring = { type: "spring", stiffness: 160, damping: 22 } as const;

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
  shadesOf: (r: StoredRecord) => WagonKind;
  /** Small tag on a wagon's roof, such as its key. */
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
  /**
   * What stands at the head of the line: the retention tunnel (old trains leave through it), or
   * the log cleaner's shed (compaction lifts wagons off in place; nothing leaves by the head).
   */
  head?: "tunnel" | "cleaner";
  producerName: string;
  producerState?: PersonState;
  producerPulse?: number;
  lookup?: Lookup | null;
  /** Speech-bubble notes pinned above particular records. */
  notes?: { offset: number; text: string; tone?: "plain" | "danger" | "ok" | "sun" }[];
  children?: ReactNode;
}

/** Storage lessons have no cancel events: a peach record (old, or a key's colour) stays a box car. */
const lookOf = (kind: WagonKind) => (kind === "cancel" ? { shades: WAGON_SHADES.cancel, open: false } : { kind });

export function SegmentStage({
  log,
  shadesOf,
  tagOf,
  marks,
  highlight = [],
  labels,
  showAge = false,
  head = "tunnel",
  producerName,
  producerState = "idle",
  producerPulse,
  lookup,
  notes = [],
  children,
}: Props) {
  const size = log.config.segmentRecords;
  const train = size * SLOT + PAD * 2;
  const stride = train + GAP;
  const lineEnd = VISIBLE * stride - GAP;
  const tunnel: TunnelBox = { x0: -2.75, x1: -1.95, y0: -0.95, y1: 0.95, h: 1.0 };
  const frame = frameFor(lineEnd, tunnel);
  const s = frame.s;
  const at = (x: number, y: number, z = 0) => project(frame, x, y, z);
  const shown = log.segments.slice(-VISIBLE);
  const hiddenCount = log.segments.length - shown.length;
  // Right-anchored: the active train is always the last of the VISIBLE places.
  const slotOf = new Map(shown.map((seg, i) => [seg.base, VISIBLE - shown.length + i]));
  const startX = (seg: Segment) => (slotOf.get(seg.base) ?? 0) * stride;
  const last = shown.length - 1;
  const producer = at(lineEnd + 0.75, -1.2);
  const entry = at(lineEnd + 1.1, 0);
  const tunnelMouth = at(tunnel.x0 + 0.1, 0);
  const isTunnel = head === "tunnel";

  // What leaving looks like, decided against the log as it is now (AnimatePresence `custom`):
  // a record before the log start went with its segment, through the tunnel; one still on the log
  // only scrolled out of view; one the cleaner dropped is lifted off where it stood.
  const recordExit = (offset: number, x: number, y: number) => (now: StorageLog): TargetAndTransition => {
    if (offset < now.logStartOffset && isTunnel) {
      return { x: tunnelMouth[0], y: tunnelMouth[1], opacity: [1, 1, 0], transition: { duration: 1.4, ease: "easeIn" as const, opacity: { duration: 1.4, times: [0, 0.8, 1] } } };
    }
    if (now.segments.some((sg) => sg.records.some((r) => r.offset === offset))) return { x: x - 50, y: y - 25, opacity: 0, transition: { duration: 0.4 } };
    return { x, y: y - 44, opacity: 0, transition: { duration: 0.7, ease: "easeIn" as const } };
  };

  // Where a record sits: its segment's stretch, at its position among the records still there.
  const place = (seg: Segment, i: number) => at(startX(seg) + PAD + SLOT * (i + 0.5), 0);

  // The lookup reader stands behind the record it asks for, or behind the first train if it is gone.
  let lookupAt: [number, number] | null = null;
  let lookupTarget: [number, number] | null = null;
  if (lookup) {
    const seg = shown.find((sg) => sg.records.some((r) => r.offset === lookup.offset));
    if (seg) {
      const i = seg.records.findIndex((r) => r.offset === lookup.offset);
      const x = startX(seg) + PAD + SLOT * (i + 0.5);
      lookupAt = at(x, -2.5);
      lookupTarget = at(x, -0.3, 0.95 * WAGON);
    } else {
      // Gone: the reader stands at the head of the line, where the log now starts, finding nothing.
      lookupAt = at(0.6, -2.5);
    }
  }

  const [ox, oy] = at(0, 0);
  return (
    <g className="segment-stage">
      <g transform={`translate(${ox} ${oy})`}>
        <Bed s={s} x0={isTunnel ? tunnel.x1 - 0.1 : -2.4} x1={lineEnd + 0.95} y0={-0.9} y1={0.9} />
        {isTunnel && <TunnelBack s={s} t={tunnel} />}
        {/* Each segment's stretch of track is tinted: the active one, or the one a lookup lands in. */}
        <Track
          s={s}
          from={isTunnel ? -2.4 : -1.9}
          to={lineEnd + 0.6}
          bands={shown.map((seg, i) => {
            const active = i === last;
            const hot = highlight.includes(seg.base);
            const expired = showAge && !active && isExpired(log, seg);
            return { from: startX(seg), to: startX(seg) + train, className: `segment-band is-${hot ? "hot" : active ? "active" : expired ? "expired" : "closed"}` };
          })}
        />
        {!isTunnel && <BufferStop s={s} x={-1.75} />}
        {shown.map((seg) => (
          <SegmentJoints key={seg.base} s={s} x={startX(seg)} w={train} />
        ))}
      </g>

      {!isTunnel && (
        <g transform={`translate(${at(-0.9, -1.75)[0]} ${at(-0.9, -1.75)[1]})`}>
          <Station s={s * 0.7} roof={TINTS.lilac} w={1.4} h={0.9} />
          <NameTag y={-s * 1.75} text={labels.shredder} tint={TINTS.lilac} />
        </g>
      )}

      {hiddenCount > 0 && <Pill x={at(isTunnel ? -1.2 : -1.0, 1.5)[0]} y={at(isTunnel ? -1.2 : -1.0, 1.5)[1] + 10} text={labels.hidden(hiddenCount)} animate={false} size={11} />}

      {/* Faint outlines show how much room the active segment has left. */}
      {shown[last] &&
        Array.from({ length: Math.max(0, size - shown[last]!.records.length) }, (_, k) => {
          const [gx, gy] = place(shown[last]!, shown[last]!.records.length + k);
          return (
            <g key={`ghost-${shown[last]!.base}-${k}`} transform={`translate(${gx} ${gy})`} opacity={k === 0 ? 1 : 0.55}>
              <GhostWagon s={s} size={WAGON} />
            </g>
          );
        })}

      {/* Segment labels sit in front of the line so the wagons never cover them. */}
      <AnimatePresence initial={false}>
        {shown.map((seg, i) => {
          const active = i === last;
          const [lx, ly] = at(startX(seg) + train / 2, 1.55);
          const expired = showAge && !active && isExpired(log, seg);
          const age = segmentAge(log, seg);
          return (
            <motion.g key={`label-${seg.base}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <Pill x={lx} y={ly} text={`${labels.segment(seg.base)} · ${active ? labels.active : labels.closed}`} tone={active ? "sun" : "plain"} size={11} animate={false} />
              {showAge && <Pill x={lx - 16} y={ly + 25} text={age === null ? labels.empty : labels.age(age)} tone={expired ? "danger" : "plain"} size={10.5} animate={false} />}
            </motion.g>
          );
        })}
      </AnimatePresence>

      <AnimatePresence initial={false} custom={log}>
        {shown.flatMap((seg) =>
          seg.records.map((r, i) => {
            const [x, y] = place(seg, i);
            const tag = tagOf?.(r);
            const kind = shadesOf(r);
            const lk = lookOf(kind);
            return (
              <motion.g
                key={`r-${r.offset}`}
                initial={{ x: entry[0], y: entry[1], opacity: 0 }}
                animate={{ x, y, opacity: 1 }}
                variants={{ gone: recordExit(r.offset, x, y) }}
                exit="gone"
                transition={{ ...spring, stiffness: 100, opacity: { duration: 0.25 } }}
              >
                <Wagon s={s} size={WAGON} {...lk} label={r.offset} state={marks?.get(r.offset) ?? "normal"} />
                {tag && (
                  <g transform={`translate(0 ${wagonTop(s, WAGON) - 2})`}>
                    <rect x={-14} y={-9} width={28} height={17} rx={8.5} className="ink" style={{ fill: tag.tint.soft }} />
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

      <g transform={`translate(${ox} ${oy})`}>
        {isTunnel && <TunnelPortal s={s} t={tunnel} />}
        {isTunnel && (
          <g transform={`translate(${rel(s, tunnel.x1 + 0.05, tunnel.y1 + 0.25, -0.2).join(" ")})`}>
            <SignPost text={labels.shredder} />
          </g>
        )}
      </g>

      {notes.map((note) => {
        const seg = shown.find((sg) => sg.records.some((r) => r.offset === note.offset));
        if (!seg) return null;
        const [x, y] = place(seg, seg.records.findIndex((r) => r.offset === note.offset));
        return <Pill key={`note-${note.offset}`} x={x} y={y - s * 1.9} text={note.text} tone={note.tone ?? "sun"} size={12} />;
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

      <g transform={`translate(${producer[0]} ${producer[1]})`}>
        <Person
          key={producerState === "hop" ? producerPulse : "steady"}
          tint={TINTS.sky}
          state={producerState}
          scale={1.1}
          carrying={
            <g transform="translate(0 6) scale(0.42)">
              <Wagon s={50} kind="order" />
            </g>
          }
        />
        <NameTag y={-96} text={producerName} tint={TINTS.sky} />
      </g>

      {children}
    </g>
  );
}

/** Fits the whole line (head to producer, with labels) into the stage, centred. */
function frameFor(lineEnd: number, tunnel: TunnelBox): Frame {
  const extremes: [number, number, number][] = [
    [tunnel.x0, tunnel.y0, tunnel.h + 0.6],
    [tunnel.x0, tunnel.y1 + 0.4, 0],
    [lineEnd + 1.6, -1.2, 0],
    [lineEnd + 0.8, -1.2, 2.9],
    [lineEnd, 2.4, 0],
    [0, 2.6, 0],
  ];
  // Pixels kept free left of the tunnel (its signpost) and right of the producer (its name tag).
  const left = 92;
  const right = 64;
  const unit = extremes.map(([x, y, z]) => project({ ox: 0, oy: 0, s: 1 }, x, y, z));
  const w = Math.max(...unit.map((p) => p[0])) - Math.min(...unit.map((p) => p[0]));
  const h = Math.max(...unit.map((p) => p[1])) - Math.min(...unit.map((p) => p[1]));
  const s = Math.min(38, (SEGMENT_STAGE.width - left - right) / w, (SEGMENT_STAGE.height - 16) / h);
  const p = extremes.map(([x, y, z]) => project({ ox: 0, oy: 0, s }, x, y, z));
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  return { ox: (SEGMENT_STAGE.width - left - right - (Math.max(...xs) + Math.min(...xs))) / 2 + left, oy: (SEGMENT_STAGE.height - (Math.max(...ys) + Math.min(...ys))) / 2 + 6, s };
}

/** The rail joints at both ends of a segment's stretch: where one train's file ends and the next begins. */
function SegmentJoints({ s, x, w }: { s: number; x: number; w: number }) {
  const joint = (jx: number) => {
    const [ax, ay] = rel(s, jx, -0.46, 0.02);
    const [bx, by] = rel(s, jx, 0.46, 0.02);
    return <line key={jx} x1={ax} y1={ay} x2={bx} y2={by} className="segment-joint" />;
  };
  return (
    <g>
      {joint(x)}
      {joint(x + w)}
    </g>
  );
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
