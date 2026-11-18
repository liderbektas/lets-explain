import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import { overcount, type Action, type StreamsEvent, type StreamsState } from "./model";

export interface SandboxCtx {
  start: StreamsState;
  state: StreamsState;
  actions: Action[];
  events: StreamsEvent[][];
}

const allDone = (s: StreamsState) => s.alive && s.position === s.input.length;

/** A crash that happened while some processed work was still uncommitted. */
const crashedWithWork = (ctx: SandboxCtx) =>
  ctx.events.flat().some((e) => e.type === "crashed" && e.uncommitted > 0);

/** A new order was processed before the app crashed. */
function processedNewBeforeCrash(ctx: SandboxCtx): boolean {
  const crashAt = ctx.actions.findIndex((a) => a.type === "crash");
  if (crashAt < 0) return false;
  return ctx.events
    .slice(0, crashAt)
    .flat()
    .some((e) => e.type === "processed" && e.offset >= ctx.start.input.length);
}

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "double-count",
    title: l("Çift sayım", "Double count"),
    goal: l(
      "Bir sipariş **iki kez** sayılsın. Sonunda uygulama ayakta olsun ve bütün siparişleri işlemiş olsun.",
      "Get one order counted **twice**. In the end the app must be up and have processed every order.",
    ),
    hint: l(
      "at_least_once'ta changelog'a yazılan güncelleme, commit edilmemiş olsa bile kalır.",
      "Under at_least_once, an update written to the changelog stays there even if it was never committed.",
    ),
    par: 5,
    check: (ctx) => allDone(ctx.state) && overcount(ctx.state) > 0,
  },
  {
    id: "exactly-once",
    title: l("Tam bir kez", "Exactly once"),
    goal: l(
      "Uygulama bir siparişi işledikten sonra **commit etmeden** çöksün. Yine de sonunda bütün siparişler işlenmiş ve **hiçbiri fazla sayılmamış** olsun.",
      "Let the app crash after processing an order **without committing**. Still, every order must end up processed and **none counted twice**.",
    ),
    hint: l(
      "exactly_once_v2'de commit edilmemiş güncellemeler yarım kalan bir transaction'a aittir ve çökünce iptal edilir.",
      "Under exactly_once_v2, uncommitted updates belong to an open transaction, which is aborted by the crash.",
    ),
    par: 6,
    check: (ctx) => crashedWithWork(ctx) && allDone(ctx.state) && overcount(ctx.state) === 0,
  },
  {
    id: "commit-first",
    title: l("Önce commit", "Commit first"),
    goal: l(
      "**at_least_once**'ta kal. Yeni bir sipariş işlensin, sonra uygulama çöküp yeniden başlasın. Hiçbir sipariş fazla sayılmasın.",
      "Stay on **at_least_once**. Process a new order, then let the app crash and restart. No order may be counted twice.",
    ),
    hint: l(
      "Çökmeden önce yapılan bir commit, hem input offset'ini hem de sayımı güvene alır.",
      "A commit before the crash secures both the input offset and the count.",
    ),
    par: 5,
    check: (ctx) =>
      !ctx.actions.some((a) => a.type === "setGuarantee") &&
      processedNewBeforeCrash(ctx) &&
      allDone(ctx.state) &&
      overcount(ctx.state) === 0,
  },
];
