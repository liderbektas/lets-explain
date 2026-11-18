/**
 * 2:1 isometric projection used by every scene.
 * +x runs down-right, +y runs down-left, +z goes up. `s` is half a tile's width in px.
 * Things further "forward" (larger x + y) must be drawn later.
 */
export type Vec3 = [number, number, number];

export interface Frame {
  ox: number;
  oy: number;
  s: number;
}

export function project(f: Frame, x: number, y: number, z = 0): [number, number] {
  return [f.ox + (x - y) * f.s, f.oy + ((x + y) * f.s) / 2 - z * f.s];
}

/** Projection relative to a local origin, for shapes that are moved with a transform. */
export function rel(s: number, x: number, y: number, z = 0): [number, number] {
  return [(x - y) * s, ((x + y) * s) / 2 - z * s];
}

export function pts(points: [number, number][]): string {
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

const round = (n: number) => Math.round(n * 10) / 10;

/** The three visible faces of a box whose back-bottom corner is at (x, y, z). */
export function boxFaces(s: number, x: number, y: number, z: number, w: number, d: number, h: number) {
  const p = (a: number, b: number, c: number) => rel(s, a, b, c);
  return {
    top: pts([p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)]),
    /** Faces +y: the lower-left side. */
    left: pts([p(x, y + d, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x, y + d, z + h)]),
    /** Faces +x: the lower-right side. */
    right: pts([p(x + w, y, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x + w, y, z + h)]),
  };
}
