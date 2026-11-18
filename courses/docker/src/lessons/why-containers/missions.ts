import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

/** Index of the first move (in order) matching a test, or -1. */
function firstIndex(ctx: DockerCtx, test: (i: number) => boolean): number {
  for (let i = 0; i < ctx.events.length; i++) if (test(i)) return i;
  return -1;
}

const wroteIn = (ctx: DockerCtx, i: number, name: string) => ctx.events[i]!.some((e) => e.type === "wrote" && e.name === name);
const catIn = (ctx: DockerCtx, i: number, name: string, code: number) => ctx.events[i]!.some((e) => e.type === "execOutput" && e.name === name && e.cmd.startsWith("cat") && e.code === code);

export const missions: Mission<DockerCtx>[] = [
  {
    id: "three",
    title: l("Üç kardeş", "Three of a kind"),
    goal: l("Aynı image'dan **3 container** aynı anda çalışsın.", "Get **3 containers** from the same image running at once."),
    hint: l("Bir image'dan istediğin kadar container başlatabilirsin.", "One image can start as many containers as you like."),
    par: 3,
    check: (ctx) => Object.values(ctx.state.containers).filter((c) => c.state === "running").length >= 3,
  },
  {
    id: "own-room",
    title: l("Herkesin kendi odası", "A room of its own"),
    goal: l(
      "box1'e bir not yaz, sonra **box2**'de o notu ara ve **bulunmadığını** gör.",
      "Write a note in box1, then look for it in **box2** and see that it **is not there**.",
    ),
    hint: l("İki container aynı image'dan gelse de dosya sistemleri ayrıdır.", "Two containers from one image still have separate filesystems."),
    par: 4,
    check: (ctx) => {
      const wrote = firstIndex(ctx, (i) => wroteIn(ctx, i, "box1"));
      return wrote >= 0 && ctx.events.some((_, i) => i > wrote && catIn(ctx, i, "box2", 1));
    },
  },
  {
    id: "throwaway",
    title: l("Atılıp yeniden", "Thrown away"),
    goal: l(
      "box1'e not yaz, box1'i silip **aynı adla yeniden başlat** ve notun **kaybolduğunu** gör.",
      "Write a note in box1, remove box1, **start it again with the same name**, and see that the note **is gone**.",
    ),
    hint: l("Container'ın içine yazılan şey, container'la birlikte gider.", "What is written inside a container leaves with the container."),
    par: 5,
    check: (ctx) => {
      const wrote = firstIndex(ctx, (i) => wroteIn(ctx, i, "box1"));
      if (wrote < 0) return false;
      const removed = ctx.events.findIndex((evs, i) => i > wrote && evs.some((e) => e.type === "removed" && e.name === "box1"));
      if (removed < 0) return false;
      const again = ctx.events.findIndex((evs, i) => i > removed && evs.some((e) => e.type === "created" && e.name === "box1"));
      return again >= 0 && ctx.events.some((_, i) => i > again && catIn(ctx, i, "box1", 1)) && eventsOf(ctx, "created").length >= 2;
    },
  },
];
