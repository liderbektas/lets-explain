import { describe, expect, it } from "vitest";
import { typeLines } from "@lets-explain/core/components/TypedSandbox";
import { createLog, simulateStorage } from "./storage";
import { applyAllS, sBox, storageShell, type SBox } from "./storageCli";

const B = "--bootstrap-server localhost:9092";
const type = (start: SBox, lines: string[]) => typeLines(storageShell, applyAllS, start, lines);
const four = sBox(simulateStorage(Array.from({ length: 4 }, (_, i) => ({ type: "append", value: `order:${i}` }) as const), createLog()).logs[4]!, "orders");

describe("storage shell", () => {
  it("lists the segment files under the partition directory", () => {
    const r = type(four, ["ls /var/lib/kafka/data/orders-0"]);
    expect(r.output).toContain("00000000000000000000.log");
    expect(r.output).toContain("00000000000000000003.index");
  });

  it("changes retention in Kafka's units and deletes expired segments", () => {
    const r = type(four, ["sleep 4d", `kafka-configs.sh ${B} --alter --entity-type topics --entity-name orders --add-config retention.ms=259200000`, `kafka-get-offsets.sh ${B} --topic orders --time -2`]);
    expect(r.output[0]).toBe("Completed updating config for topic orders.");
    expect(r.state.log.config.retentionDays).toBe(3);
    // Both segments are older than 3 days: Kafka rolls a fresh one so the log can still be written.
    expect(r.output.at(-1)).toBe("orders:0:4");
  });

  it("maps segment.bytes and retention.bytes onto 1 KiB records", () => {
    const r = type(four, [`kafka-configs.sh ${B} --alter --entity-type topics --entity-name orders --add-config segment.bytes=2048,retention.bytes=1024`]);
    expect(r.state.log.config.segmentRecords).toBe(2);
    expect(r.state.log.config.retentionRecords).toBe(1);
  });

  it("writes keys and tombstones, and a compacted topic refuses records without a key", () => {
    const compacted = sBox(createLog({ policy: "compact", retentionDays: null, segmentDays: null }), "addresses");
    const P = `kafka-console-producer.sh ${B} --topic addresses --property parse.key=true --property key.separator=: --property null.marker=NULL`;
    const r = type(compacted, [`printf "ali:Izmir\\nece:NULL\\n" | ${P}`, `kafka-console-consumer.sh ${B} --topic addresses --from-beginning --property print.key=true`]);
    expect(r.output.slice(0, 2)).toEqual(["ali\tIzmir", "ece\tnull"]);
    const bad = type(compacted, [`echo "Izmir" | kafka-console-producer.sh ${B} --topic addresses`]);
    expect(bad.output[1]).toContain("Compacted topic cannot accept message without key");
  });

  it("runs the cleaner when time passes on a compacted topic", () => {
    const compacted = sBox(createLog({ policy: "compact", retentionDays: null, segmentDays: null }), "addresses");
    const P = `kafka-console-producer.sh ${B} --topic addresses --property parse.key=true --property key.separator=:`;
    const r = type(compacted, [`printf "ali:A\\nali:B\\nali:C\\nali:D\\n" | ${P}`, "sleep 1m"]);
    expect(r.state.log.segments[0]!.records.map((x) => x.value)).toEqual(["C"]);
  });

  it("says plainly what it does not know", () => {
    expect(type(four, ["sleep forever"]).output[0]).toBe("sleep: invalid time interval 'forever'");
    expect(type(four, [`kafka-configs.sh ${B} --alter --entity-type topics --entity-name orders --add-config colour=blue`]).output[1]).toContain("Unknown topic config name: colour");
  });
});
