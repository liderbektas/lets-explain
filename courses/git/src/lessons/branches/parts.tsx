import type { LegendItem } from "@lets-explain/core/components/SceneFrame";
import { l, type L } from "@lets-explain/core/i18n";
import { status, type Repo } from "../../engine/git";

/**
 * Small pieces shared by the Git lessons: the metro map's legend and a strip that lists
 * uncommitted changes, which the commit graph alone cannot show.
 */

/** A station (a commit) as a legend swatch. */
export const stationSwatch = (top = "#ffe48f", band = "#f2bd3a", ghost = false) => (
  <g transform="translate(0 3)" style={{ stroke: ghost ? "var(--ink-3)" : "var(--ink)", strokeWidth: 1.5, strokeDasharray: ghost ? "2 2" : undefined }}>
    <path d="M-10 -4 L-10 0 A10 5 0 0 0 10 0 L10 -4 Z" style={{ fill: "var(--card)" }} />
    <path d="M-10 -1.5 A10 5 0 0 0 10 -1.5 L10 0 A10 5 0 0 1 -10 0 Z" style={{ fill: band }} />
    <ellipse cy={-4} rx={10} ry={5} style={{ fill: top }} />
  </g>
);

/** A stretch of metro line as a legend swatch; `dotted` marks a merge's second parent. */
export const lineSwatch = (dotted = false) => (
  <g style={{ fill: "none", strokeLinecap: "round" }}>
    <path d="M-11 0 H11" style={{ stroke: "var(--ink)", strokeWidth: 8 }} />
    <path d="M-11 0 H11" style={{ stroke: "#a993ee", strokeWidth: 4.5 }} />
    {dotted && <path d="M-11 0 H11" style={{ stroke: "var(--card)", strokeWidth: 2, strokeDasharray: "1 4" }} />}
  </g>
);

/** A branch sign, or (with `current`) HEAD riding on the current branch's sign. */
export const signSwatch = (current = false) =>
  current ? (
    <g>
      <rect x={-12} y={-8} width={12} height={13} rx={3.5} style={{ fill: "var(--ink)" }} />
      <rect x={1} y={-8} width={11} height={13} rx={3.5} style={{ fill: "var(--tangerine)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
    </g>
  ) : (
    <rect x={-11} y={-8} width={22} height={13} rx={4} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
  );

/** The legend for the metro map (MetroStage), drawn the way the map draws things. */
export function metroLegend(t: (x: L) => string, opts: { ghost?: boolean; merge?: boolean } = {}): LegendItem[] {
  const items: LegendItem[] = [
    { swatch: stationSwatch(), label: t(l("istasyon = commit (üstünde kısa id)", "station = commit (short id on top)")) },
    { swatch: lineSwatch(), label: t(l("hat = commit'i önceki commit'e bağlar", "line = links a commit to the one before")) },
    { swatch: signSwatch(), label: t(l("tabela = branch, bir commit'i gösteren isim", "sign = branch, a name pointing at a commit")) },
    { swatch: signSwatch(true), label: t(l("HEAD = şu an bulunduğun yer", "HEAD = where you are now")) },
  ];
  if (opts.merge) {
    items.push({ swatch: lineSwatch(true), label: t(l("noktalı hat = merge'ün ikinci ebeveyni", "dotted line = a merge's second parent")) });
  }
  if (opts.ghost !== false) {
    items.push({ swatch: stationSwatch("var(--paper-2)", "var(--line)", true), label: t(l("soluk = hiçbir branch'in göstermediği commit", "faded = a commit no branch points at")) });
  }
  return items;
}

/** A strip at the bottom of the stage listing what is changed in the folder but not committed. */
export function WorkStrip({ repo, t, y = 392 }: { repo: Repo; t: (x: L) => string; y?: number }) {
  const st = status(repo);
  const items = [
    ...st.untracked.map((p) => ({ p, tag: t(l("yeni", "new")), fill: "var(--card)", dash: true })),
    ...st.unstaged.map((c) => ({ p: c.path, tag: t(c.change === "deleted" ? l("silindi", "deleted") : l("değişti", "changed")), fill: "var(--peach)", dash: false })),
    ...st.staged.map((c) => ({ p: c.path, tag: t(l("staging'de", "staged")), fill: "var(--mint)", dash: false })),
  ];
  const x0 = 20;
  return (
    <g>
      <rect x={x0} y={y + 4} width={820} height={58} rx={16} style={{ fill: "var(--ink)" }} />
      <rect x={x0} y={y} width={820} height={58} rx={16} style={{ fill: "var(--sky-soft)", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={x0 + 18} y={y + 24} style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, fill: "var(--ink)" }}>
        {t(l("Klasör", "Folder"))}
      </text>
      <text x={x0 + 18} y={y + 42} style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, fontWeight: 700, fill: "var(--ink-3)" }}>
        {t(l("commit edilmemiş", "not committed"))}
      </text>
      {items.length === 0 ? (
        <text x={x0 + 160} y={y + 34} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, fill: "var(--ink-3)" }}>
          {t(l("Temiz: her şey commit'li", "Clean: everything is committed"))}
        </text>
      ) : (
        items.slice(0, 3).map((it, i) => {
          const w = 196;
          const x = x0 + 150 + i * (w + 12);
          return (
            <g key={it.p} transform={`translate(${x} ${y + 12})`}>
              <rect width={w} height={34} rx={10} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2, strokeDasharray: it.dash ? "5 4" : undefined }} />
              <text x={10} y={21} style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, fill: "var(--ink)" }}>
                {it.p.length > 15 ? `${it.p.slice(0, 14)}…` : it.p}
              </text>
              <rect x={w - 72} y={9} width={64} height={16} rx={8} style={{ fill: it.fill, stroke: "var(--ink)", strokeWidth: 1.5 }} />
              <text x={w - 40} y={21} textAnchor="middle" style={{ fontFamily: "var(--font-display)", fontSize: 10.5, fontWeight: 800, fill: "var(--ink)" }}>
                {it.tag}
              </text>
            </g>
          );
        })
      )}
    </g>
  );
}

/** Builds a starting repo from a list of [path, content, message] commits on main. */
export function commitsOf(list: [string, string, string][]) {
  return list.flatMap(([path, content, message]) => [
    { type: "write" as const, path, content },
    { type: "add" as const, paths: [path] },
    { type: "commit" as const, message },
  ]);
}
