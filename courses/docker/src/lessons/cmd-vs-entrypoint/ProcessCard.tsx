import { motion } from "motion/react";
import type { Container, Host } from "../../engine/docker";
import { printed, runLineOf, specFor } from "./model";

type Origin = "entrypoint" | "cmd" | "typed";

/**
 * Where each part of PID 1's command line came from, the way Docker puts it together:
 * ENTRYPOINT first, then either the words typed after the image name or, if none, the CMD.
 * `--entrypoint` replaces ENTRYPOINT and drops CMD, so then everything was typed.
 */
export function partsOf(c: Container, host?: Host): { words: string[]; origin: Origin }[] {
  const img = specFor(c, host);
  if (!img) return [{ words: c.cmd, origin: "cmd" }];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const ep = img.entrypoint;
  const keepsEntry = ep.length > 0 && same(c.cmd.slice(0, ep.length), ep);
  const head = keepsEntry ? [{ words: ep, origin: "entrypoint" as const }] : [];
  const rest = keepsEntry ? c.cmd.slice(ep.length) : c.cmd;
  if (!rest.length) return head;
  // Without ENTRYPOINT kept, a command equal to CMD came from the image; anything else was typed.
  const fromImage = same(rest, img.cmd) && (keepsEntry || ep.length === 0);
  return [...head, { words: rest, origin: fromImage ? "cmd" : "typed" }];
}

const ORIGIN_FILL: Record<Origin, string> = { entrypoint: "var(--sun)", cmd: "var(--sky-soft)", typed: "var(--tangerine-soft)" };

/**
 * Three pieces side by side: the image's Dockerfile, the `docker run` line typed, and what
 * actually ran as PID 1 with its output and exit code.
 */

export interface CardLabels {
  dockerfile: string;
  typed: string;
  pid1: string;
  output: string;
  exit: string;
  none: string;
}

const mono = { fontFamily: "var(--font-mono)", fontWeight: 700 } as const;

export function ProcessCard({ host, c, x, y, w, labels, compact }: { host: Host; c: Container | undefined; x: number; y: number; w: number; labels: CardLabels; compact?: boolean }) {
  if (!c) {
    return (
      <text x={x + w / 2} y={y + 120} textAnchor="middle" style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, fill: "var(--ink-3)" }}>
        {labels.none}
      </text>
    );
  }
  const img = specFor(c, host);
  const lines = img?.lines ?? [];
  const run = runLineOf(c, host);
  const out = printed(c);
  const code = c.exitCode;
  const ok = c.state === "running" || code === 0;
  const fit = (s: string, px: number) => {
    const n = Math.floor(px / 7.3);
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  };
  const h1 = compact ? 92 : 108;
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* Dockerfile */}
      <rect y={4} width={w} height={h1} rx={14} style={{ fill: "var(--ink)" }} />
      <rect width={w} height={h1} rx={14} style={{ fill: "#2b2a33", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={14} y={24} style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, fill: "#cfc8d6" }}>
        {labels.dockerfile} · {c.ref}
      </text>
      {lines.map((line, i) => (
        <text key={i} x={14} y={48 + i * 20} xmlSpace="preserve" style={{ ...mono, fontSize: 12.5, fill: /^(CMD|ENTRYPOINT)/.test(line) ? "var(--sun)" : "#f4efe6" }}>
          {fit(line, w - 28)}
        </text>
      ))}

      {/* What was typed */}
      <g transform={`translate(0 ${h1 + 18})`}>
        <text x={2} y={0} style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, fill: "var(--ink-2)" }}>
          {labels.typed}
        </text>
        <rect y={8} width={w} height={34} rx={10} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2 }} />
        <text x={12} y={30} xmlSpace="preserve" style={{ ...mono, fontSize: 12.5, fill: "var(--ink)" }}>
          <tspan style={{ fill: "var(--green)" }}>$ </tspan>
          {fit(run, w - 40)}
        </text>
      </g>

      {/* What ran */}
      <g transform={`translate(0 ${h1 + 76})`}>
        <text x={2} y={0} style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, fill: "var(--ink-2)" }}>
          {labels.pid1}
        </text>
        <rect y={8} width={w} height={compact ? 96 : 112} rx={12} style={{ fill: ok ? "var(--mint-soft)" : "var(--red-soft)", stroke: "var(--ink)", strokeWidth: 2 }} />
        <Assembled key={c.id} c={c} host={host} lines={lines} w={w} h1={h1} fit={fit} />
        <text x={12} y={66} style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, fill: "var(--ink-2)" }}>
          {labels.output}
        </text>
        <text x={12} y={84} xmlSpace="preserve" style={{ ...mono, fontSize: 12.5, fill: ok ? "var(--ink)" : "#c33a33" }}>
          {fit(out.join(" · ") || "—", w - 24)}
        </text>
        <g transform={`translate(${w - 12} ${compact ? 92 : 104})`}>
          <rect x={-118} y={-16} width={118} height={22} rx={11} style={{ fill: c.state === "running" ? "var(--mint)" : code === 0 ? "var(--card)" : "var(--coral)", stroke: "var(--ink)", strokeWidth: 2 }} />
          <text x={-59} y={-1} textAnchor="middle" style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, fill: "var(--ink)" }}>
            {c.state === "running" ? "running" : `${labels.exit} ${code}`}
          </text>
        </g>
      </g>
    </g>
  );
}

/**
 * PID 1's command line as pieces, each flying in from where it came from: the ENTRYPOINT
 * or CMD line of the Dockerfile above, or the line typed after the image name.
 */
function Assembled({ c, host, lines, w, h1, fit }: { c: Container; host: Host; lines: string[]; w: number; h1: number; fit: (s: string, px: number) => string }) {
  const parts = partsOf(c, host).map((p) => ({ ...p, text: p.words.map((x) => (x.includes(" ") ? `"${x}"` : x)).join(" ") }));
  const width = (t: string) => t.length * 7.8 + 14;
  const total = parts.reduce((sum, p) => sum + width(p.text) + 6, 0);
  // Too long to show as pieces: just the line, as before.
  if (total > w - 24) {
    return (
      <text x={12} y={32} xmlSpace="preserve" style={{ ...mono, fontSize: 13, fill: "var(--ink)" }}>
        {fit(c.cmd.map((p) => (p.includes(" ") ? `"${p}"` : p)).join(" "), w - 24)}
      </text>
    );
  }
  // Card-relative y of each source, measured from this row (which sits at h1 + 76 + 32).
  const row = h1 + 76 + 32;
  const lineY = (re: RegExp) => {
    const i = lines.findIndex((x) => re.test(x));
    return i < 0 ? row : 48 + i * 20;
  };
  const from: Record<Origin, number> = { entrypoint: lineY(/^ENTRYPOINT/), cmd: lineY(/^CMD/), typed: h1 + 18 + 30 };
  let x = 12;
  return (
    <g>
      {parts.map((p, i) => {
        const at = x;
        x += width(p.text) + 6;
        return (
          <motion.g key={i} initial={{ x: at, y: from[p.origin] - row + 22, opacity: 0 }} animate={{ x: at, y: 22, opacity: 1 }} transition={{ type: "spring", stiffness: 150, damping: 20, delay: 0.15 + i * 0.25 }}>
            <rect y={-6} width={width(p.text)} height={22} rx={7} style={{ fill: ORIGIN_FILL[p.origin], stroke: "var(--ink)", strokeWidth: 1.5 }} />
            <text x={7} y={10} xmlSpace="preserve" style={{ ...mono, fontSize: 13, fill: "var(--ink)" }}>
              {p.text}
            </text>
          </motion.g>
        );
      })}
    </g>
  );
}
