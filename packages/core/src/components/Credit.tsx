import { useEffect, useState } from "react";
import { l, useLang } from "../i18n";

export const GITHUB = "liderbektas";
export const GITHUB_URL = `https://github.com/${GITHUB}`;
export const REPO = `${GITHUB}/lets-explain`;
export const REPO_URL = `https://github.com/${REPO}`;

/** A small sticker at the foot of the hub and course pages: who made the site, and a star for the repo. */
export function Credit() {
  const { t } = useLang();
  const stars = useRepoStars();
  return (
    <footer className="credit-wrap">
      <a className="credit" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
        <span className="credit-icon" aria-hidden="true">
          <GitHubMark size={24} />
        </span>
        <span className="credit-text">
          <span className="credit-label">{t(l("hazırlayan", "made by"))}</span>
          <span className="credit-handle">@{GITHUB}</span>
        </span>
      </a>
      <a className="credit credit-star" href={REPO_URL} target="_blank" rel="noopener noreferrer">
        <span className="credit-icon credit-star-icon" aria-hidden="true">
          <StarMark size={26} />
        </span>
        <span className="credit-text">
          <span className="credit-label">{t(l("işine yaradıysa", "found it useful?"))}</span>
          <span className="credit-handle">
            {t(l("GitHub'da yıldızla", "Star it on GitHub"))}
            {stars !== null && stars > 0 && <span className="star-count"> · {stars}</span>}
          </span>
        </span>
      </a>
    </footer>
  );
}

/** A call to star the repo, under the hub hero: opens GitHub, with the star count once it has loaded. */
export function StarCta() {
  const { t } = useLang();
  const stars = useRepoStars();
  return (
    <a className="star-cta" href={REPO_URL} target="_blank" rel="noopener noreferrer">
      <StarMark size={22} />
      <span className="star-cta-text">{t(l("İşine yaradıysa GitHub'da bir yıldız bırak", "Found it useful? Leave a star on GitHub"))}</span>
      <span className="star-cta-go">
        <GitHubMark size={15} />
        {t(l("Yıldızla", "Star"))}
        {stars !== null && stars > 0 && <span className="star-cta-count">{stars}</span>}
      </span>
    </a>
  );
}

const STARS_KEY = "lets-explain:stars";
let pending: Promise<number | null> | null = null;

/** The repo's star count from GitHub's public API, asked once per visit; null until known or if it fails. */
function loadStars(): Promise<number | null> {
  if (pending) return pending;
  try {
    const cached = sessionStorage.getItem(STARS_KEY);
    if (cached !== null) return (pending = Promise.resolve(Number(cached)));
  } catch {
    // Storage may be blocked; just ask GitHub.
  }
  pending = fetch(`https://api.github.com/repos/${REPO}`, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((repo: { stargazers_count?: number } | null) => {
      const n = typeof repo?.stargazers_count === "number" ? repo.stargazers_count : null;
      if (n !== null) {
        try {
          sessionStorage.setItem(STARS_KEY, String(n));
        } catch {
          // Not cached; fine.
        }
      }
      return n;
    })
    .catch(() => null);
  return pending;
}

function useRepoStars(): number | null {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    loadStars().then((n) => live && setStars(n));
    return () => {
      live = false;
    };
  }, []);
  return stars;
}

export function StarMark({ size = 16 }: { size?: number }) {
  return (
    <svg className="star-mark" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M12 2.8l2.75 5.6 6.15.9-4.45 4.34 1.05 6.13L12 16.87l-5.5 2.9 1.05-6.13L3.1 9.3l6.15-.9L12 2.8z"
        fill="var(--sun)"
        stroke="var(--ink)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GitHubMark({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}
