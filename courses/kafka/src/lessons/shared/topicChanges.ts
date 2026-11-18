import { groupStats } from "../../engine/cluster";
import type { ClusterState, SimEvent } from "../../engine/types";
import type { L } from "@lets-explain/core/i18n";
import type { Change } from "@lets-explain/core/course/types";

const both = (tr: string, en: string): L => ({ tr, en });
const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
const pIndex = (tp: string) => Number(tp.slice(tp.lastIndexOf("-") + 1));

interface Names {
  /** Member display name in both languages. */
  member: (group: string, member: string) => L;
  /** Group display name, for group-level lines. Omit to skip group lines. */
  group?: (group: string) => L;
}

/**
 * "What changed" for a multi-partition step, worked out from the states before and after
 * and the events in between: records per partition, new partitions, joins and leaves,
 * who now owns what, reads, commits and re-reads.
 */
export function topicChanges(before: ClusterState, after: ClusterState, events: SimEvent[], topic: string, names: Names): Change[] {
  const out: Change[] = [];
  const pb = before.topics[topic]?.partitions ?? [];
  const pa = after.topics[topic]?.partitions ?? [];

  if (pa.length > pb.length && pb.length > 0) {
    out.push({
      kind: "add",
      text: both(`Topic ${pb.length} → ${pa.length} partition oldu; yeniler boş`, `Topic grew ${pb.length} → ${pa.length} partitions; the new ones are empty`),
    });
  }
  for (const p of pa) {
    const old = pb[p.index]?.logEndOffset ?? 0;
    if (p.logEndOffset > old) {
      const n = p.logEndOffset - old;
      out.push({
        kind: "add",
        text: both(`P${p.index}: +${n} kayıt (offset ${range(old, p.logEndOffset - 1)})`, `P${p.index}: +${n} record${n > 1 ? "s" : ""} (offset ${range(old, p.logEndOffset - 1)})`),
      });
    }
  }

  for (const e of events) {
    if (e.type === "memberJoined") {
      const n = names.member(e.group, e.member);
      out.push({ kind: "good", text: both(`${n.tr} group'a katıldı`, `${n.en} joined the group`) });
    }
    if (e.type === "memberLeft") {
      const n = names.member(e.group, e.member);
      out.push({
        kind: "bad",
        text: e.crashed ? both(`${n.tr} çöktü`, `${n.en} crashed`) : both(`${n.tr} group'tan ayrıldı`, `${n.en} left the group`),
      });
    }
  }

  // Who owns what, if it changed.
  for (const [gid, group] of Object.entries(after.groups)) {
    const was = before.groups[gid];
    for (const m of group.members) {
      const prev = was?.members.find((x) => x.id === m.id)?.assigned ?? null;
      const now = m.assigned.filter((t) => t.startsWith(`${topic}-`));
      if (prev && prev.join() === m.assigned.join()) continue;
      const n = names.member(gid, m.id);
      const list = now.map((t) => `P${pIndex(t)}`).join(", ");
      out.push(
        now.length
          ? { kind: "change", text: both(`${n.tr} okuyor: ${list}`, `${n.en} reads ${list}`) }
          : { kind: "bad", text: both(`${n.tr} boşta: hiç partition'ı yok`, `${n.en} is idle: no partition`) },
      );
    }
  }

  // Reads, per member and partition.
  const reads = new Map<string, { group: string; member: string; p: number; first: number; last: number; dups: number }>();
  for (const e of events) {
    if (e.type !== "delivered") continue;
    const key = `${e.group}/${e.member}/${e.tp}`;
    const r = reads.get(key);
    if (r) {
      r.last = e.offset;
      r.dups += e.duplicate ? 1 : 0;
    } else reads.set(key, { group: e.group, member: e.member, p: pIndex(e.tp), first: e.offset, last: e.offset, dups: e.duplicate ? 1 : 0 });
  }
  for (const r of reads.values()) {
    const n = names.member(r.group, r.member);
    out.push({
      kind: r.dups > 0 ? "bad" : "change",
      text:
        r.dups > 0
          ? both(`${n.tr} P${r.p} ${range(r.first, r.last)} okudu (${r.dups} tanesi ikinci kez)`, `${n.en} read P${r.p} ${range(r.first, r.last)} (${r.dups} for the second time)`)
          : both(`${n.tr} P${r.p} ${range(r.first, r.last)} okudu`, `${n.en} read P${r.p} ${range(r.first, r.last)}`),
    });
  }

  if (names.group) {
    for (const gid of Object.keys(after.groups)) {
      const lagBefore = before.groups[gid] ? groupStats(before, gid).lag : null;
      const lagAfter = groupStats(after, gid).lag;
      if (lagBefore !== null && lagBefore !== lagAfter) {
        const g = names.group(gid);
        out.push({
          kind: lagAfter > lagBefore ? "bad" : "good",
          text: both(`${g.tr} lag: ${lagBefore} → ${lagAfter}`, `${g.en} lag: ${lagBefore} → ${lagAfter}`),
        });
      }
    }
  }
  return out;
}
