import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { shortestWin } from "@lets-explain/core/lib/missionSearch";
import { apply, createBroker, simulate, type Broker, type BrokerAction } from "../../engine/broker";
import { applyAll, project, rabbitShell, type Files, type Project } from "../../engine/cli";
import { typedCtx, type BrokerCtx, type BrokerScene, type RabbitCtx } from "./BrokerScene";

/** The mission context for a list of moves from the try-it step's start. */
export function ctxFor(scene: BrokerScene, actions: BrokerAction[]): BrokerCtx {
  const r = simulate(actions, scene.sandboxStart);
  return { start: scene.sandboxStart, state: r.states[r.states.length - 1]!, actions, events: r.events, states: r.states };
}

/** The shortest win within `depth` moves, using exactly the buttons the try-it step enables. */
export function searchWin(scene: BrokerScene, check: (c: BrokerCtx) => boolean, depth: number): BrokerAction[] | null {
  return shortestWin<Broker, BrokerAction, BrokerCtx>({
    start: scene.sandboxStart,
    moves: (state, history) => scene.moves(state, history),
    step: (state, move) => apply(state, move).state,
    context: (start, history) => {
      const r = simulate(history, start);
      return { start, state: r.states[r.states.length - 1]!, actions: history, events: r.events, states: r.states };
    },
    check,
    depth,
  });
}

/** Every event of a type across the try-it run, typed. */
export function eventsOf<T extends import("../../engine/broker").BrokerEvent["type"]>(ctx: BrokerCtx, type: T) {
  return ctx.events.flat().filter((e): e is Extract<import("../../engine/broker").BrokerEvent, { type: T }> => e.type === type);
}

/** Messages lost during the try-it step (not already lost when it started). */
export function lostSince(ctx: BrokerCtx) {
  return ctx.state.lost.slice(ctx.start.lost.length);
}

/* -------------------------------------------------------------- scenarios */

/** The usual top of every script: amqplib, a connection and a channel called `ch` (a confirm channel if asked). */
export const connect = (confirm = false) => `import amqp from "amqplib";

const conn = await amqp.connect("amqp://localhost");
const ch = await conn.${confirm ? "createConfirmChannel" : "createChannel"}();
`;
export const CONNECT = connect();

/** A script: the connection lines, the body, and a close. */
export const script = (body: string, opts: { confirm?: boolean } = {}) => `${connect(opts.confirm)}\n${body.trim()}\n\nawait conn.close();`;

/**
 * A scenario's starting project: these files, after typing these lines (usually
 * `node setup.js`), so the broker is exactly what the files describe.
 */
export function projectAfter(files: Files, typed: string[] = [], broker: Broker = createBroker()): Project {
  return typeLines(rabbitShell, applyAll, project(broker, files), typed).state;
}

/** Types lines into a scenario the way a reader would; returns what its check sees and the commands counted. */
export function typeInto(start: Project, typed: string[], edits: ((text: string) => string)[] = []): { ctx: RabbitCtx; moves: number; output: string[] } {
  const r = typeLines(rabbitShell, applyAll, start, typed, edits);
  return { ctx: typedCtx(start, r.actions), moves: r.moves, output: r.output };
}

/** A message with this routing key reached this queue during the scenario. */
export const reached = (ctx: BrokerCtx, key: string, queue: string) => eventsOf(ctx, "routed").some((e) => e.routingKey === key && e.queues.includes(queue));
