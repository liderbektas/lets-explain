import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import { kBox, type KBox, type KCtx } from "./cli";
import { applyKraft, sandboxStart, stranded, type KAction, type KState } from "./model";

export type KraftScenario = Scenario<KCtx, KBox>;

const after = (actions: KAction[], start: KState) => actions.reduce((s, a) => applyKraft(s, a).state, start);
const B = "--bootstrap-server localhost:9092";

/** Everything up, controller 1 active. */
export const FREE = kBox(sandboxStart);

/** Two controllers down (no quorum), and kafka-2 died while nobody was in charge. */
const FROZEN = after(
  [
    { type: "crashController", id: 1 },
    { type: "crashController", id: 2 },
    { type: "crashBroker", id: 2 },
  ],
  sandboxStart,
);

/** kafka-3 was stopped for a disk swap: the controller fenced it and moved its leadership. */
const FENCED = after([{ type: "crashBroker", id: 3 }], sandboxStart);

const indexOf = (ctx: KCtx, test: (e: KCtx["events"][number][number]) => boolean, from = 0) => {
  for (let i = from; i < ctx.events.length; i++) if (ctx.events[i]!.some(test)) return i;
  return -1;
};

export const scenarios: KraftScenario[] = [
  {
    id: "new-active",
    title: l("Taht değişimi", "Changing of the guard"),
    story: l(
      "Aktif controller'ın sunucusu bu gece yamalanacak. Kapattığında cluster'ın kendi başına yeni bir aktif controller seçtiğini ve metadata değişikliklerinin (örneğin yeni bir topic) yazılmaya devam ettiğini görmek istiyorsun.",
      "The active controller's server gets patched tonight. When you stop it, you want to see the cluster pick a new active controller on its own and keep writing metadata changes (a new topic, say).",
    ),
    goal: l("Aktif controller kapansın, **yenisi seçilsin**, sonra `invoices` topic'i oluşturulsun.", "Stop the active controller, get a **new one elected**, then create the `invoices` topic."),
    start: FREE,
    hints: [
      l("Hangi controller aktif? `kafka-metadata-quorum.sh ... describe --status` çıktısındaki `LeaderId` söyler.", "Which controller is active? `LeaderId` in `kafka-metadata-quorum.sh ... describe --status` tells you."),
      l("Onun container'ını `docker stop` ile kapat, sonra `kafka-topics.sh --create` ile topic'i oluştur.", "Stop its container with `docker stop`, then create the topic with `kafka-topics.sh --create`."),
      l(`\`docker stop controller-1\`, sonra \`kafka-topics.sh ${B} --create --topic invoices\``, `\`docker stop controller-1\`, then \`kafka-topics.sh ${B} --create --topic invoices\``),
    ],
    par: 2,
    check: (ctx) => {
      const at = indexOf(ctx, (e) => e.type === "elected");
      return at >= 0 && indexOf(ctx, (e) => e.type === "topicCreated", at) >= 0;
    },
  },
  {
    id: "frozen",
    title: l("Donmuş metadata", "Frozen metadata"),
    story: l(
      "Bir arkadaşın soruyor: \"Üç controller'dan ikisi giderse ne olur? Biri hâlâ ayakta, idare eder, değil mi?\" Test cluster'ında cevabı göster.",
      "A colleague asks: \"What if two of the three controllers go? One is still up, that's fine, right?\" Show the answer in the test cluster.",
    ),
    goal: l("Bir topic oluşturma isteği **reddedilsin**, çünkü kimse metadata'ya yazamıyor.", "A create-topic request is **refused** because nobody can write metadata."),
    start: FREE,
    hints: [
      l("Raft'ta bir değişiklik ancak controller'ların **çoğunluğu** ayaktaysa yazılabilir: üçte iki.", "In Raft a change can be written only while a **majority** of controllers is up: two out of three."),
      l("İki controller'ı durdur, sonra bir topic oluşturmayı dene.", "Stop two controllers, then try to create a topic."),
      l(`\`docker stop controller-1 controller-2\`, sonra \`kafka-topics.sh ${B} --create --topic invoices\``, `\`docker stop controller-1 controller-2\`, then \`kafka-topics.sh ${B} --create --topic invoices\``),
    ],
    par: 2,
    check: (ctx) => ctx.events.flat().some((e) => e.type === "rejected"),
  },
  {
    id: "stranded",
    title: l("Sahipsiz partition", "Stranded partition"),
    story: l(
      "Bir felaket tatbikatı: controller çoğunluğu yokken bir broker da çökerse ne olur? Tahminin: partition'lar kendi başına yeni leader bulur. Dene ve gör.",
      "A disaster drill: what if a broker also dies while the controller majority is gone? Your guess: the partitions find new leaders on their own. Try it and see.",
    ),
    goal: l("Bir partition'ın leader'ı çökmüş bir broker'da **takılı kalsın**: kimse yeni leader seçemesin.", "Leave a partition **stuck** with a crashed broker as its leader, with nobody able to pick a new one."),
    start: FREE,
    hints: [
      l("Broker'ın çöktüğünü fark edip kararı metadata'ya yazacak aktif bir controller olmamalı.", "There must be no active controller to notice the broker died and write the decision."),
      l("Önce çoğunluğu kaldır (iki controller), sonra bir broker'ı durdur. `kafka-topics.sh --describe` ölü leader'ı hâlâ gösterir.", "First remove the majority (two controllers), then stop a broker. `kafka-topics.sh --describe` still lists the dead leader."),
      l("`docker stop controller-1 controller-2`, sonra `docker stop kafka-2`", "`docker stop controller-1 controller-2`, then `docker stop kafka-2`"),
    ],
    par: 2,
    check: (ctx) => ctx.state.active === null && stranded(ctx.state).length > 0,
  },
  {
    id: "rescue",
    title: l("Kurtarma", "The rescue"),
    story: l(
      "Gece iki controller gitti ve ardından `kafka-2` çöktü. P1'in leader'ı hâlâ `kafka-2` görünüyor, kimse yenisini seçmiyor ve P1'e hiçbir şey yazılamıyor. `kafka-2`'nin sunucusu sabaha kadar gelmeyecek.",
      "Two controllers went in the night, then `kafka-2` crashed. P1's leader still shows as `kafka-2`, nobody picks a new one and nothing can be written to P1. `kafka-2`'s server won't be back before morning.",
    ),
    goal: l("Bir aktif controller olsun ve **bütün partition'ların** ayakta bir leader'ı olsun.", "An active controller is back and **every partition** has a live leader."),
    start: kBox(FROZEN),
    hints: [
      l("Çoğunluğu geri getirmek yeter: yeni aktif controller, yokken olanları fark edip kararları yazar.", "Bringing the majority back is enough: the new active controller notices what happened while nobody was in charge and writes the decisions."),
      l("`docker ps -a` hangi container'ların durduğunu gösterir. Bir controller'ı başlat.", "`docker ps -a` shows which containers have stopped. Start one controller."),
      l("`docker start controller-1`", "`docker start controller-1`"),
    ],
    par: 1,
    check: (ctx) => ctx.state.active !== null && stranded(ctx.state).length === 0,
  },
  {
    id: "welcome-back",
    title: l("Hoş geldin kafka-3", "Welcome back, kafka-3"),
    story: l(
      "`kafka-3`'ün diski değiştirildi. Controller onu kapanınca fence etmişti (ona leadership verilmiyor). Broker'ı geri getir ve controller'ın onu yeniden kabul ettiğini gör.",
      "`kafka-3` has a new disk. When it stopped, the controller fenced it (it gets no leadership). Bring the broker back and see the controller let it in again.",
    ),
    goal: l("`kafka-3` çalışsın ve artık fenced olmasın.", "`kafka-3` is running and no longer fenced."),
    start: kBox(FENCED),
    hints: [
      l("Bir broker başladığında controller'a kaydolur; aktif controller onu unfence eder.", "A broker that starts registers with the controller; the active controller unfences it."),
      l("Container'ı `docker start` ile başlat; `kafka-topics.sh --describe` onu yeniden Isr sütununda gösterir.", "Start the container with `docker start`; `kafka-topics.sh --describe` lists it in the Isr column again."),
      l("`docker start kafka-3`", "`docker start kafka-3`"),
    ],
    par: 1,
    check: (ctx) => {
      const b = ctx.state.brokers.find((x) => x.id === 3)!;
      return b.alive && !b.fenced;
    },
  },
];
