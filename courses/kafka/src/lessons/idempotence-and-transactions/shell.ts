import { out, type TermLine } from "@lets-explain/core/lib/terminal";
import { fail, file, flags, makeAppShell, model, readProps, type AppAction, type AppBox, type AppLesson, type Program } from "../shared/appShell";
import {
  ack,
  begin,
  canDo,
  commitInput,
  commitTxn,
  crash,
  idem,
  isAborted,
  isOpen,
  lastStable,
  orderNo,
  process,
  readC,
  readU,
  restart,
  retry,
  step,
  txns,
  type TAction,
  type TEvent,
  type TState,
} from "./model";

/**
 * The billing app as a project: `billing.properties` holds its producer settings
 * (`enable.idempotence`, `transactional.id`), `./run-billing.sh` starts it, and it invoices
 * every order still waiting. Readers are the real console consumer with its
 * `--isolation-level`. A planned network fault or crash lives in the hidden `.chaos` file:
 * `ack-lost=1` loses the next acknowledgement, `crash-after=write` kills the app right after
 * it writes the next invoice. Each fires once.
 */

export type TBox = AppBox<TState>;
export const CONFIG = "billing.properties";
const CHAOS = ".chaos";

export const PLAIN = `# Producer settings of the billing app
bootstrap.servers=localhost:9092
acks=all
enable.idempotence=false
`;
export const IDEMPOTENT = PLAIN.replace("enable.idempotence=false", "enable.idempotence=true");
export const TRANSACTIONAL = `${IDEMPOTENT}transactional.id=billing-1
`;

export interface BillingConfig {
  idempotent: boolean;
  transactional: boolean;
}

export function readConfig(text: string | undefined): BillingConfig | string {
  const p = readProps(text);
  const idem = (p["enable.idempotence"] ?? "true").toLowerCase();
  if (idem !== "true" && idem !== "false") return `org.apache.kafka.common.config.ConfigException: Invalid value ${p["enable.idempotence"]} for configuration enable.idempotence: Expected value to be either true or false`;
  const transactional = Boolean(p["transactional.id"]);
  if (transactional && idem === "false")
    return "org.apache.kafka.common.config.ConfigException: Cannot set a transactional.id without also enabling idempotence.";
  return { idempotent: idem === "true" || transactional, transactional };
}

const chaos = (box: TBox) => {
  const text = box.files[CHAOS] ?? "";
  return { ackLost: /ack-lost\s*=\s*1/.test(text), crashAfterWrite: /crash-after\s*=\s*write/.test(text) };
};

function runBilling(box: TBox): Program<TAction> {
  const cfg = readConfig(box.files[CONFIG]);
  if (typeof cfg === "string") return fail(`Exception in thread "main" ${cfg}`);
  const actions: AppAction<TAction>[] = [];
  const output: TermLine[] = [];
  let s = box.model;
  const act = (a: TAction) => {
    if (!canDo(s, a.type)) return false;
    actions.push(model(a));
    const r = step(s, a);
    s = r.state;
    for (const e of r.events) {
      if (e.type === "marker" && e.byCoordinator) output.push(out(`billing | the coordinator aborted transaction ${e.txn} left open by the old instance (marker at offset ${e.offset})`, "dim"));
    }
    return true;
  };
  let { ackLost, crashAfterWrite } = chaos(box);
  const disarm = () => actions.push(file(CHAOS, null));

  if (!s.alive) act(restart);
  if (s.idempotent !== cfg.idempotent || s.transactional !== cfg.transactional) {
    if (cfg.transactional) act(txns(true));
    else act(idem(cfg.idempotent));
  }
  output.push(
    out(
      cfg.transactional
        ? `billing | [Producer clientId=billing, transactionalId=billing-1] ProducerId set to ${s.pid} with epoch ${s.epoch}`
        : `billing | [Producer clientId=billing] started, idempotence ${cfg.idempotent ? "on" : "off"}${cfg.idempotent ? `, producer id ${s.pid}` : ""}`,
    ),
  );
  if (s.position >= s.orders) output.push(out("billing | no orders waiting", "dim"));
  while (s.position < s.orders) {
    const order = orderNo(s.position);
    if (s.transactional) act(begin);
    act(process);
    const written = s.log[s.log.length - 1]!;
    output.push(out(`billing | invoice for order ${order} → invoices offset ${written.offset}${written.seq !== null ? ` (pid ${written.pid}, seq ${written.seq})` : ""}`));
    if (crashAfterWrite) {
      crashAfterWrite = false;
      disarm();
      act(crash);
      output.push(out("Killed", "err"), out("(the planned failure hit: the app died after writing, before it committed)", "dim"));
      return { actions, output };
    }
    if (ackLost) {
      ackLost = false;
      disarm();
      const dropped = s.dropped;
      output.push(out(`billing | WARN Got error produce response: NETWORK_EXCEPTION. Retrying (attempt 2)`, "err"));
      act(retry);
      output.push(
        s.dropped > dropped
          ? out(`billing | broker recognised seq ${written.seq} from pid ${written.pid}: the retry was not written again`, "dim")
          : out(`billing | the retry was written again → invoices offset ${s.log.length - 1}`, "err"),
      );
    } else act(ack);
    if (s.transactional) {
      act(commitTxn);
      output.push(out(`billing | committed transaction (invoice + input offset)`));
    } else act(commitInput);
  }
  output.push(out("billing | caught up, waiting for new orders", "dim"), out("(a real app keeps running; the sandbox gives the prompt back)", "dim"));
  return { actions, output };
}

function consume(box: TBox, args: string[]): Program<TAction> {
  const f = flags(args, ["--bootstrap-server", "--topic", "--isolation-level", "--group", "--max-messages", "--consumer-property"]);
  if (!f.values["--bootstrap-server"]) return fail("Missing required argument \"[bootstrap-server]\"");
  const topic = f.values["--topic"]?.[0];
  if (topic !== "invoices") return fail(`[WARN] Error while fetching metadata: {${topic ?? ""}=UNKNOWN_TOPIC_OR_PARTITION}`);
  const level = f.values["--isolation-level"]?.[0] ?? "read_uncommitted";
  if (level !== "read_committed" && level !== "read_uncommitted") return fail(`org.apache.kafka.common.config.ConfigException: Invalid value ${level} for configuration isolation.level: String must be one of: read_committed, read_uncommitted`);
  const who = level === "read_committed" ? "rc" : "ru";
  const s = box.model;
  const r = step(s, who === "rc" ? readC : readU);
  const after = r.state;
  const got = after[who].seen.slice(s[who].seen.length);
  const output: TermLine[] = got.map((o) => {
    const rec = after.log[o]!;
    const tag = isAborted(after, rec) ? "   ← aborted transaction" : isOpen(after, rec) ? "   ← open transaction" : "";
    return out(`invoice:${orderNo(rec.order!)}${tag}`, tag ? "err" : "out");
  });
  if (who === "rc" && lastStable(after) < after.log.length) output.push(out(`(read_committed stops at offset ${lastStable(after)}: a transaction there is still open)`, "dim"));
  output.push(out(`Processed a total of ${got.length} messages`));
  return { actions: [model(who === "rc" ? readC : readU)], output };
}

export const lesson: AppLesson<TState, TAction, TEvent> = {
  dir: "billing",
  step,
  names: ["./run-billing.sh", "kafka-console-consumer.sh"],
  help: `This project is the billing app (orders → invoices):
  nano billing.properties   its producer settings: enable.idempotence, transactional.id
  ./run-billing.sh          start the app; it invoices every order waiting
  kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic invoices --from-beginning
      [--isolation-level read_committed]   read the invoices the way another service would`,
  command(box, words) {
    const [cmd, ...args] = words;
    if (cmd === "./run-billing.sh" || (cmd === "java" && args.includes("billing.jar"))) return runBilling(box);
    if (cmd === "kafka-console-consumer.sh" || cmd === "kafka-console-consumer") return consume(box, args);
    return null;
  },
};

export const shell = makeAppShell(lesson);

export const boxOf = (s: TState, config: string, chaos?: string): TBox => ({
  model: s,
  files: {
    [CONFIG]: config,
    "run-billing.sh": "#!/bin/sh\nexec java -jar billing.jar --config billing.properties",
    ...(chaos ? { [CHAOS]: chaos } : {}),
  },
});

