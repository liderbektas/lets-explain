import { l } from "@lets-explain/core/i18n";
import { imageFor, normalize } from "../../engine/docker";
import type { DockerCtx, DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";
import { START } from "./model";

/**
 * What each finished container printed, by the image it came from: read from the events, so
 * containers removed with --rm still count.
 */
export function printedRuns(ctx: DockerCtx): { ref: string; cmd0: string; lines: string[]; code: number }[] {
  const out: { name: string; ref: string; cmd0: string; lines: string[]; code: number | null }[] = [];
  for (const [i, evs] of ctx.events.entries()) {
    const action = ctx.actions[i];
    for (const e of evs) {
      if (e.type === "created") {
        // The first word of PID 1: the ENTRYPOINT (given or the image's), else the command.
        const img = imageFor(ctx.states[i + 1] ?? ctx.state, e.ref);
        const opts = action && (action.type === "run" || action.type === "create") ? action : undefined;
        const ep = opts?.entrypoint ?? img?.config.entrypoint ?? [];
        const cmd0 = ep[0] ?? (opts?.cmd ?? img?.config.cmd ?? [])[0] ?? "";
        out.push({ name: e.name, ref: e.ref, cmd0, lines: [], code: null });
        continue;
      }
      const run = [...out].reverse().find((r) => "name" in e && r.name === e.name);
      if (!run) continue;
      if (e.type === "log") run.lines.push(e.line);
      if (e.type === "exited") run.code = e.code;
    }
  }
  return out.filter((r) => r.code !== null).map((r) => ({ ref: r.ref, cmd0: r.cmd0, lines: r.lines, code: r.code! }));
}

const said = (ctx: DockerCtx, text: string, ref?: string) => printedRuns(ctx).some((r) => r.code === 0 && r.lines.includes(text) && (!ref || r.ref === normalize(ref)));

export const scenarios: DockerScenario[] = [
  {
    id: "hello-ada",
    title: l("Ada'ya selam", "Say hi to Ada"),
    story: l(
      "Selamlama servisi `acme/greet:ep` varsayılan olarak `Merhaba dünya` diyor. Yarınki demoda ekranda Ada'nın adını görmek istiyorlar. Image'ı değiştirmek yok.",
      "The greeting service `acme/greet:ep` says `Merhaba dünya` by default. For tomorrow's demo they want Ada's name on screen. No changing the image.",
    ),
    goal: l("Bir container ekrana tam olarak `Merhaba Ada` yazsın.", "A container prints exactly `Merhaba Ada`."),
    start: START,
    hints: [
      l("`docker run IMAGE`'dan sonra yazdıkların image'ın CMD'sinin yerini alır. Bu image'da ENTRYPOINT `echo Merhaba`, CMD `dünya`.", "Whatever you type after `docker run IMAGE` replaces the image's CMD. This image's ENTRYPOINT is `echo Merhaba`, its CMD is `dünya`."),
      l("ENTRYPOINT sabit kalır; sadece `dünya`'nın yerine `Ada` yazman yeter.", "ENTRYPOINT stays; you only need to put `Ada` where `dünya` was."),
      l("`docker run acme/greet:ep Ada`", "`docker run acme/greet:ep Ada`"),
    ],
    par: 1,
    check: (ctx) => said(ctx, "Merhaba Ada"),
  },
  {
    id: "exit-127",
    title: l("Exit 127", "Exit 127"),
    story: l(
      "Bir takım arkadaşın `docker run acme/greet:cmd Ada` yazdı ve container `exit 127` ile kapandı: `exec: \"Ada\": executable file not found`. Bu image'da ENTRYPOINT yok, sadece `CMD [\"echo\", \"Merhaba\"]` var.",
      "A teammate typed `docker run acme/greet:cmd Ada` and the container stopped with `exit 127`: `exec: \"Ada\": executable file not found`. This image has no ENTRYPOINT, only `CMD [\"echo\", \"Merhaba\"]`.",
    ),
    goal: l("**Aynı image'la** (`acme/greet:cmd`) ekrana `Merhaba Ada` yazdır.", "With **the same image** (`acme/greet:cmd`), print `Merhaba Ada`."),
    start: hostAfter([{ type: "run", image: "acme/greet:cmd", cmd: ["Ada"] }], START),
    hints: [
      l("ENTRYPOINT yokken image adından sonra yazdığın her şey **komutun tamamı** olur. `Ada` diye bir program yok.", "Without an ENTRYPOINT, whatever you type after the image name becomes **the whole command**. There's no program called `Ada`."),
      l("Programı da kendin yazman gerekiyor: `echo` ve ardından söylenecek söz.", "You have to type the program too: `echo`, then the words to say."),
      l("`docker run acme/greet:cmd echo Merhaba Ada`", "`docker run acme/greet:cmd echo Merhaba Ada`"),
    ],
    par: 1,
    check: (ctx) => said(ctx, "Merhaba Ada", "acme/greet:cmd"),
  },
  {
    id: "look-inside",
    title: l("İçine bak", "Look inside"),
    story: l(
      "`acme/greet:ep` image'ında hangi klasörler var, merak ediyorsun. Ama ona ne yazarsan ekrana geri yazıyor: `docker run acme/greet:ep ls /` sadece `Merhaba ls /` diyor.",
      "You want to see which folders the `acme/greet:ep` image has. But it echoes back whatever you give it: `docker run acme/greet:ep ls /` just says `Merhaba ls /`.",
    ),
    goal: l("`acme/greet:ep` image'ından bir container'da `ls /` çalışsın ve kök klasörü listelesin.", "Run `ls /` in a container from `acme/greet:ep` and list its root folder."),
    start: START,
    hints: [
      l("Argümanlar ENTRYPOINT'e eklenir; ENTRYPOINT'in kendisini değiştirmek için `docker run`'ın ayrı bir seçeneği var.", "Arguments are added to the ENTRYPOINT; `docker run` has a separate option to replace the ENTRYPOINT itself."),
      l("`--entrypoint ls` programı değiştirir; image adından sonra gelen `/` ona argüman olur.", "`--entrypoint ls` swaps the program; the `/` after the image name becomes its argument."),
      l("`docker run --entrypoint ls acme/greet:ep /`", "`docker run --entrypoint ls acme/greet:ep /`"),
    ],
    par: 1,
    check: (ctx) => printedRuns(ctx).some((r) => r.ref === normalize("acme/greet:ep") && r.cmd0 === "ls" && r.code === 0 && r.lines.includes("etc")),
  },
  {
    id: "own-greeter",
    title: l("Kendi selamlayıcın", "Your own greeter"),
    story: l(
      "Ekip kendi selamlama image'ını istiyor, adı `greet`. `docker run greet` yazınca `Merhaba dünya` desin, `docker run greet Ada` yazınca `Merhaba Ada` desin. Proje klasöründe henüz Dockerfile yok; `alpine:3.20` makinede hazır.",
      "The team wants its own greeting image called `greet`. `docker run greet` should say `Merhaba dünya`, and `docker run greet Ada` should say `Merhaba Ada`. The project folder has no Dockerfile yet; `alpine:3.20` is on the machine.",
    ),
    goal: l("`greet` image'ından iki container: biri `Merhaba dünya`, öbürü `Merhaba Ada` yazsın.", "Two containers from the `greet` image: one prints `Merhaba dünya`, the other `Merhaba Ada`."),
    start: START,
    hints: [
      l("Hep çalışacak kısım ile değiştirilebilir varsayılan kısım ayrı satırlarda durur: biri ENTRYPOINT, öbürü CMD.", "The part that always runs and the default that can be replaced go on separate lines: one is ENTRYPOINT, the other CMD."),
      l("`ENTRYPOINT [\"echo\", \"Merhaba\"]` ve `CMD [\"dünya\"]`. Build et, sonra iki şekilde çalıştır.", "`ENTRYPOINT [\"echo\", \"Merhaba\"]` and `CMD [\"dünya\"]`. Build it, then run it both ways."),
      l(
        "`nano Dockerfile`: `FROM alpine:3.20` / `ENTRYPOINT [\"echo\", \"Merhaba\"]` / `CMD [\"dünya\"]`; sonra `docker build -t greet .`, `docker run greet`, `docker run greet Ada`",
        "`nano Dockerfile`: `FROM alpine:3.20` / `ENTRYPOINT [\"echo\", \"Merhaba\"]` / `CMD [\"dünya\"]`; then `docker build -t greet .`, `docker run greet`, `docker run greet Ada`",
      ),
    ],
    par: 4,
    check: (ctx) => said(ctx, "Merhaba dünya", "greet") && said(ctx, "Merhaba Ada", "greet"),
  },
];
