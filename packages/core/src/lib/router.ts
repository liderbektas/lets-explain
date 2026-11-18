import { useEffect, useState } from "react";

/**
 * Hash routes, so the site works from any static host without rewrites:
 *   #/                              the hub: every course
 *   #/<course>                      a course's home
 *   #/<course>/<slug>/<step>        a lesson at a step (1-based in the URL)
 * Old single-course links (#/learn/<slug>/<step>) still open the Kafka course.
 */
export type Route =
  | { name: "hub" }
  | { name: "course"; course: string }
  | { name: "lesson"; course: string; slug: string; step: number }
  | { name: "notFound" };

const toStep = (raw: string | undefined) => {
  const n = Number(raw ?? "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) - 1 : 0;
};

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { name: "hub" };
  if (parts[0] === "learn" && parts[1]) return { name: "lesson", course: "kafka", slug: parts[1], step: toStep(parts[2]) };
  if (parts.length === 1) return { name: "course", course: parts[0]! };
  return { name: "lesson", course: parts[0]!, slug: parts[1]!, step: toStep(parts[2]) };
}

export const courseHref = (course: string) => `#/${course}`;
export const lessonHref = (course: string, slug: string, step = 0) => `#/${course}/${slug}/${step + 1}`;

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

/** Changes the step without adding a history entry per click. */
export function replaceHash(href: string) {
  if (window.location.hash === href) return;
  history.replaceState(null, "", href);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
