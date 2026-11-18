import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import { duplicateOrders, isAborted, type TAction, type TEvent, type TState } from "./model";

export interface SandboxCtx {
  start: TState;
  state: TState;
  actions: TAction[];
  events: TEvent[][];
}

const dupsSince = (c: SandboxCtx) => duplicateOrders(c.state) - duplicateOrders(c.start);

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "retry-dup",
    title: l("Kayıp onay", "Lost ack"),
    goal: l(
      "Onay yolda kaybolsun ve aynı sipariş için **iki fatura** yazılsın.",
      "Let an acknowledgement get lost so that **two invoices** are written for the same order.",
    ),
    hint: l(
      "Idempotence kapalıyken bir fatura yaz ve onayı beklemeden tekrar gönder.",
      "With idempotence off, write an invoice and send it again instead of waiting for the ack.",
    ),
    par: 2,
    check: (c) => dupsSince(c) > 0,
  },
  {
    id: "broker-drops",
    title: l("Broker yakalasın", "Let the broker catch it"),
    goal: l(
      "Onay yine kaybolsun ve producer tekrar göndersin, ama log'a **tek fatura** yazılsın.",
      "The ack gets lost again and the producer retries, but only **one invoice** reaches the log.",
    ),
    hint: l(
      "Önce idempotence'ı aç: broker sıra numarasından tekrarı tanır.",
      "Switch idempotence on first: the broker recognises the retry by its sequence number.",
    ),
    par: 3,
    check: (c) => c.state.dropped - c.start.dropped > 0 && dupsSince(c) === 0,
  },
  {
    id: "hidden-abort",
    title: l("Yarım iş görünmesin", "Hide the half-done work"),
    goal: l(
      "Bir transaction'ı **iptal et**. Sonra iki okuyucu da okusun: Muhasebe (read_committed) iptal edilen faturayı **görmesin**, Rapor (read_uncommitted) **görsün**.",
      "**Abort** a transaction. Then let both readers read: Accounting (read_committed) must **not** see the aborted invoice, Reports (read_uncommitted) **does**.",
    ),
    hint: l(
      "Transaction'ları aç, başlat, bir fatura yaz ve abort et. Sonra iki okuyucuyu da okut.",
      "Turn transactions on, begin, write an invoice and abort. Then have both readers read.",
    ),
    par: 6,
    check: (c) => {
      const s = c.state;
      const fresh = s.log.slice(c.start.log.length).filter((r) => r.kind === "data" && isAborted(s, r));
      if (fresh.length === 0) return false;
      return fresh.every((r) => s.ru.seen.includes(r.offset) && !s.rc.seen.includes(r.offset) && s.rc.pos > r.offset);
    },
  },
];
