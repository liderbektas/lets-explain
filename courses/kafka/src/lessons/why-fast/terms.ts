import type { GlossaryEntry } from "../../glossary";
import { l } from "@lets-explain/core/i18n";

export const terms: Record<string, GlossaryEntry> = {
  pageCache: {
    term: "Page cache",
    def: l(
      "İşletim sisteminin dosya verisini bellekte tuttuğu önbellek. Yeni yazılan ve sık okunan veri oradan diske gitmeden okunur.",
      "The operating system's in-memory cache of file data. Freshly written and often-read data is served from there without going to disk.",
    ),
  },
  batch: {
    term: "Batch",
    def: l(
      "Producer'ın tek bir istekte gönderdiği kayıt paketi. Boyutunu batch.size ve linger.ms belirler.",
      "A pack of records the producer sends in one request. Its size is shaped by batch.size and linger.ms.",
    ),
  },
  zeroCopy: {
    term: "Zero-copy",
    def: l(
      "Verinin uygulama belleğine kopyalanmadan, page cache'ten doğrudan ağa gönderilmesi (sendfile).",
      "Sending data straight from the page cache to the network without copying it into application memory (sendfile).",
    ),
  },
};
