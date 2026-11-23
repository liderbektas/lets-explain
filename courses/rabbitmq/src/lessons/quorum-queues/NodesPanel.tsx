import { motion } from "motion/react";
import { nodeAlive, queueAvailable, type Broker, type BrokerEvent } from "../../engine/broker";
import { HOP, landsAt } from "../../iso/choreography";
import { Envelope, PostOffice } from "../../iso/MailroomStage";

/**
 * The cluster's three nodes side by side, each a post office holding its copies of the
 * queues' mailboxes, with a chip for every queue copy each node holds:
 * the quorum leader in tangerine, followers in sky, a classic queue (one copy only) in sun.
 * When a message reaches a quorum queue, the leader sends a copy to each follower that is up;
 * when the leader's node fails, the leader role moves to the newly elected node.
 */

export interface NodesLabels {
  up: string;
  down: string;
  leader: string;
  follower: string;
  only: string;
}

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

export function NodesPanel({ broker, queues, labels, box, last = [] }: { broker: Broker; queues: string[]; labels: NodesLabels; box: { x: number; y: number; w: number; h: number }; last?: BrokerEvent[] }) {
  const n = broker.nodes.length;
  const gap = 18;
  const w = (box.w - gap * (n - 1)) / n;
  /** The left end of a queue's chip on a node card. */
  const chipAt = (node: string, queue: string): [number, number] | null => {
    const i = broker.nodes.findIndex((x) => x.name === node);
    const k = queues.filter((name) => broker.queues[name]?.members.includes(node)).indexOf(queue);
    return i >= 0 && k >= 0 ? [box.x + i * (w + gap) + 116, box.y + 48 + k * 26 + 10] : null;
  };
  const moves: { key: string; from: [number, number]; to: [number, number]; t0: number; leader: boolean }[] = [];
  last.forEach((e, idx) => {
    if (e.type === "routed") {
      for (const name of e.queues) {
        const q = broker.queues[name];
        if (!q || q.type !== "quorum" || !queues.includes(name) || !queueAvailable(broker, q)) continue;
        const leader = shownLeader(broker, name);
        const from = leader ? chipAt(leader, name) : null;
        if (!leader || !from) continue;
        // The leader writes it, then copies it to every follower that is up.
        for (const m of q.members) {
          const to = m !== leader && nodeAlive(broker, m) ? chipAt(m, name) : null;
          if (to) moves.push({ key: `${e.id}-${m}-${idx}`, from, to, t0: landsAt(e), leader: false });
        }
      }
    }
    if (e.type === "leaderMoved" && queues.includes(e.queue)) {
      const from = chipAt(e.from, e.queue);
      const to = chipAt(e.to, e.queue);
      if (from && to) moves.push({ key: `lead-${e.queue}-${idx}`, from, to, t0: 0, leader: true });
    }
  });
  return (
    <g className="nodes-panel mailroom">
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
            {/* The node: a post office, greyed while it is down. */}
            <g transform={`translate(${x + 44} ${y + 70})`}>
              <PostOffice s={11} roof="var(--peach)" down={!node.alive} />
            </g>
            <text x={x + 16} y={y + 26} style={{ fill: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800 }}>
              {node.name}
            </text>
            <g transform={`translate(${x + w - 14 - (node.alive ? 64 : 58)} ${y + 13})`}>
              <rect width={node.alive ? 64 : 58} height={18} rx={9} style={{ fill: node.alive ? "var(--mint)" : "var(--red-soft)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
              <text x={(node.alive ? 64 : 58) / 2} y={13} textAnchor="middle" style={{ fill: "var(--ink)", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800 }}>
                {node.alive ? labels.up : labels.down}
              </text>
            </g>
            {chips.map((c, k) => {
              const text = `${c.name} · ${c.role}`;
              const cw = Math.round(text.length * 6.6 + 18);
              return (
                <g key={c.name} transform={`translate(${x + 96} ${y + 48 + k * 26})`}>
                  <rect width={cw} height={20} rx={10} style={{ fill: c.fill, stroke: "var(--ink)", strokeWidth: 1.5 }} />
                  <text x={cw / 2} y={14} textAnchor="middle" style={{ fill: "var(--ink)", fontFamily: "var(--font-display)", fontSize: 11.5, fontWeight: 800 }}>
                    {text}
                  </text>
                </g>
              );
            })}
            {!node.alive && (
              <g transform={`translate(${x + 48} ${y + 50})`}>
                <circle r={11} style={{ fill: "var(--red)", stroke: "var(--ink)", strokeWidth: 2 }} />
                <path d="M-4 -4l8 8m0 -8l-8 8" style={{ stroke: "var(--card)", strokeWidth: 2.5, strokeLinecap: "round" }} />
              </g>
            )}
          </g>
        );
      })}
      {moves.map((mv) => (
        <Move key={mv.key} from={mv.from} to={mv.to} t0={mv.t0} leader={mv.leader} label={labels.leader} />
      ))}
    </g>
  );
}

/** A copy travelling from the leader to a follower, or the leader role moving to its new node. */
function Move({ from, to, t0, leader, label }: { from: [number, number]; to: [number, number]; t0: number; leader: boolean; label: string }) {
  const dur = leader ? 0.7 : HOP;
  const total = t0 + dur + 0.05;
  const a = Math.max(t0 / total, 0.002);
  const b = (t0 + dur) / total;
  return (
    <motion.g
      initial={{ x: from[0], y: from[1], scale: 0 }}
      animate={{ x: [from[0], from[0], to[0], to[0]], y: [from[1], from[1], to[1], to[1]], scale: [0, 0, 1, 1, 0] }}
      transition={{ x: { duration: total, times: [0, a, b, 1], ease: "easeInOut" }, y: { duration: total, times: [0, a, b, 1], ease: "easeInOut" }, scale: { duration: total, times: [0, a - 0.001, a, b, 1], ease: "linear" } }}
    >
      {leader ? (
        <g transform="translate(0 -12)">
          <rect x={-30} y={-9} width={60} height={18} rx={9} style={{ fill: "var(--tangerine)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
          <text y={4} textAnchor="middle" style={{ fill: "var(--ink)", fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 800 }}>
            {label}
          </text>
        </g>
      ) : (
        <g transform="translate(0 -4)">
          <Envelope kind="order" w={18} />
        </g>
      )}
    </motion.g>
  );
}
