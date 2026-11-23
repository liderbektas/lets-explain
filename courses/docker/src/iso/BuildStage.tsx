import type { ReactNode } from "react";
import { motion } from "motion/react";
import { l, type L } from "@lets-explain/core/i18n";
import { rel } from "@lets-explain/core/iso/geometry";
import type { BuildContext, BuildStep } from "../engine/docker";
import { Crate, Pallet, Quay } from "./dockParts";
import { clip, stampOf, Tag } from "./stageKit";
import { Cargo, cargoTop, Crane, Hook, SidePlate, Trolley } from "./yardParts";
import "./docker-stage.css";
import "./dock-stage.css";

/**
 * A build, step by step. The Dockerfile on the left, each line marked "cached", the seconds it
 * ran, or "no layer". On the right, a build yard on the quay: the build context arrives as
 * cartons on a pallet, and a tower crane stacks the image one crate per layer. A layer that was
 * built is lowered by the crane, stamped with its seconds; a layer reused from the cache is
 * simply there, stamped CACHED, and the crane does not move. Lines that only change settings
 * (ENV, WORKDIR, CMD…) add no crate.
 *
 * Multi-stage: the stages the final image is made of stack on the front yard. Any other stage
 * is built on a small yard at the back; `COPY --from` carries its files across, and when the
 * build ends that yard is left behind: it is not part of the image.
 */

export interface BuildLabels {
  dockerfile: string;
  layers: string;
  cached: string;
  ran: string;
  noLayer: string;
  total: string;
  waiting: string;
}

interface Props {
  steps: BuildStep[];
  seconds: number;
  size: number;
  tag: string;
  labels: BuildLabels;
  t: (x: L) => string;
  /** What the build was sent. */
  context?: BuildContext;
  /** Lines of the Dockerfile to show when nothing was built yet. */
  pending?: string[];
  /** The build just happened: play it line by line. Otherwise show the finished build. */
  play?: boolean;
  layout?: "wide" | "tall";
}

const text = {
  context: l("build context", "build context"),
  files: l("dosya", "files"),
  notInImage: l("image'a girmez", "not in the image"),
};

/** The build context arrives first; then the lines run one after another. */
const CONTEXT_IN = 0.5;

/**
 * When each line starts and how long it takes on screen, in seconds. A cached line is
 * nearly instant (its layer already exists); a line that runs takes longer the longer it ran.
 */
export function buildTimeline(steps: BuildStep[]) {
  const start: number[] = [];
  const end: number[] = [];
  let t = CONTEXT_IN;
  for (const st of steps) {
    start.push(t);
    t += st.cached ? 0.14 : Math.min(0.6, 0.24 + st.seconds * 0.012);
    end.push(t);
  }
  return { start, end, total: t };
}

const isLayer = (text: string) => /^(FROM|RUN|COPY|ADD)/.test(text);

const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

/* ------------------------------------------------------------- the yards */

const S = 20;
const PALLET = 0.3;
const CRATE_H = 0.8;

interface Yard {
  /** The pier's back corner on screen, and the size it is drawn at. */
  x: number;
  y: number;
  sc: number;
  A: number;
  B: number;
  mast: [number, number];
  /** The jib's height, its length past the mast and behind it, in tiles. */
  H: number;
  reach: number;
  back: number;
  /** Where each stack stands, in tiles. */
  stacks: [number, number][];
  /** Half a crate's width. */
  a: number;
  max: number;
}

/** The front yard: the image being built. Placed by the layout. */
const frontYard = (x: number, y: number): Yard => ({ x, y, sc: 1, A: 8, B: 6, mast: [1.3, 1.6], H: 7.9, reach: 3.1, back: 1.6, stacks: [[3.4, 1.6]], a: 1.0, max: 8 });
/** Where the build context is unloaded on the front yard. */
const CARGO: [number, number] = [1.0, 5.0];

/** The back yard: stages built on the way and left behind. One or two stacks. */
const backYard = (n: number, x: number, y: number, sc: number): Yard => ({
  x,
  y,
  sc,
  A: 5.4,
  B: 3.6,
  mast: [0.7, 1.8],
  H: 6.3,
  reach: n > 1 ? 4.3 : 3.0,
  back: 1.4,
  stacks: n > 1 ? [[2.5, 1.8], [4.4, 1.8]] : [[3.1, 1.8]],
  a: n > 1 ? 0.85 : 1.25,
  max: 6,
});

/**
 * Where everything goes. "wide" fills the 860×470 stage: the Dockerfile on the left, the yard on
 * the right, a back yard (if any) at the top right. "tall" is for a narrower, taller area (the
 * multi-stage lesson keeps its size bars on the right): a narrower Dockerfile panel only as tall
 * as its lines, the back yard under it, the front yard to its right.
 */
interface Layout {
  panelW: number;
  panelH: (lines: number) => number;
  /** Line pitch in the panel; the tall layout's lines are a little bigger. */
  lineH: number;
  clip: number;
  /** Left edge of the title and the size tag. */
  headX: number;
  titleY: number;
  front: Yard;
  /** Left edge of the build context's labels: clear of the panel and of the crane. */
  cargoTextX: number;
  back: (n: number) => Yard;
}

const LAYOUTS: Record<"wide" | "tall", Layout> = {
  wide: {
    panelW: 470,
    panelH: () => 420,
    lineH: 27,
    clip: 40,
    headX: 520,
    titleY: 50,
    front: frontYard(612, 248),
    cargoTextX: 500,
    back: (n) => backYard(n, 784, 124, 0.6),
  },
  tall: {
    panelW: 440,
    panelH: (lines) => 56 + Math.max(8, Math.min(lines, 13)) * 28,
    lineH: 28,
    clip: 37,
    headX: 474,
    titleY: 42,
    front: frontYard(575, 330),
    cargoTextX: 468,
    back: (n) => backYard(n, 220, 470, 0.8),
  },
};

/** How wide and tall the "tall" layout draws, before the lesson scales it to fit. */
export const TALL_SIZE = { width: 815, height: 602 };

/** A point in a yard's own tiles, on the stage. */
const onStage = (y: Yard, wx: number, wy: number, z = 0): [number, number] => {
  const [px, py] = rel(S, wx, wy, z);
  return [y.x + px * y.sc, y.y + py * y.sc];
};

/** One crate to draw: the line it came from, which stack, which slot, and when it lands. */
interface Box {
  i: number;
  step: BuildStep;
  stack: number;
  slot: number;
  top: boolean;
  /** Built: its line starts at `start`, the crate hangs on the hook at `show` and is down at `land`. Cached: it is just there at `land`. */
  start: number;
  show: number;
  land: number;
  /** COPY --from: where the files come from, on the stage. */
  from?: [number, number];
}

/** The stages of the Dockerfile, which one each FROM builds on, and the chain that ends in the image. */
function stagesOf(steps: BuildStep[]) {
  const ks = [...new Set(steps.map((s) => s.stage))];
  const info = ks.map((k) => {
    const first = steps.findIndex((s) => s.stage === k);
    const m = /^FROM (\S+)(?: AS (\S+))?/.exec(steps[first]!.text);
    return { k, first, base: m?.[1] ?? "", name: m?.[2] };
  });
  // Like the engine: FROM <name> starts from an earlier stage of that name.
  const parentOf = (k: number) => {
    const me = info.find((x) => x.k === k)!;
    return info.find((x) => x.k < k && x.name === me.base)?.k;
  };
  const last = Math.max(0, ...ks);
  const chain: number[] = [];
  for (let k: number | undefined = last; k !== undefined; k = parentOf(k)) chain.unshift(k);
  const others = ks.filter((k) => !chain.includes(k));
  // A FROM that names an earlier stage adds no crate: that stage's crates are already there.
  const startsFromStage = (i: number) => info.some((x) => x.first === i && parentOf(x.k) !== undefined);
  return { info, chain, others, last, crates: (ks: number[]) => steps.flatMap((s, i) => (ks.includes(s.stage) && isLayer(s.text) && !startsFromStage(i) ? [i] : [])) };
}

export function BuildStage({ steps, seconds, size, tag, labels, t, context, pending, play, layout = "wide" }: Props) {
  const lay = LAYOUTS[layout];
  const FRONT = lay.front;
  const lines = steps.length ? steps.map((s) => s.text) : (pending ?? []);
  const animate = Boolean(play) && steps.length > 0;
  const tl = buildTimeline(steps);
  const st = stagesOf(steps);
  const stageOf = (i: number) => steps[i]?.stage ?? 0;

  // The back yard: the latest one or two stages that are not part of the image.
  const backStages = st.others.slice(-2);
  const back = backStages.length ? lay.back(backStages.length) : undefined;

  const boxes = (yard: Yard, stackOf: (i: number) => number, idx: number[]): Box[] => {
    const per = new Map<number, number[]>();
    for (const i of idx) per.set(stackOf(i), [...(per.get(stackOf(i)) ?? []), i]);
    return [...per.entries()].flatMap(([stack, list]) => {
      const shown = list.slice(-yard.max);
      return shown.map((i, slot) => {
        const s = steps[i]!;
        const d = tl.end[i]! - tl.start[i]!;
        return { i, step: s, stack, slot, top: false, start: tl.start[i]!, show: s.cached ? tl.end[i]! : tl.start[i]! + 0.35 * d, land: tl.end[i]! };
      });
    });
  };
  const front = boxes(FRONT, () => 0, st.crates(st.chain));
  if (front.length) front[front.length - 1]!.top = true;
  const behind = back ? boxes(back, (i) => backStages.indexOf(stageOf(i)), st.crates(backStages)) : [];
  const hiddenFront = st.crates(st.chain).length - front.length;

  // COPY --from: the files leave the top of the stage they come from.
  for (const b of front) {
    const m = /^COPY --from=(\S+)/.exec(b.step.text);
    if (!m || b.step.cached || !back) continue;
    const src = st.info.find((x) => x.name === m[1] || String(x.k) === m[1]);
    const k = src ? backStages.indexOf(src.k) : -1;
    if (k < 0) continue;
    const below = behind.filter((x) => x.stack === k && x.i < b.i);
    const [sx, sy] = back.stacks[k]!;
    b.from = onStage(back, sx, sy, PALLET + below.length * CRATE_H + 0.2);
  }
  const leftAt = animate ? tl.total : 0;

  return (
    <g className={`build is-${layout}`} key={animate ? stampOf(steps) : "still"}>
      <rect x={20} y={24} width={lay.panelW} height={lay.panelH(lines.length)} rx={18} style={{ fill: "var(--ink)" }} />
      <rect x={20} y={20} width={lay.panelW} height={lay.panelH(lines.length)} rx={18} className="ink" style={{ fill: "#2b2a33" }} />
      <text x={40} y={50} className="df-title" style={{ fill: "#fffdf8" }}>
        {labels.dockerfile}
      </text>
      {lines.slice(0, 13).map((text, i) => {
        const s = steps[i];
        const y = 82 + i * lay.lineH;
        const other = steps.length > 0 && !st.chain.includes(stageOf(i));
        const kind = !s ? undefined : s.cached ? "cached" : isLayer(s.text) ? "ran" : "none";
        return (
          <g key={i} opacity={other ? 0.55 : 1}>
            <text x={40} y={y} className="df-num" style={{ fill: "#8b8694" }}>
              {i + 1}
            </text>
            {/* A line lights up when it runs. (Opacity, not fill: the stage's CSS would win over an animated fill.) */}
            <motion.text
              x={62}
              y={y}
              className="df-line"
              style={{ fill: s ? "#fffdf8" : "#b9b2c2" }}
              initial={{ opacity: animate ? 0.4 : 1 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: animate ? (tl.start[i] ?? 0) : 0 }}
            >
              {clip(text, lay.clip)}
            </motion.text>
            {s && (
              <motion.g
                initial={animate ? { opacity: 0, scale: 0.6 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...spring, delay: animate ? (tl.end[i] ?? 0) : 0 }}
                style={{ x: lay.panelW - 2, y: y - 5 }}
              >
                <rect x={-70} y={-10} width={70} height={19} rx={9.5} style={{ fill: kind === "cached" ? "var(--mint)" : kind === "ran" ? "var(--peach)" : "#e9e5ec", stroke: "var(--ink)", strokeWidth: 1.5 }} />
                <text x={-35} y={4} textAnchor="middle" className="df-badge" style={{ fill: "var(--ink)" }}>
                  {kind === "cached" ? labels.cached : kind === "ran" ? `${labels.ran} ${s.seconds}s` : labels.noLayer}
                </text>
              </motion.g>
            )}
          </g>
        );
      })}

      <text x={lay.headX} y={lay.titleY} className="host-title">
        {labels.layers}
      </text>
      <SizeTag x={lay.headX} y={lay.titleY + 26} text={steps.length ? `${tag.replace(/:latest$/, "")} · ${size} MB · ${labels.total} ${seconds}s` : labels.waiting} />

      <g className="dock">
        {back && (
          <YardView yard={back} boxes={behind} animate={animate} labels={labels} ghostAt={leftAt} />
        )}
        {back && (
          // Which stage was built here (named by AS), and, once the build is done, that it stays out of the image.
          <g transform={`translate(${onStage(back, back.A / 2, back.B / 2)[0]} ${onStage(back, back.A, back.B)[1] + 24})`}>
            <Tag y={0} text={clip(backStages.map((k) => {
                  const name = st.info.find((x) => x.k === k)!.name;
                  return name ? `AS ${name}` : `stage ${k}`;
                }).join(" · "), 22)} fill="var(--card)" small />
            <motion.text y={20} textAnchor="middle" className="left-behind halo" initial={{ opacity: animate ? 0 : 1 }} animate={{ opacity: 1 }} transition={{ delay: leftAt, duration: 0.3 }}>
              {t(text.notInImage)}
            </motion.text>
          </g>
        )}
        <YardView yard={FRONT} boxes={front} animate={animate} labels={labels} hidden={hiddenFront}>
          {context && steps.length > 0 && <ContextLoad context={context} animate={animate} t={t} left={lay.cargoTextX - FRONT.x} />}
        </YardView>
      </g>
    </g>
  );
}

/** The image's name, size and build time, under the title. */
function SizeTag({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.round(text.length * 11 * 0.6 + 14);
  return <Tag x={x + w / 2} y={y} text={text} fill="var(--sun-soft)" small />;
}

/** The build context: cartons on a pallet, unloaded first, with what was sent and what was left out. */
function ContextLoad({ context, animate, t, left }: { context: BuildContext; animate: boolean; t: (x: L) => string; left: number }) {
  const [x, y] = rel(S, ...CARGO);
  const top = y - cargoTop(context.size) * S;
  const mb = context.size < 1 ? "<1" : String(Math.round(context.size));
  // What was left out, a short line each, two lines at most.
  const out: string[] = [];
  for (const name of context.ignored) {
    const last = out[out.length - 1];
    if (last !== undefined && `${last}, ${name}`.length <= 12) out[out.length - 1] = `${last}, ${name}`;
    else if (out.length < 2) out.push(name);
    else out[1] = `${out[1]} +`;
  }
  const lineY = (k: number) => top - 10 - (out.length - 1 - k) * 13;
  const head = (out.length ? lineY(0) : top - 10) - (out.length ? 14 : 0);
  const tagW = Math.round(t(text.context).length * 11 * 0.6 + 14);
  return (
    <motion.g initial={animate ? { opacity: 0, x: -S, y: -S / 2 } : false} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: 0.4, delay: 0.05, ease: "easeOut" }}>
      <g transform={`translate(${x} ${y})`}>
        <Cargo s={S} size={context.size} />
      </g>
      <Tag x={left + tagW / 2} y={head - 20} text={t(text.context)} fill="var(--sun-soft)" small />
      <text x={left} y={head} className="yard-note halo">
        {context.files} {t(text.files)} · {mb} MB
      </text>
      {out.map((line, k) => (
        <text key={k} x={left} y={lineY(k)} className="yard-note is-out halo">
          ✗ {clip(line, 14)}
        </text>
      ))}
    </motion.g>
  );
}

/**
 * One yard: the pier, its crane, its stacks of crates and (on the front yard) a label per crate.
 * The crane's hook moves only while it lowers a crate that was built.
 */
function YardView({
  yard,
  boxes,
  animate,
  labels,
  hidden = 0,
  ghostAt,
  children,
}: {
  yard: Yard;
  boxes: Box[];
  animate: boolean;
  labels: BuildLabels;
  hidden?: number;
  ghostAt?: number;
  children?: ReactNode;
}) {
  const at = (x: number, y: number): [number, number] => rel(S, x, y);
  const front = yard.sc === 1;
  const [mx, my] = yard.mast;
  const slotZ = (slot: number) => PALLET + slot * CRATE_H;
  const crates = (
    <>
      {yard.stacks.map(([sx, sy], n) => {
        const [px, py] = at(sx, sy);
        return (
          // A pallet under each stack, a little wider than its crates.
          <g key={`p-${n}`} transform={`translate(${px} ${py})`}>
            <Pallet s={S} a={yard.a + 0.1} />
          </g>
        );
      })}
      {boxes.map((b) => {
        const [sx, sy] = yard.stacks[b.stack]!;
        const [px, py] = at(sx, sy);
        const z = slotZ(b.slot);
        const cls = b.step.cached ? "is-cached" : "is-fresh";
        const crate = (
          <>
            <Crate s={S} z={z} top={b.top} a={yard.a} h={CRATE_H} className={cls} />
            <SidePlate s={S} x={0} y={yard.a} z={z + CRATE_H / 2} w={front ? 1.75 : yard.a * 1.3} hgt={0.52} className={`plate ${cls}`}>
              {front ? (b.step.cached ? labels.cached : `${b.step.seconds}s`) : undefined}
            </SidePlate>
          </>
        );
        // A built crate hangs under the hook, then is lowered onto the stack; a cached one is just there.
        const drop = (yard.H - 0.2 - 0.5 - 0.5 - CRATE_H - z) * S;
        return (
          <g key={b.i} transform={`translate(${px} ${py})`}>
            {!animate ? (
              crate
            ) : b.step.cached ? (
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: b.land, duration: 0.15 }}>
                {crate}
              </motion.g>
            ) : (
              <motion.g
                initial={{ opacity: 0, y: -drop }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ opacity: { delay: b.show, duration: 0.06 }, y: { delay: b.show, duration: b.land - b.show, ease: "easeInOut" } }}
              >
                {crate}
              </motion.g>
            )}
          </g>
        );
      })}
    </>
  );
  return (
    <g transform={`translate(${yard.x} ${yard.y}) scale(${yard.sc})`}>
      <Quay A={yard.A} B={yard.B} at={at} />
      <g transform={`translate(${at(mx, my).join(" ")})`}>
        <Crane s={S} h={yard.H} reach={yard.reach} back={yard.back} />
      </g>
      {ghostAt !== undefined ? (
        <motion.g initial={{ opacity: 1 }} animate={{ opacity: 0.45 }} transition={{ delay: ghostAt, duration: 0.4 }}>
          {crates}
        </motion.g>
      ) : (
        crates
      )}
      {children}
      <Hoist yard={yard} boxes={boxes} animate={animate} />
      {front &&
        boxes.map((b) => {
          const [sx, sy] = yard.stacks[b.stack]!;
          const [lx, ly] = rel(S, sx + yard.a, sy - yard.a, slotZ(b.slot) + CRATE_H / 2);
          const words = b.step.text.split(" ").slice(0, b.step.text.startsWith("FROM") ? 2 : 3).join(" ");
          return (
            <motion.text
              key={`l-${b.i}`}
              x={lx + 7}
              y={ly + 4}
              className="layer-label halo"
              initial={{ opacity: animate ? 0 : 1 }}
              animate={{ opacity: 1 }}
              transition={{ delay: animate ? b.land : 0, duration: 0.2 }}
            >
              {clip(words, 18)} · {b.step.size} MB
            </motion.text>
          );
        })}
      {front && hidden > 0 && boxes.length > 0 && (
        <text x={rel(S, yard.stacks[0]![0] + yard.a, yard.stacks[0]![1] - yard.a)[0] + 7} y={rel(S, ...yard.stacks[0]!, slotZ(boxes.length) + CRATE_H / 2)[1] + 4} className="layer-label halo">
          +{hidden}
        </text>
      )}
      {/* COPY --from: the files ride across from the stage they were built in. */}
      {animate &&
        boxes.flatMap((b) => {
          if (!b.from) return [];
          const [sx, sy] = yard.stacks[b.stack]!;
          const [hx, hy] = rel(S, sx, sy, yard.H - 1.3);
          const fx = (b.from[0] - yard.x) / yard.sc;
          const fy = (b.from[1] - yard.y) / yard.sc;
          const what = b.step.text.split(" ").filter((p) => !p.startsWith("--") && p !== "COPY")[0] ?? "";
          const start = b.start;
          return [
            <motion.g
              key={`cf-${b.i}`}
              initial={{ x: fx, y: fy, opacity: 0 }}
              animate={{ x: [fx, fx, hx], y: [fy, fy, hy], opacity: [0, 1, 1, 0] }}
              transition={{ duration: b.show - start + 0.05, delay: start, times: [0, 0.15, 1], ease: "easeInOut" }}
            >
              <Tag y={0} text={clip(what, 14)} fill="var(--sun)" small />
            </motion.g>,
          ];
        })}
    </g>
  );
}

/**
 * The trolley, cable and hook of a yard's crane. At rest the hook hangs just under the jib. For
 * every crate that was built, the trolley runs to its stack, the hook takes the crate up there
 * and lowers it onto its slot. A cached crate does not move the crane.
 */
function Hoist({ yard, boxes, animate }: { yard: Yard; boxes: Box[]; animate: boolean }) {
  const [mx, my] = yard.mast;
  const rest = yard.H - 0.7;
  const lifts = animate ? boxes.filter((b) => !b.step.cached).sort((a, b) => a.show - b.show) : [];
  const offOf = (stack: number) => yard.stacks[stack]![0] - mx;
  const off0 = offOf(lifts[0]?.stack ?? 0);
  // Keyframes: [time, trolley offset along the jib, height of the cable's end].
  const keys: [number, number, number][] = [[0, off0, rest]];
  for (const b of lifts) {
    const [, prevOff, prevZ] = keys[keys.length - 1]!;
    // Nothing moves before the line starts: until then the hook stays where it was.
    const start = Math.max(keys[keys.length - 1]![0], b.start);
    keys.push([start, prevOff, prevZ]);
    keys.push([b.show, offOf(b.stack), rest]);
    keys.push([b.land, offOf(b.stack), PALLET + b.slot * CRATE_H + CRATE_H + 0.5]);
  }
  if (lifts.length) {
    const [tEnd, off] = keys[keys.length - 1]!;
    keys.push([tEnd + 0.3, off, rest]);
  }
  const D = Math.max(0.01, keys[keys.length - 1]![0]);
  const times = keys.map(([k]) => k / D);
  const xy = (off: number) => rel(S, mx + off, my);
  const xs = keys.map(([, o]) => xy(o)[0]);
  const ys = keys.map(([, o]) => xy(o)[1]);
  const cableTop = -(yard.H - 0.2) * S;
  const ends = keys.map(([, , z]) => -z * S);
  const tr = { duration: D, times, ease: "easeInOut" } as const;
  return (
    <motion.g initial={{ x: xs[0], y: ys[0] }} animate={lifts.length ? { x: xs, y: ys } : { x: xs[0], y: ys[0] }} transition={lifts.length ? tr : { duration: 0 }}>
      <Trolley s={S} h={yard.H} />
      <motion.line x1={0} x2={0} y1={cableTop} initial={{ y2: ends[0] }} animate={lifts.length ? { y2: ends } : { y2: ends[0] }} transition={lifts.length ? tr : { duration: 0 }} className="crane-cable" />
      <motion.g initial={{ y: ends[0] }} animate={lifts.length ? { y: ends } : { y: ends[0] }} transition={lifts.length ? tr : { duration: 0 }}>
        <Hook />
      </motion.g>
    </motion.g>
  );
}
