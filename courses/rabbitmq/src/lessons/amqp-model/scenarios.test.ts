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
const SHIPPING = 'await ch.assertQueue("shipping");';

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "no-payments": {
    typed: ["nano setup.js", "node setup.js", "node pay.js"],
    edits: [addLine(SHIPPING, 'await ch.bindQueue("billing", "shop", "order.paid");')],
  },
  "pack-on-payment": {
    typed: ["nano setup.js", "node setup.js", "node pay.js"],
    edits: [addLine('"shop", "order.paid");', 'await ch.bindQueue("shipping", "shop", "order.paid");')],
  },
  "refused-declare": { typed: ["nano invoice.js", "node invoice.js"], edits: [swap("{ durable: false }", "{ durable: true }")] },
  "straight-to-queue": { typed: ["nano test_ship.js", "node test_ship.js"], edits: [swap('ch.publish("shop",', 'ch.publish("",')] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "no-payments": [
    {
      typed: ["rabbitmqctl list_bindings source_name destination_name routing_key", "nano setup.js", "node setup.js && node pay.js"],
      edits: [addLine(SHIPPING, 'await ch.bindQueue("billing", "shop", "order.paid");')],
    },
  ],
  "refused-declare": [
    { typed: ["node invoice.js", "nano invoice.js", "node invoice.js"], edits: [swap("{ durable: false }", "{ durable: true }")] },
    // Dropping the option works as well: amqplib declares queues durable by default.
    { typed: ["nano invoice.js", "node invoice.js"], edits: [swap(', { durable: false }', "")] },
    // Not declaring at all is fine too: setup.js owns the queue.
    { typed: ["nano invoice.js", "node invoice.js"], edits: [swap('await ch.assertQueue("billing", { durable: false });\n', "")] },
  ],
  "straight-to-queue": [{ typed: ["nano test_ship.js", "node test_ship.js"], edits: [swap('ch.publish("shop", "shipping",', 'ch.sendToQueue("shipping",')] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Skipping the exchange gets it into billing, but not through `shop` as the service does.
  "no-payments": { typed: ["nano pay.js", "node pay.js"], edits: [swap('ch.publish("shop", "order.paid",', 'ch.publish("", "billing",')] },
  // Two messages, one per queue: the service now sends everything twice.
  "pack-on-payment": {
    typed: ["nano pay.js", "node pay.js"],
    edits: [addLine('Buffer.from("order 1001 paid"));', 'ch.sendToQueue("shipping", Buffer.from("order 1001 paid"));')],
  },
  // Deleting the queue lets the declare pass, but the binding and the durability are gone.
  "refused-declare": { typed: ["rabbitmqctl delete_queue billing", "node invoice.js"] },
  // A new binding on live traffic is exactly what was off limits.
  "straight-to-queue": {
    typed: ["nano setup.js", "node setup.js", "node test_ship.js"],
    edits: [addLine('"shop", "order.paid");', 'await ch.bindQueue("shipping", "shop", "shipping");')],
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

  it("the refused declare prints amqplib's real error", () => {
    const s = scenarios.find((x) => x.id === "refused-declare")!;
    expect(typeInto(s.start, ["node invoice.js"]).output).toContain(
      `Error: Operation failed: QueueDeclare; 406 (PRECONDITION-FAILED) with message "PRECONDITION_FAILED - inequivalent arg 'durable' for queue 'billing' in vhost '/': received 'false' but current is 'true'"`,
    );
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
