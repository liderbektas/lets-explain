import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { findContainer } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

const handledBig = (ctx: DockerCtx) => eventsOf(ctx, "log").some((e) => e.name === "api" && e.line.includes("300MB"));

export const missions: Mission<DockerCtx>[] = [
  {
    id: "big-request",
    title: l("Büyük istek", "A big request"),
    goal: l(
      "`api` bir **bellek sınırıyla** çalışsın ve 300 MB'lık isteği çökmeden karşılasın.",
      "Run `api` **with a memory limit** and have it handle the 300 MB request without crashing.",
    ),
    hint: l("Sınır, uygulamanın en yoğun anına yetmeli.", "The limit has to cover the app's busiest moment."),
    par: 2,
    check: (ctx) => {
      const a = findContainer(ctx.state, "api");
      return a?.state === "running" && a.memoryLimit !== undefined && handledBig(ctx);
    },
  },
  {
    id: "oom-then-fix",
    title: l("OOM'u gör, düzelt", "See OOM, then fix it"),
    goal: l(
      "`api` önce bellek yüzünden **137** ile öldürülsün, sonra yeterli bir sınırla **çalışır** halde kalsın.",
      "Let `api` be killed with **137** for memory first, then keep it **running** with a big enough limit.",
    ),
    hint: l("api kendi başına yaklaşık 120 MB kullanıyor.", "api uses about 120 MB on its own."),
    par: 3,
    check: (ctx) => {
      const a = findContainer(ctx.state, "api");
      return eventsOf(ctx, "exited").some((e) => e.name === "api" && e.code === 137 && e.reason === "oom") && a?.state === "running" && a.memoryLimit !== undefined;
    },
  },
  {
    id: "self-heal",
    title: l("Kendini toparlasın", "Let it pick itself up"),
    goal: l(
      "`flaky` çöktükçe Docker onu **kendiliğinden** yeniden başlatsın: en az **2** kez.",
      "Have Docker restart `flaky` **on its own** each time it crashes: at least **2** times.",
    ),
    hint: l("Restart policy container başlarken verilir; yeniden başlatma zamanla olur.", "A restart policy is set when the container starts; the restarts happen over time."),
    par: 3,
    check: (ctx) => (findContainer(ctx.state, "flaky")?.restarts ?? 0) >= 2,
  },
];
