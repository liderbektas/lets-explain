import { l } from "@lets-explain/core/i18n";
import type { Scenario } from "@lets-explain/core/course/types";
import type { AppCtx } from "../shared/appShell";
import { sandboxStart, V1, type Action, type SREvent, type SRState } from "./model";
import { boxOf, type SBox } from "./shell";

export type SCtx = AppCtx<SRState, Action, SREvent>;
export type SScenario = Scenario<SCtx, SBox>;

const failedSince = (c: SCtx) => c.state.reader.failed - c.start.reader.failed;
const newRecords = (c: SCtx) => c.state.records.slice(c.start.records.length);
const readOk = (c: SCtx) => new Set(c.events.flat().flatMap((e) => (e.type === "read" ? [e.offset] : [])));
const v1Names = V1.map((f) => f.name);
/** A new order that has a field outside v1, read by billing without an error. */
const newFieldRead = (c: SCtx, field?: string) => {
  const read = readOk(c);
  return failedSince(c) === 0 && newRecords(c).some((r) => r.fields.some((f) => !v1Names.includes(f) && (!field || f === field)) && read.has(r.offset));
};

/** Free play and every scenario start here: registry on, BACKWARD, v1 registered, billing up to date. */
export const FREE: SBox = boxOf(sandboxStart);

export const scenarios: SScenario[] = [
  {
    id: "add-coupon",
    title: l("Kupon alanı", "A coupon field"),
    story: l(
      "Pazarlama, siparişlere `coupon` alanı istiyor. Billing ekibi bu hafta kod değiştiremiyor: billing eski şemayla (`billing/order.avsc`) okumaya devam edecek.",
      "Marketing wants a `coupon` field on orders. The billing team can't change code this week: billing keeps reading with its old schema (`billing/order.avsc`).",
    ),
    goal: l("`coupon` alanı olan bir sipariş yaz; billing onu **hatasız** okusun.", "Write an order that has a `coupon` field; billing reads it **without an error**."),
    start: FREE,
    hints: [
      l("Billing kodu değişmeyecek, yani yeni şema eski kodla da okunabilmeli. Eski okuyucu bilmediği alanı atlar; sorun, yeni alanın **zorunlu** olması.", "Billing's code won't change, so the new schema must be readable by old code too. An old reader skips fields it doesn't know; the trouble is a **required** new field."),
      l("`order.avsc`'ye `coupon`'ı **default değeriyle** ekle: `{\"name\": \"coupon\", \"type\": [\"null\", \"string\"], \"default\": null}`.", "Add `coupon` to `order.avsc` **with a default**: `{\"name\": \"coupon\", \"type\": [\"null\", \"string\"], \"default\": null}`."),
      l("`nano order.avsc` (default'lu coupon alanı), `./produce-order.sh`, `./run-billing.sh`", "`nano order.avsc` (coupon with a default), `./produce-order.sh`, `./run-billing.sh`"),
    ],
    par: 3,
    check: (c) => newFieldRead(c, "coupon"),
  },
  {
    id: "rename-pr",
    title: l("Yeniden adlandırma PR'ı", "The rename PR"),
    story: l(
      "Bir takım arkadaşının PR'ı `total` alanının adını `amount` yapıyor. Merge'den önce registry'nin buna ne diyeceğini görmek istiyorsun. Konu bozuk bir kaydın topic'e girmemesi.",
      "A teammate's PR renames the `total` field to `amount`. Before it's merged you want to see what the registry says. The point is that no broken record reaches the topic.",
    ),
    goal: l("PR'daki şemayla bir sipariş yazmayı dene: registry **reddetsin** ve topic'e hiçbir şey yazılmasın.", "Try writing an order with the PR's schema: the registry **refuses** it and nothing is written to the topic."),
    start: FREE,
    hints: [
      l("Yeniden adlandırma, eski adı silip zorunlu yeni bir alan eklemek demek.", "A rename means deleting the old name and adding a required new field."),
      l("`order.avsc`'de `total`'ı `amount` yap ve `./produce-order.sh` ile yazmayı dene. BACKWARD modunda registry bunu 409 ile geri çevirir.", "In `order.avsc`, change `total` to `amount` and try writing with `./produce-order.sh`. Under BACKWARD the registry turns it down with a 409."),
      l("`nano order.avsc` (`total` → `amount`), `./produce-order.sh`", "`nano order.avsc` (`total` → `amount`), `./produce-order.sh`"),
    ],
    par: 2,
    check: (c) => c.events.flat().some((e) => e.type === "rejected") && c.state.records.length === c.start.records.length && !c.state.versions.some((v) => v.schema.some((f) => f.name === "amount")),
  },
  {
    id: "drop-total",
    title: l("total'ı kaldır", "Drop total"),
    story: l(
      "Toplam tutar artık başka bir serviste hesaplanıyor; siparişten `total` alanı kalkacak. BACKWARD modu buna izin veriyor, ama billing'in kodu `total`'ı hâlâ zorunlu bekliyor.",
      "The total is now worked out by another service; the `total` field is leaving orders. BACKWARD mode allows it, but billing's code still expects `total` as required.",
    ),
    goal: l("`total`'sız bir sipariş yaz; billing onu ve öncekileri **hiç hata vermeden** okusun.", "Write an order without `total`; billing reads it and the earlier ones **without a single error**."),
    start: FREE,
    hints: [
      l("BACKWARD'da sıra önemli: önce **okuyanlar** yeni şemaya geçer, sonra yazanlar.", "Under BACKWARD the order matters: **readers** move to the new schema first, then writers."),
      l("Yeni şemayı billing'e de ver (`cp order.avsc billing/order.avsc`); billing'i yeniden başlatmadan önce yazarsan eski kod hata verir.", "Give billing the new schema too (`cp order.avsc billing/order.avsc`); write before billing restarts with it and the old code fails."),
      l("`nano order.avsc` (total'ı sil), `cp order.avsc billing/order.avsc`, `./produce-order.sh`, `./run-billing.sh`", "`nano order.avsc` (delete total), `cp order.avsc billing/order.avsc`, `./produce-order.sh`, `./run-billing.sh`"),
    ],
    par: 4,
    check: (c) => {
      const read = readOk(c);
      return failedSince(c) === 0 && newRecords(c).some((r) => !r.fields.includes("total") && read.has(r.offset));
    },
  },
  {
    id: "forward",
    title: l("Önce yazan güncellensin", "Writers go first"),
    story: l(
      "Ekip kararı: bundan sonra producer'lar önce, consumer'lar sonra güncellenecek. Yani eski consumer'lar yeni veriyi okuyabilmeli. İlk iş: siparişlere zorunlu bir `currency` alanı eklemek. Billing'in kodu bu sprint değişmeyecek.",
      "Team decision: from now on producers update first and consumers later. So old consumers must be able to read new data. First job: add a required `currency` field to orders. Billing's code won't change this sprint.",
    ),
    goal: l("Subject'in uyumluluğunu bu karara uygun moda al; zorunlu `currency` alanlı bir sipariş yaz ve billing onu **hatasız** okusun.", "Put the subject's compatibility in the mode that fits the decision; write an order with a required `currency` field, and billing reads it **without an error**."),
    start: FREE,
    hints: [
      l("Eski okuyucunun yeni veriyi okuyabilmesi **FORWARD** uyumluluğu. BACKWARD tam tersini korur ve zorunlu yeni alanı reddeder.", "Old readers reading new data is **FORWARD** compatibility. BACKWARD protects the other direction and refuses a required new field."),
      l("Modu registry'nin REST API'siyle değiştir: `PUT /config/orders-value`, gövdesi `{\"compatibility\": \"FORWARD\"}`.", "Change the mode with the registry's REST API: `PUT /config/orders-value` with the body `{\"compatibility\": \"FORWARD\"}`."),
      l(
        "`curl -X PUT -H \"Content-Type: application/vnd.schemaregistry.v1+json\" --data '{\"compatibility\": \"FORWARD\"}' http://localhost:8081/config/orders-value`, `nano order.avsc` (currency, default'suz), `./produce-order.sh`, `./run-billing.sh`",
        "`curl -X PUT -H \"Content-Type: application/vnd.schemaregistry.v1+json\" --data '{\"compatibility\": \"FORWARD\"}' http://localhost:8081/config/orders-value`, `nano order.avsc` (currency, no default), `./produce-order.sh`, `./run-billing.sh`",
      ),
    ],
    par: 4,
    check: (c) => c.state.mode === "FORWARD" && newFieldRead(c, "currency"),
  },
];
