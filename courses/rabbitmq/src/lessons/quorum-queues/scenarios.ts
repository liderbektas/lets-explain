import { l } from "@lets-explain/core/i18n";
import { createBroker, queueAvailable } from "../../engine/broker";
import type { RabbitCtx, RabbitScenario } from "../shared/BrokerScene";
import { eventsOf, projectAfter, script } from "../shared/missionHelpers";

/* ------------------------------------------------------------ the projects */

/** A three-node cluster (containers rabbit1, rabbit2, rabbit3). */
const cluster = () => createBroker({ nodes: 3 });

const QUORUM = (name: string) => `ch.queue_declare(queue="${name}", durable=True, arguments={"x-queue-type": "quorum"})`;

/** A sender with confirms on, so a refused message raises instead of passing quietly. */
const send = (queue: string, body: string) => script(`ch.confirm_delivery()\nch.basic_publish(exchange="", routing_key="${queue}", body=b"${body}")\nprint("sent")`);

/** Free play: a quorum `orders` and a classic `cache` on rabbit1. */
export const FREE = projectAfter(
  { "setup.py": script(`${QUORUM("orders")}\nch.queue_declare(queue="cache", durable=True)`), "order.py": send("orders", "order-1"), "cache.py": send("cache", "cache-1") },
  ["python setup.py"],
  cluster(),
);

/* ----------------------------------------------------------------- checks */

/** Indexes of commands' actions whose message reached `queue` and was confirmed ok. */
function acceptedAt(ctx: RabbitCtx, queue: string): number[] {
  const out: number[] = [];
  ctx.events.forEach((evs, i) => {
    const routed = evs.find((e) => e.type === "routed" && e.queues.includes(queue));
    const ok = evs.find((e) => e.type === "confirmed");
    if (routed && ok && ok.type === "confirmed" && ok.ok) out.push(i);
  });
  return out;
}

const nodeUp = (ctx: RabbitCtx, i: number, node: string) => ctx.states[i]!.nodes.find((n) => n.name === node)?.alive ?? false;

/* --------------------------------------------------------------- scenarios */

export const scenarios: RabbitScenario[] = [
  {
    id: "patch-the-leader",
    title: l("Lider bakımda", "Patching the leader"),
    story: l(
      "`rabbit1`'e bir güvenlik yaması geçmen gerekiyor ve bunun için container'ı durdurman lazım. `orders` üç kopyalı bir quorum kuyruğu ve leader'ı şu an `rabbit1`'de. Mağaza sipariş göndermeye devam ediyor.",
      "You need to apply a security patch to `rabbit1`, which means stopping its container. `orders` is a three-copy quorum queue whose leader is on `rabbit1` right now. The shop keeps sending orders.",
    ),
    goal: l("`rabbit1` kapalıyken `order.py`'nin gönderdiği sipariş `orders`'a girsin ve ack alsın.", "While `rabbit1` is down, the order sent by `order.py` gets into `orders` with an ack."),
    start: projectAfter({ "setup.py": script(QUORUM("orders")), "order.py": send("orders", "order-1001") }, ["python setup.py"], cluster()),
    hints: [
      l("Quorum kuyruğu, kopyalarının çoğunluğu (3'te 2) ayaktayken çalışır; leader düşerse kalanlardan biri leader olur.", "A quorum queue works while a majority of its copies (2 of 3) is up; if the leader goes, one of the others takes over."),
      l("Node'u durdur, sonra gönder. Sonra `rabbitmq-queues quorum_status orders` ile yeni leader'a bakabilirsin.", "Stop the node, then send. Afterwards you can see the new leader with `rabbitmq-queues quorum_status orders`."),
      l("`docker stop rabbit1`, `python order.py`", "`docker stop rabbit1`, `python order.py`"),
    ],
    par: 2,
    check: (ctx) => acceptedAt(ctx, "orders").some((i) => !nodeUp(ctx, i + 1, "rabbit@1")) && eventsOf(ctx, "leaderMoved").some((e) => e.queue === "orders"),
  },
  {
    id: "check-first",
    title: l("Önce kontrol et", "Check first"),
    story: l(
      "`rabbit3` disk değişimi için zaten kapalı. Yöneticin şimdi bir de `rabbit2`'yi yeniden başlatmanı istiyor. `orders` bir an bile çalışmaz hale gelmemeli; mesajlar gelmeye devam ediyor.",
      "`rabbit3` is already down for a disk swap. Your manager now asks you to restart `rabbit2` too. `orders` must not become unavailable even for a moment; messages keep coming in.",
    ),
    goal: l(
      "`rabbit2` yeniden başlatılsın, `orders` hiçbir anda çoğunluğunu kaybetmesin ve sonunda üç node da çalışsın.",
      "`rabbit2` gets restarted, `orders` never loses its majority at any point, and all three nodes end up running.",
    ),
    start: projectAfter({ "setup.py": script(QUORUM("orders")), "order.py": send("orders", "order-2") }, ["python setup.py", "docker stop rabbit3"], cluster()),
    hints: [
      l(
        "Durdurmadan önce sor: `docker exec rabbit2 rabbitmq-queues check_if_node_is_quorum_critical`. Bu node gidince çoğunluğunu kaybedecek kuyruk varsa söyler.",
        "Ask before you stop: `docker exec rabbit2 rabbitmq-queues check_if_node_is_quorum_critical`. It tells you if any queue would lose its majority without this node.",
      ),
      l("İki node kapalıyken üç kopyalı kuyruk durur. Önce `rabbit3`'ü geri getir.", "With two nodes down, a three-copy queue stops. Bring `rabbit3` back first."),
      l("`docker start rabbit3`, `docker restart rabbit2`", "`docker start rabbit3`, `docker restart rabbit2`"),
    ],
    par: 2,
    check: (ctx) =>
      ctx.states.every((s) => queueAvailable(s, s.queues.orders!)) &&
      eventsOf(ctx, "nodeChanged").some((e) => e.node === "rabbit@2" && !e.alive) &&
      ctx.state.nodes.every((n) => n.alive),
  },
  {
    id: "classic-by-mistake",
    title: l("Yanlışlıkla classic", "Classic by mistake"),
    story: l(
      "Bu gece `rabbit1` bakıma girecek. `payments` kuyruğu ise yanlışlıkla classic tanımlanmış: tek kopyası `rabbit1`'de duruyor, yani node kapanınca ödemeler kaybolacak. Kuyruk şu an boş.",
      "Tonight `rabbit1` goes down for maintenance. The `payments` queue, though, was declared classic by mistake: its only copy lives on `rabbit1`, so payments will be lost when the node goes down. The queue is empty right now.",
    ),
    goal: l(
      "`payments` quorum olsun; `rabbit1` kapalıyken `pay.py`'nin gönderdiği ödeme ack alıp `payments`'a girsin.",
      "`payments` becomes quorum; with `rabbit1` down, the payment sent by `pay.py` gets an ack and lands in `payments`.",
    ),
    start: projectAfter({ "setup.py": script(`ch.queue_declare(queue="payments", durable=True)`), "pay.py": send("payments", "payment-7") }, ["python setup.py"], cluster()),
    hints: [
      l(
        "`rabbitmqctl list_queues name type leader members` ile bak. Bir kuyruğun türü sonradan değişmez; boş olduğu için silip yeniden kurabilirsin.",
        "Look with `rabbitmqctl list_queues name type leader members`. A queue's type can't change later; since it's empty you can delete it and set it up again.",
      ),
      l(
        "`setup.py`'de `arguments={\"x-queue-type\": \"quorum\"}` ekle, kuyruğu `rabbitmqctl delete_queue payments` ile sil, kurulumu çalıştır; sonra bakımı yap ve ödemeyi gönder.",
        "Add `arguments={\"x-queue-type\": \"quorum\"}` in `setup.py`, delete the queue with `rabbitmqctl delete_queue payments`, run the setup; then do the maintenance and send the payment.",
      ),
      l(
        "`nano setup.py`, `rabbitmqctl delete_queue payments`, `python setup.py`, `docker stop rabbit1`, `python pay.py`",
        "`nano setup.py`, `rabbitmqctl delete_queue payments`, `python setup.py`, `docker stop rabbit1`, `python pay.py`",
      ),
    ],
    par: 5,
    check: (ctx) => ctx.state.queues.payments?.type === "quorum" && acceptedAt(ctx, "payments").some((i) => !nodeUp(ctx, i + 1, "rabbit@1")),
  },
  {
    id: "move-the-leader",
    title: l("Leader'ı taşı", "Move the leader"),
    story: l(
      "İzleme ekranı `rabbit1`'in işlemcisinin %100'de olduğunu gösteriyor: `orders` kuyruğunun leader'ı orada ve bütün yazma işleri ona gidiyor. Leader'ı başka bir node'a taşı; iş bitince üç node da çalışıyor olsun.",
      "Monitoring shows `rabbit1`'s CPU at 100%: the leader of `orders` lives there and every write goes through it. Move the leader to another node; when you're done, all three nodes must be running.",
    ),
    goal: l("`orders`'ın leader'ı `rabbit1`'den başka bir node'a geçsin; sonunda üç node da çalışsın.", "The leader of `orders` moves off `rabbit1`; all three nodes are running at the end."),
    start: projectAfter({ "setup.py": script(QUORUM("orders")) }, ["python setup.py"], cluster()),
    hints: [
      l("Leader düşünce takipçilerden biri leader olur ve node geri gelince de öyle kalır.", "When the leader goes down a follower takes over, and it stays leader when the node comes back."),
      l("Node'u bir kez yeniden başlatmak yeter.", "Restarting the node once is enough."),
      l("`docker restart rabbit1`", "`docker restart rabbit1`"),
    ],
    par: 1,
    check: (ctx) => ctx.state.queues.orders!.node !== "rabbit@1" && ctx.state.nodes.every((n) => n.alive) && queueAvailable(ctx.state, ctx.state.queues.orders!),
  },
];
