import { describe, expect, it } from "vitest";
import { createBroker, simulate, type BrokerAction } from "../../engine/broker";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { mergedForDrawing, scene, steps } from "./Scene";

type Edit = (text: string) => string;
interface Play {
  typed: string[];
  edits?: Edit[];
}

const swap = (from: string, to: string): Edit => (t) => {
  if (!t.includes(from)) throw new Error(`the file has no ${from}`);
  return t.replace(from, to);
};
const addLine = (after: string, line: string): Edit => (t) => {
  if (!t.includes(after)) throw new Error(`the file has no ${after}`);
  return t.replace(after, `${after}\n${line}`);
};
const bindLine = (queue: string, pattern: string) => `await ch.bindQueue("${queue}", "events", "${pattern}");`;
const declared = (queue: string) => `await ch.assertQueue("${queue}");`;
const RUN = ["nano setup.js", "node setup.js", "node events.js"];

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "eu-worker": { typed: RUN, edits: [swap('"events", "order.eu");', '"events", "order.*.eu");')] },
  warehouse: { typed: RUN, edits: [swap('"events", "order.*");', '"events", "order.#");')] },
  audit: { typed: RUN, edits: [addLine(declared("audit"), bindLine("audit", "#"))] },
  "us-marketing": { typed: RUN, edits: [addLine(declared("us-marketing"), `${bindLine("us-marketing", "*.*.us")}\n${bindLine("us-marketing", "user.#")}`)] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "eu-worker": [{ typed: RUN, edits: [swap('"events", "order.eu");', '"events", "order.#.eu");')] }],
  audit: [{ typed: RUN, edits: [addLine(declared("audit"), `${bindLine("audit", "order.#")}\n${bindLine("audit", "user.#")}`)] }],
  "us-marketing": [{ typed: RUN, edits: [addLine(declared("us-marketing"), `${bindLine("us-marketing", "#.us")}\n${bindLine("us-marketing", "user.signup.*")}`)] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Too wide: user signups in Europe match too.
  "eu-worker": { typed: RUN, edits: [swap('"events", "order.eu");', '"events", "#.eu");')] },
  // Everything, user events included.
  warehouse: { typed: RUN, edits: [swap('"events", "order.*");', '"events", "#");')] },
  // Three words only: the four-word VIP key slips through.
  audit: { typed: RUN, edits: [addLine(declared("audit"), bindLine("audit", "*.*.*"))] },
  // `user.*` is exactly two words, so the three-word signup key doesn't match.
  "us-marketing": { typed: RUN, edits: [addLine(declared("us-marketing"), `${bindLine("us-marketing", "*.*.us")}\n${bindLine("us-marketing", "user.*")}`)] },
};

describe("topic-exchange", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(8);
  });

  it("the story: what each key reaches, as the lesson text says", () => {
    const routed = (step: number) => {
      const evs = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
      const r = evs.find((e) => e.type === "routed");
      return r && r.type === "routed" ? [...r.queues].sort() : [];
    };
    expect(routed(1)).toEqual(["all-orders", "audit", "eu-orders"]);
    expect(routed(2)).toEqual(["all-orders", "audit"]);
    expect(routed(3)).toEqual(["audit"]);
    expect(routed(4)).toEqual(["all-orders", "audit"]);
    expect(routed(5)).toEqual(["all-orders", "audit", "eu-orders", "refunds"]);
  });

  it("the drawing merges two bindings to one queue into one label", () => {
    const bind = (key: string): BrokerAction => ({ type: "bind", exchange: "events", queue: "target", key });
    const b = simulate(
      [{ type: "declareExchange", name: "events", kind: "topic" }, { type: "declareQueue", name: "target" }, bind("user.#"), bind("*.*.us")],
      createBroker(),
    ).states[4]!;
    expect(mergedForDrawing(b).bindings).toHaveLength(1);
    expect(mergedForDrawing(b).bindings[0]!.key).toContain("user.#");
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, ["node events.js"]).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const p = solutions[s.id]!;
      const r = typeInto(s.start, p.typed, [...(p.edits ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with another pattern`, () => {
        expect(s.check(typeInto(s.start, alt.typed, [...(alt.edits ?? [])]).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong pattern does not win`, () => {
      const w = wrong[s.id]!;
      expect(s.check(typeInto(s.start, w.typed, [...(w.edits ?? [])]).ctx)).toBe(false);
    });
  }
});
