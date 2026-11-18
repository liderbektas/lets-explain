import type { ComponentType, ReactNode } from "react";
import type { L } from "@lets-explain/core/i18n";

export type CalloutKind = "insight" | "reality" | "analogy" | "warning";

/** What kind of moment a step is; shown as a small label on the step. */
export type StepTag = "problem" | "idea" | "how" | "experiment" | "reality" | "yourTurn";

export interface Change {
  kind: "add" | "remove" | "change" | "bad" | "good";
  text: L;
}

export interface Step {
  /** Two or three words, shown on the step timeline. */
  short: L;
  tag: StepTag;
  title: L;
  /** Paragraphs in the small markup Rich understands: **bold**, `code`, [[term]] / [[term|shown text]]. */
  body: L[];
  callouts?: { kind: CalloutKind; text: L }[];
  /** "What changed" list. Lessons backed by the simulator compute this instead. */
  changes?: Change[];
  /**
   * Asked before the step plays: the reader guesses, then watches what really happens.
   * The step's text stays hidden until they answer, because it gives the answer away.
   */
  predict?: Prediction;
}

export interface Prediction {
  question: L;
  options: L[];
  answer: number;
  /** Why the right answer is right, shown after the guess. */
  why: L;
}

/** A goal in a lesson's try-it step, checked against the simulation after every move. */
export interface Mission<C> {
  id: string;
  title: L;
  goal: L;
  hint: L;
  /** Moves needed for three stars: the shortest solution. */
  par: number;
  check: (ctx: C) => boolean;
}

/** Stars for finishing a mission in `moves`: three at par, two a little over, one otherwise. */
export function starsFor(moves: number, par: number): number {
  if (moves <= par) return 3;
  if (moves <= par + 2) return 2;
  return 1;
}

export interface QuizQuestion {
  question: L;
  options: L[];
  answer: number;
  explain: L;
  /** Step index that teaches this, so a wrong answer can send the reader back. */
  reviewStep: number;
}

export interface SceneProps {
  step: number;
  paused: boolean;
  /** Changes whenever the reader presses "replay". */
  replayKey: number;
  /** Replay / pause buttons, for the scene to place in its top bar. */
  controls: ReactNode;
}

export interface Lesson {
  slug: string;
  title: L;
  summary: L;
  minutes: number;
  level: L;
  steps: Step[];
  Scene: ComponentType<SceneProps>;
  /** Ticked off as the reader reaches the given step. */
  objectives: { text: L; step: number }[];
  /** Computes the "what changed" list for a step when it is not written by hand. */
  changesFor?: (step: number) => Change[];
  recap: L[];
  quiz: QuizQuestion[];
  /** The try-it step's missions, listed so the recap can count stars. */
  missions?: { id: string; title: L }[];
}

export interface LessonEntry {
  slug: string;
  title: L;
  /** Absent while the lesson is not written yet. */
  lesson?: Lesson;
}

export interface Chapter {
  id: string;
  title: L;
  lessons: LessonEntry[];
}

/* ------------------------------------------------------------------ courses */

export interface GlossaryEntry {
  term: string;
  def: L;
}

/**
 * One technology's course. The site lists every course on its hub; everything a course
 * needs (lessons, glossary, home page art) comes through this object.
 */
export interface Course {
  /** URL segment and storage namespace, e.g. "kafka". */
  id: string;
  /** Product name as people write it, e.g. "Apache Kafka". Not translated. */
  name: string;
  /** One line for the hub card. */
  tagline: L;
  chapters: Chapter[];
  glossary: Record<string, GlossaryEntry>;
  home: {
    /** Hero title in three parts; the middle one gets the highlight. */
    title: [L, L, L];
    lead: L;
    /** A small looping scene for the hero. */
    Art: ComponentType;
  };
}
