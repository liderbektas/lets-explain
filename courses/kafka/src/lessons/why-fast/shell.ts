import { out } from "@lets-explain/core/lib/terminal";
import { fail, flags, makeAppShell, readProps, say, type AppBox, type AppLesson, type Program } from "../shared/appShell";
import { measure, PER_CONSUMER, type Settings } from "./model";

/**
 * The `events` pipeline as a project you tune and measure:
 * - `producer.properties`: `batch.size` (bytes; records are 1 KB, so 102400 packs 100 records
 *   per request) and `compression.type` (`none` or `lz4` here).
 * - `kafka-topics.sh --alter --partitions N` grows the topic; `docker compose up -d --scale
 *   processor=N` runs N consumers in the `processors` group.
 * - `kafka-producer-perf-test.sh ... --producer.config producer.properties` measures, and
 *   what it measures is what the scene shows.
 */

export type FAction = { type: "set"; settings: Settings };
export type FEvent = { type: "changed"; from: Settings; to: Settings };
export type FBox = AppBox<Settings>;

export const CONFIG = "producer.properties";
const MAX_PARTITIONS = 8;
const MAX_PROCESSORS = 8;

export const START_CONFIG = `bootstrap.servers=localhost:9092
# set low "to cut latency" in an old incident
batch.size=1024
linger.ms=0
compression.type=none
`;

export function step(from: Settings, a: FAction): { state: Settings; events: FEvent[] } {
  return { state: a.settings, events: [{ type: "changed", from, to: a.settings }] };
}

const set = (s: Settings): FAction => ({ type: "set", settings: s });

/** Producer settings from the file: records per request and compression. */
function readProducer(text: string | undefined): Pick<Settings, "batch" | "compression"> | string {
  const p = readProps(text);
  const bytes = Number(p["batch.size"] ?? 16384);
  if (!Number.isInteger(bytes) || bytes < 0) return `org.apache.kafka.common.config.ConfigException: Invalid value ${p["batch.size"]} for configuration batch.size: Not a number of type INT`;
  if (bytes > 1048576) return `org.apache.kafka.common.config.ConfigException: batch.size ${bytes} is larger than max.request.size 1048576: a batch could never be sent`;
  const comp = (p["compression.type"] ?? "none").toLowerCase();
  if (!["none", "gzip", "snappy", "lz4", "zstd"].includes(comp))
    return `org.apache.kafka.common.config.ConfigException: Invalid value ${comp} for configuration compression.type: String must be one of: none, gzip, snappy, lz4, zstd`;
  if (comp !== "none" && comp !== "lz4") return `(this sandbox models lz4 only: its ratio is set to 1/2. Real ratios depend on the data; try compression.type=lz4)`;
  return { batch: Math.max(1, Math.floor(bytes / 1024)), compression: comp };
}

function perfTest(box: FBox, args: string[]): Program<FAction> {
  const f = flags(args, ["--topic", "--num-records", "--record-size", "--throughput", "--producer.config", "--producer-props", "--bootstrap-server"]);
  if (f.values["--topic"]?.[0] !== "events") return fail(`Error: the perf test here writes to the events topic (--topic events)`);
  const size = Number(f.values["--record-size"]?.[0] ?? 0);
  if (size !== 1024) return say("(the records in this pipeline are 1 KB: use --record-size 1024)", "dim");
  const cfgPath = f.values["--producer.config"]?.[0];
  if (cfgPath && box.files[cfgPath] === undefined) return fail(`Exception in thread "main" java.nio.file.NoSuchFileException: ${cfgPath}`);
  const producer = cfgPath ? readProducer(box.files[cfgPath]) : { batch: 16, compression: "none" as const };
  if (typeof producer === "string") return producer.startsWith("(") ? say(producer, "dim") : fail(`Exception in thread "main" ${producer}`);
  const settings: Settings = { ...box.model, ...producer };
  const m = measure(settings);
  const n = Number(f.values["--num-records"]?.[0] ?? 1000000) || 1000000;
  const mbps = ((m.produce * 1024) / 1048576).toFixed(2);
  const latency = ((settings.batch / Math.max(1, m.produce)) * 1000 + 1).toFixed(1);
  return {
    actions: [{ kind: "model", action: set(settings) }],
    output: [
      out(`${n} records sent, ${m.produce.toFixed(1)} records/sec (${mbps} MB/sec), ${latency} ms avg latency`),
      out(`(${m.requests} produce requests/sec, network ${m.networkMB} MB/s${m.networkBound ? ": the network is the limit" : ""})`, "dim"),
      out(`processors group: ${m.working} consumer${m.working === 1 ? "" : "s"} working${m.idle ? `, ${m.idle} idle with no partition` : ""} → ${m.consume.toFixed(0)} records/sec processed`, m.consume < m.produce ? "err" : "dim"),
    ],
  };
}

function topics(box: FBox, args: string[]): Program<FAction> {
  const f = flags(args, ["--bootstrap-server", "--topic", "--partitions"]);
  if (!f.values["--bootstrap-server"]) return fail("Missing required argument \"[bootstrap-server]\"");
  const s = box.model;
  if (f.bare.has("--describe")) return say(`Topic: events\tPartitionCount: ${s.partitions}\tReplicationFactor: 1\n${Array.from({ length: s.partitions }, (_, i) => `\tTopic: events\tPartition: ${i}\tLeader: 1\tReplicas: 1\tIsr: 1`).join("\n")}`);
  if (f.bare.has("--list")) return say("events");
  if (!f.bare.has("--alter")) return fail("Command must include exactly one action: --list, --describe, --create, --alter or --delete");
  if (f.values["--topic"]?.[0] !== "events") return fail(`Error while executing topic command : Topic '${f.values["--topic"]?.[0] ?? ""}' does not exist as expected`);
  const n = Number(f.values["--partitions"]?.[0]);
  if (!Number.isInteger(n) || n < 1) return fail("Error while executing topic command : The partitions must be a positive number");
  if (n <= s.partitions) return fail(`Error while executing topic command : The number of partitions for a topic can only be increased. Topic events currently has ${s.partitions} partitions, ${n} would not be an increase.`);
  if (n > MAX_PARTITIONS) return say(`(this sandbox's cluster goes up to ${MAX_PARTITIONS} partitions)`, "dim");
  return { actions: [{ kind: "model", action: set({ ...s, partitions: n }) }], output: [] };
}

function compose(box: FBox, args: string[]): Program<FAction> {
  const at = args.findIndex((a) => a === "--scale" || a.startsWith("--scale="));
  const spec = at === -1 ? undefined : args[at]!.includes("=") ? args[at]!.split("=").slice(1).join("=") : args[at + 1];
  if (args[0] !== "up" || !spec) return say("(scale the consumers with: docker compose up -d --scale processor=4)", "dim");
  const m = /^processor=(\d+)$/.exec(spec);
  if (!m) return fail(`no such service: ${spec.split("=")[0]}`);
  const n = Number(m[1]);
  if (n < 1 || n > MAX_PROCESSORS) return say(`(between 1 and ${MAX_PROCESSORS} processors here)`, "dim");
  const s = box.model;
  const lines = Array.from({ length: n }, (_, i) => out(` ✔ Container events-processor-${i + 1}  ${i < s.consumers ? "Running" : "Started"}`));
  return { actions: n === s.consumers ? [] : [{ kind: "model", action: set({ ...s, consumers: n }) }], output: [out(`[+] Running ${n}/${n}`), ...lines] };
}

export const lesson: AppLesson<Settings, FAction, FEvent> = {
  dir: "events-pipeline",
  step,
  names: ["kafka-producer-perf-test.sh", "kafka-topics.sh", "docker"],
  help: `Tune the events pipeline, then measure it:
  nano producer.properties     batch.size (bytes, records are 1 KB), compression.type
  kafka-producer-perf-test.sh --topic events --num-records 1000000 --record-size 1024 \\
      --throughput -1 --producer.config producer.properties
  kafka-topics.sh --bootstrap-server localhost:9092 --alter --topic events --partitions 4
  docker compose up -d --scale processor=4     consumers in the processors group
Each consumer processes ${PER_CONSUMER.toLocaleString("en-US")} records/sec.`,
  command(box, words) {
    const [cmd, ...args] = words;
    if (cmd === "kafka-producer-perf-test.sh" || cmd === "kafka-producer-perf-test") return perfTest(box, args);
    if (cmd === "kafka-topics.sh" || cmd === "kafka-topics") return topics(box, args);
    if (cmd === "docker" && args[0] === "compose") return compose(box, args.slice(1));
    if (cmd === "docker-compose") return compose(box, args);
    return null;
  },
};

export const shell = makeAppShell(lesson);

export const START: FBox = {
  model: { batch: 1, compression: "none", partitions: 1, consumers: 1 },
  files: { [CONFIG]: START_CONFIG, "docker-compose.yml": "services:\n  processor:\n    image: shop/events-processor\n    environment:\n      GROUP_ID: processors" },
};
