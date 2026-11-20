import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import type { AppCtx } from "../shared/appShell";
import { abortTxn, ack, begin, commitTxn, crash, duplicateOrders, process, run, sandboxStart, txns, type TAction, type TEvent, type TState } from "./model";
import { boxOf, IDEMPOTENT, PLAIN, TRANSACTIONAL, type TBox } from "./shell";

export type TCtx = AppCtx<TState, TAction, TEvent>;
export type TScenario = Scenario<TCtx, TBox>;

const after = (actions: TAction[]) => run(actions, sandboxStart).states.at(-1)!;

const allInvoiced = (c: TCtx) => c.state.alive && c.state.position >= c.state.orders && c.state.committed >= c.state.orders;
const noNewDuplicates = (c: TCtx) => duplicateOrders(c.state) === duplicateOrders(c.start);
const rcCaughtUp = (c: TCtx) => c.state.rc.pos === c.state.log.length && c.state.rc.pos > c.start.rc.pos;

/** Free play: the billing app with plain settings, as the lesson left it. */
export const FREE: TBox = boxOf(sandboxStart, PLAIN);

export const scenarios: TScenario[] = [
  {
    id: "lost-ack",
    title: l("Kayıp onay", "The lost ack"),
    story: l(
      "Ağda kısa kopmalar yaşanıyor: broker faturayı yazıyor ama onayı (ack) yolda kayboluyor, producer da aynı faturayı tekrar gönderiyor. Muhasebe aynı siparişe iki fatura görmüş. Ağ ekibi bir kopmanın daha geleceğini söylüyor.",
      "The network keeps dropping for a moment: the broker writes the invoice but the acknowledgement gets lost, and the producer sends the same invoice again. Accounting saw two invoices for one order. The network team says another drop is coming.",
    ),
    goal: l("Bekleyen siparişlerin hepsi faturalansın; ack kaybolsa bile **hiçbir sipariş iki fatura** almasın.", "Every waiting order gets invoiced; even if an ack is lost, **no order gets two invoices**."),
    start: boxOf(sandboxStart, PLAIN, "ack-lost=1"),
    hints: [
      l("Retry'ı kapatmak çözüm değil: o zaman fatura hiç yazılmayabilir. Broker'ın tekrarı **tanıması** lazım.", "Turning retries off is no fix: then the invoice may never be written. The broker has to **recognise** the repeat."),
      l("`billing.properties`'te `enable.idempotence=true`: producer her kayda producer id ve sıra numarası koyar, broker aynı numarayı ikinci kez yazmaz.", "In `billing.properties`, `enable.idempotence=true`: the producer stamps every record with a producer id and a sequence number, and the broker never writes the same number twice."),
      l("`nano billing.properties` (`enable.idempotence=true`), sonra `./run-billing.sh`", "`nano billing.properties` (`enable.idempotence=true`), then `./run-billing.sh`"),
    ],
    par: 2,
    check: (c) => allInvoiced(c) && noNewDuplicates(c) && c.state.dropped > c.start.dropped,
  },
  {
    id: "crash-between",
    title: l("Arada çöktü", "Crashed in between"),
    story: l(
      "Idempotence açık. Ama bu gece bir deploy, uygulamayı faturayı yazdıktan hemen sonra, siparişin offset'ini commit etmeden öldürecek. Yeniden başlayan uygulama aynı siparişi tekrar faturalar: yeni bir oturum, yeni bir producer id, broker tekrarı tanımaz.",
      "Idempotence is on. But tonight a deploy will kill the app right after it writes an invoice and before it commits the order's offset. The restarted app invoices that order again: a new session, a new producer id, and the broker doesn't recognise the repeat.",
    ),
    goal: l("Deploy uygulamayı kessin, ama sonunda bütün siparişler **birer** fatura almış olsun ve uygulama çalışsın.", "Let the deploy kill the app, but in the end every order has **one** invoice and the app is running."),
    start: boxOf(sandboxStart, IDEMPOTENT, "crash-after=write"),
    hints: [
      l("Fatura ve girdi offset'inin commit'i **tek bir birim** olmalı: ya ikisi birden olur ya hiçbiri.", "The invoice and the input offset commit have to be **one unit**: both happen or neither does."),
      l("Bu bir transaction. `transactional.id` ver: yeniden başlayan uygulama aynı kimlikle gelir, coordinator yarım kalanı iptal eder.", "That's a transaction. Set a `transactional.id`: the restarted app comes back with the same id, and the coordinator aborts what was left half-done."),
      l("`nano billing.properties` (`transactional.id=billing-1` ekle), sonra `./run-billing.sh` iki kez", "`nano billing.properties` (add `transactional.id=billing-1`), then `./run-billing.sh` twice"),
    ],
    par: 3,
    check: (c) => allInvoiced(c) && noNewDuplicates(c) && c.state.transactional && c.actions.some((a) => a.type === "crash"),
  },
  {
    id: "accounting-reads",
    title: l("Muhasebe ne görmeli?", "What should accounting see?"),
    story: l(
      "Muhasebe servisi `invoices`'u okuyup toplam ciro hesaplıyor. Bugün iptal edilmiş (aborted) bir transaction'ın faturasını da saymış, rakam şişmiş.",
      "The accounting service reads `invoices` and adds up revenue. Today it also counted the invoice of an aborted transaction, and the number came out too high.",
    ),
    goal: l("Faturaları muhasebenin **okuması gerektiği gibi** oku: iptal edilenler hiç görünmesin.", "Read the invoices **the way accounting should**: aborted ones never show up."),
    start: boxOf(after([txns(true), begin, process, ack, abortTxn, begin, process, ack, commitTxn]), TRANSACTIONAL),
    hints: [
      l("Consumer varsayılan olarak her şeyi okur, iptal edilmiş transaction'ların kayıtlarını da.", "By default a consumer reads everything, records of aborted transactions included."),
      l("`kafka-console-consumer.sh`'ye `--isolation-level read_committed` ver.", "Give `kafka-console-consumer.sh` `--isolation-level read_committed`."),
      l(
        "`kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic invoices --from-beginning --isolation-level read_committed`",
        "`kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic invoices --from-beginning --isolation-level read_committed`",
      ),
    ],
    par: 1,
    check: rcCaughtUp,
  },
  {
    id: "stuck-reader",
    title: l("Takılan okuyucu", "The stuck reader"),
    story: l(
      "Billing uygulaması bir transaction'ın ortasında çöktü ve öyle kaldı. `read_committed` okuyan muhasebe o andan beri yeni fatura görmüyor: açık transaction onu bekletiyor.",
      "The billing app crashed in the middle of a transaction and stayed down. Accounting, reading with `read_committed`, hasn't seen a new invoice since: the open transaction holds it back.",
    ),
    goal: l("Açık transaction kapansın, bekleyen siparişler faturalansın ve muhasebe (`read_committed`) **her şeyi** okusun.", "The open transaction gets closed, the waiting orders get invoiced, and accounting (`read_committed`) reads **everything**."),
    start: boxOf(after([txns(true), begin, process, ack, crash]), TRANSACTIONAL),
    hints: [
      l("read_committed, açık bir transaction'ın ilk kaydında durur (last stable offset). Onu kapatan şey ne?", "read_committed stops at the first record of an open transaction (the last stable offset). What closes it?"),
      l("Aynı `transactional.id` ile yeniden başlayan uygulama, coordinator'ın yarım kalanı iptal etmesini sağlar. Sonra okuyucu devam edebilir.", "Restarting the app with the same `transactional.id` makes the coordinator abort the half-done one. Then the reader can go on."),
      l(
        "`./run-billing.sh`, sonra `kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic invoices --from-beginning --isolation-level read_committed`",
        "`./run-billing.sh`, then `kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic invoices --from-beginning --isolation-level read_committed`",
      ),
    ],
    par: 2,
    check: (c) => allInvoiced(c) && rcCaughtUp(c) && !c.state.txn,
  },
];
