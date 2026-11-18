import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { findContainer } from "../../engine/docker";
import type { DockerCtx } from "../shared/DockerScene";
import { eventsOf } from "../shared/missionHelpers";

export const missions: Mission<DockerCtx>[] = [
  {
    id: "fix-api",
    title: l("api'yi düzelt", "Fix the api"),
    goal: l(
      "`api` kapanmış. Sebebi terminalde, loglarda yazıyor. Onu **çalışır** hale getir.",
      "`api` has stopped. The reason is in its logs in the terminal. Get it **running**.",
    ),
    hint: l("Log ne eksik diyor? Ayarlar container başlarken verilir.", "What do the logs say is missing? Settings are given when a container starts."),
    par: 2,
    check: (ctx) => findContainer(ctx.state, "api")?.state === "running",
  },
  {
    id: "no-root",
    title: l("Root'a kaçmadan", "Without running as root"),
    goal: l(
      "`uploader` izin hatasıyla kapandı. Onu çalıştır, ama **root olmadan**: `--user root` hile sayılır.",
      "`uploader` stopped with a permission error. Get it running, but **not as root**: `--user root` is cheating.",
    ),
    hint: l("Sorun kullanıcıda değil, klasörün sahibinde. 1.1 sürümü dosyaları `--chown` ile kopyalıyor.", "The problem is not the user but who owns the folder. Version 1.1 copies files with `--chown`."),
    par: 2,
    check: (ctx) => {
      const u = findContainer(ctx.state, "uploader");
      return u?.state === "running" && u.user !== "root";
    },
  },
  {
    id: "second-site",
    title: l("İkinci site", "A second site"),
    goal: l(
      "`site2`'yi önce **8080** ile başlatmayı dene (çakışmayı gör), sonra düzelt: `localhost:8081` cevap versin.",
      "First try to start `site2` on **8080** (see the clash), then fix it so `localhost:8081` answers.",
    ),
    hint: l("Başlayamayan container da adını tutar.", "A container that never started still holds its name."),
    par: 4,
    check: (ctx) =>
      eventsOf(ctx, "error").some((e) => e.message.includes("port is already allocated")) && eventsOf(ctx, "curlResult").some((e) => e.port === 8081 && e.ok),
  },
];
