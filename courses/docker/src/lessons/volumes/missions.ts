import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { DockerEvent } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";

/** Every event with the index of the move that produced it, so missions can check order. */
function timeline(ctx: DockerCtx): { i: number; e: DockerEvent }[] {
  return ctx.events.flatMap((evs, i) => evs.map((e) => ({ i, e })));
}

const isCat = (e: DockerEvent, code: number) => e.type === "execOutput" && e.cmd === "cat /data/note.txt" && e.code === code;

export const missions: Mission<DockerCtx>[] = [
  {
    id: "survivor",
    title: l("Hayatta kalan not", "The surviving note"),
    goal: l(
      "Bir not yaz, `app`'i **sil**, sonra yeni bir `app` başlatıp notu `cat` ile geri oku.",
      "Write a note, **remove** `app`, then start a new `app` and read the note back with `cat`.",
    ),
    hint: l("Container silinince kendi katmanı da gider; volume gitmez.", "Removing a container removes its own layer; a volume stays."),
    par: 5,
    check: (ctx) => {
      const t = timeline(ctx);
      const wrote = t.find((x) => x.e.type === "wrote");
      const removed = wrote && t.find((x) => x.i > wrote.i && x.e.type === "removed");
      return Boolean(removed && t.some((x) => x.i > removed.i && isCat(x.e, 0)));
    },
  },
  {
    id: "drop-volume",
    title: l("Volume'u sil", "Delete the volume"),
    goal: l(
      "Bir notu bir **volume**'a yaz, sonra o volume'u sil. İpucu: kullanımdaki bir volume silinmez.",
      "Write a note into a **volume**, then delete that volume. Note: a volume in use cannot be deleted.",
    ),
    hint: l("Önce volume'u kullanan container'ı kaldır.", "Remove the container using the volume first."),
    par: 4,
    check: (ctx) => {
      const t = timeline(ctx);
      const wrote = t.find((x) => x.e.type === "wrote" && x.e.where === "volume");
      return Boolean(wrote && t.some((x) => x.i > wrote.i && x.e.type === "volumeRemoved"));
    },
  },
  {
    id: "lost-note",
    title: l("Kaybolan not", "The lost note"),
    goal: l(
      "Notu volume **olmadan** yaz ve kaybolduğunu kanıtla: container'ı silip yenisinde `cat` başarısız olsun.",
      "Write the note **without** a volume and prove it is lost: remove the container and let `cat` fail in the new one.",
    ),
    hint: l("Volume'suz yazılan dosya container'ın kendi katmanına gider.", "A file written without a volume goes into the container's own layer."),
    par: 5,
    check: (ctx) => {
      const t = timeline(ctx);
      const wrote = t.find((x) => x.e.type === "wrote" && x.e.where === "layer");
      const removed = wrote && t.find((x) => x.i > wrote.i && x.e.type === "removed");
      return Boolean(removed && t.some((x) => x.i > removed.i && isCat(x.e, 1)));
    },
  },
];
