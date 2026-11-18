import { groupStats } from "../../engine/cluster";
import type { Action, ClusterState, SimEvent } from "../../engine/types";
import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import { ANALYTICS, BILLING, P, TOPIC, type ConsumerDef } from "./model";

/** What a mission can look at: where the try-it step began, every move made, and what each did. */
export interface SandboxCtx {
  start: ClusterState;
  state: ClusterState;
  actions: Action[];
  events: SimEvent[][];
}

const dupsSince = (ctx: SandboxCtx, c: ConsumerDef) =>
  groupStats(ctx.state, c.group).duplicates - groupStats(ctx.start, c.group).duplicates;

const isAlive = (ctx: SandboxCtx, c: ConsumerDef) =>
  Boolean(ctx.state.groups[c.group]?.members.some((m) => m.id === c.member));

/** Offsets delivered to a reader by moves up to (not including) `until`. */
function readBy(ctx: SandboxCtx, c: ConsumerDef, until = ctx.events.length): Set<number> {
  const out = new Set<number>();
  for (const e of ctx.events.slice(0, until).flat()) {
    if (e.type === "delivered" && e.group === c.group) out.add(e.offset);
  }
  return out;
}

function written(ctx: SandboxCtx): number[] {
  return ctx.events.flat().flatMap((e) => (e.type === "produced" ? [e.offset] : []));
}

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "double",
    title: l("Çift fatura", "Double invoice"),
    goal: l(
      "Fatura bir siparişi **ikinci kez** okusun. Başa sarmak yok: bunu bir çökmeyle yap.",
      "Make billing read an order **a second time**. No rewinding: do it with a crash.",
    ),
    hint: l(
      "Yeni bir sipariş yaz, Fatura'ya okut, commit etmeden çökert. Sonra yeniden başlatıp tekrar okut.",
      "Write a new order, have billing read it, crash it before committing. Then restart it and read again.",
    ),
    par: 5,
    check: (ctx) =>
      dupsSince(ctx, BILLING) > 0 &&
      !ctx.actions.some((a) => a.type === "seek" && a.group === BILLING.group),
  },
  {
    id: "safe",
    title: l("Güvenli çökme", "Safe crash"),
    goal: l(
      "**2 yeni sipariş** yaz. Fatura ikisini de okusun, sonra çöküp yeniden başlasın. Sonunda Fatura'nın **lag'i 0** olsun ve hiçbir kayıt iki kez okunmasın.",
      "Write **2 new orders**. Billing reads both, then crashes and restarts. In the end billing's **lag is 0** and no record was read twice.",
    ),
    hint: l(
      "Çökmeden önce Kafka'ya \"buraya kadar işledim\" demenin bir yolu vardı.",
      "There was a way to tell Kafka \"I'm done up to here\" before crashing.",
    ),
    par: 6,
    check: (ctx) => {
      const fresh = written(ctx);
      if (fresh.length < 2 || !isAlive(ctx, BILLING) || dupsSince(ctx, BILLING) > 0) return false;
      // Lag counts from the committed offset, so it only reaches 0 if the work survived the crash.
      if (groupStats(ctx.state, BILLING.group).lag > 0) return false;
      // The crash has to come after billing read something, or there is nothing to lose.
      const crashAt = ctx.actions.findIndex(
        (a, i) => a.type === "crashMember" && a.group === BILLING.group && readBy(ctx, BILLING, i).size > 0,
      );
      if (crashAt < 0) return false;
      const read = readBy(ctx, BILLING);
      return fresh.every((offset) => read.has(offset));
    },
  },
  {
    id: "replay",
    title: l("Baştan oku", "Read it all again"),
    goal: l(
      "Analitik, log'da şu an duran **bütün** kayıtları yeniden okusun ve commit etsin.",
      "Analytics reads **every** record now on the log again, and commits.",
    ),
    hint: l(
      "Kayıtlar okununca silinmez. Analitik'in bayrağını geri taşıyabilirsin.",
      "Records are not deleted when read. You can move analytics' flag back.",
    ),
    par: 3,
    check: (ctx) => {
      const p = ctx.state.topics[TOPIC]!.partitions[0]!;
      if (p.records.length === 0) return false;
      const read = readBy(ctx, ANALYTICS);
      if (!p.records.every((r) => read.has(r.offset))) return false;
      // The commit has to come after the reading, not be the one left over from before.
      let lastRead = -1;
      ctx.events.forEach((evs, i) => {
        if (evs.some((e) => e.type === "delivered" && e.group === ANALYTICS.group)) lastRead = i;
      });
      const committedAfter = ctx.actions.some((a, i) => i > lastRead && a.type === "commit" && a.group === ANALYTICS.group);
      return committedAfter && ctx.state.groups[ANALYTICS.group]?.committed[P] === p.logEndOffset;
    },
  },
  {
    id: "missed",
    title: l("Kaçan sipariş", "The missed order"),
    goal: l(
      "Analitik bir siparişi **hiç okuyamadan** kaybetsin.",
      "Make analytics lose an order **before it ever reads it**.",
    ),
    hint: l(
      "Retention okuyucuyu beklemez. Analitik'in henüz okumadığı bir kaydı sildir.",
      "Retention waits for nobody. Get a record deleted that analytics has not read yet.",
    ),
    par: 4,
    check: (ctx) => {
      // Only records analytics never read at all count; rewinding and deleting what it had read does not.
      const everRead = new Set(ctx.state.groups[ANALYTICS.group]?.deliveries.map((d) => d.offset) ?? []);
      return ctx.events.flat().some((e) => {
        if (e.type !== "recordsDeleted") return false;
        for (let o = e.from; o < e.to; o++) if (!everRead.has(o)) return true;
        return false;
      });
    },
  },
];
