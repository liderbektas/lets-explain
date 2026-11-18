import type { Broker } from "../../engine/broker";

const REASON_FILL: Record<string, string> = {
  rejected: "var(--red-soft)",
  expired: "var(--sun-soft)",
  maxlen: "var(--lilac-soft)",
  delivery_limit: "var(--coral-soft)",
};

/**
 * The `x-death` header of messages waiting in the dead letter queues: why each one died and
 * where. Text fills are inline because the stage sets a default text colour.
 */
export function DeathPanel({ broker, queues, x, y, w, title, empty }: { broker: Broker; queues: string[]; x: number; y: number; w: number; title: string; empty: string }) {
  // Waiting in the queue, or already handed to a consumer of it (as after a retry).
  const rows = queues.flatMap((q) => [
    ...(broker.queues[q]?.ready ?? []).map((m) => ({ q, m })),
    ...Object.values(broker.consumers)
      .filter((c) => c.queue === q)
      .flatMap((c) => c.unacked.map((m) => ({ q: `${q} (${c.tag})`, m }))),
  ]).filter((r) => r.m.deaths.length > 0);
  const shown = rows.slice(0, 4);
  // Each x-death entry gets its own line, so a retried message shows its whole story.
  const heightOf = (n: number) => 22 + Math.max(1, n) * 14;
  const tops: number[] = [];
  let at = 40;
  for (const r of shown) {
    tops.push(at);
    at += heightOf(r.m.deaths.length) + 6;
  }
  const h = Math.max(at, 84) + 4;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={4} width={w} height={h} rx={14} style={{ fill: "var(--ink)" }} />
      <rect width={w} height={h} rx={14} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={14} y={26} style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, fill: "var(--ink)" }}>
        {title}
      </text>
      {shown.length === 0 && (
        <text x={14} y={60} style={{ fontSize: 12.5, fontWeight: 700, fill: "var(--ink-3)" }}>
          {empty}
        </text>
      )}
      {shown.map(({ q, m }, i) => {
        const d = m.deaths[0];
        return (
          <g key={`${q}-${m.id}`} transform={`translate(10 ${tops[i]})`}>
            <rect width={w - 20} height={heightOf(m.deaths.length)} rx={9} style={{ fill: d ? REASON_FILL[d.reason] ?? "var(--paper-2)" : "var(--paper-2)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
            <text x={9} y={16} style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, fill: "var(--ink)" }}>
              {m.body} → {q}
            </text>
            {m.deaths.map((x, k) => (
              <text key={k} x={9} y={31 + k * 14} style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fill: "var(--ink-2)" }}>
                {`${x.reason} @ ${x.queue} ×${x.count}`}
              </text>
            ))}
          </g>
        );
      })}
      {rows.length > shown.length && (
        <text x={w / 2} y={h - 6} textAnchor="middle" style={{ fontSize: 11, fontWeight: 800, fill: "var(--ink-3)" }}>
          +{rows.length - shown.length}
        </text>
      )}
    </g>
  );
}
