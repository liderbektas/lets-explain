import { l, useLang, type Lang } from "@lets-explain/core/i18n";
import type { LessonEntry } from "@lets-explain/core/course/types";
import { Icon } from "./Icon";

/** How many of these lessons can be listened to in this language. */
export const narratedIn = (entries: LessonEntry[], lang: Lang) => entries.filter((e) => e.lesson?.narration?.[lang]).length;

/**
 * A small sticker saying lessons here are narrated: "Sesli anlatımlı" when every lesson is, or
 * how many are when only some.
 */
export function AudioBadge({ narrated, total, className = "" }: { narrated: number; total: number; className?: string }) {
  const { t } = useLang();
  if (narrated === 0) return null;
  const text = narrated >= total ? l("Sesli anlatımlı", "Audio narrated") : l(`${narrated} derste sesli anlatım`, `Audio in ${narrated} lessons`);
  return (
    <span className={`audio-badge ${className}`}>
      <span className="audio-badge-icon" aria-hidden="true">
        <Icon name="headphones" size={14} />
      </span>
      {t(text)}
    </span>
  );
}
