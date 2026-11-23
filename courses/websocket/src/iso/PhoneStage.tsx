import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Person, Pill, TINTS, type Tint } from "@lets-explain/core/iso/shapes";
import { header, type ExchangeEnd, type Net, type NetEvent } from "../engine/net";
import {
  Board,
  Box,
  type Cable,
  clip,
  CutCable,
  DARK,
  ease,
  Hourglass,
  isoAt,
  Letter,
  onFront,
  onSide,
  onTop,
  OpenCable,
  PathMover,
  type Pt,
  sample,
  seconds,
  Bubble,
  WifiIcon,
} from "./kit";

/**
 * A closer look at one client and the chat server, drawn as the things they are: a phone (or,
 * in the terminal, a laptop) whose screen lists what it has received, and a server rack whose
 * ports take the connections. A one-off HTTP request is an envelope on a dashed lane that goes
 * and comes back; an SSE stream is a cable that stays plugged in and only carries messages to
 * the client; a WebSocket is a cable with two lanes, one each way. When a connection ends the
 * cable visibly comes apart, and the next state has no cable at all.
 *
 * Polling is the same lane used again and again; a long poll is an envelope parked at the rack
 * with an hourglass until the server answers it.
 */

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

/* ------------------------------------------------------------------ layout */

const PHONE = { p: isoAt(62, 380), w: 165, d: 14, h: 315 };
const LAPTOP = { p: isoAt(130, 300), w: 200, base: 108, h: 160 };
const RACK = { p: isoAt(685, 361), w: 110, d: 100, h: 260 };

/** Where each line meets the client's side and the rack's front. */
interface Ends {
  ws: Pt;
  sse: Pt;
  lane: Pt;
}
const phoneSide = (z: number): Pt => {
  const [x, y] = PHONE.p(PHONE.w, PHONE.d / 2, z);
  return [x + 4, y];
};
const laptopSide = (z: number): Pt => {
  const [x, y] = LAPTOP.p(LAPTOP.w, 4, z);
  return [x + 4, y];
};
const CLIENT_ENDS: Record<"phone" | "laptop", Ends> = {
  phone: { ws: phoneSide(286), sse: phoneSide(216), lane: phoneSide(136) },
  laptop: { ws: laptopSide(150), sse: laptopSide(115), lane: laptopSide(50) },
};
/** Rack units: 1U for the WebSocket server on :8081, a 4U API server on :8080 (stream port and request jack). */
const UNIT = { wsZ: [226, 254], apiZ: [76, 186], sseZ: 170, laneZ: 90, jackX: 16 } as const;
const rackFront = (z: number): Pt => {
  const [x, y] = RACK.p(UNIT.jackX, RACK.d, z);
  return [x - 6, y];
};
const SERVER_ENDS: Ends = { ws: rackFront((UNIT.wsZ[0] + UNIT.wsZ[1]) / 2), sse: rackFront(UNIT.sseZ), lane: rackFront(UNIT.laneZ) };
const RACK_TOP = RACK.p(RACK.w / 2, RACK.d / 2, RACK.h);

const TEAMMATES: Record<string, { tint: Tint; at: Pt }> = {
  zeynep: { tint: TINTS.sun, at: [628, 84] },
  ayse: { tint: TINTS.coral, at: [712, 66] },
  mert: { tint: TINTS.lilac, at: [796, 92] },
};
const tintOf = (who: string | undefined): Tint => (who && TEAMMATES[who]?.tint) || TINTS.sky;

/* ----------------------------------------------------------------- props */

export interface PhoneStageLabels extends StageLabels {
  offline: string;
  /** Why a stream ended, by how it ended. */
  ended: (end: ExchangeEnd) => string;
  wsClosed: (code: number) => string;
  /** Under an answer that brought no message. */
  nothingNew: string;
}

export interface PhoneStageProps {
  net: Net;
  last: NetEvent[];
  beat: number;
  labels: PhoneStageLabels;
  /** A phone with a browser, or a laptop with a terminal (the try-it step). */
  device: "phone" | "laptop";
}

const parse = (text: string): { id?: number; text?: string; from?: string } => {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" ? (v as { id?: number; text?: string; from?: string }) : {};
  } catch {
    return {};
  }
};

export function PhoneStage({ net, last, beat, labels, device }: PhoneStageProps) {
  const byId = (id: number) => net.messages.find((m) => m.id === id);
  const ends = CLIENT_ENDS[device];
  const cable = (kind: "sse" | "ws"): Cable => ({ a: ends[kind], b: SERVER_ENDS[kind], sag: device === "phone" ? 16 : 12 });
  const laneFrom = ends.lane;
  const laneTo = SERVER_ENDS.lane;

  const held = net.exchanges.filter((e) => e.doneAt === null && e.kind === "longpoll");
  const streams = net.exchanges.filter((e) => e.doneAt === null && e.kind === "sse");
  const sockets = net.conns.filter((c) => c.closedAt === null);
  const writers = Object.keys(TEAMMATES).filter((id) => net.messages.some((m) => m.from === id) || net.planned.some((p) => p.from === id));
  const got = Object.keys(net.seen).map(Number).sort((a, b) => a - b);
  const legacy = net.procs.filter((p) => p.alive && p.ports.length > 0);
  const offline = net.down.length > 0;

  /* --- timing within this action: requests go first, then what they set off --- */
  const sentIds = new Set(last.flatMap((e) => (e.type === "sent" ? [e.id] : [])));
  const upgraded = last.some((e) => e.type === "wsOpened");
  const teammateWrote = last.some((e) => e.type === "posted" && e.via === "teammate");
  const outFrames = last.some((e) => e.type === "frame" && e.dir === "out");
  const arrive: Record<number, number> = {};

  const moves: ReactNode[] = [];
  let downIdx = 0;
  /* Seconds. Everything one action sets off has to land within the ~1.7 s an action stays on screen. */
  const T = { trip: 0.55, grow: 0.4, frame: 0.7, post: 0.5 };
  last.forEach((e, i) => {
    const key = `${beat}-${i}`;
    if (e.type === "sent") {
      const ex = net.exchanges.find((x) => x.id === e.id);
      const resume = ex ? header(ex.headers, "Last-Event-ID") : undefined;
      const label = e.kind === "upgrade" ? "GET · Upgrade" : e.method === "POST" ? `POST ${e.target}` : `GET ${e.target}`;
      moves.push(
        <PathMover key={key} path={ease([laneFrom, laneTo])} duration={T.trip}>
          <Letter tone="ask" label={clip(label, 26)} sub={resume ? `Last-Event-ID: ${resume}` : undefined} />
        </PathMover>,
      );
    }
    if (e.type === "answered") {
      const ex = net.exchanges.find((x) => x.id === e.id);
      const tone = e.status >= 400 ? "bad" : e.delivered.length ? "msg" : "empty";
      const body = e.status === 200 && ex?.kind !== "other" ? (e.delivered.length ? e.delivered.map((d) => `#${d}`).join(" ") : "[ ]") : null;
      const label = body ? `200 ${body}` : `${e.status} ${ex?.statusText ?? ""}`.trim();
      const delay = sentIds.has(e.id) ? T.trip : 0;
      for (const d of e.delivered) arrive[d] = delay + T.trip;
      moves.push(
        <PathMover key={key} path={ease([laneTo, laneFrom])} delay={delay} duration={T.trip}>
          <Letter tone={tone} label={clip(label, 26)} sub={tone === "empty" && e.status < 300 ? labels.nothingNew : undefined} />
        </PathMover>,
      );
    }
    if (e.type === "streamed" || (e.type === "frame" && e.dir === "in")) {
      const kind: "sse" | "ws" = e.type === "streamed" ? "sse" : "ws";
      const id = e.type === "streamed" ? e.msg : parse(e.text).id;
      const m = id !== undefined ? byId(id) : undefined;
      // after whatever set it off: the stream's own request and cable, a POST, a sent frame, a teammate
      const base =
        e.type === "streamed" && sentIds.has(e.id) ? T.trip + T.grow : sentIds.size > 0 ? T.trip : outFrames ? T.frame : teammateWrote ? T.post : 0.15;
      const delay = base + downIdx++ * 0.3;
      if (id !== undefined) arrive[id] = delay + T.frame;
      moves.push(
        <PathMover key={key} path={sample(cable(kind), 1, 0, 14)} delay={delay} duration={T.frame}>
          <Bubble label={id !== undefined ? `#${id}` : "…"} fill={tintOf(m?.from).body} />
        </PathMover>,
      );
    }
    if (e.type === "frame" && e.dir === "out") {
      const said = parse(e.text).text ?? e.text;
      moves.push(
        <PathMover key={key} path={sample(cable("ws"), 0, 1, 14)} duration={T.frame}>
          <Bubble label={clip(said, 14)} fill={TINTS.sky.body} out />
        </PathMover>,
      );
    }
    if (e.type === "posted" && e.via === "teammate") {
      const who = TEAMMATES[e.from];
      if (who) {
        moves.push(
          <PathMover key={key} path={ease([[who.at[0], who.at[1] - 56], [RACK_TOP[0], RACK_TOP[1] - 6]], 10)} duration={T.post}>
            <Bubble label={`#${e.msg}`} fill={who.tint.body} />
          </PathMover>,
        );
      }
    }
  });

  /* --- cables: open ones, and ones that came apart in this action --- */
  const cut: ReactNode[] = [];
  let wsCut = false;
  let sseCut = false;
  last.forEach((e, i) => {
    if (e.type === "ended") {
      const ex = net.exchanges.find((x) => x.id === e.id);
      if (ex?.kind === "sse" && !streams.length && !sseCut) {
        sseCut = true;
        cut.push(<CutCable key={`cut-${beat}-${i}`} c={cable("sse")} kind="sse" label={labels.ended(e.end)} labelDy={30} />);
      }
    }
    if (e.type === "wsClosed" && !sockets.length && !wsCut) {
      wsCut = true;
      cut.push(<CutCable key={`cutws-${beat}-${i}`} c={cable("ws")} kind="ws" label={labels.wsClosed(e.code)} labelDy={-46} />);
    }
  });
  const sseGrow = streams.some((s) => sentIds.has(s.id)) ? T.trip : null;
  const wsGrow = upgraded ? 2 * T.trip : null;

  /* --- the client's screen --- */
  const rows = got.slice(device === "phone" ? -4 : -5).map((id) => ({ id, m: byId(id) }));

  return (
    <g className="ws-stage phone-stage">
      {/* floor shadows */}
      <ellipse cx={device === "phone" ? 150 : 175} cy={device === "phone" ? 452 : 430} rx={device === "phone" ? 120 : 160} ry={device === "phone" ? 32 : 44} className="ps-floor" />
      <ellipse cx={690} cy={438} rx={130} ry={38} className="ps-floor" />

      <Pill x={430} y={30} text={labels.clock(seconds(net.now))} tone="ink" animate={false} />

      {/* teammates write to the server */}
      {writers.map((id) => {
        const w = TEAMMATES[id]!;
        const talking = last.some((e) => e.type === "posted" && e.from === id);
        return (
          <g key={id} transform={`translate(${w.at[0]} ${w.at[1]})`}>
            <Person tint={w.tint} state={talking ? "hop" : "idle"} scale={0.8} />
            <text y={17} textAnchor="middle" className="net-name">
              {labels.names[id] ?? id}
            </text>
          </g>
        );
      })}

      {/* servers the reader started */}
      {legacy.map((p, i) => {
        const q = isoAt(470 - i * 95, 120);
        return (
          <g key={p.pid}>
            <Box p={q} at={[0, 0, 0]} size={[36, 36, 58]} shades={DARK} />
            <g transform={onFront(q, 0, 36, 58)}>
              {[8, 22, 36].map((v) => (
                <rect key={v} x={4} y={v} width={28} height={9} rx={1.5} className="ps-unit" />
              ))}
            </g>
            <Pill x={q(18, 18)[0]} y={q(36, 36)[1] + 20} text={`:${p.ports[0]} ${p.file}`} size={10} animate={false} />
          </g>
        );
      })}

      <Rack />
      <Pill x={RACK.p(RACK.w, RACK.d)[0]} y={RACK.p(RACK.w, RACK.d)[1] + 28} text={labels.server} animate={false} />

      {device === "phone" ? <Phone rows={rows} labels={labels} offline={offline} arrive={arrive} /> : <Laptop rows={rows} labels={labels} offline={offline} arrive={arrive} />}
      <Pill x={device === "phone" ? 150 : 160} y={device === "phone" ? 497 : 487} text={labels.client} animate={false} />
      {offline && <Pill x={device === "phone" ? 112 : 190} y={device === "phone" ? 48 : 104} text={labels.offline} tone="danger" animate={false} />}

      {/* the lane one-off requests take */}
      <line x1={laneFrom[0] + 6} y1={laneFrom[1]} x2={laneTo[0] - 6} y2={laneTo[1]} className="ps-lane" />
      <circle cx={laneFrom[0]} cy={laneFrom[1]} r={5} className="ps-jack" />
      <circle cx={laneTo[0]} cy={laneTo[1]} r={5} className="ps-jack" />

      {/* open streams and sockets */}
      {streams.length > 0 && <OpenCable key={`sse-${streams[0]!.id}`} c={cable("sse")} kind="sse" label={labels.sse} grow={sseGrow} />}
      {sockets.length > 0 && <OpenCable key={`ws-${sockets[0]!.id}`} c={cable("ws")} kind="ws" label={labels.ws} grow={wsGrow} />}
      {cut}

      {/* long polls parked at the server */}
      <AnimatePresence>
        {held.map((ex, i) => (
          <motion.g key={ex.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transform={`translate(${laneTo[0] - 30 - i * 40} ${laneTo[1]})`}>
            <Letter tone="ask" label={labels.waiting} />
            <g transform="translate(0 -26)">
              <Hourglass />
            </g>
          </motion.g>
        ))}
      </AnimatePresence>

      <AnimatePresence>{moves}</AnimatePresence>

      {/* the server's messages */}
      <Board x={292} y={398} title={labels.board} rows={net.messages.slice(-4).map((m) => `#${m.id} ${labels.names[m.from] ?? m.from}: ${m.text}`)} empty={labels.nothingYet} />
    </g>
  );
}

/* ------------------------------------------------------------------ the rack */

function Rack() {
  const { p, w, d, h } = RACK;
  const v = (z: number) => h - z;
  const unit = (z0: number, z1: number, key: string, children?: ReactNode) => (
    <g key={key}>
      <rect x={6} y={v(z1)} width={w - 12} height={z1 - z0} rx={2.5} className="ps-unit" />
      {children}
    </g>
  );
  const led = (z: number, tone: "on" | "warm", key: string) => <circle key={key} cx={w - 15} cy={v(z)} r={3.2} className={`ps-led is-${tone}`} />;
  const socket = (z: number) => <circle cx={UNIT.jackX} cy={v(z)} r={6.5} className="ps-socket" />;
  const [ws0, ws1] = UNIT.wsZ;
  const [api0, api1] = UNIT.apiZ;
  return (
    <g className="ps-rack">
      <Box p={p} at={[0, 0, 0]} size={[w, d, h]} shades={DARK} />
      {/* vents on the side */}
      <g transform={onSide(p, w, d, h)}>
        {[30, 44, 58, 72].map((x) => (
          <line key={x} x1={x - 10} y1={40} x2={x - 10} y2={h - 40} className="ps-vent" />
        ))}
      </g>
      <g transform={onFront(p, 0, d, h)}>
        {unit(ws0, ws1, "ws", (
          <>
            {socket((ws0 + ws1) / 2)}
            <text x={30} y={v((ws0 + ws1) / 2) + 4} className="ps-unit-label">
              :8081 ws
            </text>
            {led((ws0 + ws1) / 2, "on", "l")}
          </>
        ))}
        {unit(192, 220, "blank1", (
          <>
            {[30, 40, 50, 60].map((x) => (
              <line key={x} x1={x} y1={v(214)} x2={x} y2={v(198)} className="ps-grille" />
            ))}
            {led(206, "warm", "l")}
          </>
        ))}
        {unit(api0, api1, "api", (
          <>
            {socket(UNIT.sseZ)}
            {socket(UNIT.laneZ)}
            <text x={30} y={v(api1) + 18} className="ps-unit-label">
              :8080 API
            </text>
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <line key={k} x1={30} y1={v(api1) + 34 + k * 10} x2={w - 26} y2={v(api1) + 34 + k * 10} className="ps-grille" />
            ))}
            {led(api1 - 10, "on", "l1")}
            {led(api1 - 22, "on", "l2")}
          </>
        ))}
        {unit(40, 68, "blank2", (
          <>
            {[30, 40, 50, 60].map((x) => (
              <line key={x} x1={x} y1={v(62)} x2={x} y2={v(46)} className="ps-grille" />
            ))}
            {led(54, "on", "l")}
          </>
        ))}
        {unit(8, 32, "base", <rect x={30} y={v(26)} width={40} height={12} rx={2} className="ps-drive" />)}
      </g>
    </g>
  );
}

/* ----------------------------------------------------------------- clients */

/** A row that scrolls off leaves when the new one comes in, not before. */
const GONE = { gone: (delay: number) => ({ opacity: 0, transition: { delay, duration: 0.2 } }) };

interface ScreenProps {
  rows: { id: number; m: Net["messages"][number] | undefined }[];
  labels: PhoneStageLabels;
  offline: boolean;
  arrive: Record<number, number>;
}

function Phone({ rows, labels, offline, arrive }: ScreenProps) {
  const { p, w, d, h } = PHONE;
  const sw = w - 18;
  const sh = h - 56;
  const delayOf = Math.max(0, ...rows.map((r) => arrive[r.id] ?? 0));
  return (
    <g className="ps-phone">
      <Box p={p} at={[0, 0, 0]} size={[w, d, h]} shades={["#57535f", "#36343d", "#45424d"]} />
      {/* side buttons */}
      <g transform={onSide(p, w, d, h)}>
        <rect x={3} y={62} width={8} height={34} rx={3} className="ps-side-button" />
      </g>
      <g transform={onFront(p, 0, d, h)}>
        <rect x={w / 2 - 20} y={11} width={40} height={6} rx={3} className="ps-speaker" />
        <rect x={9} y={28} width={sw} height={sh} rx={12} className="ps-screen" />
        <clipPath id="ps-phone-screen">
          <rect x={9} y={28} width={sw} height={sh} rx={12} />
        </clipPath>
        <g clipPath="url(#ps-phone-screen)">
          {/* status bar and address bar of the browser */}
          <WifiIcon x={sw - 12} y={38} off={offline} />
          <rect x={sw - 40} y={34} width={14} height={7} rx={2} className="ps-battery" />
          <rect x={17} y={48} width={sw - 16} height={17} rx={8.5} className="ps-urlbar" />
          <text x={9 + sw / 2} y={60} textAnchor="middle" className="ps-url">
            localhost:8080
          </text>
          <text x={17} y={89} className="ps-screen-title">
            {labels.inbox}
          </text>
          {rows.length === 0 && (
            <text x={17} y={112} className="ps-screen-empty">
              {labels.nothingYet}
            </text>
          )}
          <AnimatePresence initial={false} custom={delayOf}>
            {rows.map(({ id, m }, i) => {
              const mine = m?.from === "you";
              const bw = 120;
              const bx = mine ? 9 + sw - bw - 8 : 17;
              const by = 99 + i * 45;
              const tint = tintOf(m?.from);
              const delay = arrive[id] ?? delayOf;
              return (
                <motion.g
                  key={id}
                  custom={delay}
                  variants={GONE}
                  initial={{ opacity: 0, x: bx, y: by + 14 }}
                  animate={{ opacity: 1, x: bx, y: by }}
                  exit="gone"
                  transition={{ delay, duration: 0.3 }}
                >
                  <rect x={0} y={0} width={bw} height={38} rx={10} className="ps-msg" style={{ fill: mine ? "var(--sky-soft)" : "var(--card)" }} />
                  <circle cx={10} cy={11} r={4} className="ps-msg-dot" style={{ fill: tint.body }} />
                  <text x={19} y={14.5} className="ps-msg-who">
                    #{id} {m ? (labels.names[m.from] ?? m.from) : ""}
                  </text>
                  <text x={8} y={30} className="ps-msg-text">
                    {m ? clip(m.text, 19) : ""}
                  </text>
                </motion.g>
              );
            })}
          </AnimatePresence>
        </g>
        <line x1={w / 2 - 22} y1={h - 13} x2={w / 2 + 22} y2={h - 13} className="ps-homebar" />
      </g>
    </g>
  );
}

function Laptop({ rows, labels, offline, arrive }: ScreenProps) {
  const { p, w, base, h } = LAPTOP;
  const delayOf = Math.max(0, ...rows.map((r) => arrive[r.id] ?? 0));
  const sw = w - 16;
  const sh = h - 16;
  return (
    <g className="ps-laptop">
      {/* the base with its keyboard */}
      <Box p={p} at={[0, 0, 0]} size={[w, base, 10]} shades={["#d8d2dc", "#b9b2c0", "#a39cab"]} />
      <g transform={onTop(p, 0, 0, 10)}>
        {Array.from({ length: 4 }, (_, r) =>
          Array.from({ length: 12 }, (_, k) => <rect key={`${r}-${k}`} x={16 + k * 14.5} y={18 + r * 11} width={11} height={8} rx={1.5} className="ps-key" />),
        )}
        <rect x={70} y={68} width={60} height={30} rx={4} className="ps-trackpad" />
      </g>
      {/* the lid, standing at the back */}
      <Box p={p} at={[0, 0, 10]} size={[w, 8, h]} shades={["#b9b2c0", "#8b8694", "#a39cab"]} />
      <g transform={onFront(p, 0, 8, 10 + h)}>
        <rect x={8} y={8} width={sw} height={sh} rx={5} className="ps-term" />
        <clipPath id="ps-laptop-screen">
          <rect x={8} y={8} width={sw} height={sh} rx={5} />
        </clipPath>
        <g clipPath="url(#ps-laptop-screen)">
          <rect x={8} y={8} width={sw} height={16} className="ps-term-bar" />
          {["var(--coral)", "var(--sun)", "var(--mint)"].map((c, k) => (
            <circle key={c} cx={18 + k * 10} cy={16} r={3} style={{ fill: c }} />
          ))}
          <WifiIcon x={sw - 4} y={17} off={offline} />
          <text x={14} y={40} className="ps-term-title">
            {labels.inbox}
          </text>
          {rows.length === 0 && (
            <text x={14} y={58} className="ps-term-row is-dim">
              {labels.nothingYet}
            </text>
          )}
          <AnimatePresence initial={false} custom={delayOf}>
            {rows.map(({ id, m }, i) => (
              <motion.text
                key={id}
                x={14}
                custom={arrive[id] ?? delayOf}
                variants={GONE}
                initial={{ opacity: 0, y: 58 + i * 19 + 8 }}
                animate={{ opacity: 1, y: 58 + i * 19 }}
                exit="gone"
                transition={{ delay: arrive[id] ?? delayOf, duration: 0.3 }}
                className="ps-term-row"
              >
                {clip(m ? `#${m.id} ${labels.names[m.from] ?? m.from}: ${m.text}` : `#${id}`, 28)}
              </motion.text>
            ))}
          </AnimatePresence>
        </g>
      </g>
    </g>
  );
}
