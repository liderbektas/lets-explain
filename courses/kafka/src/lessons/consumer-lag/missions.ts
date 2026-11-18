import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import { totalLag, type LAction, type LEvent, type LState } from "./model";

/** What a mission can look at: where the try-it step began, every move made, and what each did. */
export interface SandboxCtx {
  start: LState;
  state: LState;
  actions: LAction[];
  events: LEvent[][];
}

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "catchup",
    title: l("Yetiş", "Catch up"),
    goal: l(
      "Group'un toplam **lag'ini 0'a** indir.",
      "Bring the group's total **lag down to 0**.",
    ),
    hint: l(
      "Tek consumer saniyede 2 kayıt işliyor ama 3 kayıt geliyor. Her partition'ın kendi consumer'ı olsa?",
      "One consumer handles 2 records a second while 3 arrive. What if every partition had its own consumer?",
    ),
    par: 4,
    check: (ctx) => ctx.actions.length > 0 && totalLag(ctx.state) === 0,
  },
  {
    id: "hot",
    title: l("Sıcak key", "Hot key"),
    goal: l(
      "Sıcak key'i **aç** (bütün trafik tek partition'a gitsin) ve açıkken en az bir saniye geçsin. Sonunda sıcak key hâlâ açıkken toplam lag **0** olsun.",
      "Turn the hot key **on** (all traffic goes to one partition) and let at least a second pass with it on. In the end, with the hot key still on, total lag is **0**.",
    ),
    hint: l(
      "Sıcak partition'ı group'tan tek bir consumer okuyabilir. Consumer eklemek yetmez; o consumer'ın kendisi hızlanmalı.",
      "Only one consumer in the group can read the hot partition. Adding consumers is not enough; that consumer itself has to get faster.",
    ),
    par: 5,
    check: (ctx) => ctx.state.hot && ctx.state.hotSeconds > 0 && totalLag(ctx.state) === 0,
  },
  {
    id: "lost",
    title: l("Kayıp kayıtlar", "Lost records"),
    goal: l(
      "Retention, group'un **hiç okumadığı** bir kaydı silsin.",
      "Get retention to delete a record the group **never read**.",
    ),
    hint: l(
      "Retention her partition'da sadece en yeni 8 kaydı tutar. Bir partition'ın lag'i 8'i geçerse ne olur?",
      "Retention keeps only the newest 8 records in each partition. What happens when a partition's lag goes past 8?",
    ),
    par: 4,
    check: (ctx) => ctx.state.missed > 0,
  },
];
