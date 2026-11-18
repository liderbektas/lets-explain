import { currentBranch, firstParents, headId, resolve, short, type Repo } from "../../engine/git";
import { changedIn } from "../shared/missionHelpers";

/**
 * What `git show --stat` or `git log --oneline` would print for this repo, drawn as a small
 * terminal next to the graph. The text follows Git's real output format, so the reader
 * recognises it in their own terminal.
 */

export type CardMode = { kind: "show"; rev: string; note?: string } | { kind: "log" };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Git's default date format, in UTC: "Tue Nov 14 22:13:20 2023 +0000". */
export function gitDate(time: number): string {
  const d = new Date(time * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${d.getUTCFullYear()} +0000`;
}

/** The "(HEAD -> main, tag)" decoration Git prints after an id. */
function decoration(repo: Repo, id: string): string {
  const names: string[] = [];
  const branch = currentBranch(repo);
  for (const [name, at] of Object.entries(repo.branches)) {
    if (at !== id) continue;
    names.push(name === branch ? `HEAD -> ${name}` : name);
  }
  if (!branch && headId(repo) === id) names.unshift("HEAD");
  for (const [name, at] of Object.entries(repo.tags)) if (at === id) names.push(`tag: ${name}`);
  return names.length ? ` (${names.join(", ")})` : "";
}

export function cardLines(repo: Repo, mode: CardMode): { text: string; tone?: "id" | "dim" | "add" | "head" | "cmd" }[] {
  if (mode.kind === "log") {
    const ids = firstParents(repo, headId(repo)).slice(0, 9);
    return [
      { text: "$ git log --oneline", tone: "cmd" },
      ...ids.map((id) => ({ text: `${short(id)}${decoration(repo, id)} ${repo.commits[id]!.message.split("\n")[0]}`, tone: "id" as const })),
    ];
  }
  const id = resolve(repo, mode.rev);
  if (!id) return [{ text: `$ git show ${mode.rev}`, tone: "cmd" }, { text: "fatal: bad revision", tone: "dim" }];
  const c = repo.commits[id]!;
  const parent = c.parents[0] ? repo.commits[c.parents[0]]!.files : {};
  const stat = changedIn(repo, id).map((p) => {
    const was = parent[p];
    const now = c.files[p];
    const sign = was === undefined ? "1 +" : now === undefined ? "1 -" : "2 +-";
    return { text: ` ${p} | ${sign}`, tone: "add" as const };
  });
  return [
    { text: `$ git show --stat ${mode.rev}`, tone: "cmd" },
    { text: `commit${decoration(repo, id)}`, tone: "head" },
    { text: id, tone: "id" },
    ...c.parents.map((p) => ({ text: `parent ${short(p)}`, tone: "dim" as const })),
    { text: `Author: ${c.author}` },
    { text: `Date:   ${gitDate(c.time)}` },
    { text: "" },
    { text: `    ${c.message.split("\n")[0]}` },
    { text: "" },
    ...stat,
    ...(mode.note ? [{ text: mode.note, tone: "dim" as const }] : []),
  ];
}

export function CommitCard({ repo, mode, x, y, w, h }: { repo: Repo; mode: CardMode; x: number; y: number; w: number; h: number }) {
  const lines = cardLines(repo, mode);
  const size = 10.8;
  const max = Math.floor((w - 24) / (size * 0.6));
  return (
    <g className="commit-card">
      <rect x={x} y={y + 4} width={w} height={h} rx={16} style={{ fill: "var(--ink)" }} />
      <rect x={x} y={y} width={w} height={h} rx={16} style={{ fill: "#2b2a33", stroke: "var(--ink)", strokeWidth: 2 }} />
      <rect x={x} y={y} width={w} height={26} rx={16} style={{ fill: "#3a3943" }} />
      <rect x={x} y={y + 14} width={w} height={12} style={{ fill: "#3a3943" }} />
      {["var(--coral)", "var(--sun)", "var(--mint)"].map((fill, i) => (
        <circle key={fill} cx={x + 16 + i * 13} cy={y + 13} r={4.5} style={{ fill }} />
      ))}
      <text x={x + 62} y={y + 17.5} style={{ fill: "#f4efe6", fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800 }}>
        terminal
      </text>
      {lines.map((line, i) => (
        <text
          key={i}
          x={x + 12}
          y={y + 46 + i * 17}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: size,
            fontWeight: line.tone === "cmd" || line.tone === "head" ? 800 : 600,
            fill:
              line.tone === "cmd"
                ? "var(--mint)"
                : line.tone === "head"
                  ? "var(--sun)"
                  : line.tone === "id"
                    ? "#ffd3a5"
                    : line.tone === "dim"
                      ? "#a9a2b3"
                      : line.tone === "add"
                        ? "var(--mint)"
                        : "#f4efe6",
            whiteSpace: "pre",
          }}
        >
          {line.text.length > max ? `${line.text.slice(0, max - 1)}…` : line.text}
        </text>
      ))}
    </g>
  );
}
