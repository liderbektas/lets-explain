/**
 * What a course's command line hands to the shared terminal: lines to print, and when a
 * command opens an editor (`git commit` with no -m, `nano file`), what that editor shows.
 */

export type TermTone = "in" | "out" | "err" | "dim" | "add" | "del" | "hl";

export interface TermLine {
  text: string;
  tone: TermTone;
}

export const out = (text: string, tone: TermTone = "out"): TermLine => ({ text, tone });
export const lines = (text: string, tone: TermTone = "out"): TermLine[] => text.split("\n").map((t) => out(t, tone));

/** Splits a command line into words the way a shell does: quotes group, `>`, `>>`, `&&` and `;` stand alone. */
export function shellWords(line: string): string[] {
  const words: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  const push = () => {
    if (has) words.push(cur);
    cur = "";
    has = false;
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && (line[i + 1] === '"' || line[i + 1] === "\\")) cur += line[++i];
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) push();
    else if (ch === ">" || ch === ";" || (ch === "&" && line[i + 1] === "&")) {
      push();
      if (ch === ">" && line[i + 1] === ">") {
        words.push(">>");
        i++;
      } else if (ch === "&") {
        words.push("&&");
        i++;
      } else words.push(ch);
    } else {
      cur += ch;
      has = true;
    }
  }
  push();
  return words;
}

/** Splits words into commands at `&&` and `;`. */
export function splitCommands(words: string[]): string[][] {
  const cmds: string[][] = [[]];
  for (const w of words) {
    if (w === "&&" || w === ";") cmds.push([]);
    else cmds[cmds.length - 1]!.push(w);
  }
  return cmds.filter((c) => c.length > 0);
}

/** Completes the last word of `input` from `candidates`: the whole word when one fits, the shared prefix otherwise. */
export function complete(input: string, candidates: string[]): { input: string; options: string[] } {
  const at = input.search(/\S*$/);
  const word = input.slice(at);
  const hits = [...new Set(candidates.filter((c) => c.startsWith(word)))].sort();
  if (hits.length === 0) return { input, options: [] };
  if (hits.length === 1) return { input: input.slice(0, at) + hits[0] + " ", options: [] };
  let common = hits[0]!;
  for (const h of hits) while (!h.startsWith(common)) common = common.slice(0, -1);
  return { input: input.slice(0, at) + common, options: common.length > word.length ? [] : hits };
}
