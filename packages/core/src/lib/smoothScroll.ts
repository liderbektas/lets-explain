import Lenis from "lenis";

/**
 * Smooth, eased scrolling for the page (wheel and touchpad), through Lenis. People who ask
 * their system for less motion keep the browser's own scrolling. Inner scroll areas (the
 * terminal, the lesson drawer, a text editor) scroll natively.
 */

let lenis: Lenis | null = null;

/** Height of the sticky top bar, so a jump to a section leaves its heading in view. */
const topbarOffset = () => (document.querySelector(".topbar")?.getBoundingClientRect().height ?? 64) + 28;

export function startSmoothScroll() {
  if (lenis || typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  lenis = new Lenis({
    autoRaf: true,
    lerp: 0.1,
    allowNestedScroll: true,
    prevent: (node) => Boolean(node.closest?.("textarea, .terminal-screen, .drawer, .speech-body, .events, [data-lenis-prevent]")),
  });
}

/** Jumps to the top at once: a new page opens there. */
export function jumpToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo({ top: 0, behavior: "instant" });
}

/** Glides to the top of the page. */
export function glideToTop() {
  if (lenis) lenis.scrollTo(0);
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Glides to a section, stopping with its heading below the top bar. */
export function glideTo(el: HTMLElement | null) {
  if (!el) return;
  const heading = el.querySelector<HTMLElement>("h1, h2, h3") ?? el;
  if (lenis) lenis.scrollTo(heading, { offset: -topbarOffset() });
  else el.scrollIntoView({ behavior: "smooth" });
}
