import { useLang } from "@lets-explain/core/i18n";
import { Pill } from "@lets-explain/core/iso/shapes";
import { Sticker } from "../../iso/parts";

/**
 * Two drawings about database migrations and rollbacks:
 * "rename": a migration renames a column, then rolling the code back does not help, because
 * the old code looks for a column that is gone.
 * "expand": the same change in three releases (expand, migrate, contract), each one safe to
 * roll back from.
 */

function Table({ x, y, cols, title, gone }: { x: number; y: number; cols: string[]; title: string; gone?: string }) {
  const w = 220;
  return (
    <g>
      <Sticker x={x} y={y} w={w} h={50 + cols.length * 26} head="var(--lilac-soft)" headH={32}>
        <text x={x + 14} y={y + 21} className="title" style={{ fontSize: 13 }}>
          {title}
        </text>
        {cols.map((c, i) => (
          <g key={c}>
            <line x1={x} x2={x + w} y1={y + 40 + i * 26} y2={y + 40 + i * 26} className="row-line" />
            <text x={x + 16} y={y + 58 + i * 26} className="mono" style={{ fontSize: 12.5, fill: c === gone ? "var(--ink-3)" : undefined, textDecoration: c === gone ? "line-through" : undefined }}>
              {c}
            </text>
          </g>
        ))}
      </Sticker>
    </g>
  );
}

function App({ x, y, version, reads, ok, note }: { x: number; y: number; version: string; reads: string; ok: boolean; note: string }) {
  return (
    <Sticker x={x} y={y} w={250} h={84} head={ok ? "var(--mint-soft)" : "var(--red-soft)"} headH={32}>
      <text x={x + 14} y={y + 21} className="title" style={{ fontSize: 13.5 }}>
        {version}
      </text>
      <text x={x + 236} y={y + 21} textAnchor="end" className="sub" style={{ fontSize: 11.5, fill: ok ? "var(--green)" : "var(--coral-deep)" }}>
        {ok ? "200 OK" : "500"}
      </text>
      <text x={x + 14} y={y + 54} className="mono" style={{ fontSize: 11.5 }}>
        {reads}
      </text>
      <text x={x + 14} y={y + 72} className="sub" style={{ fontSize: 10.5 }}>
        {note}
      </text>
    </Sticker>
  );
}

export function MigrationPanel({ kind }: { kind: "rename" | "expand" }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  if (kind === "rename") {
    return (
      <g className="ci">
        <Sticker x={16} y={12} w={828} h={52} head="var(--paper-2)" headH={52}>
          <text x={34} y={44} className="title" style={{ fontSize: 16 }}>
            {tr ? "v5'in migration'ı: RENAME COLUMN name TO full_name" : "v5's migration: RENAME COLUMN name TO full_name"}
          </text>
        </Sticker>
        <App x={40} y={110} version={tr ? "v5 (yeni kod)" : "v5 (new code)"} reads="SELECT full_name …" ok={false} note={tr ? "başka bir bug yüzünden çöktü" : "crashed because of another bug"} />
        <path d="M165 200 v 40" className="edge" />
        <path d="M159 232 l6 8 6 -8" className="edge" />
        <text x={180} y={226} className="sub" style={{ fontSize: 11.5 }}>
          {tr ? "rollback: v4'ü yeniden deploy et" : "rollback: redeploy v4"}
        </text>
        <App x={40} y={250} version={tr ? "v4 (eski kod)" : "v4 (old code)"} reads="SELECT name …" ok={false} note={tr ? 'column "name" does not exist' : 'column "name" does not exist'} />
        <Table x={420} y={140} title="customers" cols={["id", "name", "full_name", "email"]} gone="name" />
        <path d="M296 290 C 360 290, 360 230, 414 230" className="edge is-dim" />
        <Pill x={640} y={380} text={tr ? "kod geri döndü, şema dönmedi" : "the code went back, the schema did not"} tone="danger" size={13} animate={false} />
      </g>
    );
  }
  const stages = [
    { v: "v5 · expand", sql: "ADD COLUMN full_name", cols: ["id", "name", "full_name", "email"], app: tr ? "ikisine yazar, name'den okur" : "writes both, reads name", safe: tr ? "v4'e dönmek güvenli" : "safe to go back to v4" },
    { v: "v6 · migrate", sql: "UPDATE … SET full_name = name", cols: ["id", "name", "full_name", "email"], app: tr ? "ikisine yazar, full_name'den okur" : "writes both, reads full_name", safe: tr ? "v5'e dönmek güvenli" : "safe to go back to v5" },
    { v: "v7 · contract", sql: "DROP COLUMN name", cols: ["id", "full_name", "email"], app: tr ? "sadece full_name" : "full_name only", safe: tr ? "v6'ya dönmek güvenli" : "safe to go back to v6" },
  ];
  return (
    <g className="ci">
      <Sticker x={16} y={12} w={828} h={52} head="var(--paper-2)" headH={52}>
        <text x={34} y={44} className="title" style={{ fontSize: 16 }}>
          {tr ? "Aynı değişiklik, üç sürümde: expand → migrate → contract" : "The same change in three releases: expand → migrate → contract"}
        </text>
      </Sticker>
      {stages.map((s, i) => {
        const x = 24 + i * 278;
        return (
          <g key={s.v}>
            <Sticker x={x} y={86} w={258} h={360} head="var(--mint-soft)" headH={34}>
              <text x={x + 14} y={109} className="title" style={{ fontSize: 14 }}>
                {s.v}
              </text>
              <text x={x + 14} y={140} className="mono" style={{ fontSize: 11.5 }}>
                {s.sql}
              </text>
              <text x={x + 14} y={164} className="sub" style={{ fontSize: 11.5 }}>
                {s.app}
              </text>
            </Sticker>
            <Table x={x + 19} y={184} title="customers" cols={s.cols} />
            <Pill x={x + 129} y={420} text={s.safe} tone="ok" size={12} animate={false} />
            {i < 2 && <path d={`M${x + 262} 266 h 12`} className="edge" />}
          </g>
        );
      })}
    </g>
  );
}
