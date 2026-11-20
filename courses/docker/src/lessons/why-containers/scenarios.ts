import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, normalize, type DockerAction, type Host } from "../../engine/docker";
import type { DockerCtx, DockerScenario } from "../shared/DockerScene";
import { hostAfter } from "../shared/missionHelpers";

const run = (name: string): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name });

/** A machine with Docker and the nginx image, nothing running. */
export const MACHINE: Host = hostAfter([{ type: "pull", ref: "nginx:1.27" }], createHost());

const runningNginx = (h: Host, name: string) => {
  const c = findContainer(h, name);
  return c?.state === "running" && c.ref === normalize("nginx:1.27");
};

/** A file was written in `from`, and after that a `cat` of it failed in `other`. */
function provedApart(ctx: DockerCtx, from: string, other: string): boolean {
  const all = ctx.events.flat();
  const at = all.findIndex((e) => e.type === "wrote" && e.name === from);
  if (at === -1) return false;
  const wrote = all[at]!;
  const path = wrote.type === "wrote" ? wrote.path : "";
  return all.slice(at + 1).some((e) => e.type === "execOutput" && e.name === other && e.cmd.includes(path) && e.code !== 0);
}

export const scenarios: DockerScenario[] = [
  {
    id: "three-copies",
    title: l("Üç kopya", "Three copies"),
    story: l(
      "Yük testi için aynı web sunucusundan **üç tane** lazım, bu makinede ve aynı anda. Ekip onlara `web-1`, `web-2`, `web-3` diyor. `nginx:1.27` image'ı makinede hazır.",
      "For a load test you need **three** of the same web server on this machine, at the same time. The team calls them `web-1`, `web-2`, `web-3`. The `nginx:1.27` image is already here.",
    ),
    goal: l("`web-1`, `web-2` ve `web-3` aynı `nginx:1.27` image'ından çalışsın.", "`web-1`, `web-2` and `web-3` all run from the same `nginx:1.27` image."),
    start: MACHINE,
    hints: [
      l("Bir image'dan istediğin kadar container başlatabilirsin; her biri ayrı bir kopya.", "One image can start as many containers as you like; each is a separate copy."),
      l("Her biri için `docker run -d --name <ad> nginx:1.27`.", "For each one, `docker run -d --name <name> nginx:1.27`."),
      l("`docker run -d --name web-1 nginx:1.27`, sonra aynısı `web-2` ve `web-3` için", "`docker run -d --name web-1 nginx:1.27`, then the same for `web-2` and `web-3`"),
    ],
    par: 3,
    check: (ctx) => ["web-1", "web-2", "web-3"].every((n) => runningNginx(ctx.state, n)),
  },
  {
    id: "own-files",
    title: l("Herkesin kendi dosyası", "Each its own files"),
    story: l(
      "`web-1` ve `web-2` aynı image'dan çalışıyor. Bir arkadaşın \"aynı image'dan geldikleri için birine yazdığın dosya ötekinde de görünür\" diyor. Ona göstermen gerekiyor.",
      "`web-1` and `web-2` run from the same image. A friend says \"they come from the same image, so a file you write in one shows up in the other\". You need to show them.",
    ),
    goal: l("`web-1`'e bir dosya yaz, sonra **aynı dosyayı** `web-2`'de oku ve **bulunamadığını** gör.", "Write a file in `web-1`, then read **the same file** in `web-2` and see that **it isn't there**."),
    start: hostAfter([run("web-1"), run("web-2")], MACHINE),
    hints: [
      l("`docker exec <container> <komut>` çalışan bir container'ın içinde komut çalıştırır.", "`docker exec <container> <command>` runs a command inside a running container."),
      l("Yazmak için `sh -c 'echo … > /tmp/note.txt'`, okumak için `cat /tmp/note.txt`.", "To write, `sh -c 'echo … > /tmp/note.txt'`; to read, `cat /tmp/note.txt`."),
      l("`docker exec web-1 sh -c 'echo merhaba > /tmp/note.txt'` sonra `docker exec web-2 cat /tmp/note.txt`", "`docker exec web-1 sh -c 'echo hello > /tmp/note.txt'` then `docker exec web-2 cat /tmp/note.txt`"),
    ],
    par: 2,
    check: (ctx) => provedApart(ctx, "web-1", "web-2"),
  },
  {
    id: "replace-not-repair",
    title: l("Tamir etme, yenile", "Replace, don't repair"),
    story: l(
      "Biri `web-1`'in içine elle bozuk bir `/tmp/broken.conf` bırakmış. Ekibin kuralı açık: çalışan container'ı içeride tamir etmeyiz, atıp aynı image'dan yenisini başlatırız.",
      "Someone left a broken `/tmp/broken.conf` inside `web-1` by hand. The team's rule is clear: we don't repair a running container from inside, we throw it away and start a new one from the same image.",
    ),
    goal: l("Yine `web-1` adlı, ama **yepyeni** bir container çalışsın; bozuk dosya içinde olmasın.", "A container still named `web-1` runs, but a **brand-new** one, without the broken file."),
    start: hostAfter([run("web-1"), { type: "write", container: "web-1", path: "/tmp/broken.conf", content: "listen ???" }], MACHINE),
    hints: [
      l("Yeniden başlatmak (`restart`) aynı container'ı açar; içindeki dosyalar durur.", "Restarting (`restart`) brings back the same container; its files stay."),
      l("Önce `docker rm -f web-1` ile at, sonra aynı adla yeniden `docker run`.", "Throw it away with `docker rm -f web-1`, then `docker run` again under the same name."),
      l("`docker rm -f web-1` sonra `docker run -d --name web-1 nginx:1.27`", "`docker rm -f web-1` then `docker run -d --name web-1 nginx:1.27`"),
    ],
    par: 2,
    check: (ctx) => {
      const old = findContainer(ctx.start, "web-1")!;
      const now = findContainer(ctx.state, "web-1");
      return Boolean(now && now.id !== old.id && runningNginx(ctx.state, "web-1") && now.files["/tmp/broken.conf"] === undefined);
    },
  },
  {
    id: "clean-up",
    title: l("Test bitti", "Test over"),
    story: l(
      "Yük testi bitti. `web-1`, `web-2` ve `web-3` hâlâ çalışıyor. Hepsi gitsin, ama yarın tekrar test edeceğin için image dursun; yeniden indirmek istemiyorsun.",
      "The load test is over. `web-1`, `web-2` and `web-3` are still running. They should all go, but keep the image: you'll test again tomorrow and don't want to download it again.",
    ),
    goal: l("Hiç container kalmasın; `nginx:1.27` image'ı makinede dursun.", "No containers left; the `nginx:1.27` image stays on the machine."),
    start: hostAfter([run("web-1"), run("web-2"), run("web-3")], MACHINE),
    hints: [
      l("Çalışan bir container'ı silmek için önce durdurmak ya da `-f` gerekir. Image'a dokunma.", "Removing a running container takes stopping it first, or `-f`. Leave the image alone."),
      l("`docker rm -f` birden fazla ad alır.", "`docker rm -f` takes several names."),
      l("`docker rm -f web-1 web-2 web-3`", "`docker rm -f web-1 web-2 web-3`"),
    ],
    par: 1,
    check: (ctx) => Object.keys(ctx.state.containers).length === 0 && ctx.state.tags[normalize("nginx:1.27")] !== undefined,
  },
];
