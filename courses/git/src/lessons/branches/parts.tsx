import type { LegendItem } from "@lets-explain/core/components/SceneFrame";
import { l, type L } from "@lets-explain/core/i18n";
import { IsoBox } from "@lets-explain/core/iso/shapes";
import { status, type Repo } from "../../engine/git";

/**
 * Small pieces shared by the refs-and-head, branches and merging lessons: the graph legend
 * and a strip that lists uncommitted changes, which the commit graph alone cannot show.
 */

export function graphLegend(t: (x: L) => string, opts: { ghost?: boolean; merge?: boolean } = {}): LegendItem[] {
  const items: LegendItem[] = [
    {
      swatch: (
        <g transform="translate(0 2)">
          <IsoBox s={6} at={[-0.5, -0.5, 0]} size={[1, 1, 1]} shades={["var(--sun)", "#f2bd3a", "#d9a826"]} />
        </g>
      ),
      label: t(l("commit (üstünde kısa id)", "commit (short id on top)")),
    },
    {
      swatch: <rect x={-10} y={-8} width={20} height={11} rx={5.5} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 1.5 }} />,
      label: t(l("branch = bir commit'i gösteren isim", "branch = a name pointing at a commit")),
    },
    {
      swatch: (
        <g>
          <rect x={-10} y={-8} width={11} height={11} rx={5.5} style={{ fill: "var(--ink)" }} />
          <rect x={-2} y={-8} width={12} height={11} rx={5.5} style={{ fill: "var(--tangerine)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
        </g>
      ),
      label: t(l("HEAD = şu an bulunduğun yer", "HEAD = where you are now")),
    },
  ];
  if (opts.merge) {
    items.push({
      swatch: <path d="M-10 -2 H10" style={{ stroke: "var(--ink)", strokeWidth: 2.5, strokeDasharray: "2 4", strokeLinecap: "round" }} />,
      label: t(l("noktalı = merge'ün ikinci ebeveyni", "dotted = a merge's second parent")),
    });
  }
  if (opts.ghost) {
    items.push({
      swatch: (
        <g transform="translate(0 2)" style={{ strokeDasharray: "2 2" }}>
          <IsoBox s={6} at={[-0.5, -0.5, 0]} size={[1, 1, 1]} shades={["#f4efe6", "#e8e0d1", "#ddd3c1"]} />
        </g>
      ),
      label: t(l("soluk = hiçbir branch'in göstermediği commit", "faded = a commit no branch points at")),
    });
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
