import type { Broker } from "../../engine/broker";

/**
 * For drawing only: BrokerStage draws one road per binding, so several bindings between the
 * same exchange and queue overlap and hide each other's key. This folds them into one binding
 * whose key lists every key ("info · warning · error"). Routing is never done on the result.
 */
export function mergeBindings(b: Broker): Broker {
  const merged = new Map<string, Broker["bindings"][number]>();
  for (const x of b.bindings) {
    const id = `${x.exchange}\u0000${x.queue}`;
    const prev = merged.get(id);
    if (prev && !x.headers) merged.set(id, { ...prev, key: `${prev.key} · ${x.key}` });
    else if (!prev) merged.set(id, { ...x });
  }
  return { ...b, bindings: [...merged.values()] };
}
