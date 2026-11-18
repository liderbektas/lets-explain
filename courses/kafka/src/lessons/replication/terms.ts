import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  replica: {
    term: "Replica",
    def: l(
      "Bir partition'ın bir broker'daki kopyası. Kopyalardan biri leader, diğerleri follower'dır.",
      "A copy of a partition on one broker. One copy is the leader, the others are followers.",
    ),
  },
  replicationFactor: {
    term: "Replication factor",
    def: l(
      "Bir partition'ın kaç broker'da kopyası tutulacağı. Üretimde genelde 3.",
      "How many brokers keep a copy of each partition. Usually 3 in production.",
    ),
  },
  follower: {
    term: "Follower",
    def: l(
      "Leader'dan sürekli kayıt çekip kendi kopyasını güncel tutan replica. Leader çökerse yerini alabilir.",
      "A replica that keeps fetching from the leader to stay up to date. It can take over if the leader dies.",
    ),
  },
  isr: {
    term: "ISR",
    def: l(
      "In-sync replicas: leader'a yetişmiş kopyaların listesi. Yeni leader sadece bu listeden seçilir.",
      "In-sync replicas: the copies that have kept up with the leader. A new leader is only chosen from this list.",
    ),
  },
  highWatermark: {
    term: "High watermark",
    def: l(
      "ISR'deki bütün kopyalarda bulunan son kaydın bir sonrası. Consumer'lar sadece bu sınırın altındaki kayıtları görür.",
      "One past the last record that every ISR copy has. Consumers only see records below this line.",
    ),
  },
  uncleanElection: {
    term: "Unclean leader election",
    def: l(
      "ISR dışındaki, geride kalmış bir kopyanın leader yapılması. Partition'ı açar ama onaylanmış kayıtları kaybettirir. Varsayılan olarak kapalı.",
      "Making a copy that fell behind, outside the ISR, the leader. It brings the partition back but loses acknowledged records. Off by default.",
    ),
  },
};
