import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import { scene } from "./Scene";

export const security: Lesson = {
  slug: "security",
  title: l("Güvenlik temelleri", "Security basics"),
  summary: l(
    "Container'ı root olmadan çalıştır, sırları image'a gömme, güvenilir ve küçük image'lar seç, image'larını tara.",
    "Run containers without root, keep secrets out of images, choose trusted and small images, and scan what you ship.",
  ),
  minutes: 15,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: missions.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("`USER` ile container'ı root olmadan çalıştırmak", "Run a container without root using `USER`"), step: 1 },
    { text: l("Image'a giren bir sırrın neden silinemediğini görmek", "See why a secret that entered an image cannot be deleted"), step: 3 },
    { text: l("Sırları image dışında tutmak: .dockerignore, -e, build secret", "Keep secrets outside the image: .dockerignore, -e, build secrets"), step: 5 },
    { text: l("Resmi, küçük image'lar seçip taramak", "Pick official, small images and scan them"), step: 8 },
  ],
  steps: [
    {
      short: l("Varsayılan root", "Root by default"),
      tag: "problem",
      predict: {
        question: l("Dockerfile'da `USER` satırı yok. Container içinde `whoami` ne der?", "The Dockerfile has no `USER` line. What does `whoami` say inside the container?"),
        options: [l("root", "root"), l("node", "node"), l("nobody", "nobody")],
        answer: 0,
        why: l("Başka bir şey söylenmezse çoğu image'da ana süreç root olarak çalışır.", "Unless told otherwise, the main process in most images runs as root."),
      },
      title: l("Container'lar varsayılan olarak root", "Containers run as root by default"),
      body: [
        l(
          "`acme/api:root` image'ını kurduk ve çalıştırdık; `docker exec api-root whoami` cevabı `root`. Sağdaki kartta kullanıcı kırmızı.",
          "We built and ran `acme/api:root`; `docker exec api-root whoami` answers `root`. The user is red on the card on the right.",
        ),
        l(
          "Container yalıtılmış olsa da içerideki root, çekirdeği host ile paylaşır. Uygulamanda bir açık olursa saldırgan root yetkisiyle başlar; bir yapılandırma hatası ya da yeni bir çekirdek açığıyla host'a ulaşması kolaylaşır.",
          "A container is isolated, but root inside still shares the kernel with the host. If your app has a hole, the attacker starts as root, and a misconfiguration or a new kernel bug makes reaching the host easier.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker exec api-root whoami" },
          { cmd: "docker inspect -f '{{.Config.User}}' acme/api:root", note: l("Boşsa root demektir.", "Empty means root.") },
        ],
      },
    },
    {
      short: l("USER", "USER"),
      tag: "how",
      predict: {
        question: l("Dockerfile'a `USER node` ekledik (dosyaları da `--chown=node:node` ile kopyaladık). `whoami` ne der?", "We added `USER node` to the Dockerfile (and copied the files with `--chown=node:node`). What does `whoami` say?"),
        options: [l("root: Docker hep root çalıştırır", "root: Docker always uses root"), l("node", "node"), l("Hata: kullanıcı yok", "An error: no such user")],
        answer: 1,
        why: l("`USER` sonraki satırları ve container'ın ana sürecini o kullanıcıyla çalıştırır. `node` kullanıcısı resmi Node image'larında hazır gelir.", "`USER` runs later lines and the container's main process as that user. The `node` user comes ready in the official Node images."),
      },
      title: l("USER: root olmayan bir kullanıcı", "USER: a non-root user"),
      body: [
        l(
          "`acme/api:user` aynı uygulama, iki fark var: dosyalar `COPY --chown=node:node` ile kopyalandı ve sondan önce `USER node` geldi. `whoami` artık `node`.",
          "`acme/api:user` is the same app with two changes: the files were copied with `COPY --chown=node:node`, and `USER node` comes before the end. `whoami` now says `node`.",
        ),
        l(
          "`USER` satırını paket kurulumlarından (`apt-get`, `npm ci`) **sonra** koy: kurulumun root'a ihtiyacı olabilir, uygulamanın olmaz.",
          "Put `USER` **after** package installs (`apt-get`, `npm ci`): installing may need root, running the app does not.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker run --rm --user 1000:1000 alpine:3.20 id", note: l("Bir image'ı denemek için kullanıcıyı çalıştırırken de verebilirsin.", "You can also set the user at run time to try an image.") }],
        snippets: [
          {
            label: "Dockerfile",
            code: "FROM node:22-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY --chown=node:node . .\nUSER node\nCMD [\"node\", \"server.js\"]",
          },
          {
            label: "Dockerfile · kendi kullanıcın",
            code: "RUN groupadd --system app && useradd --system --gid app app\nUSER app",
            note: l("Image'da hazır kullanıcı yoksa (Debian tabanlı). Alpine'de `addgroup -S app && adduser -S app -G app`.", "When the image has no ready user (Debian-based). On Alpine: `addgroup -S app && adduser -S app -G app`."),
          },
        ],
      },
    },
    {
      short: l("Gömülü sır", "Baked-in secret"),
      tag: "problem",
      title: l("Sırrı image'a koymak", "Putting a secret into the image"),
      body: [
        l(
          "`acme/api:leaky` `.env` dosyasını image'a kopyalıyor. Soldaki `docker history` kartında o katman kırmızı: `API_KEY` artık image'ın bir parçası.",
          "`acme/api:leaky` copies `.env` into the image. In the `docker history` card on the left that layer is red: `API_KEY` is now part of the image.",
        ),
        l(
          "Image'ı registry'ye gönderen, çeken ya da bir yerde saklayan herkes o anahtarı okuyabilir: `docker save` ya da `docker run ... cat .env` yeter.",
          "Anyone who pushes, pulls or stores the image can read that key: `docker save` or `docker run ... cat .env` is enough.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker history --no-trunc acme/api:leaky", note: l("Her katmanı ve onu yapan satırı gösterir.", "Shows every layer and the line that made it.") }],
      },
    },
    {
      short: l("rm işe yarar mı?", "Does rm help?"),
      tag: "experiment",
      predict: {
        question: l("Bir sonraki satıra `RUN rm .env` ekledik. Son image'da sır hâlâ var mı?", "We added `RUN rm .env` on the next line. Is the secret still in the final image?"),
        options: [l("Hayır, silindi", "No, it is deleted"), l("Evet, önceki katmanda duruyor", "Yes, it stays in the earlier layer"), l("Image build olmaz", "The image does not build")],
        answer: 1,
        why: l(
          "Her satır yeni bir katman ekler; eski katmanlar değişmez. `rm` sadece dosyayı üstte gizler, alttaki katman sırrı taşımaya devam eder.",
          "Each line adds a new layer; earlier layers never change. `rm` only hides the file on top; the layer below still carries the secret.",
        ),
      },
      title: l("Silmek gizlemektir", "Deleting only hides it"),
      body: [
        l(
          "`acme/api:leaky2`'de `.env`'i kopyalayan katman hâlâ kırmızı. Üstteki `RUN rm .env` katmanı 0 MB: sadece \"bu dosya artık görünmesin\" notu.",
          "In `acme/api:leaky2` the layer that copied `.env` is still red. The `RUN rm .env` layer on top is 0 MB: just a note saying \"hide this file\".",
        ),
        l(
          "Bir sır bir kez image'a girdiyse onu **sızmış say**: anahtarı iptal et ve yenisini üret. Image'ı yeniden build etmek yetmez, eski image başka yerlerde durabilir.",
          "Once a secret has entered an image, **treat it as leaked**: revoke the key and issue a new one. Rebuilding is not enough; the old image may be stored elsewhere.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker save acme/api:leaky2 -o leaky.tar", note: l("Image'ı katmanlarıyla dışarı aktarır; içinden eski dosya çıkarılabilir.", "Exports the image with its layers; the old file can be pulled back out.") }],
      },
    },
    {
      short: l("Temiz image", "Clean image"),
      tag: "how",
      title: l("Sır image'a girmez, çalışırken gelir", "The secret stays out and arrives at run time"),
      body: [
        l(
          "`.env` artık `.dockerignore`'da: build'e hiç girmiyor ve `acme/api:clean`'de kırmızı katman yok. Anahtar container'a çalışırken `-e API_KEY=...` ile geldi; kartta `API_KEY=••••` görünüyor.",
          "`.env` is now in `.dockerignore`: it never enters the build, and `acme/api:clean` has no red layer. The key reached the container at run time with `-e API_KEY=...`; the card shows `API_KEY=••••`.",
        ),
        l(
          "Böylece aynı image her ortamda kullanılır; değişen sadece dışarıdan verilen ayarlar. Gerçek ortamlarda bu değerleri bir secret manager (Docker/Kubernetes secrets, Vault, bulutun kendi aracı) verir.",
          "The same image then works everywhere; only the settings given from outside change. In real setups a secret manager (Docker or Kubernetes secrets, Vault, your cloud's own tool) provides them.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "echo .env >> .dockerignore", note: l("`.git`, `node_modules` ve anahtar dosyalarını da ekle.", "Add `.git`, `node_modules` and key files too.") },
          { cmd: "docker run -d --name api --env-file .env acme/api:clean", note: l("Sır çalışırken, dosyadan gelir; image'da yok.", "The secret comes from the file at run time; it is not in the image.") },
        ],
      },
    },
    {
      short: l("Build secret", "Build secret"),
      tag: "how",
      title: l("Build sırasında sır gerekirse", "When the build itself needs a secret"),
      body: [
        l(
          "Bazen build'in kendisi bir anahtara ihtiyaç duyar: özel bir npm paketi ya da özel bir git deposu. Onu `ARG` ya da `ENV` ile verme; ikisi de image geçmişinde görünür.",
          "Sometimes the build itself needs a key: a private npm package or a private git repo. Do not pass it with `ARG` or `ENV`; both show up in the image history.",
        ),
        l(
          "BuildKit'in secret mount'u dosyayı sadece o `RUN` satırı süresince bağlar ve hiçbir katmana yazmaz. Bu sahnede modellenmedi; aşağıdaki gibi kullanılır.",
          "BuildKit's secret mount attaches the file for that one `RUN` line only and writes it into no layer. It is not modelled on this stage; it looks like this.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker build --secret id=npmrc,src=$HOME/.npmrc -t acme/api .", note: l("Sır, build'e dosya olarak verilir.", "The secret is handed to the build as a file.") }],
        snippets: [
          {
            label: "Dockerfile",
            code: "# syntax=docker/dockerfile:1\nFROM node:22-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci",
            note: l("`.npmrc` sadece bu satırda var; image'da iz kalmaz.", "`.npmrc` exists only during this line; no trace is left in the image."),
          },
        ],
      },
    },
    {
      short: l("Resmi image", "Official images"),
      tag: "how",
      title: l("Güvendiğin yerden çek", "Pull from sources you trust"),
      body: [
        l(
          "`docker pull nod:22-slim` hata verdi: böyle bir image yok. Bu sahnede yok, ama gerçek Docker Hub'da tanıdık adlara benzeyen, içinde zararlı kod olan image'lar bulunabiliyor.",
          "`docker pull nod:22-slim` failed: there is no such image. Here it does not exist, but on the real Docker Hub there can be images with look-alike names carrying malicious code.",
        ),
        l(
          "Docker Hub'da **Docker Official Image** ya da **Verified Publisher** rozetli image'ları tercih et; sürümü sabitle (`node:22-slim`, hatta `@sha256:...` ile digest) ve image'ı düzenli olarak güncelle.",
          "Prefer images marked **Docker Official Image** or **Verified Publisher** on Docker Hub; pin the version (`node:22-slim`, or even a digest with `@sha256:...`) and update the image regularly.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker pull node:22-slim" },
          { cmd: "docker image inspect --format '{{index .RepoDigests 0}}' node:22-slim", note: l("Çektiğin image'ın digest'i; Dockerfile'da `FROM node:22-slim@sha256:...` ile sabitleyebilirsin.", "The digest of what you pulled; pin it with `FROM node:22-slim@sha256:...`.") },
        ],
      },
    },
    {
      short: l("Distroless", "Distroless"),
      tag: "experiment",
      predict: {
        question: l("Uygulamayı distroless bir image'a taşıdık. `docker exec api-dl sh` ile içine girmeye çalışırsak?", "We moved the app to a distroless image. What if we try `docker exec api-dl sh`?"),
        options: [l("Kabuk açılır", "A shell opens"), l("Açılmaz: image'da `sh` yok", "It does not open: the image has no `sh`"), l("Docker root kabuğu verir", "Docker gives a root shell")],
        answer: 1,
        why: l(
          "Distroless image'larda sadece uygulamanın runtime'ı var: kabuk, paket yöneticisi, `curl` yok. Bir saldırganın kullanabileceği araç sayısı çok az.",
          "Distroless images hold just the app's runtime: no shell, no package manager, no `curl`. An attacker has very few tools to use.",
        ),
      },
      title: l("Küçük image, küçük saldırı yüzeyi", "Small image, small attack surface"),
      body: [
        l(
          "`acme/api:distroless` iki aşamada kuruldu: bağımlılıklar `node:22-slim` içinde kuruldu, çalışan image ise distroless. `exec ... sh` 127 ile reddedildi ve kullanıcı varsayılan olarak `nonroot`.",
          "`acme/api:distroless` was built in two stages: dependencies were installed in `node:22-slim`, and the running image is distroless. `exec ... sh` was refused with 127, and the user is `nonroot` by default.",
        ),
        l(
          "Kartta \"programlar\" sayısına bak: image'da ne kadar az program olursa güncellemen ve taraman gereken o kadar az şey olur. Bedeli de var: içeride sorun gidermek zorlaşır, logları ve dışarıdan araçları kullanırsın.",
          "Look at the \"programs\" count on the card: the fewer programs in the image, the less there is to patch and scan. There is a cost: debugging inside gets harder, so you lean on logs and outside tools.",
        ),
      ],
      practice: {
        commands: [],
        snippets: [
          {
            label: "Dockerfile · multi-stage + distroless",
            code: "FROM node:22-slim AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\n\nFROM gcr.io/distroless/nodejs22-debian12\nWORKDIR /app\nCOPY --from=build /app /app\nCMD [\"server.js\"]",
            note: l("Distroless Node image'ında ENTRYPOINT zaten `node`; CMD sadece dosya adını verir.", "In the distroless Node image the ENTRYPOINT is already `node`; CMD only names the file."),
          },
        ],
      },
    },
    {
      short: l("Tarama", "Scanning"),
      tag: "reality",
      title: l("Image'larını tara", "Scan your images"),
      body: [
        l(
          "Base image'daki paketlerde zamanla açıklar (CVE) bulunur. Tarayıcılar image'daki paketleri bilinen açık veritabanlarıyla karşılaştırır. **Docker Scout** Docker'ın kendi aracı, **Trivy** ise yaygın kullanılan açık kaynak bir alternatif.",
          "Over time vulnerabilities (CVEs) are found in the packages of a base image. Scanners compare an image's packages with databases of known issues. **Docker Scout** is Docker's own tool; **Trivy** is a widely used open-source alternative.",
        ),
        l(
          "Taramayı CI'ya koy: yeni bir image yüksek dereceli açık taşıyorsa build kırılsın. Çoğu zaman çözüm base image'ı güncellemek ya da daha küçüğüne geçmek.",
          "Put scanning in CI so a new image with a high-severity issue fails the build. The fix is usually updating the base image or moving to a smaller one.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede tarama yapılmıyor; \"programlar\" sayısı sadece image'da ne kadar araç olduğunu gösteriyor. Gerçek tarama sonuçları image'ın sürümüne ve taramanın yapıldığı güne göre değişir.",
            "No scanning happens on this stage; the \"programs\" count only shows how many tools an image holds. Real scan results depend on the image version and the day you scan.",
          ),
        },
        {
          kind: "insight",
          text: l(
            "Çalışırken de yetkiyi daralt: `--read-only` dosya sistemini salt okunur yapar, `--cap-drop ALL` Linux yetkilerini kaldırır. `--privileged` neredeyse hiçbir zaman gerekmez.",
            "Narrow permissions at run time too: `--read-only` makes the filesystem read-only, `--cap-drop ALL` drops Linux capabilities. You almost never need `--privileged`.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker scout quickview acme/api:clean", note: l("Kısa özet ve base image önerisi.", "A short summary and base image advice.") },
          { cmd: "docker scout cves acme/api:clean", note: l("Bulunan açıkların listesi.", "The list of vulnerabilities found.") },
          { cmd: "trivy image acme/api:clean", note: l("Trivy ile aynı iş (ayrıca kurulur).", "The same with Trivy (installed separately).") },
          { cmd: "docker run -d --read-only --cap-drop ALL --name api acme/api:clean", note: l("Çalışırken yetkileri daralt.", "Narrow permissions at run time.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen dene", "Now you try"),
      body: [
        l(
          "`acme/api:dev` sır içeren bir Dockerfile ile kurulmuş ve `api` onu root olarak çalıştırıyor. Farklı Dockerfile'larla yeniden build edebilir, container'ı silip yeniden başlatabilir ve içine komut gönderebilirsin.",
          "`acme/api:dev` was built from a Dockerfile that includes a secret, and `api` runs it as root. You can rebuild with different Dockerfiles, remove and restart the container, and send it commands.",
        ),
        l("Sahnenin altında **3 görev** var. Az hamleyle bitirirsen 3 yıldız alırsın.", "Under the scene there are **3 missions**. Few moves earn 3 stars."),
      ],
    },
  ],
  recap: [
    l("Container'lar varsayılan olarak root çalışır; Dockerfile'da `USER` ile root olmayan bir kullanıcıya geç.", "Containers run as root by default; switch to a non-root user with `USER` in the Dockerfile."),
    l("Image'a giren bir sır sonraki katmanda silinse bile image'da kalır; bir kez girdiyse anahtarı yenile.", "A secret that entered an image stays there even if a later layer deletes it; once it got in, rotate the key."),
    l("Sırları `.dockerignore` ile build'in dışında tut, çalışırken `-e`, `--env-file` ya da bir secret manager ile ver.", "Keep secrets out of the build with `.dockerignore` and pass them at run time with `-e`, `--env-file` or a secret manager."),
    l("Build sırasında gereken sırlar için `RUN --mount=type=secret` kullan, `ARG`/`ENV` değil.", "For secrets the build needs, use `RUN --mount=type=secret`, not `ARG`/`ENV`."),
    l("Resmi ya da doğrulanmış image'ları seç, sürümü sabitle; küçük image (slim, distroless) daha az açık demek.", "Choose official or verified images and pin the version; a small image (slim, distroless) means fewer holes."),
    l("Image'larını Docker Scout ya da Trivy ile tara, taramayı CI'ya koy.", "Scan your images with Docker Scout or Trivy, and put the scan in CI."),
  ],
  quiz: [
    {
      question: l("Dockerfile'da `COPY .env .` ve hemen ardından `RUN rm .env` var. Image güvende mi?", "The Dockerfile has `COPY .env .` followed by `RUN rm .env`. Is the image safe?"),
      options: [
        l("Evet, dosya silindi", "Yes, the file was deleted"),
        l("Hayır, sır COPY katmanında duruyor", "No, the secret stays in the COPY layer"),
        l("Sadece push edilmezse", "Only if it is never pushed"),
        l("Evet, BuildKit siler", "Yes, BuildKit deletes it"),
      ],
      answer: 1,
      explain: l("Katmanlar değişmez; `rm` sadece üstte gizler. Anahtarı sızmış say ve yenile.", "Layers never change; `rm` only hides the file on top. Treat the key as leaked and rotate it."),
      reviewStep: 3,
    },
    {
      question: l("Build sırasında özel bir npm paketi için token gerekiyor. En doğru yol?", "The build needs a token for a private npm package. The right way?"),
      options: [
        l("`ARG NPM_TOKEN` ile vermek", "Pass it with `ARG NPM_TOKEN`"),
        l("`ENV NPM_TOKEN=...` yazmak", "Write `ENV NPM_TOKEN=...`"),
        l("`RUN --mount=type=secret` ile vermek", "Pass it with `RUN --mount=type=secret`"),
        l("`.npmrc`'yi COPY ile kopyalamak", "COPY the `.npmrc` file in"),
      ],
      answer: 2,
      explain: l("Secret mount dosyayı sadece o satır süresince bağlar ve hiçbir katmana yazmaz. ARG ve ENV image geçmişinde görünür.", "A secret mount attaches the file for that line only and writes it into no layer. ARG and ENV show in the image history."),
      reviewStep: 5,
    },
    {
      question: l("`USER node` satırı Dockerfile'da nereye konmalı?", "Where should the `USER node` line go in the Dockerfile?"),
      options: [
        l("En başa, FROM'dan önce", "At the very top, before FROM"),
        l("Paket kurulumlarından sonra, CMD'den önce", "After package installs, before CMD"),
        l("CMD'den sonra", "After CMD"),
        l("Fark etmez", "It does not matter"),
      ],
      answer: 1,
      explain: l("Kurulum root isteyebilir; uygulama istemez. USER'dan sonraki satırlar ve container o kullanıcıyla çalışır.", "Installing may need root; the app does not. Lines after USER, and the container itself, run as that user."),
      reviewStep: 1,
    },
    {
      question: l("Distroless bir image'ın en büyük güvenlik kazancı nedir?", "What is the biggest security gain of a distroless image?"),
      options: [
        l("Şifreleri otomatik saklar", "It stores passwords automatically"),
        l("İçinde kabuk ve gereksiz araç olmadığı için saldırı yüzeyi küçüktür", "No shell or extra tools, so the attack surface is small"),
        l("Root olarak çalışmayı engellemez ama hızlıdır", "It does not stop root but it is fast"),
        l("Tarama gerektirmez", "It never needs scanning"),
      ],
      answer: 1,
      explain: l("Az program = az açık ve saldırganın kullanabileceği az araç. Yine de taranmalı ve güncellenmeli.", "Fewer programs mean fewer holes and fewer tools for an attacker. It still needs scanning and updates."),
      reviewStep: 7,
    },
  ],
};
