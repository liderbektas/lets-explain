import type { Scenario } from "@lets-explain/core/course/types";
import { l } from "@lets-explain/core/i18n";
import { REPO } from "./kubectl";
import { createCluster, simulate, type Cluster, type KubeAction, type KubeEvent } from "./model";

/** What a scenario's check sees: where it began, every action typed and what each did. */
export interface KubeCtx {
  start: Cluster;
  state: Cluster;
  actions: KubeAction[];
  events: KubeEvent[][];
}

export type KubeScenario = Scenario<KubeCtx, Cluster>;

export const V1 = `${REPO}:sha-8b1d24e`;
export const V2 = `${REPO}:sha-9c4e7b2`;

/** The manifest the lesson shows, ready in ~/k8s/web.yaml. */
export const WEB_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: shop
          image: ${V1}
          ports:
            - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 3000
`;

const after = (actions: KubeAction[], from: Cluster = createCluster()) => {
  const r = simulate(actions, from);
  return r.states[r.states.length - 1]!;
};

/** An empty cluster; your folder has the manifest. */
export const EMPTY: Cluster = after([{ type: "file", path: "web.yaml", content: WEB_YAML }]);

/** web running: 3 pods of v1 behind the Service. */
export const RUNNING: Cluster = after([{ type: "apply", replicas: 3, version: "v1" }, { type: "expose" }], EMPTY);

/** node-1 went down in the night; its pod moved. */
const NODE_DOWN = after([{ type: "nodeDown", node: "node-1" }], RUNNING);

/** v2 rolled out. */
const ON_V2 = after([{ type: "setImage", version: "v2" }], RUNNING);

/** The pod with the memory leak: the first one `kubectl get pods` lists. */
export const LEAKY = RUNNING.pods[0]!.id;

const served = (ctx: KubeCtx) => ctx.events.flat().filter((e): e is Extract<KubeEvent, { type: "served" }> => e.type === "served");
const allOn = (c: Cluster, version: string) => c.desired !== null && c.desired > 0 && c.pods.length === c.desired && c.pods.every((p) => p.version === version);

export const scenarios: KubeScenario[] = [
  {
    id: "first-deploy",
    title: l("İlk kurulum", "First deploy"),
    story: l(
      "Cluster boş. Uygulamanın image'ı registry'de: `ghcr.io/ada/shop:sha-8b1d24e`. Üç kopya çalışsın, tek bir adresin (Service) arkasında dursun; sonra kendi bilgisayarından açıldığını gör.",
      "The cluster is empty. The app's image is in the registry: `ghcr.io/ada/shop:sha-8b1d24e`. Run three copies behind one address (a Service), then see it answer from your own computer.",
    ),
    goal: l(
      "`web` Deployment'ı 3 pod'la çalışsın, bir Service arkasında olsun ve `curl localhost:8080` cevap alsın.",
      "The `web` Deployment runs 3 pods behind a Service, and `curl localhost:8080` gets an answer.",
    ),
    start: EMPTY,
    hints: [
      l("Pod'ları tek tek açmazsın: bir Deployment istediğin kopya sayısını korur, bir Service de onları tek adreste toplar. `web.yaml` ikisini birden tarif ediyor.", "You don't start pods one by one: a Deployment keeps the copies you ask for, and a Service puts them behind one address. `web.yaml` describes both."),
      l("`kubectl apply -f web.yaml` dosyadakini kurar. Cluster dışarıya kendiliğinden açılmaz: `kubectl port-forward service/web 8080:80`.", "`kubectl apply -f web.yaml` creates what the file says. The cluster isn't open to the outside: `kubectl port-forward service/web 8080:80`."),
      l("`kubectl apply -f web.yaml`, `kubectl port-forward service/web 8080:80`, sonra `curl localhost:8080`", "`kubectl apply -f web.yaml`, `kubectl port-forward service/web 8080:80`, then `curl localhost:8080`"),
    ],
    par: 2,
    check: (ctx) => ctx.state.desired === 3 && ctx.state.pods.length === 3 && ctx.state.service && served(ctx).length > 0,
  },
  {
    id: "leaky-pod",
    title: l("Sızdıran pod", "The leaky pod"),
    story: l(
      `Pod'lardan biri (\`${LEAKY}\`) bellek sızdırıyor, cevapları gittikçe yavaşlıyor. Yeniden başlatılması gerekiyor; ama pod'ları elle açıp kapatmak istemiyorsun.`,
      `One of the pods (\`${LEAKY}\`) is leaking memory and its answers keep getting slower. It needs a restart, but you don't want to manage pods by hand.`,
    ),
    goal: l(`\`${LEAKY}\` gitsin; Deployment yerine yenisini açsın ve yine 3 pod çalışsın.`, `\`${LEAKY}\` goes away; the Deployment starts a new one and 3 pods run again.`),
    start: RUNNING,
    hints: [
      l("Deployment kaç pod istediğini bilir ve eksik olanı kendisi tamamlar.", "The Deployment knows how many pods it wants and replaces a missing one itself."),
      l("Bozuk pod'u sil; gerisini Kubernetes yapar. Adı `kubectl get pods` çıktısında.", "Delete the bad pod; Kubernetes does the rest. Its name is in `kubectl get pods`."),
      l(`\`kubectl delete pod ${LEAKY}\``, `\`kubectl delete pod ${LEAKY}\``),
    ],
    par: 1,
    check: (ctx) =>
      !ctx.state.pods.some((p) => p.id === LEAKY) &&
      ctx.state.pods.length === 3 &&
      ctx.state.desired === 3 &&
      ctx.events.flat().some((e) => e.type === "podCreated" && e.why === "heal"),
  },
  {
    id: "busy-night",
    title: l("Yoğun gece", "A busy night"),
    story: l(
      "`node-1` gece çöktü (`NotReady`); üzerindeki pod başka bir node'a taşındı. Kampanya başladı ve trafik arttı: en az 4 kopya istiyorsun.",
      "`node-1` went down in the night (`NotReady`); its pod moved to another node. The campaign has started and traffic is up: you want at least 4 copies.",
    ),
    goal: l("`web` 4 kopya istesin ve 4 pod ayakta olan node'larda çalışsın.", "`web` asks for 4 copies and 4 pods run on the nodes that are up."),
    start: NODE_DOWN,
    hints: [
      l("Kopya sayısını Deployment'a söylersin; Kubernetes pod'ları ayakta olan node'lara yerleştirir.", "You tell the Deployment the number of copies; Kubernetes places the pods on the nodes that are up."),
      l("`kubectl scale` ile `--replicas` ver.", "`kubectl scale` with `--replicas`."),
      l("`kubectl scale deployment web --replicas=4`", "`kubectl scale deployment web --replicas=4`"),
    ],
    par: 1,
    check: (ctx) => ctx.state.desired === 4 && ctx.state.pods.length === 4 && ctx.state.pods.every((p) => p.node !== "node-1"),
  },
  {
    id: "new-version",
    title: l("Yeni sürüm", "New version"),
    story: l(
      "CI yeni sürümü yayınladı: `ghcr.io/ada/shop:sha-9c4e7b2`. Kullanıcılar kesinti görmeden geçmek istiyorsun; container'ın adı `shop`.",
      "CI published the new version: `ghcr.io/ada/shop:sha-9c4e7b2`. You want to move to it without users noticing; the container is called `shop`.",
    ),
    goal: l("Bütün pod'lar yeni image'la (v2) çalışsın; kopya sayısı değişmesin.", "Every pod runs the new image (v2); the number of copies stays the same."),
    start: RUNNING,
    hints: [
      l("Deployment'ın image'ını değiştirirsen Kubernetes pod'ları birer birer yenisiyle değiştirir (rolling update).", "Change the Deployment's image and Kubernetes replaces the pods one at a time (a rolling update)."),
      l("`kubectl set image deployment/web shop=<yeni image>`; bitince `kubectl rollout status deployment/web`.", "`kubectl set image deployment/web shop=<new image>`; then `kubectl rollout status deployment/web`."),
      l(`\`kubectl set image deployment/web shop=${V2}\``, `\`kubectl set image deployment/web shop=${V2}\``),
    ],
    par: 1,
    check: (ctx) => allOn(ctx.state, "v2") && ctx.state.desired === 3,
  },
  {
    id: "roll-back",
    title: l("Geri dön", "Roll back"),
    story: l(
      "v2'ye geçtin ve on dakika sonra destek ekibi aradı: ödeme sayfası hata veriyor. Hata ayıklamayı sonra yaparsın; şimdi hemen bir önceki sürüme dönmek gerekiyor.",
      "You moved to v2 and ten minutes later support called: the checkout page is failing. You'll debug later; right now you need to go back to the previous version.",
    ),
    goal: l("Bütün pod'lar yine önceki sürümle (v1) çalışsın.", "Every pod runs the previous version (v1) again."),
    start: ON_V2,
    hints: [
      l("Deployment bir önceki sürümünü hatırlar; image adını bulmana gerek yok.", "The Deployment remembers its previous version; you don't need to find the image name."),
      l("`kubectl rollout` bir önceki sürüme dönmeyi bilir.", "`kubectl rollout` knows how to go back one version."),
      l("`kubectl rollout undo deployment/web`", "`kubectl rollout undo deployment/web`"),
    ],
    par: 1,
    check: (ctx) => allOn(ctx.state, "v1"),
  },
];
