import { useMemo } from "react";
import { l, useLang } from "@lets-explain/core/i18n";
import { TINTS } from "@lets-explain/core/iso/shapes";
import { useTicker } from "@lets-explain/core/lib/playback";
import { simulate } from "./engine/cluster";
import type { Action } from "./engine/types";
import { PartitionStage, STAGE, type Reader } from "./iso/PartitionStage";

const copy = {
  orders: l("Sipariş", "Orders"),
  billing: l("Fatura", "Billing"),
  analytics: l("Analitik", "Analytics"),
};

/** A small loop for the course home: orders arrive, two readers follow at their own pace. */
export function KafkaHero() {
  const { t } = useLang();
  // Start with a few records already on the belt, so the first look is never an empty log.
  const tick = 5 + (useTicker(true, false, 1100) % 16);
  const state = useMemo(() => {
    const actions: Action[] = [
      { type: "createTopic", name: "orders", partitions: 1 },
      { type: "joinGroup", group: "b", member: "b1", topics: ["orders"], autoOffsetReset: "earliest" },
      { type: "joinGroup", group: "a", member: "a1", topics: ["orders"], autoOffsetReset: "earliest" },
    ];
    for (let i = 0; i < tick; i++) {
      actions.push({ type: "produce", topic: "orders", value: i % 5 === 3 ? "cancel:x" : "order:x" });
      if (i % 2 === 1) actions.push({ type: "poll", group: "b", member: "b1", max: 2 });
      if (i % 3 === 2) actions.push({ type: "poll", group: "a", member: "a1", max: 1 });
    }
    const run = simulate(actions);
    return run.states[run.states.length - 1]!;
  }, [tick]);
  const partition = state.topics.orders!.partitions[0]!;
  const readers: Reader[] = [
    { id: "b", name: t(copy.billing), tint: TINTS.coral, position: state.groups.b!.members[0]!.positions["orders-0"] ?? 0, state: "idle" },
    { id: "a", name: t(copy.analytics), tint: TINTS.lilac, position: state.groups.a!.members[0]!.positions["orders-0"] ?? 0, state: "idle" },
  ];
  return (
    <svg className="stage-svg" viewBox={`70 10 ${STAGE.width - 70} ${STAGE.height - 10}`} aria-hidden="true">
      <PartitionStage
        partition={partition}
        readers={readers}
        producerName={t(copy.orders)}
        producerState="idle"
        marks={new Map()}
        kindOf={(v) => (v.startsWith("cancel") ? "cancel" : "order")}
        labels={{ next: "", retention: "retention" }}
        showShredder={false}
      />
    </svg>
  );
}
