import { IsoBox, Pill } from "@lets-explain/core/iso/shapes";

/**
 * One TCP connection from an app to the broker, with several channels running inside it.
 * Channels are not part of the broker model; this picture shows the idea on its own.
 */
export function Channels({ labels }: { labels: { app: string; broker: string; connection: string; channel: string; vhost: string } }) {
  const x1 = 210;
  const x2 = 650;
  const y = 240;
  const lanes = [-24, 0, 24];
  return (
    <g className="amqp-channels">
      <rect x={x1 + 40} y={y - 46} width={x2 - x1 - 80} height={92} rx={46} className="ch-pipe-shadow" />
      <rect x={x1 + 40} y={y - 50} width={x2 - x1 - 80} height={92} rx={46} className="ch-pipe" />
      {lanes.map((dy, i) => (
        <g key={dy}>
          <line x1={x1 + 70} x2={x2 - 70} y1={y - 4 + dy} y2={y - 4 + dy} className="ch-lane" />
          <g opacity={0}>
            <rect x={-8} y={-6} width={16} height={12} rx={3} className="ink" style={{ fill: ["var(--mint)", "var(--sky)", "var(--peach)"][i] }} />
            <animateMotion dur={`${1.6 + i * 0.4}s`} repeatCount="indefinite" path={`M${x1 + 70} ${y - 4 + dy} L${x2 - 70} ${y - 4 + dy}`} />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur={`${1.6 + i * 0.4}s`} repeatCount="indefinite" />
          </g>
          <text x={x1 + 76} y={y - 9 + dy} className="ch-label">
            {labels.channel} {i + 1}
          </text>
        </g>
      ))}
      <g transform={`translate(${x1} ${y + 30})`}>
        <IsoBox s={26} at={[-1.2, -1.2, 0]} size={[2.4, 2.4, 2]} shades={["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"]} className="ch-box" />
      </g>
      <g transform={`translate(${x2} ${y + 30})`}>
        <IsoBox s={26} at={[-1.4, -1.4, 0]} size={[2.8, 2.8, 2.3]} shades={["var(--peach)", "var(--peach-mid)", "var(--peach-deep)"]} className="ch-box" />
      </g>
      <Pill x={x1} y={y + 104} text={labels.app} animate={false} />
      <Pill x={x2} y={y + 104} text={labels.broker} animate={false} />
      <Pill x={(x1 + x2) / 2} y={y - 78} text={labels.connection} tone="sun" animate={false} />
      <Pill x={x2} y={y - 108} text={labels.vhost} tone="plain" size={11} animate={false} />
    </g>
  );
}
