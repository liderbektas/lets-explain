import { Building, Pill, TINTS } from "@lets-explain/core/iso/shapes";

/**
 * The "before" picture: the order service calls the email service directly. When the email
 * service is down the call fails and the order service is stuck waiting.
 */
export function DirectCall({ down, labels }: { down: boolean; labels: { orders: string; email: string; call: string; noAnswer: string; waiting: string } }) {
  const ax = 230;
  const bx = 630;
  const y = 250;
  const d = `M${ax + 48} ${y - 8} C ${(ax + bx) / 2} ${y - 60}, ${(ax + bx) / 2} ${y - 60}, ${bx - 48} ${y - 8}`;
  return (
    <g className="direct-call">
      <path d={d} className={`dc-road ${down ? "is-broken" : ""}`} />
      {!down && (
        <g opacity={0}>
          <rect x={-9} y={-7} width={18} height={14} rx={3} className="ink" style={{ fill: "var(--mint)" }} />
          <animateMotion dur="1.8s" repeatCount="indefinite" path={d} />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="1.8s" repeatCount="indefinite" />
        </g>
      )}
      <Pill x={(ax + bx) / 2} y={y - 78} text={labels.call} tone="plain" animate={false} />
      <g transform={`translate(${ax} ${y})`}>
        <Building s={30} roof={TINTS.sky} status={down ? "busy" : "ok"} />
      </g>
      <g transform={`translate(${bx} ${y})`}>
        <Building s={30} roof={TINTS.coral} status={down ? "down" : "ok"} />
      </g>
      <Pill x={ax} y={y + 52} text={labels.orders} tone="plain" animate={false} />
      <Pill x={bx} y={y + 52} text={labels.email} tone={down ? "danger" : "plain"} animate={false} />
      {down && <Pill x={(ax + bx) / 2} y={y - 18} text={labels.noAnswer} tone="danger" />}
      {down && <Pill x={ax} y={y - 82} text={labels.waiting} tone="warn" />}
    </g>
  );
}
