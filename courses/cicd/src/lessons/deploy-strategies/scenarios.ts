import { l } from "@lets-explain/core/i18n";
import type { Fleet } from "./model";
import { clusterDesk, type ClusterCtx, type ClusterScenario } from "./shell";

/** Did some v2 server ever exist in this run? */
const sawV2 = (ctx: ClusterCtx) => ctx.states.some((s) => s.fleet.servers.some((x) => x.version === 2));
/** Every user on a healthy v2, and nobody hurt on the way. */
const cleanlyOnV2 = (f: Fleet) => !f.bad && f.round?.v2 === 100 && f.failed === 0 && f.downRounds === 0;

const IMG = "`image: ghcr.io/ada/shop:v2`";

export const scenarios: ClusterScenario[] = [
  {
    id: "no-downtime",
    title: l("Kesintisiz geçiş", "No downtime"),
    story: l(
      "Uygulamanın `shop.yaml`'ı bir Kubernetes Deployment'ı ve stratejisi `Recreate`: her sürümde dört pod birden kapanıyor, site bir süre hiç cevap vermiyor. v2 hazır ve sağlam; bu sefer kimse kesinti görmesin.",
      "The app's `shop.yaml` is a Kubernetes Deployment with the `Recreate` strategy: every release stops all four pods at once and the site answers nothing for a while. v2 is ready and healthy; this time nobody should see an outage.",
    ),
    goal: l("Bütün trafik v2'de olsun; yol boyunca hiç kesinti ve hiç hatalı istek olmasın.", "All traffic ends up on v2, with no downtime and no failed request along the way."),
    start: clusterDesk("recreate", false),
    hints: [
      l("Recreate önce hepsini kapatır. Kubernetes'in varsayılanı, pod'ları birer birer değiştiren strateji.", "Recreate stops everything first. Kubernetes' default strategy replaces pods one by one."),
      l("`type: RollingUpdate` (`maxUnavailable: 0`, `maxSurge: 1`) ve yeni image. Sonra `kubectl apply` ve geçişi `kubectl rollout status` ile sonuna kadar izle.", "`type: RollingUpdate` (`maxUnavailable: 0`, `maxSurge: 1`) and the new image. Then `kubectl apply` and watch the rollout to the end with `kubectl rollout status`."),
      l(
        `\`nano shop.yaml\` → \`type: RollingUpdate\`, ${IMG} → \`kubectl apply -f shop.yaml\` → \`kubectl rollout status deployment/shop\``,
        `\`nano shop.yaml\` → \`type: RollingUpdate\`, ${IMG} → \`kubectl apply -f shop.yaml\` → \`kubectl rollout status deployment/shop\``,
      ),
    ],
    par: 3,
    check: ({ state }) => cleanlyOnV2(state.fleet),
  },
  {
    id: "look-first",
    title: l("Önce içeriden bak", "Look before switching"),
    story: l(
      "Uygulama Argo Rollouts ile blue-green deploy ediliyor: yeni sürüm yanına kuruluyor, trafik ancak sen `promote` deyince ona geçiyor. v2 yayına hazır görünüyor, ama QA ödeme sayfasında bir şeylerden şüpheleniyor.",
      "The app is deployed blue-green with Argo Rollouts: the new version is set up alongside, and traffic only moves to it when you `promote`. v2 looks ready, but QA suspects something on the checkout page.",
    ),
    goal: l("v2'yi kur, kullanıcılar görmeden kontrol et; bozuksa geri al. Tek bir kullanıcı isteği bile hata almasın.", "Set v2 up, check it before users see it, and if it's broken, back out. Not a single user request may fail."),
    start: clusterDesk("blue-green", true),
    hints: [
      l("Blue-green'de yeni sürüm önce bir önizleme adresinde (`preview.shop.example`) çalışır; canlı trafik hâlâ eskide.", "In blue-green the new version first runs at a preview address (`preview.shop.example`); live traffic is still on the old one."),
      l("Image'ı v2 yap, `kubectl apply` ile kur, önizlemeyi `curl` ile dene. Bozuksa `promote` değil, `abort`.", "Set the image to v2, set it up with `kubectl apply`, try the preview with `curl`. If it's broken: `abort`, not `promote`."),
      l(
        `\`nano shop.yaml\` → ${IMG} → \`kubectl apply -f shop.yaml\` → \`curl https://preview.shop.example/health\` → \`kubectl argo rollouts abort shop\``,
        `\`nano shop.yaml\` → ${IMG} → \`kubectl apply -f shop.yaml\` → \`curl https://preview.shop.example/health\` → \`kubectl argo rollouts abort shop\``,
      ),
    ],
    par: 3,
    check: (ctx) => {
      const f = ctx.state.fleet;
      return f.bad && sawV2(ctx) && f.rolledBack && f.failed === 0 && f.downRounds === 0;
    },
  },
  {
    id: "canary-catch",
    title: l("Küçük bir grupla dene", "Try it on a few"),
    story: l(
      "Bu servis canary ile deploy ediliyor: yeni sürüm önce trafiğin %10'unu alıyor ve orada bekliyor. v2 bugün çıkacak; testler geçti ama gerçek trafik her zaman sürpriz yapabilir.",
      "This service is deployed as a canary: the new version first gets 10% of traffic and waits there. v2 ships today; tests passed, but real traffic can always surprise you.",
    ),
    goal: l(
      "v2'yi canary olarak başlat; gerçek trafikte hata verirse geri al. En az bir istek hata alsın ama **20'den fazla değil**.",
      "Start v2 as a canary; if it fails on real traffic, back out. At least one request fails, but **no more than 20**.",
    ),
    start: clusterDesk("canary", true),
    hints: [
      l("Canary'yi başlatmak sadece yeni image'ı uygulamak. Sonra ilk adımdaki %10'a bak.", "Starting the canary is just applying the new image. Then look at the first step's 10%."),
      l("`kubectl argo rollouts get rollout shop` ya da `curl https://shop.example/health` durumu gösterir. Hata varsa bir sonraki adıma geçme: `abort`.", "`kubectl argo rollouts get rollout shop` or `curl https://shop.example/health` shows the state. If there are errors, don't go to the next step: `abort`."),
      l(`\`nano shop.yaml\` → ${IMG} → \`kubectl apply -f shop.yaml\` → \`kubectl argo rollouts abort shop\``, `\`nano shop.yaml\` → ${IMG} → \`kubectl apply -f shop.yaml\` → \`kubectl argo rollouts abort shop\``),
    ],
    par: 3,
    check: ({ state }) => {
      const f = state.fleet;
      return f.bad && f.rolledBack && f.failed > 0 && f.failed <= 20 && f.downRounds === 0;
    },
  },
  {
    id: "canary-promote",
    title: l("Adım adım sonuna kadar", "Step by step to the end"),
    story: l(
      "Bu sefer v2 sağlam. Canary %10'da duruyor, metrikler temiz. Ekip v2'yi bu öğleden önce herkese açmak istiyor, canary'nin adımlarını atlamadan.",
      "This time v2 is healthy. The canary sits at 10% and the metrics are clean. The team wants v2 out to everyone before lunch, without skipping the canary's steps.",
    ),
    goal: l("v2'yi canary ile başlat ve adım adım herkese aç: sonunda trafiğin tamamı v2'de, hiç hata yok.", "Start v2 as a canary and open it to everyone step by step: in the end all traffic is on v2, with no errors."),
    start: clusterDesk("canary", false),
    hints: [
      l("Canary her `pause` adımında senin onayını bekler.", "The canary waits for you at every `pause` step."),
      l("Bir sonraki adıma `kubectl argo rollouts promote shop` geçer: %10 → %50 → %100.", "`kubectl argo rollouts promote shop` moves to the next step: 10% → 50% → 100%."),
      l(
        `\`nano shop.yaml\` → ${IMG} → \`kubectl apply -f shop.yaml\` → \`kubectl argo rollouts promote shop\` → \`kubectl argo rollouts promote shop\``,
        `\`nano shop.yaml\` → ${IMG} → \`kubectl apply -f shop.yaml\` → \`kubectl argo rollouts promote shop\` → \`kubectl argo rollouts promote shop\``,
      ),
    ],
    par: 4,
    check: ({ state }) => cleanlyOnV2(state.fleet) && state.fleet.strategy === "canary",
  },
  {
    id: "stop-rolling",
    title: l("Rolling'i yarıda kes", "Stop a rolling deploy"),
    story: l(
      "Deployment `RollingUpdate` ile çalışıyor. v2'yi göndermek üzeresin ama on-call kanalında v2'nin bazı isteklere 500 verdiğine dair bir uyarı var. Kubernetes'in readiness kontrolü bunu görmüyor: rollout kendi kendine durmaz.",
      "The Deployment uses `RollingUpdate`. You're about to ship v2, but the on-call channel warns that v2 answers some requests with 500. Kubernetes' readiness check doesn't see that: the rollout won't stop on its own.",
    ),
    goal: l("v2'yi başlat, hatayı fark edince herkesi yine v1'e döndür. Toplam hatalı istek 50'yi geçmesin.", "Start v2, and once you see the errors, put everyone back on v1. No more than 50 requests may fail in total."),
    start: clusterDesk("rolling", true),
    hints: [
      l("`kubectl rollout status` geçişi sonuna kadar izler; bozuk bir sürümde bu, herkesi bozuk sürüme taşımak demek.", "`kubectl rollout status` watches the rollout to the end; with a broken version, that means moving everyone onto it."),
      l("İlk pod v2'ye geçtiği anda `curl` hatayı gösterir. Bir Deployment'ı bir önceki sürüme `kubectl rollout undo` döndürür.", "As soon as the first pod is on v2, `curl` shows the errors. `kubectl rollout undo` takes a Deployment back to its previous version."),
      l(`\`nano shop.yaml\` → ${IMG} → \`kubectl apply -f shop.yaml\` → \`kubectl rollout undo deployment/shop\``, `\`nano shop.yaml\` → ${IMG} → \`kubectl apply -f shop.yaml\` → \`kubectl rollout undo deployment/shop\``),
    ],
    par: 3,
    check: ({ state }) => {
      const f = state.fleet;
      return f.bad && f.rolledBack && f.failed > 0 && f.failed <= 50 && f.downRounds === 0;
    },
  },
];
