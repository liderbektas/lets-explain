import { l, useLang, type Lang } from "@lets-explain/core/i18n";
import type { LessonEntry } from "@lets-explain/core/course/types";
import { Icon } from "./Icon";

/** How many of these lessons can be listened to in this language. */
export const narratedIn = (entries: LessonEntry[], lang: Lang) => entries.filter((e) => e.lesson?.narration?.[lang]).length;

/** The other site language: narration may exist only there. */
export const otherLang = (lang: Lang): Lang => (lang === "tr" ? "en" : "tr");

/**
 * A small sticker saying lessons here are narrated: "Sesli anlatımlı" when every lesson is, or
 * how many are when only some. When there is no audio in the reader's language but there is in
 * the other one, it says which language the audio is in, so English readers still find it.
 */
export function AudioBadge({
  narrated,
  total,
  elsewhere = 0,
  className = "",
}: {
  narrated: number;
  total: number;
  /** Lessons narrated in the other language. */
  elsewhere?: number;
  className?: string;
}) {
  const { t } = useLang();
  if (narrated === 0 && elsewhere === 0) return null;
  const text =
    narrated === 0
      ? l("İngilizce sesli anlatım", "Audio in Turkish")
      : narrated >= total
        ? l("Sesli anlatımlı", "Audio narrated")
        : l(`${narrated} derste sesli anlatım`, `Audio in ${narrated} lessons`);
  return (
    <span className={`audio-badge ${className}`}>
      <span className="audio-badge-icon" aria-hidden="true">
        <Icon name="headphones" size={15} />
      </span>
      {t(text)}
    </span>
  );
}
