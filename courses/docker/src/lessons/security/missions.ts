import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { findContainer } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";
import { hasSecret } from "./SecurityPanel";

const apiImage = (ctx: DockerCtx) => {
  const c = findContainer(ctx.state, "api");
  return c?.state === "running" ? ctx.state.images[c.image] : undefined;
};

export const missions: Mission<DockerCtx>[] = [
  {
    id: "not-root",
    title: l("Root değil", "Not root"),
    goal: l(
      "`api` root olarak çalışıyor. Onu root **olmayan** bir kullanıcıyla çalıştır ve `whoami` ile kanıtla.",
      "`api` runs as root. Run it as a **non-root** user and prove it with `whoami`.",
    ),
    hint: l("Çalışan container'ın kullanıcısı değişmez: yeni image, yeni container.", "A running container's user does not change: new image, new container."),
    par: 4,
    check: (ctx) => eventsOf(ctx, "execOutput").some((e) => e.name === "api" && e.cmd === "whoami" && e.code === 0 && e.output[0] !== "root"),
  },
  {
    id: "no-secret",
    title: l("Sır dışarıda", "Secret stays out"),
    goal: l(
      "`api` çalışsın, ama image'ının **hiçbir katmanında** `.env` olmasın. Anahtar container'a dışarıdan gelsin.",
      "Keep `api` running, but with **no layer** of its image holding `.env`. The key comes in from outside.",
    ),
    hint: l("`.dockerignore`'a yazılan dosya build'e hiç girmez.", "A file listed in `.dockerignore` never enters the build."),
    par: 3,
    check: (ctx) => {
      const img = apiImage(ctx);
      return Boolean(img) && !hasSecret(img) && Boolean(findContainer(ctx.state, "api")?.env.API_KEY);
    },
  },
  {
    id: "no-shell",
    title: l("Kabuksuz", "No shell"),
    goal: l(
      "`api`'yi sırsız, root olmayan ve **içinde kabuk olmayan** bir image'dan çalıştır; `exec api sh`'ın açılmadığını gör.",
      "Run `api` from an image with no secret, no root and **no shell**; see `exec api sh` fail.",
    ),
    hint: l("Distroless image'larda sadece uygulamanın runtime'ı var.", "Distroless images hold only the app's runtime."),
    par: 4,
    check: (ctx) => {
      const img = apiImage(ctx);
      const c = findContainer(ctx.state, "api");
      return Boolean(img) && !hasSecret(img) && c?.user !== "root" && eventsOf(ctx, "execOutput").some((e) => e.name === "api" && e.cmd === "sh" && e.code === 127);
    },
  },
];
