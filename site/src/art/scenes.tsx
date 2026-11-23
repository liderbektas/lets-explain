import type { ReactElement, ReactNode } from "react";
import { pts, rel } from "@lets-explain/core/iso/geometry";

/**
 * The live courses' card art: each technology as one object you would recognise without
 * reading the label (a container ship, a phone talking to a server, wagons on rails...).
 * Same 2:1 isometric sticker style as the lessons. Drawn around (0, 0).
 */

type V3 = [number, number, number];
type Shades = [top: string, left: string, right: string];

const INK = "var(--ink)";
const CORAL: Shades = ["#ff9f8a", "#f08770", "#e2735c"];
const SUN: Shades = ["#ffd66b", "#f2bd3a", "#d9a826"];
const SKY: Shades = ["#a9c8f7", "#8db4f0", "#5f8fdc"];
const MINT: Shades = ["#a8e6cf", "#7fd3b5", "#4fb08c"];
const LILAC: Shades = ["#bfaef5", "#a993ee", "#8f78e0"];
const PEACH: Shades = ["#ffd3a5", "#f9b67e", "#e3955a"];
const WHITE: Shades = ["#fffdf8", "#efe5d2", "#ddd0b8"];
const DARK: Shades = ["#57535f", "#45424d", "#36343d"];
const STEEL: Shades = ["#8b8694", "#6d6976", "#57535f"];
const POST: Shades = ["#c9b98f", "#b9a77c", "#a8966b"];

/** Collects SVG elements with stable keys, so a scene reads as a list of drawing steps. */
class Pen {
  readonly out: ReactElement[] = [];
  private n = 0;
  constructor(readonly s: number) {}

  P = (x: number, y: number, z = 0) => rel(this.s, x, y, z);
  private add(el: (key: number) => ReactElement) {
    this.out.push(el(this.n++));
  }

  poly(a: V3[], fill: string, thin = false, noStroke = false) {
    const p = pts(a.map(([x, y, z]) => this.P(x, y, z)));
    this.add((k) => <polygon key={k} points={p} fill={fill} strokeWidth={thin ? 1.3 : undefined} stroke={noStroke ? "none" : undefined} />);
  }

  line(a: V3, b: V3, style: { width?: number; color?: string; dash?: string } = {}) {
    const [x1, y1] = this.P(...a);
    const [x2, y2] = this.P(...b);
    this.add((k) => <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={style.width} stroke={style.color} strokeDasharray={style.dash} />);
  }

  raw(node: (key: number) => ReactElement) {
    this.add(node);
  }

  box(x: number, y: number, z: number, w: number, d: number, h: number, [t, l, r]: Shades) {
    this.poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], t);
    this.poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], l);
    this.poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], r);
  }

  /** An upright cylinder: a circle on the ground plane becomes an ellipse. */
  cyl(x: number, y: number, z: number, r: number, h: number, top: string, side: string, band?: string) {
    const [cx, cy] = this.P(x, y, z);
    const rx = r * this.s * Math.SQRT2;
    const ry = rx / 2;
    const H = h * this.s;
    this.add((k) => <path key={k} d={`M${cx - rx} ${cy} v${-H} a${rx} ${ry} 0 0 0 ${2 * rx} 0 v${H} a${rx} ${ry} 0 0 1 ${-2 * rx} 0z`} fill={side} />);
    if (band) this.add((k) => <path key={k} d={`M${cx - rx} ${cy - H * 0.55} a${rx} ${ry} 0 0 0 ${2 * rx} 0 v${H * 0.18} a${rx} ${ry} 0 0 1 ${-2 * rx} 0z`} fill={band} />);
    this.add((k) => <ellipse key={k} cx={cx} cy={cy - H} rx={rx} ry={ry} fill={top} />);
  }

  /** Text painted on a face: "left" faces +y, "top" lies flat. */
  faceText(face: "left" | "top", x: number, y: number, z: number, text: string, size: number) {
    const [px, py] = this.P(x, y, z);
    const m = face === "left" ? "1,0.5,0,1" : "1,0.5,-1,0.5";
    this.add((k) => (
      <text key={k} transform={`matrix(${m},${px},${py})`} fontSize={size} textAnchor="middle" className="scene-text">
        {text}
      </text>
    ));
  }

  /** The slab an island stands on, with a soft shadow so it seems to float. */
  slab(w: number, d: number, tint: string) {
    const [sx, sy] = this.P(0, 0, -1.2);
    this.add((k) => <ellipse key={k} cx={sx} cy={sy} rx={this.s * w * 0.62} ry={this.s * d * 0.2} className="island-shadow" stroke="none" />);
    this.box(-w / 2, -d / 2, -0.55, w, d, 0.55, [tint, WHITE[1], WHITE[2]]);
    const i = 0.18;
    this.poly([[-w / 2 + i, -d / 2 + i, 0], [w / 2 - i, -d / 2 + i, 0], [w / 2 - i, d / 2 - i, 0], [-w / 2 + i, d / 2 - i, 0]], WHITE[0]);
  }

  done(): ReactNode {
    return (
      <g stroke={INK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
        {this.out}
      </g>
    );
  }
}

/* ----------------------------------------------------------- Docker: a container ship */

/** A shipping container lying along x: corrugated side, locking bars on the doors. */
function container(p: Pen, x: number, y: number, z: number, w: number, d: number, h: number, shades: Shades) {
  p.box(x, y, z, w, d, h, shades);
  const n = Math.round(w / 0.12);
  for (let i = 1; i < n; i++) p.line([x + (i * w) / n, y + d, z + 0.05], [x + (i * w) / n, y + d, z + h - 0.05], { width: 1.3 });
  p.line([x + w, y + d / 2, z + 0.03], [x + w, y + d / 2, z + h - 0.03], { width: 1.3 });
  for (const k of [0.22, 0.38, 0.62, 0.78]) p.line([x + w, y + d * k, z + 0.08], [x + w, y + d * k, z + h - 0.08], { width: 1.3 });
}

function docker(s: number) {
  const p = new Pen(s);
  const [sx, sy] = p.P(0.1, 0.1, -0.35);
  p.raw((k) => <ellipse key={k} cx={sx} cy={sy} rx={s * 4.2} ry={s * 1.7} fill="#cfe2ff" />);
  for (const [x, y] of [[-2.9, 1.6], [2.5, -1.8], [1.5, 2.0]] as const) {
    const [wx, wy] = p.P(x, y, -0.35);
    p.raw((k) => <path key={k} d={`M${wx - 14} ${wy} q7 -6 14 0 t14 0`} fill="none" stroke="#fffdf8" strokeWidth={2.2} />);
  }
  // Hull: the near side, the bow, a red waterline, then the deck.
  const top = 0.4, bot = -0.35, Y = 0.85, X0 = -2.3, X1 = 1.3, TIP = 2.3;
  p.poly([[X0, Y, bot], [X1, Y, bot], [X1, Y, top], [X0, Y, top]], "#4b6fb5");
  p.poly([[X1, Y, bot], [TIP, 0, bot], [TIP, 0, top], [X1, Y, top]], "#3f5f9e");
  p.poly([[X0, Y, bot], [X1, Y, bot], [X1, Y, bot + 0.2], [X0, Y, bot + 0.2]], CORAL[2]);
  p.poly([[X1, Y, bot], [TIP, 0, bot], [TIP, 0, bot + 0.2], [X1, Y, bot + 0.2]], "#c9614c");
  p.poly([[X0, -Y, top], [X1, -Y, top], [TIP, 0, top], [X1, Y, top], [X0, Y, top]], "#e9e2d4");
  // Bridge with windows, and the funnel
  p.box(-2.2, -0.6, top, 0.6, 1.2, 1.05, WHITE);
  for (const x of [-2.1, -1.92, -1.74]) p.poly([[x, 0.6, top + 0.68], [x + 0.12, 0.6, top + 0.68], [x + 0.12, 0.6, top + 0.88], [x, 0.6, top + 0.88]], SKY[1], true);
  p.box(-2.08, -0.22, top + 1.05, 0.32, 0.32, 0.42, CORAL);
  p.box(-2.08, -0.22, top + 1.33, 0.32, 0.32, 0.06, DARK);
  // Containers, painted back to front
  const W = 1.05, D = 0.72, H = 0.55;
  const stacks: [number, number, number, Shades][] = [
    [-1.45, -0.75, 0, CORAL], [-1.45, -0.75, 1, SUN], [-1.45, 0, 0, SKY],
    [-0.35, -0.75, 0, MINT], [-0.35, -0.75, 1, SKY], [-0.35, 0, 0, SUN], [-0.35, 0, 1, CORAL],
    [0.75, -0.75, 0, LILAC], [0.75, 0, 0, CORAL],
  ];
  stacks.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[2] - b[2]);
  for (const [x, y, lvl, c] of stacks) container(p, x, y, top + lvl * H, W, D, H, c);
  // The sea reaches lower than a slab would; lift the ship so the card frame does not cut it.
  return <g transform="translate(0 -10)">{p.done()}</g>;
}

/* -------------------------------------- WebSocket: a phone and a server, one line kept open */

function websocket(s: number) {
  const p = new Pen(s);
  p.slab(3.8, 3.2, "#ffd3a5");
  // Server rack, back right
  p.box(0.35, -1.45, 0, 1.0, 1.0, 2.1, DARK);
  for (let i = 0; i < 6; i++) {
    const z = 0.22 + i * 0.3;
    p.poly([[0.47, -0.45, z], [1.23, -0.45, z], [1.23, -0.45, z + 0.18], [0.47, -0.45, z + 0.18]], STEEL[1], true);
    const [lx, ly] = p.P(1.12, -0.45, z + 0.09);
    p.raw((k) => <circle key={k} cx={lx} cy={ly} r={2.4} fill={i === 2 ? SUN[0] : MINT[0]} strokeWidth={1.3} />);
  }
  // The open connection: one pipe, messages travelling both ways
  const [ax, ay] = p.P(-0.75, 0.62, 1.3);
  const [bx, by] = p.P(0.35, -0.9, 1.3);
  p.raw((k) => <line key={k} x1={ax} y1={ay} x2={bx} y2={by} strokeWidth={15} />);
  p.raw((k) => <line key={k} x1={ax} y1={ay} x2={bx} y2={by} stroke="#fff0e2" strokeWidth={11} />);
  p.raw((k) => <line key={k} x1={ax} y1={ay - 0.5} x2={bx} y2={by - 0.5} strokeWidth={1.2} strokeDasharray="3 5" />);
  const bubble = (t: number, fill: string, dir: 1 | -1) => {
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    p.raw((k) => <rect key={k} x={x - 9} y={y - 15} width={18} height={13} rx={5} fill={fill} />);
    p.raw((k) => <path key={k} d={`M${x - 3} ${y - 2} l-2 5 6 -5`} fill={fill} />);
    p.raw((k) => <path key={k} d={dir > 0 ? `M${x + 9} ${y - 3} l6 -2 -2 6` : `M${x - 9} ${y + 3} l-6 2 2 -6`} fill="none" />);
  };
  bubble(0.3, MINT[0], 1);
  bubble(0.68, SUN[0], -1);
  for (const [x, y] of [[ax, ay], [bx, by]] as const) p.raw((k) => <circle key={k} cx={x} cy={y} r={6} fill="#ff9466" />);
  // Phone, front left, screen toward us
  const px = -1.6, py = 0.5, pw = 1.0, pd = 0.16, ph = 1.85;
  p.box(px, py, 0, pw, pd, ph, DARK);
  p.poly([[px + 0.08, py + pd, 0.16], [px + pw - 0.08, py + pd, 0.16], [px + pw - 0.08, py + pd, ph - 0.18], [px + 0.08, py + pd, ph - 0.18]], "#e5efff");
  const [cx, cy] = p.P(px + pw / 2, py + pd, ph - 0.09);
  p.raw((k) => <circle key={k} cx={cx} cy={cy} r={2} fill={SKY[0]} stroke="none" />);
  p.line([px + 0.35, py + pd, 0.08], [px + 0.65, py + pd, 0.08], { color: STEEL[0] });
  const chat: [number, number, number, string][] = [[0.13, 0.55, 1.4, WHITE[0]], [0.4, 0.86, 1.1, MINT[0]], [0.13, 0.62, 0.8, WHITE[0]], [0.38, 0.86, 0.45, SUN[0]]];
  for (const [x0, x1, z, c] of chat) p.poly([[px + x0, py + pd, z], [px + x1, py + pd, z], [px + x1, py + pd, z + 0.2], [px + x0, py + pd, z + 0.2]], c, true);
  return p.done();
}

/* ------------------------------------ Kafka: partitions are tracks, offsets numbered wagons */

function kafka(s: number) {
  const p = new Pen(s);
  p.slab(4.0, 4.0, "#ffd66b");
  const wagon = (x: number, y: number, n: number, shades: Shades) => {
    p.box(x, y - 0.24, 0.08, 0.6, 0.48, 0.32, shades);
    for (const k of [0.13, 0.47]) {
      const [a, b] = p.P(x + k, y + 0.24, 0.06);
      p.raw((key) => <circle key={key} cx={a} cy={b} r={3} fill={STEEL[2]} strokeWidth={1.3} />);
    }
    p.faceText("top", x + 0.36, y + 0.06, 0.4, String(n), 15);
  };
  const tracks: [number, number][] = [[-1.3, 4], [0, 3], [1.3, 2]];
  for (const [y, n] of tracks) {
    for (let x = -1.8; x <= 1.81; x += 0.2) p.line([x, y - 0.25, 0.01], [x, y + 0.25, 0.01], { width: 2.6, color: "#d8c9a6" });
    p.line([-1.85, y - 0.15, 0.02], [1.85, y - 0.15, 0.02], { width: 1.6 });
    p.line([-1.85, y + 0.15, 0.02], [1.85, y + 0.15, 0.02], { width: 1.6 });
    for (let i = 0; i < n; i++) wagon(-1.75 + i * 0.75, y, i, y === 0 && i === 1 ? MINT : SUN);
    if (y === 1.3) {
      // The next record rolling onto the end of the log
      const x = -1.75 + n * 0.75 + 0.3;
      wagon(x, y, n, ["#fffdf8", "#ffe7a8", "#ffd66b"]);
      for (const dz of [0.2, 0.34]) p.line([x + 0.75, y, dz], [x + 1.1, y, dz], { width: 1.3 });
    }
  }
  // The consumer's bookmark: the next offset it reads on the middle partition
  const [fx, fy] = p.P(-1.75 + 0.75 + 0.3, -0.24, 0.4);
  p.raw((k) => <line key={k} x1={fx} y1={fy} x2={fx} y2={fy - 30} />);
  p.raw((k) => <path key={k} d={`M${fx} ${fy - 30} h24 l-5 6.5 5 6.5 h-24z`} fill="#ff9466" />);
  return p.done();
}

/* --------------------------------- Git: a metro map; lines split and merge, stations are commits */

function git(s: number) {
  const p = new Pen(s);
  p.slab(4.0, 3.4, "#bfaef5");
  const Z = 0.02, MY = 0.5, FY = -0.85;
  const route = (list: V3[], color: string) => {
    const d = "M" + list.map(([x, y, z]) => p.P(x, y, z).join(" ")).join(" L");
    p.raw((k) => <path key={k} d={d} fill="none" strokeWidth={14} />);
    p.raw((k) => <path key={k} d={d} fill="none" stroke={color} strokeWidth={10} />);
  };
  route([[-1.4, MY, Z], [-0.9, FY, Z], [0, FY, Z], [0.5, MY, Z]], LILAC[2]);
  route([[-1.75, MY, Z], [1.75, MY, Z]], SUN[0]);
  const station = (x: number, y: number, top: string, r = 0.26, h = 0.24) => p.cyl(x, y, Z, r, h, top, WHITE[0]);
  station(-0.9, FY, LILAC[0]);
  station(0, FY, LILAC[0]);
  station(-1.65, MY, SUN[0]);
  station(-1.15, MY, SUN[0]);
  station(-0.35, MY, SUN[0]);
  station(0.5, MY, MINT[0], 0.34, 0.28); // the merge commit
  station(1.1, MY, SUN[0]);
  station(1.6, MY, SUN[0]);
  // HEAD: a sign on the newest station, leaning into the empty corner
  const [hx, hy] = p.P(1.6, MY, 0.28);
  p.raw((k) => <line key={k} x1={hx} y1={hy} x2={hx} y2={hy - 22} />);
  p.raw((k) => <rect key={k} x={hx - 4} y={hy - 39} width={46} height={19} rx={6} fill="#ff9466" />);
  p.raw((k) => (
    <text key={k} x={hx + 19} y={hy - 25.5} fontSize={10} textAnchor="middle" className="scene-text">
      HEAD
    </text>
  ));
  return p.done();
}

/* --------------------------------- RabbitMQ: a sorting machine feeding three mailboxes */

/** A curbside mailbox along x on a post: box body, half-cylinder roof, door on the +x end, a flag. */
function mailbox(p: Pen, x: number, y: number, shades: Shades, flagUp: boolean) {
  const len = 0.95, d = 0.56, z0 = 0.4, h = 0.24, r = d / 2;
  p.box(x + len / 2 - 0.06, y + r - 0.06, 0, 0.12, 0.12, z0, POST);
  p.box(x, y, z0, len, d, h, shades);
  const yc = y + r, zc = z0 + h, N = 14;
  const at = (t: number): [number, number] => [yc + r * Math.cos(t), zc + r * Math.sin(t)];
  for (let i = N; i > 0; i--) {
    const [ya, za] = at((Math.PI * i) / N);
    const [yb, zb] = at((Math.PI * (i - 1)) / N);
    p.poly([[x, ya, za], [x + len, ya, za], [x + len, yb, zb], [x, yb, zb]], shades[0], false, true);
  }
  const arc = (xx: number) => Array.from({ length: N + 1 }, (_, i) => p.P(xx, ...at((Math.PI * i) / N)));
  const near = arc(x + len);
  const far = arc(x);
  const topmost = (a: [number, number][]) => a.reduce((m, q, i) => (q[1] < a[m]![1] ? i : m), 0);
  const [f1, f2] = far[topmost(far)]!;
  const [n1, n2] = near[topmost(near)]!;
  p.raw((k) => <line key={k} x1={f1} y1={f2} x2={n1} y2={n2} />);
  p.line([x, y + d, zc], [x + len, y + d, zc]);
  const door = [p.P(x + len, y + d, z0), ...near, p.P(x + len, y, z0)];
  p.raw((k) => <path key={k} d={`M${door.map((q) => q.join(" ")).join(" L")}Z`} fill={shades[2]} />);
  const [hx, hy] = p.P(x + len, y + r, z0 + h * 0.6);
  p.raw((k) => <circle key={k} cx={hx} cy={hy} r={2.4} fill={WHITE[0]} strokeWidth={1.3} />);
  const [fx, fy] = p.P(x + len * 0.3, y + d, z0 + 0.1);
  p.raw((k) => <path key={k} d={flagUp ? `M${fx} ${fy} v-26 h11 v8 h-7 v18z` : `M${fx} ${fy} h22 v5 h-22z`} fill="#f2615a" />);
}

function rabbitmq(s: number) {
  const p = new Pen(s);
  p.slab(4.0, 3.9, "#ff9f8a");
  const ex: V3 = [-0.55, -0.35, 0.02];
  const queues: [number, number][] = [[1.15, -1.25], [1.15, 0], [1.15, 1.25]];
  for (const [x, y] of queues) p.line(ex, [x - 0.3, y, 0.02], { width: 1.5, dash: "5 5" });
  // The exchange: a sorting machine with a hopper on top and a slot per route
  p.box(-1.7, -1.05, 0, 1.1, 1.35, 1.05, PEACH);
  p.poly([[-1.55, -0.9, 1.05], [-0.75, -0.9, 1.05], [-0.62, -1.02, 1.45], [-1.68, -1.02, 1.45]], PEACH[1]);
  p.poly([[-0.75, -0.9, 1.05], [-0.75, 0.15, 1.05], [-0.62, 0.27, 1.45], [-0.62, -1.02, 1.45]], PEACH[2]);
  p.poly([[-1.55, 0.15, 1.05], [-0.75, 0.15, 1.05], [-0.62, 0.27, 1.45], [-1.68, 0.27, 1.45]], PEACH[0]);
  for (let i = 0; i < 3; i++) p.poly([[-0.6, -0.85 + i * 0.4, 0.35], [-0.6, -0.65 + i * 0.4, 0.35], [-0.6, -0.65 + i * 0.4, 0.62], [-0.6, -0.85 + i * 0.4, 0.62]], DARK[1], true);
  // A letter dropping into the hopper
  const [ix, iy] = p.P(-1.15, -0.4, 2.2);
  p.raw((k) => <rect key={k} x={ix - 11} y={iy - 7.7} width={22} height={15.4} rx={2} fill={WHITE[0]} />);
  p.raw((k) => <path key={k} d={`M${ix - 11} ${iy - 7.7} l11 8.2 11 -8.2`} fill="none" strokeWidth={1.3} />);
  // Mailboxes: the queues
  [SKY, CORAL, MINT].forEach((c, i) => {
    const [x, y] = queues[i]!;
    mailbox(p, x - 0.5, y - 0.28, c, i === 1);
  });
  return p.done();
}

/* ------------------------------------ CI/CD: a line of checks that ends at a launch pad */

function cicd(s: number) {
  const p = new Pen(s);
  p.slab(4.2, 3.2, "#ff9466");
  p.box(-1.85, 0.25, 0, 2.5, 0.6, 0.18, STEEL);
  for (let x = -1.7; x < 0.6; x += 0.3) p.line([x, 0.25, 0.18], [x, 0.85, 0.18], { width: 1.3, color: DARK[1] });
  const gate = (x: number, passed: boolean) => {
    p.box(x - 0.06, 0.1, 0, 0.12, 0.12, 1.0, WHITE);
    p.box(x - 0.06, 0.88, 0, 0.12, 0.12, 1.0, WHITE);
    p.box(x - 0.08, 0.08, 1.0, 0.16, 0.94, 0.14, DARK);
    const [lx, ly] = p.P(x, 0.55, 1.24);
    p.raw((k) => <circle key={k} cx={lx} cy={ly} r={7} fill={passed ? MINT[2] : SUN[0]} />);
    p.raw((k) =>
      passed ? (
        <path key={k} d={`M${lx - 3.5} ${ly} l2.5 2.5 4.5 -5`} fill="none" stroke="#fffdf8" />
      ) : (
        <circle key={k} cx={lx} cy={ly} r={1.6} fill={INK} stroke="none" />
      ),
    );
  };
  gate(-1.25, true);
  p.box(-0.85, 0.35, 0.18, 0.4, 0.4, 0.36, SUN); // a build on its way
  p.faceText("left", -0.65, 0.75, 0.26, "v2", 9);
  gate(-0.15, false);
  // Launch pad and rocket: the deploy
  p.box(0.75, -1.3, 0, 1.0, 1.0, 0.22, DARK);
  const rx = 1.25, ry = -0.8, base = 0.22, h = 1.35;
  const [cx, cy] = p.P(rx, ry, base);
  const R = 0.28 * s * Math.SQRT2;
  p.raw((k) => <path key={k} d={`M${cx - R} ${cy - 10} l-11 14 l2 -24z`} fill={CORAL[2]} />);
  p.raw((k) => <path key={k} d={`M${cx + R} ${cy - 10} l11 14 l-2 -24z`} fill={CORAL[2]} />);
  p.cyl(rx, ry, base, 0.28, h, WHITE[0], WHITE[0], CORAL[0]);
  const topY = cy - h * s;
  p.raw((k) => (
    <path key={k} d={`M${cx - R} ${topY} Q${cx - R * 0.6} ${topY - 26} ${cx} ${topY - 34} Q${cx + R * 0.6} ${topY - 26} ${cx + R} ${topY} a${R} ${R / 2} 0 0 1 ${-2 * R} 0z`} fill={CORAL[0]} />
  ));
  p.raw((k) => <circle key={k} cx={cx} cy={topY + 9} r={5.5} fill={SKY[0]} />);
  for (const [dx, dy, r] of [[-20, 4, 7], [-8, 8, 8], [8, 8, 8], [20, 4, 6]] as const) p.raw((k) => <circle key={k} cx={cx + dx} cy={cy + dy} r={r} fill="#fffdf8" strokeWidth={1.3} />);
  return p.done();
}

/** Card art for each live course, keyed by island id. */
export const SCENES = { docker, websocket, kafka, git, rabbitmq, cicd } satisfies Record<string, (s: number) => ReactNode>;
