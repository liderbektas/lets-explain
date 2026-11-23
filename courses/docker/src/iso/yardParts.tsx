import type { ReactNode } from "react";
import { boxFaces, pts, rel } from "@lets-explain/core/iso/geometry";
import { Pallet } from "./dockParts";

/**
 * Drawings for the build yard: a tower crane that stacks an image's crates, the build
 * context as cartons on a pallet, and paint (text, plates) on a box's side. Each is drawn
 * around its own origin on the floor and placed with a transform.
 */

const P = (s: number, x: number, y: number, z = 0) => rel(s, x, y, z);
const quad = (s: number, ps: [number, number, number][]) => pts(ps.map((p) => P(s, ...p)));

/** Points zig-zagging up one side of a lattice, between `a` and `b` along that side. */
function zigzag(s: number, at: (u: number, z: number) => [number, number, number], a: number, b: number, z0: number, z1: number, step: number) {
  const out: [number, number][] = [];
  let k = 0;
  for (let z = z0; z <= z1 + 1e-6; z += step) out.push(P(s, ...at(k++ % 2 ? b : a, z)));
  return pts(out);
}

/** Points zig-zagging along a horizontal truss, between heights `z0` and `z1`. */
function zigzagX(s: number, y: number, x0: number, x1: number, z0: number, z1: number, step: number) {
  const out: [number, number][] = [];
  let k = 0;
  for (let x = x0; x <= x1 + 1e-6; x += step) out.push(P(s, x, y, k++ % 2 ? z1 : z0));
  return pts(out);
}

/**
 * A tower crane: a lattice mast on a concrete foot, an operator's cab, and a jib running along
 * +x at height `h` (the counter-jib with its weights along -x). The trolley and hook are not
 * part of it: they move, and are drawn by the stage.
 */
export function Crane({ s, h, reach, back }: { s: number; h: number; reach: number; back: number }) {
  const m = 0.22;
  const foot = boxFaces(s, -0.55, -0.55, 0, 1.1, 1.1, 0.3);
  const mast = boxFaces(s, -m, -m, 0.3, 2 * m, 2 * m, h - 0.3);
  const jib = boxFaces(s, -back, -0.15, h, back + reach, 0.3, 0.28);
  const weight = boxFaces(s, -back + 0.05, -0.32, h - 0.5, 0.7, 0.64, 0.62);
  const cab = boxFaces(s, m, -0.28, h - 0.72, 0.62, 0.56, 0.62);
  const peak = boxFaces(s, -0.1, -0.1, h + 0.28, 0.2, 0.2, 1.1);
  const [px, py] = P(s, 0, 0, h + 1.38);
  const [jx, jy] = P(s, reach * 0.72, 0, h + 0.28);
  const [cx, cy] = P(s, -back + 0.3, 0, h + 0.28);
  return (
    <g className="crane">
      <polygon points={foot.left} className="crane-foot-l" />
      <polygon points={foot.right} className="crane-foot-r" />
      <polygon points={foot.top} className="crane-foot-t" />
      <polygon points={mast.left} className="crane-l" />
      <polygon points={mast.right} className="crane-r" />
      <polyline points={zigzag(s, (u, z) => [u, m, z], -m, m, 0.35, h - 0.05, 0.42)} className="crane-lattice" />
      <polyline points={zigzag(s, (u, z) => [m, u, z], m, -m, 0.35, h - 0.05, 0.42)} className="crane-lattice" />
      <polygon points={weight.left} className="crane-weight-l" />
      <polygon points={weight.right} className="crane-weight-r" />
      <polygon points={weight.top} className="crane-weight-t" />
      <polygon points={jib.left} className="crane-l" />
      <polygon points={jib.right} className="crane-r" />
      <polygon points={jib.top} className="crane-t" />
      <polyline points={zigzagX(s, 0.15, -back, reach, h + 0.02, h + 0.26, 0.36)} className="crane-lattice" />
      <polygon points={cab.left} className="crane-cab-l" />
      <polygon points={cab.right} className="crane-cab-r" />
      <polygon points={cab.top} className="crane-t" />
      <polygon points={quad(s, [[m + 0.1, 0.28, h - 0.6], [m + 0.52, 0.28, h - 0.6], [m + 0.52, 0.28, h - 0.25], [m + 0.1, 0.28, h - 0.25]])} className="crane-window" />
      <polygon points={peak.left} className="crane-l" />
      <polygon points={peak.right} className="crane-r" />
      <line x1={px} y1={py} x2={jx} y2={jy} className="crane-tie" />
      <line x1={px} y1={py} x2={cx} y2={cy} className="crane-tie" />
    </g>
  );
}

/** The crane's trolley, under the jib at `x` tiles from the mast. */
export function Trolley({ s, h }: { s: number; h: number }) {
  const f = boxFaces(s, -0.26, -0.2, h - 0.2, 0.52, 0.4, 0.2);
  return (
    <g className="crane">
      <polygon points={f.left} className="crane-trolley-l" />
      <polygon points={f.right} className="crane-trolley-r" />
    </g>
  );
}

/** The hook block at the end of the cable, drawn around the cable's lower end. */
export function Hook() {
  return (
    <g className="crane-hook">
      <rect x={-4.5} y={-7} width={9} height={7} rx={1.5} />
      <path d="M0 0 v3 a3.2 3.2 0 1 1 -3.2 3.2" />
    </g>
  );
}

/**
 * The build context: what `docker build` sends, as cartons on a pallet. A big context (a
 * node_modules folder that was not left out) is a heavier load.
 */
export function Cargo({ s, size }: { s: number; size: number }) {
  const big = size >= 50;
  const boxes: [number, number, number, number][] = big
    ? [
        [-0.85, -0.85, 0.3, 0.8],
        [0.05, -0.85, 0.3, 0.8],
        [-0.85, 0.05, 0.3, 0.8],
        [0.05, 0.05, 0.3, 0.8],
        [-0.85, -0.85, 1.1, 0.8],
        [0.05, -0.85, 1.1, 0.8],
      ]
    : size >= 1
      ? [
          [-0.8, -0.8, 0.3, 0.6],
          [0.1, -0.8, 0.3, 0.6],
          [-0.35, 0.1, 0.3, 0.6],
        ]
      : [
          [-0.65, -0.65, 0.3, 0.5],
          [0.15, -0.05, 0.3, 0.5],
        ];
  return (
    <g className="cargo">
      <Pallet s={s} a={0.95} />
      {boxes.map(([x, y, z, h], i) => {
        const f = boxFaces(s, x, y, z, 0.8, 0.8, h);
        const [t1x, t1y] = P(s, x + 0.4, y, z + h);
        const [t2x, t2y] = P(s, x + 0.4, y + 0.8, z + h);
        return (
          <g key={i}>
            <polygon points={f.left} className="carton-l" />
            <polygon points={f.right} className="carton-r" />
            <polygon points={f.top} className="carton-t" />
            <line x1={t1x} y1={t1y} x2={t2x} y2={t2y} className="carton-tape" />
          </g>
        );
      })}
    </g>
  );
}

/** How far above its origin the context's load reaches on screen, in tiles: where its label goes. */
export const cargoTop = (size: number) => (size >= 50 ? 2.9 : size >= 1 ? 1.8 : 1.6);

/**
 * Paint on a box's +y side (the lower-left face): a plate and, if given, a word on it.
 * `x, y, z` is the plate's centre in the box's world; `w` its width along x, in tiles.
 */
export function SidePlate({ s, x, y, z, w, hgt, className, children }: { s: number; x: number; y: number; z: number; w: number; hgt: number; className: string; children?: ReactNode }) {
  const [cx, cy] = P(s, x, y, z);
  const k = 1 / Math.sqrt(5);
  return (
    <g>
      <polygon
        points={quad(s, [
          [x - w / 2, y, z - hgt / 2],
          [x + w / 2, y, z - hgt / 2],
          [x + w / 2, y, z + hgt / 2],
          [x - w / 2, y, z + hgt / 2],
        ])}
        className={className}
      />
      {children !== undefined && (
        <text transform={`matrix(${2 * k} ${k} 0 1 ${cx} ${cy})`} y={3} textAnchor="middle" className="plate-text">
          {children}
        </text>
      )}
    </g>
  );
}
