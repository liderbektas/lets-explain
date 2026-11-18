import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import type { Action, SREvent, SRState } from "./model";

export interface SandboxCtx {
  start: SRState;
  state: SRState;
  actions: Action[];
  events: SREvent[][];
}

const all = (ctx: SandboxCtx) => ctx.events.flat();
const failedSince = (ctx: SandboxCtx) => ctx.state.reader.failed - ctx.start.reader.failed;
const newRecords = (ctx: SandboxCtx) => ctx.state.records.slice(ctx.start.records.length);
const readOk = (ctx: SandboxCtx) =>
  new Set(all(ctx).flatMap((e) => (e.type === "read" ? [e.offset] : [])));

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "new-field",
    title: l("Yeni alan", "A new field"),
    goal: l(
      "Siparişlere `coupon` alanını ekle, yeni bir sipariş yaz ve Fatura onu **hatasız** okusun.",
      "Add a `coupon` field to orders, write a new order, and have billing read it **without an error**.",
    ),
    hint: l(
      "BACKWARD modunda yeni bir alan ancak default değeriyle eklenebilir.",
      "In BACKWARD mode a new field can only be added with a default value.",
    ),
    par: 3,
    check: (ctx) => {
      const read = readOk(ctx);
      return (
        failedSince(ctx) === 0 && newRecords(ctx).some((r) => r.fields.includes("coupon") && read.has(r.offset))
      );
    },
  },
  {
    id: "rejected",
    title: l("Kapıdan dön", "Turned away"),
    goal: l(
      "Registry bir şema değişikliğini **reddetsin**.",
      "Make the registry **reject** a schema change.",
    ),
    hint: l(
      "Default değeri olmayan yeni bir alan, eski kayıtlarda yoktur. Yeni şemayı kullanan kod onları okuyamaz.",
      "A new field without a default is missing from old records, so code using the new schema cannot read them.",
    ),
    par: 2,
    check: (ctx) => all(ctx).some((e) => e.type === "rejected"),
  },
  {
    id: "reader-first",
    title: l("Önce okuyan", "Reader first"),
    goal: l(
      "`total` alanını kaldır ve yeni bir sipariş yaz. Fatura bu siparişi de **hatasız** okusun.",
      "Remove the `total` field and write a new order. Billing must read that one **without an error** too.",
    ),
    hint: l(
      "BACKWARD silmeye izin verir ama eski kodlu Fatura hâlâ `total` bekliyor. Okumadan önce Fatura'nın kodunu güncelle.",
      "BACKWARD allows the delete, but billing's old code still expects `total`. Update billing's code before it reads.",
    ),
    par: 4,
    check: (ctx) => {
      const read = readOk(ctx);
      return (
        failedSince(ctx) === 0 && newRecords(ctx).some((r) => !r.fields.includes("total") && read.has(r.offset))
      );
    },
  },
];
