import { AnimatePresence, motion } from "motion/react";
import { IsoBox } from "@lets-explain/core/iso/shapes";
import type { BuildStep } from "../engine/docker";
import { stampOf } from "./HostStage";
import "./docker-stage.css";

/**
 * A build, step by step: the Dockerfile on the left with each line marked "cached" or the
 * seconds it took, and the image's layers stacking up on the right. Lines that only change
 * settings (ENV, WORKDIR, CMD…) add no layer.
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
  /** How many steps to show as done (for step-by-step playback). Defaults to all. */
  upTo?: number;
  seconds: number;
  size: number;
  tag: string;
  labels: BuildLabels;
  /** Lines of the Dockerfile to show when nothing was built yet. */
  pending?: string[];
  /** The build just happened: play it line by line. Otherwise show the finished build. */
  play?: boolean;
}

/**
 * When each line starts and how long it takes on screen, in seconds. A cached line is
 * nearly instant (its layer already exists); a line that runs takes longer the longer it ran.
 */
export function buildTimeline(steps: BuildStep[]) {
  const start: number[] = [];
  const end: number[] = [];
  let t = 0.2;
  for (const st of steps) {
    start.push(t);
    t += st.cached ? 0.14 : Math.min(0.6, 0.24 + st.seconds * 0.012);
    end.push(t);
  }
  return { start, end, total: t };
}

const isLayer = (text: string) => /^(FROM|RUN|COPY|ADD)/.test(text);

const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

export function BuildStage({ steps, upTo = steps.length, seconds, size, tag, labels, pending, play }: Props) {
  const lines = steps.length ? steps.map((s) => s.text) : (pending ?? []);
  const shown = steps.slice(0, upTo);
  const lastStage = Math.max(0, ...steps.map((s) => s.stage));
  // The final stage's layers only: earlier stages are thrown away. FROM is the base layer.
  const layers = shown.filter((s) => s.stage === lastStage && isLayer(s.text));
  const stageOf = (i: number) => steps[i]?.stage ?? 0;
  const animate = Boolean(play) && steps.length > 0;
  const tl = buildTimeline(steps);
  // Multi-stage: where the final stage begins, and the earlier stages' layers that are built and then left behind.
  const finalFrom = steps.findIndex((s) => s.stage === lastStage);
  const earlier = animate ? steps.filter((s) => s.stage < lastStage && isLayer(s.text)) : [];
  const copyFrom = animate ? steps.find((s) => s.stage === lastStage && /^COPY --from/.test(s.text)) : undefined;

  return (
    <g className="build" key={animate ? stampOf(steps) : "still"}>
      <rect x={20} y={24} width={470} height={420} rx={18} style={{ fill: "var(--ink)" }} />
      <rect x={20} y={20} width={470} height={420} rx={18} className="ink" style={{ fill: "#2b2a33" }} />
      <text x={40} y={50} className="df-title" style={{ fill: "#fffdf8" }}>
        {labels.dockerfile}
      </text>
      {lines.slice(0, 13).map((text, i) => {
        const st = shown[i];
        const y = 82 + i * 27;
        const other = stageOf(i) !== lastStage && steps.length > 0;
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
              style={{ fill: st ? "#fffdf8" : "#b9b2c2" }}
              initial={{ opacity: animate ? 0.4 : 1 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: animate ? (tl.start[i] ?? 0) : 0 }}
            >
              {clip(text, 40)}
            </motion.text>
            {st && (
              <motion.g
                initial={animate ? { opacity: 0, scale: 0.6 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...spring, delay: animate ? (tl.end[i] ?? 0) : 0 }}
                style={{ x: 468, y: y - 5 }}
              >
                <rect x={-70} y={-10} width={70} height={19} rx={9.5} style={{ fill: st.cached ? "var(--mint)" : "var(--peach)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
                <text x={-35} y={4} textAnchor="middle" className="df-badge" style={{ fill: "var(--ink)" }}>
                  {st.cached ? labels.cached : `${labels.ran} ${st.seconds}s`}
                </text>
              </motion.g>
            )}
          </g>
        );
      })}

      <text x={520} y={50} className="host-title">
        {labels.layers}
      </text>
      {earlier.length > 0 && <LeftBehind layers={earlier} tl={tl} steps={steps} finalFrom={finalFrom} />}
      <g transform="translate(600 400)">
        {/* While a build plays, every layer enters at its own time (the view was just remounted for it). */}
        <AnimatePresence initial={animate}>
          {layers.slice(-8).map((s, k) => (
            <motion.g
              key={`${s.index}-${s.text}`}
              // A cached layer is reused as it is; a line that ran makes a new layer that lands on the stack.
              initial={animate ? (s.cached ? { opacity: 0, y: 0 } : { opacity: 0, y: -40 }) : { opacity: 0, y: -40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={animate ? (s.cached ? { duration: 0.15, delay: tl.end[steps.indexOf(s)] ?? 0 } : { ...spring, delay: tl.end[steps.indexOf(s)] ?? 0 }) : spring}
            >
              <IsoBox
                s={20}
                at={[-2.4, -2.4, k * 0.82]}
                size={[4.8, 4.8, 0.74]}
                shades={s.cached ? ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"] : ["var(--peach)", "var(--peach-mid)", "var(--peach-deep)"]}
                className="layer-slab"
              />
              {/* One label per slab, 16px apart so they never touch. */}
              <text x={100} y={-k * 16.4 - 8} className="layer-label">
                {clip(s.text.split(" ").slice(0, s.text.startsWith("FROM") ? 2 : 3).join(" "), 18)} · {s.size}MB
              </text>
            </motion.g>
          ))}
        </AnimatePresence>
      </g>
      {copyFrom && <CopyChip text={copyFrom.text} at={tl.start[steps.indexOf(copyFrom)] ?? 0} top={layers.findIndex((s) => s === copyFrom)} />}
      <g transform="translate(640 438)">
        <rect x={-120} y={-12} width={240} height={24} rx={12} className="ink" style={{ fill: "var(--sun-soft)" }} />
        <text y={5} textAnchor="middle" className="tag-text" style={{ fontSize: 12.5 }}>
          {steps.length ? `${tag.replace(/:latest$/, "")} · ${size} MB · ${labels.total} ${seconds}s` : labels.waiting}
        </text>
      </g>
    </g>
  );
}

const EARLY: [string, string, string] = ["#e9e5ec", "#d6d0dc", "#c2bbc9"];

/**
 * An earlier stage (e.g. `AS build`) is built like any image, then left behind: once the final
 * stage starts it moves aside, and when the build ends it is gone — it is not part of the image.
 */
function LeftBehind({ layers, tl, steps, finalFrom }: { layers: BuildStep[]; tl: ReturnType<typeof buildTimeline>; steps: BuildStep[]; finalFrom: number }) {
  const aside = tl.start[finalFrom] ?? 0;
  const gone = tl.total;
  const span = gone + 0.4;
  return (
    <g>
      {layers.slice(-6).map((s, k) => {
        const appear = tl.end[steps.indexOf(s)] ?? 0;
        // Keyframe times as fractions of the whole build.
        const f = (t: number) => Math.min(1, Math.max(0, t / span));
        return (
          <motion.g
            key={`${s.index}-${s.text}`}
            initial={{ opacity: 0, x: 600, y: 400, scale: 1 }}
            animate={{ opacity: [0, 1, 1, 0.8, 0.8, 0], x: [600, 600, 600, 760, 760, 760], y: [400, 400, 400, 210, 210, 210], scale: [1, 1, 1, 0.45, 0.45, 0.45] }}
            transition={{ duration: span, times: [0, f(appear), f(aside), f(aside + 0.35), f(gone), 1], ease: "easeInOut" }}
          >
            <IsoBox s={20} at={[-2.4, -2.4, k * 0.82]} size={[4.8, 4.8, 0.74]} shades={EARLY} className="layer-slab" />
          </motion.g>
        );
      })}
    </g>
  );
}

/** `COPY --from`: only the named files travel from the earlier stage into the final image. */
function CopyChip({ text, at, top }: { text: string; at: number; top: number }) {
  const what = text.split(" ").filter((p) => !p.startsWith("--") && p !== "COPY")[0] ?? "";
  const k = Math.max(0, top);
  const ty = 400 - k * 16.4 - 20;
  return (
    <motion.g initial={{ x: 760, y: 190, opacity: 0 }} animate={{ x: [760, 760, 600], y: [190, 190, ty], opacity: [0, 1, 0] }} transition={{ duration: 0.75, delay: at, times: [0, 0.2, 1], ease: "easeInOut" }}>
      <rect x={-52} y={-11} width={104} height={22} rx={8} className="ink" style={{ fill: "var(--sun)" }} />
      <text y={4} textAnchor="middle" className="tag-text" style={{ fontSize: 11 }}>
        {clip(what, 14)}
      </text>
    </motion.g>
  );
}

function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
