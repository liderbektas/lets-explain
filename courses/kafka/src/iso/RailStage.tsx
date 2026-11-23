import { AnimatePresence, motion, type TargetAndTransition } from "motion/react";
import type { ReactNode } from "react";
import type { Partition } from "../engine/types";
import { project, rel, type Frame } from "@lets-explain/core/iso/geometry";
import { CommitSeal, Flag, Person, TINTS, type ParcelState, type PersonState, type Shades, type Tint } from "@lets-explain/core/iso/shapes";
import { Bed, BufferStop, GhostWagon, NameTag, SignPost, Track, TunnelBack, TunnelPortal, Wagon, type Reader, type TunnelBox, type WagonKind } from "./rail";

export type { Reader, WagonKind } from "./rail";
export { MiniWagon } from "./rail";

/**
 * One partition drawn as a railway: the log is the track, each record a numbered wagon. New
 * wagons roll in from the producer's end and couple behind the last one; a wagon never moves
 * once it is on the track, so its number (the offset) is its place. Retention sends the oldest
 * wagons off through the tunnel at the head of the line. Readers stand in lanes in front of the
 * track, each holding the flag of the next offset it will read.
 */

/** How one record looks, beyond its kind. */
export interface WagonLook {
  kind?: WagonKind;
  shades?: Shades;
  open?: boolean;
  /** Held back: an open transaction. Drawn faded with a seal strip. */
  sealed?: boolean;
  /** A control record (transaction marker): a flat wagon carrying a commit or abort board. */
  marker?: "commit" | "abort";
  /** Small text on the wagon's end face, e.g. a sequence number. */
  end?: string;
}

interface Props {
  partition: Partition;
  readers: Reader[];
  producerName: string;
  producerState: PersonState;
  producerPulse?: number;
  marks: Map<number, { state: ParcelState; tint?: Tint; to?: string }>;
  kindOf: (value: string) => WagonKind;
  look?: (offset: number, value: string) => WagonLook;
  labels: { next: string; retention: string };
  /**
   * How records leave the line. `tunnel`: retention takes the oldest through the tunnel at the
   * head. `lift`: a queue deletes a message where it stands (it is lifted off the track).
   * `none`: nothing is removed in this lesson, so the line simply starts at a buffer stop.
   */
  removal?: "tunnel" | "lift" | "none";
  /**
   * The broker's gate on the way in (idempotence): a duplicate the broker recognised is drawn
   * rolling up to the gate and stopped there. `pulse` changes per rejection so it plays again.
   */
  gate?: { label: string; rejected?: { pulse: number | string; text: string; kind?: WagonKind } | null } | null;
  /** Extra drawing in stage pixels, drawn last. */
  children?: ReactNode;
}

export const RAIL_STAGE = { width: 860, height: 470 };
const FRAME: Frame = { ox: 222, oy: 140, s: 50 };
const SLOT = 1.0;
const WINDOW = 9;
const first0 = 0.15;
const TRACK_FROM = -2.2;
const TRACK_TO = first0 + WINDOW * SLOT + 0.9;
const TUNNEL: TunnelBox = { x0: -2.55, x1: -1.75, y0: -0.95, y1: 0.95, h: 1.0 };
const LANES = [1.95, 3.1];
/** Flag pole height: the cloth flies beside the reader's head, below the wagons' number plates. */
const FLAG = 64;
const spring = { type: "spring", stiffness: 150, damping: 22 } as const;

const at = (x: number, y: number, z = 0) => project(FRAME, x, y, z);
const slotX = (i: number) => first0 + i * SLOT;

export function RailStage({
  partition,
  readers,
  producerName,
  producerState,
  producerPulse,
  marks,
  kindOf,
  look,
  labels,
  removal = "tunnel",
  gate,
  children,
}: Props) {
  // The window only scrolls when the log grows past it. Deleting old records never shifts
  // the wagons that stay: their place on the track is their offset.
  const first = Math.max(0, partition.logEndOffset - WINDOW);
  const xOf = (offset: number) => slotX(Math.max(offset, first) - first);
  const visible = partition.records.filter((r) => r.offset >= first);
  const hidden = removal !== "lift" && first > partition.logStartOffset ? [partition.logStartOffset, first - 1] : null;
  const s = FRAME.s;
  const entry = at(TRACK_TO + 0.6, 0);
  const ghost = at(xOf(partition.logEndOffset), 0);
  const producerAt = at(TRACK_TO - 0.2, -1.15);
  const tunnel = removal === "tunnel";
  const trackFrom = tunnel ? TRACK_FROM : -0.75;
  const gateX = TRACK_TO - 0.35;

  // A deleted record rolls back into the tunnel (retention) or is lifted off where it stands (a
  // queue's ack); one still on the log but scrolled out of view only fades where it stood.
  const exitFor = (offset: number) => (now: Partition): TargetAndTransition => {
    const [ox, oy] = at(xOf(offset), 0);
    if (now.records.some((r) => r.offset === offset) || offset >= now.logEndOffset) {
      const [x, y] = at(xOf(offset) - 0.4, 0);
      return { x, y, opacity: 0, transition: { duration: 0.4 } };
    }
    if (!tunnel) return { x: ox, y: oy - 46, opacity: 0, transition: { duration: 0.6, ease: "easeIn" as const } };
    const [x, y] = at(TUNNEL.x0 + 0.1, 0);
    return { x, y, opacity: [1, 1, 0], transition: { duration: 1.3, ease: "easeIn" as const, opacity: { duration: 1.3, times: [0, 0.75, 1] } } };
  };

  const walk = { type: "spring", stiffness: 120, damping: 20 } as const;
  const placed = readers.map((reader, i) => {
    const lane = LANES[i] ?? LANES[0]! + i * 1.25;
    const alive = reader.position !== undefined;
    const standX = xOf(alive ? reader.position! : (reader.committed ?? first));
    return { reader, i, lane, alive, standX, at: at(standX, lane) };
  });

  const wagonFor = (offset: number, value: string, extra: { label?: number; state?: ParcelState; readTint?: Tint }) => {
    const lk = look?.(offset, value) ?? {};
    if (lk.marker) return <MarkerWagon s={s} kind={lk.marker} label={extra.label} />;
    return (
      <Wagon
        s={s}
        kind={lk.kind ?? kindOf(value)}
        shades={lk.shades}
        open={lk.open}
        sealed={lk.sealed}
        label={extra.label}
        state={lk.sealed && (extra.state ?? "normal") === "normal" ? "dim" : extra.state}
        readTint={extra.readTint}
      >
        {lk.end && extra.label !== undefined && <EndPlate s={s} text={lk.end} />}
      </Wagon>
    );
  };

  return (
    <g className="rail-stage">
      <g transform={`translate(${FRAME.ox} ${FRAME.oy})`}>
        <Bed s={s} x0={tunnel ? TUNNEL.x1 - 0.1 : trackFrom - 0.4} x1={TRACK_TO + 0.5} y0={-0.9} y1={0.9} z={-0.18} />
        {tunnel && <TunnelBack s={s} t={TUNNEL} />}
        <Track s={s} from={trackFrom} to={TRACK_TO} />
        {!tunnel && <BufferStop s={s} x={trackFrom + 0.15} />}
      </g>

      {/* The producer stands behind the end of the line and pushes each new wagon on. */}
      <g transform={`translate(${producerAt[0]} ${producerAt[1]})`}>
        <Person
          key={producerState === "hop" ? producerPulse : "steady"}
          tint={TINTS.sky}
          state={producerState}
          scale={1.2}
          carrying={
            <g transform="translate(0 6) scale(0.42)">
              <Wagon s={s} kind="order" />
            </g>
          }
        />
        <NameTag y={-102} text={producerName} tint={TINTS.sky} />
      </g>

      {/* Where the next wagon will couple on. */}
      <motion.g animate={{ x: ghost[0], y: ghost[1] }} initial={false} transition={spring}>
        <GhostWagon s={s} />
      </motion.g>

      <AnimatePresence initial={false} custom={partition}>
        {visible.map((r) => {
          const [x, y] = at(xOf(r.offset), 0);
          const mark = marks.get(r.offset);
          return (
            <motion.g
              key={r.offset}
              initial={{ x: entry[0], y: entry[1], opacity: 0 }}
              animate={{ x, y, opacity: 1 }}
              variants={{ gone: exitFor(r.offset) }}
              exit="gone"
              transition={{ type: "spring", stiffness: 90, damping: 18, opacity: { duration: 0.25 } }}
            >
              {wagonFor(r.offset, r.value, { label: r.offset, state: mark?.state ?? "normal", readTint: mark?.tint })}
            </motion.g>
          );
        })}
      </AnimatePresence>

      {gate && gateNode(gateX, gate.label, gate.rejected ?? null)}

      <motion.g animate={{ x: ghost[0], y: ghost[1] }} initial={false} transition={spring} opacity={labels.next ? 1 : 0}>
        <g transform={`translate(0 ${-s * 1.3})`}>
          <rect x={-(labels.next.length * 7 + 34) / 2} y={-13} width={labels.next.length * 7 + 34} height={19} rx={9.5} className="rail-next-pill" />
          <text y={1} textAnchor="middle" className="rail-next-text">
            {labels.next}: {partition.logEndOffset}
          </text>
        </g>
      </motion.g>

      <g transform={`translate(${FRAME.ox} ${FRAME.oy})`}>
        {tunnel && <TunnelPortal s={s} t={TUNNEL} />}
        {labels.retention && removal !== "none" && (
          <g transform={`translate(${rel(s, tunnel ? TUNNEL.x1 + 0.05 : trackFrom + 0.1, (tunnel ? TUNNEL.y1 : 0.5) + 0.25, -0.2).join(" ")})`}>
            <SignPost text={labels.retention} />
          </g>
        )}
        {hidden && (
          <text x={rel(s, tunnel ? -0.9 : -0.6, tunnel ? 0.9 : -0.85, 0)[0]} y={rel(s, tunnel ? -0.9 : -0.6, tunnel ? 0.9 : -0.85, 0)[1] + (tunnel ? 16 : 0)} textAnchor="middle" className="rail-hidden">
            ‹ {hidden[0] === hidden[1] ? hidden[0] : `${hidden[0]}–${hidden[1]}`}
          </text>
        )}
      </g>

      {placed.map(({ reader, i, lane, alive, standX, at: [px, py] }) => {
        // Where the reader is looking: the near edge of the track at its slot.
        const [fx, fy] = at(standX, 0.62, -0.1);
        const sealOffset: [number, number] = i % 2 === 0 ? [0.72, -0.4] : [-0.95, 0.3];
        const seal = reader.committed !== undefined ? at(xOf(reader.committed) + sealOffset[0], lane + sealOffset[1]) : null;
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
                animate={{ x1: fx, y1: fy, x2: px + 19, y2: py - 8 - FLAG + 8 }}
                transition={walk}
                className="sight-line"
                style={{ stroke: reader.tint.deep }}
              />
            )}
            {alive && <motion.circle initial={false} animate={{ cx: fx, cy: fy }} transition={walk} r={4} className="ink" style={{ fill: reader.tint.body }} />}
            <motion.g initial={false} animate={{ x: px, y: py }} transition={walk}>
              <Person key={reader.state === "hop" ? reader.pulse : "steady"} tint={reader.tint} state={reader.state} scale={1.2} />
              {alive && (
                <g transform="translate(19 -8)">
                  <Flag tint={reader.tint} label={reader.position!} height={FLAG} />
                </g>
              )}
              <NameTag y={22} text={reader.name} tint={reader.state === "crashed" ? TINTS.grey : reader.tint} />
            </motion.g>
          </g>
        );
      })}

      {/* Reading copies a record to the reader; the wagon itself stays on the track. */}
      {[...marks].map(([offset, mark]) => {
        const target = mark.to === undefined ? undefined : placed.find((p) => p.reader.id === mark.to && p.alive);
        const record = visible.find((r) => r.offset === offset);
        if (!target || !record || (mark.state !== "read" && mark.state !== "dup")) return null;
        const [rx, ry] = at(xOf(offset), 0);
        return (
          <motion.g
            key={`copy-${offset}-${mark.to}-${target.reader.pulse ?? 0}`}
            initial={{ x: rx, y: ry - s * 0.4, opacity: 0, scale: 0.55 }}
            animate={{ x: target.at[0], y: target.at[1] - 50, opacity: [0, 1, 1, 0], scale: 0.55 }}
            transition={{ duration: 0.75, ease: "easeInOut", opacity: { duration: 0.75, times: [0, 0.15, 0.8, 1] } }}
          >
            {wagonFor(offset, record.value, {})}
          </motion.g>
        );
      })}

      {children}
    </g>
  );

  /** The broker's check on the way in. A recognised duplicate rolls up to the barrier and stops. */
  function gateNode(x: number, label: string, rejected: { pulse: number | string; text: string; kind?: WagonKind } | null) {
    const kind = rejected?.kind ?? "order";
    const [bx, by] = at(x, 0.62);
    const [ax, ay] = at(x, -0.55);
    const stop = at(x + 0.62, 0);
    const from = at(TRACK_TO + 1.3, 0);
    const hinge: [number, number] = [bx, by - 24];
    return (
      <g>
        {/* A boom barrier: up while records pass, down across the line when the broker drops a copy. */}
        {(() => {
          const [x2, y2] = rejected ? [ax, ay - 24] : [hinge[0] + 8, hinge[1] - 46];
          return (
            <g>
              <line x1={hinge[0]} y1={hinge[1]} x2={x2} y2={y2} className="rail-gate-arm-ink" />
              <line x1={hinge[0]} y1={hinge[1]} x2={x2} y2={y2} className="rail-gate-arm-base" />
              <line x1={hinge[0]} y1={hinge[1]} x2={x2} y2={y2} className="rail-gate-arm-stripe" />
            </g>
          );
        })()}
        <line x1={bx} y1={by} x2={bx} y2={by - 30} className="flag-pole" />
        <circle cx={bx} cy={by - 24} r={4.5} className={`ink rail-gate-lamp ${rejected ? "is-red" : ""}`} />
        <g transform={`translate(${Math.min(bx - 24, RAIL_STAGE.width - 8 - (label.length * 6.8 + 18))} ${by + 26})`}>
          <rect x={0} y={-10} width={label.length * 6.8 + 18} height={19} rx={9.5} className="ink rail-gate-tag" />
          <text x={label.length * 3.4 + 9} y={3.5} textAnchor="middle" className="rail-gate-text">
            {label}
          </text>
        </g>
        <AnimatePresence>
          {rejected && (
            <motion.g
              key={`rej-${rejected.pulse}`}
              initial={{ x: from[0], y: from[1], opacity: 0 }}
              animate={{ x: stop[0], y: stop[1], opacity: [0, 1, 1, 0.85] }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ type: "spring", stiffness: 110, damping: 16, opacity: { duration: 0.8, times: [0, 0.2, 0.8, 1] } }}
            >
              <g className="rail-rejected">
                <Wagon s={s} kind={kind} state="dup" />
              </g>
              <g transform={`translate(0 ${-s * 1.55})`}>
                <g className="pop">
                  <rect x={-rejected.text.length * 3.3 - 10} y={-11} width={rejected.text.length * 6.6 + 20} height={21} rx={10.5} className="ink rail-reject-pill" />
                  <text y={4} textAnchor="middle" className="rail-reject-text">
                    {rejected.text}
                  </text>
                </g>
              </g>
            </motion.g>
          )}
        </AnimatePresence>
      </g>
    );
  }
}

/** Small text on a wagon's end face (+x), e.g. its sequence number. */
function EndPlate({ s, text }: { s: number; text: string }) {
  const [x, y] = rel(s, 0.44, 0, 0.56);
  return (
    <g transform={`matrix(1 -0.5 0 1 ${x} ${y})`}>
      <rect x={-text.length * 3.2 - 4} y={-8} width={text.length * 6.4 + 8} height={14} rx={3} className="rail-end-plate" />
      <text y={3} textAnchor="middle" className="rail-end-text">
        {text}
      </text>
    </g>
  );
}

/**
 * A transaction marker (control record) as a flat wagon carrying a board: a green tick for
 * commit, a red cross for abort. It takes an offset like any record, but readers never get it.
 */
export function MarkerWagon({ s, kind, label }: { s: number; kind: "commit" | "abort"; label?: number }) {
  const [bx, by] = rel(s, 0, 0, 0.36);
  return (
    <Wagon s={s} kind="neutral" shades={["#e9e5ec", "#cfc9d4", "#b9b2c0"]} open label={label}>
      <g transform={`translate(${bx} ${by})`}>
        <line x1={0} y1={0} x2={0} y2={-s * 0.72} className="flag-pole" />
        <g transform={`translate(0 ${-s * 0.72})`}>
          <circle r={s * 0.24} className={`ink rail-marker ${kind === "commit" ? "is-commit" : "is-abort"}`} />
          {kind === "commit" ? (
            <path d={`M${-s * 0.1} 0l${s * 0.07} ${s * 0.07} ${s * 0.12} ${-s * 0.13}`} className="rail-marker-mark" />
          ) : (
            <path d={`M${-s * 0.09} ${-s * 0.09}l${s * 0.18} ${s * 0.18}m0 ${-s * 0.18}l${-s * 0.18} ${s * 0.18}`} className="rail-marker-mark" />
          )}
        </g>
      </g>
    </Wagon>
  );
}
