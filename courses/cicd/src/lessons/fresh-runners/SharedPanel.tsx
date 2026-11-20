import { useLang } from "@lets-explain/core/i18n";
import { IsoBox } from "@lets-explain/core/iso/shapes";
import { Sticker, type Box } from "../../iso/parts";

/** Two runners side by side: what crosses between jobs, and what never does. */
export function SharedPanel({ box }: { box: Box }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  const half = (box.w - 24) / 2;
  const left = { x: box.x, y: box.y, w: half, h: box.h };
  const right = { x: box.x + half + 24, y: box.y, w: half, h: box.h };
  const shared = tr
    ? [
        ["Repodaki kod", "her job checkout ile yeniden çeker"],
        ["Secret'lar", "her job'a ayrı ayrı verilir"],
        ["Artifact'ler", "upload ile bırakılır, download ile alınır"],
        ["Cache", "anahtarla saklanır, sonraki job/run geri yükler"],
        ["Job çıktıları", "`outputs` ile küçük değerler"],
      ]
    : [
        ["The repo's code", "every job fetches it again with checkout"],
        ["Secrets", "handed to each job separately"],
        ["Artifacts", "left with upload, picked up with download"],
        ["Cache", "stored by key, restored by a later job or run"],
        ["Job outputs", "small values through `outputs`"],
      ];
  const lost = tr
    ? [
        ["Üretilen dosyalar", "`dist/`, raporlar, ekran görüntüleri"],
        ["Kurulan şeyler", "`node_modules`, Node, CLI araçları"],
        ["Ortam değişkenleri", "bir step'te `export` edilenler"],
        ["Çalışan süreçler", "başlatılan sunucu, veritabanı"],
        ["Diskteki her şey", "job bitince makine silinir"],
      ]
    : [
        ["Files you produced", "`dist/`, reports, screenshots"],
        ["Things you installed", "`node_modules`, Node, CLI tools"],
        ["Environment variables", "anything `export`ed in a step"],
        ["Running processes", "a server or database you started"],
        ["Everything on disk", "the machine is deleted after the job"],
      ];
  const list = (b: Box, rows: string[][], fill: string) =>
    rows.map(([a, c], i) => {
      const y = b.y + 92 + i * 66;
      return (
        <g key={a}>
          <rect x={b.x + 16} y={y} width={b.w - 32} height={54} rx={12} className="sticker" style={{ fill, strokeWidth: 1.5 }} />
          <text x={b.x + 32} y={y + 23} className="title" style={{ fontSize: 14 }}>
            {a}
          </text>
          <text x={b.x + 32} y={y + 42} className="muted" style={{ fontSize: 12 }}>
            {c!.replace(/`/g, "")}
          </text>
        </g>
      );
    });
  return (
    <g className="ci">
      <Sticker x={left.x} y={left.y} w={left.w} h={left.h} head="var(--mint-soft)" headH={60}>
        <g transform={`translate(${left.x + 34} ${left.y + 38})`}>
          <IsoBox s={12} at={[-0.6, -0.6, 0]} size={[1.2, 1.2, 0.9]} shades={["var(--mint)", "var(--mint-mid)", "var(--mint-deep)"]} />
        </g>
        <text x={left.x + 62} y={left.y + 37} className="title">
          {tr ? "Job'lar arasında taşınır" : "Crosses between jobs"}
        </text>
        {list(left, shared, "var(--card)")}
      </Sticker>
      <Sticker x={right.x} y={right.y} w={right.w} h={right.h} head="var(--red-soft)" headH={60}>
        <g transform={`translate(${right.x + 34} ${right.y + 38})`}>
          <IsoBox s={12} at={[-0.6, -0.6, 0]} size={[1.2, 1.2, 0.9]} shades={["var(--coral)", "#f08770", "var(--coral-deep)"]} />
        </g>
        <text x={right.x + 62} y={right.y + 37} className="title">
          {tr ? "Job bitince kaybolur" : "Gone when the job ends"}
        </text>
        {list(right, lost, "var(--paper-2)")}
      </Sticker>
    </g>
  );
}
