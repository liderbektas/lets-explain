import { useMemo } from "react";
import { l, useLang } from "@lets-explain/core/i18n";
import { useTicker } from "@lets-explain/core/lib/playback";
import { simulate, type DockerAction } from "./engine/docker";
import { DockStage } from "./iso/DockStage";
import { HOST_STAGE } from "./iso/stageKit";

const story: DockerAction[] = [
  { type: "pull", ref: "nginx:1.27" },
  { type: "run", image: "nginx:1.27", name: "web", ports: ["8080:80"], detach: true },
  { type: "networkCreate", name: "shop" },
  { type: "run", image: "postgres:17", name: "db", network: "shop", volumes: ["pgdata:/var/lib/postgresql/data"], env: { POSTGRES_PASSWORD: "pw" } },
  { type: "run", image: "redis:7", name: "cache", network: "shop" },
  { type: "tick", count: 2 },
  { type: "run", image: "hello-world", name: "hello" },
];

/** The course home loop: a few containers come up on one machine. */
export function DockerHero() {
  const { t } = useLang();
  const tick = useTicker(true, false, 1400) % (story.length + 3);
  const states = useMemo(() => simulate(story).states, []);
  const host = states[Math.min(tick, states.length - 1)]!;
  return (
    <svg className="stage-svg" viewBox={`0 0 ${HOST_STAGE.width} ${HOST_STAGE.height}`} aria-hidden="true">
      <DockStage
        host={host}
        t={t}
        labels={{
          images: t(l("Image'lar", "Images")),
          volumes: t(l("Volume'lar", "Volumes")),
          networks: t(l("Network'ler", "Networks")),
          running: t(l("çalışıyor", "running")),
          exited: t(l("kapandı", "exited")),
          created: t(l("oluşturuldu", "created")),
          noContainers: t(l("Henüz container yok", "No containers yet")),
          noImages: t(l("Henüz image yok", "No images yet")),
        }}
      />
    </svg>
  );
}
