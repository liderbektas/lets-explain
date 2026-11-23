import { useEffect, useState } from "react";
import { EVENT_AT, type Net, type NetEvent } from "../engine/net";

/**
 * When, within one action on screen, each of its events shows. An action that lets time pass
 * (wait 30 s) plays its events at their real model times, squeezed into a few seconds, with the
 * clock running along. An action that takes no time plays them in cause-and-effect order: the
 * request goes, the answer comes back, the cable plugs in, a frame crosses, what it set off follows.
 */

/** Seconds for one leg of each kind of motion. */
export const T = { trip: 0.5, grow: 0.35, frame: 0.6, step: 0.15, fragment: 0.22 };

export interface Script {
  /** Seconds into the action at which each event of `last` happens on screen. */
  at: number[];
  /** Seconds until the last motion settles. */
  total: number;
  t0: number;
  t1: number;
  timed: boolean;
  /** Model time `r` seconds into the action. */
  sim: (r: number) => number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * `final`: this is the step's last action, so it may take as long as it needs; an action with
 * more to follow has to settle before the next one starts.
 */
export function buildScript(net: Net, last: NetEvent[], final: boolean): Script {
  const t1 = net.now;
  const time = last.find((e): e is Extract<NetEvent, { type: "time" }> => e.type === "time");
  const t0 = time ? time.from : t1;
  if (t1 > t0) {
    const span = t1 - t0;
    const play = final ? clamp((span / 1000) * 0.1, 1.6, 5.5) : 1.2;
    const at = last.map((e) => clamp((((EVENT_AT.get(e) ?? t0) - t0) / span) * play, 0, play));
    return { at, total: play + T.frame, t0, t1, timed: true, sim: (r) => t0 + span * clamp(r / play, 0, 1) };
  }

  const at: number[] = [];
  let s = 0;
  let group: { dir: string; start: number; end: number; per: Map<number, number> } | null = null;
  const arrive = new Map<number, number>();
  const closeGroup = () => {
    if (group) s = Math.max(s, group.end);
    group = null;
  };
  for (const e of last) {
    if (e.type === "frame") {
      const g: { dir: string; start: number; end: number; per: Map<number, number> } =
        group && group.dir === e.dir ? group : (closeGroup(), (group = { dir: e.dir, start: s, end: s, per: new Map() }));
      const k = g.per.get(e.conn) ?? 0;
      g.per.set(e.conn, k + 1);
      const when = g.start + k * T.fragment;
      at.push(when);
      g.end = Math.max(g.end, when + T.frame);
      arrive.set(e.conn, when + T.frame);
      continue;
    }
    if (e.type === "message") {
      at.push(arrive.get(e.conn) ?? s);
      continue;
    }
    if (e.type === "time" || e.type === "procLog" || e.type === "note" || e.type === "captured") {
      at.push(s);
      continue;
    }
    closeGroup();
    at.push(s);
    if (e.type === "sent" || e.type === "answered") s += T.trip;
    else if (e.type === "wsOpened") s += T.grow;
    else if (e.type === "published") s += T.trip;
    else if (e.type.startsWith("proc") || e.type === "wsClosed" || e.type === "blocked") s += T.step;
  }
  closeGroup();
  const raw = s;
  const budget = final ? 3.2 : 1.45;
  const k = raw > budget ? budget / raw : 1;
  return { at: at.map((v) => v * k), total: raw * k + 0.2, t0, t1, timed: false, sim: () => t1 };
}

/**
 * Seconds since this action began showing, ticking until `total`; then Infinity (all done).
 * A new `key` starts it again from 0.
 */
export function useActionClock(key: string, total: number): number {
  const [state, setState] = useState({ key, r: 0 });
  useEffect(() => {
    if (total <= 0) {
      setState({ key, r: Infinity });
      return;
    }
    let raf = 0;
    let shown = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const r = (now - start) / 1000;
      if (r >= total) {
        setState({ key, r: Infinity });
        return;
      }
      if (now - shown > 40) {
        shown = now;
        setState({ key, r });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, total]);
  return state.key === key ? state.r : 0;
}
