/**
 * The try-it model for "Why Kafka?": services wired either directly to each other or
 * through a shared log, an email service that can crash, and orders that need an email.
 * Small and deterministic so missions can be checked and searched exhaustively.
 */

export const MAX_SOURCES = 3;
export const MAX_TARGETS = 6;
/** The email service is the third target, so it is there from the start. */
export const EMAIL_INDEX = 2;

export interface WorldState {
  mode: "direct" | "kafka";
  sources: number;
  targets: number;
  emailUp: boolean;
  orders: number;
  /** Order emails sent. */
  sent: number;
  /** Order emails gone for good: the order service called a dead email service. */
  lost: number;
  /** Order events waiting in the log for the email service to come back. */
  waiting: number;
}

export type WorldAction =
  | { type: "setMode"; mode: "direct" | "kafka" }
  | { type: "addSource" }
  | { type: "addTarget" }
  | { type: "order" }
  | { type: "crashEmail" }
  | { type: "startEmail" };

export type WorldEvent =
  | { type: "mode"; mode: "direct" | "kafka"; connections: number }
  | { type: "added"; side: "source" | "target"; connections: number }
  | { type: "sent"; count: number; late: boolean }
  | { type: "lost" }
  | { type: "queued"; waiting: number }
  | { type: "crashed" }
  | { type: "started" };

export const START: WorldState = {
  mode: "direct",
  sources: 1,
  targets: 3,
  emailUp: true,
  orders: 0,
  sent: 0,
  lost: 0,
  waiting: 0,
};

export const connections = (s: WorldState) => (s.mode === "direct" ? s.sources * s.targets : s.sources + s.targets);

/** Which buttons are enabled; the sandbox and the mission search both use this. */
export function allowed(s: WorldState): WorldAction[] {
  const out: WorldAction[] = [{ type: "setMode", mode: s.mode === "direct" ? "kafka" : "direct" }];
  if (s.sources < MAX_SOURCES) out.push({ type: "addSource" });
  if (s.targets < MAX_TARGETS) out.push({ type: "addTarget" });
  out.push({ type: "order" });
  out.push(s.emailUp ? { type: "crashEmail" } : { type: "startEmail" });
  return out;
}

export function step(s: WorldState, a: WorldAction): { state: WorldState; events: WorldEvent[] } {
  const next = { ...s };
  const events: WorldEvent[] = [];
  switch (a.type) {
    case "setMode":
      next.mode = a.mode;
      events.push({ type: "mode", mode: a.mode, connections: connections(next) });
      break;
    case "addSource":
      next.sources = Math.min(MAX_SOURCES, s.sources + 1);
      events.push({ type: "added", side: "source", connections: connections(next) });
      break;
    case "addTarget":
      next.targets = Math.min(MAX_TARGETS, s.targets + 1);
      events.push({ type: "added", side: "target", connections: connections(next) });
      break;
    case "order":
      next.orders += 1;
      if (s.emailUp) {
        next.sent += 1;
        events.push({ type: "sent", count: 1, late: false });
      } else if (s.mode === "kafka") {
        next.waiting += 1;
        events.push({ type: "queued", waiting: next.waiting });
      } else {
        next.lost += 1;
        events.push({ type: "lost" });
      }
      break;
    case "crashEmail":
      next.emailUp = false;
      events.push({ type: "crashed" });
      break;
    case "startEmail":
      next.emailUp = true;
      events.push({ type: "started" });
      // The log kept every event, so the email service catches up from where it stopped.
      if (s.waiting > 0) {
        next.sent += s.waiting;
        events.push({ type: "sent", count: s.waiting, late: true });
        next.waiting = 0;
      }
      break;
  }
  return { state: next, events };
}

export function run(actions: WorldAction[], from: WorldState = START) {
  const states = [from];
  const events: WorldEvent[][] = [];
  let current = from;
  for (const a of actions) {
    const r = step(current, a);
    current = r.state;
    states.push(current);
    events.push(r.events);
  }
  return { states, events };
}
