import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLang, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { GITHUB, GITHUB_URL, GitHubMark } from "@lets-explain/core/components/Credit";
import { Icon } from "@lets-explain/core/components/Icon";
import { courseHref, hubHref } from "@lets-explain/core/lib/router";

interface Props {
  /** The course being viewed; absent on the hub. */
  course?: { id: string; name: string };
  /** Opens the lesson list; only inside a course. */
  onMenu?: () => void;
}

export function TopBar({ course, onMenu }: Props) {
  const { t } = useLang();

  return (
    <header className={`topbar ${course ? "has-course" : ""}`}>
      <a className="brand" href={hubHref}>
        <BrandMark />
        <span>Let's explain</span>
      </a>
      <span className="beta-chip" title={t(ui.betaNote)}>
        {t(ui.beta)}
      </span>
      {course && (
        <a className="course-chip" href={courseHref(course.id)}>
          {course.name}
        </a>
      )}
      <div className="topbar-actions">
        {onMenu && (
          <button className="btn btn-small" onClick={onMenu}>
            <Icon name="list" size={17} />
            <span className="hide-sm">{t(ui.lessonsMenu)}</span>
          </button>
        )}
        <a className="gh-chip" href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label={`GitHub: @${GITHUB}`}>
          <span className="gh-chip-icon">
            <GitHubMark size={16} />
          </span>
          <span className="gh-chip-handle">@{GITHUB}</span>
        </a>
        <LangMenu />
      </div>
    </header>
  );
}

const LANGS: { code: Lang; name: string }[] = [
  { code: "tr", name: "Türkçe" },
  { code: "en", name: "English" },
];

/** The language picker: a button showing the current language that opens a short menu. */
function LangMenu() {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  // Close on a click outside or Escape; when it opens, focus the language in use.
  useEffect(() => {
    if (!open) return;
    items.current[LANGS.findIndex((x) => x.code === lang)]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, lang]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const at = items.current.findIndex((el) => el === document.activeElement);
      const next = (at + (e.key === "ArrowDown" ? 1 : -1) + LANGS.length) % LANGS.length;
      items.current[next]?.focus();
    }
  };

  const pick = (code: Lang) => {
    setLang(code);
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div className="lang-menu" ref={root} onKeyDown={onKey}>
      <button
        ref={trigger}
        className="lang-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t(ui.language)}: ${LANGS.find((x) => x.code === lang)?.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="globe" size={17} />
        <span>{lang.toUpperCase()}</span>
        <Icon name="down" size={15} />
      </button>
      {open && (
        <ul className="lang-list" role="menu" aria-label={t(ui.language)}>
          {LANGS.map((x, i) => (
            <li key={x.code} role="none">
              <button
                ref={(el) => {
                  items.current[i] = el;
                }}
                role="menuitemradio"
                aria-checked={lang === x.code}
                onClick={() => pick(x.code)}
              >
                <span className="lang-code">{x.code.toUpperCase()}</span>
                {x.name}
                {lang === x.code && <Icon name="check" size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Three little parcels on a belt. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 34 34" aria-hidden="true">
      <g stroke="#2b2a33" strokeWidth="1.8" strokeLinejoin="round">
        <polygon points="3,22 17,29 31,22 17,15" fill="#ece2cf" />
        <polygon points="3,22 17,29 17,32 3,25" fill="#d9caae" />
        <polygon points="17,29 31,22 31,25 17,32" fill="#c7b593" />
        <polygon points="9,13 14,15.5 14,21.5 9,19" fill="#7fd3b5" />
        <polygon points="14,15.5 19,13 19,19 14,21.5" fill="#4fb08c" />
        <polygon points="9,13 14,10.5 19,13 14,15.5" fill="#a8e6cf" />
        <polygon points="16,9 21,11.5 21,17.5 16,15" fill="#ffb38f" />
        <polygon points="21,11.5 26,9 26,15 21,17.5" fill="#f08a5d" />
        <polygon points="16,9 21,6.5 26,9 21,11.5" fill="#ffd0b8" />
      </g>
    </svg>
  );
}
