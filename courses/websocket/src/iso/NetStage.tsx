import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Building, IsoBox, Parcel, Person, Pill, TINTS, type Tint } from "@lets-explain/core/iso/shapes";
import { API_PORT, header, WS_PORT, type ChatMessage, type Exchange, type Net, type NetEvent } from "../engine/net";
import "./net-stage.css";

/**
 * The WebSocket course's stage: a client on the left, the chat server on the right, teammates
 * who write to it, and whatever connects the two. A short request is a parcel that goes and
 * comes back; a long poll waits at the server's door; an SSE stream is a pipe that only carries
 * things down; a WebSocket is a pipe that carries both ways.
 */

export const NET_STAGE = { width: 860, height: 520 };

const CLIENT = { x: 170, y: 300 };
const SERVER = { x: 640, y: 290 };
const S = 30;

/** Where things leave the client and reach the server, on the road and on the pipe above it. */
const ROAD = { from: [CLIENT.x + 50, CLIENT.y + 4] as const, to: [SERVER.x - 52, SERVER.y + 2] as const };
const PIPE = { from: [CLIENT.x + 50, CLIENT.y - 40] as const, to: [SERVER.x - 52, SERVER.y - 44] as const };

const TEAMMATES: Record<string, { tint: Tint; at: [number, number] }> = {
  ayse: { tint: TINTS.coral, at: [745, 112] },
  mert: { tint: TINTS.lilac, at: [812, 150] },
  zeynep: { tint: TINTS.sun, at: [690, 92] },
};

export interface StageLabels {
  client: string;
  server: string;
  waiting: string;
  board: string;
  inbox: string;
  nothingYet: string;
  sse: string;
  ws: string;
  names: Record<string, string>;
  clock: (seconds: string) => string;
}

export interface NetStageProps {
  net: Net;
  /** Events of the action that led here: what moves now. */
  last: NetEvent[];
  /** Changes on every new action, so the same kind of motion plays again. */
  beat: number;
  labels: StageLabels;
  /** Messages the client side lists; defaults to every message a client got. */
  inbox?: number[];
  /** Hide the server's pills for ports that play no part yet. */
  ports?: number[];
}

const seconds = (ms: number) => (ms % 1000 === 0 ? String(ms / 1000) : (ms / 1000).toFixed(1));
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Mover({ id, from, to, delay = 0, duration = 0.8, children }: { id: string; from: readonly [number, number]; to: readonly [number, number]; delay?: number; duration?: number; children: ReactNode }) {
  return (
    <motion.g
      key={id}
      initial={{ x: from[0], y: from[1], opacity: 0 }}
      animate={{ x: [from[0], to[0], to[0]], y: [from[1], to[1], to[1]], opacity: [0, 1, 1, 0] }}
      transition={{ duration: duration + 0.35, delay, times: [0, duration / (duration + 0.35), 1], ease: "easeInOut" }}
    >
      {children}
    </motion.g>
  );
}

/** A small envelope for a request or a frame. */
function Envelope({ tone, label }: { tone: "ask" | "msg" | "empty" | "bad" | "out"; label?: string }) {
  const fill = { ask: "var(--sky)", msg: "var(--mint)", empty: "var(--card)", bad: "var(--red-soft)", out: "var(--sky)" }[tone];
  return (
    <g className={`env is-${tone}`}>
      <rect x={-15} y={-11} width={30} height={22} rx={4} className="ink" style={{ fill }} />
      <path d="M-15 -9 L0 2 L15 -9" className="env-flap" />
      {label && (
        <text y={-17} textAnchor="middle" className="env-label">
          {label}
        </text>
      )}
    </g>
  );
}

const msgLabel = (m: ChatMessage | undefined) => (m ? `#${m.id}` : "");

export function NetStage({ net, last, beat, labels, inbox, ports }: NetStageProps) {
  const byId = (id: number) => net.messages.find((m) => m.id === id);
  const shownPorts = ports ?? [API_PORT, WS_PORT];
  const held = net.exchanges.filter((e) => e.doneAt === null && e.kind === "longpoll");
  const streams = net.exchanges.filter((e) => e.doneAt === null && e.kind === "sse");
  const sockets = net.conns.filter((c) => c.closedAt === null);
  const lastSent = last.filter((e) => e.type === "sent");
  const writers = Object.keys(TEAMMATES).filter((id) => net.messages.some((m) => m.from === id) || net.planned.some((p) => p.from === id));
  const got = inbox ?? Object.keys(net.seen).map(Number).sort((a, b) => a - b);
  const legacy = net.procs.filter((p) => p.alive && p.ports.length > 0);

  const moves: ReactNode[] = [];
  last.forEach((e, i) => {
    const key = `${beat}-${i}`;
    if (e.type === "sent" && e.kind !== "upgrade") {
      moves.push(
        <Mover key={key} id={key} from={ROAD.from} to={ROAD.to} duration={0.7}>
          <Envelope tone="ask" label={e.method === "POST" ? "POST" : e.kind === "sse" ? "GET /events" : "GET"} />
        </Mover>,
      );
    }
    if (e.type === "sent" && e.kind === "upgrade") {
      moves.push(
        <Mover key={key} id={key} from={ROAD.from} to={ROAD.to} duration={0.7}>
          <Envelope tone="ask" label="Upgrade" />
        </Mover>,
      );
    }
    if (e.type === "answered") {
      const ex = net.exchanges.find((x) => x.id === e.id);
      const sameBeat = lastSent.some((s) => s.type === "sent" && s.id === e.id);
      const tone = e.status >= 400 ? "bad" : e.empty ? "empty" : e.delivered.length ? "msg" : "empty";
      const label = e.status === 200 && ex?.kind !== "other" ? (e.delivered.length ? e.delivered.map((d) => `#${d}`).join(" ") : "[ ]") : String(e.status);
      moves.push(
        <Mover key={key} id={key} from={ROAD.to} to={ROAD.from} delay={sameBeat ? 0.75 : 0} duration={0.7}>
          <Envelope tone={tone} label={label} />
        </Mover>,
      );
    }
    if (e.type === "streamed" || (e.type === "frame" && e.dir === "in")) {
      const msgId = e.type === "streamed" ? e.msg : (() => {
        try {
          return (JSON.parse(e.text) as { id?: number }).id;
        } catch {
          return undefined;
        }
      })();
      moves.push(
        <Mover key={key} id={key} from={PIPE.to} to={PIPE.from} delay={0.35} duration={0.8}>
          <Parcel s={18} size={0.9} label={msgId ? `#${msgId}` : "…"} />
        </Mover>,
      );
    }
    if (e.type === "frame" && e.dir === "out") {
      moves.push(
        <Mover key={key} id={key} from={PIPE.from} to={PIPE.to} duration={0.7}>
          <Envelope tone="out" />
        </Mover>,
      );
    }
    if (e.type === "posted" && e.via === "teammate") {
      const who = TEAMMATES[e.from];
      if (who) {
        moves.push(
          <Mover key={key} id={key} from={[who.at[0], who.at[1] - 30]} to={[SERVER.x + 10, SERVER.y - 60]} duration={0.6}>
            <Parcel s={18} size={0.9} label={msgLabel(byId(e.msg))} />
          </Mover>,
        );
      }
    }
  });

  const pipe = (y: number, both: boolean, label: string) => {
    const [x1, y1] = PIPE.from;
    const [x2, y2] = PIPE.to;
    return (
      <g className={`pipe ${both ? "is-ws" : "is-sse"}`}>
        <line x1={x1} y1={y1 + y} x2={x2} y2={y2 + y} className="pipe-body" />
        <line x1={x1} y1={y1 + y} x2={x2} y2={y2 + y} className="pipe-shine" />
        <g transform={`translate(${(x1 + x2) / 2} ${(y1 + y2) / 2 + y - 24})`}>
          <Pill x={0} y={0} text={label} tone={both ? "ok" : "sun"} size={11} animate={false} />
        </g>
        <polygon points={`${x1 + 6},${y1 + y} ${x1 + 22},${y1 + y - 8} ${x1 + 22},${y1 + y + 8}`} className="pipe-arrow" />
        {both && <polygon points={`${x2 - 6},${y2 + y} ${x2 - 22},${y2 + y - 8} ${x2 - 22},${y2 + y + 8}`} className="pipe-arrow" />}
      </g>
    );
  };

  return (
    <g className="net-stage">
      {/* ground */}
      <ellipse cx={(CLIENT.x + SERVER.x) / 2} cy={330} rx={360} ry={70} className="net-ground" />
      <line x1={ROAD.from[0]} y1={ROAD.from[1]} x2={ROAD.to[0]} y2={ROAD.to[1]} className="net-road" />

      {/* teammates write to the server */}
      {writers.map((id) => {
        const w = TEAMMATES[id]!;
        const talking = last.some((e) => e.type === "posted" && e.from === id);
        return (
          <g key={id} transform={`translate(${w.at[0]} ${w.at[1]})`}>
            <Person tint={w.tint} state={talking ? "hop" : "idle"} scale={0.8} />
            <text y={18} textAnchor="middle" className="net-name">
              {labels.names[id] ?? id}
            </text>
          </g>
        );
      })}

      {/* servers the reader started */}
      {legacy.map((p, i) => (
        <g key={p.pid} transform={`translate(${470 - i * 90} 150)`}>
          <Building s={20} roof={TINTS.sun} />
          <Pill x={0} y={36} text={`:${p.ports[0]} ${p.file}`} size={10} animate={false} />
        </g>
      ))}

      {/* the client */}
      <g transform={`translate(${CLIENT.x} ${CLIENT.y})`}>
        <Building s={S} roof={TINTS.sky} />
      </g>
      <Pill x={CLIENT.x} y={CLIENT.y + 50} text={labels.client} animate={false} />

      {/* the server */}
      <g transform={`translate(${SERVER.x} ${SERVER.y})`}>
        <Building s={S} roof={TINTS.mint} w={1.7} h={1.25} />
      </g>
      <Pill x={SERVER.x} y={SERVER.y + 54} text={labels.server} animate={false} />
      {shownPorts.map((port, i) => (
        <Pill key={port} x={SERVER.x - 40 + i * 80} y={SERVER.y + 82} text={port === API_PORT ? ":8080 API" : ":8081 ws"} size={10} tone="plain" animate={false} />
      ))}

      {/* open streams and sockets */}
      {streams.length > 0 && pipe(0, false, labels.sse)}
      {sockets.length > 0 && pipe(streams.length > 0 ? -34 : 0, true, labels.ws)}

      {/* long polls parked at the server */}
      <AnimatePresence>
        {held.map((ex, i) => (
          <motion.g key={ex.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transform={`translate(${ROAD.to[0] - 18 - i * 34} ${ROAD.to[1] - 2})`}>
            <Envelope tone="ask" label={labels.waiting} />
            <g transform="translate(0 30)">
              <Hourglass />
            </g>
          </motion.g>
        ))}
      </AnimatePresence>

      <AnimatePresence>{moves}</AnimatePresence>

      {/* the server's messages */}
      <Board x={590} y={392} title={labels.board} rows={net.messages.slice(-4).map((m) => `#${m.id} ${labels.names[m.from] ?? m.from}: ${m.text}`)} empty={labels.nothingYet} />
      {/* what the client has */}
      <Board x={20} y={392} title={labels.inbox} rows={got.slice(-4).map((id) => {
        const m = byId(id);
        return m ? `#${m.id} ${labels.names[m.from] ?? m.from}: ${m.text}` : `#${id}`;
      })} empty={labels.nothingYet} />

      <Pill x={78} y={34} text={labels.clock(seconds(net.now))} tone="ink" animate={false} />
    </g>
  );
}

function Hourglass() {
  return (
    <g className="hourglass">
      <path d="M-6 -9 H6 L0 0 L6 9 H-6 L0 0 Z" className="ink" style={{ fill: "var(--sun)" }} />
    </g>
  );
}

function Board({ x, y, title, rows, empty }: { x: number; y: number; title: string; rows: string[]; empty: string }) {
  const w = 250;
  const h = 26 + Math.max(1, rows.length) * 19 + 8;
  return (
    <g transform={`translate(${x} ${y})`} className="net-board">
      <rect x={0} y={3} width={w} height={h} rx={12} className="pill-shadow" />
      <rect x={0} y={0} width={w} height={h} rx={12} className="board-card" />
      <text x={12} y={18} className="board-title">
        {title}
      </text>
      {rows.length === 0 ? (
        <text x={12} y={40} className="board-row is-empty">
          {empty}
        </text>
      ) : (
        rows.map((r, i) => (
          <text key={i} x={12} y={40 + i * 19} className="board-row">
            {clip(r, 34)}
          </text>
        ))
      )}
    </g>
  );
}

/* --------------------------------------------------------- handshake view */

export interface CardLine {
  text: string;
  tone?: "plain" | "hl" | "bad" | "dim";
}

/** A request or response drawn as the text it is on the wire. */
export function HttpCard({ x, y, w, title, lines, tone }: { x: number; y: number; w: number; title: string; lines: CardLine[]; tone: "ask" | "ok" | "bad" | "plain" }) {
  const h = 34 + lines.length * 18 + 10;
  const chars = Math.floor((w - 24) / 7.3);
  return (
    <g transform={`translate(${x} ${y})`} className={`http-card is-${tone}`}>
      <rect x={0} y={4} width={w} height={h} rx={14} className="pill-shadow" />
      <rect x={0} y={0} width={w} height={h} rx={14} className="http-card-bg" />
      <rect x={0} y={0} width={w} height={28} rx={14} className="http-card-head" />
      <rect x={0} y={14} width={w} height={14} className="http-card-head" />
      <text x={14} y={19} className="http-card-title">
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={i} x={12} y={48 + i * 18} className={`http-line is-${l.tone ?? "plain"}`}>
          {clip(l.text, chars)}
        </text>
      ))}
    </g>
  );
}

/** Request and response of a handshake, highlighting the lines that decide it. */
export function exchangeCards(ex: Exchange | undefined): { request: CardLine[]; response: CardLine[]; status: number | null; dropped: boolean } {
  if (!ex) return { request: [], response: [], status: null, dropped: false };
  const key = (k: string) => ["connection", "upgrade", "sec-websocket-key", "sec-websocket-version"].includes(k.toLowerCase());
  const request: CardLine[] = [
    { text: `${ex.method} ${ex.target} HTTP/1.1`, tone: "plain" },
    ...ex.headers.map(([k, v]) => ({ text: `${k}: ${v}`, tone: key(k) ? ("hl" as const) : ("dim" as const) })),
  ];
  if (ex.status === null) return { request, response: [], status: null, dropped: ex.end === "dropped" };
  const response: CardLine[] = [
    { text: `HTTP/1.1 ${ex.status} ${ex.statusText}`, tone: ex.status === 101 ? "hl" : "bad" },
    ...ex.respHeaders.map(([k, v]) => ({ text: `${k}: ${v}`, tone: k.toLowerCase() === "sec-websocket-accept" ? ("hl" as const) : ("dim" as const) })),
    ...(ex.respBody ? [{ text: "", tone: "dim" as const }, ...ex.respBody.split("\n").slice(0, 3).map((t) => ({ text: t, tone: "bad" as const }))] : []),
  ];
  return { request, response, status: ex.status, dropped: false };
}

export function HandshakeStage({
  ex,
  beat,
  labels,
  verdict,
}: {
  ex: Exchange | undefined;
  beat: number;
  labels: { request: string; response: string; client: string; server: string; waiting: string; dropped: string };
  /** What the client made of the answer, shown over it (e.g. a refused accept). */
  verdict?: { text: string; ok: boolean };
}) {
  const cards = exchangeCards(ex);
  const tone = cards.status === 101 ? "ok" : cards.status === null ? "plain" : "bad";
  return (
    <g className="net-stage">
      <ellipse cx={430} cy={445} rx={380} ry={52} className="net-ground" />
      <line x1={230} y1={440} x2={620} y2={440} className="net-road" />
      <g transform="translate(170 440)">
        <Building s={24} roof={TINTS.sky} />
      </g>
      <Pill x={170} y={486} text={labels.client} animate={false} />
      <g transform="translate(680 440)">
        <Building s={24} roof={TINTS.mint} w={1.7} h={1.25} />
      </g>
      <Pill x={680} y={486} text={labels.server} animate={false} />
      {ex && (
        <AnimatePresence mode="wait">
          <motion.g key={`req-${beat}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <HttpCard x={24} y={24} w={400} title={labels.request} lines={cards.request} tone="ask" />
          </motion.g>
        </AnimatePresence>
      )}
      {ex && (
        <AnimatePresence mode="wait">
          <motion.g key={`res-${beat}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, delay: 0.7 }}>
            {cards.dropped ? (
              <Pill x={640} y={120} text={labels.dropped} tone="danger" animate={false} />
            ) : (
              <HttpCard x={440} y={24} w={400} title={labels.response} lines={cards.response} tone={tone} />
            )}
          </motion.g>
        </AnimatePresence>
      )}
      {ex && (
        <Mover key={`env-${beat}`} id={`env-${beat}`} from={[240, 432]} to={[610, 432]} duration={0.7}>
          <Envelope tone="ask" label="GET" />
        </Mover>
      )}
      {verdict && (
        <motion.g key={`verdict-${beat}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
          <Pill x={300} y={392} text={verdict.text} tone={verdict.ok ? "ok" : "danger"} size={11} animate={false} />
        </motion.g>
      )}
      {cards.status === 101 && !(verdict && !verdict.ok) && (
        <motion.g key={`pipe-${beat}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
          <line x1={240} y1={404} x2={612} y2={404} className="pipe-body" />
          <line x1={240} y1={404} x2={612} y2={404} className="pipe-shine" />
          <Pill x={426} y={384} text="WebSocket" tone="ok" size={11} animate={false} />
        </motion.g>
      )}
    </g>
  );
}

/* ----------------------------------------------------------- accept view */

export interface AcceptRow {
  label: string;
  value: string;
  tone: "key" | "guid" | "hash" | "out" | "bad" | "ok";
  note?: string;
}

/** The accept recipe as a column of real values: key, GUID, SHA-1 bytes, base64. */
export function AcceptStage({ rows, beat, machine }: { rows: AcceptRow[]; beat: number; machine: string }) {
  return (
    <g className="net-stage accept-stage">
      <g transform="translate(96 260)">
        <IsoBox s={26} at={[-1, -1, 0]} size={[2, 2, 1.3]} shades={["var(--sun)", "#f2bd3a", "#d9a826"]} />
        <text x={0} y={-36} textAnchor="middle" className="machine-label">
          {machine}
        </text>
      </g>
      {rows.map((r, i) => (
        <motion.g key={`${beat}-${i}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.35, duration: 0.3 }}>
          <g transform={`translate(200 ${46 + i * 70})`}>
            <rect x={0} y={4} width={630} height={52} rx={14} className="pill-shadow" />
            <rect x={0} y={0} width={630} height={52} rx={14} className={`accept-row is-${r.tone}`} />
            <text x={16} y={20} className="accept-label">
              {r.label}
            </text>
            <text x={16} y={40} className="accept-value">
              {clip(r.value, 80)}
            </text>
            {r.note && (
              <text x={614} y={20} textAnchor="end" className="accept-note">
                {r.note}
              </text>
            )}
          </g>
        </motion.g>
      ))}
    </g>
  );
}

export { header };
