import { describe, expect, it } from "vitest";
import { typeInto } from "../shared/testing";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

const CHAT = '{"type":"chat","text":"hi from the bot"}';

const solutions: Record<string, string[]> = {
  "live-feed": ["curl -N --max-time 10 localhost:8080/events"],
  resume: ["curl -N -m 5 -H 'Last-Event-ID: 5' localhost:8080/events"],
  "two-way": ["wscat -c ws://localhost:8081", CHAT],
  announce: [`curl --json '{"text":"Deploy started"}' localhost:8080/messages`],
};

const alternatives: Record<string, string[][]> = {
  "live-feed": [["curl -N localhost:8080/events"], ["curl -sN -m 15 http://localhost:8080/events"]],
  resume: [["curl -N --max-time 3 --header 'Last-Event-ID: 5' localhost:8080/events"]],
  "two-way": [[`wscat -c ws://localhost:8081 -x '${CHAT}'`], ["wscat -c ws://localhost:8081", CHAT, "^C"]],
  announce: [[`curl -X POST -H 'Content-Type: application/json' -d '{"text":"Deploy started"}' http://localhost:8080/messages`]],
};

const wrong: Record<string, string[]> = {
  // Long polling gets both, but with two requests.
  "live-feed": ["curl 'localhost:8080/messages?after=3&wait=30'", "curl 'localhost:8080/messages?after=4&wait=30'"],
  // Reconnecting without saying where it stopped: only what comes next.
  resume: ["curl -N -m 5 localhost:8080/events"],
  // Two connections: one to write, one to listen.
  "two-way": [`curl --json '${CHAT.replace('"type":"chat",', "")}' localhost:8080/messages`, "curl -N -m 3 -H 'Last-Event-ID: 3' localhost:8080/events"],
  // A form body: the server wants JSON and answers 415.
  announce: ["curl -d 'text=Deploy started' localhost:8080/messages"],
};

describe("sse-and-websocket", () => {
  const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;

  it("the story: one stream, a resume, a POST beside it, then one socket both ways", () => {
    expect(steps).toHaveLength(7);
    const stream = at(0).exchanges[0]!;
    expect(stream.kind).toBe("sse");
    expect(stream.delivered).toEqual([3, 4]);
    const resumed = at(1).exchanges.at(-1)!;
    expect(resumed.delivered).toEqual([5]);
    expect(at(2).messages.at(-1)).toMatchObject({ via: "post" });
    const conn = at(3).conns[0]!;
    expect(conn.frames.map((f) => f.dir)).toEqual(["out", "in", "in"]);
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
