import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  cluster: {
    term: "Cluster",
    def: l(
      "Birlikte çalışan broker'ların bütünü. Topic'lerin partition'ları bu broker'lara dağıtılır.",
      "A group of brokers working together. A topic's partitions are spread across them.",
    ),
  },
  bootstrapServers: {
    term: "bootstrap.servers",
    def: l(
      "Client'ın ilk bağlanacağı broker adresleri. Herhangi biri cluster'ın tamamını tarif eder; hepsini yazmak gerekmez.",
      "Broker addresses a client connects to first. Any one of them can describe the whole cluster, so you do not need to list them all.",
    ),
  },
  metadata: {
    term: "Metadata",
    def: l(
      "Cluster'ın haritası: hangi broker'lar var, hangi topic'in kaç partition'ı var ve her partition'ın lideri hangi broker.",
      "The cluster's map: which brokers exist, how many partitions each topic has, and which broker leads each partition.",
    ),
  },
  leader: {
    term: "Leader",
    def: l(
      "Bir partition'ın yazma ve okumalarını karşılayan broker. Producer'lar kayıtları doğrudan ona gönderir.",
      "The broker that serves a partition's writes and reads. Producers send records straight to it.",
    ),
  },
  reassignment: {
    term: "Partition reassignment",
    def: l(
      "Bir partition'ın kopyalarını başka broker'lara taşımak. Veri yeni broker'a kopyalanır, sonra eskisinden silinir.",
      "Moving a partition's copies to other brokers. The data is copied to the new broker, then removed from the old one.",
    ),
  },
};
