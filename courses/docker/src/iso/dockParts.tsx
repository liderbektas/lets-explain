import { boxFaces, pts, rel } from "@lets-explain/core/iso/geometry";
import type { Shades } from "@lets-explain/core/iso/shapes";

/**
 * Drawings for the dock stage: the quay floor, a corrugated shipping container, a steel drum
 * on a pallet and a filing cabinet. Each is drawn around its own origin (the centre of its
 * footprint on the floor) and placed with a transform.
 */

const P = (s: number, x: number, y: number, z = 0) => rel(s, x, y, z);
const line = (s: number, a: [number, number, number], b: [number, number, number]) => {
  const [x1, y1] = P(s, ...a);
  const [x2, y2] = P(s, ...b);
  return { x1, y1, x2, y2 };
};
const quad = (s: number, ps: [number, number, number][]) => pts(ps.map((p) => P(s, ...p)));

/* -------------------------------------------------------------- the quay */

const defaultAt = (x: number, y: number) => W(x, y);

/** The quay: a long slab, x along its length, in tiles of `s` px; `ox, oy` is its back corner on screen. */
export const FLOOR = { A: 27, B: 13.5, s: 20, ox: 290, oy: 26, t: 12 };

/** A world point on the quay, on screen. */
export function W(x: number, y: number, z = 0): [number, number] {
  const { s, ox, oy } = FLOOR;
  return [ox + (x - y) * s, oy + ((x + y) * s) / 2 - z * s];
}

/**
 * A concrete quay: panel seams, a dashed yellow line along the water edges and a few bollards.
 * `at` puts a world point on screen; the dock's own quay by default, a smaller one elsewhere.
 */
export function Quay({ A = FLOOR.A, B = FLOOR.B, at: W = defaultAt }: { A?: number; B?: number; at?: (x: number, y: number) => [number, number] } = {}) {
  const { t } = FLOOR;
  const T = W(0, 0);
  const R = W(A, 0);
  const Bt = W(A, B);
  const L = W(0, B);
  const seams: [[number, number], [number, number]][] = [];
  for (let x = 3.5; x < A; x += 3.5) seams.push([W(x, 0), W(x, B)]);
  for (let y = 3.5; y < B; y += 3.5) seams.push([W(0, y), W(A, y)]);
  const edge = [W(0.9, B - 0.7), W(A - 0.7, B - 0.7), W(A - 0.7, 0.9)];
  const bollards = [W(1.6, B - 0.35), W(A - 0.35, 1.6)];
  // The water along the two front edges: the quay is a quay.
  const sea = [
    [L[0], L[1] + t],
    [Bt[0], Bt[1] + t],
    [R[0], R[1] + t],
    [R[0] + 10, R[1] + t + 8],
    [Bt[0], Bt[1] + t + 22],
    [L[0] - 10, L[1] + t + 8],
  ] as [number, number][];
  const waves = [W(A * 0.22, B + 1.1), W(A * 0.56, B + 1.2), W(A + 1.1, B * 0.45), W(A + 1.0, B * 0.92)];
  return (
    <g className="quay">
      <polygon points={pts(sea)} className="quay-sea" />
      {waves.map(([x, y], i) => (
        <path key={i} d={`M${x - 14} ${y + 4} q7 -6 14 0 t14 0`} className="quay-wave" />
      ))}
      <polygon points={pts([L, Bt, [Bt[0], Bt[1] + t], [L[0], L[1] + t]])} className="quay-side-l" />
      <polygon points={pts([Bt, R, [R[0], R[1] + t], [Bt[0], Bt[1] + t]])} className="quay-side-r" />
      <polygon points={pts([T, R, Bt, L])} className="quay-top" />
      {seams.map(([a, b], i) => (
        <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="quay-seam" />
      ))}
      <polyline points={pts(edge)} className="quay-edge" />
      {bollards.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`} className="bollard">
          <path d="M-5 0 v-8 a5 2.5 0 0 0 10 0 v8 a5 2.5 0 0 1 -10 0z" />
          <ellipse cx={0} cy={-8} rx={6.5} ry={3.2} />
        </g>
      ))}
    </g>
  );
}

/* ------------------------------------------------------ shipping container */

export const SHIP = { w: 5.0, d: 2.1, h: 2.3 };

/**
 * A 20-foot shipping container, long along x: ribs on the long side (+y), a door end (+x) with
 * two leaves and four locking bars, a status beacon on the roof. `hatches` are the roof
 * couplings a mount's hose plugs into.
 */
export function ShipBox({ s, shades, lamp, hatches }: { s: number; shades: Shades; lamp: string; hatches: number[] }) {
  const { w, d, h } = SHIP;
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -d / 2;
  const y1 = d / 2;
  const f = boxFaces(s, x0, y0, 0, w, d, h);
  const n = 22;
  const ribs = Array.from({ length: n - 1 }, (_, i) => x0 + ((i + 1) * w) / n).filter((x) => x > x0 + 0.2 && x < x1 - 0.2);
  const bars = [0.2, 0.38, 0.62, 0.8].map((k) => y0 + d * k);
  const [bx, by] = P(s, x1 - 0.55, 0, h);
  return (
    <g className="ship">
      <polygon points={quad(s, [[x0 - 0.1, y0 + 0.3, 0], [x1 + 0.5, y0 + 0.3, 0], [x1 + 0.5, y1 + 0.45, 0], [x0 - 0.1, y1 + 0.45, 0]])} className="ship-shadow" />
      <polygon points={f.left} style={{ fill: shades[1] }} />
      <polygon points={f.right} style={{ fill: shades[2] }} />
      <polygon points={f.top} style={{ fill: shades[0] }} />
      {/* Long side: bottom and top rails, corner posts, corrugation. */}
      <polygon points={quad(s, [[x0, y1, 0], [x1, y1, 0], [x1, y1, 0.17], [x0, y1, 0.17]])} className="ship-rail" />
      <polygon points={quad(s, [[x0, y1, h - 0.13], [x1, y1, h - 0.13], [x1, y1, h], [x0, y1, h]])} className="ship-rail" />
      <polygon points={quad(s, [[x0, y1, 0], [x0 + 0.16, y1, 0], [x0 + 0.16, y1, h], [x0, y1, h]])} className="ship-post" />
      {ribs.map((x) => (
        <line key={x} {...line(s, [x, y1, 0.22], [x, y1, h - 0.18])} className="ship-rib" />
      ))}
      {/* Door end: frame, the seam between the two leaves, locking bars with handles. */}
      <polygon points={quad(s, [[x1, y0 + 0.1, 0.17], [x1, y1 - 0.1, 0.17], [x1, y1 - 0.1, h - 0.13], [x1, y0 + 0.1, h - 0.13]])} className="ship-door" />
      <line {...line(s, [x1, 0, 0.17], [x1, 0, h - 0.13])} className="ship-seam" />
      {bars.map((y) => (
        <g key={y}>
          <line {...line(s, [x1, y, 0.24], [x1, y, h - 0.2])} className="ship-bar" />
          <line {...line(s, [x1, y, 0.95], [x1, y + 0.13, 0.78])} className="ship-bar" />
        </g>
      ))}
      {/* Roof: hatches for mounts and the beacon that shows the state. */}
      {hatches.map((x) => {
        const [hx, hy] = P(s, x, 0, h);
        return <ellipse key={x} cx={hx} cy={hy} rx={7} ry={3.5} className="ship-hatch" />;
      })}
      <line x1={bx} y1={by} x2={bx} y2={by - 7} className="ship-bar" />
      <circle cx={bx} cy={by - 11} r={5.5} className={`ctr-lamp ${lamp}`} />
    </g>
  );
}

/** Where the roof beacon's lamp is, relative to the container's origin. */
export const beaconAt = (s: number): [number, number] => {
  const [x, y] = P(s, SHIP.w / 2 - 0.55, 0, SHIP.h);
  return [x, y - 11];
};
/** Where roof hatch `x` (in tiles along the roof) is, relative to the container's origin. */
export const hatchAt = (s: number, x: number) => P(s, x, 0, SHIP.h);
/** A point on the long (+y) side, for the note of files in the container's own layer. */
export const sideAt = (s: number, x: number, z: number) => P(s, x, SHIP.d / 2, z);

/* -------------------------------------------------------------- steel drum */

export const DRUM = { rx: 25, h: 52, pallet: 0.3 };

/** Where a drum's tap and lid are, relative to its origin (the pallet's centre on the floor). */
export function drumPoints(s: number) {
  const base = -DRUM.pallet * s;
  const ry = DRUM.rx / 2;
  return { tap: [0, base + ry - 9] as [number, number], lid: [0, base - DRUM.h] as [number, number], top: base - DRUM.h - ry };
}

/**
 * A 200-litre steel drum standing on a wooden pallet: two rolling hoops, a lid with two bungs
 * and a tap at the front. A named volume is painted and labelled; an anonymous one is bare
 * steel with a question-mark sticker: nobody gave it a name to find it by.
 */
export function Drum({ s, named }: { s: number; named: boolean }) {
  const { rx, h } = DRUM;
  const ry = rx / 2;
  const base = -DRUM.pallet * s;
  const top = base - h;
  const yAt = (x: number, y: number) => y + ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
  const strip = (a: number, b: number) => `M${a} ${yAt(a, top)} L${a} ${yAt(a, base)} A${rx} ${ry} 0 0 0 ${b} ${yAt(b, base)} L${b} ${yAt(b, top)} A${rx} ${ry} 0 0 1 ${a} ${yAt(a, top)} Z`;
  const hoop = (y: number) => `M${-rx} ${y} A${rx} ${ry} 0 0 0 ${rx} ${y}`;
  return (
    <g className={`drum ${named ? "is-named" : "is-anon"}`}>
      <Pallet s={s} />
      <path d={`M${-rx} ${base} V${top} A${rx} ${ry} 0 0 0 ${rx} ${top} V${base} A${rx} ${ry} 0 0 1 ${-rx} ${base} Z`} className="drum-side" />
      <path d={strip(-rx * 0.62, -rx * 0.38)} className="drum-shine" />
      <path d={strip(rx * 0.5, rx)} className="drum-shade" />
      {named && <path d={`${hoop(top + h * 0.42)} V${top + h * 0.62} A${rx} ${ry} 0 0 1 ${-rx} ${top + h * 0.62} Z`} className="drum-band" />}
      <path d={hoop(top + h * 0.3)} className="drum-hoop" />
      <path d={hoop(top + h * 0.72)} className="drum-hoop" />
      <ellipse cx={0} cy={top} rx={rx} ry={ry} className="drum-rim" />
      <ellipse cx={0} cy={top + 1} rx={rx - 4} ry={ry - 2.4} className="drum-lid" />
      <ellipse cx={-rx * 0.42} cy={top} rx={4} ry={2} className="drum-bung" />
      <ellipse cx={rx * 0.45} cy={top + 1.5} rx={2.6} ry={1.3} className="drum-bung" />
      {!named && (
        <g transform={`translate(${-2} ${top + h * 0.52 + ry * 0.6})`}>
          <circle r={7.5} className="drum-sticker" />
          <text y={3.8} textAnchor="middle" className="drum-q">
            ?
          </text>
        </g>
      )}
      {/* The tap at the front, where a hose plugs in. */}
      <rect x={-4} y={base + ry - 13} width={8} height={7} rx={1.5} className="drum-tap" />
    </g>
  );
}

/** A wooden pallet, `2a` tiles square, around its origin on the floor. */
export function Pallet({ s, a = 1.25, h = DRUM.pallet }: { s: number; a?: number; h?: number }) {
  const pf = boxFaces(s, -a, -a, 0, 2 * a, 2 * a, h);
  const k = a / 1.25;
  return (
    <g className="pallet">
      <polygon points={pf.left} className="pallet-l" />
      <polygon points={pf.right} className="pallet-r" />
      <polygon points={pf.top} className="pallet-t" />
      {[-0.8, 0, 0.8].map((y) => (
        <line key={y} {...line(s, [-a, (y + 0.36) * k, h], [a, (y + 0.36) * k, h])} className="pallet-gap" />
      ))}
    </g>
  );
}

/* ---------------------------------------------------------- filing cabinet */

/** A steel filing cabinet: the folder on the host that a bind mount opens. Drawers face +x. */
export function Cabinet({ s, hasFiles }: { s: number; hasFiles: boolean }) {
  const w = 1.5;
  const d = 1.3;
  const h = 2.9;
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -d / 2;
  const y1 = d / 2;
  const f = boxFaces(s, x0, y0, 0, w, d, h);
  const drawers: [number, number][] = [
    [0.15, 0.98],
    [1.06, 1.89],
    [1.97, 2.8],
  ];
  return (
    <g className="cabinet">
      <polygon points={f.left} className="cab-l" />
      <polygon points={f.right} className="cab-r" />
      <polygon points={f.top} className="cab-t" />
      {drawers.map(([z0, z1]) => {
        const [hx1, hy1] = P(s, x1, -0.22, (z0 + z1) / 2 + 0.12);
        const [hx2, hy2] = P(s, x1, 0.22, (z0 + z1) / 2 + 0.12);
        return (
          <g key={z0}>
            <polygon points={quad(s, [[x1, y0 + 0.12, z0], [x1, y1 - 0.12, z0], [x1, y1 - 0.12, z1], [x1, y0 + 0.12, z1]])} className="cab-drawer" />
            <polygon points={quad(s, [[x1, -0.2, z1 - 0.3], [x1, 0.2, z1 - 0.3], [x1, 0.2, z1 - 0.1], [x1, -0.2, z1 - 0.1]])} className="cab-card" />
            <line x1={hx1} y1={hy1 + 6} x2={hx2} y2={hy2 + 6} className="cab-handle" />
          </g>
        );
      })}
      {hasFiles && (
        // A folder sticks out of the top: the folder holds files.
        <polygon points={quad(s, [[-0.35, -0.05, h], [0.45, -0.05, h], [0.45, -0.05, h + 0.55], [0.2, -0.05, h + 0.7], [-0.35, -0.05, h + 0.7]])} className="cab-folder" />
      )}
    </g>
  );
}

/* ------------------------------------------------------------ image rack */

/** One bay of the image rack: a steel pallet rack, open towards +x, the image's crates on its deck. */
export const BAY = { w: 2.5, d: 2.5, deck: 0.42 };
/** How tall one layer crate is, in tiles. */
export const CRATE_H = 0.62;

/** The rack's back half: back posts and the deck, drawn before the crates. */
export function RackBack({ s, h }: { s: number; h: number }) {
  const { w, d, deck } = BAY;
  const x0 = -w / 2;
  const y0 = -d / 2;
  const deckF = boxFaces(s, x0, y0, deck - 0.16, w, d, 0.16);
  const post = (x: number, y: number) => boxFaces(s, x - 0.08, y - 0.08, 0, 0.16, 0.16, h);
  const back = [post(x0, y0), post(x0, y0 + d)];
  const [bx1, by1] = P(s, x0, y0, h - 0.2);
  const [bx2, by2] = P(s, x0, y0 + d, h - 0.2);
  return (
    <g className="rack">
      {back.map((f, i) => (
        <g key={i}>
          <polygon points={f.left} className="rack-post-l" />
          <polygon points={f.right} className="rack-post-r" />
        </g>
      ))}
      {/* A cross brace on the back frame and the back beam. */}
      <line {...line(s, [x0, y0, deck], [x0, y0 + d, h - 0.3])} className="rack-brace" />
      <line x1={bx1} y1={by1} x2={bx2} y2={by2} className="rack-beam-back" />
      {/* The deck's legs at the front corners. */}
      <line {...line(s, [x0 + w, y0 + d, 0], [x0 + w, y0 + d, deck])} className="rack-brace" />
      <polygon points={deckF.left} className="rack-deck-l" />
      <polygon points={deckF.right} className="rack-deck-r" />
      <polygon points={deckF.top} className="rack-deck-t" />
    </g>
  );
}

/** The rack's front half: front posts and the orange beam, drawn after the crates. */
export function RackFront({ s, h }: { s: number; h: number }) {
  const { w, d } = BAY;
  const x1 = w / 2;
  const y0 = -d / 2;
  const post = (x: number, y: number) => boxFaces(s, x - 0.08, y - 0.08, 0, 0.16, 0.16, h);
  const beam = boxFaces(s, x1 - 0.08, y0, h - 0.26, 0.16, d, 0.24);
  return (
    <g className="rack">
      {[post(x1, y0), post(x1, y0 + d)].map((f, i) => (
        <g key={i}>
          <polygon points={f.left} className="rack-post-l" />
          <polygon points={f.right} className="rack-post-r" />
          <polygon points={f.top} className="rack-post-r" />
        </g>
      ))}
      <polygon points={beam.left} className="rack-beam-l" />
      <polygon points={beam.right} className="rack-beam-r" />
      <polygon points={beam.top} className="rack-beam-t" />
    </g>
  );
}

/**
 * One layer of an image as a wooden crate lying on the ones below it. The image's own top
 * layer is painted; the others are bare wood. Drawn around the bay's origin at height `z`.
 */
export function Crate({ s, z, top, a = 1.0, h = CRATE_H, className = "" }: { s: number; z: number; top: boolean; a?: number; h?: number; className?: string }) {
  const f = boxFaces(s, -a, -a, z, 2 * a, 2 * a, h - 0.04);
  const plank = (k: number) => line(s, [-a, a, z + h * k], [a, a, z + h * k]);
  const plankR = (k: number) => line(s, [a, -a, z + h * k], [a, a, z + h * k]);
  return (
    <g className={`crate ${top ? "is-top" : ""} ${className}`}>
      <polygon points={f.left} className="crate-l" />
      <polygon points={f.right} className="crate-r" />
      <polygon points={f.top} className="crate-t" />
      <line {...plank(0.5)} className="crate-plank" />
      <line {...plankR(0.5)} className="crate-plank" />
    </g>
  );
}

/* ------------------------------------------------------------ floor paint */

/** Text painted flat on the quay, running along +x. `x, y` is where the baseline starts, on screen. */
export function FloorText({ x, y, size, children, className }: { x: number; y: number; size: number; children: string; className?: string }) {
  const k = 1 / Math.sqrt(5);
  return (
    <text transform={`matrix(${2 * k} ${k} ${-2 * k} ${k} ${x} ${y})`} className={className} style={{ fontSize: size }}>
      {children}
    </text>
  );
}
