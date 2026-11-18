import type { StorageAction, StorageEvent, StorageLog } from "../../engine/storage";
import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";

export interface SandboxCtx {
  start: StorageLog;
  log: StorageLog;
  actions: StorageAction[];
  events: StorageEvent[][];
}

const happened = (ctx: SandboxCtx, test: (e: StorageEvent) => boolean) => ctx.events.some((evs) => evs.some(test));

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "roll",
    title: l("Yeni segment", "A new segment"),
    goal: l(
      "Aktif segment **dolsun** ve Kafka yeni bir segment açsın.",
      "Fill the active segment **up** so Kafka rolls a new one.",
    ),
    hint: l(
      "Bir segment 3 kayıt alıyor. Aktif segment'te şu an kaç kayıt var?",
      "A segment holds 3 records. How many are in the active one now?",
    ),
    par: 3,
    check: (ctx) => happened(ctx, (e) => e.type === "rolled" && e.reason === "size"),
  },
  {
    id: "start-at-3",
    title: l("Log 3'ten başlasın", "Start at 3"),
    goal: l(
      "Retention segment 0'ı silsin ve log **offset 3** ile başlasın. Aktif segment silinmesin.",
      "Retention deletes segment 0 and the log **starts at offset 3**. The active segment must survive.",
    ),
    hint: l(
      "Zaman geçince ikisinin de süresi dolar. Aktif segment'i genç tutmanın bir yolu: ona yeni bir kayıt yazmak.",
      "With time, both expire. One way to keep the active segment young: write a new record into it.",
    ),
    par: 4,
    check: (ctx) => ctx.log.logStartOffset === 3,
  },
  {
    id: "old-survivor",
    title: l("Eski ama burada", "Old but still here"),
    goal: l(
      "**Kapalı** bir segment'te retention'dan (7 gün) eski bir kayıt hâlâ dursun.",
      "Get a record older than retention (7 days) still sitting in a **closed** segment.",
    ),
    hint: l(
      "Retention segment'e en yeni kaydına bakarak karar verir. Eski bir kayıtla aynı segment'e daha yeni bir kayıt koy, sonra segment'i kapat. Bir segment'i kapatmanın iki yolu var: doldurmak ya da segment.ms'i (7 gün) geçirmek.",
      "Retention judges a segment by its newest record. Put a newer record in the same segment as an old one, then close it. There are two ways to close a segment: fill it, or let segment.ms (7 days) pass.",
    ),
    par: 5,
    check: (ctx) => {
      const { log } = ctx;
      const closed = log.segments.slice(0, -1);
      return closed.some((seg) => seg.records.some((r) => log.time - r.time > log.config.retentionDays!));
    },
  },
];
