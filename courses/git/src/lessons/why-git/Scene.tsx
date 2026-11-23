import { l, type L } from "@lets-explain/core/i18n";
import { Person, TINTS } from "@lets-explain/core/iso/shapes";
import { ADA, createRepo, currentBranch, headId, short, type GitAction, type Repo } from "../../engine/git";
import { MetroStage } from "../../iso/MetroStage";
import { stationSwatch } from "../branches/parts";
import { makeGitScene, timeWords } from "../shared/GitScene";
import { DRAFT, scenarios } from "./scenarios";

export const SLUG = "why-git";

const write = (path: string, content: string): GitAction => ({ type: "write", path, content });
const add = (...paths: string[]): GitAction => ({ type: "add", paths });
const commit = (message: string): GitAction => ({ type: "commit", message });

/** The lesson starts with no repository at all: steps 0–1 show life without Git. */
export const START: Repo = createRepo({ author: ADA });

export const steps: GitAction[][] = [
  [],
  [],
  [write("rapor.md", "Giriş"), add("rapor.md"), commit("İlk taslak")],
  [
    write("rapor.md", "Giriş + Bölüm 1"),
    add("rapor.md"),
    commit("Bölüm 1 eklendi"),
    write("rapor.md", "Giriş + Bölüm 1 + Sonuç"),
    add("rapor.md"),
    commit("Sonuç yazıldı"),
  ],
  [{ type: "checkout", target: "HEAD~2" }],
  [{ type: "switch", target: "main" }],
  [],
  [],
];

/* ------------------------------------------------------------ life without Git */

const COPIES = ["rapor.docx", "rapor_final.docx", "rapor_final_v2.docx", "rapor_final_v2_SON.docx", "rapor_SON_gercekten_son.docx"];

function FileCard({ x, y, name, tone = "var(--card)", rotate = 0 }: { x: number; y: number; name: string; tone?: string; rotate?: number }) {
  const w = Math.max(150, name.length * 7.4 + 54);
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x={-w / 2} y={-19} width={w} height={42} rx={10} style={{ fill: "var(--ink)" }} />
      <rect x={-w / 2} y={-22} width={w} height={42} rx={10} className="ink" style={{ fill: tone }} />
      <path d={`M${-w / 2 + 12} -12h14l5 5v16h-19z`} className="ink" style={{ fill: "var(--sky-soft)" }} />
      <text x={-w / 2 + 40} y={4} className="file-name" style={{ fontSize: 13 }}>
        {name}
      </text>
    </g>
  );
}

function Tag({ x, y, text, fill = "var(--sun)" }: { x: number; y: number; text: string; fill?: string }) {
  const w = text.length * 7.6 + 26;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-11} width={w} height={26} rx={13} style={{ fill: "var(--ink)" }} />
      <rect x={-w / 2} y={-14} width={w} height={26} rx={13} className="ink" style={{ fill }} />
      <text y={4} textAnchor="middle" className="ref-text" style={{ fontSize: 13 }}>
        {text}
      </text>
    </g>
  );
}

function CopiesPile({ t }: { t: (x: L) => string }) {
  return (
    <g>
      <text x={430} y={58} textAnchor="middle" className="graph-title">
        {t(l("Masaüstü / Ödev", "Desktop / Report"))}
      </text>
      {COPIES.map((name, i) => (
        <FileCard key={name} x={430 + (i % 2 ? 26 : -26)} y={110 + i * 58} name={name} rotate={i % 2 ? 1.5 : -1.5} />
      ))}
      <Tag x={690} y={130} text={t(l("Hangisi son hali?", "Which one is the latest?"))} />
      <Tag x={180} y={330} text={t(l("Neyi değiştirmiştim?", "What did I change?"))} fill="var(--coral-soft)" />
      <Tag x={690} y={360} text={t(l("Eskisine nasıl dönerim?", "How do I go back?"))} fill="var(--lilac-soft)" />
    </g>
  );
}

function EmailMess({ t }: { t: (x: L) => string }) {
  return (
    <g>
      <g transform="translate(150 300)">
        <Person tint={TINTS.coral} scale={1.6} />
        <g transform="translate(0 36)">
          <Tag x={0} y={0} text="Ada" fill="var(--coral-soft)" />
        </g>
      </g>
      <g transform="translate(710 300)">
        <Person tint={TINTS.lilac} scale={1.6} state="busy" />
        <g transform="translate(0 36)">
          <Tag x={0} y={0} text="Bora" fill="var(--lilac-soft)" />
        </g>
      </g>
      <FileCard x={170} y={150} name="rapor_ada.docx" tone="var(--coral-soft)" />
      <FileCard x={690} y={150} name="rapor_bora_duzeltme.docx" tone="var(--lilac-soft)" />
      <path d="M270 190 C 380 120, 480 120, 590 190" className="area-arrow" style={{ strokeDasharray: "6 6" }} />
      <path d="M590 230 C 480 300, 380 300, 270 230" className="area-arrow" style={{ strokeDasharray: "6 6" }} />
      <Tag x={430} y={118} text={t(l("e-posta ekinde", "as an attachment"))} fill="var(--card)" />
      <Tag x={430} y={330} text={t(l("İki farklı \"son hal\"", "Two different \"latest\" versions"))} fill="var(--red-soft)" />
    </g>
  );
}

export const scene = makeGitScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Kopyalarla dolu bir klasör ve Git ile tek klasörde tutulan geçmiş", "A folder full of copies, and Git keeping the history in one folder"),
  view: (repo, info) => {
    if (!info.sandbox && info.step === 0) return <CopiesPile t={info.t} />;
    if (!info.sandbox && info.step === 1) return <EmailMess t={info.t} />;
    return <MetroStage repo={repo} highlight={info.fresh} lanes={1} time={timeWords(info.t)} t={info.t} />;
  },
  metrics: (repo, t, info) => {
    if (!info.sandbox && info.step < 2) {
      return [
        { label: t(l("Kopya dosya", "Copies")), value: info.step === 0 ? COPIES.length : 2, tone: "danger" },
        { label: t(l("Geçmiş", "History")), value: t(l("yok", "none")), tone: "danger" },
      ];
    }
    const head = headId(repo);
    const branch = currentBranch(repo);
    return [
      { label: t(l("Kaydedilmiş sürüm", "Saved versions")), value: Object.keys(repo.commits).length, tone: "ok" },
      { label: t(l("Klasördeki rapor", "Report in folder")), value: repo.work["rapor.md"] ? `"${repo.work["rapor.md"]}"` : "—" },
      { label: "HEAD", value: branch ?? (head ? short(head) : "—"), tone: branch ? "plain" : "warn" },
    ];
  },
  legend: (t) => [
    {
      swatch: stationSwatch(),
      label: t(l("istasyon = commit, kaydedilmiş bir sürüm", "station = commit, a saved version")),
    },
    {
      swatch: <rect x={-11} y={-8} width={22} height={13} rx={4} style={{ fill: "var(--tangerine)", stroke: "var(--ink)", strokeWidth: 1.5 }} />,
      label: t(l("tabela = branch adı (main)", "sign = branch name (main)")),
    },
    {
      swatch: <rect x={-11} y={-8} width={22} height={13} rx={4} style={{ fill: "var(--ink)" }} />,
      label: t(l("HEAD = şu an baktığın yer", "HEAD = where you are looking now")),
    },
  ],
  // Free play starts from the saved first draft; each scenario brings its own state.
  sandbox: { start: () => DRAFT, scenarios },
});
