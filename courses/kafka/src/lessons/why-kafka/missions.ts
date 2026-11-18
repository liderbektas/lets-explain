import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import { connections, type WorldAction, type WorldEvent, type WorldState } from "./model";

export interface WorldCtx {
  state: WorldState;
  actions: WorldAction[];
  events: WorldEvent[][];
}

export const missions: Mission<WorldCtx>[] = [
  {
    id: "tangle",
    title: l("Yumak", "The tangle"),
    goal: l(
      "Servisler birbirini **doğrudan** çağırırken bağlantı sayısını **12** yap.",
      "With services calling each other **directly**, get the connection count to **12**.",
    ),
    hint: l(
      "Doğrudan bağlantıda sayı kaynak × hedef. 12'yi hangi iki sayının çarpımı verir?",
      "With direct calls the count is sources × targets. Which two numbers multiply to 12?",
    ),
    par: 3,
    check: ({ state }) => state.mode === "direct" && connections(state) === 12,
  },
  {
    id: "lost",
    title: l("Kayıp e-posta", "The lost email"),
    goal: l(
      "Kafka olmadan, bir siparişin e-postası **kaybolsun**.",
      "Without Kafka, make an order's email **get lost**.",
    ),
    hint: l(
      "Doğrudan çağrıda karşı tarafın o anda ayakta olması gerekir.",
      "A direct call needs the other side to be up right then.",
    ),
    par: 2,
    check: ({ state }) => state.lost > 0,
  },
  {
    id: "nothing-lost",
    title: l("Hiçbiri kaybolmasın", "Nothing lost"),
    goal: l(
      "E-posta servisi çökükken **2 sipariş** gelsin. Hiçbir e-posta kaybolmasın ve sonunda hepsi gönderilsin.",
      "Let **2 orders** arrive while the email service is down. No email may be lost, and in the end all of them go out.",
    ),
    hint: l(
      "Siparişler bir yerde bekleyebilmeli. Önce araya ne koyabilirsin?",
      "The orders need somewhere to wait. What could you put in the middle first?",
    ),
    par: 5,
    check: ({ state, events }) => {
      if (state.lost > 0 || !state.emailUp || state.waiting > 0) return false;
      // Count orders that arrived during an outage and were sent later from the log.
      const late = events.flat().reduce((n, e) => n + (e.type === "sent" && e.late ? e.count : 0), 0);
      return late >= 2;
    },
  },
];
