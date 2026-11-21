import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, string[]> = {
  "first-look": ["curl localhost:8080/messages"],
  "only-new": ["curl 'localhost:8080/messages?after=3'"],
  "no-empty-polls": ["curl 'localhost:8080/messages?after=5&wait=30'"],
  "night-shift": ["curl -i 'localhost:8080/messages?after=6&wait=30'", "curl -i 'localhost:8080/messages?after=6&wait=30'"],
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, string[][]> = {
  "first-look": [["curl localhost:8080", "curl -s localhost:8080/messages | jq"], ["curl -i http://localhost:8080/messages?after=0"]],
  "only-new": [["curl -s \"http://localhost:8080/messages?after=3\" | jq '.[].text'"]],
  "no-empty-polls": [
    ["curl -i 'localhost:8080/messages?after=5&wait=20'"],
    ["curl 'localhost:8080/messages?after=5&wait=5'", "curl 'localhost:8080/messages?after=5&wait=30'"],
  ],
  "night-shift": [["curl 'localhost:8080/messages?after=6&wait=60'", "curl 'localhost:8080/messages?after=6&wait=60'", "curl 'localhost:8080/messages?after=6&wait=60'"]],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, string[]> = {
  // HEAD shows that there is something, not the messages.
  "first-look": ["curl -I localhost:8080/messages"],
  // It works, but downloads the whole history again.
  "only-new": ["curl localhost:8080/messages"],
  // Waiting and then asking gets it, but two seconds late.
  "no-empty-polls": ["sleep 10", "curl 'localhost:8080/messages?after=5'"],
  // An unquoted & sends curl to the background without `wait`: a plain poll, empty.
  "night-shift": ["curl localhost:8080/messages?after=6&wait=30", "sleep 45", "curl localhost:8080/messages?after=6&wait=30"],
};

describe("polling", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;

  it("the story: 4 empty polls, a long poll that answers on the spot, a 204, and a message kept for the next ask", () => {
    expect(steps).toHaveLength(7);
    const polls = at(1).exchanges.slice(at(0).exchanges.length);
    expect(polls).toHaveLength(5);
    expect(polls.filter((e) => e.empty)).toHaveLength(4);
    expect(at(1).seen[3]! - at(1).messages[2]!.at).toBe(1000);
    expect(at(2).exchanges.slice(at(1).exchanges.length).every((e) => e.empty)).toBe(true);
    const lp = at(3).exchanges.find((e) => e.kind === "longpoll" && e.delivered.includes(4))!;
    expect(lp.doneAt).toBe(16000);
    expect(at(4).exchanges.some((e) => e.status === 204 && e.doneAt === 46000)).toBe(true);
    expect(at(5).seen[6]).toBeDefined();
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const r = typeInto(s.start, solutions[s.id]!);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx)).toBe(true);
    });

    for (const alt of alternatives[s.id] ?? []) {
      it(`${s.id}: also wins with ${alt.join(" ; ")}`, () => {
        expect(s.check(typeInto(s.start, alt).ctx)).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      expect(s.check(typeInto(s.start, wrong[s.id]!).ctx)).toBe(false);
    });
  }
});
