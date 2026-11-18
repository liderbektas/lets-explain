import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import { indexDuplicates, MASKED, topicDuplicates, type Action, type ConnectEvent, type ConnectState } from "./model";

export interface SandboxCtx {
  start: ConnectState;
  state: ConnectState;
  actions: Action[];
  events: ConnectEvent[][];
}

/** Rows written into the topic by moves before `until`. */
function sourcedBefore(ctx: SandboxCtx, until: number): Set<number> {
  const out = new Set<number>();
  for (const e of ctx.events.slice(0, until).flat()) if (e.type === "sourced") out.add(e.rowId);
  return out;
}

const newRowIds = (ctx: SandboxCtx) => ctx.state.rows.filter((r) => r.id >= ctx.start.nextRow).map((r) => r.id);

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "twice",
    title: l("Aynı satır iki kez", "The same row twice"),
    goal: l(
      "Bir satır topic'e **iki kez** yazılsın.",
      "Get one row written to the topic **twice**.",
    ),
    hint: l(
      "Source görevi bir satırı kopyalasın, offset'ini kaydetmeden çalıştığı worker çöksün.",
      "Let the source task copy a row, then crash its worker before it saves its offset.",
    ),
    par: 4,
    check: (ctx) => topicDuplicates(ctx.state) > topicDuplicates(ctx.start),
  },
  {
    id: "safe-handover",
    title: l("Güvenli devir", "Safe hand-over"),
    goal: l(
      "**2 yeni satır** topic'e ulaşsın, sonra **Worker 1** çöksün. Görev diğer worker'da hiçbir satırı yeniden göndermeden devam edebilsin.",
      "Get **2 new rows** into the topic, then crash **Worker 1**. The task must carry on on the other worker without sending any row again.",
    ),
    hint: l(
      "Görev yeni bir worker'da sadece `connect-offsets`'e kaydedilmiş yeri bilir.",
      "On a new worker the task only knows what was saved in `connect-offsets`.",
    ),
    par: 5,
    check: (ctx) => {
      const fresh = newRowIds(ctx);
      if (fresh.length < 2 || topicDuplicates(ctx.state) > 0) return false;
      const crashAt = ctx.actions.findIndex((a) => a.type === "crash" && a.worker === "w1");
      if (crashAt < 0) return false;
      const copied = sourcedBefore(ctx, crashAt);
      if (!fresh.every((id) => copied.has(id))) return false;
      // Nothing left that the task would send again on its next poll.
      return ctx.state.tasks.source !== null && ctx.state.sourceSeen === Math.max(...ctx.state.rows.map((r) => r.id));
    },
  },
  {
    id: "masked",
    title: l("Kart numarası gizli", "Card number hidden"),
    goal: l(
      "Yeni bir sipariş arama indeksine ulaşsın ama indekse **açık kart numarası** yazılmasın.",
      "Get a new order into the search index without writing an **unmasked card number** there.",
    ),
    hint: l(
      "Kayıt Kafka'ya girerken onu değiştirebilen küçük bir dönüştürücü vardı.",
      "There was a small transform that can change a record on its way into Kafka.",
    ),
    par: 4,
    check: (ctx) => {
      const fresh = new Set(newRowIds(ctx));
      const added = ctx.state.index.slice(ctx.start.index.length);
      return added.some((d) => fresh.has(d.rowId)) && added.every((d) => d.card === MASKED);
    },
  },
  {
    id: "upsert",
    title: l("Tekrar zararsız", "Harmless repeat"),
    goal: l(
      "Topic'te bir satır iki kez olsun ve sink onu indekse yazsın. Yine de indekste her siparişten **tek kopya** kalsın.",
      "Get a row into the topic twice and have the sink write it to the index. Still, the index must keep **one copy** of every order.",
    ),
    hint: l(
      "Sink her kaydı yeni bir belge olarak eklemek yerine, aynı id'li belgenin üstüne yazabilir.",
      "Instead of adding every record as a new document, the sink can overwrite the document with the same id.",
    ),
    par: 6,
    check: (ctx) =>
      topicDuplicates(ctx.state) > 0 &&
      ctx.state.sinkPosition === ctx.state.topic.length &&
      indexDuplicates(ctx.state) === 0,
  },
];
