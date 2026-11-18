import { useLang, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { Icon } from "@lets-explain/core/components/Icon";
import { courseHref } from "@lets-explain/core/lib/router";

interface Props {
  /** The course being viewed; absent on the hub. */
  course?: { id: string; name: string };
  /** Opens the lesson list; only inside a course. */
  onMenu?: () => void;
}

export function TopBar({ course, onMenu }: Props) {
  const { lang, setLang, t } = useLang();

  return (
    <header className="topbar">
      <a className="brand" href="#/">
        <BrandMark />
        <span>Let's explain</span>
      </a>
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
        <div className="lang-switch" role="group" aria-label={t(ui.language)}>
          {(["tr", "en"] as Lang[]).map((code) => (
            <button key={code} aria-pressed={lang === code} onClick={() => setLang(code)}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
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
