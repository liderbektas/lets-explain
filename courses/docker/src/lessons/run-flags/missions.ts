import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { findContainer } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

const answered = (ctx: DockerCtx) => eventsOf(ctx, "curlResult").some((e) => e.port === 8080 && e.ok);

export const missions: Mission<DockerCtx>[] = [
  {
    id: "open-it",
    title: l("Tarayıcıdan aç", "Open it in a browser"),
    goal: l("`localhost:8080` cevap versin: nginx sayfası gelsin.", "Make `localhost:8080` answer with the nginx page."),
    hint: l("Container'ın portu kendiliğinden dışarı açılmaz.", "A container's port is not reachable from outside by itself."),
    par: 2,
    check: answered,
  },
  {
    id: "forgot-port",
    title: l("Portu unuttum", "Forgot the port"),
    goal: l(
      "`web`'i önce **portsuz** başlat, sonra düzelt: sonunda yine `web` adlı container `localhost:8080`'den cevap versin.",
      "Start `web` **without a port** first, then fix it: in the end a container still named `web` answers on `localhost:8080`.",
    ),
    hint: l("Çalışan bir container'ın portu sonradan eklenmez; aynı isim de iki kez kullanılamaz.", "You cannot add a port to a running container, and a name can only be used once."),
    par: 4,
    check: (ctx) => {
      const first = eventsOf(ctx, "created").find((e) => e.name === "web");
      const noPortFirst = ctx.states.some((s) => {
        const w = findContainer(s, "web");
        return w && w.ports.length === 0;
      });
      return Boolean(first) && noPortFirst && answered(ctx) && (findContainer(ctx.state, "web")?.ports.some((p) => p.host === 8080) ?? false);
    },
  },
  {
    id: "missing-setting",
    title: l("Eksik ayar", "Missing setting"),
    goal: l(
      "`api` önce ayarsız başlatılıp **exit code 1** ile kapansın, sonra doğru ayarla **çalışır** halde kalsın.",
      "Let `api` start without its setting and stop with **exit code 1**, then keep it **running** with the right setting.",
    ),
    hint: l("Kapanmış container da ismini tutar.", "An exited container still holds its name."),
    par: 3,
    check: (ctx) => eventsOf(ctx, "exited").some((e) => e.name === "api" && e.code === 1) && findContainer(ctx.state, "api")?.state === "running",
  },
];
