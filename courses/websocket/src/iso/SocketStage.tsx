import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Building, IsoBox, Pill, TINTS, type Tint } from "@lets-explain/core/iso/shapes";
import { OP } from "../engine/frames";
import { CLOSE_NAME, type Net, type NetEvent, type WsConn } from "../engine/net";

/**
 * The stage for lessons with several WebSocket connections: clients on the left, servers on the
 * right, nginx and Redis in between when they are there. A connection is a line; each end can be
 * closed on its own, so a line can be half dead. Frames move along the lines as they are sent:
 * text in mint, binary in blue, ping and pong in yellow, close in coral.
 */

export const SOCKET_STAGE = { width: 860, height: 520 };

export interface SocketStageLabels {
  client: (id: string) => string;
  server: (id: string) => string;
  nginx: string;
  redis: string;
  clock: (s: string) => string;
  /** Under a connection whose one end closed and the other did not notice. */
  halfOpen: string;
}

export interface SocketStageProps {
  net: Net;
  last: NetEvent[];
  beat: number;
  labels: SocketStageLabels;
  /** Clients to draw even before they connect, in this order. */
  clients?: string[];
  /** A per-client tint. */
  tint?: (client: string) => Tint;
  /** Extra things to draw on top (a memory gauge, a room name…). */
  overlay?: ReactNode;
  /** Show bytes waiting for slow clients. */
  showQueues?: boolean;
}

const LEFT = 150;
const RIGHT = 700;
const MID = 430;

const seconds = (ms: number) => (ms % 1000 === 0 ? String(ms / 1000) : (ms / 1000).toFixed(1));

function frameFill(opcode: number) {
  if (opcode === OP.ping || opcode === OP.pong) return "var(--sun)";
  if (opcode === OP.close) return "var(--coral)";
  if (opcode === OP.binary) return "var(--sky)";
  return "var(--mint)";
}

/** Clients in the order they first appear (or as given), the newest connection of each. */
function clientsOf(net: Net, given: string[] | undefined): string[] {
  const seen = [...(given ?? [])];
  for (const c of net.conns) if (!seen.includes(c.client)) seen.push(c.client);
  return seen;
}

/**
 * Server rows, in the order they first appear. A server restarted under the same file and port
 * takes the old one's row: `rowOf` maps every server id to the id drawn in that row (the live copy
 * when there is one).
 */
function serversOf(net: Net): { rows: string[]; rowOf: (id: string) => string } {
  const keyOf = (id: string) => {
    if (!id.startsWith("proc:")) return id;
    const p = net.procs.find((x) => x.pid === Number(id.slice(5)));
    return p ? `${p.file}|${p.env.PORT ?? p.ports[0] ?? ""}` : id;
  };
  const ids: string[] = [];
  for (const c of net.conns) if (!ids.includes(c.server)) ids.push(c.server);
  for (const p of net.procs) if (p.alive && p.kind === "node" && p.ports.length && !ids.includes(`proc:${p.pid}`)) ids.push(`proc:${p.pid}`);
  const shown = new Map<string, string>();
  for (const id of ids) {
    const key = keyOf(id);
    const was = shown.get(key);
    const alive = (x: string) => !x.startsWith("proc:") || !!net.procs.find((p) => p.pid === Number(x.slice(5)))?.alive;
    // The live copy wins; among dead ones, the newest.
    if (was === undefined || alive(id) || !alive(was)) shown.set(key, id);
  }
  return { rows: [...shown.values()], rowOf: (id) => shown.get(keyOf(id)) ?? id };
}

export function SocketStage({ net, last, beat, labels, clients: given, tint, overlay, showQueues }: SocketStageProps) {
  const clients = clientsOf(net, given);
  const { rows: servers, rowOf } = serversOf(net);
  const many = clients.length > 9;
  const rowY = (i: number, n: number) => (n <= 1 ? 270 : 90 + (i * 360) / (n - 1));
  const clientPos = (id: string): [number, number] => {
    const i = clients.indexOf(id);
    if (!many) return [LEFT, rowY(i, clients.length)];
    // Many clients: a grid of small dots.
    const cols = Math.ceil(clients.length / 12);
    return [70 + (i % cols) * 28, 80 + Math.floor(i / cols) * 30];
  };
  const serverPos = (id: string): [number, number] => {
    const i = servers.indexOf(rowOf(id));
    return [RIGHT, servers.length <= 1 ? 270 : 150 + (i * 240) / Math.max(1, servers.length - 1)];
  };
  const latest = new Map<string, WsConn>();
  for (const c of net.conns) latest.set(c.client, c);
  const viaNginx = net.conns.some((c) => c.via !== null) || net.nginx !== null;

  const lineOf = (c: WsConn) => {
    const [x1, y1] = clientPos(c.client);
    const [x2, y2] = serverPos(c.server);
    const from: [number, number] = [x1 + (many ? 8 : 40), y1 - (many ? 0 : 14)];
    const to: [number, number] = [x2 - 52, y2 - 16];
    return { from, to };
  };

  const moves: ReactNode[] = [];
  last.forEach((e, i) => {
    if (e.type !== "frame") return;
    const c = net.conns.find((x) => x.id === e.conn);
    if (!c || !clients.includes(c.client)) return;
    const { from, to } = lineOf(c);
    const [a, b] = e.dir === "out" ? [from, to] : [to, from];
    const key = `${beat}-${i}`;
    moves.push(
      <motion.g
        key={key}
        initial={{ x: a[0], y: a[1], opacity: 0 }}
        animate={{ x: [a[0], b[0], b[0]], y: [a[1], b[1], b[1]], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.05, delay: Math.min(i * 0.12, 0.9), times: [0, 0.75, 1], ease: "easeInOut" }}
      >
        <rect x={-11} y={-8} width={22} height={16} rx={4} className="ink" style={{ fill: frameFill(e.opcode) }} />
        {e.held && <text y={-12} textAnchor="middle" className="sock-held">⏸</text>}
      </motion.g>,
    );
  });

  return (
    <g className="net-stage sock-stage">
      <ellipse cx={430} cy={300} rx={400} ry={150} className="net-ground" />

      {/* connections */}
      {[...latest.values()].map((c) => {
        const { from, to } = lineOf(c);
        const clientGone = c.closedAt !== null;
        const serverGone = c.serverClosedAt !== null;
        if (clientGone && serverGone && net.now - Math.max(c.closedAt!, c.serverClosedAt!) > 120_000) return null;
        const mx = (from[0] + to[0]) / 2;
        const my = (from[1] + to[1]) / 2;
        const half = clientGone !== serverGone;
        const blocked = net.blocked.includes(c.port) || net.blocked.includes(c.upstream) || net.down.includes(c.client);
        const code = c.serverCode ?? c.closeCode;
        return (
          <g key={c.id} className={`sock-line ${clientGone && serverGone ? "is-closed" : half ? "is-half" : "is-open"}`}>
            <line x1={from[0]} y1={from[1]} x2={mx} y2={my} className={`sock-seg ${clientGone ? "is-dead" : ""}`} />
            <line x1={mx} y1={my} x2={to[0]} y2={to[1]} className={`sock-seg ${serverGone ? "is-dead" : ""}`} />
            {blocked && !clientGone && (
              <g transform={`translate(${mx} ${my})`}>
                <circle r={11} className="sock-cut" />
                <path d="M-5 -5l10 10m0 -10l-10 10" className="badge-x" />
              </g>
            )}
            {code !== null && !many && (
              <Pill x={mx} y={my - 18} text={`${code} ${CLOSE_NAME[code] ?? ""}`.trim()} tone={code === 1000 || code === 1001 ? "plain" : "danger"} size={10} animate={false} />
            )}
            {half && !many && <Pill x={mx} y={my + 18} text={labels.halfOpen} tone="warn" size={10} animate={false} />}
            {showQueues && c.queue.some((q) => q.at > net.now) && (
              <Pill x={to[0] - 60} y={to[1] + 26} text={`${Math.round(c.queue.filter((q) => q.at > net.now).reduce((n, q) => n + q.wire, 0) / 1024)} KB`} tone="sun" size={10} animate={false} />
            )}
          </g>
        );
      })}

      {/* nginx */}
      {viaNginx && (
        <g transform={`translate(${MID} 300)`}>
          <IsoBox s={20} at={[-1, -1, 0]} size={[2, 2, 1]} shades={["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"]} />
          <Pill x={0} y={40} text={labels.nginx} size={10} animate={false} />
        </g>
      )}

      {/* servers */}
      {servers.map((id) => {
        const [x, y] = serverPos(id);
        const pid = id.startsWith("proc:") ? Number(id.slice(5)) : null;
        const down = pid !== null && !net.procs.find((p) => p.pid === pid)?.alive;
        return (
          <g key={id}>
            <g transform={`translate(${x} ${y})`}>
              <Building s={24} roof={TINTS.mint} status={down ? "down" : "ok"} w={1.6} h={1.1} />
            </g>
            <Pill x={x} y={y + 46} text={labels.server(id)} tone={down ? "danger" : "plain"} size={11} animate={false} />
          </g>
        );
      })}

      {/* redis */}
      {net.redis && (
        <g transform="translate(560 455)">
          <IsoBox s={16} at={[-1, -1, 0]} size={[2, 2, 0.9]} shades={["var(--coral)", "#f08770", "var(--coral-deep)"]} />
          <Pill x={0} y={30} text={labels.redis} size={10} animate={false} />
        </g>
      )}

      {/* clients */}
      {clients.map((id) => {
        const [x, y] = clientPos(id);
        const c = latest.get(id);
        const open = c && c.closedAt === null;
        const t = tint?.(id) ?? TINTS.sky;
        if (many) {
          return <circle key={id} cx={x} cy={y} r={9} className="ink" style={{ fill: open ? t.body : "#e9e5ec" }} />;
        }
        return (
          <g key={id}>
            <g transform={`translate(${x} ${y})`}>
              <Building s={16} roof={open ? t : TINTS.grey} status={open ? "ok" : "down"} w={1.3} h={0.9} />
            </g>
            <Pill x={x} y={y + 34} text={labels.client(id)} size={10} animate={false} />
          </g>
        );
      })}

      <AnimatePresence>{moves}</AnimatePresence>
      {overlay}
      <Pill x={78} y={30} text={labels.clock(seconds(net.now))} tone="ink" animate={false} />
    </g>
  );
}
