import type { ComponentType, ReactNode } from "react";
import { useTypedSandbox } from "@lets-explain/core/components/TypedSandbox";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import type { Change, Scenario, SceneProps } from "@lets-explain/core/course/types";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { wsShell } from "../../engine/cli";
import { describeNet, personName, type Tone } from "../../engine/describe";
import { simulate, type Net, type NetAction, type NetEvent, type Run } from "../../engine/net";
import { NET_STAGE, type StageLabels } from "../../iso/NetStage";

/**
 * The shared shell for every WebSocket lesson: it plays each step's actions through the model,
 * draws the lesson's view, lists what changed, and runs the try-it step in a terminal.
 */

/** What a scenario's check sees: where it began, every action, what each did. */
export interface WsCtx {
  start: Net;
  state: Net;
  actions: NetAction[];
  events: NetEvent[][];
  states: Net[];
}

export type WsScenario = Scenario<WsCtx, Net>;

export const ctxOf = (start: Net, actions: NetAction[], run: Run): WsCtx => ({
  start,
  state: run.states[run.states.length - 1]!,
  actions,
  events: run.events,
  states: run.states,
});

export interface ViewInfo {
  step: number;
  sandbox: boolean;
  /** Events of the action that produced this state. */
  last: NetEvent[];
  /** Counts actions, so a repeated motion plays again. */
  beat: number;
  /** Where the current step (or the try-it step) began. */
  from: Net;
  t: (x: L) => string;
  lang: Lang;
}

export interface NetSceneConfig {
  slug: string;
  start: Net;
  /** One list of actions per step. The last step is the try-it step and plays nothing. */
  steps: NetAction[][];
  label: L;
  view: (net: Net, info: ViewInfo) => ReactNode;
  metrics?: (net: Net, t: (x: L) => string, info: ViewInfo) => Metric[];
  legend?: (t: (x: L) => string) => LegendItem[];
  scenarios: WsScenario[];
  /** Free play starts here. */
  freeStart: Net;
  /** Milliseconds each action stays on screen. */
  actionMs?: number;
}

export interface NetScene {
  Scene: ComponentType<SceneProps>;
  changesFor: (step: number) => Change[];
  run: Run;
  stepStart: (step: number) => number;
  stepEnd: (step: number) => number;
}

export function stageLabels(t: (x: L) => string, lang: Lang, client: L = l("Tarayıcı", "Browser")): StageLabels {
  return {
    client: t(client),
    server: t(l("Sohbet sunucusu", "Chat server")),
    waiting: t(l("bekliyor", "waiting")),
    board: t(l("Sunucudaki mesajlar", "Messages on the server")),
    inbox: t(l("İstemcinin elindekiler", "What the client has")),
    nothingYet: t(l("henüz yok", "none yet")),
    sse: t(l("SSE akışı: sadece aşağı", "SSE stream: down only")),
    ws: t(l("WebSocket: iki yön", "WebSocket: both ways")),
    names: Object.fromEntries(["ayse", "mert", "zeynep", "you"].map((id) => [id, personName(id, lang)])),
    clock: (s) => (lang === "tr" ? `saat ${s} sn` : `clock ${s} s`),
  };
}

const TONE_KIND: Record<Tone, Change["kind"]> = { plain: "change", read: "good", ok: "good", bad: "bad", produce: "add" };

export function makeNetScene(config: NetSceneConfig): NetScene {
  const ends: number[] = [];
  let n = 0;
  for (const s of config.steps) {
    n += s.length;
    ends.push(n);
  }
  const run = simulate(config.steps.flat(), config.start);
  const stepStart = (step: number) => (step === 0 ? 0 : ends[step - 1]!);
  const stepEnd = (step: number) => ends[step]!;
  const sandboxStep = config.steps.length - 1;

  const changesFor = (step: number): Change[] => {
    if (step >= sandboxStep) return [];
    const out: Change[] = [];
    for (let i = stepStart(step); i < stepEnd(step); i++) {
      const state = run.states[i + 1]!;
      for (const e of run.events[i]!) {
        const tr = describeNet(e, state, "tr");
        const en = describeNet(e, state, "en");
        if (tr && en && e.type !== "frame") out.push({ kind: TONE_KIND[tr.tone], text: l(tr.text, en.text) });
      }
    }
    return out;
  };

  function Scene({ step, paused, replayKey, controls }: SceneProps) {
    const { t, lang } = useLang();
    const sandbox = step === sandboxStep;
    const count = sandbox ? 0 : (config.steps[step]?.length ?? 0);
    const cursor = usePlayback(count, paused, `${step}-${replayKey}`, config.actionMs ?? 1700);

    const typed = useTypedSandbox({
      slug: config.slug,
      active: sandbox,
      scenarios: config.scenarios,
      freeStart: config.freeStart,
      shell: wsShell,
      replay: (start: Net, actions: NetAction[]) => simulate(actions, start),
      final: (r) => r.states[r.states.length - 1]!,
      context: (start, actions, r) => ctxOf(start, actions, r),
    });

    let state: Net;
    let last: NetEvent[];
    let shown: NetEvent[];
    let beat: number;
    let from: Net;
    if (typed.run) {
      state = typed.run.states[typed.run.states.length - 1]!;
      last = [...typed.run.events].reverse().find((e) => e.length > 0) ?? [];
      shown = typed.run.events.flat();
      beat = typed.run.events.length;
      from = typed.start;
    } else {
      const s0 = stepStart(Math.min(step, sandboxStep));
      state = run.states[s0 + cursor]!;
      last = cursor > 0 ? run.events[s0 + cursor - 1]! : [];
      shown = run.events.slice(s0, s0 + cursor).flat();
      beat = s0 + cursor;
      from = run.states[s0]!;
    }
    const info: ViewInfo = { step, sandbox, last, beat, from, t, lang };

    const lines = shown.map((e) => describeNet(e, state, lang)).filter((x): x is NonNullable<typeof x> => x !== null);
    const eventList = (
      <div className="events" aria-live="polite">
        <h3>{t(text.latest)}</h3>
        {lines.length === 0 ? (
          <p>{t(text.nothing)}</p>
        ) : (
          <ol>
            {[...lines].reverse().slice(0, 14).map((line, i) => (
              <li key={`${shown.length}-${i}`} className={`ev-${line.tone}`}>
                <span className="ev-dot" />
                <span>{line.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );

    return (
      <SceneFrame
        metrics={config.metrics?.(state, t, info) ?? []}
        controls={controls}
        legend={config.legend?.(t) ?? []}
        paused={paused}
        width={NET_STAGE.width}
        height={NET_STAGE.height}
        label={t(config.label)}
        footer={
          sandbox ? (
            <div className="sandbox">
              {typed.panel}
              {typed.terminal}
              {eventList}
            </div>
          ) : null
        }
      >
        {config.view(state, info)}
      </SceneFrame>
    );
  }

  return { Scene, changesFor, run, stepStart, stepEnd };
}

const text = {
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  nothing: l("Bir komut yaz; ağda ne olduğunu burada sade bir dille gör.", "Type a command; see what happened on the wire here, in plain words."),
};

/* --------------------------------------------------------- scenario helpers */

/** Every event in the scenario, flattened. */
export const allEvents = (ctx: WsCtx) => ctx.events.flat();

/** Exchanges made during the scenario (not the ones its start already had). */
export const newExchanges = (ctx: WsCtx) => ctx.state.exchanges.slice(ctx.start.exchanges.length);
export const newConns = (ctx: WsCtx) => ctx.state.conns.slice(ctx.start.conns.length);

/** Every line a process printed during the scenario (while loading, too). */
export const logsOf = (ctx: WsCtx) =>
  ctx.events.flat().flatMap((e) => (e.type === "procLog" ? [e.text] : e.type === "procStarted" ? e.logs : []));
