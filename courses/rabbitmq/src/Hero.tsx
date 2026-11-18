import { useMemo } from "react";
import { l, useLang } from "@lets-explain/core/i18n";
import { useTicker } from "@lets-explain/core/lib/playback";
import { simulate, type BrokerAction } from "./engine/broker";
import { BROKER_STAGE, BrokerStage, type BrokerLayout } from "./iso/BrokerStage";

const setup: BrokerAction[] = [
  { type: "declareExchange", name: "orders", kind: "topic" },
  { type: "declareQueue", name: "billing" },
  { type: "declareQueue", name: "shipping" },
  { type: "bind", exchange: "orders", queue: "billing", key: "order.*" },
  { type: "bind", exchange: "orders", queue: "shipping", key: "order.paid" },
  { type: "consume", tag: "billing-1", queue: "billing", prefetch: 2, speed: 1 },
  { type: "consume", tag: "shipping-1", queue: "shipping", prefetch: 1, speed: 1 },
];
const keys = ["order.created", "order.paid", "order.created", "order.paid", "order.cancelled"];

/** The course home loop: orders flow through a topic exchange to two queues and their consumers. */
export function RabbitHero() {
  const { t } = useLang();
  const tick = useTicker(true, false, 1300) % 14;
  const run = useMemo(() => {
    const actions = [...setup];
    for (let i = 0; i < 12; i++) {
      actions.push({ type: "publish", exchange: "orders", routingKey: keys[i % keys.length]!, body: `o${i + 1}` });
      if (i % 2 === 1) actions.push({ type: "tick" });
    }
    return simulate(actions);
  }, []);
  const at = Math.min(setup.length + Math.round(tick * 1.4), run.states.length - 1);
  const layout: BrokerLayout = {
    producers: [{ id: "shop", label: t(l("Mağaza", "Shop")), exchange: "orders" }],
    consumerNames: { "billing-1": t(l("Fatura", "Billing")), "shipping-1": t(l("Kargo", "Shipping")) },
  };
  return (
    <svg className="stage-svg" viewBox={`0 0 ${BROKER_STAGE.width} ${BROKER_STAGE.height}`} aria-hidden="true">
      <BrokerStage
        broker={run.states[at]!}
        layout={layout}
        last={run.events[at - 1] ?? []}
        labels={{ unacked: "unacked", ready: "ready", prefetch: "prefetch", noLimit: "∞", down: "down", lost: t(l("kayıp", "lost")) }}
        kindOf={(m) => (m.routingKey.endsWith("paid") ? "payment" : m.routingKey.endsWith("cancelled") ? "cancel" : "order")}
      />
    </svg>
  );
}
