import type { ReactNode } from "react";
import type { Metric } from "@lets-explain/core/components/SceneFrame";
import { l, type L } from "@lets-explain/core/i18n";
import { TINTS } from "@lets-explain/core/iso/shapes";
import type { Net, NetAction, WsFrame } from "../../engine/net";
import { FrameView, type FrameViewLabels } from "../../iso/FrameView";
import { SocketStage, type SocketStageLabels } from "../../iso/SocketStage";
import type { ViewInfo } from "./NetScene";

/** A named client somewhere on the network (a phone, a second tab) opening a WebSocket. */
export const remote = (client: string, port: number, target = "/", extra: { readRate?: number; origin?: string; reconnect?: number } = {}): NetAction => ({
  type: "wsOpen",
  client,
  port,
  target,
  headers: [
    ["Host", port === 80 ? "localhost" : `localhost:${port}`],
    ["Connection", "Upgrade"],
    ["Upgrade", "websocket"],
    ["Sec-WebSocket-Version", "13"],
    ...(extra.origin ? ([["Origin", extra.origin]] as [string, string][]) : []),
  ],
  ...(extra.readRate ? { readRate: extra.readRate } : {}),
  ...(extra.reconnect !== undefined ? { reconnect: extra.reconnect } : {}),
});

export const send = (client: string, text: string, binary = false): NetAction => ({ type: "wsSend", client, text, ...(binary ? { binary } : {}) });
export const close = (client: string, code: number | null, reason = ""): NetAction => ({ type: "wsClose", client, code, reason });
export const wait = (ms: number): NetAction => ({ type: "advance", ms });
export const run = (file: string, env?: Record<string, string>): NetAction => ({ type: "node", file, ...(env ? { env } : {}) });
export const write = (path: string, text: string): NetAction => ({ type: "write", path, text });

const NAMES: Record<string, L> = {
  you: l("wscat (sen)", "wscat (you)"),
  browser: l("Tarayıcı", "Browser"),
  phone: l("Telefon", "Phone"),
  laptop: l("Dizüstü", "Laptop"),
  tablet: l("Tablet", "Tablet"),
  evil: l("evil.example", "evil.example"),
};

/** Labels for the socket stage: a process is named by its file, and its pid when it runs twice. */
export function socketLabels(net: Net, t: (x: L) => string, lang: "tr" | "en"): SocketStageLabels {
  const procName = (pid: number) => {
    const p = net.procs.find((x) => x.pid === pid);
    if (!p) return `pid ${pid}`;
    // Number copies of one file only while several run at once; a restart keeps the plain name.
    const same = net.procs.filter((x) => x.file === p.file && x.alive === p.alive);
    return p.alive && same.length > 1 ? `${p.file} #${same.indexOf(p) + 1}` : p.file;
  };
  return {
    client: (id) => (NAMES[id] ? t(NAMES[id]!) : id.startsWith("proc:") ? procName(Number(id.slice(5))) : id),
    server: (id) => {
      if (id === "chat") return ":8081 chat";
      const pid = Number(id.slice(5));
      const p = net.procs.find((x) => x.pid === pid);
      return `${p?.ports[0] ?? p?.env.PORT ? `:${p?.ports[0] ?? p?.env.PORT} ` : ""}${procName(pid)}`;
    },
    nginx: "nginx :80",
    redis: "redis :6379",
    clock: (s) => (lang === "tr" ? `saat ${s} sn` : `clock ${s} s`),
    halfOpen: t(l("yarı açık", "half open")),
  };
}

export const TINT_OF: Record<string, (typeof TINTS)[keyof typeof TINTS]> = {
  you: TINTS.lilac,
  browser: TINTS.sky,
  phone: TINTS.coral,
  laptop: TINTS.sun,
  evil: TINTS.grey,
};

export function socketView(net: Net, info: ViewInfo, extra: { clients?: string[]; showQueues?: boolean } = {}) {
  return (
    <SocketStage
      net={net}
      last={info.last}
      beat={info.beat}
      labels={socketLabels(net, info.t, info.lang)}
      clients={extra.clients}
      tint={(c) => TINT_OF[c] ?? (c.startsWith("proc:") ? TINTS.mint : TINTS.sky)}
      showQueues={extra.showQueues}
    />
  );
}

export function frameLabels(t: (x: L) => string): FrameViewLabels {
  return {
    title: t(l("Kablodaki frame", "The frame on the wire")),
    header: t(l("başlık", "header")),
    fin: t(l("son parça mı?", "last fragment?")),
    opcode: t(l("ne taşıyor", "what it carries")),
    mask: t(l("istemciden mi (maskeli mi)?", "from a client (masked)?")),
    length: t(l("uzunluk alanı", "length field")),
    ext: t(l("uzatılmış uzunluk", "extended length")),
    key: t(l("maske anahtarı", "masking key")),
    payload: t(l("veri", "payload")),
    unmasked: t(l("maske çözülünce", "unmasked")),
    total: (n) => t(l(`${n} bayt`, `${n} bytes`)),
    more: (n) => t(l(`… ve ${n} bayt daha`, `… and ${n} more bytes`)),
  };
}

/** The newest frame that matches, for a frame-by-frame view. */
export const lastFrame = (net: Net, pick: (f: WsFrame) => boolean): WsFrame | undefined => {
  for (let i = net.conns.length - 1; i >= 0; i--) {
    const c = net.conns[i]!;
    for (let j = c.frames.length - 1; j >= 0; j--) if (pick(c.frames[j]!)) return c.frames[j];
  }
  return undefined;
};

export function frameView(frame: WsFrame | undefined, info: ViewInfo, fallback: () => ReactNode) {
  return frame ? <FrameView frame={frame} beat={info.beat} labels={frameLabels(info.t)} /> : fallback();
}

/** Counters for socket lessons: open connections on the server side, and frames so far. */
export function socketMetrics(net: Net, t: (x: L) => string, from: Net): Metric[] {
  const open = net.conns.filter((c) => c.serverClosedAt === null).length;
  const frames = net.conns.reduce((n, c) => n + c.frames.length, 0) - from.conns.reduce((n, c) => n + c.frames.length, 0);
  const lastClose = [...net.conns].reverse().find((c) => c.closeCode !== null || c.serverCode !== null);
  return [
    { label: t(l("Sunucuda açık", "Open on the server")), value: open, tone: open ? "ok" : "plain" },
    { label: t(l("Frame", "Frames")), value: Math.max(0, frames) },
    { label: t(l("Son kapanış", "Last close")), value: lastClose ? String(lastClose.serverCode ?? lastClose.closeCode) : "—", tone: lastClose && (lastClose.serverCode ?? lastClose.closeCode) === 1006 ? "danger" : "plain" },
  ];
}
