import type { Scenario } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { apply, createState, violations, type OEvent, type OState } from "./model";
import { oBox, type OBox, type OShellAction } from "./shell";

/**
 * Scenarios for ordering: the `orders` topic with 3 partitions, read by three shipping
 * instances (Shipping-1 owns P0, Shipping-2 P1, Shipping-3 P2). With a key, 1043 goes to P0,
 * 1042 to P2 and 1045 to P1; with 4 partitions 1045 moves to P0 (the tests check these).
 */

export interface OrderingCtx {
  startBox: OBox;
  box: OBox;
  start: OState;
  state: OState;
  actions: OShellAction[];
  events: OEvent[][];
}

export type OrderingScenario = Scenario<OrderingCtx, OBox>;

export function orderingCtx(startBox: OBox, run: { boxes: OBox[]; events: OEvent[][]; actions: OShellAction[] }): OrderingCtx {
  const box = run.boxes[run.boxes.length - 1]!;
  return { startBox, box, start: startBox.o, state: box.o, actions: run.actions, events: run.events };
}

const B = "--bootstrap-server localhost:9092";
export const KEYED = `kafka-console-producer.sh ${B} --topic orders --property parse.key=true --property key.separator=:`;
export const KEYLESS = `kafka-console-producer.sh ${B} --topic orders`;
const lines = (order: string, ...events: string[]) => `printf "${events.map((e) => `${order}:${e}`).join("\\n")}\\n"`;

/** Free play: an empty topic and three running instances. */
export const FREE = oBox(createState());

/** 1045's first event is written with its key (to P1), and Shipping-2, which owns P1, is stuck. */
const STUCK_1045 = oBox(apply(createState(), { type: "write", order: "1045", keyed: true }).state, ["c2"]);

const handledInOrder = (s: OState, order: string) => {
  const done = s.processed.filter((x) => x.order === order);
  return done.length === 3 && done.every((x, i) => x.stage === i + 1);
};
const keyedOnly = (ctx: OrderingCtx) => !ctx.actions.some((a) => a.type === "write" && !a.keyed);
const brokenNow = (ctx: OrderingCtx) => violations(ctx.state) > violations(ctx.start);

export const scenarios: OrderingScenario[] = [
  {
    id: "keep-order",
    title: l("Sırayla kargola", "Ship it in order"),
    story: l(
      "Sipariş 1043 için üç olay yazılacak: `created`, `paid`, `shipped`. Kargo-1 bir süredir yavaş (durdurulmuş gibi: `jobs`'ta Stopped). Kargo servisi bir siparişin olaylarını **asla** ters sırada işlememeli.",
      "Three events are about to be written for order 1043: `created`, `paid`, `shipped`. Shipping-1 has been slow for a while (as good as paused: Stopped in `jobs`). The shipping service must **never** handle an order's events out of order.",
    ),
    goal: l(
      "1043'ün üç olayı yazılsın, Kargo-1 devam etsin ve üçü de **sırayla** işlensin.",
      "1043's three events are written, Shipping-1 is resumed, and all three are handled **in order**.",
    ),
    start: oBox(createState(), ["c1"]),
    hints: [
      l(
        "Key'siz olaylar partition'lara dağılır ve her partition'ı başka bir instance okur: yavaş olan geride kalınca sıra bozulur. Aynı key aynı partition'a gider.",
        "Events without a key are spread over the partitions, each read by a different instance: when the slow one lags, the order breaks. The same key goes to the same partition.",
      ),
      l(
        "`--property parse.key=true --property key.separator=:` ile sipariş numarasını key yap; `kill -CONT %1` Kargo-1'i devam ettirir, `sleep` zaman geçirir.",
        "Make the order number the key with `--property parse.key=true --property key.separator=:`; `kill -CONT %1` resumes Shipping-1, and `sleep` lets time pass.",
      ),
      l(`\`${lines("1043", "created", "paid", "shipped")} | ${KEYED}\`, \`kill -CONT %1\`, \`sleep 3\``, `\`${lines("1043", "created", "paid", "shipped")} | ${KEYED}\`, \`kill -CONT %1\`, \`sleep 3\``),
    ],
    par: 3,
    check: (ctx) => handledInOrder(ctx.state, "1043") && !brokenNow(ctx),
  },
  {
    id: "reproduce",
    title: l("Hatayı yeniden üret", "Reproduce the bug"),
    story: l(
      "Bir müşteri \"kargolandı\" bildirimini \"ödendi\"den **önce** aldı. Ekip, olayların key'siz yazıldığından şüpheleniyor. Kargo-1 yine yavaş (Stopped). Şüpheyi kanıtla: 1042'nin üç olayını key'siz yaz ve bir saniye geçsin.",
      "A customer got the \"shipped\" notice **before** \"paid\". The team suspects the events were written without a key. Shipping-1 is slow again (Stopped). Prove the suspicion: write 1042's three events without a key and let a second pass.",
    ),
    goal: l("Bir siparişin **sonraki** olayı öncekinden **önce** işlensin.", "An order's **later** event is handled **before** an earlier one."),
    start: oBox(createState(), ["c1"]),
    hints: [
      l("Key'siz kayıtlar partition'lara sırayla dağılır: created P0'a, paid P1'e, shipped P2'ye.", "Records without a key go to the partitions in turn: created to P0, paid to P1, shipped to P2."),
      l("P0'ı yavaş Kargo-1 okuyor; diğer ikisi beklemez.", "Slow Shipping-1 reads P0; the other two don't wait."),
      l(`\`${lines("1042", "created", "paid", "shipped")} | ${KEYLESS}\`, \`sleep 1\``, `\`${lines("1042", "created", "paid", "shipped")} | ${KEYLESS}\`, \`sleep 1\``),
    ],
    par: 2,
    check: (ctx) => brokenNow(ctx),
  },
  {
    id: "grow-breaks",
    title: l("Key bile yetmedi", "Even the key wasn't enough"),
    story: l(
      "Dün gece `orders` 3'ten 4 partition'a çıkarıldı ve 1045'in olayları karıştı; oysa hepsi key'le yazılmıştı. 1045'in `created` olayı yazıldı ama henüz işlenmedi (Kargo-2 yavaş). Olayı yeniden üret: büyüt, sonra `paid`'i key'le yaz ve bir saniye geçsin.",
      "Last night `orders` grew from 3 to 4 partitions and 1045's events got mixed up, even though all were written with a key. 1045's `created` event is written but not handled yet (Shipping-2 is slow). Reproduce it: grow, then write `paid` with the key and let a second pass.",
    ),
    goal: l("Sadece key'le yazarak 1045'in sırası bozulsun.", "1045's order breaks while you write with a key only."),
    start: STUCK_1045,
    hints: [
      l(
        "Partition = murmur2(key) % partition sayısı. Sayı değişince aynı key başka bir partition'a gidebilir.",
        "Partition = murmur2(key) % the partition count. When the count changes, the same key can go to another partition.",
      ),
      l("`kafka-topics.sh --alter --partitions 4`, sonra key'li `paid`.", "`kafka-topics.sh --alter --partitions 4`, then `paid` with the key."),
      l(
        `\`kafka-topics.sh ${B} --alter --topic orders --partitions 4\`, \`echo "1045:paid" | ${KEYED}\`, \`sleep 1\``,
        `\`kafka-topics.sh ${B} --alter --topic orders --partitions 4\`, \`echo "1045:paid" | ${KEYED}\`, \`sleep 1\``,
      ),
    ],
    par: 3,
    check: (ctx) => keyedOnly(ctx) && brokenNow(ctx),
  },
  {
    id: "drain-then-grow",
    title: l("Önce boşalt, sonra büyüt", "Drain, then grow"),
    story: l(
      "Bu sefer büyütmeyi doğru yap. `orders` 4 partition'a çıkacak; 1045'in `created` olayı hâlâ bekliyor çünkü Kargo-2 durdurulmuş. Büyütmeden önce bekleyen ne varsa işlensin; sonra 1045'in `paid` ve `shipped` olaylarını key'le yaz.",
      "This time do the growing right. `orders` goes to 4 partitions; 1045's `created` event still waits because Shipping-2 is paused. Before growing, let whatever waits be handled; then write 1045's `paid` and `shipped` with the key.",
    ),
    goal: l(
      "Topic 4 partition olsun, 1045'in üç olayı da işlensin ve sıra **hiç** bozulmasın.",
      "The topic has 4 partitions, all three of 1045's events are handled, and the order **never** breaks.",
    ),
    start: STUCK_1045,
    hints: [
      l(
        "Eski partition'daki olay işlenmeden partition eklersen, yeni partition'a düşen olay onu geçebilir.",
        "If you add a partition before the old partition's event is handled, an event landing in the new one can overtake it.",
      ),
      l("Önce Kargo-2'yi devam ettir ve beklemeyi bitir (`kafka-consumer-groups.sh --describe` LAG 0), sonra büyüt ve yaz.", "Resume Shipping-2 first and let the backlog clear (`kafka-consumer-groups.sh --describe` shows LAG 0), then grow and write."),
      l(
        `\`kill -CONT %2\`, \`sleep 1\`, \`kafka-topics.sh ${B} --alter --topic orders --partitions 4\`, \`${lines("1045", "paid", "shipped")} | ${KEYED}\`, \`sleep 3\``,
        `\`kill -CONT %2\`, \`sleep 1\`, \`kafka-topics.sh ${B} --alter --topic orders --partitions 4\`, \`${lines("1045", "paid", "shipped")} | ${KEYED}\`, \`sleep 3\``,
      ),
    ],
    par: 5,
    check: (ctx) => {
      if (!keyedOnly(ctx) || ctx.state.partitions.length < 4 || brokenNow(ctx)) return false;
      const where = new Set(ctx.state.partitions.flatMap((p, i) => (p.some((r) => r.order === "1045") ? [i] : [])));
      return where.size >= 2 && handledInOrder(ctx.state, "1045");
    },
  },
];
