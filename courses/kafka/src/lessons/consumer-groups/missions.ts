import { groupStats } from "../../engine/cluster";
import { l } from "@lets-explain/core/i18n";
import type { TopicCtx } from "../shared/topicSim";
import type { Mission } from "@lets-explain/core/course/types";
import { BILLING, isUp } from "./model";

const deliveries = (ctx: TopicCtx) => ctx.state.groups[BILLING]?.deliveries ?? [];
const dupsSince = (ctx: TopicCtx) => groupStats(ctx.state, BILLING).duplicates - groupStats(ctx.start, BILLING).duplicates;

/** Did `member` read anything in presses before index `until`? */
const readBefore = (ctx: TopicCtx, member: string, until: number) =>
  ctx.events.slice(0, until).some((evs) => evs.some((e) => e.type === "delivered" && e.member === member));

export const missions: Mission<TopicCtx>[] = [
  {
    id: "takeover",
    title: l("Devralınan iş", "Inherited work"),
    goal: l(
      "Bir okuyucu, **başka bir okuyucunun** okuduğu bir kaydı ikinci kez okusun.",
      "Make one reader read a record that **another reader** already read.",
    ),
    hint: l(
      "Commit edilmemiş ilerleme, partition'ı devralan okuyucuya geçmez. Biri okusun, commit etmeden çöksün.",
      "Uncommitted progress does not pass to whoever takes over the partition. Let one read, then crash it before it commits.",
    ),
    par: 3,
    check: (ctx) => {
      const all = deliveries(ctx);
      return all.some((d, i) => all.slice(0, i).some((x) => x.tp === d.tp && x.offset === d.offset && x.member !== d.member));
    },
  },
  {
    id: "handover",
    title: l("Temiz devir", "Clean handover"),
    goal: l(
      "Fatura 2 bir şeyler okuduktan sonra çöksün ve işini Fatura 1 devralsın. Hiçbir kayıt iki kez okunmasın ve sonunda **lag 0** olsun.",
      "Billing 2 reads something, then crashes, and Billing 1 takes over its work. No record may be read twice, and **lag ends at 0**.",
    ),
    hint: l(
      "Lag commit edilmiş offset'e göre sayılır. Kim, ne zaman commit etmeli?",
      "Lag counts from the committed offset. Who has to commit, and when?",
    ),
    par: 5,
    check: (ctx) => {
      const crashAt = ctx.moves.findIndex(
        (m, i) => m.some((a) => a.type === "crashMember" && a.member === "billing-2") && readBefore(ctx, "billing-2", i),
      );
      if (crashAt < 0 || isUp(ctx.state, "billing-2") || !isUp(ctx.state, "billing-1")) return false;
      return dupsSince(ctx) === 0 && groupStats(ctx.state, BILLING).lag === 0;
    },
  },
  {
    id: "team",
    title: l("Üç kişilik takım", "A team of three"),
    goal: l(
      "Fatura group'unda **3 okuyucu** çalışsın ve **her biri** en az bir kayıt okusun.",
      "Get **3 readers** working in the billing group, with **each** reading at least one record.",
    ),
    hint: l("Üçüncü okuyucuyu başlatınca partition'lar yeniden paylaşılır.", "Starting the third reader shares the partitions out again."),
    par: 4,
    check: (ctx) => {
      const ids = ["billing-1", "billing-2", "billing-3"];
      return ids.every((id) => isUp(ctx.state, id) && deliveries(ctx).some((d) => d.member === id));
    },
  },
];
