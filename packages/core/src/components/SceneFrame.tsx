import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

export interface Metric {
  label: string;
  value: string | number;
  tone?: "plain" | "danger" | "ok" | "warn";
  /** Small colour dot before the label, e.g. a consumer's colour. */
  dot?: string;
}

export interface LegendItem {
  swatch: ReactNode;
  label: string;
}

interface Props {
  metrics?: Metric[];
  controls: ReactNode;
  legend?: LegendItem[];
  paused: boolean;
  width?: number;
  height?: number;
  label: string;
  children: ReactNode;
  /** Extra panels under the drawing: sandbox buttons, event list. */
  footer?: ReactNode;
}

/** The common frame of every scene: counters on top, the drawing, a legend underneath. */
export function SceneFrame({ metrics = [], controls, legend = [], paused, width = 860, height = 520, label, children, footer }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Native SVG animations (parcels travelling along links) follow the pause button too.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (paused) svg.pauseAnimations();
    else svg.unpauseAnimations();
  }, [paused]);

  return (
    <div className="scene">
      <div className="scene-top">
        <div className="metrics">
          {metrics.map((m) => (
            <div key={m.label} className={`metric metric-${m.tone ?? "plain"}`}>
              <span className="metric-label">
                {m.dot && <span className="metric-dot" style={{ background: m.dot }} />}
                {m.label}
              </span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={String(m.value)}
                  className="metric-value"
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 10, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {m.value}
                </motion.span>
              </AnimatePresence>
            </div>
          ))}
        </div>
        {controls}
      </div>
      <div className="scene-canvas">
        <svg
          ref={svgRef}
          className="stage-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={label}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" className="arrow-head" />
            </marker>
          </defs>
          {children}
        </svg>
      </div>
      {legend.length > 0 && (
        <ul className="legend">
          {legend.map((item) => (
            <li key={item.label}>
              <svg width="22" height="18" viewBox="-11 -12 22 18" aria-hidden="true">
                {item.swatch}
              </svg>
              {item.label}
            </li>
          ))}
        </ul>
      )}
      {footer}
    </div>
  );
}
