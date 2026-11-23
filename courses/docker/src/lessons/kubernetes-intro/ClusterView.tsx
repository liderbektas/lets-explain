import { AnimatePresence, motion } from "motion/react";
import { boxFaces, pts, rel } from "@lets-explain/core/iso/geometry";
import type { Shades } from "@lets-explain/core/iso/shapes";
import { stampOf } from "../../iso/stageKit";
import type { Cluster, KubeEvent } from "./model";

/**
 * A cluster at a glance, as a harbour with three quays: the control plane's card (what was
 * asked for), a Service on top that spreads requests, and three nodes as quays with their pods
 * standing on them as small shipping containers coloured by version. A node that goes down is a
 * grey quay. Text colours are inline so the stage's default SVG text colour does not win.
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
const SLAB_UP: Shades = ["#efe8da", "#d9cdb6", "#c8bba2"];
const SLAB_DOWN: Shades = ["#e9e5ec", "#d6d0dc", "#c2bbc9"];
/** A node's quay, in tiles: long along x. */
const QX = 7.0;
const QY = 5.6;
const S = 15;
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;
const XS = [170, 430, 690];
const NODE_Y = 330;

/** Where pod `k` of a node stands, relative to the node's centre. */
const podSpot = (k: number) => rel(S, -2.4 + (k % 3) * 2.4, -0.9 + Math.floor(k / 3) * 2.0, 0);
/** The control plane card, where new pods are decided before the scheduler places them. */
const CONTROL: [number, number] = [150, 90];

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
            {served ? `curl web → ${served.pod} (${served.version})` : failed!.why === "no-service" ? "curl web → no Service" : failed!.why === "no-forward" ? "curl → no port-forward" : "curl web → no pods"}
          </text>
        </g>
      )}

      {cluster.nodes.map((n, i) => {
        const pods = cluster.pods.filter((p) => p.node === n.name);
        return (
          <g key={n.name} transform={`translate(${XS[i]} ${NODE_Y})`} opacity={n.up ? 1 : 0.55}>
            <NodeQuay up={n.up} />
            <AnimatePresence initial={false}>
              {pods.slice(0, 6).map((p, k) => {
                const [px, py] = podSpot(k);
                const lit = served?.pod === p.id || fresh.has(p.id);
                // A new pod is made by the control plane and placed on a node by the scheduler; a pod never moves between nodes.
                return (
                  <motion.g key={p.id} initial={{ opacity: 0, x: CONTROL[0] - XS[i]!, y: CONTROL[1] - NODE_Y, scale: 0.4 }} animate={{ opacity: 1, x: px, y: py, scale: 1 }} exit={{ opacity: 0, scale: 0.4 }} transition={spring}>
                    <g style={{ filter: lit ? "drop-shadow(0 0 6px rgba(255,148,102,0.95))" : undefined }}>
                      <PodBox shades={VERSION_SHADES[p.version] ?? VERSION_SHADES.v1!} />
                    </g>
                    {/* The pod's name, painted on its side like a container number. */}
                    <text x={-7} y={1} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 800, fill: "var(--ink)", paintOrder: "stroke", stroke: (VERSION_SHADES[p.version] ?? VERSION_SHADES.v1!)[1], strokeWidth: 3 }}>
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
      {served && <ServedPacket key={stampOf(cluster)} cluster={cluster} pod={served.pod} />}
    </g>
  );
}

/** The request goes to the Service's one address and on to the pod that answered it. */
function ServedPacket({ cluster, pod }: { cluster: Cluster; pod: string }) {
  const p = cluster.pods.find((x) => x.id === pod);
  const i = p ? cluster.nodes.findIndex((n) => n.name === p.node) : -1;
  if (!p || i < 0) return null;
  const k = cluster.pods.filter((x) => x.node === p.node).findIndex((x) => x.id === pod);
  if (k < 0 || k >= 6) return null;
  const [px, py] = podSpot(k);
  return (
    <motion.circle r={7} initial={{ cx: 430, cy: 40, opacity: 0 }} animate={{ cx: [430, 430, XS[i]! + px], cy: [40, 78, NODE_Y + py - 12], opacity: [0, 1, 1, 0] }} transition={{ duration: 0.8, ease: "easeInOut" }} style={{ fill: "var(--sun)", stroke: "var(--ink)", strokeWidth: 2 }} />
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

/** A node as a small quay standing in the water: concrete, a yellow safety line, two bollards. */
function NodeQuay({ up }: { up: boolean }) {
  const f = boxFaces(S, -QX / 2, -QY / 2, -0.45, QX, QY, 0.45);
  const P = (x: number, y: number) => rel(S, x, y, 0);
  const water = [P(-QX / 2 - 0.6, QY / 2 + 0.2), P(QX / 2 + 0.2, QY / 2 + 0.2), P(QX / 2 + 0.2, -QY / 2 - 0.6)].map(([x, y]) => [x, y + 0.45 * S + 6] as [number, number]);
  const line = [P(-QX / 2 + 0.4, QY / 2 - 0.4), P(QX / 2 - 0.4, QY / 2 - 0.4), P(QX / 2 - 0.4, -QY / 2 + 0.4)];
  return (
    <g>
      <polyline points={pts(water)} style={{ fill: "none", stroke: "#cfe2ff", strokeWidth: 10, strokeLinecap: "round", strokeLinejoin: "round" }} />
      <polygon points={f.left} style={{ fill: up ? SLAB_UP[1] : SLAB_DOWN[1], stroke: "var(--ink)", strokeWidth: 2 }} />
      <polygon points={f.right} style={{ fill: up ? SLAB_UP[2] : SLAB_DOWN[2], stroke: "var(--ink)", strokeWidth: 2 }} />
      <polygon points={f.top} style={{ fill: up ? SLAB_UP[0] : SLAB_DOWN[0], stroke: "var(--ink)", strokeWidth: 2 }} />
      <polyline points={pts(line)} style={{ fill: "none", stroke: up ? "var(--sun)" : "#b9b2c2", strokeWidth: 3, strokeDasharray: "10 6", strokeLinecap: "round" }} />
      {[P(-QX / 2 + 0.5, QY / 2 - 0.2), P(QX / 2 - 0.2, -QY / 2 + 0.5)].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <path d="M-4 0 v-6 a4 2 0 0 0 8 0 v6 a4 2 0 0 1 -8 0z" style={{ fill: "#57535f", stroke: "var(--ink)", strokeWidth: 1.5 }} />
          <ellipse cx={0} cy={-6} rx={5} ry={2.5} style={{ fill: "#6d6976", stroke: "var(--ink)", strokeWidth: 1.5 }} />
        </g>
      ))}
    </g>
  );
}

/** A pod as a small shipping container: ribs on its long side, a door end, coloured by version. */
function PodBox({ shades }: { shades: Shades }) {
  const w = 2.0;
  const d = 0.95;
  const h = 1.05;
  const f = boxFaces(S, -w / 2, -d / 2, 0, w, d, h);
  const ribs = [-0.6, -0.3, 0, 0.3, 0.6];
  return (
    <g>
      <polygon points={f.left} style={{ fill: shades[1], stroke: "var(--ink)", strokeWidth: 1.8, strokeLinejoin: "round" }} />
      <polygon points={f.right} style={{ fill: shades[2], stroke: "var(--ink)", strokeWidth: 1.8, strokeLinejoin: "round" }} />
      <polygon points={f.top} style={{ fill: shades[0], stroke: "var(--ink)", strokeWidth: 1.8, strokeLinejoin: "round" }} />
      {ribs.map((x) => {
        const [x1, y1] = rel(S, x, d / 2, 0.12);
        const [x2, y2] = rel(S, x, d / 2, h - 0.12);
        return <line key={x} x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: "rgba(43,42,51,0.4)", strokeWidth: 1.2 }} />;
      })}
      {(() => {
        const [x1, y1] = rel(S, w / 2, 0, 0.1);
        const [x2, y2] = rel(S, w / 2, 0, h - 0.1);
        return <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: "var(--ink)", strokeWidth: 1.4 }} />;
      })()}
    </g>
  );
}
