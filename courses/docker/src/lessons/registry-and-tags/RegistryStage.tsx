import { AnimatePresence, motion } from "motion/react";
import { IsoBox, type Shades } from "@lets-explain/core/iso/shapes";
import type { DockerEvent, Host } from "../../engine/docker";

/**
 * This machine on the left, a registry on the right. Each tag is a row with a coloured
 * chip for the image id it points at: two tags with the same chip are the same image. The
 * last push, pull, tag or release is drawn as an arrow between the two sides.
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
      <Panel x={20} title={labels.local} icon="machine" />
      <Panel x={480} title={labels.registry} icon="cloud" />

      {local.length === 0 && (
        <text x={200} y={130} textAnchor="middle" style={{ fill: "var(--ink-3)", fontWeight: 700, fontSize: 13 }}>
          {labels.empty}
        </text>
      )}
      <AnimatePresence initial={false}>
        {local.map(([ref, id], i) => (
          <motion.g key={`l-${ref}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={spring}>
            <Row x={36} y={rowY(i)} refName={ref} id={id} shades={colorOf(id)} lit={tagged?.target === ref || pulled?.ref === ref} />
          </motion.g>
        ))}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {remote.map(([ref, id], i) => (
          <motion.g key={`r-${ref}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={spring}>
            <Row x={496} y={rowY(i)} refName={ref} id={id} shades={colorOf(id)} lit={pushed?.ref === ref || released?.ref === ref} warn={released?.ref === ref} />
          </motion.g>
        ))}
      </AnimatePresence>

      {pushed && localRow(pushed.ref) >= 0 && remoteRow(pushed.ref) >= 0 && (
        <Arrow key={`push-${pushed.ref}`} from={[368, rowY(localRow(pushed.ref))]} to={[492, rowY(remoteRow(pushed.ref))]} label={`push · ${pushed.layers - pushed.skipped}/${pushed.layers} layer`} />
      )}
      {pulled && localRow(pulled.ref) >= 0 && remoteRow(pulled.ref) >= 0 && (
        <Arrow key={`pull-${pulled.ref}`} from={[492, rowY(remoteRow(pulled.ref))]} to={[368, rowY(localRow(pulled.ref))]} label="pull" />
      )}
      {removed && (
        <g transform="translate(200 440)">
          <rect x={-170} y={-12} width={340} height={24} rx={12} className="ink" style={{ fill: removed.untaggedOnly ? "var(--sun-soft)" : "var(--red-soft)" }} />
          <text y={5} textAnchor="middle" style={{ fontSize: 12, fontWeight: 800, fill: "var(--ink)" }}>
            {removed.untaggedOnly ? `${short(removed.ref)}: untagged` : `${short(removed.ref)}: deleted`}
          </text>
        </g>
      )}
      <text x={430} y={458} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, fill: "var(--ink-3)" }}>
        {labels.sameImage}
      </text>
    </g>
  );
}

function Panel({ x, title, icon }: { x: number; title: string; icon: "machine" | "cloud" }) {
  return (
    <g>
      <rect x={x} y={34} width={360} height={392} rx={20} style={{ fill: "var(--ink)" }} />
      <rect x={x} y={30} width={360} height={392} rx={20} className="ink" style={{ fill: icon === "cloud" ? "var(--sky-soft)" : "var(--card)" }} />
      <g transform={`translate(${x + 32} 62)`}>
        {icon === "machine" ? (
          <IsoBox s={10} at={[-1.2, -0.9, 0]} size={[2.4, 1.8, 0.8]} shades={["#fffdf8", "#efe5d2", "#ddd0b8"]} className="ink-box" />
        ) : (
          <path d="M-14 6 a8 8 0 0 1 2 -15 a10 10 0 0 1 19 -2 a7 7 0 0 1 7 13 z" className="ink" style={{ fill: "var(--card)" }} />
        )}
      </g>
      <text x={x + 56} y={67} style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 800, fill: "var(--ink)" }}>
        {title}
      </text>
    </g>
  );
}

function Row({ x, y, refName, id, shades, lit, warn }: { x: number; y: number; refName: string; id: string; shades: Shades; lit?: boolean; warn?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={0} y={-15} width={328} height={30} rx={10} className="ink" style={{ fill: warn ? "var(--red-soft)" : lit ? "var(--tangerine-soft)" : "var(--card)", strokeWidth: lit ? 2.5 : 1.5 }} />
      <text x={12} y={5} style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, fill: "var(--ink)" }}>
        {clip(refName, 32)}
      </text>
      <g transform="translate(272 0)">
        <rect x={-6} y={-11} width={58} height={22} rx={8} className="ink" style={{ fill: shades[0] }} />
        <text x={23} y={4} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, fill: "var(--ink)" }}>
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

const short = (ref: string) => ref.replace(/^ghcr\.io\//, "");

function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
