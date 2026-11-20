import { useEffect, useLayoutEffect, useState } from "react";
import { jumpToTop } from "./smoothScroll";

/**
 * Path routes:
 *   /                              the hub: every course
 *   /<course>                      a course's home
 *   /<course>/<slug>/<step>        a lesson at a step (1-based in the URL)
 * The host has to serve index.html for unknown paths (the build writes a 404.html copy for that).
 * Old hash links (#/<course>/..., and the Kafka-only #/learn/<slug>/<step>) still open, and the
 * app rewrites them to the path form.
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

/** Reads a route from a path, or from an old `#/...` hash when there is one. */
export function parseLocation(pathname: string, hash = ""): Route {
  const source = hash.startsWith("#/") ? hash.slice(2) : pathname;
  const parts = source.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { name: "hub" };
  if (parts[0] === "learn" && parts[1]) return { name: "lesson", course: "kafka", slug: parts[1], step: toStep(parts[2]) };
  if (parts.length === 1) return { name: "course", course: parts[0]! };
  return { name: "lesson", course: parts[0]!, slug: parts[1]!, step: toStep(parts[2]) };
}

export const hubHref = "/";
export const courseHref = (course: string) => `/${course}`;
export const lessonHref = (course: string, slug: string, step = 0) => `/${course}/${slug}/${step + 1}`;

/** The current URL is an old hash link or `/learn/...`: it should be rewritten to `href`. */
export function canonicalHref(route: Route, pathname: string, hash: string): string | null {
  const legacy = hash.startsWith("#/") || pathname.startsWith("/learn/");
  if (!legacy) return null;
  if (route.name === "hub") return hubHref;
  if (route.name === "course") return courseHref(route.course);
  if (route.name === "lesson") return lessonHref(route.course, route.slug, route.step);
  return null;
}

const CHANGE = "lets-explain:navigate";
const current = () => parseLocation(window.location.pathname, window.location.hash);

/** Set by navigate; the router scrolls to the top once the new page is in the DOM, before it paints. */
let scrollPending = false;

/** Opens a page: a new history entry, starting at the top of the page. */
export function navigate(href: string) {
  if (href !== window.location.pathname + window.location.hash) history.pushState(null, "", href);
  // Scrolling here, before React renders, would show the old page's top for a frame.
  scrollPending = true;
  window.dispatchEvent(new Event(CHANGE));
}

/** Changes the URL without a history entry or a scroll, e.g. per lesson step. */
export function replaceRoute(href: string) {
  if (window.location.pathname === href && !window.location.hash) return;
  history.replaceState(null, "", href);
  window.dispatchEvent(new Event(CHANGE));
}

/** A click on a plain in-site link: handled here instead of reloading the page. */
function onLinkClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.("a");
  if (!a || a.target || a.hasAttribute("download")) return;
  const raw = a.getAttribute("href");
  if (!raw || raw.startsWith("#")) return;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  e.preventDefault();
  navigate(url.pathname + url.hash);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const onChange = () => setRoute(current());
    window.addEventListener(CHANGE, onChange);
    window.addEventListener("popstate", onChange);
    document.addEventListener("click", onLinkClick);
    return () => {
      window.removeEventListener(CHANGE, onChange);
      window.removeEventListener("popstate", onChange);
      document.removeEventListener("click", onLinkClick);
    };
  }, []);
  useLayoutEffect(() => {
    if (!scrollPending) return;
    scrollPending = false;
    jumpToTop();
  }, [route]);
  return route;
}
