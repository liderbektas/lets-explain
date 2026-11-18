import { describe, expect, it } from "vitest";
import { depth, type BrokerAction } from "../../engine/broker";
import { ctxFor, searchWin } from "../shared/missionHelpers";
import { missions } from "./missions";
import { answer, ask, REPLY, RPC, scene, steps } from "./Scene";

const reply = (n: number) => answer({ replyTo: REPLY, correlationId: `c${n}` });
const ack = (tag: string): BrokerAction => ({ type: "ack", tag });

/** The intended solutions, pressing only buttons the sandbox shows. */
const solutions: Record<string, BrokerAction[]> = {
  // c1 goes to server-1.
  "round-trip": [ask(1), reply(1), ack("server-1"), ack("client")],
  // c1 → server-1, c2 → server-2; server-2 answers first.
  "out-of-order": [ask(1), ask(2), reply(2), reply(1), ack("client"), ack("client")],
  // server-1 crashes holding c1; it goes to server-2.
  rescue: [ask(1), { type: "crashConsumer", tag: "server-1" }, reply(1), ack("client")],
};

describe("rpc-and-patterns", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(10);
  });

  it("the story: request to a server, answer to the reply queue, out-of-order answers, a timed-out request", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    // Step 1: the request waits in server-1's hands with its reply address.
    const held = at(1).consumers["server-1"]!.unacked[0]!;
    expect(held).toMatchObject({ replyTo: REPLY, correlationId: "c1" });
    // Step 2: the answer reached the client; the request is done.
    expect(at(2).consumers.client!.unacked.map((m) => m.correlationId)).toEqual(["c1"]);
    expect(depth(at(2), RPC).total).toBe(0);
    // Step 4: c3's answer arrived before c2's.
    expect(at(4).consumers.client!.unacked.map((m) => m.correlationId)).toEqual(["c3", "c2"]);
    // Step 5: with no server, the request with a TTL expired and nobody answered it.
    expect(at(5).lost.at(-1)).toMatchObject({ reason: "expired" });
    expect(depth(at(5), RPC).total).toBe(0);
  });

  it("no mission is won before any move", () => {
    for (const m of missions) expect(m.check(ctxFor(scene, [])), m.id).toBe(false);
  });

  for (const m of missions) {
    it(`${m.id}: the intended solution uses only enabled buttons and wins in exactly par moves`, () => {
      const actions = solutions[m.id]!;
      expect(actions).toHaveLength(m.par);
      actions.forEach((a, i) => {
        const before = ctxFor(scene, actions.slice(0, i));
        expect(scene.moves(before.state, actions.slice(0, i)), `${m.id} move ${i}`).toContainEqual(a);
      });
      expect(m.check(ctxFor(scene, actions))).toBe(true);
    });

    it(`${m.id}: nothing shorter than par wins`, () => {
      expect(searchWin(scene, m.check, m.par - 1)).toBeNull();
    });
  }
});
