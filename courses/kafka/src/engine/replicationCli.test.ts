import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { createReplicated } from "./replication";
import { applyAllR, rBox, replicationShell, type RBox } from "./replicationCli";

const B = "--bootstrap-server localhost:9092";
const healthy = rBox(createReplicated({ brokers: 3, partitions: [[1, 2, 3]], config: { acks: "all", minIsr: 1 } }));
const type = (start: RBox, lines: string[], edits: ((t: string) => string)[] = []) => typeLines(replicationShell, applyAllR, start, lines, edits);

describe("replication shell", () => {
  it("describes the topic in kafka-topics' format", () => {
    const r = type(healthy, [`kafka-topics.sh ${B} --describe --topic orders`]);
    expect(r.output[0]).toMatch(/^Topic: orders\tTopicId: \S+\tPartitionCount: 1\tReplicationFactor: 3\tConfigs: $/);
    expect(r.output[1]).toBe("\tTopic: orders\tPartition: 0\tLeader: 1\tReplicas: 1,2,3\tIsr: 1,2,3");
  });

  it("stops a broker with docker and elects a new leader", () => {
    const r = type(healthy, ["docker stop kafka-1", `kafka-topics.sh ${B} --describe`]);
    expect(r.output[0]).toBe("kafka-1");
    expect(r.state.state.partitions[0]!.leader).toBe(2);
    expect(r.output.at(-1)).toContain("Leader: 2\tReplicas: 1,2,3\tIsr: 2,3");
    expect(r.moves).toBe(1);
  });

  it("a paused follower leaves the ISR once 30 s pass", () => {
    const r = type(healthy, ["docker pause kafka-3", `echo "order:1" | kafka-console-producer.sh ${B} --topic orders`, "sleep 30"]);
    expect(r.output.some((l) => l.includes("still waiting"))).toBe(true);
    expect(r.state.state.partitions[0]!.isr).toEqual([1, 2]);
    expect(r.state.state.sends.at(-1)!.status).toBe("acked");
  });

  it("rejects acks=all writes below min.insync.replicas with Kafka's error", () => {
    const r = type(healthy, [
      `kafka-configs.sh ${B} --alter --entity-type topics --entity-name orders --add-config min.insync.replicas=2`,
      "docker stop kafka-2 kafka-3",
      `echo "order:1" | kafka-console-producer.sh ${B} --topic orders`,
    ]);
    expect(r.output[0]).toBe("Completed updating config for topic orders.");
    expect(r.output.at(-1)).toBe("org.apache.kafka.common.errors.NotEnoughReplicasException: Messages are rejected since there are fewer in-sync replicas than required.");
  });

  it("reads acks from --producer-property and from a config file", () => {
    const one = type(healthy, [`echo "order:1" | kafka-console-producer.sh ${B} --topic orders --producer-property acks=1`]);
    expect(one.state.state.sends[0]!.acks).toBe(1);
    const file = type(healthy, ["nano producer.properties", `echo "order:1" | kafka-console-producer.sh ${B} --topic orders --producer.config producer.properties`], [() => "acks=0"]);
    expect(file.state.state.sends[0]!.acks).toBe(0);
  });

  it("moves a partition with a reassignment file", () => {
    const one = rBox(createReplicated({ brokers: 3, partitions: [[1], [2]] }));
    const r = type(one, ["nano move.json", `kafka-reassign-partitions.sh ${B} --reassignment-json-file move.json --execute`], [
      () => '{"version":1,"partitions":[{"topic":"orders","partition":0,"replicas":[3]}]}',
    ]);
    expect(r.output.at(-1)).toBe("Successfully started partition reassignment for orders-0");
    expect(r.state.state.partitions[0]!.replicas).toEqual([3]);
    expect(r.moves).toBe(1);
  });

  it("reads only up to the high watermark", () => {
    const r = type(healthy, ["docker pause kafka-3", `echo "order:1" | kafka-console-producer.sh ${B} --topic orders --producer-property acks=1`, `kafka-console-consumer.sh ${B} --topic orders --from-beginning`]);
    expect(r.output.at(-1)).toBe("Processed a total of 0 messages");
  });

  it("refuses what it does not know", () => {
    expect(type(healthy, ["docker frob"]).output[0]).toContain("is not a docker command");
    expect(type(healthy, ["docker stop kafka-9"]).output[0]).toBe("Error response from daemon: No such container: kafka-9");
    expect(type(healthy, [`kafka-topics.sh ${B} --describe --wat`]).output[0]).toContain("wat is not a recognized option");
  });
});
