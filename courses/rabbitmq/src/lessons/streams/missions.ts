import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { BrokerCtx } from "../shared/BrokerScene";
import { eventsOf } from "../shared/missionHelpers";

export const missions: Mission<BrokerCtx>[] = [
  {
    id: "from-start",
    title: l("En baştan", "From the start"),
    goal: l(
      "Okuyucu A, stream'de **zaten duran** üç event'i (`e1`–`e3`) okuyup ack'lesin.",
      "Reader A reads the three events **already in** the stream (`e1`–`e3`) and acks them.",
    ),
    hint: l("Bağlanırken nereden başlayacağını seçersin.", "You choose where to start when you connect."),
    par: 2,
    check: (ctx) => {
      const acked = new Set(eventsOf(ctx, "acked").filter((e) => e.tag === "a").flatMap((e) => e.ids));
      return ["m1", "m2", "m3"].every((id) => acked.has(id));
    },
  },
  {
    id: "both-see",
    title: l("İkisi de görsün", "Both see it"),
    goal: l(
      "**Yeni** gönderdiğin bir event, iki okuyucuya da gitsin.",
      "One event you **send now** reaches both readers.",
    ),
    hint: l("Kuyruktan farklı olarak, stream'de bir mesajı okumak onu başkasından almaz.", "Unlike a queue, reading a message from a stream does not take it from anyone else."),
    par: 3,
    check: (ctx) => {
      const fresh = new Set(eventsOf(ctx, "routed").map((e) => e.id));
      const to = (tag: string) => new Set(eventsOf(ctx, "delivered").filter((d) => d.tag === tag).map((d) => d.id));
      const a = to("a");
      const b = to("b");
      return [...fresh].some((id) => a.has(id) && b.has(id));
    },
  },
  {
    id: "replay",
    title: l("Yeniden oynat", "Replay"),
    goal: l(
      "Okuyucu A event'leri okuyup ack'lesin, ayrılsın, sonra geri gelip **aynı event'leri yeniden** okusun.",
      "Reader A reads and acks the events, leaves, then comes back and reads **the same events again**.",
    ),
    hint: l("Ack, stream'den hiçbir şey silmez.", "An ack deletes nothing from a stream."),
    par: 4,
    check: (ctx) => {
      let ackedBefore = new Set<string>();
      for (const evs of ctx.events) {
        for (const e of evs) {
          if (e.type === "delivered" && e.tag === "a" && ackedBefore.has(e.id)) return true;
          if (e.type === "acked" && e.tag === "a") ackedBefore = new Set([...ackedBefore, ...e.ids]);
        }
      }
      return false;
    },
  },
];
