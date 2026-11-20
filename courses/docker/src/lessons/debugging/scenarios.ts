import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, type DockerAction, type Host, type Instruction } from "../../engine/docker";
import type { DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";

const uploader = (tag: string, chown: boolean): DockerAction => ({
  type: "build",
  tag,
  context: { "server.js": "upload" },
  dockerfile: [
    { op: "FROM", image: "node:22-slim" },
    { op: "WORKDIR", path: "/app" },
    { op: "COPY", src: ["server.js"], dest: ".", ...(chown ? { chown: "node:node" } : {}) },
    { op: "USER", name: "node" },
    { op: "CMD", args: ["node", "server.js"], program: { kind: "app", listens: 3000, writes: "/app/uploads/photo.png" } },
  ] satisfies Instruction[],
});

const REPORT: DockerAction = {
  type: "build",
  tag: "acme/report:1.0",
  context: { "report.js": "big" },
  dockerfile: [
    { op: "FROM", image: "node:22-slim" },
    { op: "COPY", src: ["report.js"], dest: "/app/" },
    { op: "CMD", args: ["node", "/app/report.js"], program: { kind: "app", listens: 3000, memory: 300 } },
  ],
};

/** The team's images are built and nginx is pulled; nothing runs yet. */
export const MACHINE: Host = hostAfter([uploader("acme/uploader:1.0", false), uploader("acme/uploader:1.1", true), REPORT, { type: "pull", ref: "nginx:1.27" }], createHost());

const nginx = (name: string, extra: Partial<Extract<DockerAction, { type: "run" }>> = {}): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name, ...extra });

const runs = (h: Host, name: string) => findContainer(h, name)?.state === "running";

export const scenarios: DockerScenario[] = [
  {
    id: "exit-127",
    title: l("127 ile kapandı", "Exited with 127"),
    story: l(
      "Gece nöbetindeki arkadaşın `proxy` adlı nginx'i başlatmış ama `docker ps`'te yok. `docker ps -a` onu `Exited (127)` gösteriyor. Ne yazdığını hatırlamıyor.",
      "The colleague on night duty started an nginx called `proxy`, but it isn't in `docker ps`. `docker ps -a` shows it as `Exited (127)`. They don't remember what they typed.",
    ),
    goal: l("`proxy` nginx olarak **çalışır** halde olsun.", "`proxy` is **running** as nginx."),
    start: hostAfter([nginx("proxy", { cmd: ["ngnix", "-g", "daemon off;"] })], MACHINE),
    hints: [
      l("127 \"komut bulunamadı\" demek. `docker logs proxy` hangi komutun bulunamadığını söyler.", "127 means \"command not found\". `docker logs proxy` tells you which command wasn't found."),
      l("Komut container yaratılırken verilir; yeniden başlatmak aynı yanlış komutu çalıştırır. Sil ve komut vermeden başlat: image'ın kendi komutu doğru.", "The command is fixed when the container is created; restarting runs the same wrong command. Remove it and start it without a command: the image's own command is right."),
      l("`docker rm proxy` sonra `docker run -d --name proxy nginx:1.27`", "`docker rm proxy` then `docker run -d --name proxy nginx:1.27`"),
    ],
    par: 2,
    check: (ctx) => {
      const c = findContainer(ctx.state, "proxy");
      return c?.state === "running" && c.cmd.includes("nginx");
    },
  },
  {
    id: "no-root",
    title: l("Root'suz", "Without root"),
    story: l(
      "`uploader` açılır açılmaz \"EACCES: permission denied\" ile kapanıyor. Image ekibi `acme/uploader:1.1`'de dosya sahipliğini düzelttiğini söylüyor. Güvenlik kuralı net: container **root olarak çalışmayacak**.",
      "`uploader` exits with \"EACCES: permission denied\" as soon as it starts. The image team says they fixed file ownership in `acme/uploader:1.1`. The security rule is clear: the container **does not run as root**.",
    ),
    goal: l("`uploader` root olmayan bir kullanıcıyla **çalışır** halde olsun.", "`uploader` is **running** as a non-root user."),
    start: hostAfter([{ type: "run", image: "acme/uploader:1.0", detach: true, name: "uploader" }], MACHINE),
    hints: [
      l("`docker logs uploader` hangi dosyaya yazamadığını gösterir. `--user root` hatayı gizler ama kuralı çiğner.", "`docker logs uploader` shows which file it can't write. `--user root` hides the error but breaks the rule."),
      l("Düzeltme yeni image'da: eskisini sil, `acme/uploader:1.1` ile başlat.", "The fix is in the new image: remove the old one and start `acme/uploader:1.1`."),
      l("`docker rm uploader` sonra `docker run -d --name uploader acme/uploader:1.1`", "`docker rm uploader` then `docker run -d --name uploader acme/uploader:1.1`"),
    ],
    par: 2,
    check: (ctx) => {
      const c = findContainer(ctx.state, "uploader");
      return c?.state === "running" && c.user !== "root";
    },
  },
  {
    id: "never-started",
    title: l("Hiç başlamadı", "Never started"),
    story: l(
      "`site` 8080'de çalışıyor. İkinci kopya `site2`'yi de başlattın, ama `docker ps -a` onu `Created` gösteriyor: hiç çalışmamış. Komutu yazarken bir hata almıştın ama okumadan geçtin.",
      "`site` runs on 8080. You also started a second copy, `site2`, but `docker ps -a` shows it as `Created`: it never ran. You got an error when you typed the command but skipped past it.",
    ),
    goal: l("`site2` `localhost:8081`'den cevap versin; `site` 8080'de kalsın.", "`site2` answers on `localhost:8081`; `site` stays on 8080."),
    start: hostAfter([nginx("site", { ports: ["8080:80"] }), nginx("site2", { ports: ["8080:80"] })], MACHINE),
    hints: [
      l("`docker start site2` hatayı tekrar gösterir: port zaten başkasında.", "`docker start site2` shows the error again: the port belongs to someone else."),
      l("Port container yaratılırken verilir: `site2`'yi sil ve boş bir host portuyla yeniden başlat.", "The port is set when the container is created: remove `site2` and start it again with a free host port."),
      l("`docker rm site2` sonra `docker run -d --name site2 -p 8081:80 nginx:1.27`", "`docker rm site2` then `docker run -d --name site2 -p 8081:80 nginx:1.27`"),
    ],
    par: 2,
    check: (ctx) => {
      const s2 = findContainer(ctx.state, "site2");
      return runs(ctx.state, "site") && s2?.state === "running" && s2.ports.some((p) => p.host === 8081 && p.container === 80);
    },
  },
  {
    id: "exit-137",
    title: l("Her seferinde 137", "137 every time"),
    story: l(
      "Aylık `report` her çalıştığında `Exited (137)` ile bitiyor ve logun son satırı sadece \"Killed\". `--memory 128m` ile başlatılmış; raporun yaklaşık 300 MB'a ihtiyacı var. Sınır kalsın ama **512 MB** olsun.",
      "The monthly `report` ends with `Exited (137)` every time, and the last log line is just \"Killed\". It was started with `--memory 128m`; the report needs about 300 MB. Keep a limit, but make it **512 MB**.",
    ),
    goal: l("`report` 512 MB sınırla **çalışır** halde olsun.", "`report` is **running** with a 512 MB limit."),
    start: hostAfter([{ type: "run", image: "acme/report:1.0", detach: true, name: "report", memory: 128 }], MACHINE),
    hints: [
      l("137 ve OOMKilled: bellek sınırı aşıldı. `docker inspect -f '{{.State.OOMKilled}}' report` bunu doğrular.", "137 and OOMKilled: the memory limit was hit. `docker inspect -f '{{.State.OOMKilled}}' report` confirms it."),
      l("Sınır `run` ile verilir: sil, `--memory 512m` ile yeniden başlat.", "The limit is set with `run`: remove it and start again with `--memory 512m`."),
      l("`docker rm report` sonra `docker run -d --name report --memory 512m acme/report:1.0`", "`docker rm report` then `docker run -d --name report --memory 512m acme/report:1.0`"),
    ],
    par: 2,
    check: (ctx) => {
      const c = findContainer(ctx.state, "report");
      return c?.state === "running" && c.memoryLimit === 512;
    },
  },
];
