import type { Mission } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import type { Cluster, KubeAction, KubeEvent } from "./model";

/** What a mission can look at: where the try-it step began, every move and what it did. */
export interface KubeCtx {
  start: Cluster;
  state: Cluster;
  actions: KubeAction[];
  events: KubeEvent[][];
}

/** Positions of successful curls in the run, with the version that answered. */
const served = (ctx: KubeCtx) => ctx.events.flatMap((evs, i) => evs.flatMap((e) => (e.type === "served" ? [{ i, version: e.version }] : [])));

export const missions: Mission<KubeCtx>[] = [
  {
    id: "self-heal",
    title: l("Kendini onar", "Self-healing"),
    goal: l("Bir pod'u sil. Kubernetes yerine yenisini açsın ve servis **sonra da** cevap versin.", "Delete a pod. Kubernetes starts a new one, and the service **still** answers afterwards."),
    hint: l("Silmek de bir hamle, denemek de.", "Deleting is one move, checking is another."),
    par: 2,
    check: (ctx) => {
      const kill = ctx.actions.findIndex((a) => a.type === "killPod");
      return kill >= 0 && served(ctx).some((s) => s.i > kill) && ctx.state.pods.length === ctx.state.desired;
    },
  },
  {
    id: "lost-node",
    title: l("Node gitti", "Lost a node"),
    goal: l(
      "`node-1` çöksün; yine de **3 pod** çalışsın ve servis cevap versin.",
      "Let `node-1` go down; still have **3 pods** running and the service answering.",
    ),
    hint: l("Kubernetes kaybolan pod'u başka node'a taşır, ama kaç kopya istediğini sen söylersin.", "Kubernetes moves a lost pod to another node, but you say how many copies you want."),
    par: 3,
    check: (ctx) => {
      const down = ctx.actions.map((a) => (a.type === "nodeDown" && a.node === "node-1" ? 1 : 0)).lastIndexOf(1);
      const n1 = ctx.state.nodes.find((n) => n.name === "node-1")!;
      return !n1.up && down >= 0 && ctx.state.pods.length >= 3 && served(ctx).some((s) => s.i > down);
    },
  },
  {
    id: "new-version",
    title: l("Yeni sürüm", "New version"),
    goal: l("v2'ye geç, **4 kopyaya** çık ve servis **v2** ile cevap versin.", "Move to v2, scale to **4 copies**, and have the service answer with **v2**."),
    hint: l("Sürüm ve kopya sayısı ayrı ayarlar.", "Version and copy count are separate settings."),
    par: 4,
    check: (ctx) => ctx.state.desired === 4 && ctx.state.pods.length === 4 && ctx.state.pods.every((p) => p.version === "v2") && served(ctx).some((s) => s.version === "v2"),
  },
];
