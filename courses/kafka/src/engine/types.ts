/** "orders-0": topic name + partition index, the way Kafka tools print it. */
export type TP = string;

export const tp = (topic: string, partition: number): TP => `${topic}-${partition}`;

export interface Broker {
  id: number;
  alive: boolean;
}

export interface KafkaRecord {
  offset: number;
  key: string | null;
  value: string;
  producer: string;
  time: number;
}

export interface Partition {
  topic: string;
  index: number;
  leader: number;
  /** First offset still on disk. Retention moves it forward; it never moves back. */
  logStartOffset: number;
  /** Offset the next record will get. Offsets are never reused. */
  logEndOffset: number;
  records: KafkaRecord[];
}

export interface Topic {
  name: string;
  partitions: Partition[];
}

export type OffsetReset = "earliest" | "latest";

export interface Member {
  id: string;
  assigned: TP[];
  /** Next offset this member will read, per partition. Lives only in the member's memory. */
  positions: Record<TP, number>;
}

export interface Delivery {
  tp: TP;
  offset: number;
  member: string;
  time: number;
}

export interface Group {
  id: string;
  topics: string[];
  members: Member[];
  /** Committed offset = the next offset to read after a restart (not the last one read). */
  committed: Record<TP, number>;
  generation: number;
  autoOffsetReset: OffsetReset;
  deliveries: Delivery[];
  /** Records the group never received because retention deleted them first. */
  skipped: number;
}

export interface ClusterState {
  time: number;
  brokers: Broker[];
  topics: Record<string, Topic>;
  groups: Record<string, Group>;
  /** Round-robin cursor for records without a key, per topic. */
  roundRobin: Record<string, number>;
}

export type Action =
  | { type: "createTopic"; name: string; partitions: number }
  | {
      type: "produce";
      topic: string;
      value: string;
      key?: string | null;
      producer?: string;
      /** Explicit partition; overrides the key. */
      partition?: number;
    }
  | {
      type: "joinGroup";
      group: string;
      member: string;
      topics: string[];
      autoOffsetReset?: OffsetReset;
    }
  | { type: "leaveGroup"; group: string; member: string }
  | { type: "crashMember"; group: string; member: string }
  | { type: "poll"; group: string; member: string; max?: number }
  | { type: "commit"; group: string; member: string }
  | { type: "seek"; group: string; member: string; tp: TP; offset: number }
  | { type: "deleteRecordsBefore"; topic: string; partition: number; offset: number }
  /** Grows a topic to `count` partitions. Kafka can add partitions but never remove them. */
  | { type: "addPartitions"; topic: string; count: number }
  /** `kafka-consumer-groups.sh --reset-offsets --execute`: rewrites a group's committed offsets. The group must have no members. */
  | { type: "resetOffsets"; group: string; offsets: Record<TP, number> };

export type SimEvent =
  | { type: "topicCreated"; topic: string; partitions: number }
  | {
      type: "produced";
      topic: string;
      partition: number;
      offset: number;
      key: string | null;
      value: string;
      producer: string;
      routedBy: "key" | "round-robin" | "explicit";
    }
  | { type: "memberJoined"; group: string; member: string }
  | {
      type: "memberLeft";
      group: string;
      member: string;
      crashed: boolean;
      /** Progress that was read but never committed, so the next owner reads it again. */
      uncommitted: { tp: TP; committed: number | null; position: number }[];
    }
  | { type: "rebalanced"; group: string; generation: number; assignment: Record<string, TP[]> }
  | {
      type: "positionReset";
      group: string;
      member: string;
      tp: TP;
      from: number | null;
      to: number;
      reason: "no-commit" | "out-of-range";
    }
  | {
      type: "delivered";
      group: string;
      member: string;
      tp: TP;
      offset: number;
      duplicate: boolean;
    }
  | { type: "pollEmpty"; group: string; member: string }
  | { type: "committed"; group: string; member: string; offsets: Record<TP, number> }
  | { type: "seeked"; group: string; member: string; tp: TP; from: number; to: number }
  | { type: "recordsDeleted"; topic: string; partition: number; from: number; to: number }
  | { type: "partitionsAdded"; topic: string; from: number; to: number }
  | { type: "offsetsReset"; group: string; offsets: Record<TP, { from: number | null; to: number }> }
  | { type: "error"; message: string };

export interface StepResult {
  state: ClusterState;
  events: SimEvent[];
}
