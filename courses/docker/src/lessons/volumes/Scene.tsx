import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, type DockerAction, type Host } from "../../engine/docker";
import { HostStage } from "../../iso/HostStage";
import { makeDockerScene, type SandboxRow } from "../shared/DockerScene";
import { labels } from "../run-flags/Scene";
import { missions } from "./missions";

export const SLUG = "volumes";

const SITE = "/home/ada/site";
const PG = "/var/lib/postgresql/data";

/** nginx and postgres are already pulled; the host has a small website folder for the bind mount. */
export const START: Host = createHost({ pulled: ["nginx:1.27", "postgres:17"], hostFiles: { [`${SITE}/index.html`]: "Merhaba v1" } });

const app = (volumes?: string[]): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name: "app", ...(volumes ? { volumes } : {}) });
const note = (content: string): DockerAction => ({ type: "write", container: "app", path: "/data/notes.txt", content });
const rmf = (container: string): DockerAction => ({ type: "rm", container, force: true });
const db = (volumes?: string[]): DockerAction => ({ type: "run", image: "postgres:17", detach: true, name: "db", env: { POSTGRES_PASSWORD: "secret" }, ...(volumes ? { volumes } : {}) });

export const steps: DockerAction[][] = [
  [app(), note("ilk not")],
  [rmf("app"), app(), { type: "exec", container: "app", cmd: "cat /data/notes.txt" }],
  [rmf("app"), { type: "volumeCreate", name: "notes-data" }, app(["notes-data:/data"]), note("ilk not")],
  [rmf("app"), app(["notes-data:/data"]), { type: "exec", container: "app", cmd: "cat /data/notes.txt" }],
  [{ type: "run", image: "nginx:1.27", detach: true, name: "web", ports: ["8080:80"], volumes: [`${SITE}:/usr/share/nginx/html`] }, { type: "curl", port: 8080 }],
  [{ type: "editHost", path: `${SITE}/index.html`, content: "Merhaba v2" }, { type: "curl", port: 8080 }],
  // Ticks let postgres finish starting, so it shows as healthy.
  [db(), rmf("db"), db(), { type: "tick", count: 2 }],
  [rmf("db"), db([`pgdata:${PG}`]), rmf("db"), db([`pgdata:${PG}`]), { type: "tick", count: 2 }],
  [],
  [],
];

export const EXPECTED_ERRORS: Record<number, number> = {};

/** The sandbox: nginx is here, nothing runs, no volumes yet. */
const sandboxStart = (): Host => createHost({ pulled: ["nginx:1.27"] });

const sandNote = (n: number): DockerAction => ({ type: "write", container: "app", path: "/data/note.txt", content: `not ${n}` });

function rows(h: Host, lang: "tr" | "en", history: DockerAction[]): SandboxRow[] {
  const tr = lang === "tr";
  const a = findContainer(h, "app");
  const running = a?.state === "running";
  const written = history.filter((x) => x.type === "write").length;
  return [
    {
      label: tr ? "Başlat" : "Start",
      buttons: [
        { label: "run -d --name app nginx", action: app(), tone: "producer", disabled: Boolean(a) },
        { label: "run -d --name app -v data:/data nginx", action: app(["data:/data"]), tone: "producer", disabled: Boolean(a) },
      ],
    },
    {
      label: "app",
      buttons: [
        { label: tr ? "Not yaz" : "Write a note", action: sandNote(written + 1), tone: "go", disabled: !running },
        { label: "exec cat /data/note.txt", action: { type: "exec", container: "app", cmd: "cat /data/note.txt" }, disabled: !running },
        { label: "rm -f app", action: rmf("app"), tone: "danger", disabled: !a },
      ],
    },
    { label: "Volume", buttons: [{ label: "volume rm data", action: { type: "volumeRm", name: "data" }, tone: "danger", disabled: !h.volumes.data }] },
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Container'lar, volume'lar (variller) ve host'taki klasörler", "Containers, volumes (barrels) and folders on the host"),
  view: (h, info) => <HostStage host={h} labels={labels(info.t)} highlight={info.fresh} last={info.last} hideImages />,
  metrics: (h, t) => {
    const vols = Object.values(h.volumes);
    return [
      { label: t(l("Container", "Containers")), value: Object.keys(h.containers).length },
      { label: t(l("İsimli volume", "Named volumes")), value: vols.filter((v) => !v.anonymous).length, tone: "ok" },
      { label: t(l("Anonim volume", "Anonymous volumes")), value: vols.filter((v) => v.anonymous).length, tone: vols.some((v) => v.anonymous) ? "warn" : "plain" },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
