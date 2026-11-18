import { AnimatePresence, motion } from "motion/react";
import { IsoBox } from "@lets-explain/core/iso/shapes";
import type { BuildStep } from "../engine/docker";
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
}

const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

export function BuildStage({ steps, upTo = steps.length, seconds, size, tag, labels, pending }: Props) {
  const lines = steps.length ? steps.map((s) => s.text) : (pending ?? []);
  const shown = steps.slice(0, upTo);
  const lastStage = Math.max(0, ...steps.map((s) => s.stage));
  // The final stage's layers only: earlier stages are thrown away. FROM is the base layer.
  const layers = shown.filter((s) => s.stage === lastStage && (/^FROM/.test(s.text) || /^(RUN|COPY|ADD)/.test(s.text)));
  const stageOf = (i: number) => steps[i]?.stage ?? 0;

  return (
    <g className="build">
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
            <text x={62} y={y} className="df-line" style={{ fill: st ? "#fffdf8" : "#b9b2c2" }}>
              {clip(text, 40)}
            </text>
            {st && (
              <g transform={`translate(468 ${y - 5})`}>
                <rect x={-70} y={-10} width={70} height={19} rx={9.5} style={{ fill: st.cached ? "var(--mint)" : "var(--peach)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
                <text x={-35} y={4} textAnchor="middle" className="df-badge" style={{ fill: "var(--ink)" }}>
                  {st.cached ? labels.cached : `${labels.ran} ${st.seconds}s`}
                </text>
              </g>
            )}
          </g>
        );
      })}

      <text x={520} y={50} className="host-title">
        {labels.layers}
      </text>
      <g transform="translate(600 400)">
        <AnimatePresence initial={false}>
          {layers.slice(-8).map((s, k) => (
            <motion.g key={`${s.index}-${s.text}`} initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
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
      <g transform="translate(640 438)">
        <rect x={-120} y={-12} width={240} height={24} rx={12} className="ink" style={{ fill: "var(--sun-soft)" }} />
        <text y={5} textAnchor="middle" className="tag-text" style={{ fontSize: 12.5 }}>
          {steps.length ? `${tag.replace(/:latest$/, "")} · ${size} MB · ${labels.total} ${seconds}s` : labels.waiting}
        </text>
      </g>
    </g>
  );
}

function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
