import { AnimatePresence, motion } from "motion/react";
import { IsoBox, type Shades } from "@lets-explain/core/iso/shapes";
import "./registry.css";
import type { DockerEvent, Host } from "../../engine/docker";
import { stampOf } from "../../iso/stageKit";

/**
 * This machine on the left as a quay with a rack, a registry on the right as a cargo ship at
 * sea. Each tag is a row: a labelled crate on the rack here, a container on the ship's deck
 * there, each with a coloured box for the image id it points at: two tags with the same box are
 * the same image. The last push, pull, tag or release is drawn as an arrow between the two
 * sides, and only the layers that really travel cross the water as crates.
 */

export interface RegistryLabels {
  local: string;
  registry: string;
  empty: string;
  sameImage: string;
}

interface Props {
  host: Host;
  last: DockerEvent[];
  labels: RegistryLabels;
  /** Registry tags worth showing (the registry also holds every official base image). */
  showRemote: (ref: string) => boolean;
  /** Local tags worth showing. */
  showLocal: (ref: string) => boolean;
}

const CHIPS: Shades[] = [
  ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"],
  ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"],
  ["var(--lilac)", "#a993ee", "var(--lilac-deep)"],
  ["var(--sun)", "#f2bd3a", "#d9a826"],
  ["var(--coral)", "#f08770", "var(--coral-deep)"],
  ["var(--peach)", "var(--peach-mid)", "var(--peach-deep)"],
];
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

export function RegistryStage({ host, last, labels, showRemote, showLocal }: Props) {
  // One colour per image id, in order of first appearance on either side.
  const ids: string[] = [];
  const local = Object.entries(host.tags).filter(([t]) => showLocal(t)).sort(([a], [b]) => a.localeCompare(b));
  const remote = Object.entries(host.registry.tags).filter(([t]) => showRemote(t)).sort(([a], [b]) => a.localeCompare(b));
  for (const [, id] of [...local, ...remote]) if (!ids.includes(id)) ids.push(id);
  const colorOf = (id: string) => CHIPS[ids.indexOf(id) % CHIPS.length]!;

  const pushed = last.find((e): e is Extract<DockerEvent, { type: "pushed" }> => e.type === "pushed");
  const pulled = last.find((e): e is Extract<DockerEvent, { type: "pulled" }> => e.type === "pulled");
  const tagged = last.find((e): e is Extract<DockerEvent, { type: "tagged" }> => e.type === "tagged");
  const released = last.find((e): e is Extract<DockerEvent, { type: "upstreamReleased" }> => e.type === "upstreamReleased");
  const removed = last.find((e): e is Extract<DockerEvent, { type: "imageRemoved" }> => e.type === "imageRemoved");

  const rowY = (i: number) => 104 + i * 40;
  const localRow = (ref: string) => local.findIndex(([t]) => t === ref);
  const remoteRow = (ref: string) => remote.findIndex(([t]) => t === ref);

  return (
    <g className="registry">
      <Sea />
      <QuayPanel title={labels.local} />
      <ShipPanel title={labels.registry} rows={remote.length} />

      {local.length === 0 && (
        <text x={200} y={130} textAnchor="middle" style={{ fill: "var(--ink-3)", fontWeight: 700, fontSize: 13 }}>
          {labels.empty}
        </text>
      )}
      <AnimatePresence initial={false}>
        {local.map(([ref, id], i) => {
          // `docker tag` copies nothing: the new name comes out of the row of the image it points at.
          const src = tagged?.target === ref ? localRow(tagged.source) : -1;
          return (
            <motion.g
              key={`l-${ref}`}
              initial={src >= 0 ? { opacity: 0, x: 0, y: rowY(src) } : { opacity: 0, x: -20, y: rowY(i) }}
              animate={{ opacity: 1, x: 0, y: rowY(i) }}
              exit={{ opacity: 0, x: -20 }}
              transition={spring}
            >
              <Row x={36} y={0} refName={ref} id={id} shades={colorOf(id)} lit={tagged?.target === ref || pulled?.ref === ref} kind="crate" />
            </motion.g>
          );
        })}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {remote.map(([ref, id], i) => (
          <motion.g key={`r-${ref}`} initial={{ opacity: 0, x: 20, y: rowY(i) }} animate={{ opacity: 1, x: 0, y: rowY(i) }} exit={{ opacity: 0 }} transition={spring}>
            <Row x={496} y={0} refName={ref} id={id} shades={colorOf(id)} lit={pushed?.ref === ref || released?.ref === ref} warn={released?.ref === ref} kind="box" />
          </motion.g>
        ))}
      </AnimatePresence>

      {pushed && localRow(pushed.ref) >= 0 && remoteRow(pushed.ref) >= 0 && (
        <g key={`push-${stampOf(host)}`}>
          <Arrow from={[368, rowY(localRow(pushed.ref))]} to={[492, rowY(remoteRow(pushed.ref))]} label={`push · ${pushed.layers - pushed.skipped}/${pushed.layers} layer`} />
          {/* Only layers the registry does not have yet travel. */}
          <LayerTrain count={pushed.layers - pushed.skipped} from={[368, rowY(localRow(pushed.ref))]} to={[492, rowY(remoteRow(pushed.ref))]} />
        </g>
      )}
      {pulled && localRow(pulled.ref) >= 0 && remoteRow(pulled.ref) >= 0 && (
        <g key={`pull-${stampOf(host)}`}>
          <Arrow from={[492, rowY(remoteRow(pulled.ref))]} to={[368, rowY(localRow(pulled.ref))]} label={`pull · ${pulled.layers - pulled.reused}/${pulled.layers} layer`} />
          <LayerTrain count={pulled.layers - pulled.reused} from={[492, rowY(remoteRow(pulled.ref))]} to={[368, rowY(localRow(pulled.ref))]} />
        </g>
      )}
      {removed && (
        <g transform="translate(200 440)">
          <rect x={-170} y={-12} width={340} height={24} rx={12} className="ink" style={{ fill: removed.untaggedOnly ? "var(--sun-soft)" : "var(--red-soft)" }} />
          <text y={5} textAnchor="middle" style={{ fontSize: 12, fontWeight: 800, fill: "var(--ink)" }}>
            {removed.untaggedOnly ? `${short(removed.ref)}: untagged` : `${short(removed.ref)}: deleted`}
          </text>
        </g>
      )}
      <text x={640} y={452} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, fill: "var(--ink-2)" }}>
        {labels.sameImage}
      </text>
    </g>
  );
}

/** The water under both sides: the quay stands in it, the ship floats on it. */
function Sea() {
  return (
    <g className="reg-sea">
      <rect x={0} y={404} width={860} height={66} className="reg-water" />
      {[60, 300, 430, 560, 760].map((x, i) => (
        <path key={i} d={`M${x - 14} ${436 + (i % 2) * 12} q7 -6 14 0 t14 0`} className="reg-wave" />
      ))}
    </g>
  );
}

const rowTop = 84;
const FILLER = ["#d5dbe6", "#c9d0dc", "#dfe3ea", "#cfd6e2", "#e3dfd6"];

/** This machine: a quay wall in the water and a steel rack on it, one shelf per tag. */
function QuayPanel({ title }: { title: string }) {
  return (
    <g className="reg-quay">
      <rect x={20} y={404} width={360} height={52} className="reg-wall" />
      <line x1={20} y1={412} x2={380} y2={412} className="reg-stripe" />
      <rect x={20} y={394} width={360} height={14} className="reg-top" />
      {[44, 356].map((x) => (
        <g key={x} transform={`translate(${x} 394)`} className="reg-bollard">
          <path d="M-5 0 v-8 a5 2.5 0 0 0 10 0 v8 a5 2.5 0 0 1 -10 0z" />
          <ellipse cx={0} cy={-8} rx={6.5} ry={3.2} />
        </g>
      ))}
      {/* The rack: two uprights and a beam under every shelf. */}
      {[26, 374].map((x) => (
        <rect key={x} x={x - 4} y={rowTop - 8} width={8} height={394 - rowTop + 8} className="reg-post" />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={22} y={rowTop + 20 + i * 40 + 15} width={356} height={6} className="reg-beam" />
      ))}
      <g transform="translate(38 54)">
        <path d="M0 10 l14 -9 l14 9 v14 h-28z" className="reg-shed" />
        <rect x={9} y={14} width={10} height={10} className="reg-shed-door" />
      </g>
      <text x={76} y={70} className="reg-title">
        {title}
      </text>
    </g>
  );
}

/** The registry: a cargo ship whose deck carries one container per tag, its bridge at the stern. */
function ShipPanel({ title, rows }: { title: string; rows: number }) {
  return (
    <g className="reg-ship">
      {/* Hull, waterline and the bridge at the stern. */}
      <path d="M476 372 H848 L834 424 H498 Z" className="reg-hull" />
      <path d="M484 398 H842 L838 412 H492 Z" className="reg-waterline" />
      <rect x={790} y={300} width={50} height={72} className="reg-bridge" />
      {[0, 1, 2].map((k) => (
        <rect key={k} x={798 + k * 14} y={310} width={8} height={8} className="reg-window" />
      ))}
      <rect x={808} y={286} width={14} height={14} className="reg-funnel" />
      <text x={496} y={392} className="reg-hull-name">
        {title}
      </text>
      {/* The deck the containers stand on. */}
      <rect x={486} y={364} width={300} height={8} className="reg-deck" />
      {/* Below the tags shown here the ship carries everything else the registry holds (every
          official base image, other people's images): unlabelled containers down to the deck. */}
      {Array.from({ length: Math.max(0, 7 - rows) }, (_, k) => {
        const i = rows + k;
        return [0, 1].map((j) => (
          <g key={`${i}-${j}`} transform={`translate(${496 + j * 142} ${rowTop + 20 + i * 40})`}>
            <rect x={0} y={-15} width={138} height={30} rx={3} className="ink" style={{ fill: FILLER[(i + j * 3) % FILLER.length] }} />
            {Array.from({ length: 9 }, (_, r) => (
              <line key={r} x1={12 + r * 13} y1={-11} x2={12 + r * 13} y2={11} className="reg-rib" />
            ))}
          </g>
        ));
      })}
    </g>
  );
}

function Row({ x, y, refName, id, shades, lit, warn, kind }: { x: number; y: number; refName: string; id: string; shades: Shades; lit?: boolean; warn?: boolean; kind: "crate" | "box" }) {
  const fill = warn ? "var(--red-soft)" : lit ? "var(--tangerine-soft)" : kind === "crate" ? "#f3dcb2" : "#e4ebf7";
  const w = kind === "crate" ? 328 : 282;
  return (
    <g transform={`translate(${x} ${y})`} className={`reg-row is-${kind}`}>
      <rect x={0} y={-15} width={w} height={30} rx={kind === "crate" ? 4 : 3} className="ink" style={{ fill, strokeWidth: lit ? 2.5 : 1.6 }} />
      {kind === "crate" ? (
        // Planks of a wooden crate.
        <>
          <line x1={2} y1={0} x2={w - 70} y2={0} className="reg-plank" />
          <line x1={8} y1={-15} x2={8} y2={15} className="reg-plank" />
        </>
      ) : (
        // Corrugation of a shipping container.
        Array.from({ length: 6 }, (_, k) => <line key={k} x1={208 - k * 4} y1={-11} x2={208 - k * 4} y2={11} className="reg-rib" />)
      )}
      <text x={14} y={5} className="reg-ref">
        {clip(refName, kind === "crate" ? 32 : 26)}
      </text>
      <g transform={`translate(${w - 56} 0)`}>
        {/* The colour is the image the tag points at: when the tag moves, only the colour changes. */}
        <rect x={-6} y={-11} width={58} height={22} rx={kind === "crate" ? 8 : 3} className="ink" style={{ fill: shades[0], transition: "fill 0.4s" }} />
        <text x={23} y={4} textAnchor="middle" className="reg-id">
          {id.slice(0, 6)}
        </text>
      </g>
    </g>
  );
}

function Arrow({ from, to, label }: { from: [number, number]; to: [number, number]; label: string }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dir = x2 > x1 ? 1 : -1;
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <path d={`M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`} style={{ fill: "none", stroke: "var(--tangerine-deep)", strokeWidth: 3 }} />
      <path d={`M${x2 - dir * 9} ${y2 - 6} L${x2} ${y2} L${x2 - dir * 9} ${y2 + 6}`} style={{ fill: "none", stroke: "var(--tangerine-deep)", strokeWidth: 3, strokeLinecap: "round" }} />
      <g transform={`translate(${(x1 + x2) / 2} ${(y1 + y2) / 2 - 16})`}>
        <rect x={-62} y={-11} width={124} height={22} rx={11} className="ink" style={{ fill: "var(--tangerine)" }} />
        <text y={4} textAnchor="middle" style={{ fontFamily: "var(--font-display)", fontSize: 11.5, fontWeight: 800, fill: "var(--ink)" }}>
          {label}
        </text>
      </g>
    </motion.g>
  );
}

/** Layer blobs travelling one after another along a push or pull. */
function LayerTrain({ count, from, to }: { count: number; from: [number, number]; to: [number, number] }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  return (
    <g>
      {Array.from({ length: Math.min(count, 5) }, (_, k) => (
        <motion.g
          key={k}
          initial={{ x: x1, y: y1, opacity: 0 }}
          animate={{ x: [x1, mx, x2], y: [y1, (y1 + y2) / 2, y2], opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, delay: 0.15 + k * 0.12, ease: "easeInOut" }}
        >
          <IsoBox s={6} at={[-1.3, -1.3, 0]} size={[2.6, 2.6, 1.3]} shades={["#f3dcb2", "#e2c697", "#c9a874"]} className="ink-box" />
        </motion.g>
      ))}
    </g>
  );
}

const short = (ref: string) => ref.replace(/^ghcr\.io\//, "");

function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
