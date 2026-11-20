import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useLang } from "@lets-explain/core/i18n";
import type { Run, Workflow, World } from "../../engine/ci";
import { cut, StatusDot, Sticker, type Box } from "../../iso/parts";

/**
 * What the workflow listens to (one chip per event), every push with the runs it started,
 * and the runs no push started (schedule, manual). A push that started nothing says so.
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

  let cx = box.x + 16;
  return (
    <g className="ci">
      <Sticker x={box.x} y={box.y} w={box.w} h={box.h} head="var(--sky-soft)" headH={78}>
        <text x={box.x + 16} y={box.y + 26} className="title">
          {tr ? "Workflow neyi dinliyor?" : "What the workflow listens to"}
        </text>
        {chips.map((c) => {
          const w = c.label.length * 7 + 22;
          const x = cx;
          cx += w + 8;
          return (
            <g key={c.label}>
              <rect x={x} y={box.y + 42} width={w} height={24} rx={12} className="sticker" style={{ fill: c.on ? "#3fd07f" : "#e9e5ec", strokeWidth: 1.5, strokeDasharray: c.on ? undefined : "4 3" }} />
              <text x={x + w / 2} y={box.y + 58} textAnchor="middle" className="mono" style={{ fontSize: 11.5, fill: c.on ? "var(--ink)" : "var(--ink-3)" }}>
                {c.label}
              </text>
            </g>
          );
        })}
        <text x={box.x + 16} y={box.y + 104} className="title" style={{ fontSize: 13.5 }}>
          {tr ? "Push'lar ve başlattıkları" : "Pushes and what they started"}
        </text>
        {pushes.length === 0 && (
          <text x={box.x + 16} y={box.y + 130} className="muted">
            {tr ? "Henüz push yok." : "No pushes yet."}
          </text>
        )}
        {pushes.map((c, i) => {
          const y = box.y + 116;
          const runs = world.runs.filter((r) => r.sha === c.sha && (r.event === "push" || r.event === "pull_request"));
          return (
            <motion.g key={c.sha} initial={mounted.current ? { x: -24, y: i * 40, opacity: 0 } : { x: 0, y: i * 40, opacity: 1 }} animate={{ x: 0, y: i * 40, opacity: 1 }} transition={{ duration: 0.35 }}>
              <rect x={box.x + 10} y={y} width={box.w - 20} height={34} rx={9} className="sticker" style={{ fill: runs.length ? "var(--card)" : "var(--paper-2)", strokeWidth: 1.3 }} />
              <rect x={box.x + 18} y={y + 8} width={c.branch.length * 7 + 14} height={18} rx={9} style={{ fill: c.branch === "main" ? "var(--sun-soft)" : "var(--lilac-soft)" }} />
              <text x={box.x + 25} y={y + 21} className="mono" style={{ fontSize: 11 }}>
                {c.branch}
              </text>
              <text x={box.x + 40 + c.branch.length * 7} y={y + 21} className="sub" style={{ fontSize: 11 }}>
                {c.sha} {cut(c.message, 16)}
              </text>
              {runs.length === 0 ? (
                <text x={box.x + box.w - 22} y={y + 21} textAnchor="end" className="muted" style={{ fontSize: 11.5 }}>
                  {tr ? "run başlamadı" : "no run started"}
                </text>
              ) : (
                runs.slice(-2).map((r, k) => (
                  <g key={r.id}>
                    <StatusDot status={r.status} x={box.x + box.w - 22 - (runs.slice(-2).length - 1 - k) * 98 - 86} y={y + 17} r={6} />
                    <text x={box.x + box.w - 22 - (runs.slice(-2).length - 1 - k) * 98} y={y + 21} textAnchor="end" className="mono" style={{ fontSize: 11 }}>
                      {cut(tag(r), 12)}
                    </text>
                  </g>
                ))
              )}
            </motion.g>
          );
        })}
        {others.length > 0 && (
          <text x={box.x + 16} y={box.y + 334} className="title" style={{ fontSize: 13.5 }}>
            {tr ? "Push'suz run'lar" : "Runs without a push"}
          </text>
        )}
        {others.map((r, i) => {
          const y = box.y + 346 + i * 40;
          return (
            <g key={r.id}>
              <rect x={box.x + 10} y={y} width={box.w - 20} height={34} rx={9} className="sticker" style={{ fill: "var(--card)", strokeWidth: 1.3 }} />
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
