import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import type { AppCtx } from "../shared/appShell";
import { overcount, sandboxStart, simulate, trueCounts, type Action, type City, type StreamsEvent, type StreamsState } from "./model";
import { boxOf, type KBox } from "./shell";

export type KCtx = AppCtx<StreamsState, Action, StreamsEvent>;
export type KScenario = Scenario<KCtx, KBox>;

const after = (actions: Action[]) => simulate(actions, sandboxStart).states.at(-1)!;
const order = (city: City): Action => ({ type: "order", city });
const process: Action = { type: "processAll" };
const commit: Action = { type: "commit" };
const crash: Action = { type: "crash" };
const restart: Action = { type: "restart" };

const allDone = (s: StreamsState) => s.alive && s.position === s.input.length && s.committed === s.input.length;
const rightCounts = (s: StreamsState) => {
  const want = trueCounts(s);
  return (["İstanbul", "Ankara", "İzmir"] as City[]).every((c) => (s.store[c] ?? 0) === (want[c] ?? 0));
};

export const FREE: KBox = boxOf(sandboxStart);

export const scenarios: KScenario[] = [
  {
    id: "exactly-once",
    title: l("Tam bir kez", "Exactly once"),
    story: l(
      "Uygulama `at_least_once` ile çalışıyor ve her yeniden başlamadan sonra şehir sayıları şişiyor. Bu gece yine bir deploy var: uygulama bekleyen siparişleri saydıktan sonra, commit etmeden ölecek.",
      "The app runs with `at_least_once`, and after every restart the city counts come out too high. There's another deploy tonight: the app will die after counting the waiting orders and before it commits.",
    ),
    goal: l("Deploy uygulamayı öldürsün; sonunda bütün siparişler sayılmış, **hiçbiri fazla sayılmamış** ve uygulama çalışıyor olsun.", "Let the deploy kill the app; in the end every order is counted, **none counted twice**, and the app is running."),
    start: boxOf(after([order("İstanbul"), order("Ankara")]), true),
    hints: [
      l("at_least_once'ta store'daki sayım changelog'a yazılır ama girdi offset'i henüz commit edilmemiştir. Yeniden başlayınca sayım kalır, sipariş tekrar gelir.", "Under at_least_once the count lands in the changelog while the input offset isn't committed yet. After a restart the count stays and the order comes again."),
      l("`processing.guarantee=exactly_once_v2`: changelog, çıktı ve offset commit'i tek bir transaction olur; çöküşte hepsi birlikte geri alınır.", "`processing.guarantee=exactly_once_v2`: the changelog, the output and the offset commit become one transaction; a crash rolls them all back together."),
      l("`nano streams.properties` (`exactly_once_v2`), `./run-app.sh`, `./run-app.sh`", "`nano streams.properties` (`exactly_once_v2`), `./run-app.sh`, `./run-app.sh`"),
    ],
    par: 3,
    check: (c) => allDone(c.state) && overcount(c.state) === 0 && c.events.flat().some((e) => e.type === "crashed" && e.uncommitted > 0),
  },
  {
    id: "recount",
    title: l("Baştan say", "Count again"),
    story: l(
      "Eski bir çöküş yüzünden sayılar zaten yanlış: bazı siparişler iki kez sayılmış. Uygulama şu an kapalı. Doğru sayıları geri istiyorsun.",
      "An old crash already left the counts wrong: some orders were counted twice. The app is down right now. You want the right counts back.",
    ),
    goal: l("Uygulama bütün siparişleri **baştan** saysın: sayılar doğru olsun ve uygulama çalışsın.", "The app counts every order **from the start**: the counts are right and the app is running."),
    start: boxOf(after([order("İstanbul"), order("Ankara"), process, crash, restart, process, commit, crash])),
    hints: [
      l("Yeniden başlatmak yetmez: store changelog'dan, yani yanlış sayılarla geri yüklenir.", "Restarting isn't enough: the store comes back from the changelog, with the wrong counts."),
      l("Kafka Streams'in sıfırlama aracı uygulamayı girdinin başına sarar ve iç topic'leri (changelog) siler. Uygulama dururken çalıştırılır.", "Kafka Streams' reset tool rewinds the app to the start of its input and deletes its internal topics (the changelog). Run it while the app is stopped."),
      l(
        "`kafka-streams-application-reset.sh --bootstrap-server localhost:9092 --application-id order-counter --input-topics orders`, sonra `./run-app.sh`",
        "`kafka-streams-application-reset.sh --bootstrap-server localhost:9092 --application-id order-counter --input-topics orders`, then `./run-app.sh`",
      ),
    ],
    par: 2,
    check: (c) => allDone(c.state) && rightCounts(c.state) && c.state.input.length > 0,
  },
  {
    id: "izmir-branch",
    title: l("İzmir şubesi", "The İzmir branch"),
    story: l(
      "İzmir şubesi bugün açıldı. Panoda İzmir'in görünmesi için iki test siparişi girip uygulamanın onları saydığını görmek istiyorsun.",
      "The İzmir branch opened today. To see İzmir on the dashboard, you want to enter two test orders and watch the app count them.",
    ),
    goal: l("İzmir için **iki** sipariş gir; uygulama saysın ve commit etsin: İzmir = 2.", "Enter **two** orders for İzmir; the app counts them and commits: İzmir = 2."),
    start: FREE,
    hints: [
      l("Siparişler `orders` topic'ine yazılır; uygulama çalışınca onları sayar.", "Orders are written to the `orders` topic; the app counts them when it runs."),
      l("`./place-order.sh İzmir` bir sipariş ekler. İki kez gerekiyor, sonra uygulamayı çalıştır.", "`./place-order.sh İzmir` adds one order. You need it twice, then run the app."),
      l("`./place-order.sh İzmir`, `./place-order.sh İzmir`, `./run-app.sh`", "`./place-order.sh İzmir`, `./place-order.sh İzmir`, `./run-app.sh`"),
    ],
    par: 3,
    check: (c) => allDone(c.state) && c.state.store.İzmir === 2 && rightCounts(c.state),
  },
  {
    id: "lost-disk",
    title: l("Disk gitti", "The disk is gone"),
    story: l(
      "Uygulamanın sunucusu yerel diskiyle birlikte gitti ve uygulama kapalı. Bu arada iki sipariş geldi. Store'un yerel kopyası yok; ne yapacaksın?",
      "The app's server is gone, local disk and all, and the app is down. Two orders came in meanwhile. There's no local copy of the store; what do you do?",
    ),
    goal: l("Uygulama geri gelsin, bekleyen siparişleri saysın; sayılar **doğru** olsun.", "The app comes back and counts the waiting orders; the counts are **right**."),
    start: boxOf(after([crash, order("Ankara"), order("İstanbul")])),
    hints: [
      l("Store kaybolmadı: her değişikliği bir changelog topic'inde duruyor.", "The store isn't lost: every change to it sits in a changelog topic."),
      l("Uygulamayı başlatman yeter: store'u changelog'dan yeniden kurar, sonra commit ettiği yerden devam eder.", "Just start the app: it rebuilds the store from the changelog, then carries on from where it committed."),
      l("`./run-app.sh`", "`./run-app.sh`"),
    ],
    par: 1,
    check: (c) => allDone(c.state) && rightCounts(c.state),
  },
];
