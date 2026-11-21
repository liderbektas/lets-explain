import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

function parse(text: string, terms = true): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("[[") && part.endsWith("]]")) {
      const [id, shown] = part.slice(2, -2).split("|");
      return terms ? <Term key={i} id={id!} shown={shown} /> : (shown ?? id);
    }
    return part;
  });
}

/** Space kept between the tip and the screen's edges, and between the tip and the word. */
const EDGE = 12;
const GAP = 10;

function Term({ id, shown }: { id: string; shown?: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const word = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const tipId = useId();
  const entry = useCourseOrNull()?.glossary[id];

  // The tip lives on <body> so no scrolling or clipped box around the word can cut it off.
  // It sits above the word, flips below when there is no room, and never leaves the screen.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const w = word.current?.getBoundingClientRect();
      const box = tip.current?.getBoundingClientRect();
      if (!w || !box) return;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const left = Math.min(Math.max(EDGE, w.left + w.width / 2 - box.width / 2), vw - EDGE - box.width);
      const above = w.top - GAP - box.height;
      const top = above >= EDGE || w.bottom + GAP + box.height > vh - EDGE ? Math.max(EDGE, above) : w.bottom + GAP;
      setStyle({ left, top });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Terms read as ordinary words mid-sentence: "offset", not "Offset".
  const label = shown ?? (entry ? entry.term.charAt(0).toLowerCase() + entry.term.slice(1) : id);
  if (!entry) return <>{label}</>;

  const show = () => setOpen(true);
  const hide = () => {
    setOpen(false);
    setStyle({ visibility: "hidden" });
  };

  return (
    <span
      ref={word}
      className="term"
      tabIndex={0}
      role="button"
      aria-describedby={open ? tipId : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={() => (open ? hide() : show())}
    >
      {label}
      {open &&
        createPortal(
          <span ref={tip} className="term-tip" role="tooltip" id={tipId} style={style}>
            <span className="term-tip-name">{entry.term}</span>
            {parse(t(entry.def), false)}
          </span>,
          document.body,
        )}
    </span>
  );
}
