import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useLang } from "@lets-explain/core/i18n";
import type { Run, Workflow, World } from "../../engine/ci";
import { BELT, Crate, crateW, Lever, OBox } from "../../iso/factory";
import { cut, StatusDot, Sticker, type Box } from "../../iso/parts";

/**
 * The entrance of the line. On top, the workflow's switchboard: one lever per event it can
 * listen to, up when `on:` has it. Below, every push arriving on the intake belt as a crate with
 * its branch: at the sorting gate it either went in (green lamp, the runs it started) or was
 * turned away (red lamp, no run). Then the runs no push started (schedule, manual).
 */
export function TriggerBoard({ world, box, workflow }: { world: World; box: Box; workflow?: Workflow }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  const wf = workflow ?? world.workflows[0];
  const chips: { label: string; on: boolean }[] = [
    { label: `push${wf?.on.push?.branches ? `: ${wf.on.push.branches.join(", ")}` : ""}`, on: Boolean(wf?.on.push) },
    { label: "pull_request", on: Boolean(wf?.on.pull_request) },
    { label: "schedule", on: Boolean(wf?.on.schedule) },
    { label: "workflow_dispatch", on: Boolean(wf?.on.dispatch) },
  ];
  const pushes = world.commits.filter((c) => c.n > 1).reverse().slice(0, 5);
  const others = world.runs.filter((r) => r.event === "schedule" || r.event === "dispatch").reverse().slice(0, 2);
  const tag = (r: Run) => `${r.event === "pull_request" ? `PR #${r.pr}` : r.event} → #${r.id}`;
  // A new push slides in on top and moves the others down; rows already there on open stay put.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);

  const lever = (c: { label: string; on: boolean }, i: number) => {
    const x = box.x + 18 + (i % 2) * ((box.w - 36) / 2);
    const y = box.y + 52 + Math.floor(i / 2) * 32;
    return (
      <g key={c.label}>
        <Lever x={x} y={y} on={c.on} />
        <text x={x + 36} y={y + 10} className="mono" style={{ fontSize: 12, fill: c.on ? "var(--ink)" : "var(--ink-3)" }}>
          {cut(c.label, 22)}
        </text>
      </g>
    );
  };
  const rowH = 36;
  const listTop = box.y + 136;
  return (
    <g className="ci">
      <Sticker x={box.x} y={box.y} w={box.w} h={box.h} head="var(--sky-soft)" headH={100}>
        <text x={box.x + 16} y={box.y + 26} className="title">
          {tr ? "Workflow neyi dinliyor?" : "What the workflow listens to"}
        </text>
        {chips.map(lever)}
        <text x={box.x + 16} y={box.y + 124} className="title" style={{ fontSize: 13.5 }}>
          {tr ? "Push'lar ve başlattıkları" : "Pushes and what they started"}
        </text>
        {pushes.length === 0 && (
          <text x={box.x + 16} y={listTop + 22} className="muted">
            {tr ? "Henüz push yok." : "No pushes yet."}
          </text>
        )}
        {pushes.map((c, i) => {
          const y = listTop;
          const runs = world.runs.filter((r) => r.sha === c.sha && (r.event === "push" || r.event === "pull_request"));
          const gx = box.x + box.w - 150;
          const shown = runs.slice(-2);
          return (
            <motion.g key={c.sha} initial={mounted.current ? { x: -24, y: i * rowH, opacity: 0 } : { x: 0, y: i * rowH, opacity: 1 }} animate={{ x: 0, y: i * rowH, opacity: 1 }} transition={{ duration: 0.35 }}>
              {/* The intake belt, the commit on it, and the sorting gate. */}
              <OBox x={box.x + 12} y={y + 24} w={gx - box.x - 12} h={5} d={8} {...BELT} thin />
              <g transform={`translate(${box.x + 16} ${y + 12})`} opacity={runs.length ? 1 : 0.7}>
                <Crate label={c.branch} tone={c.branch === "main" ? "code" : "deps"} size={11} />
              </g>
              <text x={box.x + 30 + crateW(c.branch, 11)} y={y + 17} className="sub" style={{ fontSize: 11 }}>
                {c.sha} {cut(c.message, 16)}
              </text>
              <rect x={gx} y={y + 2} width={5} height={28} style={{ fill: "#fffdf8", stroke: "var(--ink)", strokeWidth: 1.4 }} />
              <StatusDot status={runs.length ? "success" : "failure"} x={gx + 2.5} y={y + 2} r={5.5} />
              {runs.length === 0 ? (
                <text x={gx + 14} y={y + 20} className="muted" style={{ fontSize: 11.5 }}>
                  {tr ? "run başlamadı" : "no run started"}
                </text>
              ) : (
                shown.map((r, k) => (
                  <g key={r.id}>
                    <StatusDot status={r.status} x={gx + 20 + k * 68} y={y + 16} r={6} />
                    <text x={gx + 30 + k * 68} y={y + 20} className="mono" style={{ fontSize: 11 }}>
                      {cut(tag(r), shown.length > 1 ? 8 : 16)}
                    </text>
                  </g>
                ))
              )}
            </motion.g>
          );
        })}
        {others.length > 0 && (
          <text x={box.x + 16} y={box.y + 336} className="title" style={{ fontSize: 13.5 }}>
            {tr ? "Push'suz run'lar" : "Runs without a push"}
          </text>
        )}
        {others.map((r, i) => {
          const y = box.y + 346 + i * 40;
          return (
            <g key={r.id}>
              <rect x={box.x + 10} y={y} width={box.w - 20} height={34} rx={6} className="sticker" style={{ fill: "var(--card)", strokeWidth: 1.3 }} />
              <StatusDot status={r.status} x={box.x + 28} y={y + 17} r={6} />
              <text x={box.x + 42} y={y + 21} className="mono" style={{ fontSize: 11.5 }}>
                {r.event === "schedule" ? (tr ? "schedule (her gece 03:00 UTC)" : "schedule (nightly 03:00 UTC)") : tr ? "workflow_dispatch (elle)" : "workflow_dispatch (by hand)"}
              </text>
              <text x={box.x + box.w - 22} y={y + 21} textAnchor="end" className="mono" style={{ fontSize: 11 }}>
                #{r.id} · {r.branch} · {r.sha}
              </text>
            </g>
          );
        })}
      </Sticker>
    </g>
  );
}
