import { describe, expect, it } from "vitest";
import { depth } from "../../engine/broker";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { EXPECTED_ERRORS, scene, steps } from "./Scene";

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
const SHIPPING = 'ch.queue_declare(queue="shipping", durable=True)';

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "no-payments": {
    typed: ["nano setup.py", "python setup.py", "python pay.py"],
    edits: [addLine(SHIPPING, 'ch.queue_bind(queue="billing", exchange="shop", routing_key="order.paid")')],
  },
  "pack-on-payment": {
    typed: ["nano setup.py", "python setup.py", "python pay.py"],
    edits: [addLine('routing_key="order.paid")', 'ch.queue_bind(queue="shipping", exchange="shop", routing_key="order.paid")')],
  },
  "refused-declare": { typed: ["nano invoice.py", "python invoice.py"], edits: [swap('queue_declare(queue="billing")', 'queue_declare(queue="billing", durable=True)')] },
  "straight-to-queue": { typed: ["nano test_ship.py", "python test_ship.py"], edits: [swap('exchange="shop"', 'exchange=""')] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "no-payments": [
    {
      typed: ["rabbitmqctl list_bindings source_name destination_name routing_key", "nano setup.py", "python setup.py && python pay.py"],
      edits: [addLine(SHIPPING, 'ch.queue_bind(queue="billing", exchange="shop", routing_key="order.paid")')],
    },
  ],
  "refused-declare": [
    { typed: ["python invoice.py", "nano invoice.py", "python invoice.py"], edits: [swap('queue_declare(queue="billing")', 'queue_declare(queue="billing", durable=True)')] },
    // Not declaring at all is fine too: setup.py owns the queue.
    { typed: ["nano invoice.py", "python invoice.py"], edits: [swap('ch.queue_declare(queue="billing")\n', "")] },
  ],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Skipping the exchange gets it into billing, but not through `shop` as the service does.
  "no-payments": { typed: ["nano pay.py", "python pay.py"], edits: [swap('exchange="shop", routing_key="order.paid"', 'exchange="", routing_key="billing"')] },
  // Two messages, one per queue: the service now sends everything twice.
  "pack-on-payment": {
    typed: ["nano pay.py", "python pay.py"],
    edits: [addLine('body=b"order 1001 paid")', 'ch.basic_publish(exchange="", routing_key="shipping", body=b"order 1001 paid")')],
  },
  // Deleting the queue lets the declare pass, but the binding and the durability are gone.
  "refused-declare": { typed: ["rabbitmqctl delete_queue billing", "python invoice.py"] },
  // A new binding on live traffic is exactly what was off limits.
  "straight-to-queue": {
    typed: ["nano setup.py", "python setup.py", "python test_ship.py"],
    edits: [addLine('routing_key="order.paid")', 'ch.queue_bind(queue="shipping", exchange="shop", routing_key="shipping")')],
  },
};

describe("amqp-model", () => {
  it("lesson steps run without broker errors, except the one refused on purpose", () => {
    expect(steps).toHaveLength(9);
    steps.forEach((_, step) => {
      const errors = scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat().filter((e) => e.type === "error");
      if (EXPECTED_ERRORS[step]) {
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ message: expect.stringContaining(EXPECTED_ERRORS[step]!) });
      } else expect(errors, `step ${step}`).toEqual([]);
    });
  });

  it("the story: routed by binding, unroutable dropped, declare idempotent, conflicting declare refused", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    expect(depth(at(2), "billing").ready).toBe(1);
    expect(depth(at(3), "billing").ready).toBe(1);
    expect(at(3).lost).toEqual([{ id: "m2", reason: "unroutable" }]);
    // Declaring the same queue again changes nothing.
    expect(at(4)).toEqual(at(3));
    // The conflicting declare is refused, and the queue keeps its settings.
    expect(at(5).queues.billing!.durable).toBe(true);
    expect(at(7).consumers["billing-1"]!.done).toEqual(["m1"]);
  });

  it("the refused declare prints pika's real error", () => {
    const s = scenarios.find((x) => x.id === "refused-declare")!;
    expect(typeInto(s.start, ["python invoice.py"]).output.at(-1)).toContain("PRECONDITION_FAILED - inequivalent arg 'durable' for queue 'billing'");
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const p = solutions[s.id]!;
      const r = typeInto(s.start, p.typed, [...(p.edits ?? [])]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.typed.join(" ; ")}`, () => {
        expect(s.check(typeInto(s.start, alt.typed, [...(alt.edits ?? [])]).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const w = wrong[s.id]!;
      expect(s.check(typeInto(s.start, w.typed, [...(w.edits ?? [])]).ctx)).toBe(false);
    });
  }
});
