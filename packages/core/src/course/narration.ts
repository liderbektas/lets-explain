import type { Lang } from "../i18n";

/**
 * A lesson told aloud, like a teacher at the board: it does not read the notes on the left, it
 * explains the same thing in spoken words while the scene plays.
 *
 * Every line becomes one audio clip. Clips are named by a hash of the voice and the text, so
 * changing a line only regenerates that line.
 */

/** The voice every lesson is told in: an ElevenLabs voice and model. Changing either renames every clip. */
export const NARRATOR = { name: "Enes", voice: "W3uaElFBxHYNIC54Z4ty", model: "eleven_v4" } as const;

type Respell = string | ((match: string, ...groups: string[]) => string);

/** Letters as they are said in Turkish, for flags like -p ("tire pe"). */
const TR_LETTER: Record<string, string> = {
  a: "a", b: "be", c: "ce", d: "de", e: "e", f: "fe", g: "ge", h: "he", i: "i", j: "je", k: "ke", l: "le", m: "me",
  n: "ne", o: "o", p: "pe", q: "kü", r: "re", s: "se", t: "te", u: "u", v: "ve", w: "dabılyu", x: "iks", y: "ye", z: "ze",
};
const trLetters = (letters: string) =>
  [...letters].map((ch) => (ch === ch.toUpperCase() ? "büyük " : "") + (TR_LETTER[ch.toLowerCase()] ?? ch)).join(" ");

/**
 * How written tokens are said aloud. Only the audio uses this; the caption keeps the real spelling.
 * Rules run in order. Changing a rule renames (and regenerates) only the clips whose text it changes.
 */
export const PRONOUNCE: Partial<Record<Lang, [RegExp, Respell][]>> = {
  tr: [
    // Long flags first: --mount → "tire tire mount".
    [/(^|[\s(])--([a-z][a-z-]*)/g, (_m, pre, name) => `${pre}tire tire ${name}`],
    // Short flags: -p → "tire pe", -it → "tire i te".
    [/(^|[\s(])-([a-zA-Z]{1,2})(?=$|[\s,.;:!?)])/g, (_m, pre, letters) => `${pre}tire ${trLetters(letters)}`],
    // Port mappings: 8080:80 → "8080 iki nokta 80"; every colon between digits, so 127.0.0.1:8080:80 too.
    [/(?<=\d):(?=\d)/g, " iki nokta "],
    // Image tags and hosts: node:22 → "node 22", localhost:8080 → "localhost 8080".
    [/\b([a-z][a-z0-9.-]*):(\d[\w.-]*)/g, "$1 $2"],
    // Names with underscores: DATABASE_URL → "DATABASE URL".
    [/(?<=[A-Za-z0-9])_(?=[A-Za-z0-9])/g, " "],
    // Paths and image names: acme/greet → "acme slash greet".
    [/\bdev\/prod\b/g, "dev ve prod"],
    [/([a-z0-9])\/(?=[a-z])/g, "$1 slash "],
  ],
};

/** The text actually sent to the voice. */
export function spoken(text: string, lang: Lang): string {
  let out = text;
  for (const [from, to] of PRONOUNCE[lang] ?? []) out = typeof to === "string" ? out.replace(from, to) : out.replace(from, to);
  return out;
}

/** A short, stable name for a clip: the same voice, model, language and words give the same name. */
export function clipName(text: string, lang: Lang): string {
  const key = `${NARRATOR.voice}|${NARRATOR.model}|${lang}|${spoken(text, lang)}`;
  // cyrb53: a fast 53-bit string hash, the same in the browser and in Node.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Where a lesson's clips live, under the site's public folder. */
export const clipDir = (course: string, lesson: string, lang: Lang) => `audio/narration/${course}/${lesson}/${lang}`;

/** Every line of a narration that needs a clip, with no repeats. */
export function allLines(steps: StepNarration[]): string[] {
  const out = new Set<string>();
  for (const s of steps) {
    for (const x of s.lines) out.add(x.say);
    if (s.answer) {
      out.add(s.answer.right);
      out.add(s.answer.wrong);
      for (const x of s.answer.lines) out.add(x.say);
    }
  }
  return [...out];
}

/** Roughly how long a lesson takes to listen to, from its words (about 140 spoken words a minute). */
export function listenMinutes(steps: StepNarration[]): number {
  const words = steps
    .flatMap((s) => [...s.lines, ...(s.answer?.lines ?? [])])
    .reduce((n, x) => n + x.say.split(/\s+/).filter(Boolean).length, 0);
  return Math.max(1, Math.round(words / 140));
}

/** One or two spoken sentences. */
export interface NarrationLine {
  say: string;
  /**
   * Starts this scene action (0-based, within the step) as the line begins. The scene waits for
   * the line, so what is said and what moves stay together. On a step with actions, every action
   * is cued once, in order.
   */
  cue?: number;
}

export interface StepNarration {
  /** Spoken first. On a step with a prediction it ends with the question, and the narrator waits. */
  lines: NarrationLine[];
  /** Prediction steps only: said after the learner picks an answer, then the scene plays. */
  answer?: {
    right: string;
    wrong: string;
    lines: NarrationLine[];
  };
}

/** One entry per lesson step, per language that has narration. */
export type LessonNarration = Partial<Record<Lang, StepNarration[]>>;

/**
 * What is wrong with a narration against its lesson: step counts, predictions without an answer
 * part (or the other way round), and cues that skip, repeat or point past a step's actions.
 */
export function narrationProblems(
  narration: LessonNarration,
  steps: { predict?: unknown }[],
  actionsPerStep: number[],
): string[] {
  const out: string[] = [];
  for (const [lang, list] of Object.entries(narration)) {
    if (!list) continue;
    if (list.length !== steps.length) out.push(`${lang}: ${list.length} narrated steps for ${steps.length} lesson steps`);
    list.forEach((step, i) => {
      const where = `${lang} step ${i}`;
      if (!!steps[i]?.predict !== !!step.answer) out.push(`${where}: a prediction needs an answer part, and only a prediction has one`);
      const cues = [...step.lines, ...(step.answer?.lines ?? [])].flatMap((x) => (x.cue === undefined ? [] : [x.cue]));
      const want = Array.from({ length: actionsPerStep[i] ?? 0 }, (_, k) => k);
      if (cues.join() !== want.join()) out.push(`${where}: cues ${JSON.stringify(cues)}, expected ${JSON.stringify(want)}`);
      if (step.answer && step.lines.some((x) => x.cue !== undefined)) out.push(`${where}: nothing may move before the answer`);
    });
  }
  return out;
}
