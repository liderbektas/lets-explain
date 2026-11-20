import { out, type TermLine } from "@lets-explain/core/lib/terminal";
import { fail, file, flags, makeAppShell, model, readProps, say, type AppAction, type AppBox, type AppLesson, type Program } from "../shared/appShell";
import { apply, CITIES, type Action, type City, type Guarantee, type StreamsEvent, type StreamsState, type Update } from "./model";

/**
 * The order-counter Kafka Streams app as a project: `streams.properties` holds its settings
 * (`processing.guarantee`), `./run-app.sh` starts it and it counts every order waiting, then
 * commits. `./place-order.sh <city>` adds an order; the console consumer reads the
 * `orders-per-city` output; `kafka-streams-application-reset.sh` rewinds a stopped app.
 * A planned crash lives in the hidden `.chaos` file: `crash-before-commit` kills the app after
 * it has counted the waiting orders and before it commits. It fires once.
 */

export type KBox = AppBox<StreamsState>;
export const CONFIG = "streams.properties";
const CHAOS = ".chaos";

export const config = (g: Guarantee) => `application.id=order-counter
bootstrap.servers=localhost:9092
processing.guarantee=${g}
`;

const GUARANTEES: Guarantee[] = ["at_least_once", "exactly_once_v2"];

/** The configured guarantee, or the client's error message. */
function readGuarantee(text: string | undefined): string {
  const g = readProps(text)["processing.guarantee"] ?? "at_least_once";
  if (g === "exactly_once") return "org.apache.kafka.common.config.ConfigException: exactly_once was removed in Kafka 4.0: use exactly_once_v2";
  if (!GUARANTEES.includes(g as Guarantee))
    return `org.apache.kafka.common.config.ConfigException: Invalid value ${g} for configuration processing.guarantee: String must be one of: at_least_once, exactly_once_v2`;
  return g;
}

/** Plain-ASCII city names typed on an English keyboard map to the real ones. */
function cityOf(word: string | undefined): City | null {
  if (!word) return null;
  const plain = (x: string) => x.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/i̇/g, "i").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ü/g, "u");
  return CITIES.find((c) => plain(c) === plain(word)) ?? null;
}

function runApp(box: KBox): Program<Action> {
  const g = readGuarantee(box.files[CONFIG]);
  if (!GUARANTEES.includes(g as Guarantee)) return fail(`Exception in thread "main" ${g}`);
  const guarantee = g as Guarantee;
  const actions: AppAction<Action>[] = [];
  const output: TermLine[] = [];
  let s = box.model;
  const act = (a: Action) => {
    const r = apply(s, a);
    s = r.state;
    actions.push(model(a));
    return r.events;
  };
  if (!s.alive) {
    for (const e of act({ type: "restart" })) {
      if (e.type === "restored") output.push(out(`order-counter | restored the store from order-counter-counts-changelog (${e.entries} entries)`, "dim"));
    }
  } else output.push(out("order-counter | already running", "dim"));
  if (s.guarantee !== guarantee) {
    // Settings are read at start; the running instance closes cleanly (committing) and starts again.
    if (s.alive && s.position !== s.committed) act({ type: "commit" });
    act({ type: "setGuarantee", guarantee });
  }
  output.push(out(`order-counter | State transition from REBALANCING to RUNNING (processing.guarantee=${g})`));
  if (s.position < s.input.length) {
    for (const e of act({ type: "processAll" })) {
      if (e.type === "processed") output.push(out(`order-counter | ${e.city} → ${e.count}${e.again ? "   (this order was counted before)" : ""}`, e.again ? "err" : "out"));
    }
  } else output.push(out("order-counter | no new orders", "dim"));
  if (/crash-before-commit/.test(box.files[CHAOS] ?? "")) {
    act({ type: "crash" });
    actions.push(file(CHAOS, null));
    output.push(out("Killed", "err"), out("(the planned failure hit: the app died before its next commit)", "dim"));
    return { actions, output };
  }
  if (s.position !== s.committed || s.changelog.some((u) => u.status === "open")) {
    act({ type: "commit" });
    output.push(out(`order-counter | committed${g === "exactly_once_v2" ? " the transaction" : ""}: input offset ${s.committed}`));
  }
  output.push(out("(a real app keeps running; the sandbox gives the prompt back)", "dim"));
  return { actions, output };
}

function consume(s: StreamsState, args: string[]): Program<Action> {
  const f = flags(args, ["--bootstrap-server", "--topic", "--property", "--isolation-level", "--group", "--max-messages"]);
  if (!f.values["--bootstrap-server"]) return fail("Missing required argument \"[bootstrap-server]\"");
  const topic = f.values["--topic"]?.[0];
  const committedOnly = f.values["--isolation-level"]?.[0] === "read_committed";
  const withKey = (f.values["--property"] ?? []).includes("print.key=true");
  let updates: Update[];
  if (topic === "orders-per-city") updates = s.output;
  else if (topic === "order-counter-counts-changelog") updates = s.changelog;
  else if (topic === "orders") return say(s.input.map((r) => (withKey ? `${r.city}\t{"city":"${r.city}"}` : `{"city":"${r.city}"}`)).join("\n") + `\nProcessed a total of ${s.input.length} messages`);
  else return fail(`[WARN] Error while fetching metadata: {${topic ?? ""}=UNKNOWN_TOPIC_OR_PARTITION}`);
  if (!f.bare.has("--from-beginning")) return say("(nothing new arrives while it waits; add --from-beginning to read what is there)", "dim");
  const shown = updates.filter((u) => u.status !== "open" || !committedOnly).filter((u) => u.status !== "aborted" || !committedOnly);
  const lines = shown.map((u) => out(`${withKey ? `${u.city}\t` : ""}${u.count}${u.status === "aborted" ? "   ← aborted" : u.status === "open" ? "   ← open" : ""}`, u.status === "committed" ? "out" : "err"));
  return { actions: [], output: [...lines, out(`Processed a total of ${shown.length} messages`)] };
}

export const lesson: AppLesson<StreamsState, Action, StreamsEvent> = {
  dir: "order-counter",
  step: apply,
  names: ["./run-app.sh", "./place-order.sh", "kafka-console-consumer.sh", "kafka-streams-application-reset.sh"],
  help: `This project is a Kafka Streams app: orders → groupBy(city) → count() → orders-per-city.
  nano streams.properties     its settings: processing.guarantee
  ./run-app.sh                start the app; it counts the waiting orders, then commits
  ./place-order.sh İstanbul   add an order (İstanbul, Ankara or İzmir)
  kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic orders-per-city --from-beginning \\
      --property print.key=true [--isolation-level read_committed]
  kafka-streams-application-reset.sh --bootstrap-server localhost:9092 --application-id order-counter --input-topics orders`,
  command(box, words) {
    const [cmd, ...args] = words;
    const s = box.model;
    if (cmd === "./run-app.sh" || (cmd === "java" && args.some((a) => a.endsWith(".jar")))) return runApp(box);
    if (cmd === "./place-order.sh") {
      const city = cityOf(args[0]);
      if (!city) return fail(`usage: ./place-order.sh <city>   (${CITIES.join(", ")})`);
      return { actions: [model({ type: "order", city })], output: [out(`placed an order for ${city} → orders, offset ${s.input.length}`)] };
    }
    if (cmd === "kafka-console-consumer.sh" || cmd === "kafka-console-consumer") return consume(s, args);
    if (cmd === "kafka-streams-application-reset.sh" || cmd === "kafka-streams-application-reset") {
      const f = flags(args, ["--bootstrap-server", "--application-id", "--input-topics"]);
      if (f.values["--application-id"]?.[0] !== "order-counter") return fail(`Error: Missing or wrong --application-id (this app is order-counter)`);
      if (s.alive)
        return fail(`ERROR: Consumer group 'order-counter' is still active and has following members: [order-counter-…-StreamThread-1-consumer]. Make sure to stop all running application instances before running the reset tool. You can use option '--force' to remove active members from the group.`);
      const inputs = (f.values["--input-topics"] ?? []).join(",").split(",").filter(Boolean);
      const output: TermLine[] = [];
      if (inputs.includes("orders")) output.push(out("Reset-offsets for input topics [orders]"), out("Following input topics offsets will be reset to (for consumer group order-counter)"), out("Topic: orders Partition: 0 Offset: 0"));
      else return say("No input or intermediate topics specified. Skipping seek. Done.\n(the app would keep its old position: give --input-topics orders)", "dim");
      output.push(out("Deleting inferred internal topics [order-counter-counts-changelog]"), out("Done."));
      return { actions: [model({ type: "resetApp" })], output };
    }
    return null;
  },
};

export const shell = makeAppShell(lesson);

export const boxOf = (s: StreamsState, chaos = false): KBox => ({
  model: s,
  files: {
    [CONFIG]: config(s.guarantee),
    "run-app.sh": "#!/bin/sh\nexec java -jar order-counter.jar streams.properties",
    "place-order.sh": "#!/bin/sh\necho \"{\\\"city\\\":\\\"$1\\\"}\" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders",
    ...(chaos ? { [CHAOS]: "crash-before-commit" } : {}),
  },
});
