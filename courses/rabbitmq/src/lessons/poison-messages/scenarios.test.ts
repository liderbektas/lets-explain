import { describe, expect, it } from "vitest";
import { depth } from "../../engine/broker";
import { LIMIT, OLD, PARKING, QQ, scene, steps } from "./Scene";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";

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
void swap;
void addLine;
const LIMITS = `rabbitmqctl set_policy limits "^orders$" '{"delivery-limit":3,"dead-letter-exchange":"dlx"}' --apply-to queues`;
const TO_RETRY = `rabbitmqctl set_policy to-retry "^orders$" '{"dead-letter-exchange":"retry-x"}' --apply-to queues`;
const BACK = `rabbitmqctl set_policy back "^retry$" '{"message-ttl":2000,"dead-letter-exchange":"","dead-letter-routing-key":"orders"}' --apply-to queues`;
const NACK = "ch.nack(msg, false, true);";
const REJECT = "ch.reject(msg, false);";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "endless-retries": { typed: [LIMITS, "node send_bad.js"] },
  "no-retry": { typed: ["nano worker.js", "pkill -f worker.js", "node worker.js", "node send_bad.js", "node send.js"], edits: [swap(NACK, REJECT)] },
  "retry-later": { typed: [TO_RETRY, BACK, "node send_late.js", "sleep 2"] },
  "classic-ignores": {
    typed: ["nano setup.js", "rabbitmqctl delete_queue jobs", "node setup.js", "node worker.js", "node send_bad.js"],
    edits: [swap('await ch.assertQueue("jobs");', 'await ch.assertQueue("jobs", { arguments: { "x-queue-type": "quorum" } });')],
  },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "endless-retries": [{ typed: ["rabbitmqctl list_queues name type messages", `docker exec rabbitmq rabbitmqctl set_policy --apply-to queues poison "^orders" '{"dead-letter-exchange":"dlx","delivery-limit":2}'`, "node send_bad.js"] }],
  "no-retry": [{ typed: ["nano worker.js", "kill -9 %1", "node worker.js", "node send.js", "node send_bad.js"], edits: [swap(NACK, "ch.nack(msg, false, false);")] }],
  "retry-later": [{ typed: [BACK, TO_RETRY, "node send_late.js", "sleep 5"] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // Without a DLX the limit still deletes the message after 20 tries.
  "endless-retries": { typed: ["node send_bad.js"] },
  // Editing the file is not enough: the running worker still runs the old code.
  "no-retry": { typed: ["nano worker.js", "node send_bad.js", "node send.js"], edits: [swap(NACK, REJECT)] },
  // Only one half of the loop: the message waits in retry forever.
  "retry-later": { typed: [TO_RETRY, "node send_late.js", "sleep 5"] },
  // A stronger policy on the classic queue changes nothing.
  "classic-ignores": { typed: [`rabbitmqctl set_policy limits "^jobs$" '{"delivery-limit":1,"dead-letter-exchange":"dlx"}' --apply-to queues`, "node send_bad.js"] },
};

describe("poison-messages", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(9);
  });

  it("the story the text tells", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 1: on a classic queue the bad message just keeps coming back: 4 deliveries so far.
    expect(at(1).deliveries.filter((d) => d.id === "m1")).toHaveLength(4);
    expect(at(1).consumers.w1!.unacked[0]!.redelivered).toBe(true);
    // Step 2: rejected with no DLX, it is simply gone.
    expect(at(2).lost).toEqual([{ id: "m1", reason: "rejected" }]);
    expect(depth(at(2), OLD).total).toBe(0);
    // Step 3: a quorum queue with a delivery limit and a DLX into parking.
    expect(at(3).queues[QQ]!.args.deliveryLimit).toBe(LIMIT);
    // Step 4: after LIMIT + 1 failed deliveries it lands in parking.
    const parked = at(4).queues[PARKING]!.ready;
    expect(parked.map((m) => m.body)).toEqual(["bad"]);
    expect(parked[0]!.deaths[0]!.reason).toBe("delivery_limit");
    expect(at(4).deliveries.filter((d) => d.id === "m2")).toHaveLength(LIMIT + 1);
    // Step 5: a good message goes through.
    expect(at(5).consumers.w2!.done).toContain("m3");
    // Step 6: the delayed message expired out of retry and came back into orders.
    expect(at(6).consumers.w2!.unacked.map((m) => m.body)).toEqual(["late"]);
    expect(at(6).consumers.w2!.unacked[0]!.deaths[0]!.reason).toBe("expired");
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
