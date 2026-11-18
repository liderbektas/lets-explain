import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, simulate, type DockerAction, type Host } from "../../engine/docker";
import { HostStage } from "../../iso/HostStage";
import { makeDockerScene, type SandboxRow } from "../shared/DockerScene";
import { labels } from "../run-flags/Scene";
import { missions } from "./missions";

export const SLUG = "networks";

/** nginx and redis are already pulled; nothing runs yet. */
export const START: Host = createHost({ pulled: ["nginx:1.27", "redis:7"] });

const run = (name: string, image: string, extra: Partial<Extract<DockerAction, { type: "run" }>> = {}): DockerAction => ({ type: "run", image, detach: true, name, ...extra });
const exec = (container: string, cmd: string): DockerAction => ({ type: "exec", container, cmd });

export const steps: DockerAction[][] = [
  // A tick lets redis pass its healthcheck, so it does not sit on "starting".
  [run("web", "nginx:1.27"), run("cache", "redis:7"), { type: "tick" }],
  [exec("web", "ping cache")],
  [{ type: "networkCreate", name: "shop" }, { type: "networkConnect", network: "shop", container: "web" }, { type: "networkConnect", network: "shop", container: "cache" }],
  [exec("web", "ping cache")],
  [run("api", "nginx:1.27", { network: "shop" }), exec("web", "curl http://api"), { type: "curl", port: 80 }],
  [run("other", "nginx:1.27"), exec("other", "ping cache")],
  [run("hostnet", "nginx:1.27", { network: "host", ports: ["8080:80"] }), run("isolated", "nginx:1.27", { network: "none" })],
  [],
  [],
];

export const EXPECTED_ERRORS: Record<number, number> = {};

/** The sandbox: `web` and `cache` run on the default bridge, so they cannot find each other by name. */
const sandboxStart = (): Host => simulate([run("web", "nginx:1.27"), run("cache", "redis:7"), { type: "tick" }], createHost({ pulled: ["nginx:1.27", "redis:7"] })).states[3]!;

function rows(h: Host, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const shop = Boolean(h.networks.shop);
  const on = (name: string) => findContainer(h, name)?.networks.includes("shop") ?? false;
  const worker = findContainer(h, "worker");
  return [
    {
      label: "Network",
      buttons: [
        { label: "network create shop", action: { type: "networkCreate", name: "shop" }, tone: "producer", disabled: shop },
        { label: "network connect shop web", action: { type: "networkConnect", network: "shop", container: "web" }, disabled: !shop || on("web") },
        { label: "network connect shop cache", action: { type: "networkConnect", network: "shop", container: "cache" }, disabled: !shop || on("cache") },
      ],
    },
    {
      label: tr ? "Container" : "Containers",
      buttons: [
        { label: "run --name worker --network shop nginx", action: run("worker", "nginx:1.27", { network: "shop" }), tone: "producer", disabled: !shop || Boolean(worker) },
      ],
    },
    {
      label: tr ? "Dene" : "Try",
      buttons: [
        { label: "exec web ping cache", action: exec("web", "ping cache"), tone: "go" },
        { label: "exec worker ping cache", action: exec("worker", "ping cache"), tone: "go", disabled: !worker },
      ],
    },
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Container'lar, network'leri (renkli çipler) ve isimle birbirini bulanlar (kesikli çizgiler)", "Containers, their networks (coloured chips) and the ones that find each other by name (dashed lines)"),
  view: (h, info) => <HostStage host={h} labels={labels(info.t)} highlight={info.fresh} last={info.last} hideImages />,
  metrics: (h, t) => {
    const user = Object.values(h.networks).filter((n) => !n.builtin);
    const last = Object.values(h.containers);
    return [
      { label: t(l("Container", "Containers")), value: last.length },
      { label: t(l("Kendi network'ün", "Your networks")), value: user.map((n) => n.name).join(", ") || "—", tone: user.length ? "ok" : "plain" },
      { label: t(l("Yayınlanan port", "Published ports")), value: last.flatMap((c) => c.ports).length },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
