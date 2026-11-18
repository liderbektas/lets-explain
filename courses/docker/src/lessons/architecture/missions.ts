import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { findContainer } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";

/** Moves that restarted the daemon, by index. */
const restarts = (ctx: DockerCtx) => ctx.actions.map((a, i) => (a.type === "daemonRestart" ? i : -1)).filter((i) => i >= 0);

export const missions: Mission<DockerCtx>[] = [
  {
    id: "no-pull",
    title: l("Pull'suz", "No pull"),
    goal: l(
      "nginx ve redis **ikisi de çalışsın**, ama `docker pull` hiç kullanma.",
      "Get nginx and redis **both running** without ever using `docker pull`.",
    ),
    hint: l("Daemon, elinde olmayan bir image'ı run sırasında kendisi indirir.", "The daemon pulls a missing image by itself during run."),
    par: 2,
    check: (ctx) =>
      !ctx.actions.some((a) => a.type === "pull") && findContainer(ctx.state, "web")?.state === "running" && findContainer(ctx.state, "cache")?.state === "running",
  },
  {
    id: "survivor",
    title: l("Hayatta kalan", "Survivor"),
    goal: l(
      "web çalışırken daemon yeniden başlasın, ve **sonra da** web kendiliğinden çalışıyor olsun.",
      "Restart the daemon while web is running, and **afterwards** web is running again by itself.",
    ),
    hint: l("Container'a daemon geri gelince ne yapacağını önceden söyleyebilirsin.", "You can tell a container in advance what to do when the daemon comes back."),
    par: 2,
    check: (ctx) => {
      const r = restarts(ctx);
      return (
        r.some((i) => findContainer(ctx.states[i]!, "web")?.state === "running" && ctx.events[i]!.some((e) => e.type === "daemonRestarted" && e.started.includes("web"))) &&
        findContainer(ctx.state, "web")?.state === "running"
      );
    },
  },
  {
    id: "bring-back",
    title: l("Geri getir", "Bring it back"),
    goal: l(
      "Restart policy'si **olmayan** bir web daemon yeniden başlayınca kapansın; sonra onu silip yeniden yaratmadan **`docker start`** ile geri getir.",
      "Let a web **without** a restart policy stop when the daemon restarts, then bring it back with **`docker start`**, without removing and recreating it.",
    ),
    hint: l("Kapanmış container silinmez; durduğu yerden yeniden başlatılabilir.", "An exited container is not gone; it can be started again."),
    par: 3,
    check: (ctx) =>
      restarts(ctx).some((i) => {
        const before = findContainer(ctx.states[i]!, "web");
        if (!before || before.state !== "running" || before.restart !== "no") return false;
        const startedLater = ctx.actions.some((a, k) => k > i && a.type === "start" && a.container === "web");
        const now = findContainer(ctx.state, "web");
        return startedLater && now?.id === before.id && now.state === "running";
      }),
  },
];
