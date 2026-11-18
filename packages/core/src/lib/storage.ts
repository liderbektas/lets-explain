import { useCallback, useEffect, useState } from "react";
import { useCourse } from "../course/context";

/** localStorage that never throws: private windows and blocked storage just forget. */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export interface Progress {
  /** Furthest step reached per lesson. */
  reached: Record<string, number>;
  done: Record<string, boolean>;
}

const EMPTY_PROGRESS: Progress = { reached: {}, done: {} };
const listeners = new Map<string, Set<() => void>>();
const listenersFor = (key: string) => {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  return set;
};

/** A JSON value in localStorage that every component using the same key sees change together. */
function usePersisted<T>(key: string, empty: T) {
  const [value, setValue] = useState<T>(() => readJSON(key, empty));

  useEffect(() => {
    const sync = () => setValue(readJSON(key, empty));
    const set = listenersFor(key);
    set.add(sync);
    return () => {
      set.delete(sync);
    };
  }, [key, empty]);

  const update = useCallback(
    (fn: (v: T) => T) => {
      const prev = readJSON(key, empty);
      const next = fn(prev);
      if (next === prev) return;
      writeJSON(key, next);
      listenersFor(key).forEach((l) => l());
    },
    [key, empty],
  );

  return [value, update] as const;
}

/** Storage keys are namespaced per course, so two courses can both have a lesson called "replication". */
const keyFor = (course: string, what: "progress" | "game") => `lets-explain:${course}:${what}`;

/**
 * The site used to be Kafka only, with unprefixed keys. Copy those over once so a returning
 * reader keeps their progress, guesses and stars.
 */
export function migrateLegacyStorage() {
  const moves: [string, string][] = [
    ["ek-progress", keyFor("kafka", "progress")],
    ["ek-game", keyFor("kafka", "game")],
    ["ek-lang", "lets-explain:lang"],
    ["lets-explain:theme", "lets-explain:theme"],
  ];
  try {
    for (const [from, to] of moves) {
      const old = localStorage.getItem(from);
      if (old !== null && localStorage.getItem(to) === null) localStorage.setItem(to, old);
      localStorage.removeItem(from);
    }
  } catch {
    /* storage unavailable */
  }
}

export function useProgress() {
  const [progress, update] = usePersisted(keyFor(useCourse().id, "progress"), EMPTY_PROGRESS);

  const markReached = useCallback(
    (slug: string, step: number) =>
      update((p) =>
        (p.reached[slug] ?? -1) >= step ? p : { ...p, reached: { ...p.reached, [slug]: step } },
      ),
    [update],
  );

  const markDone = useCallback(
    (slug: string) => update((p) => (p.done[slug] ? p : { ...p, done: { ...p.done, [slug]: true } })),
    [update],
  );

  return { progress, markReached, markDone };
}

/**
 * Which step a lesson link should open at: the start for a finished lesson,
 * otherwise where the reader stopped (never the recap, which only follows the last step).
 */
export function resumeStep(progress: Progress, slug: string, stepCount: number): number {
  if (progress.done[slug]) return 0;
  return Math.min(progress.reached[slug] ?? 0, Math.max(stepCount - 1, 0));
}

export interface GameProgress {
  /** slug → step → the option the reader guessed. */
  predictions: Record<string, Record<number, number>>;
  /** slug → mission id → best stars earned. */
  missions: Record<string, Record<string, number>>;
}

const EMPTY_GAME: GameProgress = { predictions: {}, missions: {} };

export function useGame() {
  const [game, update] = usePersisted(keyFor(useCourse().id, "game"), EMPTY_GAME);

  const setPrediction = useCallback(
    (slug: string, step: number, picked: number) =>
      update((g) => ({ ...g, predictions: { ...g.predictions, [slug]: { ...g.predictions[slug], [step]: picked } } })),
    [update],
  );

  const forgetPrediction = useCallback(
    (slug: string, step: number) =>
      update((g) => {
        const { [step]: _, ...rest } = g.predictions[slug] ?? {};
        return { ...g, predictions: { ...g.predictions, [slug]: rest } };
      }),
    [update],
  );

  /** Keeps the best result: replaying a mission never takes stars away. */
  const setMissionStars = useCallback(
    (slug: string, id: string, stars: number) =>
      update((g) =>
        (g.missions[slug]?.[id] ?? 0) >= stars
          ? g
          : { ...g, missions: { ...g.missions, [slug]: { ...g.missions[slug], [id]: stars } } },
      ),
    [update],
  );

  return { game, setPrediction, forgetPrediction, setMissionStars };
}

export type ThemeChoice = "system" | "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    try {
      const t = localStorage.getItem("lets-explain:theme");
      return t === "light" || t === "dark" ? t : "system";
    } catch {
      return "system";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      if (theme === "system") localStorage.removeItem("lets-explain:theme");
      else localStorage.setItem("lets-explain:theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  return { theme, setTheme };
}
