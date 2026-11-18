import type { ReactNode } from "react";
import { pts, rel } from "@lets-explain/core/iso/geometry";
import { Belt, IsoBox, Parcel, type Shades } from "@lets-explain/core/iso/shapes";

/**
 * One small floating island per technology, in the same isometric sticker style as the
 * lessons. Each island is drawn around (0, 0), the centre of its top face.
 */

export type IslandId = "kafka" | "rabbitmq" | "kubernetes" | "git" | "transactions" | "docker";

/** The pastel each technology wears on the hub, in island tops and card headers. */
export const ISLAND_TINT: Record<IslandId, { top: string; soft: string }> = {
  kafka: { top: "var(--sun)", soft: "var(--sun-soft)" },
  rabbitmq: { top: "var(--coral)", soft: "var(--coral-soft)" },
  kubernetes: { top: "var(--sky)", soft: "var(--sky-soft)" },
  git: { top: "var(--lilac)", soft: "var(--lilac-soft)" },
  transactions: { top: "var(--mint)", soft: "var(--mint-soft)" },
  docker: { top: "var(--sky-deep)", soft: "#dcebff" },
};

const GROUND: Shades = ["#fffdf8", "#efe5d2", "#ddd0b8"];
const SKY: Shades = ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"];
const LILAC: Shades = ["var(--lilac)", "#a993ee", "var(--lilac-deep)"];
const SUN: Shades = ["var(--sun)", "#f2bd3a", "#d9a826"];
const PEACH: Shades = ["var(--peach)", "var(--peach-mid)", "var(--peach-deep)"];
const CORAL: Shades = ["var(--coral)", "#f08770", "var(--coral-deep)"];

/** The slab every island stands on, plus a soft shadow far below so it seems to float. */
function Slab({ s, w = 3.4, d = 3.4, tint }: { s: number; w?: number; d?: number; tint: string }) {
  const shadow = rel(s, 0, 0, -1.25);
  return (
    <g>
      <ellipse cx={shadow[0]} cy={shadow[1]} rx={s * w * 0.62} ry={s * d * 0.2} className="island-shadow" />
      <IsoBox s={s} at={[-w / 2, -d / 2, -0.55]} size={[w, d, 0.55]} shades={[tint, GROUND[1], GROUND[2]]} />
      {/* A lighter inset so the top reads as ground, with the tint as a rim. */}
      <IsoBox s={s} at={[-w / 2 + 0.18, -d / 2 + 0.18, 0]} size={[w - 0.36, d - 0.36, 0.001]} shades={GROUND} />
    </g>
  );
}

function at(s: number, x: number, y: number, z = 0, child: ReactNode) {
  const [px, py] = rel(s, x, y, z);
  return <g transform={`translate(${px} ${py})`}>{child}</g>;
}

/* ------------------------------------------------------------------ Kafka */

function KafkaTop({ s }: { s: number }) {
  return (
    <g>
      <Belt s={s} from={-1.35} to={1.35} slot={0.9} />
      {[0, 1, 2].map((i) => at(s, -0.9 + i * 0.9, 0, 0, <Parcel key={i} s={s} label={i} size={0.62} />))}
    </g>
  );
}

/* --------------------------------------------------------------- RabbitMQ */

function RabbitTop({ s }: { s: number }) {
  const from = rel(s, -0.6, 0, 0.45);
  const lanes = [-0.95, 0, 0.95];
  return (
    <g>
      {lanes.map((y) => {
        const to = rel(s, 0.45, y, 0.12);
        return <path key={y} d={`M${from[0]} ${from[1]} L${to[0]} ${to[1]}`} className="island-wire" />;
      })}
      {lanes.map((y, i) => (
        <g key={y}>
          <IsoBox s={s} at={[0.35, y - 0.3, 0]} size={[1.1, 0.6, 0.12]} shades={GROUND} />
          {at(s, 0.75, y, 0.12, <Parcel s={s} size={0.42} kind={i === 1 ? "cancel" : "order"} />)}
          {i !== 2 && at(s, 1.2, y, 0.12, <Parcel s={s} size={0.42} kind="order" />)}
        </g>
      ))}
      <IsoBox s={s} at={[-1.35, -0.45, 0]} size={[0.9, 0.9, 0.85]} shades={PEACH} />
      {at(s, -0.9, 0, 0.85, <IsoBox s={s} at={[-0.25, -0.25, 0]} size={[0.5, 0.5, 0.18]} shades={CORAL} />)}
    </g>
  );
}

/* ------------------------------------------------------------- Kubernetes */

function KubeTop({ s }: { s: number }) {
  const pods: [number, number, boolean][] = [
    [-0.9, -0.7, true],
    [0.1, -0.7, true],
    [-0.9, 0.35, true],
    [0.1, 0.35, false],
  ];
  const ghost = pts([rel(s, 0.1, 0.35, 0), rel(s, 0.75, 0.35, 0), rel(s, 0.75, 1.0, 0), rel(s, 0.1, 1.0, 0)]);
  return (
    <g>
      {pods.map(([x, y, up]) =>
        up ? (
          <IsoBox key={`${x}${y}`} s={s} at={[x, y, 0]} size={[0.65, 0.65, 0.6]} shades={SKY} />
        ) : (
          <polygon key="ghost" points={ghost} className="island-ghost" />
        ),
      )}
      {/* The control plane watching over its pods. */}
      <IsoBox s={s} at={[0.95, -1.2, 0]} size={[0.55, 0.55, 1.15]} shades={LILAC} />
      {at(
        s,
        1.22,
        -0.92,
        1.15,
        <g>
          <line x1={0} y1={0} x2={0} y2={-s * 0.55} className="island-pole" />
          <path d={`M0 ${-s * 0.55}h${s * 0.42}l-${s * 0.1} ${s * 0.12} ${s * 0.1} ${s * 0.12}H0z`} className="ink" style={{ fill: "var(--sun)" }} />
        </g>,
      )}
    </g>
  );
}

/* --------------------------------------------------------------------- Git */

function GitTop({ s }: { s: number }) {
  const main = [-1.2, -0.4, 0.4, 1.2].map((x) => rel(s, x, 0.55, 0.02));
  const side = [-0.4, 0.4].map((x) => rel(s, x, -0.6, 0.02));
  const line = (a: [number, number], b: [number, number], k: string) => (
    <path key={k} d={`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`} className="island-branch" />
  );
  return (
    <g>
      {line(main[0]!, main[3]!, "main")}
      {line(main[0]!, side[0]!, "out")}
      {line(side[0]!, side[1]!, "side")}
      {line(side[1]!, main[3]!, "in")}
      {main.map(([x, y], i) => (
        <g key={`m${i}`} transform={`translate(${x} ${y})`}>
          <IsoBox s={s} at={[-0.2, -0.2, 0]} size={[0.4, 0.4, 0.32]} shades={SUN} />
        </g>
      ))}
      {side.map(([x, y], i) => (
        <g key={`s${i}`} transform={`translate(${x} ${y})`}>
          <IsoBox s={s} at={[-0.2, -0.2, 0]} size={[0.4, 0.4, 0.32]} shades={LILAC} />
        </g>
      ))}
    </g>
  );
}

/* ------------------------------------------------------- DB transactions */

function DbTop({ s }: { s: number }) {
  const [cx, cy] = rel(s, -0.2, -0.1, 0);
  const rx = s * 0.95;
  const ry = s * 0.48;
  const h = s * 1.1;
  const lock = rel(s, 0.95, 0.8, 0.3);
  return (
    <g>
      <g className="island-db">
        <path d={`M${cx - rx} ${cy} v${-h} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v${h} a${rx} ${ry} 0 0 1 ${-rx * 2} 0z`} className="db-body" />
        <path d={`M${cx - rx} ${cy - h * 0.5} a${rx} ${ry} 0 0 0 ${rx * 2} 0`} className="db-band" />
        <ellipse cx={cx} cy={cy - h} rx={rx} ry={ry} className="db-top" />
      </g>
      {at(s, 0.95, 0.8, 0, <Parcel s={s} size={0.5} kind="payment" />)}
      {at(s, 1.0, -0.5, 0, <Parcel s={s} size={0.5} kind="cancel" />)}
      <g transform={`translate(${lock[0] + s * 0.9} ${lock[1] - s * 0.9})`}>
        <path d="M-5 -2v-4a5 5 0 0 1 10 0v4" className="lock-shackle" />
        <rect x={-8} y={-2} width={16} height={12} rx={3} className="ink" style={{ fill: "var(--sun)" }} />
      </g>
    </g>
  );
}

/* ------------------------------------------------------------- Docker */

function DockerTop({ s }: { s: number }) {
  // Shipping containers: two on the ground, one stacked on top.
  return (
    <g className="island-ctr">
      <IsoBox s={s} at={[-1.35, -1.2, 0]} size={[1.25, 2.3, 0.75]} shades={CORAL} />
      <IsoBox s={s} at={[0.1, -1.2, 0]} size={[1.25, 2.3, 0.75]} shades={SKY} />
      <IsoBox s={s} at={[-0.62, -1.2, 0.75]} size={[1.25, 2.3, 0.75]} shades={SUN} />
    </g>
  );
}

const TOPS: Record<IslandId, (p: { s: number }) => ReactNode> = {
  kafka: KafkaTop,
  rabbitmq: RabbitTop,
  kubernetes: KubeTop,
  git: GitTop,
  transactions: DbTop,
  docker: DockerTop,
};

/** A whole island: slab plus its landmark. */
export function Island({ id, s = 22 }: { id: IslandId; s?: number }) {
  const Top = TOPS[id];
  return (
    <g className="island">
      <Slab s={s} tint={ISLAND_TINT[id].top} />
      <Top s={s} />
    </g>
  );
}

/** One island framed for a course card header. */
export function IslandCard({ id }: { id: IslandId }) {
  return (
    <svg className="island-svg" viewBox="-96 -84 192 132" aria-hidden="true">
      <g className="float">
        <Island id={id} s={24} />
      </g>
    </svg>
  );
}

/** The hub's hero: every technology as an island, Kafka in front. */
export function IslandsHero({ labels, live }: { labels: Record<IslandId, string>; live: IslandId[] }) {
  const spots: [IslandId, number, number, number][] = [
    ["git", 120, 120, 0.9],
    ["kubernetes", 330, 95, 0.95],
    ["rabbitmq", 95, 300, 0.95],
    ["transactions", 345, 280, 0.9],
    ["docker", 222, 352, 0.85],
    ["kafka", 222, 205, 1.25],
  ];
  return (
    <svg className="islands-hero" viewBox="10 20 430 410" aria-hidden="true">
      {spots.map(([id, x, y, k], i) => (
        <g key={id} transform={`translate(${x} ${y}) scale(${k})`}>
          <g className="float" style={{ animationDelay: `${i * -1.3}s` }}>
            <Island id={id} s={22} />
            <g transform="translate(0 58)">
              <IslandTag text={labels[id]} live={live.includes(id)} />
            </g>
          </g>
        </g>
      ))}
    </svg>
  );
}

function IslandTag({ text, live }: { text: string; live: boolean }) {
  const w = Math.round(text.length * 7.6 + 24);
  return (
    <g>
      <rect x={-w / 2} y={-8} width={w} height={23} rx={11.5} className="pill-shadow" />
      <rect x={-w / 2} y={-11} width={w} height={23} rx={11.5} className="ink" style={{ fill: live ? "var(--tangerine)" : "var(--card)" }} />
      <text y={5} textAnchor="middle" className="island-tag-text">
        {text}
      </text>
    </g>
  );
}
