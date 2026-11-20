import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import type { AppCtx } from "../shared/appShell";
import { indexDuplicates, MASKED, sandboxStart, simulate, topicDuplicates, type Action, type ConnectEvent, type ConnectState } from "./model";
import { boxOf, type CBox } from "./shell";

export type CCtx = AppCtx<ConnectState, Action, ConnectEvent>;
export type CScenario = Scenario<CCtx, CBox>;

const after = (actions: Action[]) => simulate(actions, sandboxStart).states.at(-1)!;
const insert: Action = { type: "insertRow" };
const srcPoll: Action = { type: "sourcePoll" };
const srcFlush: Action = { type: "sourceFlush" };
const sinkPoll: Action = { type: "sinkPoll" };
const sinkCommit: Action = { type: "sinkCommit" };

const bothUp = (c: CCtx) => c.state.workers.w1 && c.state.workers.w2;
const everyRowIndexed = (c: CCtx) => c.state.rows.every((r) => c.state.index.some((d) => d.rowId === r.id));
const crashed = (c: CCtx, w: "w1" | "w2") => c.actions.some((a) => a.type === "crash" && a.worker === w);

export const FREE: CBox = boxOf(sandboxStart);

export const scenarios: CScenario[] = [
  {
    id: "mask-cards",
    title: l("Kart numaraları", "Card numbers"),
    story: l(
      "Güvenlik denetimi bulgusu: kart numaraları `payments` topic'inde ve arama indeksinde açıkça duruyor. Bundan sonra gelen ödemelerde kart numarası **Kafka'ya girmeden** maskelenmeli.",
      "A security audit finding: card numbers sit in plain text in the `payments` topic and the search index. From now on, a new payment's card number must be masked **before it enters Kafka**.",
    ),
    goal: l("Yeni bir ödeme ekle; topic'te de indekste de kart numarası maskeli görünsün.", "Add a new payment; its card number shows masked both in the topic and in the index."),
    start: FREE,
    hints: [
      l("Maskelemeyi uygulama koduna yazmana gerek yok: Connect'in Single Message Transform'ları (SMT) kaydı yoldayken değiştirir.", "You don't need app code for this: Connect's Single Message Transforms (SMTs) change a record on its way."),
      l("`db-source.json`'a `MaskField$Value` SMT'si ekle (`transforms.mask.fields` = `card`), sonra config'i `PUT /connectors/db-source/config` ile canlıya al.", "Add a `MaskField$Value` SMT to `db-source.json` (`transforms.mask.fields` = `card`), then make it live with `PUT /connectors/db-source/config`."),
      l(
        "`nano db-source.json` (mask transform), `curl -X PUT -H \"Content-Type: application/json\" --data @db-source.json localhost:8083/connectors/db-source/config`, `./insert-payment.sh`",
        "`nano db-source.json` (mask transform), `curl -X PUT -H \"Content-Type: application/json\" --data @db-source.json localhost:8083/connectors/db-source/config`, `./insert-payment.sh`",
      ),
    ],
    par: 3,
    check: (c) => {
      const fresh = c.state.rows.filter((r) => !c.start.rows.some((x) => x.id === r.id));
      return (
        fresh.length > 0 &&
        fresh.every((r) => c.state.topic.some((t) => t.rowId === r.id && t.card === MASKED) && c.state.index.some((d) => d.rowId === r.id && d.card === MASKED))
      );
    },
  },
  {
    id: "oom-sink",
    title: l("Bellek yetmedi", "Out of memory"),
    story: l(
      "`connect-worker-2` haftada bir bellek yetmediği için öldürülüyor (OOM kill). Sink görevi orada çalışıyor ve son kayıtların offset'ini henüz commit etmedi. Her seferinde aramada aynı ödeme iki kez çıkıyor. Bellek sorunu sonra çözülecek; şimdilik tekrarlar zararsız olmalı.",
      "`connect-worker-2` gets killed for running out of memory about once a week (OOM kill). The sink task runs there and hasn't committed the offsets of its latest records yet. Every time, the same payment shows up twice in search. The memory issue comes later; for now repeats must be harmless.",
    ),
    goal: l("Sink'i tekrarları zararsız yapacak şekilde ayarla, sonra `connect-worker-2`'yi öldürerek dene: indekste **hiçbir ödeme iki kez** olmasın.", "Set the sink up so repeats do no harm, then test it by killing `connect-worker-2`: **no payment twice** in the index."),
    start: boxOf(after([insert, insert, srcPoll, srcFlush, sinkPoll])),
    hints: [
      l("Commit'lenmemiş kayıtlar yeniden işlenecek; bunu engelleyemezsin. Aynı kaydı ikinci kez yazmak yeni bir doküman **eklememeli**, eskisinin üstüne yazmalı.", "Uncommitted records will be processed again; you can't stop that. Writing the same record a second time must not **add** a document; it should overwrite the old one."),
      l("Elasticsearch sink'inde `write.method` = `upsert` ve `key.ignore` = `false`: doküman kimliği kaydın key'inden (satır id'si) gelir.", "On the Elasticsearch sink, `write.method` = `upsert` and `key.ignore` = `false`: the document id comes from the record key (the row id)."),
      l(
        "`nano search-sink.json` (upsert, key.ignore false), `curl -X PUT -H \"Content-Type: application/json\" --data @search-sink.json localhost:8083/connectors/search-sink/config`, `docker kill connect-worker-2`",
        "`nano search-sink.json` (upsert, key.ignore false), `curl -X PUT -H \"Content-Type: application/json\" --data @search-sink.json localhost:8083/connectors/search-sink/config`, `docker kill connect-worker-2`",
      ),
    ],
    par: 3,
    check: (c) => crashed(c, "w2") && indexDuplicates(c.state) === indexDuplicates(c.start) && c.state.sinkMode === "upsert" && everyRowIndexed(c),
  },
  {
    id: "patch-night",
    title: l("Yama gecesi", "Patch night"),
    story: l(
      "İşletim sistemi yaması için `connect-worker-1` yeniden başlamalı. Source görevi orada çalışıyor ve son okuduğu satırların offset'i henüz kaydedilmedi. Geçen sefer yeniden başlatma `payments` topic'ine aynı satırları ikinci kez yazdırdı.",
      "`connect-worker-1` has to restart for an OS patch. The source task runs there, and the offsets of the rows it read last aren't saved yet. Last time, the restart made the same rows land in the `payments` topic a second time.",
    ),
    goal: l("`connect-worker-1` kapanıp geri gelsin; topic'e **hiçbir satır ikinci kez** yazılmasın, iki worker da çalışsın.", "`connect-worker-1` goes down and comes back; **no row** is written to the topic a second time, and both workers run."),
    start: boxOf(after([insert, insert, srcPoll, sinkPoll, sinkCommit])),
    hints: [
      l("Bir worker'ı kapatmanın iki yolu var: düzgünce (görevler durur, offset'lerini kaydeder) ya da sert (süreç anında ölür).", "There are two ways to take a worker down: cleanly (tasks stop and save their offsets) or hard (the process dies at once)."),
      l("`docker stop` önce SIGTERM gönderir: Connect görevleri temiz kapatır. `docker kill` SIGKILL'dir: kaydedilmemiş offset kaybolur.", "`docker stop` sends SIGTERM first: Connect shuts its tasks down cleanly. `docker kill` is SIGKILL: an unsaved offset is lost."),
      l("`docker restart connect-worker-1`", "`docker restart connect-worker-1`"),
    ],
    par: 1,
    check: (c) => crashed(c, "w1") && bothUp(c) && topicDuplicates(c.state) === topicDuplicates(c.start),
  },
  {
    id: "power-cut",
    title: l("Elektrik kesintisi", "Power cut"),
    story: l(
      "Gece elektrik kesildi ve iki Connect worker'ı da kapalı kaldı. Arama ekibi bir saattir yeni ödeme göremediğini söylüyor; bu arada tabloya iki ödeme eklendi.",
      "The power went out overnight and both Connect workers stayed down. The search team says they haven't seen a new payment for an hour; meanwhile two payments were added to the table.",
    ),
    goal: l("Connect'i geri getir: iki worker da çalışsın ve tablodaki **her ödeme** indekste olsun.", "Bring Connect back: both workers run and **every payment** in the table is in the index."),
    start: boxOf(after([{ type: "crash", worker: "w1" }, { type: "crash", worker: "w2" }, insert, insert])),
    hints: [
      l("Önce bak: `docker ps` ya da `curl localhost:8083/connectors/db-source/status`.", "Look first: `docker ps` or `curl localhost:8083/connectors/db-source/status`."),
      l("Worker'lar geri gelince görevler kaydedilmiş offset'ten devam eder; kaçan satırları kendileri yakalar.", "When the workers come back, the tasks carry on from their saved offsets and catch the missed rows on their own."),
      l("`docker start connect-worker-1 connect-worker-2`", "`docker start connect-worker-1 connect-worker-2`"),
    ],
    par: 1,
    check: (c) => bothUp(c) && everyRowIndexed(c),
  },
];
