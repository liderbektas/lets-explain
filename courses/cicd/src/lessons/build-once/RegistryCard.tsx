import { motion } from "motion/react";
import { useLang } from "@lets-explain/core/i18n";
import { commitOf, type World } from "../../engine/ci";
import { Crate, OBox } from "../../iso/factory";
import { cut, Sticker, type Box } from "../../iso/parts";
import { appearAt, stepTimes, useReplay } from "../../iso/replay";

/**
 * The image registry as a warehouse rack: one shelf per `sha-…` tag, newest at the bottom, the
 * image a crate on it, with the environments running that image written next to it. A broken build is marked 500.
 * Shared by the delivery lessons (build-once, environments, rollback). When the run that pushed
 * an image is played back, its tag appears once the push step has sent it.
 */
export function RegistryCard({ world, box, max = 5 }: { world: World; box: Box; max?: number }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  const tags = Object.keys(world.registry);
  const fit = Math.max(1, Math.min(max, Math.floor((box.h - 50) / 26)));
  const shown = tags.slice(-fit);
  const rowH = Math.min(30, (box.h - 46) / fit);
  const pusher = [...world.runs].reverse().find((r) => r.jobs.some((j) => j.steps.some((st) => st.kind === "docker-push" && st.status === "success")));
  const replay = useReplay(pusher);
  /** Screen time the run being played back pushed this tag, or 0 when it is not being played. */
  const pushedAt = (tag: string) => {
    if (!replay || !pusher || tag !== `sha-${pusher.sha}`) return 0;
    for (const j of pusher.jobs) {
      if (!replay.fresh(j)) continue;
      const k = j.steps.findIndex((st) => st.kind === "docker-push" && st.status === "success");
      if (k >= 0) return replay.ms(stepTimes(j)[k]!.end) + 400;
    }
    return 0;
  };
  return (
    <g className="ci">
      <Sticker x={box.x} y={box.y} w={box.w} h={box.h} head="var(--sky-soft)" headH={34}>
        <text x={box.x + 14} y={box.y + 22} className="title" style={{ fontSize: 13.5 }}>
          {tr ? "Registry" : "Registry"}
        </text>
        <text x={box.x + box.w - 12} y={box.y + 22} textAnchor="end" className="sub" style={{ fontSize: 10.5 }}>
          {tags.length > fit ? (tr ? `ghcr.io/ada/shop · +${tags.length - fit} eski` : `ghcr.io/ada/shop · +${tags.length - fit} older`) : "ghcr.io/ada/shop"}
        </text>
        {tags.length === 0 && (
          <text x={box.x + 14} y={box.y + 58} className="muted" style={{ fontSize: 11.5 }}>
            {tr ? "Henüz image yok" : "No images yet"}
          </text>
        )}
        {shown.map((tag, i) => {
          const sha = world.registry[tag]!;
          const y = box.y + 52 + i * rowH;
          const envs = Object.values(world.envs)
            .filter((e) => e.sha === sha)
            .map((e) => (e.name === "production" ? "prod" : e.name));
          const bad = commitOf(world, sha).bugs.includes("crash");
          const at = pushedAt(tag);
          const Row = at ? motion.g : "g";
          return (
            <Row key={at ? `${replay!.key}-${tag}` : tag} {...(at ? appearAt(at) : {})}>
              <OBox x={box.x + 10} y={y + rowH / 2 - 6} w={box.w - 34} h={4} d={10} front="#b4abc2" top="#ece8f1" side="#8f86a0" thin />
              <g transform={`translate(${box.x + 16} ${y - 1})`}>
                <Crate label={`:${tag}${bad ? " · 500" : ""}`} tone={bad ? "bad" : envs.length ? "node" : "image"} size={11} />
              </g>
              <text x={box.x + box.w - 18} y={y + 2} textAnchor="end" className="sub" style={{ fontSize: 10.5, fill: "var(--ink)" }}>
                {cut(envs.join(", "), 18)}
              </text>
            </Row>
          );
        })}
      </Sticker>
    </g>
  );
}
