import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, type DockerAction, type Host, type Program } from "../../engine/docker";
import type { DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";

const image = (tag: string, program: Program): DockerAction => ({
  type: "build",
  tag,
  context: { "main.js": tag },
  dockerfile: [
    { op: "FROM", image: "node:22-slim" },
    { op: "COPY", src: ["main.js"], dest: "/app/" },
    { op: "CMD", args: ["node", "/app/main.js"], program },
  ],
});

/** The team's images: an API that needs about 120 MB, a worker that fails while the queue is down, a backup job that succeeds. */
export const IMAGES: Host = hostAfter(
  [
    image("acme/api:2.0", { kind: "app", listens: 3000, memory: 120 }),
    image("acme/flaky:1.0", { kind: "job", output: ["connecting to queue…", "Error: queue not reachable"], exitCode: 1 }),
    image("acme/backup:1.0", { kind: "job", output: ["backup done"], exitCode: 0 }),
    { type: "pull", ref: "nginx:1.27" },
  ],
  createHost(),
);

export const scenarios: DockerScenario[] = [
  {
    id: "oom-at-start",
    title: l("137 ile kapandı", "Exited with 137"),
    story: l(
      "Dün gece biri `api`'yi `--memory 64m` ile başlatmış; `docker ps -a` onu `Exited (137)` gösteriyor. Uygulama yaklaşık 120 MB kullanıyor. Operasyon ekibi sınır olsun istiyor, ama yetecek kadar: **256 MB**.",
      "Last night someone started `api` with `--memory 64m`; `docker ps -a` shows it as `Exited (137)`. The app uses about 120 MB. The ops team wants a limit, but a big enough one: **256 MB**.",
    ),
    goal: l("`api` 256 MB bellek sınırıyla **çalışır** halde olsun.", "`api` is **running** with a 256 MB memory limit."),
    start: hostAfter([{ type: "run", image: "acme/api:2.0", detach: true, name: "api", memory: 64 }], IMAGES),
    hints: [
      l("137, çekirdeğin süreci öldürdüğü demek; `docker inspect -f '{{.State.OOMKilled}}' api` sebebin bellek olduğunu gösterir.", "137 means the kernel killed the process; `docker inspect -f '{{.State.OOMKilled}}' api` shows it was memory."),
      l("Aynı container'ı `start` etmek aynı sınırla yine öldürür. Sil ve `--memory 256m` ile yeniden başlat.", "Starting the same container hits the same limit again. Remove it and start again with `--memory 256m`."),
      l("`docker rm api` sonra `docker run -d --name api --memory 256m acme/api:2.0`", "`docker rm api` then `docker run -d --name api --memory 256m acme/api:2.0`"),
    ],
    par: 2,
    check: (ctx) => {
      const c = findContainer(ctx.state, "api");
      return c?.state === "running" && c.memoryLimit === 256;
    },
  },
  {
    id: "self-heal",
    title: l("Kendini toparlasın", "Let it recover"),
    story: l(
      "`flaky` worker'ı açılırken kuyruk henüz hazır değilse hata verip kapanıyor; birkaç deneme sonra kuyruk geliyor. Gece kimse başında olmayacak: çöktükçe Docker onu **kendisi** yeniden başlatmalı. Başlat ve birkaç saniye bekleyip izle.",
      "The `flaky` worker fails and exits when the queue isn't ready at startup; after a few tries the queue comes up. Nobody will be around tonight: Docker must restart it **itself** each time it crashes. Start it, wait a few seconds and watch.",
    ),
    goal: l("Docker `flaky`'yi çöktükçe kendiliğinden en az **2 kez** yeniden başlatsın.", "Docker restarts `flaky` on its own at least **2 times** as it crashes."),
    start: IMAGES,
    hints: [
      l("Restart policy olmadan çöken bir container kapalı kalır. `on-failure` sadece hata ile çıkınca yeniden başlatır.", "Without a restart policy a crashed container stays down. `on-failure` restarts it only when it exits with an error."),
      l("`--restart on-failure` ile başlat, sonra `sleep 3` ile bekle ve `docker ps -a`'ya bak.", "Start it with `--restart on-failure`, then wait with `sleep 3` and look at `docker ps -a`."),
      l("`docker run -d --name flaky --restart on-failure acme/flaky:1.0` sonra `sleep 3`", "`docker run -d --name flaky --restart on-failure acme/flaky:1.0` then `sleep 3`"),
    ],
    par: 2,
    check: (ctx) => (findContainer(ctx.state, "flaky")?.restarts ?? 0) >= 2,
  },
  {
    id: "backup-loop",
    title: l("Bitmeyen yedek", "The backup that never ends"),
    story: l(
      "Gece yedeğini alan `backup` işi biri tarafından `--restart always` ile başlatılmış: yedek başarıyla bitiyor, Docker onu yeniden başlatıyor, sonsuza kadar. Yedek bir kez bitsin ve öyle kalsın; ama hata verirse Docker yine denesin.",
      "The nightly `backup` job was started by someone with `--restart always`: the backup finishes fine, Docker starts it again, forever. It should finish once and stay done; but if it fails, Docker should still retry.",
    ),
    goal: l("`backup` hata durumunda yeniden başlayacak bir policy ile çalışıp **0 ile bitmiş** halde kalsın.", "`backup` runs with a policy that retries on failure, and stays **exited with 0**."),
    start: hostAfter([{ type: "run", image: "acme/backup:1.0", detach: true, name: "backup", restart: "always" }, { type: "tick", count: 2 }], IMAGES),
    hints: [
      l("`always` başarıyla biteni de yeniden başlatır. Sadece hatada yeniden başlatan bir policy var.", "`always` restarts even one that finished fine. There is a policy that restarts only on failure."),
      l("Policy çalışan bir container'da `run` ile verilir: sil ve `--restart on-failure` ile yeniden başlat.", "A policy is given with `run`: remove it and start again with `--restart on-failure`."),
      l("`docker rm -f backup` sonra `docker run -d --name backup --restart on-failure acme/backup:1.0`", "`docker rm -f backup` then `docker run -d --name backup --restart on-failure acme/backup:1.0`"),
    ],
    par: 2,
    check: (ctx) => {
      const c = findContainer(ctx.state, "backup");
      return c?.restart === "on-failure" && c.state === "exited" && c.exitCode === 0 && !c.pendingRestart;
    },
  },
  {
    id: "maintenance-mode",
    title: l("Bakımda kalsın", "Stay in maintenance"),
    story: l(
      "`web` normalde sunucu yeniden başlasa bile kendiliğinden geri gelmeli. Ama bakım için onu **elle** durdurduğunda, bu gece daemon yeniden başlasa bile kapalı kalmalı; yoksa yarım kalan bakım yayına çıkar. Doğru policy ile başlat, durdur ve daemon'ı yeniden başlatarak dene.",
      "`web` should normally come back by itself even when the server restarts. But when you stop it **by hand** for maintenance, it must stay down even if the daemon restarts tonight; otherwise half-done maintenance goes live. Start it with the right policy, stop it, and test by restarting the daemon.",
    ),
    goal: l("`web` elle durdurulduktan sonra daemon yeniden başlasın ve `web` **kapalı kalsın**; policy'si yine de yeniden başlatmalara dayanıklı olsun.", "After `web` is stopped by hand, the daemon restarts and `web` **stays down**, while its policy still survives restarts."),
    start: IMAGES,
    hints: [
      l("`always` elle durdurulmuş olanı bile daemon açılınca geri getirir; `unless-stopped` elle durdurulana dokunmaz.", "`always` brings back even one you stopped by hand when the daemon starts; `unless-stopped` leaves a hand-stopped one alone."),
      l("`--restart unless-stopped` ile başlat, `docker stop web`, sonra `sudo systemctl restart docker`.", "Start with `--restart unless-stopped`, `docker stop web`, then `sudo systemctl restart docker`."),
      l("`docker run -d --name web --restart unless-stopped nginx:1.27`, `docker stop web`, `sudo systemctl restart docker`", "`docker run -d --name web --restart unless-stopped nginx:1.27`, `docker stop web`, `sudo systemctl restart docker`"),
    ],
    par: 3,
    check: (ctx) => {
      const all = ctx.events.flat();
      const stopped = all.findIndex((e) => e.type === "exited" && e.name === "web" && e.reason === "stopped");
      const restarted = all.findIndex((e, i) => i > stopped && e.type === "daemonRestarted");
      const c = findContainer(ctx.state, "web");
      return stopped !== -1 && restarted !== -1 && c?.restart === "unless-stopped" && c.state === "exited";
    },
  },
];
