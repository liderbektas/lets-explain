import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { imageFor, type Image } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";

const built = (ctx: DockerCtx): Image | undefined => imageFor(ctx.state, "my-app");
const files = (img: Image) => Object.assign({}, ...img.layers.map((x) => x.files)) as Record<string, string>;
const runsServer = (img: Image) => JSON.stringify(img.config.cmd) === JSON.stringify(["node", "server.js"]);

export const missions: Mission<DockerCtx>[] = [
  {
    id: "first-image",
    title: l("İlk image", "First image"),
    goal: l("`my-app` adında, başlayınca `node server.js` çalıştıran bir image build et.", "Build an image called `my-app` that runs `node server.js` when it starts."),
    hint: l("Her Dockerfile bir FROM ile başlar; ne çalışacağını CMD söyler.", "Every Dockerfile starts with FROM; CMD says what runs."),
    par: 3,
    check: (ctx) => {
      const img = built(ctx);
      return Boolean(img && runsServer(img));
    },
  },
  {
    id: "with-deps",
    title: l("Bağımlılıklarla", "With dependencies"),
    goal: l(
      "Image'da hem `server.js` olsun hem de `npm ci` ile kurulmuş bağımlılıklar. `npm ci`, `package.json` image'a kopyalandıktan **sonra** çalışmalı.",
      "The image holds both `server.js` and dependencies installed by `npm ci`. `npm ci` must run **after** `package.json` is copied in.",
    ),
    hint: l("RUN, o ana kadar kopyalanan dosyaları görür.", "A RUN sees only the files copied so far."),
    par: 4,
    check: (ctx) => {
      const img = built(ctx);
      if (!img) return false;
      const npm = img.layers.findIndex((x) => x.instruction === "RUN npm ci");
      const pkg = img.layers.findIndex((x) => Object.keys(x.files).some((p) => p.endsWith("package.json")));
      return npm > 0 && pkg >= 0 && pkg < npm && Object.keys(files(img)).some((p) => p.endsWith("server.js"));
    },
  },
  {
    id: "right-place",
    title: l("Doğru klasörde", "In the right folder"),
    goal: l("Kod image'ın içinde `/app/server.js` olarak dursun ve container başlayınca `node server.js` çalışsın.", "The code sits at `/app/server.js` in the image, and the container runs `node server.js` when it starts."),
    hint: l("COPY'nin hedefi `.` ise dosyalar o anki çalışma klasörüne gider.", "When COPY's target is `.`, files go to the current working directory."),
    par: 5,
    check: (ctx) => {
      const img = built(ctx);
      return Boolean(img && runsServer(img) && files(img)["/app/server.js"] !== undefined);
    },
  },
];
