import { AnimatePresence, motion } from "motion/react";
import { rel } from "@lets-explain/core/iso/geometry";
import { IsoBox, type Shades } from "@lets-explain/core/iso/shapes";
import type { Cluster, KubeEvent } from "./model";

/**
 * A cluster at a glance: the control plane's card (what was asked for), a Service on top that
 * spreads requests, and three nodes as isometric slabs with their pods as small cubes coloured
 * by version. Text colours are inline so the stage's default SVG text colour does not win.
 */

export interface ClusterLabels {
  controlPlane: string;
  deployment: string;
  wanted: string;
  running: string;
  service: string;
  noDeployment: string;
  notReady: string;
}

const VERSION_SHADES: Record<string, Shades> = {
  v1: ["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"],
  v2: ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"],
};
const SLAB_UP: Shades = ["#fffdf8", "#efe5d2", "#ddd0b8"];
const SLAB_DOWN: Shades = ["#e9e5ec", "#d6d0dc", "#c2bbc9"];
const S = 15;
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;
const XS = [170, 430, 690];
const NODE_Y = 330;

const text = (size: number, weight = 800, fill = "var(--ink)") => ({ fontFamily: "var(--font-display)", fontSize: size, fontWeight: weight, fill });

export function ClusterView({ cluster, labels, last }: { cluster: Cluster; labels: ClusterLabels; last: KubeEvent[] }) {
  const served = last.find((e): e is Extract<KubeEvent, { type: "served" }> => e.type === "served");
  const failed = last.find((e): e is Extract<KubeEvent, { type: "curlFailed" }> => e.type === "curlFailed");
  const fresh = new Set(last.flatMap((e) => (e.type === "podCreated" ? [e.id] : [])));

  return (
    <g>
      {/* Control plane: the desired state. */}
      <rect x={24} y={28} width={250} height={112} rx={16} style={{ fill: "var(--ink)" }} />
      <rect x={24} y={24} width={250} height={112} rx={16} style={{ fill: "var(--lilac-soft)", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={42} y={50} style={text(15)}>
        {labels.controlPlane}
      </text>
      {cluster.desired === null ? (
        <text x={42} y={78} style={text(13, 700, "var(--ink-3)")}>
          {labels.noDeployment}
        </text>
      ) : (
        <g>
          <text x={42} y={76} style={text(13, 800)}>
            {labels.deployment} web · shop:{cluster.version}
          </text>
          <text x={42} y={100} style={text(13, 700, "var(--ink-2)")}>
            {labels.wanted}: {cluster.desired} · {labels.running}: {cluster.pods.length}
          </text>
          <g transform="translate(42 116)">
            {Array.from({ length: cluster.desired }, (_, i) => (
              <rect key={i} x={i * 18} y={0} width={14} height={10} rx={3} style={{ fill: i < cluster.pods.length ? "#3fd07f" : "var(--paper-2)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
            ))}
          </g>
        </g>
      )}

      {/* Service: one stable address in front of all the pods. */}
      {cluster.service && (
        <g>
          {cluster.nodes.map((n, i) => (
            <path key={n.name} d={`M430 100 C 430 170, ${XS[i]} 170, ${XS[i]} ${NODE_Y - 70}`} style={{ fill: "none", stroke: n.up ? "var(--ink)" : "var(--ink-3)", strokeWidth: 2, strokeDasharray: "5 6" }} />
          ))}
          <rect x={340} y={58} width={180} height={44} rx={22} style={{ fill: "var(--ink)" }} />
          <rect x={340} y={54} width={180} height={44} rx={22} style={{ fill: "var(--sun)", stroke: "var(--ink)", strokeWidth: 2 }} />
          <text x={430} y={81} textAnchor="middle" style={text(14)}>
            {labels.service} web · :80
          </text>
        </g>
      )}

      {(served || failed) && (
        <g transform="translate(700 50)">
          <rect x={-130} y={-15} width={260} height={30} rx={15} style={{ fill: served ? "var(--mint)" : "var(--red-soft)", stroke: "var(--ink)", strokeWidth: 2 }} />
          <text y={5} textAnchor="middle" style={text(12.5)}>
            {served ? `curl web → ${served.pod} (${served.version})` : failed!.why === "no-service" ? "curl web → no Service" : "curl web → no pods"}
          </text>
        </g>
      )}

      {cluster.nodes.map((n, i) => {
        const pods = cluster.pods.filter((p) => p.node === n.name);
        return (
          <g key={n.name} transform={`translate(${XS[i]} ${NODE_Y})`} opacity={n.up ? 1 : 0.55}>
            <g className="iso-slab">
              <IsoBox s={S} at={[-2.9, -2.9, -0.45]} size={[5.8, 5.8, 0.45]} shades={n.up ? SLAB_UP : SLAB_DOWN} />
            </g>
            <AnimatePresence initial={false}>
              {pods.slice(0, 6).map((p, k) => {
                const [px, py] = rel(S, -1.7 + (k % 3) * 1.7, -1.0 + Math.floor(k / 3) * 1.9, 0);
                const lit = served?.pod === p.id || fresh.has(p.id);
                return (
                  <motion.g key={p.id} initial={{ opacity: 0, x: px, y: py - 30 }} animate={{ opacity: 1, x: px, y: py }} exit={{ opacity: 0, scale: 0.4 }} transition={spring}>
                    <g style={{ filter: lit ? "drop-shadow(0 0 6px rgba(255,148,102,0.95))" : undefined }}>
                      <IsoBox s={S} at={[-0.5, -0.5, 0]} size={[1, 1, 1]} shades={VERSION_SHADES[p.version] ?? VERSION_SHADES.v1!} />
                    </g>
                    <text y={16} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, fill: "var(--ink-2)" }}>
                      {p.id.slice(4)}
                    </text>
                  </motion.g>
                );
              })}
            </AnimatePresence>
            <NodeTag label={n.up ? n.name : `${n.name} · ${labels.notReady}`} up={n.up} />
          </g>
        );
      })}
    </g>
  );
}

function NodeTag({ label, up }: { label: string; up: boolean }) {
  const w = Math.round(label.length * 7.4 + 24);
  return (
    <g transform="translate(0 78)">
      <rect x={-w / 2} y={-12} width={w} height={24} rx={12} style={{ fill: up ? "var(--card)" : "var(--red-soft)", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text y={5} textAnchor="middle" style={text(12.5)}>
        {label}
      </text>
    </g>
  );
}
