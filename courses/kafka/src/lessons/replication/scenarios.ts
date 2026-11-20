import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import { simulateReplicated, type RAction, type RState } from "../../engine/replication";
import { rBox, type RBox, type RCtx } from "../../engine/replicationCli";
import { sandboxStart } from "./model";

export type ReplicationScenario = Scenario<RCtx, RBox>;

const after = (actions: RAction[], start: RState) => simulateReplicated(actions, start).states.at(-1)!;
const B = "--bootstrap-server localhost:9092";
const PRODUCE = `kafka-console-producer.sh ${B} --topic orders`;

/** A healthy cluster: broker 1 leads P0, ISR = [1, 2, 3], acks=all, min.insync.replicas=1. */
export const FREE = rBox(sandboxStart);

/** Writes made during the scenario, not the lesson's earlier ones. */
const fresh = (ctx: RCtx) => ctx.state.sends.filter((x) => !ctx.start.sends.some((y) => y.id === x.id));
/** Position of the first event matching `test`, counting every event of every action in order. */
const at = (ctx: RCtx, test: (e: RCtx["events"][number][number]) => boolean) => ctx.events.flat().findIndex(test);

/** kafka-3 is paused and fell out of the ISR while two orders went by. */
const LAGGING = after(
  [{ type: "setSlow", broker: 3, slow: true }, { type: "produce", value: "order:3001", partition: 0 }, { type: "produce", value: "order:3002", partition: 0 }, { type: "tick" }],
  sandboxStart,
);

/** kafka-3 is paused but still in the ISR; an order was acked with acks=1 and is not on kafka-3 yet. */
const HIDDEN = after(
  [{ type: "setSlow", broker: 3, slow: true }, { type: "setAcks", acks: 1 }, { type: "produce", value: "order:3100", partition: 0 }],
  sandboxStart,
);
const hiddenOffset = HIDDEN.sends.at(-1)!.offset!;

export const scenarios: ReplicationScenario[] = [
  {
    id: "leader-down",
    title: l("Lider bakımda", "The leader goes down"),
    story: l(
      "`kafka-1`, P0'ın leader'ı, bu gece işletim sistemi güncellemesi için kapanacak. Müşteri siparişleri kesintisiz onay almaya devam etmeli; kimse leader'ı elle seçmeyecek.",
      "`kafka-1`, P0's leader, goes down tonight for an OS update. Customer orders must keep getting acks without a break; nobody is going to pick a leader by hand.",
    ),
    goal: l("`kafka-1` kapalıyken yazılan bir sipariş **onay** alsın.", "An order written while `kafka-1` is down gets an **ack**."),
    start: FREE,
    hints: [
      l("Leader düşünce ISR'deki bir follower otomatik olarak yerini alır. Sen sadece broker'ı kapat ve yazmaya devam et.", "When the leader goes, a follower in the ISR takes over on its own. Just stop the broker and keep writing."),
      l("`docker stop kafka-1`, sonra konsol producer'ıyla bir sipariş gönder; `kafka-topics.sh --describe` yeni leader'ı gösterir.", "`docker stop kafka-1`, then send an order with the console producer; `kafka-topics.sh --describe` shows the new leader."),
      l(`\`docker stop kafka-1\`, sonra \`echo "order:5001" | ${PRODUCE}\``, `\`docker stop kafka-1\`, then \`echo "order:5001" | ${PRODUCE}\``),
    ],
    par: 2,
    check: (ctx) => {
      const down = at(ctx, (e) => e.type === "brokerDown" && e.broker === 1);
      const acked = ctx.events.flat().findIndex((e, i) => i > down && e.type === "acked");
      return down >= 0 && acked > down && ctx.state.brokers[0]!.alive === false && fresh(ctx).some((x) => x.status === "acked");
    },
  },
  {
    id: "slow-follower",
    title: l("Yavaş follower", "The slow follower"),
    story: l(
      "Ops, `kafka-3`'ün diskinde sorun olduğunu söylüyor: broker çalışıyor ama kopyalamakta geri kalıyor. Bunu `docker pause` ile canlandır ve leader'ın onu ISR'den ne zaman çıkardığını gör.",
      "Ops says `kafka-3`'s disk is acting up: the broker runs but falls behind on copying. Act it out with `docker pause` and see when the leader drops it from the ISR.",
    ),
    goal: l("Hiçbir broker durdurulmadan P0'ın ISR'si `[1, 2]` olsun.", "Without stopping any broker, P0's ISR becomes `[1, 2]`."),
    start: FREE,
    hints: [
      l(
        "Bir follower ancak geride kalırsa **ve** `replica.lag.time.max.ms` (30 sn) geçerse ISR'den çıkar. Geride kalması için kaçıracağı yeni kayıtlar gerekir.",
        "A follower leaves the ISR only if it falls behind **and** `replica.lag.time.max.ms` (30 s) passes. To fall behind it needs new records to miss.",
      ),
      l("`docker pause kafka-3`, bir sipariş gönder, sonra `sleep 30`.", "`docker pause kafka-3`, send an order, then `sleep 30`."),
      l(`\`docker pause kafka-3\`, \`echo "order:5002" | ${PRODUCE}\`, \`sleep 30\``, `\`docker pause kafka-3\`, \`echo "order:5002" | ${PRODUCE}\`, \`sleep 30\``),
    ],
    par: 3,
    check: (ctx) => ctx.state.brokers.every((b) => b.alive) && ctx.state.partitions[0]!.isr.join() === "1,2",
  },
  {
    id: "back-in-sync",
    title: l("Yeniden senkron", "Back in sync"),
    story: l(
      "`kafka-3`'ün disk sorunu çözüldü ama broker hâlâ dondurulmuş duruyor ve ISR'de değil. P0 şu an sadece iki kopyaya güveniyor.",
      "`kafka-3`'s disk problem is fixed, but the broker is still frozen and out of the ISR. P0 relies on just two copies right now.",
    ),
    goal: l("`kafka-3` kaçırdığı kayıtları alsın ve ISR yeniden `[1, 2, 3]` olsun.", "`kafka-3` catches up on what it missed and the ISR is `[1, 2, 3]` again."),
    start: rBox(LAGGING),
    hints: [
      l("`docker ps` ve `kafka-topics.sh --describe` sana durumu gösterir: container'ın durumu ne?", "`docker ps` and `kafka-topics.sh --describe` show you the state: what is the container's status?"),
      l("Dondurulmuş bir container `docker unpause` ile devam eder; follower kaldığı yerden kopyalar.", "A frozen container carries on with `docker unpause`; the follower copies from where it stopped."),
      l("`docker unpause kafka-3`", "`docker unpause kafka-3`"),
    ],
    par: 1,
    check: (ctx) => {
      const p = ctx.state.partitions[0]!;
      return p.isr.join() === "1,2,3" && (p.logs[3]?.length ?? 0) === (p.leader === null ? -1 : p.logs[p.leader]!.length);
    },
  },
  {
    id: "invisible-order",
    title: l("Görünmeyen sipariş", "The invisible order"),
    story: l(
      `Sipariş servisi \`acks=1\` ile yazdı ve onay aldı (offset ${hiddenOffset}). Ama raporlama servisi bu siparişi okuyamıyor; \`kafka-console-consumer.sh\` da göstermiyor. \`kafka-3\` dondurulmuş ama hâlâ ISR'de.`,
      `The order service wrote with \`acks=1\` and got its ack (offset ${hiddenOffset}). But the reporting service cannot read the order; \`kafka-console-consumer.sh\` does not show it either. \`kafka-3\` is frozen but still in the ISR.`,
    ),
    goal: l("Sipariş consumer'lara görünür olsun, hiçbir broker durdurulmadan.", "Make the order visible to consumers, without stopping any broker."),
    start: rBox(HIDDEN),
    hints: [
      l(
        "Consumer'lar sadece high watermark'a kadar okur: ISR'deki **her** kopyada olan kayıtlar. Kaydı tutan, ISR'deki geri kalmış kopya.",
        "Consumers read only up to the high watermark: records that **every** copy in the ISR has. What holds it back is the copy in the ISR that fell behind.",
      ),
      l("İki yol var: geri kalanı yetiştir, ya da 30 sn geçsin ki ISR'den çıksın.", "Two ways: let the laggard catch up, or let 30 s pass so it leaves the ISR."),
      l("`docker unpause kafka-3` (ya da `sleep 30`)", "`docker unpause kafka-3` (or `sleep 30`)"),
    ],
    par: 1,
    check: (ctx) => ctx.state.brokers.every((b) => b.alive) && ctx.state.partitions[0]!.hw > hiddenOffset,
  },
  {
    id: "unclean-loss",
    title: l("Bilerek kayıp", "Losing data on purpose"),
    story: l(
      "Ekip `unclean.leader.election.enable=true` yapmayı tartışıyor: \"kesinti olmasın, gerekirse geri kalmış kopya leader olsun.\" Test ortamında bunun bedelini göster: onaylanmış bir siparişi kaybettir.",
      "The team is debating `unclean.leader.election.enable=true`: \"no outage; let a copy that fell behind lead if it must.\" Show the price in the test cluster: lose an acknowledged order.",
    ),
    goal: l("Producer'a **onaylanmış** bir sipariş kaybolsun.", "An order the producer got an **ack** for is lost."),
    start: FREE,
    hints: [
      l(
        "Geride kalmış bir kopyanın leader olabilmesi için ISR'deki kopyaların hepsi gitmeli ve unclean seçime izin verilmeli. Önce birini geride bırak.",
        "For a copy that fell behind to lead, every copy in the ISR must be gone and unclean election must be allowed. First leave one behind.",
      ),
      l(
        "kafka-3'ü dondur, bir sipariş gönder, 30 sn bekle (ISR'den çıksın), kafka-1 ve kafka-2'yi durdur, sonra `kafka-configs.sh` ile unclean seçimi aç.",
        "Pause kafka-3, send an order, wait 30 s (it leaves the ISR), stop kafka-1 and kafka-2, then turn unclean election on with `kafka-configs.sh`.",
      ),
      l(
        `\`docker pause kafka-3\`, \`echo "order:5003" | ${PRODUCE}\`, \`sleep 30\`, \`docker stop kafka-1 kafka-2\`, \`kafka-configs.sh ${B} --alter --entity-type topics --entity-name orders --add-config unclean.leader.election.enable=true\``,
        `\`docker pause kafka-3\`, \`echo "order:5003" | ${PRODUCE}\`, \`sleep 30\`, \`docker stop kafka-1 kafka-2\`, \`kafka-configs.sh ${B} --alter --entity-type topics --entity-name orders --add-config unclean.leader.election.enable=true\``,
      ),
    ],
    par: 5,
    check: (ctx) => fresh(ctx).some((x) => x.status === "lost"),
  },
];
