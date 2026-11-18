import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { changesFor, KubernetesScene } from "./Scene";

const YAML = `apiVersion: apps/v1
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
          image: ghcr.io/ada/shop:sha-8b1d24e
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
      targetPort: 3000`;

export const kubernetesIntro: Lesson = {
  slug: "kubernetes-intro",
  title: l("Kubernetes'e kısa bakış", "A first look at Kubernetes"),
  summary: l(
    "Container'ları tek makinede değil, bir makine grubunda çalıştırmak: pod, Deployment, Service, kendini onarma, ölçekleme ve sürüm güncelleme. Kavram düzeyinde, Docker'la bağıyla birlikte.",
    "Running containers across a group of machines instead of one: pods, Deployments, Services, self-healing, scaling and updates. At the idea level, and how it connects to Docker.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: KubernetesScene,
  changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Pod, Deployment ve Service'in ne olduğunu bilmek", "Know what a pod, a Deployment and a Service are"), step: 2 },
    { text: l("Kubernetes'in istenen durumu kendisi koruduğunu görmek", "See Kubernetes keep the desired state on its own"), step: 3 },
    { text: l("Ölçeklemeyi ve kesintisiz güncellemeyi görmek", "See scaling and an update without downtime"), step: 6 },
    { text: l("Ne zaman Kubernetes, ne zaman Compose yeter, bilmek", "Know when you need Kubernetes and when Compose is enough"), step: 8 },
  ],
  steps: [
    {
      short: l("Neden", "Why"),
      tag: "problem",
      title: l("Compose tek bir makinede yaşar", "Compose lives on one machine"),
      body: [
        l(
          "Compose ile bütün uygulamayı tek komutla açabiliyorsun, ama hepsi **bir** makinede. O makine çökerse her şey gider; trafik artınca ikinci bir makineye taşmanın kolay yolu da yok.",
          "With Compose you can start the whole app with one command, but all of it on **one** machine. If that machine dies, everything goes; when traffic grows there is no easy way to spill onto a second one.",
        ),
        l(
          "Kubernetes, container'ları bir **makine grubunda** (cluster) çalıştırır. Sahnede üç makine var; Kubernetes bunlara **node** der. Henüz hiçbir şey çalışmıyor.",
          "Kubernetes runs containers across a **group of machines** (a cluster). On stage there are three machines, which Kubernetes calls **nodes**. Nothing runs yet.",
        ),
      ],
      practice: {
        intro: l("Kendi bilgisayarında küçük bir cluster açmanın yolları:", "Ways to start a small cluster on your own machine:"),
        commands: [
          { cmd: "kind create cluster", note: l("Docker container'larının içinde bir Kubernetes cluster'ı açar.", "Starts a Kubernetes cluster inside Docker containers.") },
          { cmd: "minikube start", note: l("Bir alternatif. Docker Desktop'un ayarlarında da Kubernetes'i açabilirsin.", "An alternative. You can also turn on Kubernetes in Docker Desktop's settings.") },
          { cmd: "kubectl get nodes", note: l("`kubectl` cluster'la konuşan komut satırı aracı.", "`kubectl` is the command-line tool that talks to the cluster.") },
        ],
      },
    },
    {
      short: l("Deployment", "Deployment"),
      tag: "how",
      predict: {
        question: l("\"3 kopya çalışsın\" diyen bir Deployment oluşturacağız. 3 node var. Pod'lar nereye yerleşir?", "We will create a Deployment that says \"run 3 copies\". There are 3 nodes. Where do the pods go?"),
        options: [l("Hepsi ilk node'a", "All on the first node"), l("Node'lara dağılır", "Spread over the nodes"), l("Hepsine birden kopyalanır, toplam 9", "Copied to every node, 9 in total")],
        answer: 1,
        why: l(
          "Scheduler her pod'u boş yeri en uygun node'a koyar; aynı Deployment'ın kopyalarını da dağıtmayı tercih eder. Bir node çökerse hepsi birden gitmesin diye.",
          "The scheduler puts each pod on the node with the best room, and prefers to spread one Deployment's copies, so that losing one node does not take them all.",
        ),
      },
      title: l("Deployment: \"bundan 3 tane çalışsın\"", "Deployment: \"keep 3 of these running\""),
      body: [
        l(
          "Bir **Deployment** oluşturduk: \"`shop:v1` image'ından 3 kopya çalışsın\". Kubernetes üç **pod** açtı ve her birini bir node'a koydu. Pod, bir ya da birkaç container'ın birlikte çalıştığı en küçük birimdir; burada her pod'da tek container var.",
          "We created a **Deployment**: \"keep 3 copies of the `shop:v1` image running\". Kubernetes started three **pods** and put each on a node. A pod is the smallest unit: one or a few containers running together; here each pod has one container.",
        ),
        l(
          "Dikkat: Kubernetes'e \"şunu çalıştır\" komutu vermedik, \"şöyle olsun\" dedik. Buna **declarative** (bildirimsel) çalışma denir; sol üstteki control plane istenen durumu tutar.",
          "Note that we did not tell Kubernetes \"run this\"; we said \"this is how it should be\". That is called **declarative**; the control plane at the top left keeps the desired state.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "kubectl create deployment web --image=ghcr.io/ada/shop:sha-8b1d24e --replicas=3" },
          { cmd: "kubectl get pods -o wide", note: l("`-o wide` her pod'un hangi node'da olduğunu da gösterir.", "`-o wide` also shows which node each pod is on.") },
        ],
      },
    },
    {
      short: l("Service", "Service"),
      tag: "how",
      title: l("Service: tek adres, çok pod", "Service: one address, many pods"),
      body: [
        l(
          "Pod'lar gelip gider ve her birinin adresi değişir. **Service** onların önüne sabit bir ad ve adres koyar: `web`. İstekler arkadaki pod'lara dağıtılır.",
          "Pods come and go, and each has its own changing address. A **Service** puts a stable name and address in front of them: `web`. Requests are spread over the pods behind it.",
        ),
        l(
          "Üç kez `curl web` yaptık ve her seferinde başka bir pod cevap verdi. Compose'daki \"servis adıyla erişme\" fikrinin bir cluster'daki karşılığı bu.",
          "We ran `curl web` three times and a different pod answered each time. It is the cluster version of Compose's \"reach it by service name\" idea.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "kubectl expose deployment web --port=80 --target-port=3000" },
          { cmd: "kubectl port-forward service/web 8080:80", note: l("Service'i kendi bilgisayarındaki 8080'e açar; başka bir terminalde `curl localhost:8080`.", "Opens the Service on your machine's 8080; in another terminal run `curl localhost:8080`.") },
        ],
      },
    },
    {
      short: l("Kendini onarır", "Self-healing"),
      tag: "experiment",
      predict: {
        question: l("Bir pod'u elle sileceğiz. Deployment hâlâ 3 kopya istiyor. Ne olur?", "We will delete a pod by hand. The Deployment still wants 3 copies. What happens?"),
        options: [l("2 pod'la devam edilir", "It carries on with 2 pods"), l("Kubernetes hemen yeni bir pod açar", "Kubernetes starts a new pod at once"), l("Bütün Deployment durur", "The whole Deployment stops")],
        answer: 1,
        why: l(
          "Kubernetes sürekli \"istenen\" ile \"çalışan\"ı karşılaştırır. 3 istenirken 2 çalışıyorsa farkı kapatmak için yeni bir pod açar.",
          "Kubernetes keeps comparing \"desired\" with \"running\". With 3 desired and 2 running, it starts a new pod to close the gap.",
        ),
      },
      title: l("Silinen pod geri gelir", "A deleted pod comes back"),
      body: [
        l(
          "Bir pod'u sildik; birkaç an içinde aynı yerde yeni adla yenisi başladı. Restart policy'nin tek bir container için yaptığını Kubernetes bütün uygulama için yapıyor.",
          "We deleted a pod; within moments a new one started under a new name. What a restart policy does for one container, Kubernetes does for the whole app.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "kubectl delete pod <pod-adı>", note: l("Ad `kubectl get pods` çıktısında.", "The name is in `kubectl get pods`.") },
          { cmd: "kubectl get pods -w", note: l("`-w` değişiklikleri canlı izler: eskisi Terminating, yenisi Running.", "`-w` watches live: the old one Terminating, the new one Running.") },
        ],
      },
    },
    {
      short: l("Node çöktü", "Node down"),
      tag: "experiment",
      predict: {
        question: l("`node-2` tamamen çökecek. Üstündeki pod'a ne olur?", "`node-2` will go down completely. What happens to the pod on it?"),
        options: [l("Kaybolur, 2 pod kalır", "It is lost and 2 pods remain"), l("Başka bir node'da yeniden açılır", "It is started again on another node"), l("node-2 geri gelene kadar bekler", "It waits until node-2 comes back")],
        answer: 1,
        why: l(
          "Pod node'uyla birlikte gider, ama Deployment hâlâ 3 istiyor. Kubernetes eksik kopyayı ayakta kalan node'lardan birine koyar.",
          "The pod goes with its node, but the Deployment still wants 3. Kubernetes puts the missing copy on one of the nodes still up.",
        ),
      },
      title: l("Bir makine gitse de uygulama ayakta", "Lose a machine, keep the app"),
      body: [
        l(
          "`node-2` çöktü (NotReady) ve üstündeki pod gitti. Kubernetes yerine bir pod açtı, bu sefer kalan iki node'dan birine. Kullanıcılar bunu fark etmez: Service artık sadece ayaktaki pod'lara gönderir.",
          "`node-2` went down (NotReady) and its pod went with it. Kubernetes started a replacement on one of the other two nodes. Users do not notice: the Service now sends only to pods that are up.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede pod'lar anında taşınıyor. Gerçek bir cluster'da bir node'un öldüğüne karar vermek ve pod'ları başka yere almak bir süre (çoğu zaman dakikalar) alır; planlı bakımda bunu `kubectl drain` ile önceden yaparsın.",
            "On this stage pods move instantly. In a real cluster, deciding a node is dead and moving its pods takes a while (often minutes); for planned maintenance you do it ahead of time with `kubectl drain`.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "kubectl get nodes", note: l("Çöken node `NotReady` görünür.", "A failed node shows `NotReady`.") },
          { cmd: "kubectl drain node-2 --ignore-daemonsets", note: l("Bakıma alacağın bir node'u boşaltır.", "Empties a node you are about to take down for maintenance.") },
        ],
      },
    },
    {
      short: l("Ölçekle", "Scale"),
      tag: "how",
      title: l("Kopya sayısını değiştirmek bir sayı", "Scaling is changing one number"),
      body: [
        l(
          "Trafik arttı ve kopya sayısını 5'e çıkardık. Kubernetes iki yeni pod açtı ve ayaktaki node'lara dağıttı. Azaltmak da aynı: sayıyı küçült, fazlası kapanır.",
          "Traffic grew and we raised the copy count to 5. Kubernetes started two new pods and spread them over the nodes that are up. Scaling down works the same: lower the number and the extras stop.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "Sayıyı yükle göre kendisi değiştirsin istersen Horizontal Pod Autoscaler (HPA) var: örneğin CPU %70'i geçince kopya ekler.",
            "If you want the number to follow the load by itself, there is the Horizontal Pod Autoscaler (HPA): for example, it adds copies when CPU passes 70%.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "kubectl scale deployment web --replicas=5" },
          { cmd: "kubectl autoscale deployment web --min=2 --max=10 --cpu-percent=70", note: l("İsteğe bağlı: yüke göre otomatik ölçekleme.", "Optional: automatic scaling by load.") },
        ],
      },
    },
    {
      short: l("Güncelle", "Update"),
      tag: "experiment",
      predict: {
        question: l("Image'ı `shop:v2` yapacağız. Güncelleme sırasında servis kesilir mi?", "We will change the image to `shop:v2`. Does the service go down during the update?"),
        options: [l("Evet, bütün pod'lar aynı anda kapanır", "Yes, every pod stops at once"), l("Hayır: yeni pod'lar açıldıkça eskiler kapanır", "No: old pods stop as new ones come up"), l("Güncelleme için cluster'ı durdurmak gerekir", "You must stop the cluster to update")],
        answer: 1,
        why: l(
          "Deployment'ın varsayılan yöntemi **rolling update**: önce yeni bir pod açılır, hazır olunca eski bir pod kapanır, bu böyle devam eder. Her an istenen kadar pod çalışır.",
          "A Deployment's default strategy is a **rolling update**: a new pod starts, and once it is ready an old one stops, and so on. At every moment the desired number of pods is running.",
        ),
      },
      title: l("Rolling update: kesintisiz yeni sürüm", "Rolling update: a new version with no downtime"),
      body: [
        l(
          "Image'ı v2 yaptık. Kubernetes pod'ları tek tek değiştirdi; renkler yeşilden maviye döndü ve `curl web` artık v2 ile cevap veriyor. Hiçbir an çalışan pod sayısı 5'in altına düşmedi.",
          "We changed the image to v2. Kubernetes replaced the pods one by one; the colours turned from green to blue, and `curl web` now answers with v2. At no moment did the running count drop below 5.",
        ),
        l(
          "Bir sorun çıkarsa tek komutla geri dönersin: `kubectl rollout undo`. Bunun işe yaraması için image'ları değişmeyen etiketlerle (SHA) yayınlamak önemli.",
          "If something goes wrong you go back with one command: `kubectl rollout undo`. For that to work, publish images with tags that never move (a SHA).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Burada güncelleme tek adımda bitiyor. Gerçekte `maxSurge` ve `maxUnavailable` kaç pod'un aynı anda değişeceğini belirler, ve **readiness probe** bir pod trafiğe hazır olmadan eskinin kapatılmasını engeller.",
            "Here the update finishes in one step. In reality `maxSurge` and `maxUnavailable` decide how many pods change at once, and a **readiness probe** stops the old pod being retired before the new one is ready for traffic.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "kubectl set image deployment/web shop=ghcr.io/ada/shop:sha-9c4e7b2", note: l("`shop`, container'ın adı; `create deployment` image adından verir.", "`shop` is the container's name; `create deployment` takes it from the image name.") },
          { cmd: "kubectl rollout status deployment/web" },
          { cmd: "kubectl rollout undo deployment/web", note: l("Bir önceki sürüme döner.", "Goes back to the previous version.") },
        ],
      },
    },
    {
      short: l("YAML", "YAML"),
      tag: "how",
      title: l("Hepsi bir dosyada: istenen durum", "All of it in one file: the desired state"),
      body: [
        l(
          "`node-2` geri geldi ama pod'lar ona kendiliğinden taşınmadı: çalışan zaten istenene eşit. Kubernetes sadece fark varsa harekete geçer.",
          "`node-2` came back, but pods did not move to it by themselves: running already equals desired. Kubernetes acts only when there is a gap.",
        ),
        l(
          "Komutlarla yaptığımız her şey normalde bir YAML dosyasında durur ve Git'te saklanır. `kubectl apply -f` dosyadaki durumu cluster'a uygular; dosyayı değiştirip tekrar apply etmek, değişikliğin kendisidir.",
          "Everything we did with commands normally lives in a YAML file kept in Git. `kubectl apply -f` applies the file's state to the cluster; editing the file and applying it again is the change.",
        ),
      ],
      practice: {
        snippets: [{ label: "web.yaml", code: YAML, note: l("Service, `app: web` etiketli pod'ları bulur; Deployment pod'lara bu etiketi verir.", "The Service finds pods labelled `app: web`; the Deployment gives its pods that label.") }],
        commands: [
          { cmd: "kubectl apply -f web.yaml" },
          { cmd: "kubectl diff -f web.yaml", note: l("Uygulamadan önce neyin değişeceğini gösterir.", "Shows what would change before you apply.") },
        ],
      },
    },
    {
      short: l("Docker ile bağı", "And Docker"),
      tag: "reality",
      title: l("Docker'la nasıl bağlanıyor, ne zaman gerekir?", "How it connects to Docker, and when you need it"),
      body: [
        l(
          "Kubernetes senin Docker ile build ettiğin image'ları çalıştırır: hepsi standart **OCI** image'ları. Kubernetes 1.24'ten beri container'ları Docker Engine yerine doğrudan `containerd` (ya da CRI-O) çalıştırır; eski \"dockershim\" kaldırıldı. Senin için değişen bir şey yok: build ve push aynı, registry aynı.",
          "Kubernetes runs the images you build with Docker: they are all standard **OCI** images. Since Kubernetes 1.24, `containerd` (or CRI-O) runs containers directly instead of Docker Engine; the old \"dockershim\" was removed. Nothing changes for you: build and push are the same, and so is the registry.",
        ),
        l(
          "**Compose yeter:** tek sunucu, birkaç servis, küçük bir ekip. **Kubernetes gerekir:** birden fazla makine, sık güncelleme, otomatik ölçekleme, makine çökmesine dayanıklılık. Çoğu ekip Kubernetes'i bulut sağlayıcısının hazır hizmetiyle kullanır (EKS, GKE, AKS).",
          "**Compose is enough:** one server, a few services, a small team. **You need Kubernetes:** several machines, frequent updates, autoscaling, surviving machine failures. Most teams use a cloud provider's managed service (EKS, GKE, AKS).",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnedeki küçük model pod'ları hep eşit dağıtıyor ve her şeyi anında yapıyor. Gerçek scheduler CPU ve bellek isteklerine (`resources.requests`) bakar, pod'ların başlaması da zaman alır.",
            "The small model on this stage always spreads pods evenly and does everything instantly. The real scheduler looks at CPU and memory requests (`resources.requests`), and pods take time to start.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "kind load docker-image shop:dev", note: l("kind'da yerel image'ı registry'ye göndermeden cluster'a yükler.", "With kind, loads a local image into the cluster without a registry.") },
          { cmd: "kubectl get deployment,service,pods", note: l("Bu dersin bütün nesneleri tek bakışta.", "Every object from this lesson at a glance.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "Cluster'da 2 kopyalı bir `web` Deployment'ı ve önünde bir Service var. Kopya sayısını değiştirebilir, yeni sürüme geçebilir, bir pod'u silebilir, node'ları çökertip geri getirebilir ve `curl web` ile deneyebilirsin.",
          "The cluster has a `web` Deployment with 2 copies and a Service in front. You can change the copy count, move to a new version, delete a pod, take nodes down and back, and try it with `curl web`.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Kubernetes container'ları birçok makinede (node) çalıştırır; Compose tek makinede kalır.", "Kubernetes runs containers across many machines (nodes); Compose stays on one."),
    l("Pod en küçük birimdir; Deployment kaç kopya ve hangi image istediğini söyler.", "A pod is the smallest unit; a Deployment says how many copies of which image you want."),
    l("Service, değişip duran pod'ların önüne sabit bir ad koyar ve istekleri dağıtır.", "A Service puts a stable name in front of ever-changing pods and spreads requests."),
    l("Kubernetes istenen durumu korur: silinen ya da node'uyla giden pod'un yerine yenisini açar.", "Kubernetes keeps the desired state: a deleted pod, or one lost with its node, is replaced."),
    l("Ölçeklemek bir sayıyı değiştirmek; rolling update yeni sürümü kesintisiz getirir, `rollout undo` geri alır.", "Scaling is changing a number; a rolling update brings a new version without downtime, and `rollout undo` reverts it."),
    l("Kubernetes Docker ile build ettiğin OCI image'larını çalıştırır; küçük işler için Compose yeterlidir.", "Kubernetes runs the OCI images you build with Docker; for small setups Compose is enough."),
  ],
  quiz: [
    {
      question: l("Deployment 4 kopya istiyor ve bir pod çöktü. Kubernetes ne yapar?", "A Deployment wants 4 copies and one pod crashed. What does Kubernetes do?"),
      options: [l("3 ile devam eder", "Carries on with 3"), l("Yeni bir pod açıp 4'e tamamlar", "Starts a new pod to get back to 4"), l("Bütün pod'ları yeniden başlatır", "Restarts every pod"), l("Sana e-posta atar", "Emails you")],
      answer: 1,
      explain: l("İstenen ile çalışan arasındaki farkı kapatmak Kubernetes'in temel işi.", "Closing the gap between desired and running is Kubernetes' core job."),
      reviewStep: 3,
    },
    {
      question: l("Pod'ların IP adresleri sürekli değişiyor. Uygulamanın geri kalanı onlara nasıl ulaşır?", "Pod IP addresses keep changing. How does the rest of the app reach them?"),
      options: [l("Her seferinde IP'yi elle yazarak", "By typing the IP each time"), l("Sabit adlı bir Service üzerinden", "Through a Service with a stable name"), l("Node'un adıyla", "By the node's name"), l("Ulaşamaz", "It cannot")],
      answer: 1,
      explain: l("Service, etiketle seçtiği pod'ların önünde durur; ad ve adres değişmez.", "A Service stands in front of the pods its labels select; its name and address do not change."),
      reviewStep: 2,
    },
    {
      question: l("Kubernetes 1.24'ten beri Docker ile build ettiğin image'lar ne olur?", "Since Kubernetes 1.24, what happens to images you build with Docker?"),
      options: [
        l("Artık çalışmazlar", "They no longer run"),
        l("Aynen çalışırlar: OCI image'larıdır, containerd çalıştırır", "They run as before: they are OCI images and containerd runs them"),
        l("Önce dönüştürülmeleri gerekir", "They must be converted first"),
        l("Sadece Docker Desktop'ta çalışırlar", "They only run on Docker Desktop"),
      ],
      answer: 1,
      explain: l("Kaldırılan sadece dockershim, yani Docker Engine'i çalışma ortamı olarak kullanma yoluydu. Image formatı aynı.", "Only dockershim, the way of using Docker Engine as the runtime, was removed. The image format is the same."),
      reviewStep: 8,
    },
    {
      question: l("Tek bir sunucuda bir web uygulaması, bir veritabanı ve Redis çalıştırıyorsun. Neyle başlamak mantıklı?", "You run a web app, a database and Redis on a single server. What is sensible to start with?"),
      options: [l("Docker Compose", "Docker Compose"), l("Çok node'lu bir Kubernetes cluster'ı", "A multi-node Kubernetes cluster"), l("Her container'ı elle `docker run`", "`docker run` each container by hand"), l("Fark etmez", "It does not matter")],
      answer: 0,
      explain: l("Tek makinede Compose daha basit ve yeterli. Birden fazla makine, otomatik ölçekleme ve dayanıklılık gerekince Kubernetes'e bakılır.", "On one machine Compose is simpler and enough. Kubernetes is worth it once you need several machines, autoscaling and resilience."),
      reviewStep: 8,
    },
  ],
};
