import { useId, useState, type ReactNode } from "react";
import { useLang } from "@lets-explain/core/i18n";
import { useCourseOrNull } from "../course/context";

/**
 * Renders lesson text with a tiny markup instead of raw HTML:
 *   **bold**   `code`   [[offset]]   [[offset|offset'ler]]
 * A [[term]] becomes a word you can hover or tap to see its definition.
 */
export function Rich({ text }: { text: string }) {
  return <>{parse(text)}</>;
}

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\])/g;

function parse(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("[[") && part.endsWith("]]")) {
      const [id, shown] = part.slice(2, -2).split("|");
      return <Term key={i} id={id!} shown={shown} />;
    }
    return part;
  });
}

function Term({ id, shown }: { id: string; shown?: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const entry = useCourseOrNull()?.glossary[id];
  // Terms read as ordinary words mid-sentence: "offset", not "Offset".
  const label = shown ?? (entry ? entry.term.charAt(0).toLowerCase() + entry.term.slice(1) : id);
  if (!entry) return <>{label}</>;

  return (
    <span
      className="term"
      tabIndex={0}
      role="button"
      aria-describedby={open ? tipId : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
    >
      {label}
      {open && (
        <span className="term-tip" role="tooltip" id={tipId}>
          <span className="term-tip-name">{entry.term}</span>
          {t(entry.def)}
        </span>
      )}
    </span>
  );
}
