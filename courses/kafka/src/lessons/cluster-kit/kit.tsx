import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { useTypedSandbox, type CommandLine } from "@lets-explain/core/components/TypedSandbox";
import { leaderLog, type REvent, type RState } from "../../engine/replication";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import type { L } from "@lets-explain/core/i18n";
import { useLang } from "@lets-explain/core/i18n";
import type { ClusterLabels, StageBroker, StagePartition } from "../../iso/ClusterStage";
import { TINTS, type Tint } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import type { EventLine } from "../shared/describe";
import { starsFor, type Change, type Mission, type Scenario } from "@lets-explain/core/course/types";

/* ------------------------------------------------------------ step runner */

/** Any deterministic model: start state, apply, and a list of actions per step. */
export interface Model<S, A, E> {
  apply: (s: S, a: A) => { state: S; events: E[] };
}

export interface StepRun<S, E> {
  states: S[];
  events: E[][];
  ends: number[];
  startOf: (step: number) => number;
}

/** Runs every step's actions as one simulation, keeping where each step ends. */
export function buildRun<S, A, E>(model: Model<S, A, E>, start: S, stepActions: A[][]): StepRun<S, E> {
  const states: S[] = [start];
  const events: E[][] = [];
  const ends: number[] = [];
  let current: S = start;
  for (const actions of stepActions) {
    for (const a of actions) {
      const r = model.apply(current, a);
      current = r.state;
      states.push(current);
      events.push(r.events);
    }
    ends.push(states.length - 1);
  }
  return { states, events, ends, startOf: (step) => (step === 0 ? 0 : ends[step - 1]!) };
}

export interface SandboxCtx<S, A, E> {
  start: S;
  state: S;
  actions: A[];
  events: E[][];
}

/**
 * The state a scene should draw right now: a step's actions played one at a time,
 * or, on the try-it step, the reader's own moves on top of where the lesson ended.
 */
export function useSceneState<S, A, E>(opts: {
  model: Model<S, A, E>;
  run: StepRun<S, E>;
  stepActions: A[][];
  step: number;
  sandboxStep: number;
  paused: boolean;
  replayKey: number;
  interval?: number;
}) {
  const { model, run, stepActions, step, sandboxStep, paused, replayKey, interval } = opts;
  const sandbox = step === sandboxStep;
  const [extra, setExtra] = useState<A[]>([]);
  const count = sandbox ? 0 : (stepActions[step]?.length ?? 0);
  const cursor = usePlayback(count, paused, `${step}-${replayKey}`, interval);
  const sandboxStart = run.states[run.ends[sandboxStep]!]!;

  const sandboxRun = useMemo(() => {
    if (!sandbox) return null;
    const states: S[] = [sandboxStart];
    const events: E[][] = [];
    let current: S = sandboxStart;
    for (const a of extra) {
      const r = model.apply(current, a);
      current = r.state;
      states.push(current);
      events.push(r.events);
    }
    return { states, events };
  }, [sandbox, extra, sandboxStart, model]);

  if (sandboxRun) {
    return {
      sandbox,
      state: sandboxRun.states[sandboxRun.states.length - 1]!,
      before: sandboxRun.states[sandboxRun.states.length - 2] ?? sandboxStart,
      lastEvents: sandboxRun.events[sandboxRun.events.length - 1] ?? [],
      shownEvents: sandboxRun.events.flat(),
      pulse: extra.length,
      extra,
      setExtra,
      ctx: { start: sandboxStart, state: sandboxRun.states[sandboxRun.states.length - 1]!, actions: extra, events: sandboxRun.events } as SandboxCtx<S, A, E>,
    };
  }
  const start = run.startOf(step);
  return {
    sandbox,
    state: run.states[start + cursor]!,
    before: run.states[Math.max(start + cursor - 1, 0)]!,
    lastEvents: cursor > 0 ? run.events[start + cursor - 1]! : [],
    shownEvents: run.events.slice(start, start + cursor).flat(),
    pulse: cursor,
    extra,
    setExtra,
    ctx: null,
  };
}

/* ---------------------------------------------------------- replicated → stage */


const PARTITION_TINTS: Tint[] = [TINTS.mint, TINTS.sky, TINTS.lilac, TINTS.coral];
export const partitionTint = (i: number) => PARTITION_TINTS[i % PARTITION_TINTS.length]!;

/** Records that reached a copy in the latest action, by `partition:broker:offset`, from the engine's events. */
export function arrivalsOf(events: REvent[]): Map<string, "producer" | "copy"> {
  const out = new Map<string, "producer" | "copy">();
  for (const e of events) {
    if (e.type === "produced") out.set(`${e.partition}:${e.leader}:${e.offset}`, "producer");
    // A follower fetched [from, to) from the leader.
    if (e.type === "replicated") for (let o = e.from; o < e.to; o++) out.set(`${e.partition}:${e.broker}:${o}`, "copy");
  }
  return out;
}

/**
 * Turns a replication state into what ClusterStage draws. Records at or past the HW look dim.
 * Pass the latest action's events to let new records travel the way they really came.
 */
export function toStage(
  s: RState,
  opts: { brokerName: (id: number) => string; showHw?: boolean; dimUncommitted?: boolean; roof?: (id: number) => Tint; events?: REvent[] },
): { brokers: StageBroker[]; partitions: StagePartition[] } {
  const arrivals = arrivalsOf(opts.events ?? []);
  // A reassignment copies the whole log from the leader onto the brokers it adds.
  const reassigned = new Map<number, number[]>();
  for (const e of opts.events ?? []) if (e.type === "reassigned") reassigned.set(e.partition, e.to.filter((b) => !e.from.includes(b)));
  const brokers: StageBroker[] = s.brokers.map((b) => ({
    id: b.id,
    name: opts.brokerName(b.id),
    alive: b.alive,
    slow: b.alive && b.slow,
    roof: opts.roof?.(b.id),
  }));
  const kinds = ["order", "payment", "neutral", "cancel"] as const;
  const partitions: StagePartition[] = s.partitions.map((p) => ({
    id: `p${p.index}`,
    label: `P${p.index}`,
    hw: opts.showHw ? p.hw : undefined,
    replicas: p.replicas.map((b) => {
      const log = p.logs[b] ?? [];
      const role = p.leader === null ? "offline" : p.leader === b ? "leader" : p.isr.includes(b) ? "follower" : "behind";
      return {
        broker: b,
        end: log.length,
        role,
        records: log.map((r) => ({
          offset: r.offset,
          kind: kinds[p.index % kinds.length],
          state: opts.dimUncommitted && r.offset >= p.hw ? ("dim" as const) : ("normal" as const),
          arrived: reassigned.get(p.index)?.includes(b) ? ("copy" as const) : arrivals.get(`${p.index}:${b}:${r.offset}`),
        })),
      };
    }),
  }));
  return { brokers, partitions };
}

export const clusterLabels = (t: (x: L) => string): ClusterLabels => ({
  leader: t({ tr: "leader", en: "leader" }),
  follower: t({ tr: "follower", en: "follower" }),
  behind: t({ tr: "ISR dışı", en: "out of ISR" }),
  offline: t({ tr: "offline", en: "offline" }),
  hw: "HW",
  slow: t({ tr: "yavaş", en: "slow" }),
});

/** What changed between two replication states, for the "Ne değişti?" chips. */
export function replicatedChanges(before: RState, after: RState): Change[] {
  const out: Change[] = [];
  const both = (tr: string, en: string) => ({ tr, en });
  for (const b of after.brokers) {
    const was = before.brokers.find((x) => x.id === b.id);
    if (!was) out.push({ kind: "add", text: both(`+ Broker ${b.id} cluster'a katıldı`, `+ Broker ${b.id} joined the cluster`) });
    else if (was.alive && !b.alive) out.push({ kind: "bad", text: both(`Broker ${b.id} çöktü`, `Broker ${b.id} crashed`) });
    else if (!was.alive && b.alive) out.push({ kind: "good", text: both(`Broker ${b.id} geri geldi`, `Broker ${b.id} is back`) });
    else if (!was.slow && b.slow) out.push({ kind: "bad", text: both(`Broker ${b.id} yavaşladı`, `Broker ${b.id} slowed down`) });
    else if (was.slow && !b.slow && b.alive) out.push({ kind: "good", text: both(`Broker ${b.id} normale döndü`, `Broker ${b.id} is back to normal`) });
  }
  for (const p of after.partitions) {
    const q = before.partitions[p.index]!;
    const name = `P${p.index}`;
    const added = leaderLog(p).length - leaderLog(q).length;
    if (p.leader !== null && q.leader === p.leader && added > 0) {
      const from = leaderLog(q).length;
      const r = added === 1 ? `${from}` : `${from}–${from + added - 1}`;
      out.push({ kind: "add", text: both(`+${added} kayıt ${name} partition'ına (offset ${r})`, `+${added} record${added > 1 ? "s" : ""} on ${name} (offset ${r})`) });
    }
    if (q.replicas.join() !== p.replicas.join()) {
      out.push({ kind: "change", text: both(`${name} taşındı: broker ${q.replicas.join(", ")} → ${p.replicas.join(", ")}`, `${name} moved: broker ${q.replicas.join(", ")} → ${p.replicas.join(", ")}`) });
    }
    if (q.leader !== p.leader) {
      if (p.leader === null) out.push({ kind: "bad", text: both(`${name} offline: leader yok`, `${name} is offline: no leader`) });
      else if (q.replicas.join() === p.replicas.join())
        out.push({ kind: q.leader === null ? "good" : "change", text: both(`${name} leader: ${q.leader === null ? "yok" : `broker ${q.leader}`} → broker ${p.leader}`, `${name} leader: ${q.leader === null ? "none" : `broker ${q.leader}`} → broker ${p.leader}`) });
    }
    if (q.isr.join() !== p.isr.join() && p.replicas.length > 1) {
      out.push({ kind: p.isr.length < q.isr.length ? "bad" : "good", text: both(`${name} ISR: [${q.isr.join(", ")}] → [${p.isr.join(", ")}]`, `${name} ISR: [${q.isr.join(", ")}] → [${p.isr.join(", ")}]`) });
    }
    if (q.hw !== p.hw && p.replicas.length > 1) {
      out.push({ kind: "change", text: both(`${name} high watermark: ${q.hw} → ${p.hw}`, `${name} high watermark: ${q.hw} → ${p.hw}`) });
    }
  }
  const failed = after.sends.filter((x) => x.status === "failed").length - before.sends.filter((x) => x.status === "failed").length;
  if (failed > 0) out.push({ kind: "bad", text: both(`${failed} yazma başarısız oldu`, `${failed} write${failed > 1 ? "s" : ""} failed`) });
  const lost = after.sends.filter((x) => x.status === "lost").length - before.sends.filter((x) => x.status === "lost").length;
  if (lost > 0) out.push({ kind: "bad", text: both(`${lost} onaylanmış kayıt kayboldu`, `${lost} confirmed record${lost > 1 ? "s" : ""} lost`) });
  const acked = after.sends.filter((x) => x.status === "acked").length - before.sends.filter((x) => x.status === "acked").length;
  if (acked > 0 && after.partitions.some((p) => p.replicas.length > 1)) {
    out.push({ kind: "good", text: both(`Producer ${acked} onay aldı`, `The producer got ${acked} ack${acked > 1 ? "s" : ""}`) });
  }
  for (const k of ["acks", "minIsr", "unclean"] as const) {
    if (before.config[k] !== after.config[k]) {
      const name = k === "acks" ? "acks" : k === "minIsr" ? "min.insync.replicas" : "unclean.leader.election.enable";
      out.push({ kind: "change", text: both(`${name}: ${String(before.config[k])} → ${String(after.config[k])}`, `${name}: ${String(before.config[k])} → ${String(after.config[k])}`) });
    }
  }
  return out;
}

/* --------------------------------------------------------------- sandbox UI */

export interface ControlButton<A> {
  key: string;
  label: L;
  /** Null when the button is disabled right now. */
  action: A | null;
  tone?: "producer" | "danger" | "ok" | "plain";
}

export interface ControlRow<A> {
  key: string;
  name: L;
  dot?: string;
  buttons: ControlButton<A>[];
}

/** Every move the try-it buttons allow right now: the same list the tests search. */
export function enabledMoves<A>(rows: ControlRow<A>[]): A[] {
  return rows.flatMap((r) => r.buttons.flatMap((b) => (b.action ? [b.action] : [])));
}

const text = {
  latest: { tr: "Son olaylar (en yenisi üstte)", en: "Latest events (newest first)" },
  thisStep: { tr: "Bu adımda olanlar", en: "What happened in this step" },
  waiting: { tr: "Birazdan başlıyor…", en: "Starting…" },
  nothing: { tr: "Bir düğmeye bas, sonucu burada gör.", en: "Press a button and see the result here." },
  nothingTyped: { tr: "Bir komut yaz; Kafka'nın ne yaptığını burada sade bir dille gör.", en: "Type a command; see what Kafka did here, in plain words." },
  undo: { tr: "Geri al", en: "Undo" },
  reset: { tr: "Sıfırla", en: "Reset" },
};

export function EventList({ lines, sandbox, pulse, typed }: { lines: EventLine[]; sandbox: boolean; pulse: number; typed?: boolean }) {
  const { t } = useLang();
  return (
    <div className={`events ${sandbox ? "" : "is-short"}`} aria-live="polite">
      <h3>{t(sandbox ? text.latest : text.thisStep)}</h3>
      {lines.length === 0 ? (
        <p>{t(sandbox ? (typed ? text.nothingTyped : text.nothing) : text.waiting)}</p>
      ) : (
        <ol>
          {(sandbox ? [...lines].reverse() : lines).map((line, i) => (
            <li key={`${pulse}-${i}`} className={`ev-${line.tone}`}>
              <span className="ev-dot" />
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * The whole try-it panel: missions on top, the buttons, and the event list.
 * Finishing a mission locks the buttons (undo and reset still work) and saves the stars.
 */
export function Sandbox<S, A, E>({
  slug,
  missions,
  ctx,
  rows,
  extra,
  setExtra,
  lines,
}: {
  slug: string;
  missions: Mission<SandboxCtx<S, A, E>>[];
  ctx: SandboxCtx<S, A, E>;
  rows: ControlRow<A>[];
  extra: A[];
  setExtra: (fn: (xs: A[]) => A[]) => void;
  lines: EventLine[];
}) {
  const { t } = useLang();
  const { game, setMissionStars } = useGame();
  const best = game.missions[slug] ?? {};
  const [missionIndex, setMissionIndex] = useState<number | null>(() => {
    const i = missions.findIndex((m) => !best[m.id]);
    return i < 0 ? 0 : i;
  });
  const mission = missionIndex !== null ? missions[missionIndex]! : null;
  const won = Boolean(mission && mission.check(ctx));
  const id = mission?.id;
  const par = mission?.par ?? 0;
  useEffect(() => {
    if (won && id) setMissionStars(slug, id, starsFor(extra.length, par));
  }, [won, id, par, extra.length, setMissionStars, slug]);

  const select = (i: number | null) => {
    setMissionIndex(i);
    setExtra(() => []);
  };

  return (
    <div className="sandbox">
      <MissionPanel missions={missions} active={missionIndex} onSelect={select} moves={extra.length} won={won} best={best} />
      <div className="sandbox-controls">
        {rows.map((row) => (
          <div className="control-row" key={row.key}>
            <span className="control-name">
              <i style={{ background: row.dot ?? "var(--sky)" }} />
              {t(row.name)}
            </span>
            {row.buttons.map((b) => (
              <button
                key={b.key}
                className={`chip-btn ${b.tone && b.tone !== "plain" ? `is-${b.tone === "producer" ? "producer" : b.tone}` : ""}`}
                disabled={won || !b.action}
                onClick={() => {
                  const a = b.action;
                  if (a && !won) setExtra((xs) => [...xs, a]);
                }}
              >
                {t(b.label)}
              </button>
            ))}
          </div>
        ))}
        <div className="control-row">
          <button className="chip-btn" disabled={extra.length === 0} onClick={() => setExtra((xs) => xs.slice(0, -1))}>
            <Icon name="undo" size={15} /> {t(text.undo)}
          </button>
          <button className="chip-btn" disabled={extra.length === 0} onClick={() => setExtra(() => [])}>
            <Icon name="reset" size={15} /> {t(text.reset)}
          </button>
        </div>
      </div>
      <EventList lines={lines} sandbox pulse={extra.length} />
    </div>
  );
}

/* ------------------------------------------------------------- typed mode */

/** A shell's replay: the box after each action and each action's events. */
export interface BoxRun<B, E> {
  boxes: B[];
  events: E[][];
}

export interface TypedView<S, B, E> {
  /** Where the scenario (or free play) started. */
  start: S;
  state: S;
  before: S;
  box: B;
  lastEvents: E[];
  shownEvents: E[];
  /** Grows with every command, so the scene can replay its little animations. */
  pulse: number;
  panel: ReactNode;
  terminal: ReactNode;
}

/**
 * The try-it step played by typing, for any of the kit's models: a shell on a "box" (the model
 * plus files), its scenarios, and how to read the model out of a box. Null on other steps.
 */
export function useTypedKit<SA, B, C, S, RR extends BoxRun<B, unknown>>(o: {
  slug: string;
  active: boolean;
  scenarios: Scenario<C, B>[];
  freeStart: B;
  shell: CommandLine<SA, B>;
  replay: (start: B, actions: SA[]) => RR;
  context: (start: B, run: RR) => C;
  stateOf: (box: B) => S;
}): TypedView<S, B, RR["events"][number][number]> | null {
  const typed = useTypedSandbox({
    slug: o.slug,
    active: o.active,
    scenarios: o.scenarios,
    freeStart: o.freeStart,
    shell: o.shell,
    replay: o.replay,
    final: (r: RR) => r.boxes[r.boxes.length - 1]!,
    context: (start: B, _actions: SA[], r: RR) => o.context(start, r),
  });
  if (!typed.run) return null;
  const { boxes } = typed.run;
  const events = typed.run.events as RR["events"][number][number][][];
  const withEvents = events.filter((e) => e.length > 0);
  const lastAt = events.map((e) => e.length > 0).lastIndexOf(true);
  return {
    start: o.stateOf(typed.start),
    state: o.stateOf(boxes[boxes.length - 1]!),
    before: o.stateOf(lastAt >= 0 ? boxes[lastAt]! : typed.start),
    box: boxes[boxes.length - 1]!,
    lastEvents: withEvents[withEvents.length - 1] ?? [],
    shownEvents: events.flat(),
    pulse: withEvents.length,
    panel: typed.panel,
    terminal: typed.terminal,
  };
}

/** The typed try-it panel: scenarios on top, the terminal, and the event list. */
export function TypedFooter({ view, lines }: { view: { panel: ReactNode; terminal: ReactNode; pulse: number }; lines: EventLine[] }) {
  return (
    <div className="sandbox">
      {view.panel}
      {view.terminal}
      <EventList lines={lines} sandbox typed pulse={view.pulse} />
    </div>
  );
}

/* ------------------------------------------------------------ test helper */

/**
 * Exhaustive search for a win in at most `depth` moves, using the same moves the buttons allow.
 * Returns the shortest winning move list it finds, or null.
 */
export function findShortcut<S, A, E>(
  model: Model<S, A, E>,
  start: S,
  movesIn: (state: S, actions: A[]) => A[],
  check: (ctx: SandboxCtx<S, A, E>) => boolean,
  depth: number,
): A[] | null {
  for (let d = 1; d <= depth; d++) {
    const walk = (actions: A[], state: S, events: E[][]): A[] | null => {
      if (actions.length === d) return check({ start, state, actions, events }) ? actions : null;
      for (const a of movesIn(state, actions)) {
        const r = model.apply(state, a);
        const found = walk([...actions, a], r.state, [...events, r.events]);
        if (found) return found;
      }
      return null;
    };
    const found = walk([], start, []);
    if (found) return found;
  }
  return null;
}

export function playMoves<S, A, E>(model: Model<S, A, E>, start: S, actions: A[]): SandboxCtx<S, A, E> {
  let state = start;
  const events: E[][] = [];
  for (const a of actions) {
    const r = model.apply(state, a);
    state = r.state;
    events.push(r.events);
  }
  return { start, state, actions, events };
}

