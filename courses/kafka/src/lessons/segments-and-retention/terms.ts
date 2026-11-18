import type { GlossaryEntry } from "../../glossary";
import { l } from "@lets-explain/core/i18n";

export const terms: Record<string, GlossaryEntry> = {
  segment: {
    term: "Segment",
    def: l(
      "Bir partition'ın log'unu oluşturan dosya parçalarından biri. Kayıtlar hep sonuncusuna, aktif segment'e yazılır.",
      "One of the file pieces a partition's log is made of. Records always go to the last one, the active segment.",
    ),
  },
  activeSegment: {
    term: "Active segment",
    def: l(
      "Şu an yazılan, en son segment. Dolunca ya da segment.ms geçince kapanır ve yenisi açılır.",
      "The newest segment, the one being written. When it is full or segment.ms has passed, it closes and a new one rolls.",
    ),
  },
  baseOffset: {
    term: "Base offset",
    def: l(
      "Bir segment'teki ilk kaydın offset'i. Segment dosyasının adı budur, 20 haneye tamamlanmış hâliyle.",
      "The offset of a segment's first record. It is the segment file's name, padded to 20 digits.",
    ),
  },
  logStartOffset: {
    term: "Log start offset",
    def: l(
      "Bir partition'da hâlâ diskte duran ilk offset. Retention segment sildikçe ileri gider, hiç geri gelmez.",
      "The first offset still on disk in a partition. It moves forward as retention deletes segments, never back.",
    ),
  },
  segmentMs: {
    term: "segment.ms",
    def: l(
      "Aktif segment en fazla ne kadar açık kalır. Varsayılan 7 gün. Süre dolunca sıradaki yazmada yeni segment açılır.",
      "How long the active segment may stay open. 7 days by default. When it passes, the next write rolls a new segment.",
    ),
  },
};
