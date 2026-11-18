import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

/** Event types for `web`, in order, across the whole try-it run. */
const trail = (ctx: DockerCtx) =>
  ctx.events
    .flat()
    .filter((e) => "name" in e && e.name === "web")
    .map((e) => e.type);

/** Did these event types happen for `web` in this order (with anything in between)? */
const inOrder = (seq: string[], want: string[]) => {
  let i = 0;
  for (const s of seq) if (s === want[i]) i += 1;
  return i === want.length;
};

const notes = (ctx: DockerCtx) => eventsOf(ctx, "execOutput").filter((e) => e.name === "web" && e.cmd.startsWith("cat"));

export const missions: Mission<DockerCtx>[] = [
  {
    id: "full-circle",
    title: l("Tam tur", "Full circle"),
    goal: l(
      "`web` dört halin hepsinden geçsin: **oluşturuldu → çalışıyor → kapandı → silindi**.",
      "Take `web` through all four states: **created → running → exited → removed**.",
    ),
    hint: l("`docker run` iki hali birden yapar: create ve start.", "`docker run` does two states at once: create and start."),
    par: 3,
    check: (ctx) => inOrder(trail(ctx), ["created", "started", "exited", "removed"]),
  },
  {
    id: "keep-note",
    title: l("Not duruyor mu?", "Is the note still there?"),
    goal: l(
      "Container'a bir not yaz, container'ı **durdur**, yeniden başlat ve notu oku: not hâlâ orada olsun.",
      "Write a note in the container, **stop** it, start it again and read the note: it is still there.",
    ),
    hint: l("Durdurmak container'ı silmez; dosyaları kendi katmanında durur.", "Stopping does not remove the container; its files stay in its own layer."),
    par: 5,
    check: (ctx) => {
      const seq = trail(ctx);
      const found = notes(ctx).some((e) => e.code === 0);
      return found && inOrder(seq, ["wrote", "exited", "started", "execOutput"]) && notes(ctx).at(-1)!.code === 0;
    },
  },
  {
    id: "gone-with-it",
    title: l("Silinince gider", "Gone with it"),
    goal: l(
      "Not yaz, container'ı **sil**, aynı isimle yenisini başlat ve notu okumayı dene: not bulunamasın.",
      "Write a note, **remove** the container, start a new one with the same name and try to read the note: it is not found.",
    ),
    hint: l("Container'ın kendi katmanı container'la birlikte silinir.", "A container's own layer is removed with it."),
    par: 5,
    check: (ctx) => {
      const seq = trail(ctx);
      return inOrder(seq, ["wrote", "removed", "created", "execOutput"]) && notes(ctx).some((e) => e.code !== 0);
    },
  },
];
