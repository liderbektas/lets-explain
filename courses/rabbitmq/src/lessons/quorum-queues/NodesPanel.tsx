import { IsoBox, type Shades } from "@lets-explain/core/iso/shapes";
import { nodeAlive, queueAvailable, type Broker } from "../../engine/broker";

/**
 * The cluster's three nodes side by side, with a chip for every queue copy each node holds:
 * the quorum leader in tangerine, followers in sky, a classic queue (one copy only) in sun.
 */

export interface NodesLabels {
  up: string;
  down: string;
  leader: string;
  follower: string;
  only: string;
}

const UP: Shades = ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"];
const DOWN: Shades = ["#e2dde6", "#cfc8d6", "#b9b2c2"];

/**
 * Who leads a quorum queue right now. The model keeps the old leader's name while the
 * queue has no majority and does not re-elect when a node returns, so when that node is
 * still down but a majority is back, the first live member is shown as leader.
 */
export function shownLeader(b: Broker, queue: string): string | null {
  const q = b.queues[queue];
  if (!q || q.type !== "quorum") return q?.node ?? null;
  if (!queueAvailable(b, q)) return null;
  if (nodeAlive(b, q.node)) return q.node;
  return q.members.find((m) => nodeAlive(b, m)) ?? null;
}

export function NodesPanel({ broker, queues, labels, box }: { broker: Broker; queues: string[]; labels: NodesLabels; box: { x: number; y: number; w: number; h: number } }) {
  const n = broker.nodes.length;
  const gap = 18;
  const w = (box.w - gap * (n - 1)) / n;
  return (
    <g className="nodes-panel">
      {broker.nodes.map((node, i) => {
        const x = box.x + i * (w + gap);
        const y = box.y;
        const chips = queues.flatMap((name) => {
          const q = broker.queues[name];
          if (!q || !q.members.includes(node.name)) return [];
          if (q.type === "classic") return [{ name, role: labels.only, fill: "var(--sun)" }];
          const leader = shownLeader(broker, name);
          const isLeader = leader === node.name;
          return [{ name, role: isLeader ? labels.leader : labels.follower, fill: isLeader ? "var(--tangerine)" : "var(--sky-soft)" }];
        });
        return (
          <g key={node.name} opacity={node.alive ? 1 : 0.6}>
            <rect x={x} y={y + 4} width={w} height={box.h} rx={16} style={{ fill: "var(--ink)" }} />
            <rect x={x} y={y} width={w} height={box.h} rx={16} style={{ fill: node.alive ? "var(--card)" : "var(--paper-2)", stroke: "var(--ink)", strokeWidth: 2 }} />
            <g transform={`translate(${x + 30} ${y + 40})`}>
              <g className="node-icon">
                <IsoBox s={10} at={[-1, -1, 0]} size={[2, 2, 0.9]} shades={node.alive ? UP : DOWN} />
                <IsoBox s={10} at={[-1, -1, 0.9]} size={[2, 2, 0.9]} shades={node.alive ? UP : DOWN} />
              </g>
            </g>
            <text x={x + 56} y={y + 26} style={{ fill: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800 }}>
              {node.name}
            </text>
            <g transform={`translate(${x + 56} ${y + 36})`}>
              <rect width={node.alive ? 64 : 58} height={18} rx={9} style={{ fill: node.alive ? "var(--mint)" : "var(--red-soft)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
              <text x={(node.alive ? 64 : 58) / 2} y={13} textAnchor="middle" style={{ fill: "var(--ink)", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800 }}>
                {node.alive ? labels.up : labels.down}
              </text>
            </g>
            {chips.map((c, k) => {
              const text = `${c.name} · ${c.role}`;
              const cw = Math.round(text.length * 6.6 + 18);
              return (
                <g key={c.name} transform={`translate(${x + 14} ${y + 68 + k * 26})`}>
                  <rect width={cw} height={20} rx={10} style={{ fill: c.fill, stroke: "var(--ink)", strokeWidth: 1.5 }} />
                  <text x={cw / 2} y={14} textAnchor="middle" style={{ fill: "var(--ink)", fontFamily: "var(--font-display)", fontSize: 11.5, fontWeight: 800 }}>
                    {text}
                  </text>
                </g>
              );
            })}
            {!node.alive && (
              <g transform={`translate(${x + w - 22} ${y + 22})`}>
                <circle r={11} style={{ fill: "var(--red)", stroke: "var(--ink)", strokeWidth: 2 }} />
                <path d="M-4 -4l8 8m0 -8l-8 8" style={{ stroke: "var(--card)", strokeWidth: 2.5, strokeLinecap: "round" }} />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
