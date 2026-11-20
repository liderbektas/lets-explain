import type { ReactElement } from "react";
import { AnimatePresence, motion } from "motion/react";
import { rel } from "@lets-explain/core/iso/geometry";
import { IsoBox, type Shades } from "@lets-explain/core/iso/shapes";
import { imageSize, type Container, type DockerEvent, type Host } from "../engine/docker";
import "./docker-stage.css";

/**
 * One machine running Docker. Images sit on a shelf on the left as stacks of layers;
 * containers stand in the middle as shipping containers whose colour and lamp show their
 * state; volumes are barrels on the right, networks are coloured chips, and published ports
 * are tags under each container. Containers on the same user-defined network are joined by
 * a dashed line: they can reach each other by name.
 */

export const HOST_STAGE = { width: 860, height: 470 };

export interface HostLabels {
  images: string;
  volumes: string;
  networks: string;
  running: string;
  exited: string;
  created: string;
  noContainers: string;
  noImages: string;
}

interface Props {
  host: Host;
  labels: HostLabels;
  /** Containers to draw, in order; defaults to all, oldest first. */
  containers?: string[];
  /** Hide the image shelf, e.g. for networking lessons. */
  hideImages?: boolean;
  /** Names to glow, e.g. the container the last action touched. */
  highlight?: Set<string>;
  /** Events of the last action: a curl shows its answer at the top. */
  last?: DockerEvent[];
}

const NET_COLORS = ["var(--sky)", "var(--lilac)", "var(--coral)", "var(--sun)", "var(--mint)"];
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

/**
 * The engine clones the host on every action, so each drawn state is its own object. A stamp
 * per object keys one-shot motion (a packet, a file being written) so it plays once per action
 * and not again when the same state is drawn again.
 */
const stamps = new WeakMap<object, number>();
let nextStamp = 0;
export function stampOf(o: object): number {
  let s = stamps.get(o);
  if (s === undefined) {
    s = ++nextStamp;
    stamps.set(o, s);
  }
  return s;
}

/** Where image `i` sits on the shelf. */
const shelf = (i: number): [number, number] => [62, 112 + i * 98];
const BARREL = (i: number): [number, number] => [740, 88 + i * 70];

/** The container a network command inside `from` is talking to: by name, or by Compose service name. */
export function targetOf(cmd: string, list: Container[]): Container | undefined {
  const m = /^(?:ping|curl|wget|nslookup)\s+(?:-\S+\s+)*(?:https?:\/\/)?([a-z0-9_.-]+)/i.exec(cmd);
  if (!m) return undefined;
  const name = m[1]!;
  return list.find((c) => c.name === name) ?? list.find((c) => new RegExp(`^.+-${name}-\\d+$`).test(c.name));
}

function stateShades(c: Container): Shades {
  if (c.state === "running") return ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"];
  if (c.state === "created") return ["#fffdf8", "#efe5d2", "#ddd0b8"];
  if (c.exitCode === 0) return ["#e9e5ec", "#d6d0dc", "#c2bbc9"];
  return ["var(--coral)", "#f08770", "var(--coral-deep)"];
}

export function HostStage({ host, labels, containers, hideImages, highlight, last }: Props) {
  const lastCurl = last?.find((e): e is Extract<DockerEvent, { type: "curlResult" }> => e.type === "curlResult");
  const list = (containers ?? Object.values(host.containers).map((c) => c.name)).map((n) => Object.values(host.containers).find((c) => c.name === n)).filter(Boolean) as Container[];
  const userNets = Object.values(host.networks).filter((n) => !n.builtin);
  const netColor = (name: string) => (name === "bridge" ? "#ddd3c1" : name === "host" ? "var(--peach)" : name === "none" ? "#c9c2cf" : NET_COLORS[userNets.findIndex((n) => n.name === name) % NET_COLORS.length]!);

  const left = hideImages ? 30 : 210;
  const right = 690;
  const cols = list.length <= 2 ? Math.max(1, list.length) : 3;
  const rows = Math.max(1, Math.ceil(list.length / 3));
  const cellW = (right - left) / cols;
  const cellH = rows === 1 ? 300 : 190;
  const top = rows === 1 ? 90 : 40;
  const pos = (i: number): [number, number] => [left + cellW * ((i % cols) + 0.5), top + cellH * (Math.floor(i / cols) + 0.62)];

  // Dashed links between containers that can resolve each other by name.
  const links: [number, number, string][] = [];
  list.forEach((a, i) =>
    list.forEach((b, j) => {
      if (j <= i) return;
      const shared = a.networks.find((n) => b.networks.includes(n) && !host.networks[n]?.builtin);
      if (shared) links.push([i, j, shared]);
    }),
  );

  const images = Object.values(host.images);
  const tagsOf = (id: string) => Object.keys(host.tags).filter((t) => host.tags[t] === id);
  const volumes = Object.values(host.volumes);

  const events = last ?? [];
  const stamp = stampOf(host);
  const shelved = hideImages ? [] : images.slice(0, 4);
  // `docker run` / `compose up`: each new container comes out of its image, in creation order.
  const created = events.flatMap((e) => (e.type === "created" ? [e.id] : []));
  const pulled = events.find((e): e is Extract<DockerEvent, { type: "pulled" }> => e.type === "pulled");
  const indexOf = (name: string) => list.findIndex((c) => c.name === name);

  return (
    <g className="host">
      {lastCurl && (
        <g transform="translate(450 26)">
          <Tag y={0} text={clip(`curl localhost:${lastCurl.port} → ${lastCurl.ok ? lastCurl.body : lastCurl.body.replace(/^curl: \(\d+\) /, "")}`, 62)} fill={lastCurl.ok ? "var(--mint)" : "var(--red-soft)"} />
        </g>
      )}

      {!hideImages && (
        <g>
          <text x={24} y={34} className="host-title">
            {labels.images}
          </text>
          {images.length === 0 && (
            <text x={24} y={60} className="host-empty">
              {labels.noImages}
            </text>
          )}
          {images.slice(0, 4).map((img, i) => {
            const y = 112 + i * 98;
            const n = Math.min(img.layers.length, 6);
            // A layer another image already has was on disk before this pull: only the others download.
            const justPulled = pulled?.id === img.id;
            const onDisk = (k: number) => {
              const layer = img.layers[n === img.layers.length ? k : Math.floor((k * img.layers.length) / n)]!;
              return images.some((o) => o.id !== img.id && o.layers.some((x) => x.id === layer.id));
            };
            let downloaded = 0;
            return (
              <g key={img.id} transform={`translate(62 ${y})`}>
                {Array.from({ length: n }, (_, k) => {
                  const box = <IsoBox s={15} at={[-1.3, -1.3, k * 0.42]} size={[2.6, 2.6, 0.38]} shades={k === n - 1 ? ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"] : ["#fffdf8", "#efe5d2", "#ddd0b8"]} className="layer-slab" />;
                  if (!justPulled || onDisk(k)) return <g key={k}>{box}</g>;
                  const delay = downloaded++ * 0.12;
                  return (
                    <motion.g key={`${k}-${stamp}`} initial={{ opacity: 0, y: -60 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay }}>
                      {box}
                    </motion.g>
                  );
                })}
                <text x={46} y={-18} className="img-tag">
                  {clip(tagsOf(img.id)[0] ?? `<none> ${img.id.slice(0, 6)}`, 18)}
                </text>
                <text x={46} y={-2} className="img-meta">
                  {img.layers.length} layer · {imageSize(img)} MB
                </text>
              </g>
            );
          })}
          {images.length > 4 && (
            <text x={24} y={108 + 4 * 96 - 30} className="img-meta">
              +{images.length - 4}
            </text>
          )}
        </g>
      )}

      {list.length === 0 && (
        <text x={(left + right) / 2} y={230} textAnchor="middle" className="host-empty">
          {labels.noContainers}
        </text>
      )}

      {links.map(([i, j, net]) => {
        const [x1, y1] = pos(i);
        const [x2, y2] = pos(j);
        return <path key={`${i}-${j}`} d={`M${x1} ${y1 + 26} Q ${(x1 + x2) / 2} ${Math.max(y1, y2) + 70}, ${x2} ${y2 + 26}`} className="dns-link" style={{ stroke: netColor(net) }} />;
      })}

      <AnimatePresence initial={false}>
        {list.map((c, i) => {
          const [x, y] = pos(i);
          const lit = highlight?.has(c.name);
          const state = c.state === "running" ? labels.running : c.state === "created" ? labels.created : `${labels.exited} (${c.exitCode})`;
          const [lx, ly] = rel(17, 0.2, -0.55, 1.35);
          // A new container is made from its image: it comes out of the image on the shelf, which stays.
          const from = shelved.findIndex((img) => img.id === c.image);
          const order = created.indexOf(c.id);
          const [fx, fy] = from >= 0 ? shelf(from) : [x, y - 30];
          return (
            <motion.g
              key={c.id}
              initial={{ opacity: 0, x: fx, y: fy, scale: from >= 0 ? 0.35 : 1 }}
              animate={{ opacity: 1, x, y, scale: 1, transition: { ...spring, delay: order > 0 ? order * 0.18 : 0 } }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={spring}
            >
              <g className={`ctr ${lit ? "is-lit" : ""}`}>
                <IsoBox s={17} at={[-1.6, -0.75, 0]} size={[3.2, 1.5, 1.35]} shades={stateShades(c)} className="ctr-box" />
                {/* Corrugation lines on the front face. */}
                {[0.4, 1.0, 1.6, 2.2, 2.8].map((k) => {
                  const [a1, b1] = rel(17, -1.6 + k, 0.75, 0.15);
                  const [a2, b2] = rel(17, -1.6 + k, 0.75, 1.2);
                  return <line key={k} x1={a1} y1={b1} x2={a2} y2={b2} className="ctr-rib" />;
                })}
                <circle cx={lx} cy={ly - 4} r={5} className={`ctr-lamp is-${c.state === "running" ? (c.health === "starting" ? "warm" : "on") : c.exitCode && c.exitCode !== 0 ? "bad" : "off"}`} />
                {c.restarts > 0 && (
                  <text x={lx + 12} y={ly} className="ctr-small">
                    ↻{c.restarts}
                  </text>
                )}
              </g>
              <Tag y={34} text={c.name} fill="var(--card)" />
              <text y={58} textAnchor="middle" className="ctr-meta">
                {clip(c.ref.replace(/:latest$/, ""), 22)} · {state}
                {c.oomKilled ? " · OOM" : ""}
                {c.health ? ` · ${c.health}` : ""}
              </text>
              <g transform="translate(0 78)">
                {c.ports.map((p, k) => (
                  <Tag key={k} x={(k - (c.ports.length - 1) / 2) * 112} y={0} text={`localhost:${p.host} → ${p.container}`} fill="var(--sun-soft)" small />
                ))}
              </g>
              <g transform={`translate(${-48} -46)`}>
                {c.networks.map((n, k) => (
                  <g key={n} transform={`translate(${k * 50} 0)`}>
                    <rect x={-22} y={-9} width={46} height={18} rx={9} className="ink" style={{ fill: netColor(n) }} />
                    <text y={4} textAnchor="middle" className="net-text">
                      {clip(n.replace(/_default$/, ""), 7)}
                    </text>
                  </g>
                ))}
              </g>
              {c.mounts.length > 0 && (
                <text x={0} y={-58} textAnchor="middle" className="ctr-small">
                  {c.mounts.map((m) => `${m.type === "bind" ? "⇄" : "◉"} ${m.target}`).join("  ")}
                </text>
              )}
            </motion.g>
          );
        })}
      </AnimatePresence>

      <g transform="translate(712 0)">
        <text x={0} y={34} className="host-title">
          {labels.volumes}
        </text>
        {volumes.slice(0, 4).map((v, i) => (
          <g key={v.name} transform={`translate(28 ${88 + i * 70})`}>
            <Barrel />
            <text x={30} y={-6} className="img-tag">
              {clip(v.anonymous ? `${v.name.slice(0, 6)}…` : v.name, 12)}
            </text>
            <text x={30} y={10} className="img-meta">
              {Object.keys(v.files).length} file
            </text>
          </g>
        ))}
        {volumes.length > 4 && (
          <text x={0} y={88 + 4 * 70} className="img-meta">
            +{volumes.length - 4}
          </text>
        )}
        {userNets.length > 0 && (
          <g transform={`translate(0 ${88 + Math.min(4, volumes.length) * 70 + 10})`}>
            <text x={0} y={0} className="host-title">
              {labels.networks}
            </text>
            {userNets.slice(0, 3).map((n, i) => (
              <g key={n.name} transform={`translate(${30} ${26 + i * 26})`}>
                <rect x={-26} y={-9} width={52} height={18} rx={9} className="ink" style={{ fill: netColor(n.name) }} />
                <text y={4} textAnchor="middle" className="net-text">
                  {clip(n.name, 9)}
                </text>
              </g>
            ))}
          </g>
        )}
      </g>

      <Motions key={stamp} events={events} list={list} pos={pos} volumes={volumes.slice(0, 4).map((v) => v.name)} indexOf={indexOf} />
    </g>
  );
}

/**
 * One-shot motion for what the last action moved: a file written into a volume or the
 * container's own layer, a request coming in through a published port, a packet between
 * containers that found each other by name.
 */
function Motions({ events, list, pos, volumes, indexOf }: { events: DockerEvent[]; list: Container[]; pos: (i: number) => [number, number]; volumes: string[]; indexOf: (name: string) => number }) {
  const out: ReactElement[] = [];
  events.forEach((e, n) => {
    if (e.type === "wrote") {
      const i = indexOf(e.name);
      if (i < 0) return;
      const [x, y] = pos(i);
      const file = e.path.split("/").pop()!;
      if (e.where === "volume") {
        const v = volumes.indexOf(e.source ?? "");
        if (v < 0) return;
        const [bx, by] = BARREL(v);
        out.push(<FileChip key={n} path={[[x, y - 20], [bx, by - 20], [bx, by - 4]]} label={file} />);
      } else if (e.where === "bind") {
        // The file lands in the host's folder, outside the container.
        out.push(<FileChip key={n} path={[[x, y - 20], [x - 70, y + 40], [x - 90, y + 60]]} label={e.source ? clip(e.source, 22) : file} />);
      } else {
        // The container's own writable layer: the file stays in the container and goes when it is removed.
        out.push(<FileChip key={n} path={[[x, y - 70], [x, y - 22], [x, y - 14]]} label={file} />);
      }
    }
    if (e.type === "curlResult") {
      const i = list.findIndex((c) => c.ports.some((p) => p.host === e.port));
      if (i < 0) {
        // Nothing published on that port: the request stops at the host.
        if (!e.ok) out.push(<Packet key={n} path={[[450, 40], [450, 74]]} bad />);
        return;
      }
      const [x, y] = pos(i);
      const c = list[i]!;
      const k = c.ports.findIndex((p) => p.host === e.port);
      const px = x + (k - (c.ports.length - 1) / 2) * 112;
      out.push(<Packet key={n} path={[[450, 40], [px, y + 78], [x, y + 6]]} bad={!e.ok} />);
    }
    if (e.type === "execOutput") {
      const i = indexOf(e.name);
      if (i < 0 || !/^(ping|curl|wget|nslookup)\b/.test(e.cmd)) return;
      const [sx, sy] = pos(i);
      const target = targetOf(e.cmd, list);
      if (e.code === 0 && target && target.name !== e.name) {
        const [tx, ty] = pos(list.indexOf(target));
        out.push(<Packet key={n} path={[[sx, sy], [tx, ty], [sx, sy]]} />);
      } else if (e.code !== 0 && e.code !== 126 && e.code !== 127) {
        // The name did not resolve (or nothing answered): nothing reaches another container.
        // (126/127 mean the tool itself is missing in the image: no network was involved.)
        out.push(<Unresolved key={n} x={sx + 40} y={sy - 40} />);
      }
    }
  });
  return <g className="host-motion">{out}</g>;
}

function FileChip({ path, label }: { path: [number, number][]; label: string }) {
  const w = Math.round(Math.min(label.length, 22) * 6.8 + 22);
  return (
    <motion.g
      initial={{ x: path[0]![0], y: path[0]![1], opacity: 0 }}
      animate={{ x: path.map((p) => p[0]), y: path.map((p) => p[1]), opacity: [0, 1, 1, 0] }}
      transition={{ duration: 0.85, ease: "easeInOut" }}
    >
      <rect x={-w / 2} y={-10} width={w} height={20} rx={6} className="ink" style={{ fill: "var(--sun-soft)" }} />
      <text y={4} textAnchor="middle" className="tag-text" style={{ fontSize: 11 }}>
        {clip(label, 22)}
      </text>
    </motion.g>
  );
}

function Packet({ path, bad }: { path: [number, number][]; bad?: boolean }) {
  return (
    // A delivered packet fades once it arrives (the answer shows at the top); a refused one stays red where it stopped.
    <motion.g initial={{ x: path[0]![0], y: path[0]![1], opacity: 0 }} animate={{ x: path.map((p) => p[0]), y: path.map((p) => p[1]), opacity: bad ? [0, 1, 1] : [0, 1, 1, 0] }} transition={{ duration: bad ? 0.75 : 0.9, ease: "easeInOut" }}>
      <motion.circle r={7} className="ink" initial={{ fill: "#ffd66b" }} animate={{ fill: bad ? ["#ffd66b", "#ffd66b", "#f2615a"] : "#ffd66b" }} transition={{ duration: 0.75 }} />
    </motion.g>
  );
}

function Unresolved({ x, y }: { x: number; y: number }) {
  return (
    <motion.g initial={{ x, y, scale: 0, opacity: 0 }} animate={{ x, y, scale: 1, opacity: 1 }} transition={spring}>
      <circle r={12} className="ink" style={{ fill: "var(--red-soft)" }} />
      <text y={5} textAnchor="middle" className="tag-text" style={{ fontSize: 14 }}>
        ?
      </text>
    </motion.g>
  );
}

function Barrel() {
  return (
    <g className="barrel">
      <path d="M-16 -16 v26 a16 7 0 0 0 32 0 v-26" />
      <ellipse cx={0} cy={-16} rx={16} ry={7} />
      <path d="M-16 -3 a16 7 0 0 0 32 0" className="barrel-band" />
    </g>
  );
}

export function Tag({ x = 0, y, text, fill, small }: { x?: number; y: number; text: string; fill: string; small?: boolean }) {
  const size = small ? 11 : 12.5;
  const w = Math.round(text.length * size * 0.6 + (small ? 14 : 20));
  const h = small ? 18 : 22;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2 + 3} width={w} height={h} rx={h / 2} className="pill-shadow" />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} className="ink" style={{ fill }} />
      <text y={size * 0.36} textAnchor="middle" className="tag-text" style={{ fontSize: size }}>
        {text}
      </text>
    </g>
  );
}

function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
