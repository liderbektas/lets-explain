import { describe, expect, it } from "vitest";
import { depth } from "../../engine/broker";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { scene, steps } from "./Scene";

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
const declared = (q: string) => `ch.queue_declare(queue="${q}", durable=True)`;
const bindLine = (q: string, match: string) => `ch.queue_bind(exchange="docs", queue="${q}", arguments={"x-match": "${match}", "format": "pdf", "region": "eu"})`;
const RUN = ["nano setup.py", "python setup.py", "python upload.py"];
const DOCS_DECLARE = 'exchange_type="headers", durable=True)';
const WITH_ALTERNATE = 'exchange_type="headers", durable=True, arguments={"alternate-exchange": "unrouted"})';
const REFUND = 'body=b"refund for order 1001")';

/** What a reader would type for each scenario: the intended way, in exactly par commands. */
const solutions: Record<string, Play> = {
  "eu-pdfs": { typed: RUN, edits: [addLine(declared("pdf-eu"), bindLine("pdf-eu", "all"))] },
  "gdpr-review": { typed: RUN, edits: [addLine(declared("review"), bindLine("review", "any"))] },
  "lost-and-found": { typed: RUN, edits: [swap(DOCS_DECLARE, WITH_ALTERNATE)] },
  "returned-refund": { typed: ["nano send_refund.py", "python send_refund.py"], edits: [swap(REFUND, 'body=b"refund for order 1001", mandatory=True)')] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Play[]> = {
  "eu-pdfs": [{ typed: ["rabbitmqctl list_bindings source_name destination_name arguments", ...RUN], edits: [addLine(declared("pdf-eu"), bindLine("pdf-eu", "all"))] }],
  "returned-refund": [
    {
      typed: ["nano send_refund.py", "python send_refund.py"],
      edits: [(t) => swap(REFUND, 'body=b"refund for order 1001", mandatory=True)')(t).replace("ch = connection.channel()", "ch = connection.channel()\nch.confirm_delivery()")],
    },
  ],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Play> = {
  // `any`: US PDFs and EU CSVs slip in.
  "eu-pdfs": { typed: RUN, edits: [addLine(declared("pdf-eu"), bindLine("pdf-eu", "any"))] },
  // `all`: only the EU PDF.
  "gdpr-review": { typed: RUN, edits: [addLine(declared("review"), bindLine("review", "all"))] },
  // Running the setup first: the fixed declare is then refused, and the upload loses csv/us.
  "lost-and-found": { typed: ["python setup.py", "nano setup.py", "python setup.py", "python upload.py"], edits: [swap(DOCS_DECLARE, WITH_ALTERNATE)] },
  // Confirms alone: the broker confirms the drop, and the message is still gone.
  "returned-refund": { typed: ["nano send_refund.py", "python send_refund.py"], edits: [swap("ch = connection.channel()", "ch = connection.channel()\nch.confirm_delivery()")] },
};

describe("headers-and-alternate", () => {
  it("every lesson step runs without a broker error", () => {
    expect(scene.run.events.flat().filter((e) => e.type === "error")).toEqual([]);
    expect(steps).toHaveLength(8);
  });

  it("the story: all vs any, a lost message, the alternate catching it, mandatory returning", () => {
    const at = (step: number) => scene.run.states[scene.stepEnd(step)]!;
    const evs = (step: number) => scene.run.events.slice(scene.stepStart(step), scene.stepEnd(step)).flat();
    expect(depth(at(1), "pdf-eu").ready).toBe(1);
    expect(depth(at(1), "pdf-or-eu").ready).toBe(1);
    expect(depth(at(2), "pdf-eu").ready).toBe(1);
    expect(depth(at(2), "pdf-or-eu").ready).toBe(2);
    expect(at(3).lost).toEqual([{ id: "m3", reason: "unroutable" }]);
    expect(depth(at(4), "unrouted").ready).toBe(1);
    expect(at(4).lost).toHaveLength(1);
    const unroutable = evs(5).filter((e) => e.type === "unroutable");
    expect(unroutable.map((e) => e.type === "unroutable" && e.returned)).toEqual([false, true]);
    // The returned one is not counted as lost: the producer got it back.
    expect(at(5).lost).toHaveLength(2);
  });

  it("redeclaring docs with an alternate is refused, as RabbitMQ does", () => {
    const s = scenarios.find((x) => x.id === "lost-and-found")!;
    const w = wrong["lost-and-found"]!;
    const out = typeInto(s.start, w.typed, [...(w.edits ?? [])]).output;
    expect(out.find((x) => x.includes("inequivalent arg 'alternate-exchange'"))).toContain("PRECONDITION_FAILED");
  });

  it("with confirms on, the returned refund raises UnroutableError in the script", () => {
    const s = scenarios.find((x) => x.id === "returned-refund")!;
    const alt = alternatives["returned-refund"]![0]!;
    const out = typeInto(s.start, alt.typed, [...(alt.edits ?? [])]).output;
    expect(out.at(-1)).toContain("UnroutableError");
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
