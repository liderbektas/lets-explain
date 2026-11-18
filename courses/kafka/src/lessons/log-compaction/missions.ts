import { allRecords, type StorageAction, type StorageEvent, type StorageLog } from "../../engine/storage";
import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import { ALI, ECE, tableOf } from "./model";

export interface SandboxCtx {
  start: StorageLog;
  log: StorageLog;
  actions: StorageAction[];
  events: StorageEvent[][];
}

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "only-ali",
    title: l("Sadece Ali", "Only Ali"),
    goal: l(
      "Log'u baştan okuyan biri için tabloda **sadece Ali** kalsın.",
      "For someone reading the log from the start, the table holds **only Ali**.",
    ),
    hint: l(
      "Bir key'i silmek için value'su boş bir kayıt yazılır. Compaction'ı beklemek gerekmez: okuyan onu görünce siler.",
      "To delete a key you write a record with an empty value. No need to wait for compaction: a reader drops the key as soon as it sees it.",
    ),
    par: 2,
    check: (ctx) => {
      const keys = [...tableOf(ctx.log).keys()];
      return keys.length === 1 && keys[0] === ALI.key;
    },
  },
  {
    id: "clean",
    title: l("Temizlik", "Clean-up"),
    goal: l(
      "Cleaner, yerini daha yeni bir değere bırakmış **eski bir kaydı** silsin.",
      "Get the cleaner to remove an **old record** that a newer value has replaced.",
    ),
    hint: l(
      "Ali'nin yeni adresi aktif segment'te ve cleaner aktif segment'e bakmıyor. O segment'i kapatman gerek.",
      "Ali's new address is in the active segment, and the cleaner ignores the active segment. You need to close it.",
    ),
    par: 4,
    check: (ctx) => ctx.events.some((evs) => evs.some((e) => e.type === "compacted" && e.removed.length > 0)),
  },
  {
    id: "forget-ece",
    title: l("Ece'yi unut", "Forget Ece"),
    goal: l(
      "Log'da Ece'den **hiç iz** kalmasın: ne eski adresi ne de tombstone'u.",
      "Leave **no trace** of Ece in the log: neither her old address nor her tombstone.",
    ),
    hint: l(
      "Tombstone ilk temizlikte kalır. delete.retention.ms (1 gün) geçtikten sonraki bir temizlikte gider.",
      "A tombstone survives its first cleaning. It goes at a later one, once delete.retention.ms (1 day) has passed.",
    ),
    par: 6,
    check: (ctx) => !allRecords(ctx.log).some((r) => r.key === ECE.key),
  },
];
