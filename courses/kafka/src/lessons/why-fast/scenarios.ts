import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import type { AppCtx } from "../shared/appShell";
import { measure, type Settings } from "./model";
import { START, type FAction, type FBox, type FEvent } from "./shell";

export type FCtx = AppCtx<Settings, FAction, FEvent>;
export type FScenario = Scenario<FCtx, FBox>;

const PERF = "kafka-producer-perf-test.sh --topic events --num-records 1000000 --record-size 1024 --throughput -1 --producer.config producer.properties";
/** What was last measured: the checks only trust a perf test run after the change. */
const measured = (c: FCtx) => {
  const last = c.events.flat().filter((e) => e.type === "changed").at(-1);
  return last ? measure(last.to) : null;
};

export const FREE = START;

export const scenarios: FScenario[] = [
  {
    id: "fifty",
    title: l("50 bin", "Fifty thousand"),
    story: l(
      "Tıklama olaylarını yazan producer saniyede ancak ~1.000 kayıt gönderebiliyor. `producer.properties`'e bak: eski bir olayda biri `batch.size`'ı 1024 bayta indirmiş, yani her istek tek kayıt taşıyor.",
      "The producer writing click events only manages about 1,000 records a second. Look at `producer.properties`: in an old incident someone dropped `batch.size` to 1024 bytes, so every request carries a single record.",
    ),
    goal: l("Performans testi saniyede en az **50.000** kayıt göstersin.", "The perf test shows at least **50,000** records a second."),
    start: START,
    hints: [
      l("Her istek 1 ms gidiş-dönüş bekliyor. İstek başına kaç kayıt gittiği her şeyi belirliyor.", "Every request waits a 1 ms round trip. How many records go per request decides everything."),
      l("Kayıtlar 1 KB: `batch.size=102400` bir isteğe 100 kayıt sığdırır. Sonra ölç.", "Records are 1 KB: `batch.size=102400` fits 100 records in a request. Then measure."),
      l(`\`nano producer.properties\` (\`batch.size=102400\`), sonra \`${PERF}\``, `\`nano producer.properties\` (\`batch.size=102400\`), then \`${PERF}\``),
    ],
    par: 2,
    check: (c) => (measured(c)?.produce ?? 0) >= 50_000,
  },
  {
    id: "few-requests",
    title: l("Az istek", "Few requests"),
    story: l(
      "Broker'ların CPU'su yüksek: saniyede binlerce küçük istek işliyorlar. Platform ekibi istek sayısının düşmesini istiyor, ama throughput 50.000'in altına inmemeli.",
      "The brokers' CPU is high: they handle thousands of small requests a second. The platform team wants fewer requests, without throughput dropping under 50,000.",
    ),
    goal: l("Saniyede **100'den az** istekle en az **50.000** kayıt.", "At least **50,000** records a second with **fewer than 100** requests a second."),
    start: START,
    hints: [
      l("İstek sayısı = kayıt sayısı / istek başına kayıt.", "Requests = records / records per request."),
      l("Saniyede 50.000 kayıt 100'den az istekle gidecekse her istekte 500'den fazla kayıt olmalı: `batch.size` en az ~512 KB.", "To carry 50,000 records in under 100 requests, each request needs more than 500 records: `batch.size` of at least ~512 KB."),
      l(`\`nano producer.properties\` (\`batch.size=1024000\`), sonra \`${PERF}\``, `\`nano producer.properties\` (\`batch.size=1024000\`), then \`${PERF}\``),
    ],
    par: 2,
    check: (c) => {
      const m = measured(c);
      return Boolean(m && m.produce >= 50_000 && m.requests < 100);
    },
  },
  {
    id: "beat-network",
    title: l("Ağı aş", "Beat the network"),
    story: l(
      "Ağ saniyede 100 MB taşıyor; 1 KB'lık kayıtlarla bu en fazla 100.000 kayıt eder. Kampanya günü bundan fazlası gelecek ve ağ kartı yükseltmesi aylar sürecek.",
      "The network carries 100 MB a second; with 1 KB records that's at most 100,000 records. Campaign day will bring more than that, and a network upgrade takes months.",
    ),
    goal: l("Saniyede **100.000'den fazla** kayıt yaz.", "Write **more than 100,000** records a second."),
    start: START,
    hints: [
      l("Ağı büyütemiyorsan, içinden geçeni küçült.", "If you can't make the network bigger, make what goes through it smaller."),
      l("Büyük batch'ler iyi sıkışır: büyük `batch.size` ile `compression.type=lz4`.", "Big batches compress well: a big `batch.size` with `compression.type=lz4`."),
      l(`\`nano producer.properties\` (\`batch.size=1024000\`, \`compression.type=lz4\`), sonra \`${PERF}\``, `\`nano producer.properties\` (\`batch.size=1024000\`, \`compression.type=lz4\`), then \`${PERF}\``),
    ],
    par: 2,
    check: (c) => (measured(c)?.produce ?? 0) > 100_000,
  },
  {
    id: "read-fast",
    title: l("Hızlı oku", "Read fast"),
    story: l(
      "Yazma hızlandı ama işleyen taraf yetişemiyor: `processors` grubundaki tek consumer saniyede 25.000 kayıt işleyebiliyor ve lag büyüyor.",
      "Writes got fast, but the processing side can't keep up: the single consumer in the `processors` group handles 25,000 records a second and lag keeps growing.",
    ),
    goal: l("Ölçümde consumer grubu saniyede en az **100.000** kayıt işlesin.", "In the measurement, the consumer group processes at least **100,000** records a second."),
    start: START,
    hints: [
      l("Önce yazma 100.000'e çıkmalı; sonra 4 consumer gerekiyor.", "First writes must reach 100,000; then you need 4 consumers."),
      l("Bir gruptaki her partition'ı tek bir consumer okur: 4 consumer için en az 4 partition lazım. `kafka-topics.sh --alter --partitions 4` ve `docker compose up -d --scale processor=4`.", "Each partition is read by one consumer in a group: 4 consumers need at least 4 partitions. `kafka-topics.sh --alter --partitions 4` and `docker compose up -d --scale processor=4`."),
      l(
        `\`nano producer.properties\` (\`batch.size=102400\`), \`kafka-topics.sh --bootstrap-server localhost:9092 --alter --topic events --partitions 4\`, \`docker compose up -d --scale processor=4\`, \`${PERF}\``,
        `\`nano producer.properties\` (\`batch.size=102400\`), \`kafka-topics.sh --bootstrap-server localhost:9092 --alter --topic events --partitions 4\`, \`docker compose up -d --scale processor=4\`, \`${PERF}\``,
      ),
    ],
    par: 4,
    check: (c) => (measured(c)?.consume ?? 0) >= 100_000,
  },
];

export { PERF };
