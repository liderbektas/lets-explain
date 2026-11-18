import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { depth } from "../../engine/broker";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf, lostSince } from "../shared/missionHelpers";

const Q = "orders";
const consumersOn = (s: BrokerCtx["state"]) => Object.values(s.consumers).filter((c) => c.queue === Q).length;

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "drain",
    title: l("Kuyruğu erit", "Drain the queue"),
    goal: l(
      "Her şeyi bitir: **hazır ve onay bekleyen 0** olsun, hiçbir sipariş kaybolmasın.",
      "Finish everything: **ready and unacked at 0**, and no order lost.",
    ),
    hint: l(
      "İşçilerden biri hiç ack göndermiyor: elindeki siparişler orada sonsuza kadar bekler.",
      "One of the workers never acks: the orders in its hands wait there forever.",
    ),
    par: 4,
    check: (ctx) => depth(ctx.state, Q).total === 0 && lostSince(ctx).length === 0,
  },
  {
    id: "zero",
    title: l("Sıfır consumer alarmı", "Zero-consumer alarm"),
    goal: l(
      "Bütün işçiler gitsin ve kuyruk **consumer'sız** kalsın. Sonra yeni bir işçi bağla ve bir sipariş bitsin.",
      "Let every worker go so the queue has **no consumers**. Then connect a new worker and get one order done.",
    ),
    hint: l("Consumer sayısı 0 olunca kuyruk sadece büyür; izlemede bunun için ayrı bir alarm olmalı.", "With 0 consumers a queue only grows; monitoring needs an alarm just for that."),
    par: 4,
    check: (ctx) => {
      const emptyAt = ctx.states.findIndex((s) => consumersOn(s) === 0);
      if (emptyAt < 0) return false;
      return ctx.events.slice(emptyAt).some((evs) => evs.some((e) => e.type === "acked"));
    },
  },
  {
    id: "pile",
    title: l("Yığılma", "Pile-up"),
    goal: l("Hazır (ready) sayısını **5**'e çıkar: işçiler yetişemesin.", "Push the ready count to **5**: the workers cannot keep up."),
    hint: l("İşçi çökünce elindekiler de kuyruğa geri döner.", "When a worker crashes, what it held goes back to the queue too."),
    par: 3,
    check: (ctx) => depth(ctx.state, Q).ready >= 5 && eventsOf(ctx, "routed").length + eventsOf(ctx, "requeued").length > 0,
  },
];
