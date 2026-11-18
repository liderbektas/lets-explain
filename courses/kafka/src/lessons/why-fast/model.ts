/**
 * A tiny throughput model for "why is Kafka fast". It is not a benchmark: the numbers are
 * round on purpose, so a reader can see each setting's effect on its own.
 *
 * - Every record is 1 KB. The network carries 100 MB/s.
 * - A produce request costs 1 ms of round trip plus the time to send its bytes.
 *   One partition sends one request at a time (real producers keep up to 5 in flight).
 * - lz4 halves the bytes (real ratios depend on the data).
 * - A consumer can process 25,000 records a second, and only one consumer per partition
 *   in a group gets work.
 */

export interface Settings {
  batch: number;
  compression: "none" | "lz4";
  partitions: number;
  consumers: number;
}

const RECORD_KB = 1;
const ROUND_TRIP_MS = 1;
const NETWORK_KB_PER_S = 100_000;
const LZ4_RATIO = 0.5;
export const PER_CONSUMER = 25_000;

export interface Measure {
  /** Records written per second. */
  produce: number;
  /** Produce requests per second. */
  requests: number;
  /** Network use, MB/s. */
  networkMB: number;
  /** Whether the network is the limit. */
  networkBound: boolean;
  /** Records the consumer group processes per second. */
  consume: number;
  working: number;
  idle: number;
}

export function measure(s: Settings): Measure {
  const ratio = s.compression === "lz4" ? LZ4_RATIO : 1;
  const sendMs = (s.batch * RECORD_KB * ratio * 1000) / NETWORK_KB_PER_S;
  const perPartition = s.batch / ((ROUND_TRIP_MS + sendMs) / 1000);
  const networkCap = NETWORK_KB_PER_S / (RECORD_KB * ratio);
  const raw = perPartition * s.partitions;
  const produce = Math.floor(Math.min(raw, networkCap));
  const working = Math.min(s.consumers, s.partitions);
  return {
    produce,
    requests: Math.round((produce / s.batch) * 10) / 10,
    networkMB: Math.round((produce * RECORD_KB * ratio) / 100) / 10,
    networkBound: raw >= networkCap,
    consume: Math.min(produce, working * PER_CONSUMER),
    working,
    idle: s.consumers - working,
  };
}

/* ------------------------------------------------------------------ steps */

export type Mode = "pipeline" | "disk" | "cache" | "zeroCopy";

export interface StepView {
  mode: Mode;
  /** Settings before and after the step's reveal (the second beat). */
  before: Settings;
  after: Settings;
}

const S = (batch: number, compression: Settings["compression"], partitions: number, consumers: number): Settings => ({
  batch,
  compression,
  partitions,
  consumers,
});

const pipe = (before: Settings, after = before): StepView => ({ mode: "pipeline", before, after });
const quiet = S(10, "none", 2, 2);

// Each step changes one thing, and the readers keep up unless the step is about them.
export const steps: StepView[] = [
  pipe(quiet),
  { mode: "disk", before: quiet, after: quiet },
  { mode: "cache", before: quiet, after: quiet },
  { mode: "zeroCopy", before: quiet, after: quiet },
  pipe(S(1, "none", 8, 8), S(100, "none", 8, 8)),
  pipe(S(100, "none", 8, 8), S(100, "lz4", 8, 8)),
  pipe(S(100, "none", 1, 1), S(100, "none", 4, 5)),
  pipe(S(1000, "lz4", 8, 8)),
  pipe(S(1, "none", 1, 1)),
];

export const SANDBOX_STEP = steps.length - 1;

/* ---------------------------------------------------------------- sandbox */

export const BATCHES = [1, 10, 100, 1000];
export const PARTITIONS = [1, 2, 4, 8];
export const CONSUMERS = [1, 2, 4, 8];

export interface Knobs {
  batch: number;
  lz4: boolean;
  partitions: number;
  consumers: number;
}

export const START_KNOBS: Knobs = { batch: 0, lz4: false, partitions: 0, consumers: 0 };

export type SandboxMove = "batch+" | "batch-" | "lz4" | "none" | "part+" | "part-" | "cons+" | "cons-";
export const MOVES: SandboxMove[] = ["batch+", "batch-", "lz4", "none", "part+", "part-", "cons+", "cons-"];

/** Applies a move, or returns null when its button would be disabled. */
export function applyMove(k: Knobs, m: SandboxMove): Knobs | null {
  const step = (v: number, d: number, max: number) => (v + d < 0 || v + d > max ? null : v + d);
  switch (m) {
    case "batch+":
    case "batch-": {
      const v = step(k.batch, m === "batch+" ? 1 : -1, BATCHES.length - 1);
      return v === null ? null : { ...k, batch: v };
    }
    case "lz4":
      return k.lz4 ? null : { ...k, lz4: true };
    case "none":
      return k.lz4 ? { ...k, lz4: false } : null;
    case "part+":
    case "part-": {
      const v = step(k.partitions, m === "part+" ? 1 : -1, PARTITIONS.length - 1);
      return v === null ? null : { ...k, partitions: v };
    }
    case "cons+":
    case "cons-": {
      const v = step(k.consumers, m === "cons+" ? 1 : -1, CONSUMERS.length - 1);
      return v === null ? null : { ...k, consumers: v };
    }
  }
}

export const settingsOf = (k: Knobs): Settings =>
  S(BATCHES[k.batch]!, k.lz4 ? "lz4" : "none", PARTITIONS[k.partitions]!, CONSUMERS[k.consumers]!);

export function knobsAfter(moves: SandboxMove[]): Knobs {
  let k = START_KNOBS;
  for (const m of moves) k = applyMove(k, m) ?? k;
  return k;
}
