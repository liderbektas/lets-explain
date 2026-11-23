import { Person, Pill, TINTS } from "@lets-explain/core/iso/shapes";
import { Envelope, PostOffice } from "../../iso/MailroomStage";
import { Laptop } from "../../iso/mailroom-parts";

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
      {/* The app: one person at a laptop; the broker: the post office. */}
      <g transform={`translate(${x1 - 22} ${y + 62})`} className="mailroom">
        <Person tint={TINTS.sky} scale={1.6} carrying={<Envelope kind="neutral" w={22} />} />
        <g transform="scale(1.3)">
          <Laptop />
        </g>
      </g>
      <g transform={`translate(${x2 - 6} ${y - 18})`} className="mailroom">
        <PostOffice s={26} roof="var(--peach)" />
      </g>
      <Pill x={x1} y={y + 104} text={labels.app} animate={false} />
      <Pill x={x2} y={y + 104} text={labels.broker} animate={false} />
      <Pill x={(x1 + x2) / 2} y={y - 78} text={labels.connection} tone="sun" animate={false} />
      <Pill x={x2} y={y - 108} text={labels.vhost} tone="plain" size={11} animate={false} />
    </g>
  );
}
