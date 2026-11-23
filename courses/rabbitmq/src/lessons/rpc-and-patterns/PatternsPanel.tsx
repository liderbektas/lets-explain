import { l, type L } from "@lets-explain/core/i18n";

/** Four messaging patterns side by side, as small cards inside the stage. */
const cards: { title: string; shape: L; when: L; tint: string }[] = [
  {
    title: "Work queue",
    shape: l("1 kuyruk → N işçi", "1 queue → N workers"),
    when: l("İşi paylaştır: her mesaj tek işçiye", "Share work: each message to one worker"),
    tint: "var(--mint-soft)",
  },
  {
    title: "Pub/Sub",
    shape: l("fanout → her servise kendi kuyruğu", "fanout → a queue per service"),
    when: l("Herkes her olayı duysun", "Everyone hears every event"),
    tint: "var(--lilac-soft)",
  },
  {
    title: "Routing",
    shape: l("direct / topic + key", "direct / topic + key"),
    when: l("Sadece ilgili olanlar alsın", "Only those who care receive"),
    tint: "var(--peach)",
  },
  {
    title: "RPC",
    shape: l("istek + replyTo + correlationId", "request + replyTo + correlationId"),
    when: l("Cevap gerekiyor ama beklemek sorun değil", "An answer is needed, waiting is fine"),
    tint: "var(--sky-soft)",
  },
];

export function PatternsPanel({ t }: { t: (x: L) => string }) {
  const w = 380;
  const h = 170;
  return (
    <g className="patterns">
      {cards.map((c, i) => {
        const x = 40 + (i % 2) * (w + 20);
        const y = 50 + Math.floor(i / 2) * (h + 24);
        return (
          <g key={c.title} transform={`translate(${x} ${y})`}>
            <rect y={5} width={w} height={h} rx={20} style={{ fill: "var(--ink)" }} />
            <rect width={w} height={h} rx={20} style={{ fill: c.tint, stroke: "var(--ink)", strokeWidth: 2 }} />
            <text x={22} y={42} style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, fill: "var(--ink)" }}>
              {c.title}
            </text>
            <text x={22} y={86} style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, fill: "var(--ink)" }}>
              {t(c.shape)}
            </text>
            <text x={22} y={124} style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, fill: "var(--ink-2)" }}>
              {t(c.when)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
