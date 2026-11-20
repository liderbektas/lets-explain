import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { createCluster } from "./cluster";
import { applyAll, boxOf, emptyBox, kafkaShell, type KafkaBox } from "./cli";
import { partitionForKey } from "./murmur2";

const B = "--bootstrap-server localhost:9092";
const type = (box: KafkaBox, typed: string[]) => typeLines(kafkaShell, applyAll, box, typed);

describe("kafka cli", () => {
  it("creates, lists and describes topics like kafka-topics.sh", () => {
    const r = type(emptyBox(), [`kafka-topics.sh ${B} --create --topic orders --partitions 3`, `kafka-topics.sh ${B} --list`, `kafka-topics.sh ${B} --describe --topic orders`]);
    expect(r.output[0]).toBe("Created topic orders.");
    expect(r.output[1]).toBe("orders");
    expect(r.output[2]).toMatch(/^Topic: orders\tTopicId: \S{22}\tPartitionCount: 3\tReplicationFactor: 1\tConfigs: $/);
    expect(r.output.slice(3)).toEqual([0, 1, 2].map((i) => `\tTopic: orders\tPartition: ${i}\tLeader: 1\tReplicas: 1\tIsr: 1`));
    expect(r.moves).toBe(1);
  });

  it("needs the bootstrap server and rejects unknown options", () => {
    expect(type(emptyBox(), ["kafka-topics.sh --list"]).output[0]).toBe('Missing required argument "[bootstrap-server]"');
    expect(type(emptyBox(), [`kafka-topics.sh ${B} --list --wat`]).output[0]).toContain("wat is not a recognized option");
    expect(type(emptyBox(), ["kafka-topcs.sh"]).output[0]).toBe("bash: kafka-topcs.sh: command not found");
  });

  it("refuses to shrink a topic", () => {
    const r = type(emptyBox(), [`kafka-topics.sh ${B} --create --topic orders --partitions 3`, `kafka-topics.sh ${B} --alter --topic orders --partitions 2`]);
    expect(r.output[1]).toContain("Topic currently has 3 partitions, which is higher than the requested 2.");
    expect(r.state.cluster.topics.orders!.partitions).toHaveLength(3);
  });

  it("produces keyed records through a pipe; the key picks the partition", () => {
    const r = type(emptyBox(), [
      `kafka-topics.sh ${B} --create --topic orders --partitions 3`,
      `printf "ali:order\\nali:cancel\\n" | kafka-console-producer.sh ${B} --topic orders --property parse.key=true --property key.separator=:`,
    ]);
    const p = partitionForKey("ali", 3);
    expect(r.state.cluster.topics.orders!.partitions[p]!.records.map((x) => x.value)).toEqual(["order", "cancel"]);
    expect(r.output.at(-1)).toBe(">>>");
  });

  it("says when a keyed line has no separator", () => {
    const r = type(emptyBox(), [`kafka-topics.sh ${B} --create --topic t --partitions 1`, `echo "nokey" | kafka-console-producer.sh ${B} --topic t --property parse.key=true --property key.separator=:`]);
    expect(r.output.at(-1)).toBe("org.apache.kafka.common.KafkaException: No key separator found on line number 1: 'nokey'");
  });

  it("a consumer without --from-beginning sees nothing old; with it, everything", () => {
    const setup = [`kafka-topics.sh ${B} --create --topic t --partitions 1`, `printf "a\\nb\\n" | kafka-console-producer.sh ${B} --topic t`];
    expect(type(emptyBox(), [...setup, `kafka-console-consumer.sh ${B} --topic t`]).output.at(-1)).toBe("Processed a total of 0 messages");
    const all = type(emptyBox(), [...setup, `kafka-console-consumer.sh ${B} --topic t --from-beginning --max-messages 5`]);
    expect(all.output.slice(-3)).toEqual(["a", "b", "Processed a total of 2 messages"]);
  });

  it("a group consumer commits, so the group's lag shows in --describe", () => {
    const r = type(emptyBox(), [
      `kafka-topics.sh ${B} --create --topic t --partitions 1`,
      `printf "a\\nb\\nc\\n" | kafka-console-producer.sh ${B} --topic t`,
      `kafka-console-consumer.sh ${B} --topic t --group billing --from-beginning --max-messages 2`,
      `kafka-consumer-groups.sh ${B} --describe --group billing`,
    ]);
    const row = r.output.find((l) => l.startsWith("billing "))!;
    expect(row.split(/\s+/).slice(0, 6)).toEqual(["billing", "t", "0", "2", "3", "1"]);
    expect(r.output).toContain("Consumer group 'billing' has no active members.");
  });

  it("resets a group's offsets only with --execute", () => {
    const setup = [
      `kafka-topics.sh ${B} --create --topic t --partitions 1`,
      `printf "a\\nb\\n" | kafka-console-producer.sh ${B} --topic t`,
      `kafka-console-consumer.sh ${B} --topic t --group g --from-beginning`,
    ];
    const dry = type(emptyBox(), [...setup, `kafka-consumer-groups.sh ${B} --group g --reset-offsets --to-earliest --topic t`]);
    expect(dry.output.some((l) => l.startsWith("WARN: No action will be performed"))).toBe(true);
    expect(dry.state.cluster.groups.g!.committed["t-0"]).toBe(2);
    const done = type(emptyBox(), [...setup, `kafka-consumer-groups.sh ${B} --group g --reset-offsets --to-earliest --topic t --execute`]);
    expect(done.state.cluster.groups.g!.committed["t-0"]).toBe(0);
  });

  it("background consumers share the partitions and read new records as they come", () => {
    const r = type(boxOf(createCluster()), [
      `kafka-topics.sh ${B} --create --topic t --partitions 2`,
      `kafka-console-consumer.sh ${B} --topic t --group g &`,
      `kafka-console-consumer.sh ${B} --topic t --group g &`,
      `printf "x\\ny\\n" | kafka-console-producer.sh ${B} --topic t`,
    ]);
    const g = r.state.cluster.groups.g!;
    expect(g.members.map((m) => m.assigned.length)).toEqual([1, 1]);
    expect(r.output).toContain("x");
    expect(r.output).toContain("y");
    expect(r.state.jobs).toHaveLength(2);
    const killed = type(r.state, ["kill %1", "jobs"]);
    expect(killed.state.cluster.groups.g!.members).toHaveLength(1);
    expect(killed.state.jobs.map((j) => j.id)).toEqual([2]);
  });

  it("refuses a reset while the group has members", () => {
    const r = type(emptyBox(), [
      `kafka-topics.sh ${B} --create --topic t --partitions 1`,
      `kafka-console-consumer.sh ${B} --topic t --group g &`,
      `kafka-consumer-groups.sh ${B} --group g --reset-offsets --to-earliest --topic t --execute`,
    ]);
    expect(r.output.at(-1)).toBe("Error: Assignments can only be reset if the group 'g' is inactive, but the current state is Stable.");
  });
});

describe("kafka cli: deleting records and turning auto commit off", () => {
  const withRecords = () =>
    type(emptyBox(), [`kafka-topics.sh ${B} --create --topic t --partitions 1`, `printf "a\\nb\\nc\\nd\\n" | kafka-console-producer.sh ${B} --topic t`]).state;

  it("deletes records before an offset from a JSON file, like kafka-delete-records.sh", () => {
    const r = type(withRecords(), [
      `echo '{"partitions":[{"topic":"t","partition":0,"offset":2}],"version":1}' > d.json`,
      `kafka-delete-records.sh ${B} --offset-json-file d.json`,
    ]);
    expect(r.output).toEqual(["Executing records delete operation", "Records delete operation completed:", "partition: t-0\tlow_watermark: 2"]);
    expect(r.state.cluster.topics.t!.partitions[0]!.logStartOffset).toBe(2);
    expect(r.moves).toBe(1);
  });

  it("refuses a missing file and an offset past the end", () => {
    expect(type(withRecords(), [`kafka-delete-records.sh ${B} --offset-json-file nope.json`]).output[0]).toContain("NoSuchFileException: nope.json");
    const r = type(withRecords(), [`echo '{"partitions":[{"topic":"t","partition":0,"offset":9}],"version":1}' > d.json`, `kafka-delete-records.sh ${B} --offset-json-file d.json`]);
    expect(r.output.join("\n")).toContain("OffsetOutOfRangeException");
  });

  it("a consumer with enable.auto.commit=false reads but commits nothing", () => {
    const r = type(withRecords(), [`kafka-console-consumer.sh ${B} --topic t --group g --from-beginning --consumer-property enable.auto.commit=false`]);
    expect(r.output).toContain("Processed a total of 4 messages");
    expect(r.state.cluster.groups.g!.committed["t-0"]).toBeUndefined();
  });
});
