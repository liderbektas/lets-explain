import { out, type TermLine } from "@lets-explain/core/lib/terminal";
import { fail, file, flags, makeAppShell, model, ok, say, type AppAction, type AppBox, type AppLesson, type Program } from "../shared/appShell";
import { commit, crash, dedupe, lagOf, orderValue, process, produce, read, restart, step, type DAction, type DEvent, type DState } from "./model";

/**
 * The email service as code. `email_consumer.py` holds the loop; what matters is the order of
 * `consumer.commit(...)` and `send_email(...)`, and whether it checks the sent list first.
 * `python email_consumer.py` starts the service and lets it work through what is waiting.
 *
 * A planned failure (a deploy, a power cut) lives in `.chaos`, a hidden file the scenario
 * brings: `crash-after=send` kills the process right after the next email goes out,
 * `crash-after=commit` right after the next commit. It fires once.
 */

export type DBox = AppBox<DState>;
export const CODE = "email_consumer.py";
const CHAOS = ".chaos";

const head = `from confluent_kafka import Consumer
from mailer import send_email, already_sent

consumer = Consumer({
    "bootstrap.servers": "localhost:9092",
    "group.id": "email-service",
    "enable.auto.commit": False,
})
consumer.subscribe(["orders"])

while True:
    msg = consumer.poll(1.0)
    if msg is None:
        continue`;

/** Commits first: a crash between the two lines loses the email. */
export const COMMIT_FIRST = `${head}
    consumer.commit(msg)          # save the position in Kafka
    send_email(msg.value())       # the customer gets an email
`;

/** Sends first: a crash between the two lines sends it again after the restart. */
export const SEND_FIRST = `${head}
    send_email(msg.value())       # the customer gets an email
    consumer.commit(msg)          # save the position in Kafka
`;

/** Sends first and skips orders already in the sent list. */
export const SEND_FIRST_DEDUPE = `${head}
    if not already_sent(msg.value()):
        send_email(msg.value())   # the customer gets an email
    consumer.commit(msg)          # save the position in Kafka
`;

export interface Loop {
  /** In loop order: what happens after a record is read. */
  order: ("commit" | "send")[];
  dedupe: boolean;
}

/** Reads the loop body: the order of commit and send, and whether a sent-list check guards the send. */
export function readLoop(code: string | undefined): Loop | null {
  if (code === undefined) return null;
  const body = code.split("\n");
  const start = body.findIndex((l) => /^\s*while\s+True\s*:/.test(l));
  if (start === -1) return null;
  const order: Loop["order"] = [];
  let dedupe = false;
  for (const raw of body.slice(start + 1)) {
    const line = raw.replace(/#.*$/, "");
    if (/already_sent\(/.test(line) && /\bif\b/.test(line)) dedupe = true;
    if (/consumer\.commit\(/.test(line)) order.push("commit");
    if (/send_email\(/.test(line)) order.push("send");
  }
  return { order, dedupe };
}

const chaosOf = (box: DBox) => /crash-after\s*=\s*(send|commit)/.exec(box.files[CHAOS] ?? "")?.[1] as "send" | "commit" | undefined;

function runService(box: DBox): Program<DAction> {
  const loop = readLoop(box.files[CODE]);
  if (!(CODE in box.files)) return fail(`python: can't open file '/home/you/email-service/${CODE}': [Errno 2] No such file or directory`);
  if (!loop || !loop.order.includes("send")) return fail(`  File "${CODE}", the loop has no send_email(...) call: this sandbox needs the poll loop with send_email and consumer.commit.`);
  const actions: AppAction<DAction>[] = [];
  const output: TermLine[] = [];
  let s = box.model;
  const act = (a: DAction) => {
    actions.push(model(a));
    s = step(s, a).state;
  };
  let chaos = chaosOf(box);
  if (!s.alive) {
    act(restart);
    output.push(out(`email-service | started, group email-service resumes at offset ${s.committed}`));
  } else output.push(out(`email-service | running, at offset ${s.position}`, "dim"));
  if (s.dedupe !== loop.dedupe) act(dedupe(loop.dedupe));
  while (s.position < s.records.length) {
    const offset = s.position;
    act(read);
    output.push(out(`email-service | polled ${orderValue(offset)} (offset ${offset})`));
    for (const what of loop.order) {
      if (what === "commit") {
        act(commit);
        output.push(out(`email-service | committed: next offset ${s.committed}`));
      } else {
        const before = s.sent[offset] ?? 0;
        act(process);
        output.push(out(s.sent[offset] === before ? `email-service | ${orderValue(offset)} already in the sent list, skipped` : `email-service | sent email for ${orderValue(offset)}`, (s.sent[offset] ?? 0) > 1 ? "err" : "out"));
      }
      if (chaos === what) {
        act(crash);
        actions.push(file(CHAOS, null));
        chaos = undefined;
        output.push(out("Killed", "err"), out("(the planned failure hit: the process died right there)", "dim"));
        return { actions, output };
      }
    }
  }
  output.push(out("email-service | caught up, waiting for new orders", "dim"), out("(a real consumer keeps running; the sandbox gives the prompt back)", "dim"));
  return { actions, output };
}

function describeGroup(s: DState): Program<DAction> {
  const pad = (x: string | number, n: number) => String(x).padEnd(n);
  return say(
    [
      s.alive ? "" : "Consumer group 'email-service' has no active members.\n",
      `${pad("GROUP", 15)}${pad("TOPIC", 8)}${pad("PARTITION", 11)}${pad("CURRENT-OFFSET", 16)}${pad("LOG-END-OFFSET", 16)}${pad("LAG", 5)}CONSUMER-ID`,
      `${pad("email-service", 15)}${pad("orders", 8)}${pad(0, 11)}${pad(s.committed, 16)}${pad(s.records.length, 16)}${pad(lagOf(s), 5)}${s.alive ? "consumer-email-service-1" : "-"}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

export const lesson: AppLesson<DState, DAction, DEvent> = {
  dir: "email-service",
  step,
  names: ["python", "./place-order.sh", "kafka-consumer-groups.sh"],
  help: `This project is the email service:
  nano email_consumer.py    the consumer loop: read, send the email, commit
  python email_consumer.py  start the service; it handles what is waiting
  ./place-order.sh          place a test order (one record on orders)
  kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group email-service`,
  command(box, words) {
    const [cmd, ...args] = words;
    if (cmd === "python" || cmd === "python3") {
      const script = args[0];
      if (!script) return say("(start the service with: python email_consumer.py)", "dim");
      if (script !== CODE) return fail(`python: can't open file '/home/you/email-service/${script}': [Errno 2] No such file or directory`);
      return runService(box);
    }
    if (cmd === "./place-order.sh") {
      const offset = box.model.records.length;
      return ok([out(`placed ${orderValue(offset)} → orders, offset ${offset}`)], [model(produce)]);
    }
    if (cmd === "kafka-consumer-groups.sh" || cmd === "kafka-consumer-groups") {
      const f = flags(args, ["--bootstrap-server", "--group"]);
      if (!f.values["--bootstrap-server"]) return fail("Missing required argument \"[bootstrap-server]\"");
      if (f.bare.has("--list")) return say("email-service");
      if (!f.bare.has("--describe")) return fail("Command must include exactly one action: --list, --describe, --delete, --reset-offsets");
      if (f.values["--group"]?.[0] !== "email-service") return fail(`Error: Consumer group '${f.values["--group"]?.[0] ?? ""}' does not exist.`);
      return describeGroup(box.model);
    }
    return null;
  },
};

export const shell = makeAppShell(lesson);

export const boxOf = (s: DState, code: string, chaos?: "send" | "commit"): DBox => ({
  model: s,
  files: {
    [CODE]: code,
    "place-order.sh": "#!/bin/sh\necho \"order:$NEXT\" | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic orders",
    ...(chaos ? { [CHAOS]: `crash-after=${chaos}` } : {}),
  },
});
