import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Pill } from "@lets-explain/core/iso/shapes";
import { acceptFor } from "../engine/bytes";
import { header, type Exchange } from "../engine/net";
import { Box, clip, DARK, Device, deviceGeom, isoAt, Letter, legs, OpenCable, onFront, PathMover, type Pt, Rack, WifiIcon } from "./kit";

/**
 * The handshake, read line by line. Above: the request and the response as the text they are on
 * the wire. Below: the client (a phone running the browser, or a laptop running curl) and the
 * server's rack, with a dashed lane between them. The request is an envelope stamped with its
 * Upgrade header; the answer comes back the same way; only a 101 the client accepts plugs the
 * WebSocket cable in. With a gateway (nginx) in between, each hop is its own envelope, and what
 * nginx sends on is what the server sees.
 */

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
    { text: `${ex.method} ${ex.target} HTTP/${ex.httpVersion}`, tone: "plain" },
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

export interface HandshakeLabels {
  request: string;
  response: string;
  client: string;
  server: string;
  waiting: string;
  dropped: string;
  /** On the phone's screen once the WebSocket is open, or when it turned the answer down. */
  opened: string;
  refused: string;
  /** Under an answer whose accept is (or is not) the one the key calls for. */
  acceptOk: string;
  acceptBad: string;
  /** The gateway's name, when there is one. */
  gateway?: string;
}

/* the row of things under the cards */
const RACK = { p: isoAt(742, 428), w: 74, d: 56, h: 126 };
const rackJack: Pt = (() => {
  const [x, y] = RACK.p(14, RACK.d, 62);
  return [x - 6, y];
})();
const GATE = { p: isoAt(452, 418), w: 70, d: 56, h: 30 };
const gateIn: Pt = (() => {
  const [x, y] = GATE.p(12, GATE.d, 15);
  return [x - 4, y];
})();
const gateOut: Pt = (() => {
  const [x, y] = GATE.p(GATE.w, GATE.d / 2, 15);
  return [x + 4, y];
})();

const upgradeStamp = (ex: Exchange) => ({ text: "Upgrade", ok: (header(ex.headers, "upgrade") ?? "").toLowerCase() === "websocket" });
const short = (s: string, n: number) => clip(s, n);

export function HandshakeStage({
  ex,
  up,
  cards: cardsOf,
  beat,
  labels,
  verdict,
  device,
  showKey = false,
}: {
  /** The client's exchange. */
  ex: Exchange | undefined;
  /** What the gateway sent on for it, when there is a gateway. */
  up?: Exchange;
  /** Which of the two goes on the cards (default: the client's). */
  cards?: Exchange;
  beat: number;
  labels: HandshakeLabels;
  /** What the client made of the answer, shown over it (e.g. a refused accept). */
  verdict?: { text: string; ok: boolean };
  device: "phone" | "laptop" | "monitor";
  /** Write the key on the request envelope and the accept on the answer. */
  showKey?: boolean;
}) {
  const shown = cardsOf ?? ex;
  const cards = exchangeCards(shown);
  const tone = cards.status === 101 ? "ok" : cards.status === null ? "plain" : "bad";
  const gw = !!labels.gateway;
  const g =
    device === "phone" ? deviceGeom("phone", 64, 500, 84, 138) : device === "monitor" ? deviceGeom("monitor", 60, 478, 116, 80) : deviceGeom("laptop", 96, 486, 140, 80);
  const jack = g.jack;
  const accepted = ex?.status === 101 && !(verdict && !verdict.ok);
  const status = ex?.status ?? null;

  // the hops and when each envelope goes
  const hops: { from: Pt; to: Pt; letter: ReactNode; at: number }[] = [];
  if (ex) {
    const key = showKey ? header(ex.headers, "sec-websocket-key") : undefined;
    const ask = (x: Exchange, k?: string) => <Letter tone="ask" label={short(`${x.method} ${x.target}`, 16)} sub={k ? `Key: ${short(k, 14)}` : undefined} stamp={upgradeStamp(x)} labelAbove />;
    const answer = (x: Exchange) => {
      const acc = showKey ? header(x.respHeaders, "sec-websocket-accept") : undefined;
      const k = header(x.headers, "sec-websocket-key");
      const right = acc && k ? acc === acceptFor(k) : null;
      return (
        <g>
          <Letter tone={x.status === 101 ? "ok" : "bad"} label={short(`${x.status} ${x.statusText}`, 24)} sub={acc ? `Accept: ${short(acc, 14)}` : undefined} labelAbove />
          {right !== null && <Pill x={0} y={30} text={right ? labels.acceptOk : labels.acceptBad} tone={right ? "ok" : "danger"} size={10} animate={false} />}
        </g>
      );
    };
    if (gw && up) {
      hops.push({ from: jack, to: gateIn, letter: ask(ex), at: 0 });
      hops.push({ from: gateOut, to: rackJack, letter: ask(up), at: 0.55 });
      if (up.status !== null) hops.push({ from: rackJack, to: gateOut, letter: answer(up), at: 1.1 });
      if (ex.status !== null) hops.push({ from: gateIn, to: jack, letter: answer(ex), at: 1.65 });
    } else {
      hops.push({ from: jack, to: gw ? gateIn : rackJack, letter: ask(ex, key), at: 0 });
      if (ex.status !== null) hops.push({ from: gw ? gateIn : rackJack, to: jack, letter: answer(ex), at: 0.75 });
    }
  }
  const lastAt = hops.length ? hops[hops.length - 1]!.at + 0.55 : 0;
  // envelopes that arrive at the same place stack up, so their labels don't sit on each other
  // an envelope stops on the lane a little short of where it was going, so the next one has room
  const dock = (from: Pt, to: Pt): Pt => {
    const k = to === jack || to === gateOut ? 0.72 : 0.78;
    return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k - 4];
  };
  const cableTo = gw ? gateIn : rackJack;

  return (
    <g className="ws-stage">
      {/* cards */}
      {shown && (
        <motion.g key={`req-${beat}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <HttpCard x={24} y={20} w={400} title={labels.request} lines={cards.request} tone="ask" />
        </motion.g>
      )}
      {shown && (
        <motion.g key={`res-${beat}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: gw ? 1.2 : 0.8 }}>
          {cards.dropped ? (
            <Pill x={640} y={120} text={labels.dropped} tone="danger" animate={false} />
          ) : cards.status !== null ? (
            <HttpCard x={440} y={20} w={400} title={labels.response} lines={cards.response} tone={tone} />
          ) : null}
        </motion.g>
      )}

      {/* the floor row: client, lane, (gateway), rack */}
      <ellipse cx={g.foot[0] - 4} cy={g.foot[1] - 6} rx={84} ry={30} className="ps-floor" />
      <ellipse cx={RACK.p(35, 28, 0)[0]} cy={RACK.p(35, 28, 0)[1] + 6} rx={84} ry={30} className="ps-floor" />
      <line x1={jack[0] + 6} y1={jack[1]} x2={(gw ? gateIn : rackJack)[0] - 6} y2={(gw ? gateIn : rackJack)[1]} className="ps-lane" />
      {gw && <line x1={gateOut[0] + 6} y1={gateOut[1]} x2={rackJack[0] - 6} y2={rackJack[1]} className="ps-lane" />}
      <Rack p={RACK.p} w={RACK.w} d={RACK.d} h={RACK.h} units={[{ z: [86, 110], led: "on" }, { z: [12, 78], grille: true }]} />
      <Pill x={RACK.p(35, RACK.d, 0)[0] - 4} y={RACK.p(35, RACK.d, 0)[1] + 18} text={labels.server} size={10.5} animate={false} />
      {gw && (
        <g>
          <ellipse cx={GATE.p(35, 28, 0)[0]} cy={GATE.p(35, 28, 0)[1] + 4} rx={70} ry={24} className="ps-floor" />
          <Box p={GATE.p} at={[0, 0, 0]} size={[GATE.w, GATE.d, GATE.h]} shades={DARK} />
          <g transform={onFront(GATE.p, 0, GATE.d, GATE.h)}>
            <rect x={5} y={5} width={GATE.w - 10} height={GATE.h - 10} rx={2.5} className="ps-unit" />
            <circle cx={GATE.w - 12} cy={GATE.h / 2} r={3.2} className="ps-led is-on" />
            <text x={24} y={GATE.h / 2 + 4} className="ps-gw-label">
              nginx
            </text>
          </g>
          <Pill x={GATE.p(35, GATE.d, 0)[0]} y={GATE.p(35, GATE.d, 0)[1] + 18} text={labels.gateway!} size={10.5} animate={false} />
        </g>
      )}
      <Device g={g}>
        {(sw, sh) =>
          device !== "laptop" ? (
            <g>
              <rect x={0} y={0} width={sw} height={14} className="ps-scr-bar" />
              <WifiIcon x={sw - 8} y={8} off={false} />
              <rect x={4} y={3} width={sw - 22} height={9} rx={4.5} className="ps-urlbar" />
              <text x={8} y={30} className="ps-scr-text" style={{ fontSize: 10 }}>
                {clip(`ws://${header(ex?.headers ?? [], "host") ?? "localhost"}${ex?.target ?? "/"}`, Math.floor((sw - 10) / 6))}
              </text>
              {status !== null && (
                <motion.g key={`scr-${beat}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: lastAt }}>
                  <rect x={4} y={40} width={sw - 8} height={36} rx={7} className={`ps-scr-msg ${accepted ? "" : "is-gap"}`} />
                  <text x={10} y={54} className={`ps-scr-text ${accepted ? "" : "is-gap"}`}>
                    {accepted ? "WebSocket" : `${status}`}
                  </text>
                  <text x={10} y={69} className={`ps-scr-text ${accepted ? "" : "is-gap"}`} style={{ fontWeight: 600 }}>
                    {accepted ? labels.opened : clip(verdict && !verdict.ok ? labels.refused : (ex?.statusText ?? ""), Math.floor((sw - 18) / 6.4))}
                  </text>
                </motion.g>
              )}
            </g>
          ) : (
            <g>
              <rect x={0} y={0} width={sw} height={sh} className="ps-term" />
              <text x={6} y={14} className="ps-term-text is-dim">
                $ curl -i …
              </text>
              {ex && (
                <motion.g key={`scr-${beat}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: lastAt }}>
                  <text x={6} y={30} className={`ps-term-text ${status === 101 ? "is-ok" : "is-bad"}`}>
                    {status !== null ? clip(`HTTP/1.1 ${status} ${ex.statusText}`, Math.floor((sw - 12) / 6.35)) : ex.end === "dropped" ? "(52) Empty reply" : "…"}
                  </text>
                </motion.g>
              )}
            </g>
          )
        }
      </Device>
      <Pill x={Math.max(62, g.foot[0] - (device === "monitor" ? 30 : 52))} y={g.foot[1] + (device === "monitor" ? 14 : -2)} text={labels.client} size={10.5} animate={false} />

      {/* the envelopes: each goes, then stays where it arrived */}
      {hops.map((h, i) => (
        <PathMover key={`${beat}-${ex?.id}-${i}`} path={legs([h.from, dock(h.from, h.to)], 10)} delay={h.at} duration={0.5} stay>
          {h.letter}
        </PathMover>
      ))}
      {ex && cards.dropped && (
        <motion.g key={`drop-${beat}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} transform={`translate(${rackJack[0] - 34} ${rackJack[1] - 4})`}>
          <path d="M-8 -8 L8 8 M8 -8 L-8 8" className="ps-cut-x" transform="translate(0 30)" />
        </motion.g>
      )}

      {/* a 101 the client accepts: the cable plugs in */}
      {accepted && (
        <g key={`ws-${beat}-${ex?.id}`}>
          <OpenCable c={{ a: [jack[0], jack[1] + 30], b: [cableTo[0], cableTo[1] + 30], sag: 8 }} kind="ws" thin grow={lastAt + 0.1} />
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: lastAt + 0.4 }}>
            <Pill x={(jack[0] + cableTo[0]) / 2} y={(jack[1] + cableTo[1]) / 2 + 62} text="WebSocket" tone="ok" size={11} animate={false} />
          </motion.g>
        </g>
      )}
      {verdict && (
        <motion.g key={`verdict-${beat}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: lastAt + 0.1 }}>
          <Pill x={330} y={350} text={verdict.text} tone={verdict.ok ? "ok" : "danger"} size={11} animate={false} />
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

/** The accept recipe as a column of real values: key, GUID, SHA-1 bytes, base64, worked by the server. */
export function AcceptStage({ rows, beat, machine }: { rows: AcceptRow[]; beat: number; machine: string }) {
  const p = isoAt(92, 300);
  return (
    <g className="ws-stage accept-stage">
      <ellipse cx={p(36, 30, 0)[0]} cy={p(36, 30, 0)[1] + 6} rx={74} ry={28} className="ps-floor" />
      <Rack p={p} w={64} d={56} h={120} units={[{ z: [84, 110], led: "on" }, { z: [12, 76], grille: true }]} />
      <text x={p(32, 56, 0)[0]} y={p(32, 56, 0)[1] + 24} textAnchor="middle" className="machine-label">
        {machine}
      </text>
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
