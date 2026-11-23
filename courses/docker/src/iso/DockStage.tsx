import type { ReactElement } from "react";
import { AnimatePresence, motion } from "motion/react";
import { l, type L } from "@lets-explain/core/i18n";
import type { Shades } from "@lets-explain/core/iso/shapes";
import { imageSize, type Container, type DockerEvent, type Host, type Image, type Volume } from "../engine/docker";
import { BAY, beaconAt, Cabinet, Crate, CRATE_H, Drum, drumPoints, FloorText, FLOOR, hatchAt, Quay, RackBack, RackFront, ShipBox, sideAt, W } from "./dockParts";
import { clip, FileChip, Packet, stampOf, Tag, targetOf, Unresolved, type HostLabels } from "./stageKit";
import "./docker-stage.css";
import "./dock-stage.css";

/**
 * One machine running Docker, drawn as a quay. Containers stand on it as real shipping
 * containers (colour and roof beacon show their state). Images wait in a steel rack at the
 * left end, each one a stack of crates, one crate per layer. What outlives a container stands
 * at the back: Docker's volumes as steel drums on pallets (right), and the host's own folder as
 * a filing cabinet (left). Every mount is a hose from the container's roof to the drum or
 * cabinet it opens. Files written into a container's own layer are a note stuck on its side.
 * Networks are chips under each container; containers on the same user-defined network are
 * joined by a dashed line painted on the quay: they find each other by name. A Compose project's
 * services stand in one painted bay with the project's name on the floor.
 */

interface Props {
  host: Host;
  labels: HostLabels;
  t: (x: L) => string;
  /** Names to glow: the containers (and volumes) the last action touched. */
  highlight?: Set<string>;
  /** Events of the last action. */
  last?: DockerEvent[];
  /** Containers to draw, in order; defaults to all, oldest first. */
  containers?: string[];
  /** Leave out the image rack, for lessons that are not about images. */
  hideImages?: boolean;
  /** A panel is drawn over the bottom of the stage (y ≥ 360): keep everything above it. */
  panel?: boolean;
}

const S = FLOOR.s;
/** The back row (drums) runs along the quay at this depth. */
const BACK = 2.5;
const MAX_DRUMS = 6;
const MAX_SHIPS = 8;
/** Crates drawn per image; an image with more layers still shows its real count on the label. */
const MAX_CRATES = 5;
/** The answer of the last curl or exec is shown at the top right, clear of the drums' labels. */
const ANSWER_Y = 20;
const ANSWER_MAX = 56;
const answerX = (label: string) => Math.min(640, 852 - Math.round(label.length * 12.5 * 0.6 + 20) / 2);
const NET_COLORS = ["var(--sky)", "var(--lilac)", "var(--coral)", "var(--sun)", "var(--mint)"];
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;
const NET_CMD = /^(ping|curl|wget|nslookup)\b/;

const text = {
  hostFolder: l("Host'taki klasör", "Folder on the host"),
  anonymous: l("anonim", "anonymous"),
  empty: l("boş", "empty"),
};

function stateShades(c: Container): Shades {
  if (c.state === "running") return ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"];
  if (c.state === "created") return ["#fffdf8", "#efe5d2", "#ddd0b8"];
  if (c.exitCode === 0) return ["#e9e5ec", "#d6d0dc", "#c2bbc9"];
  return ["var(--coral)", "#f08770", "var(--coral-deep)"];
}

const lampOf = (c: Container) => `is-${c.state === "running" ? (c.health === "starting" ? "warm" : "on") : c.exitCode && c.exitCode !== 0 ? "bad" : "off"}`;

/** Where a container stands: its origin on screen, its world position and the size it is drawn at. */
interface Slot {
  x: number;
  y: number;
  wx: number;
  wy: number;
  sc: number;
  /** Two rows: labels are tighter. */
  tight: boolean;
}

/**
 * Containers stand in a row along the quay, door end towards its far end. More than four make
 * two rows. With the image rack the row moves right; with a panel over the bottom it moves back.
 */
function layout(n: number, opts: { images: boolean; panel: boolean }): (i: number) => Slot {
  if (n > 4) {
    const per = Math.ceil(n / 2);
    const step = per > 3 ? 4.4 : 5.6;
    const sc = 0.6;
    const cx = opts.images ? 14.0 : 10.4;
    return (i) => {
      const r = i < per ? 0 : 1;
      const k = r === 0 ? i : i - per;
      const inRow = r === 0 ? per : n - per;
      // The front row stands straight below the back one on screen: (+6, +6) in tiles.
      const wx = cx + r * 7 + (k - (inRow - 1) / 2) * step;
      const wy = r === 0 ? 4.4 : 11.4;
      const [x, y] = W(wx, wy);
      return { x, y, wx, wy, sc, tight: true };
    };
  }
  const step = n > 3 ? (opts.images ? 5.2 : 5.6) : 6.4;
  const sc = n > 3 ? 0.86 : 1;
  const wy = opts.panel ? 6.0 : 7.8;
  const cx = opts.panel ? (n > 3 ? 11.6 : 10.3) : opts.images ? (n > 3 ? 15.6 : 17.4) : 14.0;
  return (i) => {
    const wx = cx + (i - (n - 1) / 2) * step;
    const [x, y] = W(wx, wy);
    return { x, y, wx, wy, sc, tight: false };
  };
}

/** Where drum `i` of `n` stands along the back of the quay, packed towards its right end. */
function drumAt(i: number, n: number, from: number, end = 24.6): [number, number] {
  const step = n > 5 ? 3.2 : n > 4 ? 3.7 : n > 3 ? 4.1 : 5.0;
  const first = Math.max(from + 1.9, end - (n - 1) * step);
  return W(first + i * step, BACK);
}

/** Where bay `k` of the image rack stands, along the quay's left end. */
const bayAt = (k: number): [number, number] => W(2.2, 3.3 + k * 2.9);

const base = (p: string) => p.split("/").pop() ?? p;
const dirOf = (p: string) => p.slice(0, p.lastIndexOf("/")) || "/";

export function DockStage({ host, labels, t, highlight, last, containers, hideImages, panel = false }: Props) {
  const events = last ?? [];
  const stamp = stampOf(host);
  const all = Object.values(host.containers);
  const picked = containers ? containers.map((n) => all.find((c) => c.name === n)).filter((c): c is Container => Boolean(c)) : all;
  // Containers with a bind mount stand next to the host's folder, so their hose crosses nothing;
  // a Compose project's services stand together.
  const hasBind = (c: Container) => c.mounts.some((m) => m.type === "bind");
  const projects = [...new Set(picked.flatMap((c) => (c.project ? [c.project] : [])))];
  const rank = (c: Container) => (hasBind(c) ? 0 : 1) * 100 + (c.project ? projects.indexOf(c.project) + 1 : 0);
  const grouped = [...picked].sort((a, b) => rank(a) - rank(b));
  const list = grouped.slice(0, MAX_SHIPS);
  const hidden = grouped.length - list.length;

  const volumes = Object.values(host.volumes);
  const showImages = !hideImages;
  const images = Object.values(host.images);
  const userNets = Object.values(host.networks).filter((n) => !n.builtin);
  const netColor = (name: string) =>
    name === "bridge" ? "#ddd3c1" : name === "host" ? "var(--peach)" : name === "none" ? "#c9c2cf" : NET_COLORS[userNets.findIndex((n) => n.name === name) % NET_COLORS.length]!;

  // The host folder: the folder a bind mount opens, else the folder the host's files are in.
  const binds = list.flatMap((c) => c.mounts.filter((m) => m.type === "bind").map((m) => m.source));
  const hostPaths = Object.keys(host.hostFiles).sort();
  const folder = binds[0] ?? (hostPaths[0] && !showImages ? dirOf(hostPaths[0]) : undefined);
  const inFolder = folder ? hostPaths.filter((p) => p.startsWith(`${folder.replace(/\/$/, "")}/`)) : [];
  const showCabinet = folder !== undefined;

  const bays = showImages ? (showCabinet ? 3 : 4) : 0;
  const shelved = images.slice(0, bays);
  const place = layout(list.length, { images: showImages, panel });

  // The volume bay: along the back, right of the rack. With a panel over the bottom, only when there are volumes.
  const showBay = !panel || volumes.length > 0;
  const bayFrom = showImages ? 11.5 : 5.1;
  const maxDrums = showImages ? 4 : MAX_DRUMS;
  const shown = volumes.slice(0, maxDrums);
  // With a panel over the bottom the quay is shorter, so it ends above the panel.
  const qA = panel ? 24 : FLOOR.A;
  const qB = panel ? 9.2 : FLOOR.B;
  const drum = (i: number) => drumAt(i, shown.length, bayFrom, qA - 2.4);
  /** The host's folder stands at the front-left end of the quay. */
  const CAB = showImages ? W(7.6, qB - 1.3) : W(2.6, qB - 2.1);

  // What the last action touched besides containers.
  const touchedVolumes = new Set(events.flatMap((e) => (e.type === "wrote" && e.where === "volume" && e.source ? [e.source] : e.type === "volumeCreated" ? [e.name] : [])));
  const cabinetLit = events.some((e) => e.type === "hostEdited" || (e.type === "wrote" && e.where === "bind"));
  const pulled = events.find((e): e is Extract<DockerEvent, { type: "pulled" }> => e.type === "pulled");
  const created = events.flatMap((e) => (e.type === "created" ? [e.id] : []));

  const lastCurl = events.find((e): e is Extract<DockerEvent, { type: "curlResult" }> => e.type === "curlResult");
  const lastExec = [...events].reverse().find((e): e is Extract<DockerEvent, { type: "execOutput" }> => e.type === "execOutput");

  // Hoses: from a roof hatch to the drum's tap or the cabinet's side.
  const hatchXs = (c: Container) => c.mounts.map((_, k) => (k - (c.mounts.length - 1) / 2) * 1.3);
  const tap = (v: number): [number, number] => {
    const [tx, ty] = drumPoints(S).tap;
    const [dx, dy] = drum(v);
    return [dx + tx, dy + ty];
  };
  const cabinetPort: [number, number] = [CAB[0] + 22, CAB[1] - 36];
  const hatchOf = (i: number, k: number): [number, number] => {
    const p = place(i);
    const [hx, hy] = hatchAt(S * p.sc, hatchXs(list[i]!)[k] ?? 0);
    return [p.x + hx, p.y + hy];
  };
  const hoses: {
    key: string;
    from: [number, number];
    to: [number, number];
    kind: "named" | "anon" | "bind";
  }[] = [];
  list.forEach((c, i) => {
    c.mounts.forEach((m, k) => {
      const from = hatchOf(i, k);
      if (m.type === "bind") {
        if (showCabinet)
          hoses.push({
            key: `${c.id}-${k}`,
            from,
            to: cabinetPort,
            kind: "bind",
          });
        return;
      }
      const v = shown.findIndex((x) => x.name === m.source);
      if (v >= 0)
        hoses.push({
          key: `${c.id}-${k}`,
          from,
          to: tap(v),
          kind: shown[v]!.anonymous ? "anon" : "named",
        });
    });
  });

  // Dashed lines painted between containers on a shared user-defined network: they find each other by name.
  const links: [number, number, string][] = [];
  list.forEach((a, i) =>
    list.forEach((b, j) => {
      if (j <= i) return;
      const shared = a.networks.find((n) => b.networks.includes(n) && !host.networks[n]?.builtin);
      if (shared) links.push([i, j, shared]);
    }),
  );

  const answer = lastCurl
    ? {
        text: `curl localhost:${lastCurl.port} → ${lastCurl.ok ? lastCurl.body : lastCurl.body.replace(/^curl: \(\d+\) /, "")}`,
        ok: lastCurl.ok,
      }
    : lastExec && !NET_CMD.test(lastExec.cmd)
      ? // An error repeats the command and the path; the reason after the last ": " is what matters.
        {
          text: `${lastExec.name}$ ${lastExec.cmd} → ${lastExec.code === 0 ? (lastExec.output[0] ?? "") : (lastExec.output[0] ?? "").split(": ").pop()}`,
          ok: lastExec.code === 0,
        }
      : undefined;

  // The bay's title stands just left of the first drum (or of the empty bay's right end).
  const volTitle: [number, number] = shown.length ? [drum(0)[0] - 66, drum(0)[1] - 96] : [W(qA - 6, BACK)[0] - 10, W(qA - 6, BACK)[1] - 40];
  const emptyAt = W(showImages ? 15.5 : 14.0, panel ? 6.0 : 7.8);

  /** One container in one of two layers: the ship (and what is on it), or its labels, drawn after every ship so none hides them. */
  const drawShip = (c: Container, i: number, layer: "ship" | "labels") => {
    const p = place(i);
    const { x, y, sc, tight } = p;
    const lit = highlight?.has(c.name);
    const state = c.state === "running" ? labels.running : c.state === "created" ? labels.created : `${labels.exited} (${c.exitCode})`;
    const own = Object.keys(c.files);
    const [nx, ny] = sideAt(S * sc, -0.4, 1.05);
    // A new container is made from its image: it comes out of the image's crates in the rack, which stay.
    const from = shelved.findIndex((img) => img.id === c.image);
    const order = created.indexOf(c.id);
    const [fx, fy] = from >= 0 ? bayAt(from) : [x, y - 46];
    const ly = tight ? [30, 48, 66] : [48, 72, 96];
    return (
      <motion.g
        key={`${layer}-${c.id}`}
        // Lowered onto the quay (or brought out of its image) when it is created; lifted away when removed.
        initial={{
          opacity: 0,
          x: fx,
          y: fy - (from >= 0 ? 20 : 0),
          scale: from >= 0 ? 0.35 : 1,
        }}
        animate={{
          opacity: 1,
          x,
          y,
          scale: 1,
          transition: { ...spring, delay: order > 0 ? order * 0.18 : 0 },
        }}
        exit={{ opacity: 0, y: y - 46 }}
        transition={spring}
      >
        {layer === "ship" ? (
          <>
            <g className={`ctr ${lit ? "is-lit" : ""}`}>
              <ShipBox s={S * sc} shades={stateShades(c)} lamp={lampOf(c)} hatches={hatchXs(c)} />
            </g>
            {own.length > 0 && (
              // Files in the container's own writable layer: a note on its side, gone with it.
              <g transform={`translate(${nx} ${ny}) scale(${Math.max(sc, 0.8)})`}>
                <path d="M-34 -11 h62 l6 6 v16 h-68z" className="ship-note" />
                <path d="M28 -11 v6 h6" className="ship-note-fold" />
                <text x={-2} y={4} textAnchor="middle" className="dock-file">
                  {clip(own.length > 1 ? `${base(own[0]!)} +${own.length - 1}` : base(own[0]!), 13)}
                </text>
              </g>
            )}
            {(c.restarts > 0 || c.oomKilled) && (
              // Next to the beacon: how often Docker restarted it, and whether the kernel killed it for memory.
              <g transform={`translate(${beaconAt(S * sc)[0] + 10} ${beaconAt(S * sc)[1]})`}>
                {c.restarts > 0 && (
                  <text x={0} y={4} className="ctr-small halo">
                    ↻{c.restarts}
                  </text>
                )}
                {c.oomKilled && <Tag x={c.restarts > 0 ? 46 : 22} y={0} text="OOM" fill="var(--red-soft)" small />}
              </g>
            )}
          </>
        ) : (
          <>
            <Tag y={ly[0]!} text={c.name} fill="var(--card)" small={tight} />
            <text y={ly[1]! + (tight ? 2 : 0)} textAnchor="middle" className={`ctr-meta halo ${tight ? "is-tight" : ""}`}>
              {clip(c.ref.replace(/:latest$/, ""), tight ? 14 : 22)} · {state}
              {c.oomKilled ? " · OOM" : ""}
              {c.health ? ` · ${c.health}` : ""}
            </text>
            <ChipRow c={c} netColor={netColor} y={ly[2]!} />
            {c.mounts.length > 0 && !tight && (
              // Where each mount appears inside the container, by the hatch its hose leaves from.
              <g transform={`translate(0 ${-94 * sc})`}>
                {c.mounts.slice(0, 2).map((m, k) => {
                  const label = clip(`${m.type === "bind" ? "⇄" : "◉"} ${m.target}`, tight ? 16 : 26);
                  return (
                    <text key={k} x={c.mounts.length > 1 ? (k - 0.5) * 120 * sc : 0} y={0} textAnchor="middle" className="ctr-small halo">
                      {label}
                    </text>
                  );
                })}
              </g>
            )}
          </>
        )}
      </motion.g>
    );
  };

  return (
    <g className="host dock">
      <Quay A={qA} B={qB} />

      {/* Compose projects: one painted bay per project, its name on the floor. */}
      {projects.map((p) => {
        const idx = list.map((c, i) => (c.project === p ? i : -1)).filter((i) => i >= 0);
        return idx.length ? <ProjectZone key={p} name={p} slots={idx.map(place)} /> : null;
      })}

      {/* The rack of images at the left end of the quay. */}
      {showImages && (
        <ImageRack
          images={images}
          shelved={shelved}
          count={bays}
          tagsOf={(id) => Object.keys(host.tags).filter((x) => host.tags[x] === id)}
          title={labels.images}
          empty={labels.noImages}
          pulled={pulled}
          stamp={stamp}
        />
      )}

      {/* Back row: what outlives a container. */}
      {showCabinet && (
        <g transform={`translate(${CAB[0]} ${CAB[1]})`}>
          {/* Its labels stand above it; with the image rack behind it, below it on the quay's edge. */}
          <g transform={`translate(0 ${showImages ? 186 : 0})`}>
            <text x={0} y={-150} textAnchor="middle" className="host-title halo">
              {t(text.hostFolder)}
            </text>
            <Tag y={-130} text={clip(folder!, 22)} fill="var(--sky-soft)" small />
            {inFolder.slice(0, 2).map((p, k) => (
              <text key={p} x={0} y={-108 + k * 14} textAnchor="middle" className="dock-file halo">
                {clip(`${base(p)} · ${host.hostFiles[p]}`, 24)}
              </text>
            ))}
            {inFolder.length > 2 && (
              <text x={0} y={-108 + 2 * 14} textAnchor="middle" className="dock-file halo">
                +{inFolder.length - 2}
              </text>
            )}
          </g>
          <g className={`dock-obj ${cabinetLit ? "is-lit" : ""}`}>
            <Cabinet s={S * 1.25} hasFiles={inFolder.length > 0} />
          </g>
        </g>
      )}

      {showBay && (
        <>
          <VolumeBay from={bayFrom} to={qA - 1.1} />
          <text x={volTitle[0]} y={volTitle[1]} textAnchor="end" className="host-title halo">
            {labels.volumes}
          </text>
        </>
      )}
      <AnimatePresence initial={false}>
        {shown.map((v, i) => {
          const [dx, dy] = drum(i);
          return (
            <motion.g key={v.name} initial={{ opacity: 0, x: dx, y: dy - 24 }} animate={{ opacity: 1, x: dx, y: dy }} exit={{ opacity: 0, scale: 0.6 }} transition={spring}>
              <DrumWithLabel v={v} lit={Boolean(highlight?.has(v.name) || touchedVolumes.has(v.name))} t={t} tight={shown.length > 4} />
            </motion.g>
          );
        })}
      </AnimatePresence>
      {volumes.length > shown.length && (
        <text x={drum(shown.length - 1)[0] + 34} y={drum(shown.length - 1)[1] + 4} className="img-meta halo">
          +{volumes.length - shown.length}
        </text>
      )}

      {/* Hoses run behind the containers, over the floor. */}
      <g className="hoses">
        {hoses.map((hose) => {
          const [x1, y1] = hose.from;
          const [x2, y2] = hose.to;
          const d = hose.kind === "bind" ? `M${x1} ${y1} C ${x1} ${y1 - 46}, ${x2 + 60} ${y2}, ${x2} ${y2}` : `M${x1} ${y1} C ${x1} ${y1 - 44}, ${x2} ${y2 + 44}, ${x2} ${y2}`;
          return (
            <g key={hose.key} className={`hose is-${hose.kind}`}>
              <path d={d} className="hose-out" />
              <path d={d} className="hose-in" />
            </g>
          );
        })}
      </g>

      {links.map(([i, j, net]) => {
        const a = place(i);
        const b = place(j);
        const d = a.wy === b.wy ? `M${a.x} ${a.y + 20 * a.sc} Q ${(a.x + b.x) / 2} ${Math.max(a.y, b.y) + 60 * a.sc}, ${b.x} ${b.y + 20 * b.sc}` : `M${a.x} ${a.y + 14} L ${b.x} ${b.y - 30}`;
        return (
          <g key={`${i}-${j}`}>
            <path d={d} className="dns-lane" style={{ stroke: netColor(net) }} />
            <path d={d} className="dns-link" style={{ stroke: netColor(net) }} />
          </g>
        );
      })}

      {list.length === 0 && (
        <text x={emptyAt[0]} y={emptyAt[1]} textAnchor="middle" className="host-empty halo">
          {labels.noContainers}
        </text>
      )}

      <AnimatePresence initial={false}>{list.map((c, i) => drawShip(c, i, "ship"))}</AnimatePresence>
      <AnimatePresence initial={false}>{list.map((c, i) => drawShip(c, i, "labels"))}</AnimatePresence>
      {hidden > 0 && (
        <text x={place(list.length - 1).x + 70} y={place(list.length - 1).y + 8} className="img-meta halo">
          +{hidden}
        </text>
      )}

      {userNets.length > 0 && !panel && (
        <g transform="translate(724 372)">
          <text x={0} y={0} className="host-title halo">
            {labels.networks}
          </text>
          {userNets.slice(0, 3).map((n, i) => (
            <g key={n.name} transform={`translate(30 ${24 + i * 24})`}>
              <rect x={-26} y={-9} width={52} height={18} rx={9} className="ink" style={{ fill: netColor(n.name) }} />
              <text y={4} textAnchor="middle" className="net-text">
                {clip(n.name, 9)}
              </text>
            </g>
          ))}
        </g>
      )}

      {answer && (
        <g transform={`translate(${answerX(clip(answer.text, ANSWER_MAX))} ${ANSWER_Y})`}>
          <Tag y={0} text={clip(answer.text, ANSWER_MAX)} fill={answer.ok ? "var(--mint)" : "var(--red-soft)"} />
        </g>
      )}

      <DockMotions key={stamp} events={events} list={list} place={place} shown={shown} tap={tap} cabinetPort={cabinetPort} hatchOf={hatchOf} />
    </g>
  );
}

/** The bay along the back of the quay where Docker keeps its volumes: a painted outline on the floor. */
function VolumeBay({ from, to }: { from: number; to: number }) {
  const corners = [W(from, BACK - 1.45), W(to, BACK - 1.45), W(to, BACK + 1.45), W(from, BACK + 1.45)];
  return <polygon points={corners.map((p) => p.join(",")).join(" ")} className="volume-bay" />;
}

/** A Compose project's bay: a painted outline around its services, the project's name on the floor in front. */
function ProjectZone({ name, slots }: { name: string; slots: Slot[] }) {
  const sc = slots[0]!.sc;
  // The name is painted at the zone's left end, clear of the first container.
  const len = (name.length * 15 * 0.62) / 22.4 + 0.6;
  const x0 = Math.min(...slots.map((s) => s.wx)) - 2.6 * sc - len - 0.5;
  const x1 = Math.max(...slots.map((s) => s.wx)) + 2.6 * sc + 0.8;
  const y0 = Math.min(...slots.map((s) => s.wy)) - 1.7;
  const y1 = Math.max(...slots.map((s) => s.wy)) + 1.7;
  const corners = [W(x0, y0), W(x1, y0), W(x1, y1), W(x0, y1)];
  const [tx, ty] = W(x0 + 0.45, y1 - 0.45);
  return (
    <g className="project-zone">
      <polygon points={corners.map((p) => p.join(",")).join(" ")} className="zone-paint" />
      <FloorText x={tx} y={ty} size={15} className="zone-name">
        {name}
      </FloorText>
    </g>
  );
}

/** The image rack: one bay per image, its layers as crates, the name and size on a label beside it. */
function ImageRack({
  images,
  shelved,
  count,
  tagsOf,
  title,
  empty,
  pulled,
  stamp,
}: {
  images: Image[];
  shelved: Image[];
  count: number;
  tagsOf: (id: string) => string[];
  title: string;
  empty: string;
  pulled?: Extract<DockerEvent, { type: "pulled" }>;
  stamp: number;
}) {
  const [tx, ty] = bayAt(0);
  const h = BAY.deck + Math.max(3, ...shelved.map((i) => Math.min(i.layers.length, MAX_CRATES))) * CRATE_H + 0.35;
  return (
    <g className="image-rack">
      <text x={tx - 76} y={ty - 58} textAnchor="end" className="host-title halo">
        {title}
      </text>
      {images.length === 0 && (
        <text x={tx - 76} y={ty - 40} textAnchor="end" className="host-empty halo">
          {empty}
        </text>
      )}
      {/* Empty bays stay: the rack is part of the machine. Drawn back to front. */}
      {Array.from({ length: count }, (_, k) => {
        const [bx, by] = bayAt(k);
        const img = shelved[k];
        return (
          <g key={`bay-${k}`} transform={`translate(${bx} ${by})`}>
            <RackBack s={S} h={h} />
            <AnimatePresence initial={false}>{img && <Stack key={img.id} img={img} all={images} justPulled={pulled?.id === img.id} stamp={stamp} />}</AnimatePresence>
            <RackFront s={S} h={h} />
          </g>
        );
      })}
      {shelved.map((img, k) => {
        const [bx, by] = bayAt(k);
        return (
          <g key={`label-${img.id}`} transform={`translate(${bx + 40} ${by + 12})`}>
            <text x={0} y={0} className="img-tag halo">
              {clip(tagsOf(img.id)[0] ?? `<none> ${img.id.slice(0, 6)}`, 18)}
            </text>
            <text x={0} y={14} className="img-meta halo">
              {img.layers.length} layer · {imageSize(img)} MB
            </text>
          </g>
        );
      })}
      {images.length > shelved.length && (
        <text x={bayAt(shelved.length)[0] - 10} y={bayAt(shelved.length)[1] + 10} className="img-meta halo">
          +{images.length - shelved.length}
        </text>
      )}
    </g>
  );
}

/** An image's crates, one per layer (at most six drawn). On a pull only the layers that were not on disk yet arrive. */
function Stack({ img, all, justPulled, stamp }: { img: Image; all: Image[]; justPulled: boolean; stamp: number }) {
  const n = Math.min(img.layers.length, MAX_CRATES);
  // A layer another image already has was on disk before this pull: only the others download.
  const onDisk = (k: number) => {
    const layer = img.layers[n === img.layers.length ? k : Math.floor((k * img.layers.length) / n)]!;
    return all.some((o) => o.id !== img.id && o.layers.some((x) => x.id === layer.id));
  };
  let downloaded = 0;
  return (
    <motion.g exit={{ opacity: 0, y: -30 }} transition={spring}>
      {Array.from({ length: n }, (_, k) => {
        const crate = <Crate s={S} z={BAY.deck + k * CRATE_H} top={k === n - 1} />;
        if (!justPulled || onDisk(k)) return <g key={k}>{crate}</g>;
        const delay = downloaded++ * 0.12;
        return (
          <motion.g key={`${k}-${stamp}`} initial={{ opacity: 0, y: -60 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay }}>
            {crate}
          </motion.g>
        );
      })}
    </motion.g>
  );
}

const portLabel = (p: { host: number; container: number }) => `localhost:${p.host} → ${p.container}`;
const portWidth = (p: { host: number; container: number }) => Math.round(portLabel(p).length * 11 * 0.6 + 14) + 6;

/** Network chips and published ports under a container, in one centred row. */
function ChipRow({ c, netColor, y }: { c: Container; netColor: (n: string) => string; y: number }) {
  const items: { w: number; el: (x: number) => ReactElement }[] = [
    ...c.networks.map((n) => ({
      w: 52,
      el: (x: number) => (
        <g key={`n-${n}`} transform={`translate(${x} 0)`}>
          <rect x={-24} y={-9} width={48} height={18} rx={9} className="ink" style={{ fill: netColor(n) }} />
          <text y={4} textAnchor="middle" className="net-text">
            {clip(n.replace(/_default$/, ""), 7)}
          </text>
        </g>
      ),
    })),
    ...c.ports.map((p) => ({
      w: portWidth(p),
      el: (x: number) => <Tag key={`p-${p.host}`} x={x} y={0} text={portLabel(p)} fill="var(--sun-soft)" small />,
    })),
  ];
  const total = items.reduce((a, b) => a + b.w, 0);
  let at = -total / 2;
  return (
    <g transform={`translate(0 ${y})`}>
      {items.map((it) => {
        const x = at + it.w / 2;
        at += it.w;
        return it.el(x);
      })}
    </g>
  );
}

/** Where a container's published port tag sits, for the curl packet. */
function portAt(c: Container, port: number) {
  const nets = c.networks.length * 52;
  const widths = c.ports.map(portWidth);
  const total = nets + widths.reduce((a, b) => a + b, 0);
  const k = c.ports.findIndex((p) => p.host === port);
  return -total / 2 + nets + widths.slice(0, k).reduce((a, b) => a + b, 0) + widths[k]! / 2;
}

/**
 * A drum and its labels: the volume's name on a pill (lilac when named, yellow when anonymous)
 * and its first file. With many drums close together the pills are small and an anonymous one
 * shows only its id, so neighbours' labels do not run into each other.
 */
function DrumWithLabel({ v, lit, t, tight }: { v: Volume; lit: boolean; t: (x: L) => string; tight: boolean }) {
  const files = Object.keys(v.files).sort();
  const top = drumPoints(S).top;
  return (
    <g>
      {v.anonymous ? (
        <Tag y={top - 30} text={tight ? v.name.slice(0, 6) : `${t(text.anonymous)} · ${v.name.slice(0, 6)}`} fill="var(--sun-soft)" small />
      ) : (
        <Tag y={top - 30} text={clip(v.name, tight ? 12 : 14)} fill="var(--lilac-soft)" small={tight} />
      )}
      {files.length === 0 ? (
        <text y={top - 9} textAnchor="middle" className="dock-file is-muted halo">
          {t(text.empty)}
        </text>
      ) : (
        <text y={top - 9} textAnchor="middle" className="dock-file halo">
          {clip(files.length > 1 ? `${files[0]} +${files.length - 1}` : files[0]!, 13)}
        </text>
      )}
      <g className={`dock-obj ${lit ? "is-lit" : ""}`}>
        <Drum s={S} named={!v.anonymous} />
      </g>
    </g>
  );
}

/**
 * One-shot motion for what the last action moved: a file going down a hose into a drum or the
 * cabinet, or onto the container's own side; a request coming in through a published port; a
 * packet between containers that found each other by name.
 */
function DockMotions({
  events,
  list,
  place,
  shown,
  tap,
  cabinetPort,
  hatchOf,
}: {
  events: DockerEvent[];
  list: Container[];
  place: (i: number) => Slot;
  shown: Volume[];
  tap: (v: number) => [number, number];
  cabinetPort: [number, number];
  hatchOf: (i: number, k: number) => [number, number];
}) {
  const out: ReactElement[] = [];
  const indexOf = (name: string) => list.findIndex((c) => c.name === name);
  events.forEach((e, n) => {
    if (e.type === "wrote") {
      const i = indexOf(e.name);
      if (i < 0) return;
      const c = list[i]!;
      const { x, y, sc } = place(i);
      const file = base(e.path);
      const k = c.mounts.findIndex((m) => e.path.startsWith(`${m.target}/`) && (e.where === "bind" ? m.type === "bind" : m.type === "volume"));
      const from = hatchOf(i, Math.max(k, 0));
      if (e.where === "volume") {
        const v = shown.findIndex((x) => x.name === e.source);
        if (v < 0) return;
        const [tx, ty] = tap(v);
        out.push(<FileChip key={n} path={[from, [from[0], from[1] - 40], [tx, ty + 30], [tx, ty]]} label={file} />);
      } else if (e.where === "bind") {
        out.push(<FileChip key={n} path={[from, [from[0], from[1] - 40], [cabinetPort[0] + 40, cabinetPort[1]], cabinetPort]} label={file} />);
      } else {
        const [nx, ny] = sideAt(S * sc, -0.4, 1.05);
        out.push(
          <FileChip
            key={n}
            path={[
              [x + nx, y - 110 * sc],
              [x + nx, y + ny - 20],
              [x + nx, y + ny],
            ]}
            label={file}
          />,
        );
      }
    }
    if (e.type === "curlResult") {
      // The request starts where its answer is shown.
      const from = answerX(clip(`curl localhost:${e.port} → ${e.ok ? e.body : e.body.replace(/^curl: \(\d+\) /, "")}`, ANSWER_MAX));
      const i = list.findIndex((c) => c.ports.some((p) => p.host === e.port));
      if (i < 0) {
        // Nothing published on that port: the request stops at the host.
        if (!e.ok)
          out.push(
            <Packet
              key={n}
              path={[
                [from, ANSWER_Y + 14],
                [from, ANSWER_Y + 50],
              ]}
              bad
            />,
          );
        return;
      }
      const { x, y, sc, tight } = place(i);
      const px = x + portAt(list[i]!, e.port);
      out.push(
        <Packet
          key={n}
          path={[
            [from, ANSWER_Y + 14],
            [px, y + (tight ? 66 : 96)],
            [x, y - 20 * sc],
          ]}
          bad={!e.ok}
        />,
      );
    }
    if (e.type === "execOutput") {
      const i = indexOf(e.name);
      if (i < 0 || !NET_CMD.test(e.cmd)) return;
      const target = targetOf(e.cmd, list);
      const a = place(i);
      if (e.code === 0 && target && target.name !== e.name) {
        const b = place(list.indexOf(target));
        out.push(
          <Packet
            key={n}
            path={[
              [a.x, a.y - 30 * a.sc],
              [b.x, b.y - 30 * b.sc],
              [a.x, a.y - 30 * a.sc],
            ]}
          />,
        );
      } else if (e.code !== 0 && e.code !== 126 && e.code !== 127) {
        // The name did not resolve (or nothing answered): nothing reaches another container.
        // (126/127 mean the tool itself is missing in the image: no network was involved.)
        out.push(<Unresolved key={n} x={a.x + 50 * a.sc} y={a.y - 70 * a.sc} />);
      }
    }
  });
  return <g className="host-motion">{out}</g>;
}
