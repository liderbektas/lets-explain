import { l } from "@lets-explain/core/i18n";
import { createHost, findContainer, simulate, type DockerAction, type Host } from "../../engine/docker";
import { HostStage } from "../../iso/HostStage";
import { makeDockerScene, type SandboxRow } from "../shared/DockerScene";
import { labels } from "../run-flags/Scene";
import { missions } from "./missions";

export const SLUG = "ports";

/** nginx is already pulled; nothing runs yet. */
export const START: Host = createHost({ pulled: ["nginx:1.27"] });

const nginx = (name: string, ports: string[]): DockerAction => ({ type: "run", image: "nginx:1.27", detach: true, name, ports });
const curl = (port: number): DockerAction => ({ type: "curl", port });
const rmf = (container: string): DockerAction => ({ type: "rm", container, force: true });

export const steps: DockerAction[][] = [
  [nginx("web", ["8080:80"]), curl(8080)],
  [nginx("web2", ["8081:8080"]), curl(8081)],
  [rmf("web2"), nginx("web2", ["8081:80"]), curl(8081)],
  [nginx("web3", ["8080:80"])],
  [rmf("web3"), nginx("web3", ["80"]), curl(32768)],
  [],
  [],
  [],
];

/** Step 3 asks for a host port that is already taken: that refusal is the lesson. */
export const EXPECTED_ERRORS: Record<number, number> = { 3: 1 };

/** The sandbox: an `old` nginx already holds host port 8080. */
const sandboxStart = (): Host => simulate([nginx("old", ["8080:80"])], createHost({ pulled: ["nginx:1.27"] })).states[1]!;

function rows(h: Host, lang: "tr" | "en"): SandboxRow[] {
  const tr = lang === "tr";
  const web = findContainer(h, "web");
  const old = findContainer(h, "old");
  return [
    {
      label: "web",
      buttons: [
        { label: "run --name web -p 8080:80", action: nginx("web", ["8080:80"]), tone: "producer", disabled: Boolean(web) },
        { label: "run --name web -p 8081:80", action: nginx("web", ["8081:80"]), tone: "producer", disabled: Boolean(web) },
        { label: "run --name web -p 8081:8080", action: nginx("web", ["8081:8080"]), tone: "producer", disabled: Boolean(web) },
        { label: "rm -f web", action: rmf("web"), tone: "danger", disabled: !web },
      ],
    },
    { label: "old", buttons: [{ label: "rm -f old", action: rmf("old"), tone: "danger", disabled: !old }] },
    {
      label: tr ? "Dene" : "Try",
      buttons: [
        { label: "curl localhost:8080", action: curl(8080), tone: "go" },
        { label: "curl localhost:8081", action: curl(8081), tone: "go" },
      ],
    },
  ];
}

export const scene = makeDockerScene({
  slug: SLUG,
  start: START,
  steps,
  label: l("Container'lar ve host'ta yayınlanan portları", "Containers and the ports they publish on the host"),
  view: (h, info) => <HostStage host={h} labels={labels(info.t)} highlight={info.fresh} last={info.last} hideImages />,
  metrics: (h, t) => {
    const all = Object.values(h.containers);
    return [
      { label: t(l("Çalışan", "Running")), value: all.filter((c) => c.state === "running").length, tone: "ok" },
      { label: t(l("Başlayamayan", "Failed to start")), value: all.filter((c) => c.state === "created").length, tone: all.some((c) => c.state === "created") ? "danger" : "plain" },
      { label: t(l("Kullanılan host portu", "Host ports in use")), value: all.filter((c) => c.state === "running").flatMap((c) => c.ports).map((p) => p.host).join(", ") || "—" },
    ];
  },
  sandbox: { start: sandboxStart, rows, missions },
});
