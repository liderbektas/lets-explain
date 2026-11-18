import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { DockerCtx } from "../shared/DockerScene";
import { printed } from "./model";

/** What every finished (exit 0) container printed. */
const outputs = (ctx: DockerCtx) =>
  Object.values(ctx.state.containers)
    .filter((c) => c.state === "exited" && c.exitCode === 0)
    .map((c) => printed(c).join(" "));

export const missions: Mission<DockerCtx>[] = [
  {
    id: "hello-ada",
    title: l("Merhaba Ada", "Merhaba Ada"),
    goal: l("Ekranda tam olarak `Merhaba Ada` yazsın.", "Make the screen say exactly `Merhaba Ada`."),
    hint: l("ENTRYPOINT sabit kalır; image adından sonra yazdığın sadece CMD'nin yerini alır.", "ENTRYPOINT stays; what you type after the image only replaces CMD."),
    par: 1,
    check: (ctx) => outputs(ctx).includes("Merhaba Ada"),
  },
  {
    id: "fix-127",
    title: l("127'den kurtul", "Get past 127"),
    goal: l(
      "Bir container **exit code 127** ile kapansın, sonra **aynı image'dan** bir container 0 ile bitsin.",
      "Let a container stop with **exit code 127**, then have a container from **the same image** finish with 0.",
    ),
    hint: l("CMD'si olan bir image'a argüman verirsen, argüman komutun yerine geçer.", "Arguments given to an image with only a CMD replace the command."),
    par: 2,
    check: (ctx) => {
      const cs = Object.values(ctx.state.containers);
      const failed = cs.filter((c) => c.exitCode === 127);
      return failed.some((f) => cs.some((c) => c.image === f.image && c.exitCode === 0 && cs.indexOf(c) > cs.indexOf(f)));
    },
  },
  {
    id: "three-greetings",
    title: l("Üç selam", "Three greetings"),
    goal: l(
      "Üç farklı çıktıyı gör: `Merhaba`, `Merhaba dünya` ve `Merhaba Ada`.",
      "See three different outputs: `Merhaba`, `Merhaba dünya` and `Merhaba Ada`.",
    ),
    hint: l("İki image da \"Merhaba\" diyor ama biri CMD'yle, biri ENTRYPOINT'le.", "Both images say \"Merhaba\", one with CMD, the other with ENTRYPOINT."),
    par: 3,
    check: (ctx) => {
      const seen = new Set(outputs(ctx));
      return ["Merhaba", "Merhaba dünya", "Merhaba Ada"].every((s) => seen.has(s));
    },
  },
];
