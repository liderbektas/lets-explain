import { l } from "@lets-explain/core/i18n";
import type { Mission } from "@lets-explain/core/course/types";
import type { Knobs, Measure } from "./model";

export interface SandboxCtx {
  knobs: Knobs;
  m: Measure;
}

export const missions: Mission<SandboxCtx>[] = [
  {
    id: "fifty",
    title: l("50 bin", "Fifty thousand"),
    goal: l("Producer saniyede en az **50.000** kayıt yazsın.", "Get the producer writing at least **50,000** records a second."),
    hint: l(
      "Şu an her kayıt kendi isteğiyle gidiyor ve her istek 1 ms bekliyor. Kayıtları paketle.",
      "Right now every record travels in its own request, and each request waits 1 ms. Pack records together.",
    ),
    par: 2,
    check: ({ m }) => m.produce >= 50_000,
  },
  {
    id: "few-requests",
    title: l("Az istek", "Few requests"),
    goal: l(
      "Saniyede **100'den az** istekle en az **50.000** kayıt yaz.",
      "Write at least **50,000** records a second with **fewer than 100** requests a second.",
    ),
    hint: l("Bir istekte ne kadar çok kayıt giderse o kadar az istek gerekir.", "The more records per request, the fewer requests you need."),
    par: 3,
    check: ({ m }) => m.produce >= 50_000 && m.requests < 100,
  },
  {
    id: "beat-network",
    title: l("Ağı aş", "Beat the network"),
    goal: l(
      "Ağ saniyede 100 MB taşıyor, yani en fazla 100.000 tane 1 KB'lık kayıt. Saniyede **100.000'den fazla** kayıt yaz.",
      "The network carries 100 MB a second: at most 100,000 records of 1 KB. Write **more than 100,000** records a second.",
    ),
    hint: l("Kayıtlar küçülürse aynı ağdan daha çoğu geçer.", "If the records get smaller, more of them fit through the same network."),
    par: 4,
    check: ({ m }) => m.produce > 100_000,
  },
  {
    id: "read-fast",
    title: l("Hızlı oku", "Read fast"),
    goal: l(
      "Consumer group saniyede en az **100.000** kayıt işlesin. Bir consumer saniyede 25.000 kayıt işleyebiliyor.",
      "Get the consumer group processing at least **100,000** records a second. One consumer handles 25,000 a second.",
    ),
    hint: l(
      "4 consumer gerekiyor, ama her partition'ı group'tan sadece bir consumer okur.",
      "You need 4 consumers, but only one consumer in a group reads each partition.",
    ),
    par: 6,
    check: ({ m }) => m.consume >= 100_000,
  },
];
