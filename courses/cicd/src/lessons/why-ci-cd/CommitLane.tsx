import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useLang } from "@lets-explain/core/i18n";
import type { World } from "../../engine/ci";
import { statusText } from "../../iso/RunStage";
import { cut, StatusDot, Sticker, type Box } from "../../iso/parts";
import { appearAt, useReplay, visibleBetween } from "../../iso/replay";

/**
 * A branch's commits, newest on top. Each commit shows the result of the run its push started,
 * or "not checked" when nothing ran for it: a commit nobody checked looks exactly like a good one.
 * A new commit slides in on top and pushes the others down; while its run is being played back
 * it shows as running, and its result appears when the run ends.
 */
export function CommitLane({ world, box, branch = "main" }: { world: World; box: Box; branch?: string }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  const commits = world.commits.filter((c) => c.branch === branch).reverse();
  const rowH = 50;
  const max = Math.max(1, Math.floor((box.h - 64) / rowH));
  const chars = Math.floor((box.w - 60) / 7.2);
  const runOf = (sha: string) => [...world.runs].reverse().find((r) => r.sha === sha && r.event === "push");
  const newest = commits[0] ? runOf(commits[0].sha) : undefined;
  const replay = useReplay(newest);
  // Commits already there when the scene opens do not slide in.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <g className="ci">
      <Sticker x={box.x} y={box.y} w={box.w} h={box.h} head="var(--lilac-soft)" headH={44}>
        <text x={box.x + 18} y={box.y + 28} className="title">
          {tr ? `${branch} branch'i` : `The ${branch} branch`}
        </text>
        <text x={box.x + box.w - 16} y={box.y + 28} textAnchor="end" className="sub">
          {tr ? "yeni üstte" : "newest first"}
        </text>
        {commits.slice(0, max).map((c, i) => {
          const run = runOf(c.sha);
          const top = box.y + 56;
          // Each row is drawn at the top and moved to its place, so a new commit pushes the others down.
          const y = top;
          const fill = run?.status === "failure" ? "var(--red-soft)" : run?.status === "success" ? "var(--mint-soft)" : "var(--paper-2)";
          const playing = replay && run && run.id === newest?.id ? replay : null;
          const done = playing ? playing.ms(run!.end) : 0;
          return (
            <motion.g key={c.sha} initial={mounted.current ? { y: -rowH, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.35 }}>
            <motion.g initial={mounted.current ? { y: 0 } : { y: i * rowH }} animate={{ y: i * rowH }} transition={{ duration: 0.35 }}>
              <rect x={box.x + 10} y={y} width={box.w - 20} height={rowH - 8} rx={10} className="sticker" style={{ fill: playing ? "var(--paper-2)" : fill, strokeWidth: 1.5 }} />
              {playing && (
                <motion.rect key={`${playing.key}-fill`} x={box.x + 10} y={y} width={box.w - 20} height={rowH - 8} rx={10} className="sticker" style={{ fill, strokeWidth: 1.5 }} {...appearAt(done)} />
              )}
              {playing && (
                <motion.g key={`${playing.key}-run`} {...visibleBetween(0, done)}>
                  <StatusDot status="pending" x={box.x + 28} y={y + 21} r={8} />
                </motion.g>
              )}
              <motion.g key={playing ? `${playing.key}-dot` : "dot"} {...(playing ? appearAt(done) : {})}>
              <StatusDot status={run ? run.status : "expected"} x={box.x + 28} y={y + 21} r={8} />
              {!run && (
                <text x={box.x + 28} y={y + 25} textAnchor="middle" className="mono" style={{ fontSize: 11 }}>
                  ?
                </text>
              )}
              <text x={box.x + 44} y={y + 17} className="mono" style={{ fontSize: 12 }}>
                {c.sha}
              </text>
              </motion.g>
              <motion.text key={playing ? `${playing.key}-txt` : "txt"} x={box.x + box.w - 20} y={y + 17} textAnchor="end" className="sub" style={{ fontSize: 11 }} {...(playing ? appearAt(done) : {})}>
                {run ? `CI #${run.id}: ${statusText(run.status, tr)}` : tr ? "kontrol yok" : "not checked"}
              </motion.text>
              <text x={box.x + 44} y={y + 34} className="muted" style={{ fontSize: 11.5 }}>
                {cut(c.message, chars)}
              </text>
            </motion.g>
            </motion.g>
          );
        })}
        {commits.length > max && (
          <text x={box.x + 18} y={box.y + box.h - 12} className="muted" style={{ fontSize: 11 }}>
            {tr ? `+${commits.length - max} eski commit` : `+${commits.length - max} older commits`}
          </text>
        )}
      </Sticker>
    </g>
  );
}
