import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf, lostSince } from "../shared/missionHelpers";

/** Correlation ids of the answers the client acked, in order. */
function clientAcked(ctx: BrokerCtx): string[] {
  const out: string[] = [];
  ctx.events.forEach((evs, i) => {
    const before = ctx.states[i]!;
    for (const e of evs) {
      if (e.type !== "acked" || e.tag !== "client") continue;
      for (const id of e.ids) {
        const m = before.consumers.client?.unacked.find((x) => x.id === id);
        if (m?.correlationId) out.push(m.correlationId);
      }
    }
  });
  return out;
}

/** Correlation ids of answers in the order they reached the client. */
function answersArrived(ctx: BrokerCtx): string[] {
  const out: string[] = [];
  ctx.events.forEach((evs, i) => {
    const after = ctx.states[i + 1]!;
    for (const e of evs) {
      if (e.type !== "delivered" || e.tag !== "client") continue;
      const m = after.consumers.client?.unacked.find((x) => x.id === e.id);
      if (m?.correlationId) out.push(m.correlationId);
    }
  });
  return out;
}

/** Correlation ids of requests a server acked. */
function requestsDone(ctx: BrokerCtx): string[] {
  const out: string[] = [];
  ctx.events.forEach((evs, i) => {
    const before = ctx.states[i]!;
    for (const e of evs) {
      if (e.type !== "acked" || e.tag === "client") continue;
      for (const id of e.ids) {
        const m = before.consumers[e.tag]?.unacked.find((x) => x.id === id);
        if (m?.correlationId) out.push(m.correlationId);
      }
    }
  });
  return out;
}

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "round-trip",
    title: l("Tam tur", "Round trip"),
    goal: l(
      "Bir istek gönder. Sunucu cevaplasın ve isteği ack'lesin; istemci de **aynı correlation id'li** cevabı alıp ack'lesin.",
      "Send a request. A server answers and acks it, and the client receives and acks the answer with **the same correlation id**.",
    ),
    hint: l("Sunucu önce cevabı gönderir, sonra isteği onaylar.", "The server sends the answer first, then acks the request."),
    par: 4,
    check: (ctx) => {
      const done = requestsDone(ctx);
      return clientAcked(ctx).some((c) => done.includes(c));
    },
  },
  {
    id: "out-of-order",
    title: l("Sıra karıştı", "Out of order"),
    goal: l(
      "İki istek gönder ve cevaplar **ters sırayla** gelsin: önce ikinci isteğin cevabı. İstemci ikisini de ack'lesin.",
      "Send two requests and get the answers **in reverse order**: the second request's answer first. The client acks both.",
    ),
    hint: l("İki sunucu var; hangisinin önce cevap verdiğini sen seçersin.", "There are two servers; you choose which one answers first."),
    par: 6,
    check: (ctx) => {
      const order = answersArrived(ctx);
      const i1 = order.indexOf("c1");
      const i2 = order.indexOf("c2");
      const acked = clientAcked(ctx);
      return i1 >= 0 && i2 >= 0 && i2 < i1 && acked.includes("c1") && acked.includes("c2");
    },
  },
  {
    id: "rescue",
    title: l("Yarım kalan istek", "Half-done request"),
    goal: l(
      "Bir sunucu isteği cevaplamadan çöksün. İstek kaybolmasın: diğer sunucu cevaplasın ve istemci cevabı ack'lesin.",
      "Let a server crash before answering. The request must not be lost: the other server answers and the client acks it.",
    ),
    hint: l("Ack'lenmemiş istek, sunucu çökünce kuyruğa geri döner.", "An unacked request goes back to the queue when its server crashes."),
    par: 4,
    check: (ctx) =>
      lostSince(ctx).length === 0 &&
      eventsOf(ctx, "consumerGone").some((e) => e.crashed && e.tag.startsWith("server")) &&
      eventsOf(ctx, "delivered").some((d) => d.redelivered && d.tag.startsWith("server")) &&
      clientAcked(ctx).length > 0,
  },
];
