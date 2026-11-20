import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import { simulateReplicated, type RAction, type RState } from "../../engine/replication";
import { rBox, type RBox, type RCtx } from "../../engine/replicationCli";
import { sandboxStart } from "./model";

export type AcksScenario = Scenario<RCtx, RBox>;

const after = (actions: RAction[], start: RState) => simulateReplicated(actions, start).states.at(-1)!;
const B = "--bootstrap-server localhost:9092";
const PRODUCE = `kafka-console-producer.sh ${B} --topic orders`;
const CONFIG = (kv: string) => `kafka-configs.sh ${B} --alter --entity-type topics --entity-name orders --add-config ${kv}`;

/** Every broker up, kafka-2 leads P0, ISR = [1, 2, 3], min.insync.replicas = 2. */
export const FREE = rBox(sandboxStart);

/** The same cluster before anyone set min.insync.replicas: it is back at 1. */
const LOOSE = after([{ type: "setMinIsr", value: 1 }], sandboxStart);

/** Writes made during the scenario, not the lesson's earlier ones. */
const fresh = (ctx: RCtx) => ctx.state.sends.filter((x) => !ctx.start.sends.some((y) => y.id === x.id));
const flat = (ctx: RCtx) => ctx.events.flat();
const lastIndex = <T>(xs: T[], test: (x: T) => boolean) => xs.map(test).lastIndexOf(true);

export const scenarios: AcksScenario[] = [
  {
    id: "payments-safe",
    title: l("Ödemeler güvende", "Payments, safely"),
    story: l(
      "Ödeme ekibinin kuralı: \"Onay aldığımız hiçbir ödeme, bir broker çökse bile kaybolmamalı. Tek kopya kaldıysa yazmayı reddet.\" Şu an topic'te `min.insync.replicas` varsayılan değerinde (1).",
      "The payments team's rule: \"No payment we got an ack for may be lost, even if a broker crashes. If only one copy is left, refuse the write.\" Right now the topic's `min.insync.replicas` is at its default (1).",
    ),
    goal: l("`min.insync.replicas=2` olsun ve `acks=all` ile gönderilen bir ödeme onay alsın.", "Set `min.insync.replicas=2` and get an ack for a payment sent with `acks=all`."),
    start: rBox(LOOSE),
    hints: [
      l("Kuralın iki yarısı var: topic'te bir ayar (`kafka-configs.sh`), producer'da bir ayar (`acks`).", "The rule has two halves: a setting on the topic (`kafka-configs.sh`) and one on the producer (`acks`)."),
      l("`kafka-configs.sh --alter --entity-type topics --entity-name orders --add-config min.insync.replicas=2`, sonra `acks=all` ile bir kayıt gönder (konsol producer'ın varsayılanı zaten all).", "`kafka-configs.sh --alter --entity-type topics --entity-name orders --add-config min.insync.replicas=2`, then send a record with `acks=all` (the console producer's default is already all)."),
      l(`\`${CONFIG("min.insync.replicas=2")}\`, sonra \`echo "payment:7001" | ${PRODUCE} --producer-property acks=all\``, `\`${CONFIG("min.insync.replicas=2")}\`, then \`echo "payment:7001" | ${PRODUCE} --producer-property acks=all\``),
    ],
    par: 2,
    check: (ctx) => ctx.state.config.minIsr === 2 && fresh(ctx).some((x) => x.acks === "all" && x.status === "acked"),
  },
  {
    id: "acked-loss",
    title: l("Onaylı ama kayıp", "Acked, then lost"),
    story: l(
      "Bir arkadaşın hız için `acks=1`'in yeterli olduğunu söylüyor: \"Nasılsa leader yazınca onay geliyor.\" Ona aksini test ortamında göster.",
      "A colleague says `acks=1` is enough for speed: \"the ack comes once the leader has it anyway.\" Show them otherwise in the test cluster.",
    ),
    goal: l("`acks=1` ile **onay almış** bir sipariş kaybolsun.", "An order that got an **ack** with `acks=1` is lost."),
    start: FREE,
    hints: [
      l(
        "`acks=1` sadece leader'ı bekler. Leader çöktüğünde yerine geçen follower o kaydı henüz almamışsa? `kafka-topics.sh --describe` ile leader'ın kim olduğuna bak.",
        "`acks=1` waits only for the leader. What if the follower that takes over has not copied the record yet? Check who leads with `kafka-topics.sh --describe`.",
      ),
      l("Leader `kafka-2`. Follower'ları dondur (`docker pause`), `acks=1` ile yaz, sonra leader'ı durdur.", "The leader is `kafka-2`. Freeze the followers (`docker pause`), write with `acks=1`, then stop the leader."),
      l(`\`docker pause kafka-1 kafka-3\`, \`echo "order:7002" | ${PRODUCE} --producer-property acks=1\`, \`docker stop kafka-2\``, `\`docker pause kafka-1 kafka-3\`, \`echo "order:7002" | ${PRODUCE} --producer-property acks=1\`, \`docker stop kafka-2\``),
    ],
    par: 3,
    check: (ctx) => fresh(ctx).some((x) => x.acks === 1 && x.status === "lost"),
  },
  {
    id: "door-closed",
    title: l("Kapı kapalı", "Door closed"),
    story: l(
      "Gece iki broker birden gitti. Sipariş servisinin loglarında `NotEnoughReplicasException` görmeyi bekliyorsun: `min.insync.replicas=2` tam olarak bunun için. Bunu kendin yeniden üret.",
      "Two brokers went down at once in the night. You expect `NotEnoughReplicasException` in the order service's logs: that is exactly what `min.insync.replicas=2` is for. Reproduce it yourself.",
    ),
    goal: l("Bir `acks=all` yazma `NotEnoughReplicas` ile **reddedilsin**.", "An `acks=all` write is **rejected** with `NotEnoughReplicas`."),
    start: FREE,
    hints: [
      l("ISR, min.insync.replicas'tan (2) küçükse acks=all yazmalar kabul edilmez.", "If the ISR is smaller than min.insync.replicas (2), acks=all writes are refused."),
      l("İki broker'ı durdur, sonra bir sipariş gönder.", "Stop two brokers, then send an order."),
      l(`\`docker stop kafka-1 kafka-3\`, sonra \`echo "order:7003" | ${PRODUCE}\``, `\`docker stop kafka-1 kafka-3\`, then \`echo "order:7003" | ${PRODUCE}\``),
    ],
    par: 2,
    check: (ctx) => flat(ctx).some((e) => e.type === "rejected" && e.reason === "notEnoughReplicas"),
  },
  {
    id: "keep-taking",
    title: l("Kapanmadan devam", "Keep taking orders"),
    story: l(
      "Gece bakımında `kafka-1` ve `kafka-3` kapanacak. İş birimi, bakım boyunca siparişlerin (yine `acks=all` ile) kabul edilmesini istiyor ve tek kopyayla yaşamanın riskini kabul ediyor.",
      "Tonight's maintenance takes `kafka-1` and `kafka-3` down. The business wants orders (still with `acks=all`) accepted throughout, and accepts the risk of living on one copy.",
    ),
    goal: l("İki broker kapalıyken `acks=all` ile gönderilen bir sipariş **onay** alsın.", "With two brokers down, an order sent with `acks=all` gets an **ack**."),
    start: FREE,
    hints: [
      l("Şu an min.insync.replicas=2: tek kopya kalınca acks=all yazmalar reddedilir. Bu bilerek gevşetilmesi gereken bir ayar.", "Right now min.insync.replicas=2: with one copy left, acks=all writes are refused. This is a setting to loosen on purpose."),
      l("`kafka-configs.sh` ile `min.insync.replicas=1` yap, iki broker'ı durdur, sonra yaz.", "Set `min.insync.replicas=1` with `kafka-configs.sh`, stop two brokers, then write."),
      l(`\`${CONFIG("min.insync.replicas=1")}\`, \`docker stop kafka-1 kafka-3\`, \`echo "order:7004" | ${PRODUCE}\``, `\`${CONFIG("min.insync.replicas=1")}\`, \`docker stop kafka-1 kafka-3\`, \`echo "order:7004" | ${PRODUCE}\``),
    ],
    par: 3,
    check: (ctx) => {
      const events = flat(ctx);
      const down = lastIndex(events, (e) => e.type === "brokerDown");
      const acked = lastIndex(events, (e) => e.type === "acked" && e.acks === "all");
      return ctx.state.brokers.filter((b) => !b.alive).length >= 2 && ctx.state.partitions[0]!.leader !== null && down >= 0 && acked > down;
    },
  },
  {
    id: "after-append",
    title: l("Yazıldı ama onaylanmadı", "Written, not acked"),
    story: l(
      "Ödeme servisinin loglarında garip bir hata var: `NotEnoughReplicasAfterAppendException`. Kayıt log'a yazılmış ama producer hata almış. Bu ne zaman olur? Test ortamında yeniden üret.",
      "The payment service's logs show an odd error: `NotEnoughReplicasAfterAppendException`. The record was written to the log, yet the producer got an error. When does that happen? Reproduce it in the test cluster.",
    ),
    goal: l("Producer `NotEnoughReplicasAfterAppend` hatası alsın.", "The producer gets a `NotEnoughReplicasAfterAppend` error."),
    start: FREE,
    hints: [
      l(
        "Yazma kabul edildiği anda ISR yeterliydi. Onay beklerken ISR küçülürse ne olur?",
        "The ISR was big enough when the write was accepted. What if it shrinks while the write waits for its ack?",
      ),
      l("Follower'ları dondur (yazma kabul edilir ama bekler), sonra 30 sn geçsin ki ISR'den düşsünler.", "Freeze the followers (the write is accepted but waits), then let 30 s pass so they drop out of the ISR."),
      l(`\`docker pause kafka-1 kafka-3\`, \`echo "order:7005" | ${PRODUCE}\`, \`sleep 30\``, `\`docker pause kafka-1 kafka-3\`, \`echo "order:7005" | ${PRODUCE}\`, \`sleep 30\``),
    ],
    par: 3,
    check: (ctx) => fresh(ctx).some((x) => x.status === "failed" && x.reason === "notEnoughReplicasAfterAppend"),
  },
];
