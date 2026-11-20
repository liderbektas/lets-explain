import type { Scenario } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { createState, HOT_PARTITION, KEEP, totalLag, type LEvent, type LState } from "./model";
import { APP_CONFIG, lagBox, PRODUCER_CONFIG, type LagAction, type LagBox } from "./shell";

/**
 * Scenarios for consumer lag: the `clicks` topic with 3 partitions, written at one record a
 * second per partition, read by the `analytics` group. Time passes only with `sleep`.
 */

export interface LagCtx {
  startBox: LagBox;
  box: LagBox;
  start: LState;
  state: LState;
  actions: LagAction[];
  events: LEvent[][];
}

export type LagScenario = Scenario<LagCtx, LagBox>;

export function lagCtx(startBox: LagBox, run: { boxes: LagBox[]; events: LEvent[][]; actions: LagAction[] }): LagCtx {
  const box = run.boxes[run.boxes.length - 1]!;
  return { startBox, box, start: startBox.lag, state: box.lag, actions: run.actions, events: run.events };
}

/** Free play: one instance, a small backlog, normal traffic. */
export const FREE = lagBox(createState({ partitions: 3, members: 1, backlog: [2, 2, 2] }));

const RUN = "./run-analytics.sh &";
const DESCRIBE = "kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group analytics";
const timePassed = (ctx: LagCtx) => ctx.state.seconds > ctx.start.seconds;

/** The hot-key traffic: every click keyed by city, and Istanbul is busy. */
const HOT = (() => {
  const backlog = [1, 1, 1];
  backlog[HOT_PARTITION] = KEEP;
  return { ...createState({ partitions: 3, members: 3, backlog }), hot: true };
})();

export const scenarios: LagScenario[] = [
  {
    id: "catch-up",
    title: l("Yetiş", "Catch up"),
    story: l(
      "Tek bir analitik instance'ı üç partition'ı okuyor. Saniyede 3 tık geliyor ama instance saniyede 2 kayıt işleyebiliyor: lag her saniye büyüyor. Elinde iki boş sunucu daha var.",
      "One analytics instance reads all three partitions. Three clicks arrive a second, but the instance handles two a second: the lag grows every second. You have two spare servers.",
    ),
    goal: l("Group'un toplam lag'i **0** olsun (zaman geçerken).", "The group's total lag reaches **0** (while time passes)."),
    start: FREE,
    hints: [
      l(
        `Önce \`${DESCRIBE}\` ile LAG'e bak. Bir partition'ı group'ta aynı anda tek instance okur; her partition'a bir instance düşerse?`,
        `Look at the LAG first with \`${DESCRIBE}\`. One instance in a group reads a partition at a time; what if each partition had its own?`,
      ),
      l("İki instance daha başlat (`./run-analytics.sh &`), sonra `sleep` ile birkaç saniye geçsin.", "Start two more instances (`./run-analytics.sh &`), then let a few seconds pass with `sleep`."),
      l("`./run-analytics.sh &` iki kez, sonra `sleep 3`", "`./run-analytics.sh &` twice, then `sleep 3`"),
    ],
    par: 3,
    check: (ctx) => timePassed(ctx) && totalLag(ctx.state) === 0,
  },
  {
    id: "one-server",
    title: l("Yeni sunucu yok", "No new servers"),
    story: l(
      "Yine tek instance geride kalıyor, ama bu sefer yeni sunucu yok. Analitik uygulaması `analytics.properties`'teki `processing.threads` ile kaç thread'le çalışacağını okur; her thread saniyede 2 kayıt işler. Ayar instance **başlarken** okunur.",
      "Again one instance falls behind, but this time there are no new servers. The analytics app reads how many threads to run from `processing.threads` in `analytics.properties`; each thread handles 2 records a second. The setting is read when an instance **starts**.",
    ),
    goal: l("Hâlâ **tek** instance çalışırken toplam lag 0 olsun.", "Total lag reaches 0 with still **one** instance running."),
    start: FREE,
    hints: [
      l(`\`cat ${APP_CONFIG}\` ile ayara bak.`, `Look at the setting with \`cat ${APP_CONFIG}\`.`),
      l(
        "`processing.threads=2` yap; ama çalışan instance eski ayarla devam eder. Onu durdurup yenisini başlat, sonra zaman geçsin.",
        "Set `processing.threads=2`; but the running instance keeps the old setting. Stop it and start a new one, then let time pass.",
      ),
      l(
        `\`nano ${APP_CONFIG}\` (processing.threads=2), \`kill %1\`, \`./run-analytics.sh &\`, \`sleep 10\``,
        `\`nano ${APP_CONFIG}\` (processing.threads=2), \`kill %1\`, \`./run-analytics.sh &\`, \`sleep 10\``,
      ),
    ],
    par: 3,
    check: (ctx) => timePassed(ctx) && totalLag(ctx.state) === 0 && ctx.state.members.length === 1,
  },
  {
    id: "no-loss",
    title: l("Silinmeden önce", "Before it's deleted"),
    story: l(
      "Analitik servisi gece çöktü ve hiç instance çalışmıyor. Her partition'da 6 tık bekliyor ve retention her partition'da sadece **en yeni 8** kaydı tutuyor. Tıklar gelmeye devam ediyor. Elinde üç sunucu var.",
      "The analytics service crashed overnight and no instance is running. Six clicks wait in each partition, and retention keeps only the **newest 8** records per partition. Clicks keep coming. You have three servers.",
    ),
    goal: l("Hiçbir tık okunmadan silinmesin ve lag 0 olsun.", "No click is deleted before it's read, and lag reaches 0."),
    start: lagBox(createState({ partitions: 3, members: 0, backlog: [6, 6, 6] })),
    hints: [
      l(
        "Retention okuyucuyu beklemez: bir partition'ın lag'i 8'i geçerse en eski kayıtlar okunmadan gider. Zaman geçmeden önce yeterince instance başlat.",
        "Retention waits for no reader: if a partition's lag goes past 8, its oldest records go unread. Start enough instances before time passes.",
      ),
      l("Tek instance saniyede 2 işler, 3 gelir. Her partition'a bir instance gerekir.", "One instance handles 2 a second while 3 arrive. Each partition needs its own instance."),
      l("`./run-analytics.sh &` üç kez, sonra `sleep 10`", "`./run-analytics.sh &` three times, then `sleep 10`"),
    ],
    par: 4,
    check: (ctx) => timePassed(ctx) && ctx.state.missed === ctx.start.missed && totalLag(ctx.state) === 0,
  },
  {
    id: "hot-key",
    title: l("Sıcak key", "Hot key"),
    story: l(
      "Tıklama servisi kayıtları **şehre** göre key'liyor ve bugün bütün trafik İstanbul'dan: hepsi tek partition'a gidiyor. O partition'ı tek instance okuyabildiği için instance eklemek işe yaramıyor. Ekip, key'in **kullanıcı** olması konusunda anlaştı: bir kullanıcının tıkları yine sıralı kalır.",
      "The clicks service keys records by **city**, and today all traffic is from Istanbul: it all goes to one partition. Only one instance can read that partition, so adding instances doesn't help. The team agreed the key should be the **user**: one user's clicks still stay in order.",
    ),
    goal: l(
      "Trafik yeniden üç partition'a yayılsın ve toplam lag 0 olsun.",
      "Traffic spreads over the three partitions again, and total lag reaches 0.",
    ),
    start: lagBox(HOT, { key: "city" }),
    hints: [
      l(
        `\`${DESCRIBE}\`: bütün LAG tek partition'da. Sorun okuyanlarda değil, yazanın seçtiği key'de.`,
        `\`${DESCRIBE}\`: all the LAG is on one partition. The problem isn't the readers; it's the key the writer picks.`,
      ),
      l(`\`${PRODUCER_CONFIG}\`'te \`key.field=user\` yap ve tıklama servisini yeniden deploy et.`, `Set \`key.field=user\` in \`${PRODUCER_CONFIG}\` and redeploy the clicks service.`),
      l(`\`nano ${PRODUCER_CONFIG}\` (key.field=user), \`./deploy-clicks.sh\`, \`sleep 10\``, `\`nano ${PRODUCER_CONFIG}\` (key.field=user), \`./deploy-clicks.sh\`, \`sleep 10\``),
    ],
    par: 2,
    check: (ctx) => timePassed(ctx) && !ctx.state.hot && totalLag(ctx.state) === 0,
  },
];

export { RUN, DESCRIBE };
