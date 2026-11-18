import type { Change } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { depth, type Broker } from "../../engine/broker";

/** The "Ne değişti?" list between two broker states, in both languages. */
export function brokerChanges(before: Broker, after: Broker): Change[] {
  const out: Change[] = [];

  for (const name of Object.keys(after.exchanges)) {
    if (!before.exchanges[name] && name) out.push({ kind: "add", text: l(`\`${name}\` exchange'i (${after.exchanges[name]!.type}) eklendi`, `Exchange \`${name}\` (${after.exchanges[name]!.type}) added`) });
  }
  for (const name of Object.keys(after.queues)) {
    if (!before.queues[name]) out.push({ kind: "add", text: l(`\`${name}\` kuyruğu eklendi`, `Queue \`${name}\` added`) });
  }
  for (const name of Object.keys(before.queues)) {
    if (!after.queues[name]) out.push({ kind: "remove", text: l(`\`${name}\` kuyruğu yok oldu`, `Queue \`${name}\` is gone`) });
  }
  const key = (b: { exchange: string; queue: string; key: string }) => `${b.exchange}|${b.queue}|${b.key}`;
  const was = new Set(before.bindings.map(key));
  for (const b of after.bindings) {
    if (!was.has(key(b))) out.push({ kind: "add", text: l(`Binding \`${b.exchange}\` → \`${b.queue}\`${b.key ? ` (\`${b.key}\`)` : ""}`, `Binding \`${b.exchange}\` → \`${b.queue}\`${b.key ? ` (\`${b.key}\`)` : ""}`) });
  }

  for (const name of Object.keys(after.queues)) {
    if (!before.queues[name]) continue;
    const a = depth(after, name);
    const b = depth(before, name);
    if (a.ready !== b.ready || a.unacked !== b.unacked) {
      out.push({
        kind: "change",
        text: l(`\`${name}\`: hazır ${b.ready} → ${a.ready}, onay bekleyen ${b.unacked} → ${a.unacked}`, `\`${name}\`: ready ${b.ready} → ${a.ready}, unacked ${b.unacked} → ${a.unacked}`),
      });
    }
  }

  for (const [tag, c] of Object.entries(after.consumers)) {
    const old = before.consumers[tag];
    if (!old) out.push({ kind: "good", text: l(`\`${tag}\` \`${c.queue}\`'yu dinliyor`, `\`${tag}\` is consuming \`${c.queue}\``) });
    else if (c.done.length > old.done.length) {
      const n = c.done.length - old.done.length;
      out.push({ kind: "good", text: l(`\`${tag}\` ${n} mesajı bitirdi`, `\`${tag}\` finished ${n} message${n === 1 ? "" : "s"}`) });
    }
  }
  for (const tag of Object.keys(before.consumers)) {
    if (!after.consumers[tag]) out.push({ kind: "bad", text: l(`\`${tag}\` artık bağlı değil`, `\`${tag}\` is no longer connected`) });
  }

  const redelivered = after.deliveries.slice(before.deliveries.length).filter((d) => d.redelivered).length;
  if (redelivered) out.push({ kind: "bad", text: l(`${redelivered} mesaj ikinci kez teslim edildi`, `${redelivered} message${redelivered === 1 ? " was" : "s were"} delivered again`) });

  const lost = after.lost.length - before.lost.length;
  if (lost > 0) out.push({ kind: "bad", text: l(`${lost} mesaj kayboldu`, `${lost} message${lost === 1 ? "" : "s"} lost`) });

  for (const n of after.nodes) {
    const old = before.nodes.find((x) => x.name === n.name);
    if (old && old.alive !== n.alive) out.push({ kind: n.alive ? "good" : "bad", text: l(`\`${n.name}\` ${n.alive ? "geri geldi" : "çöktü"}`, `\`${n.name}\` ${n.alive ? "is back" : "went down"}`) });
  }
  return out;
}
