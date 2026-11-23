import { AnimatePresence, motion } from "motion/react";
import { useMemo, type ReactNode } from "react";
import { Pill, TINTS, type Tint } from "@lets-explain/core/iso/shapes";
import { OP } from "../engine/frames";
import { CLOSE_NAME, header, type Net, type NetEvent, type WsConn } from "../engine/net";
import {
  at,
  Box,
  Bubble,
  type Cable,
  CutCable,
  Device,
  deviceGeom,
  type DeviceGeom,
  type DeviceKind,
  DARK,
  SHELL,
  HalfCable,
  isoAt,
  Letter,
  legs,
  lineD,
  onFront,
  OpenCable,
  PathMover,
  type Pt,
  Rack,
  sample,
  seconds,
  clip,
  WifiIcon,
} from "./kit";
import { buildScript, T, useActionClock } from "./timeline";

/**
 * The stage for lessons with several WebSocket connections. Clients are the devices they are (a
 * desktop browser, a phone, a tablet, a laptop, a terminal running a script) and each screen shows
 * what that client has received. Servers are racks. Each connection is a two-lane cable plugged
 * into the client and into the server's rack; nginx, when it is there, is a gateway the cable
 * passes through, and Redis a box the racks share a bus cable with.
 *
 * Everything is read from the model: a cable is plugged in while the connection is open, each end
 * can let go on its own (half open), a frame rides the cable in the direction it went, coloured by
 * opcode (text mint, binary blue, ping and pong yellow, close coral). An action that lets time pass
 * plays at its real model times, squeezed, with the clock running.
 */

export interface SocketStageLabels {
  client: (id: string) => string;
  server: (id: string) => string;
  nginx: string;
  redis: string;
  clock: (s: string) => string;
  /** Under a connection whose one end closed and the other did not notice. */
  halfOpen: string;
  open: string;
  closed: (code: number | null) => string;
  connecting: string;
  noNet: string;
  /** Bytes waiting to go out to a slow client. */
  queue: (kb: number) => string;
  originCheck: string;
  /** A run of numbered lines that never arrived. */
  missing: (from: number, to: number) => string;
}

export interface SocketStageProps {
  net: Net;
  last: NetEvent[];
  beat: number;
  labels: SocketStageLabels;
  /** The step's last action: it may play for longer. */
  final?: boolean;
  /** Clients to draw even before they connect, in this order. */
  clients?: string[];
  /** A per-client tint. */
  tint?: (client: string) => Tint;
  /** Extra things to draw on top. */
  overlay?: ReactNode;
  /** Show bytes waiting for slow clients, in a bin at the server's socket. */
  showQueues?: boolean;
  /** Write the Origin header on handshake envelopes. */
  showOrigin?: boolean;
  /** Ring each client by the room the server confirmed it joined. */
  rooms?: boolean;
}

function frameFill(opcode: number) {
  if (opcode === OP.ping || opcode === OP.pong) return "var(--sun)";
  if (opcode === OP.close) return "var(--coral)";
  if (opcode === OP.binary) return "var(--sky)";
  return "var(--mint)";
}

/** What a message reads as on a screen: JSON the app understands, as the app would show it. */
export function screenText(text: string, size = text.length): string {
  // long payloads are kept cut short: read what the start says
  const cut = /^\{"type":"([^"]+)"/.exec(text);
  if (cut && cut[1] === "board") return `board · ${Math.round(size / 1024)} KB`;
  try {
    const m = JSON.parse(text) as Record<string, unknown>;
    if (m && typeof m === "object") {
      if (typeof m.seq === "number") return `#${m.seq} ${typeof m.text === "string" ? m.text : ""}`.trim();
      if (m.type === "board") return `board · ${Math.round(size / 1024)} KB`;
      if (m.type === "joined" && typeof m.room === "string") return `joined #${m.room}`;
      if (m.type === "join" && typeof m.room === "string") return `join #${m.room}`;
      if (m.type === "error") return `error: ${String(m.error ?? "")}`;
      if (typeof m.text === "string") return m.text;
      if (typeof m.type === "string") return m.type;
    }
  } catch {
    /* plain text */
  }
  return text;
}

function frameLabel(e: Extract<NetEvent, { type: "frame" }>): string {
  const more = e.fin ? "" : "…";
  if (e.opcode === OP.ping) return "ping";
  if (e.opcode === OP.pong) return "pong";
  if (e.opcode === OP.close) {
    const code = e.text.split(" ")[0];
    return code ? `close ${code}` : "close";
  }
  if (e.opcode === OP.binary) return `${e.size} B`;
  if (e.opcode === OP.cont) return `+${e.size} B${more}`;
  if (e.size > 200) return `${Math.round(e.size / 1024) || "<1"} KB${more}`;
  return clip(screenText(e.text), 13) + more;
}

/** Clients in the order they first appear (or as given). */
function clientsOf(net: Net, given: string[] | undefined): string[] {
  const seen = [...(given ?? [])];
  for (const c of net.conns) if (!seen.includes(c.client)) seen.push(c.client);
  return seen;
}

/**
 * Server rows, in the order they first appear. A server restarted under the same file and port
 * takes the old one's row: `rowOf` maps every server id to the id drawn in that row.
 */
/** The port a server listens (or listened) on: a stopped process has none left, but its connections remember. */
export function portOf(net: Net, id: string): string {
  if (id === "chat") return "8081";
  const p = net.procs.find((x) => `proc:${x.pid}` === id);
  const port = p?.ports[0] ?? p?.env.PORT ?? net.conns.find((c) => c.server === id)?.upstream;
  return port === undefined ? "" : String(port);
}

function serversOf(net: Net): { rows: string[]; rowOf: (id: string) => string } {
  const keyOf = (id: string) => {
    if (!id.startsWith("proc:")) return id;
    const p = net.procs.find((x) => x.pid === Number(id.slice(5)));
    return p ? `${p.file}|${portOf(net, id)}` : id;
  };
  const ids: string[] = [];
  for (const c of net.conns) if (!ids.includes(c.server)) ids.push(c.server);
  for (const p of net.procs) if (p.kind === "node" && (p.ports.length || p.env.PORT) && !ids.includes(`proc:${p.pid}`)) ids.push(`proc:${p.pid}`);
  const shown = new Map<string, string>();
  const alive = (x: string) => !x.startsWith("proc:") || !!net.procs.find((p) => p.pid === Number(x.slice(5)))?.alive;
  for (const id of ids) {
    const key = keyOf(id);
    const was = shown.get(key);
    // The live copy wins; among dead ones, the newest.
    if (was === undefined || alive(id) || !alive(was)) shown.set(key, id);
  }
  // Rows of dead servers nobody connected to and that never listened stay off stage.
  return { rows: [...shown.values()].slice(0, 3), rowOf: (id) => shown.get(keyOf(id)) ?? id };
}

/** Which device a client is. */
function kindOf(client: string): { kind: DeviceKind; term: boolean } {
  if (client === "phone") return { kind: "phone", term: false };
  if (client === "tablet") return { kind: "tablet", term: false };
  if (client === "laptop") return { kind: "laptop", term: false };
  if (client === "you") return { kind: "laptop", term: true };
  if (client.startsWith("proc:")) return { kind: "monitor", term: true };
  return { kind: "monitor", term: false };
}

const SIZE: Record<DeviceKind, readonly [number, number]> = {
  phone: [98, 156],
  tablet: [144, 106],
  laptop: [144, 88],
  monitor: [136, 94],
};

/** On-screen height of a device drawing (face, its iso slant, stand or base). */
function extent(kind: DeviceKind, w: number, h: number) {
  if (kind === "laptop") return h + 8 + w / 2 + h * 0.62 * 0.5;
  if (kind === "monitor") return h + h * 0.16 + w / 2 + 12;
  return h + w / 2 + 6;
}

interface Slot {
  id: string;
  g: DeviceGeom;
  term: boolean;
  /** Where its name goes: in a column left of the devices. */
  name: Pt;
}

function layoutClients(ids: string[]): Slot[] {
  const n = ids.length;
  const top = 58;
  const bottom = 506;
  const span = (bottom - top) / Math.max(1, n);
  // Neighbours sit a little apart sideways, so one's slanted bottom can tuck beside the next one's top.
  const tuck = n >= 3 ? 0.9 : 1;
  return ids.map((id, i) => {
    const { kind, term } = kindOf(id);
    const [w0, h0] = SIZE[kind];
    const f = Math.min(n === 1 ? 1.3 : 1.08, span / (extent(kind, w0, h0) * tuck));
    const w = Math.round(w0 * f);
    const h = Math.round(h0 * f);
    const ext = extent(kind, w, h);
    const slotTop = top + i * span + (span - ext * tuck) / 2;
    const faceBottom = kind === "monitor" ? slotTop + h + h * 0.16 : slotTop + h;
    const x = (kind === "laptop" ? 150 : 112) + (n >= 3 && i % 2 === 1 ? 92 : 0);
    const g = deviceGeom(kind, x, faceBottom + (kind === "laptop" ? 4 : 0), w, h);
    const faceMid = faceBottom - h * 0.45;
    return { id, g, term, name: [64, faceMid] as Pt };
  });
}

interface RackGeom {
  id: string;
  p: ReturnType<typeof isoAt>;
  w: number;
  d: number;
  h: number;
  name: Pt;
  /** Screen point of a socket at height z on the front, at `slot` across. */
  front: (z: number) => Pt;
  /** A point on the side face, for the Redis bus. */
  side: Pt;
}

function layoutRacks(ids: string[], redis: boolean): RackGeom[] {
  const k = Math.max(1, ids.length);
  const dims = k === 1 ? { w: 96, d: 80, h: 230 } : k === 2 ? { w: 86, d: 64, h: 132 } : { w: 80, d: 56, h: 76 };
  const ox = (redis ? 640 : 702) + (k === 1 ? 0 : 8);
  const ys = k === 1 ? [398] : k === 2 ? [204, 430] : [136, 290, 444];
  return ids.map((id, i) => {
    const { w, d, h } = dims;
    const p = isoAt(ox, ys[i]!);
    const fb = p(w / 2, d, 0);
    const sd = p(w, d / 2, h * 0.55);
    return {
      id,
      p,
      w,
      d,
      h,
      name: [fb[0], fb[1] + 20] as Pt,
      front: (z: number) => {
        const [x, y] = p(16, d, z);
        return [x - 6, y] as Pt;
      },
      side: [sd[0] + 2, sd[1]] as Pt,
    };
  });
}

const GATE = { p: isoAt(452, 236), w: 78, d: 62, h: 34 };
const gateIn: Pt = (() => {
  const [x, y] = GATE.p(14, GATE.d, GATE.h * 0.5);
  return [x - 4, y];
})();
const gateOut: Pt = (() => {
  const [x, y] = GATE.p(GATE.w, GATE.d * 0.5, GATE.h * 0.5);
  return [x + 4, y];
})();
const REDIS = { p: isoAt(800, 282), w: 40, d: 40, h: 46 };

/* ------------------------------------------------------------------ stage */

export function SocketStage({ net, last, beat, labels, final = true, clients: given, tint, overlay, showQueues, showOrigin, rooms }: SocketStageProps) {
  const script = useMemo(() => buildScript(net, last, final), [net, last, final]);
  const r = useActionClock(`${beat}`, script.total);
  const now = script.sim(r);
  const happened = (i: number) => script.at[i]! <= r;

  const tabs = clientsOf(net, given).filter((c) => net.procs.find((p) => `proc:${p.pid}` === c)?.file === "tab.js");
  const many = tabs.length > 6;
  const all = clientsOf(net, given).filter((c) => !many || !tabs.includes(c));
  const { rows: servers, rowOf } = serversOf(net);
  const usesRedis = (pid: number) => /ioredis|redis/.test(net.procs.find((p) => p.pid === pid)?.code ?? "");
  const redisOn = net.redis && servers.some((s) => s.startsWith("proc:") && usesRedis(Number(s.slice(5))));
  const racks = layoutRacks(servers, redisOn);
  const rackOf = (server: string) => racks.find((rk) => rk.id === rowOf(server));

  /* --- event indexes: when each connection opened, each end closed, each process started or stopped --- */
  const openIdx = new Map<number, number>();
  const closeIdx = new Map<string, number>();
  const procIdx = new Map<number, { start?: number; stop?: number }>();
  const blockEv: { i: number; port: number; on: boolean }[] = [];
  const msgIdx = new Map<string, number[]>();
  last.forEach((e, i) => {
    if (e.type === "wsOpened") openIdx.set(e.conn, i);
    if (e.type === "wsClosed") closeIdx.set(`${e.conn}:${e.side}`, i);
    if (e.type === "procStarted") procIdx.set(e.pid, { ...procIdx.get(e.pid), start: i });
    if (e.type === "procStopped" || e.type === "procExited" || e.type === "procCrashed") procIdx.set(e.pid, { ...procIdx.get(e.pid), stop: procIdx.get(e.pid)?.stop ?? i });
    if (e.type === "blocked") blockEv.push({ i, port: e.port, on: e.on });
    if (e.type === "message") msgIdx.set(`${e.conn}:${e.dir}`, [...(msgIdx.get(`${e.conn}:${e.dir}`) ?? []), i]);
    if (e.type === "frame" && e.dir === "out" && e.fin && (e.opcode === OP.text || e.opcode === OP.binary)) msgIdx.set(`${e.conn}:mine`, [...(msgIdx.get(`${e.conn}:mine`) ?? []), i]);
  });
  const procAlive = (pid: number) => {
    const p = net.procs.find((x) => x.pid === pid);
    const ix = procIdx.get(pid);
    if (!p) return false;
    if (ix?.start !== undefined && !happened(ix.start)) return false;
    if (ix?.stop !== undefined) return !happened(ix.stop);
    return p.alive;
  };
  const serverAlive = (id: string) => !id.startsWith("proc:") || procAlive(Number(id.slice(5)));
  // Ports blocked at this moment: the end state, wound back through the toggles still to come.
  const blocked = new Set(net.blocked);
  for (const b of [...blockEv].reverse()) {
    if (happened(b.i)) break;
    if (b.on) blocked.delete(b.port);
    else blocked.add(b.port);
  }
  const ended = (c: WsConn, side: "client" | "server") => {
    const at = side === "client" ? c.closedAt : c.serverClosedAt;
    if (at === null) return false;
    const i = closeIdx.get(`${c.id}:${side}`);
    return i === undefined || happened(i);
  };
  const opened = (c: WsConn) => {
    const i = openIdx.get(c.id);
    return i === undefined ? c.openedAt <= now : happened(i);
  };

  /* --- what each client shows: its newest connection as of now --- */
  const latest = new Map<string, WsConn>();
  for (const c of net.conns) if (opened(c)) latest.set(c.client, c);
  // A script run again (node reader.js after pkill) is the same screen: the newest copy that has started takes its place.
  const procOfClient = (c: string) => (c.startsWith("proc:") ? net.procs.find((p) => `proc:${p.pid}` === c) : undefined);
  const rowKey = (c: string) => {
    const p = procOfClient(c);
    return p ? `file:${p.file}` : c;
  };
  const started = (c: string) => {
    const p = procOfClient(c);
    const ix = p ? procIdx.get(p.pid) : undefined;
    return ix?.start === undefined || happened(ix.start);
  };
  const rowKeys = [...new Set(all.map(rowKey))];
  const current = rowKeys.map((k) => {
    const ids = all.filter((c) => rowKey(c) === k);
    const live = ids.filter(started);
    return live[live.length - 1] ?? ids[0]!;
  });
  const slots = layoutClients(current);
  const slotOf = (id: string) => slots.find((s) => s.id === id);
  const viaNginx = net.nginx !== null || net.conns.some((c) => c.via !== null);

  /* --- each rack's sockets, one per client plugged into it, top to bottom in client order --- */
  const jackOf = new Map<number, Pt>();
  for (const rk of racks) {
    const here = [...latest.values()].filter((c) => rackOf(c.server)?.id === rk.id && (!many || !tabs.includes(c.client)));
    here.sort((a, b) => all.indexOf(a.client) - all.indexOf(b.client));
    const n = Math.max(1, here.length);
    here.forEach((c, j) => {
      const topZ = rk.h - Math.min(36, rk.h * 0.22) - 26;
      const z = n === 1 ? Math.min(topZ, rk.h * 0.6) : topZ - (j * (topZ - 22)) / (n - 1);
      jackOf.set(c.id, rk.front(z));
    });
  }
  const tabJack = racks[0] ? racks[0].front(racks[0].h * 0.4) : ([700, 300] as Pt);

  /** The cable of a connection: client to rack, or two legs through nginx. */
  const cablesOf = (c: WsConn): Cable[] => {
    const s = slotOf(c.client);
    const to = jackOf.get(c.id);
    if (!s || !to) return [];
    const from = s.g.jack;
    if (c.via !== null) return [{ a: from, b: gateIn, sag: 14 }, { a: gateOut, b: to, sag: 14 }];
    return [{ a: from, b: to, sag: Math.min(26, Math.abs(to[0] - from[0]) * 0.05) }];
  };
  const pathOf = (c: WsConn, toServer: boolean): Pt[] => {
    const cs = cablesOf(c);
    const pts = cs.flatMap((cb, i) => sample(cb, 0, 1, 12).slice(i === 0 ? 0 : 1));
    return toServer ? pts : [...pts].reverse();
  };
  const thin = all.length >= 3;

  /* --- motion: envelopes, frames, published messages --- */
  const moves: ReactNode[] = [];
  last.forEach((e, i) => {
    const key = `${beat}-${i}`;
    const delay = script.at[i]!;
    if (e.type === "sent" || e.type === "answered") {
      const ex = net.exchanges.find((x) => x.id === e.id);
      if (!ex || (many && tabs.includes(ex.client))) return;
      const viaGate = ex.port === 80 && net.nginx !== null;
      const upstream = ex.client === "nginx";
      const client = upstream ? net.exchanges.find((x) => x.id === ex.proxyFor)?.client : ex.client;
      const s = client ? slotOf(client) : undefined;
      const conn = net.conns.find((c) => c.exchange === (upstream ? ex.proxyFor : ex.id));
      const server = conn ? rackOf(conn.server) : racks.find((rk) => rk.id.startsWith("proc:") && net.procs.find((p) => `proc:${p.pid}` === rk.id)?.ports.includes(ex.port)) ?? racks[0];
      const rackPt = conn ? jackOf.get(conn.id) : server?.front(server.h * 0.62);
      if (!s || !rackPt) return;
      const route: Pt[] = upstream ? [gateOut, rackPt] : viaGate ? [s.g.jack, gateIn] : [s.g.jack, rackPt];
      const path = e.type === "sent" ? legs(route) : legs([...route].reverse());
      if (e.type === "sent") {
        const up = header(ex.headers, "upgrade");
        const origin = showOrigin ? header(ex.headers, "origin") : undefined;
        moves.push(
          <PathMover key={key} path={path} delay={delay} duration={T.trip}>
            <Letter
              tone="ask"
              label={clip(`${ex.method} ${ex.target}`, 18)}
              sub={origin ? `Origin: ${origin.replace(/^https?:\/\//, "")}` : undefined}
              stamp={{ text: "Upgrade", ok: up?.toLowerCase() === "websocket" }}
              labelAbove
            />
          </PathMover>,
        );
      } else {
        moves.push(
          <PathMover key={key} path={path} delay={delay} duration={T.trip}>
            <Letter tone={e.status === 101 ? "ok" : "bad"} label={`${e.status}${e.status === 101 ? "" : ` ${ex.statusText}`}`} labelAbove />
          </PathMover>,
        );
      }
    }
    if (e.type === "frame") {
      const c = net.conns.find((x) => x.id === e.conn);
      if (!c || !slotOf(c.client) || !jackOf.has(c.id)) return;
      const toServer = e.dir === "out";
      const path = pathOf(c, toServer);
      // Frames that cannot get through (a cut cable, a phone with no network) stop where it is cut; see `held` below.
      if (e.held) return;
      // To a slow reader the frame goes into the queue at the socket; it leaves when the reader takes it (`message`).
      const queued = !toServer && c.readRate !== null && showQueues;
      moves.push(
        <PathMover key={key} path={queued ? path.slice(0, 3) : path} delay={delay} duration={queued ? 0.25 : T.frame}>
          <Bubble label={frameLabel(e)} fill={frameFill(e.opcode)} out={toServer} small={thin || e.opcode === OP.ping || e.opcode === OP.pong} />
        </PathMover>,
      );
    }
    if (e.type === "message" && e.dir === "in" && showQueues) {
      const c = net.conns.find((x) => x.id === e.conn);
      if (!c || c.readRate === null || !slotOf(c.client) || !jackOf.has(c.id)) return;
      moves.push(
        <PathMover key={key} path={pathOf(c, false).slice(2)} delay={Math.max(0, delay - T.frame)} duration={T.frame}>
          <Bubble label={frameLabel({ type: "frame", conn: c.id, dir: "in", text: e.text, opcode: e.binary ? OP.binary : OP.text, fin: true, size: c.msgs.find((m) => m.dir === "in" && m.text === e.text)?.size ?? e.text.length })} fill="var(--mint)" small />
        </PathMover>,
      );
    }
    if (e.type === "published" && redisOn && e.from !== null) {
      const from = rackOf(`proc:${e.from}`);
      const [rx, ry] = REDIS.p(0, REDIS.d / 2, REDIS.h * 0.55);
      const hub: Pt = [rx - 2, ry];
      for (const pid of e.to) {
        const to = rackOf(`proc:${pid}`);
        if (!from || !to) continue;
        moves.push(
          <PathMover key={`${key}-${pid}`} path={legs(from === to ? [from.side, hub] : [from.side, hub, to.side], 8)} delay={delay} duration={T.trip * 1.4}>
            <Bubble label="publish" fill="var(--coral-soft)" small />
          </PathMover>,
        );
      }
    }
  });

  /* --- cables as they are now --- */
  const cables: ReactNode[] = [];
  const notes: ReactNode[] = [];
  /** Pills naming what happened to each cable; placed together at the end so none sits on another. */
  const tags: Tag[] = [];
  for (const c of latest.values()) {
    if (many && tabs.includes(c.client)) continue;
    const cs = cablesOf(c);
    if (!cs.length || !opened(c)) continue;
    const cEnd = ended(c, "client");
    const sEnd = ended(c, "server");
    const lastClose = Math.max(c.closedAt ?? -1, c.serverClosedAt ?? -1);
    if (cEnd && sEnd && now - lastClose > 120_000) continue;
    // a newer, refused handshake says more than an old closed cable
    const newer = net.exchanges.some((x) => x.client === c.client && x.kind === "upgrade" && x.id > c.exchange && x.status !== null && x.status !== 101);
    if (cEnd && sEnd && newer) continue;
    const freshOpen = openIdx.has(c.id) && script.at[openIdx.get(c.id)!]! > r - T.grow - 0.05;
    const freshClose = (closeIdx.has(`${c.id}:client`) || closeIdx.has(`${c.id}:server`)) && r !== Infinity;
    const code = c.serverCode ?? c.closeCode;
    const codeText = code !== null ? `${code} ${CLOSE_NAME[code] ?? ""}`.trim() : undefined;
    const key = `c${c.id}`;
    const isBlocked = blocked.has(c.port) || blocked.has(c.upstream) || net.down.includes(c.client);
    cs.forEach((cb, k) => {
      const plugs = cs.length === 2 ? (k === 0 ? "a" : "b") : "both";
      if (!cEnd && !sEnd) {
        cables.push(<OpenCable key={`${key}-${k}-open`} c={cb} kind="ws" thin={thin} grow={freshOpen ? 0 : null} plugs={cs.length === 2 ? "both" : plugs} />);
      } else if (cEnd && sEnd) {
        cables.push(<CutCable key={`${key}-${k}-cut`} c={cb} kind="ws" thin={thin} fresh={freshClose} unplug />);
        if (k === cs.length - 1 && codeText) {
          const [mx, my] = at(cb, 0.5);
          tags.push({ x: mx, y: my - 26, text: codeText, tone: code === 1000 || code === 1001 ? "plain" : "danger" });
        }
      } else {
        // one end let go: the cable is dead on that end's side
        const gone = sEnd ? "b" : "a";
        const which = cs.length === 2 ? (gone === "b" ? 1 : 0) : 0;
        if (k === which) {
          cables.push(<HalfCable key={`${key}-${k}-half`} c={cb} gone={gone} thin={thin} />);
          const [tx, ty] = at(cb, gone === "b" ? 0.74 : 0.26);
          tags.push({ x: tx, y: ty - 26, text: codeText ? `${codeText} · ${labels.halfOpen}` : labels.halfOpen, tone: "warn" });
        }
        else cables.push(<OpenCable key={`${key}-${k}-open`} c={cb} kind="ws" thin={thin} grow={null} />);
      }
    });
    if (isBlocked && !cEnd) {
      const cb = cs[cs.length - 1]!;
      const [mx, my] = sample(cb, 0.5, 0.5, 1)[0]!;
      notes.push(
        <g key={`${key}-blocked`} transform={`translate(${mx.toFixed(1)} ${my.toFixed(1)})`}>
          <circle r={12} className="ps-cut-dot" />
          <path d="M-5 -5 L5 5 M5 -5 L-5 5" className="ps-cut-x is-small" />
        </g>,
      );
      // frames sent into the cut pile up there
      const held = last.flatMap((e, i) => (e.type === "frame" && e.conn === c.id && e.held && happened(i) ? [e] : []));
      held.slice(-4).forEach((e, j) => {
        notes.push(
          <g key={`${key}-held-${j}`} transform={`translate(${(mx + (e.dir === "out" ? -26 : 26) + (j % 2) * 6).toFixed(1)} ${(my + 40 + j * 15).toFixed(1)})`}>
            <Bubble label={frameLabel(e)} fill={frameFill(e.opcode)} small />
          </g>,
        );
      });
    }
    if (showQueues && c.readRate !== null && !sEnd) {
      const jack = jackOf.get(c.id)!;
      const frames = c.frames.filter((f) => f.dir === "in");
      let waiting = 0;
      c.queue.forEach((q, j) => {
        const f = frames[j];
        if ((f ? f.at <= now : true) && q.at > now) waiting += q.wire;
      });
      notes.push(<QueueBin key={`${key}-bin`} at={[jack[0] - 92, jack[1] + 40]} bytes={waiting} label={labels.queue(Math.round(waiting / 1024))} />);
    }
  }

  /* --- a handshake refused after the client's last connection: the envelope stays at the door --- */
  const refused = new Map<string, { status: number; text: string; origin?: string }>();
  for (const sl of slots) {
    const ex = [...net.exchanges].reverse().find((x) => x.client === sl.id && x.kind === "upgrade");
    const c = latest.get(sl.id);
    if (!ex || ex.status === null || ex.status === 101 || (c && c.exchange >= ex.id)) continue;
    const i = last.findIndex((e) => e.type === "answered" && e.id === ex.id);
    if (i >= 0 && !happened(i)) continue;
    refused.set(sl.id, { status: ex.status, text: ex.statusText, origin: showOrigin ? header(ex.headers, "origin")?.replace(/^https?:\/\//, "") : undefined });
  }
  for (const [id, f] of refused) {
    const sl = slotOf(id)!;
    const rk = racks[0];
    if (!rk) continue;
    const door = rk.front(rk.h * 0.35);
    const [ax, ay] = [sl.g.jack[0] + (door[0] - sl.g.jack[0]) * 0.72, sl.g.jack[1] + (door[1] - sl.g.jack[1]) * 0.72];
    notes.push(
      <g key={`refused-${id}`} transform={`translate(${ax.toFixed(1)} ${ay.toFixed(1)})`}>
        <Letter tone="bad" label={`${f.status} ${f.text}`} sub={f.origin ? `Origin: ${f.origin}` : undefined} labelAbove />
      </g>,
    );
  }

  /* --- room rings: the room the server said each client joined --- */
  const roomOf = (c: WsConn | undefined): string | null => {
    if (!c || !rooms) return null;
    let room: string | null = null;
    const mine = msgIdx.get(`${c.id}:in`) ?? [];
    const ins = c.msgs.filter((m) => m.dir === "in");
    const shown = ins.length - mine.filter((i) => !happened(i)).length;
    for (const m of ins.slice(0, shown)) {
      try {
        const j = JSON.parse(m.text) as { type?: string; room?: string };
        if (j.type === "joined" && j.room) room = j.room;
      } catch {
        /* not JSON */
      }
    }
    return room;
  };
  const ROOM_TINT: Record<string, Tint> = { genel: TINTS.sky, ops: TINTS.coral };
  const roomTint = (room: string) => ROOM_TINT[room] ?? TINTS.lilac;

  return (
    <g className="ws-stage sock-stage">
      {/* floor under the clients and the servers */}
      {slots.map((s) => {
        const [fx, fy] = s.g.foot;
        const rx = s.g.w * 0.75 + 16;
        return <ellipse key={`fl-${s.id}`} cx={fx - 4} cy={fy - 6} rx={rx} ry={rx / 2.5} className="ps-floor" />;
      })}
      {racks.map((rk) => {
        const [fx, fy] = rk.p(rk.w / 2, rk.d / 2, 0);
        return <ellipse key={`fl-${rk.id}`} cx={fx} cy={fy + 6} rx={rk.w + 20} ry={(rk.w + 20) / 2.6} className="ps-floor" />;
      })}

      {/* Redis, and the bus each rack that uses it is wired to */}
      {redisOn && (
        <g>
          {racks
            .filter((rk) => rk.id.startsWith("proc:") && usesRedis(Number(rk.id.slice(5))) && serverAlive(rk.id))
            .map((rk) => {
              const [rx, ry] = REDIS.p(0, REDIS.d / 2, REDIS.h * 0.55);
              return <OpenCable key={`bus-${rk.id}`} c={{ a: rk.side, b: [rx - 2, ry], sag: 8 }} kind="bus" plugs="both" />;
            })}
          <Box p={REDIS.p} at={[0, 0, 0]} size={[REDIS.w, REDIS.d, REDIS.h]} shades={["var(--coral)", "#e8735c", "var(--coral-deep)"]} />
          <Pill x={REDIS.p(REDIS.w / 2, REDIS.d / 2, REDIS.h)[0] - 6} y={REDIS.p(0, 0, REDIS.h)[1] - 16} text={labels.redis} size={10} animate={false} />
        </g>
      )}

      {/* servers */}
      {racks.map((rk) => {
        const up = serverAlive(rk.id);
        const proc = rk.id.startsWith("proc:") ? net.procs.find((p) => p.pid === Number(rk.id.slice(5))) : undefined;
        const port = portOf(net, rk.id);
        const guard = showOrigin && proc && /verifyClient/.test(proc.code) && /origin/i.test(proc.code);
        const unitH = Math.min(36, rk.h * 0.22);
        return (
          <g key={rk.id}>
            <Rack
              p={rk.p}
              w={rk.w}
              d={rk.d}
              h={rk.h}
              down={!up}
              units={[
                { z: [rk.h - 8 - unitH, rk.h - 8], label: port ? `:${port}` : undefined, led: up ? "on" : "bad" },
                ...(rk.h > 100 ? [{ z: [16, rk.h - 16 - unitH] as const, grille: true }] : []),
              ]}
            />
            {guard && (
              <g transform={`translate(${rk.front(rk.h - 4)[0] + 4} ${rk.front(rk.h - 4)[1] - 18})`}>
                <path d="M0 -13 L11 -8 L11 1 C11 8 5 12 0 14 C-5 12 -11 8 -11 1 L-11 -8 Z" className="ps-shield" style={{ fill: "var(--mint)" }} />
                <path d="M-5 0 L-1 4 L6 -4" className="ps-stamp-mark" />
              </g>
            )}
            <Pill x={rk.name[0]} y={rk.name[1]} text={labels.server(rk.id)} tone={up ? "plain" : "danger"} size={10.5} animate={false} />
            {guard && <Pill x={rk.front(rk.h)[0] - 10} y={rk.front(rk.h)[1] - 40} text={labels.originCheck} tone="ok" size={10} animate={false} />}
          </g>
        );
      })}

      {/* nginx: the gateway the cables pass through */}
      {viaNginx && (
        <g>
          <Box p={GATE.p} at={[0, 0, 0]} size={[GATE.w, GATE.d, GATE.h]} shades={DARK} />
          <g transform={onFront(GATE.p, 0, GATE.d, GATE.h)}>
            <rect x={5} y={5} width={GATE.w - 10} height={GATE.h - 10} rx={2.5} className="ps-unit" />
            <circle cx={14} cy={GATE.h / 2} r={5.5} className="ps-socket" />
            <circle cx={GATE.w - 13} cy={GATE.h / 2} r={3.2} className="ps-led is-on" />
            <text x={26} y={GATE.h / 2 + 4} className="ps-gw-label">
              nginx
            </text>
          </g>
          <Pill x={GATE.p(GATE.w / 2, GATE.d, 0)[0]} y={GATE.p(GATE.w / 2, GATE.d, 0)[1] + 18} text={labels.nginx} size={10} animate={false} />
        </g>
      )}

      {/* many tabs: a grid of small browser windows, each with a thin line while connected */}
      {many && <Tabs net={net} tabs={tabs} last={last} happened={happened} opened={opened} ended={ended} jack={tabJack} tint={tint} />}

      {/* clients */}
      {slots.map((s) => {
        const c = latest.get(s.id);
        const isOpen = !!c && opened(c) && !ended(c, "client");
        const offline = net.down.includes(s.id) || (!!c && (blocked.has(c.port) || blocked.has(c.upstream)));
        const t = tint?.(s.id) ?? TINTS.sky;
        const room = roomOf(c);
        // what is on screen now: received messages (and this client's own, on the right)
        const lines: Line[] = [];
        let seq: number | null = null;
        for (const conn of net.conns.filter((x) => x.client === s.id)) {
          if (!opened(conn) && !openIdx.has(conn.id)) continue;
          const pending = {
            in: (msgIdx.get(`${conn.id}:in`) ?? []).filter((i) => !happened(i)).length,
            out: (msgIdx.get(`${conn.id}:mine`) ?? []).filter((i) => !happened(i)).length,
          };
          const ins = conn.msgs.filter((m) => m.dir === "in");
          const outs = conn.msgs.filter((m) => m.dir === "out");
          const shownIn = ins.slice(0, ins.length - pending.in);
          const shownOut = outs.slice(0, Math.max(0, outs.length - pending.out));
          const both = [...shownIn.map((m) => ({ ...m, mine: false })), ...shownOut.map((m) => ({ ...m, mine: true }))].sort((a, b) => a.at - b.at || (a.mine ? -1 : 1));
          for (const m of both) {
            // numbered lines: a jump in the numbers is a gap on the screen, and it gets said
            const n = /"seq":(\d+)/.exec(m.text);
            if (n && !m.mine) {
              const v = Number(n[1]);
              if (seq !== null && v > seq + 1) lines.push({ text: labels.missing(seq + 1, v - 1), mine: false, gap: true });
              seq = Math.max(seq ?? 0, v);
            }
            lines.push({ text: screenText(m.text, m.size), mine: m.mine });
          }
        }
        const status = !c ? labels.connecting : isOpen ? labels.open : labels.closed(c.closeCode ?? c.serverCode);
        return (
          <g key={s.id}>
            {room && <RoomRing g={s.g} tint={roomTint(room)} room={room} />}
            <Device g={s.g} dim={!isOpen && !!c && !s.term}>
              {(sw, sh) =>
                s.term ? (
                  <TermScreen sw={sw} sh={sh} title={labels.client(s.id)} status={status} open={isOpen} lines={lines} offline={offline} />
                ) : (
                  <BrowserScreen sw={sw} sh={sh} host={s.id === "evil" ? "evil.example" : "localhost:8080"} status={status} open={isOpen} lines={lines} offline={offline} tint={t} evil={s.id === "evil"} />
                )
              }
            </Device>
            <Pill x={s.name[0]} y={s.name[1]} text={labels.client(s.id)} size={10.5} animate={false} />
          </g>
        );
      })}

      {cables}
      {placeTags(tags).map((t, i) => (
        <Pill key={`tag-${i}`} x={t.x} y={t.y} text={t.text} tone={t.tone} size={10.5} animate={false} />
      ))}
      {notes}
      <AnimatePresence>{moves}</AnimatePresence>
      {overlay}
      <Pill x={430} y={30} text={labels.clock(seconds(Math.round(now / 100) * 100))} tone="ink" animate={false} />
    </g>
  );
}

/* ------------------------------------------------------------------- tags */

interface Tag {
  x: number;
  y: number;
  text: string;
  tone: "plain" | "danger" | "warn";
}

/** Pills in reading order; one that would sit on an earlier one moves down until it is clear. */
function placeTags(tags: Tag[]): Tag[] {
  const width = (t: Tag) => t.text.length * 6.3 + 22;
  const placed: Tag[] = [];
  for (const t of [...tags].sort((a, b) => a.y - b.y)) {
    let y = t.y;
    for (let guard = 0; guard < 12; guard++) {
      const hit = placed.find((p) => Math.abs(p.x - t.x) < (width(p) + width(t)) / 2 + 4 && Math.abs(p.y - y) < 24);
      if (!hit) break;
      y = hit.y + 25;
    }
    placed.push({ ...t, y });
  }
  return placed;
}

/* ---------------------------------------------------------------- screens */

interface Line {
  text: string;
  mine: boolean;
  gap?: boolean;
}

const ROW = 19;

function BrowserScreen({ sw, sh, host, status, open, lines, offline, tint, evil }: { sw: number; sh: number; host: string; status: string; open: boolean; lines: Line[]; offline: boolean; tint: Tint; evil?: boolean }) {
  const top = 34;
  const fit = Math.max(0, Math.floor((sh - top - 4) / ROW));
  // short of room, what arrived matters more than what this client sent itself
  const shown = (lines.length > fit ? lines.filter((l) => !l.mine) : lines).slice(-fit);
  const chars = Math.floor((sw - 16) / 6.4);
  return (
    <g>
      <rect x={0} y={0} width={sw} height={15} className="ps-scr-bar" />
      <rect x={4} y={3} width={sw - 24} height={10} rx={5} className="ps-urlbar" />
      <text x={(sw - 20) / 2} y={11.2} textAnchor="middle" className="ps-url" style={{ fontSize: 8.5, fill: evil ? "#b8352f" : undefined }}>
        {clip(host, Math.floor((sw - 28) / 5.2))}
      </text>
      <WifiIcon x={sw - 9} y={9} off={offline} />
      <circle cx={8} cy={25} r={3.6} className="ps-msg-dot" style={{ fill: open ? tint.body : "#c9c2cf" }} />
      <text x={15} y={28.5} className={`ps-scr-status ${open ? "is-open" : "is-closed"}`}>
        {clip(status, Math.floor((sw - 18) / 5.6))}
      </text>
      <AnimatePresence initial={false}>
        {shown.map((l, i) => {
          const tw = Math.min(sw - 10, l.text.length * 6.4 + 12);
          const x = l.mine ? sw - 5 - Math.min(tw, sw - 10) : 5;
          return (
            <motion.g key={`${lines.length - shown.length + i}-${l.text}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <rect x={x} y={top + i * ROW} width={Math.min(tw, sw - 10)} height={ROW - 3} rx={6} className={`ps-scr-msg ${l.mine ? "is-mine" : ""} ${l.gap ? "is-gap" : ""}`} />
              <text x={x + 6} y={top + i * ROW + 11.8} className={`ps-scr-text ${l.gap ? "is-gap" : ""}`}>
                {clip(l.text, chars)}
              </text>
            </motion.g>
          );
        })}
      </AnimatePresence>
    </g>
  );
}

function TermScreen({ sw, sh, title, status, open, lines, offline }: { sw: number; sh: number; title: string; status: string; open: boolean; lines: Line[]; offline: boolean }) {
  const top = 30;
  const fit = Math.max(0, Math.floor((sh - top) / 14));
  const shown = lines.slice(-fit);
  const chars = Math.floor((sw - 12) / 6.35);
  return (
    <g>
      <rect x={0} y={0} width={sw} height={sh} className="ps-term" />
      <rect x={0} y={0} width={sw} height={13} className="ps-term-bar" />
      <text x={6} y={10} className="ps-term-text is-dim" style={{ fontSize: 9 }}>
        {clip(title, Math.floor((sw - 24) / 5.5))}
      </text>
      <WifiIcon x={sw - 8} y={8} off={offline} light />
      <text x={6} y={25} className={`ps-term-text ${open ? "is-ok" : "is-bad"}`}>
        {clip(status, chars)}
      </text>
      {shown.map((l, i) => (
        <text key={`${lines.length - shown.length + i}`} x={6} y={top + 10 + i * 14} className={`ps-term-text ${l.gap ? "is-bad" : ""}`}>
          {clip(l.gap ? l.text : `${l.mine ? ">" : "<"} ${l.text}`, chars)}
        </text>
      ))}
    </g>
  );
}

function RoomRing({ g, tint, room }: { g: DeviceGeom; tint: Tint; room: string }) {
  const [fx, fy] = g.foot;
  const [jx] = g.jack;
  const cx = (fx + jx) / 2 - 10;
  return (
    <g>
      <ellipse cx={cx} cy={fy - 6} rx={jx - fx + 28} ry={(jx - fx + 28) / 2.5} className="ps-ring" style={{ stroke: tint.body }} />
      <Pill x={cx - (jx - fx) - 30} y={fy - 30} text={`#${room}`} size={10.5} tone="plain" animate={false} />
    </g>
  );
}

function QueueBin({ at: [x, y], bytes, label }: { at: Pt; bytes: number; label: string }) {
  const p = isoAt(x, y);
  const w = 38;
  const d = 32;
  const h = 60;
  const full = Math.min(1, bytes / (1024 * 1024));
  return (
    <g className="ps-bin">
      <Box p={p} at={[0, 0, 0]} size={[w, d, h]} shades={["#efeaf2", "#d8d2dc", "#c9c2cf"]} />
      {full > 0 && (
        <g transform={onFront(p, 0, d, h)}>
          <rect x={4} y={4 + (h - 8) * (1 - full)} width={w - 8} height={(h - 8) * full} className={`ps-bin-level ${full > 0.5 ? "is-high" : ""}`} />
        </g>
      )}
      <Pill x={p(w / 2, d, 0)[0]} y={p(w / 2, d, 0)[1] + 16} text={label} tone={full > 0.5 ? "danger" : "sun"} size={10} animate={false} />
    </g>
  );
}

/* ------------------------------------------------------------------- tabs */

function Tabs({
  net,
  tabs,
  last,
  happened,
  opened,
  ended,
  jack,
  tint,
}: {
  net: Net;
  tabs: string[];
  last: NetEvent[];
  happened: (i: number) => boolean;
  opened: (c: WsConn) => boolean;
  ended: (c: WsConn, side: "client" | "server") => boolean;
  jack: Pt;
  tint?: (client: string) => Tint;
}) {
  // One window per tab number; a tab restarted takes its old window.
  const bySlot = new Map<string, string>();
  for (const id of tabs) {
    const p = net.procs.find((x) => `proc:${x.pid}` === id);
    const slot = p?.env.TAB ?? id;
    bySlot.set(slot, id);
  }
  const slots = [...bySlot.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  const cols = 4;
  const failedNow = new Map<string, number>();
  last.forEach((e, i) => {
    if (e.type === "wsFailed" && happened(i)) failedNow.set(e.client, i);
  });
  const recent = (client: string) => {
    const i = failedNow.get(client);
    return i !== undefined;
  };
  return (
    <g>
      {slots.map(([slot, id], k) => {
        const col = k % cols;
        const row = Math.floor(k / cols);
        const x = 60 + col * 64;
        const y = 120 + row * 78;
        const c = [...net.conns].reverse().find((x) => x.client === id && opened(x));
        const up = !!c && !ended(c, "client");
        const t = tint?.(id) ?? TINTS.mint;
        const p = isoAt(x + 4, y - 2);
        const [jx, jy] = p(40, 2, 18);
        const from: Pt = [jx + 3, jy];
        return (
          <g key={slot}>
            <ellipse cx={x + 22} cy={y + 16} rx={30} ry={11} className="ps-floor" />
            <Box p={p} at={[0, 0, 0]} size={[40, 4, 30]} shades={SHELL} />
            <g transform={onFront(p, 0, 4, 30)}>
              <rect x={3} y={3} width={34} height={24} rx={3} className="ps-tab" style={{ fill: up ? t.body : "#e9e5ec" }} />
              <rect x={3} y={3} width={34} height={6} rx={2} className="ps-tab-bar" />
              <text x={20} y={22} textAnchor="middle" className="ps-scr-text" style={{ fontSize: 10.5 }}>
                {slot}
              </text>
            </g>
            {up && <path d={lineD(sample({ a: from, b: jack, sag: 10 }, 0, 1, 12))} className="ps-thin" />}
            {!up && recent(id) && (
              <g transform={`translate(${x + 40} ${y - 10})`}>
                <circle r={9} className="ps-cut-dot" />
                <text y={3} textAnchor="middle" className="ps-tab-503">
                  503
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
