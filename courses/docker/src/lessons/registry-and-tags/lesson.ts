import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const registryAndTags: Lesson = {
  slug: "registry-and-tags",
  title: l("Registry ve tag'ler", "Registries and tags"),
  summary: l(
    "Image'ları paylaşmak için registry: `docker tag`, `push`, `pull`. Bir tag'in sadece bir isim olduğunu, `latest`'in neden riskli olduğunu ve sürüm ya da digest ile nasıl sabitleneceğini gör.",
    "Share images through a registry: `docker tag`, `push`, `pull`. See that a tag is only a name, why `latest` is risky, and how to pin a version or a digest.",
  ),
  minutes: 13,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir image adının parçalarını okumak: registry/sahip/repo:tag", "Read the parts of an image name: registry/owner/repo:tag"), step: 1 },
    { text: l("`tag` ve `push` ile kendi image'ını yayınlamak", "Publish your own image with `tag` and `push`"), step: 2 },
    { text: l("`latest`'in yerinin değişebildiğini görmek", "See that `latest` can move"), step: 4 },
    { text: l("Sürüm ve digest ile sabitlemek", "Pin with a version or a digest"), step: 5 },
  ],
  steps: [
    {
      short: l("Registry", "Registry"),
      tag: "how",
      title: l("Image'lar bir registry'de durur", "Images live in a registry"),
      body: [
        l(
          "Solda bu makine, sağda bir [[registry]]: image'ların saklanıp paylaşıldığı sunucu. En bilineni Docker Hub; `nginx`, `postgres` gibi resmi image'lar orada.",
          "On the left is this machine; on the right is a [[registry]], a server that stores and shares images. The best known is Docker Hub, home of official images such as `nginx` and `postgres`.",
        ),
        l(
          "`docker pull nginx:1.27` image'ı registry'den bu makineye indirdi. Satırdaki renkli kutu image'ın kimliği (ID): iki tarafta aynı renk, aynı image demek.",
          "`docker pull nginx:1.27` copied the image from the registry to this machine. The coloured box on each row is the image id: the same colour on both sides means the same image.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker pull nginx:1.27" },
          { cmd: "docker images", note: l("Yereldeki image'lar: REPOSITORY, TAG, IMAGE ID.", "Local images: REPOSITORY, TAG, IMAGE ID.") },
        ],
      },
    },
    {
      short: l("Tag", "Tag"),
      tag: "how",
      predict: {
        question: l(
          "`docker tag shop:dev ghcr.io/ada/shop:1.0.0` çalıştıracağız. Bu komut ne yapar?",
          "We will run `docker tag shop:dev ghcr.io/ada/shop:1.0.0`. What does it do?",
        ),
        options: [
          l("Image'ın bir kopyasını oluşturur", "Makes a copy of the image"),
          l("Aynı image'a ikinci bir isim verir", "Gives the same image a second name"),
          l("Image'ı registry'ye gönderir", "Sends the image to the registry"),
        ],
        answer: 1,
        why: l(
          "Tag bir isim etiketi. Yeni bir image oluşmaz; iki isim aynı image ID'sini gösterir, diskte yer de kaplamaz.",
          "A tag is a name label. No new image is created; both names point at the same image id and take no extra disk space.",
        ),
      },
      title: l("Bir tag, sadece bir isim", "A tag is only a name"),
      body: [
        l(
          "Yerelde iki satır var: `shop:dev` ve `ghcr.io/ada/shop:1.0.0`. İkisinin de kimlik kutusu aynı renk: aynı image, iki ad.",
          "There are two local rows: `shop:dev` and `ghcr.io/ada/shop:1.0.0`. Their id boxes have the same colour: one image, two names.",
        ),
        l(
          "Adın parçaları bir adres gibi okunur: `ghcr.io` registry, `ada` sahibi, `shop` repo, `1.0.0` tag. Registry yazmazsan Docker Hub varsayılır: `nginx`, aslında `docker.io/library/nginx:latest` demek.",
          "Read the name like an address: `ghcr.io` is the registry, `ada` the owner, `shop` the repository, `1.0.0` the tag. Leave the registry out and Docker Hub is assumed: `nginx` really means `docker.io/library/nginx:latest`.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker tag shop:dev ghcr.io/ada/shop:1.0.0" },
          { cmd: "docker images ghcr.io/ada/shop", note: l("Aynı IMAGE ID, farklı ad.", "Same IMAGE ID, different name.") },
        ],
      },
    },
    {
      short: l("push", "push"),
      tag: "how",
      title: l("docker push: yayınla", "docker push: publish"),
      body: [
        l(
          "`docker push ghcr.io/ada/shop:1.0.0` image'ı registry'ye gönderdi. Sağda aynı renkli kutuyla yeni bir satır var: artık başka bir bilgisayar ya da sunucu bu image'ı çekebilir.",
          "`docker push ghcr.io/ada/shop:1.0.0` sent the image to the registry. A new row appears on the right with the same coloured box: another computer or a server can now pull this image.",
        ),
        l(
          "Push, adın başındaki registry'ye gider. Bu yüzden önce image'ı o registry'nin adıyla tag'lemek gerekiyordu.",
          "A push goes to the registry at the start of the name. That is why the image first needed a tag with that registry's name.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "echo $GITHUB_TOKEN | docker login ghcr.io -u ada --password-stdin", note: l("Push için önce giriş yapılır. GHCR'de `write:packages` yetkili bir token kullanılır.", "Log in before pushing. GHCR takes a token with `write:packages`.") },
          { cmd: "docker push ghcr.io/ada/shop:1.0.0" },
        ],
      },
    },
    {
      short: l("İkinci push", "Second push"),
      tag: "experiment",
      predict: {
        question: l(
          "Aynı image'a bir de `:latest` adı verip onu da push'layacağız. Bu push kaç layer yükler?",
          "We will also name the same image `:latest` and push that too. How many layers does this push upload?",
        ),
        options: [l("Hepsini, baştan", "All of them, again"), l("Hiçbirini: layer'lar zaten orada", "None: the layers are already there"), l("Yarısını", "Half")],
        answer: 1,
        why: l(
          "Registry layer'ları içeriklerine göre tanır. Hepsi 1.0.0 ile zaten gönderilmişti; sadece yeni isim eklenir.",
          "The registry knows layers by their content. They all went up with 1.0.0 already; only the new name is added.",
        ),
      },
      title: l("Layer'lar bir kez gider", "Layers go up once"),
      body: [
        l(
          "Ok üstünde `push · 0/N layer` yazıyor: hiçbir layer yüklenmedi. Registry'de artık `:1.0.0` ve `:latest` aynı image'ı gösteriyor.",
          "The arrow says `push · 0/N layer`: no layer was uploaded. In the registry `:1.0.0` and `:latest` now point at the same image.",
        ),
        l(
          "Aynı şey çekerken de olur: bir image'ın base layer'ları zaten makinende varsa sadece eksik olanlar iner. Küçük ve paylaşılan base image'lar bu yüzden hız kazandırır.",
          "The same happens when pulling: if an image's base layers are already on your machine, only the missing ones come down. Small, shared base images save time this way.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker tag shop:dev ghcr.io/ada/shop:latest" },
          { cmd: "docker push ghcr.io/ada/shop:latest", note: l("Çıktıda layer'lar için \"Layer already exists\" görürsün.", "The output says \"Layer already exists\" for each layer.") },
        ],
      },
    },
    {
      short: l("latest kayar", "latest moves"),
      tag: "problem",
      predict: {
        question: l(
          "Bir takım arkadaşın yeni bir sürümü `:latest` olarak push'ladı. Sunucuda `docker pull ghcr.io/ada/shop:latest` ne getirir?",
          "A teammate pushed a new version as `:latest`. On a server, what does `docker pull ghcr.io/ada/shop:latest` bring?",
        ),
        options: [
          l("Dün çektiğinle aynı image", "The same image you pulled yesterday"),
          l("En son push edilen, farklı bir image", "Whatever was pushed last, a different image"),
          l("Hata: latest değiştirilemez", "An error: latest cannot change"),
        ],
        answer: 1,
        why: l(
          "Tag'ler değişebilir. `latest` özel bir şey değil, sadece en son o adla gönderilen image'ı gösteren bir isim.",
          "Tags can move. `latest` is nothing special, just a name for whatever was last pushed under it.",
        ),
      },
      title: l("Neden latest riskli?", "Why latest is risky"),
      body: [
        l(
          "Registry'deki `:latest` satırı kırmızı yandı: artık başka bir image'ı gösteriyor. Sunucu `pull` yapınca yerel `:latest` de değişti; metrikte \"`:latest` ve `:1.0.0`: farklı!\" yazıyor.",
          "The registry's `:latest` row flashed red: it now points at another image. When the server pulled, its local `:latest` changed too; the metric says \":latest vs :1.0.0: different!\".",
        ),
        l(
          "`latest` ile çalışan bir sunucu yeniden başladığında, ya da yeni bir sunucu eklendiğinde, kimsenin test etmediği bir sürümü çalıştırabilir. Hangi sürümün çalıştığını da hiçbir zaman tam bilemezsin.",
          "A server running `latest` may pick up a version nobody tested when it restarts or when a new server joins. And you never quite know which version is running.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker pull ghcr.io/ada/shop:latest" },
          { cmd: "docker images ghcr.io/ada/shop", note: l("`latest` ve `1.0.0` artık farklı IMAGE ID'ler.", "`latest` and `1.0.0` now have different IMAGE IDs.") },
        ],
      },
    },
    {
      short: l("Sabitle", "Pin it"),
      tag: "how",
      title: l("Sürümle ve digest ile sabitle", "Pin with a version and a digest"),
      body: [
        l(
          "`docker pull ghcr.io/ada/shop:1.0.0` hâlâ ilk image'ı getirdi: kutu rengi değişmedi. Sunucularda, compose dosyalarında ve Dockerfile'ların `FROM` satırında hep belirli bir sürüm yaz.",
          "`docker pull ghcr.io/ada/shop:1.0.0` still brought the first image: the box colour did not change. On servers, in compose files and in Dockerfile `FROM` lines, always name a specific version.",
        ),
        l(
          "Bir adım daha ileri: **digest**. Her image'ın içeriğinden hesaplanan `sha256:...` bir parmak izi var. `shop@sha256:...` ile çekersen o içerik dışında hiçbir şey gelemez, biri aynı tag'i yeniden push'lasa bile.",
          "One step further: the **digest**. Every image has a `sha256:...` fingerprint computed from its content. Pull `shop@sha256:...` and nothing but that content can arrive, even if someone pushes the same tag again.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sürüm tag'leri de teknik olarak değiştirilebilir: biri `1.0.0`'ı yeniden push'layabilir. Gerçek değişmezliği sadece digest verir. Bu sahnedeki kimlikler gerçek sha256 değil, kısa örnek kimlikler.",
            "Version tags can technically move too: someone can push `1.0.0` again. Only a digest is truly immutable. The ids on this stage are short stand-ins, not real sha256 digests.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker pull ghcr.io/ada/shop:1.0.0" },
          { cmd: "docker images --digests ghcr.io/ada/shop", note: l("Her image'ın digest'ini gösterir.", "Shows each image's digest.") },
          { cmd: "docker pull ghcr.io/ada/shop@sha256:<digest>", note: l("Tam olarak o içerik.", "Exactly that content.") },
        ],
        snippets: [{ label: "Dockerfile", code: "FROM node:22-alpine\n# or, fully pinned:\n# FROM node:22-alpine@sha256:<digest>" }],
      },
    },
    {
      short: l("rmi", "rmi"),
      tag: "experiment",
      predict: {
        question: l(
          "`ghcr.io/ada/shop:1.0.0`'ı `docker rmi` ile sileceğiz. Aynı image'ın `shop:dev` adı da var. Ne olur?",
          "We will `docker rmi ghcr.io/ada/shop:1.0.0`. The same image is also called `shop:dev`. What happens?",
        ),
        options: [
          l("Image silinir, `shop:dev` de gider", "The image is deleted and `shop:dev` goes too"),
          l("Sadece bu isim kalkar; image `shop:dev` adıyla kalır", "Only this name goes; the image stays as `shop:dev`"),
          l("Docker reddeder", "Docker refuses"),
        ],
        answer: 1,
        why: l(
          "Birden fazla adı olan bir image'da `rmi` sadece o ismi kaldırır (Untagged). Image son adı da gidince silinir.",
          "For an image with several names, `rmi` only removes that name (Untagged). The image is deleted when its last name goes.",
        ),
      },
      title: l("İsmi silmek, image'ı silmek değil", "Removing a name is not removing the image"),
      body: [
        l(
          "Altta `untagged` yazıyor. `ghcr.io/ada/shop:1.0.0` satırı yerelden kalktı, ama `shop:dev` aynı renkli kutuyla duruyor. Registry'deki kopyaya da dokunulmadı.",
          "At the bottom it says `untagged`. The local `ghcr.io/ada/shop:1.0.0` row is gone, but `shop:dev` stays with the same coloured box. The copy in the registry was not touched.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker rmi ghcr.io/ada/shop:1.0.0", note: l("Çıktı: \"Untagged: ...\". Image başka adla duruyorsa silinmez.", "Output: \"Untagged: ...\". If the image has another name it stays.") },
          { cmd: "docker image prune", note: l("Hiçbir adı kalmamış (dangling) image'ları temizler.", "Cleans up images with no name left (dangling).") },
        ],
      },
    },
    {
      short: l("Özel registry", "Private registry"),
      tag: "reality",
      title: l("Özel registry'ler: GHCR, GitLab, ECR", "Private registries: GHCR, GitLab, ECR"),
      body: [
        l(
          "Şirket kodu çoğu zaman herkese açık Docker Hub'a değil, özel bir registry'ye gider. Hepsi aynı şekilde çalışır: önce `docker login`, sonra adın başına registry'nin adresi.",
          "Company code usually goes to a private registry rather than public Docker Hub. They all work the same way: `docker login` first, then the registry's address at the start of the name.",
        ),
        l(
          "GitHub Container Registry: `ghcr.io/sahip/uygulama:1.2.3`. GitLab: `registry.gitlab.com/grup/proje/uygulama:1.2.3`. AWS ECR: `<hesap>.dkr.ecr.<bölge>.amazonaws.com/uygulama:1.2.3`.",
          "GitHub Container Registry: `ghcr.io/owner/app:1.2.3`. GitLab: `registry.gitlab.com/group/project/app:1.2.3`. AWS ECR: `<account>.dkr.ecr.<region>.amazonaws.com/app:1.2.3`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede giriş yapmadan push edebiliyoruz. Gerçekte özel registry'ler kimlik ister; Docker Hub da giriş yapmadan çekenlere bir sınır koyar. CI'da token'ı bir secret olarak verirsin.",
            "On this stage we push without logging in. In reality private registries require credentials, and Docker Hub limits anonymous pulls. In CI you provide the token as a secret.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "echo $GITHUB_TOKEN | docker login ghcr.io -u <kullanıcı> --password-stdin", note: l("GHCR.", "GHCR.") },
          { cmd: "docker login registry.gitlab.com", note: l("GitLab Container Registry.", "GitLab Container Registry.") },
          {
            cmd: "aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin <hesap>.dkr.ecr.eu-central-1.amazonaws.com",
            note: l("AWS ECR: giriş şifresini AWS CLI üretir.", "AWS ECR: the AWS CLI produces the login password."),
          },
        ],
      },
    },
    {
      short: l("Tag stratejisi", "Tag strategy"),
      tag: "reality",
      title: l("Kendi projen için bir tag stratejisi", "A tag strategy for your own project"),
      body: [
        l(
          "İyi bir alışkanlık: her sürümü değişmeyecek bir tag ile yayınla (`1.4.2`), istersen kayan kısayollar da ekle (`1.4`, `1`). CI'da her build'e commit'in kısa kimliğini de tag olarak ver (`sha-3f9c2e1`): hangi kodun çalıştığını anında bilirsin.",
          "A good habit: publish every release with a tag that never changes (`1.4.2`), and add moving shortcuts if you like (`1.4`, `1`). In CI, also tag every build with the commit's short id (`sha-3f9c2e1`), so you always know which code is running.",
        ),
        l(
          "`latest`'i kullanacaksan bile sadece \"en yeni\" anlamında kullan; sunuculara ve compose dosyalarına hep sürüm ya da digest yaz.",
          "If you use `latest` at all, use it only to mean \"newest\"; servers and compose files always get a version or a digest.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker build -t ghcr.io/ada/shop:1.4.2 -t ghcr.io/ada/shop:1.4 .", note: l("Bir build, birden fazla tag.", "One build, several tags.") },
          { cmd: "docker tag ghcr.io/ada/shop:1.4.2 ghcr.io/ada/shop:sha-$(git rev-parse --short HEAD)" },
          { cmd: "docker push --all-tags ghcr.io/ada/shop", note: l("Repo'nun bütün yerel tag'lerini gönderir.", "Pushes every local tag of the repository.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Bu makinede uygulamanın `shop:dev` image'ı var; registry GitHub Container Registry (`ghcr.io/ada/shop`), token'ın `GITHUB_TOKEN` değişkeninde. Aşağıda gerçek işten **5 senaryo** var: komutları terminale **kendin yaz**, sahne yerel tag'leri ve registry'yi gösterir.",
          "Your turn. This machine has the app's `shop:dev` image; the registry is GitHub Container Registry (`ghcr.io/ada/shop`), and your token is in `GITHUB_TOKEN`. Below are **5 scenarios** from real work: **type the commands yourself**; the scene shows the local tags and the registry.",
        ),
        l(
          "Takılırsan `docker images` yaz: aynı IMAGE ID aynı image demek. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "If you're stuck, type `docker images`: the same IMAGE ID means the same image. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Registry image'ları saklar ve paylaşır; Docker Hub varsayılandır, GHCR, GitLab ve ECR özel seçeneklerdir.", "A registry stores and shares images; Docker Hub is the default, GHCR, GitLab and ECR are private options."),
    l("Image adı bir adres: `registry/sahip/repo:tag`. Tag sadece bir isimdir; `docker tag` kopya oluşturmaz.", "An image name is an address: `registry/owner/repo:tag`. A tag is only a name; `docker tag` makes no copy."),
    l("Push, adın başındaki registry'ye gider; zaten orada olan layer'lar tekrar yüklenmez.", "A push goes to the registry in the name; layers already there are not uploaded again."),
    l("`latest` kayabilir: sunucuya ve compose dosyasına hep belirli bir sürüm yaz.", "`latest` can move: give servers and compose files a specific version."),
    l("Tam değişmezlik için digest (`@sha256:...`) kullan.", "For full immutability, use a digest (`@sha256:...`)."),
    l("`rmi` önce ismi kaldırır; image son adıyla birlikte silinir.", "`rmi` removes a name first; the image goes with its last name."),
  ],
  quiz: [
    {
      question: l("`docker push shop:1.0` neden GHCR'ye gitmez?", "Why does `docker push shop:1.0` not go to GHCR?"),
      options: [
        l("Giriş yapılmadığı için", "Because you did not log in"),
        l("Adda registry yok; Docker Hub varsayılır", "The name has no registry, so Docker Hub is assumed"),
        l("Tag çok kısa", "The tag is too short"),
        l("GHCR push'u desteklemez", "GHCR does not support pushes"),
      ],
      answer: 1,
      explain: l("Push, adın başındaki registry'ye gider. GHCR için önce `ghcr.io/sahip/shop:1.0` olarak tag'lemen gerekir.", "A push goes to the registry in the name. For GHCR, tag it as `ghcr.io/owner/shop:1.0` first."),
      reviewStep: 2,
    },
    {
      question: l("`docker tag app:1 app:prod` sonrası diskte kaç image vardır?", "After `docker tag app:1 app:prod`, how many images are on disk?"),
      options: [l("1, iki isimle", "1, with two names"), l("2", "2"), l("0", "0"), l("Image'ın boyutuna bağlı", "It depends on the image size")],
      answer: 0,
      explain: l("Tag sadece bir isim ekler; ikisi de aynı IMAGE ID'yi gösterir.", "A tag only adds a name; both point at the same IMAGE ID."),
      reviewStep: 1,
    },
    {
      question: l("Production'da hangi image referansı en güvenli?", "Which image reference is safest in production?"),
      options: [l("`shop:latest`", "`shop:latest`"), l("`shop`", "`shop`"), l("`shop:1.4.2`", "`shop:1.4.2`"), l("`shop@sha256:<digest>`", "`shop@sha256:<digest>`")],
      answer: 3,
      explain: l("Sürüm tag'i iyidir, ama tag'ler yeniden push'lanabilir. Digest içeriğe bağlıdır, değişemez.", "A version tag is good, but tags can be pushed again. A digest is tied to content and cannot change."),
      reviewStep: 5,
    },
    {
      question: l("Bir image'ın `shop:dev` ve `shop:1.0` adları var. `docker rmi shop:1.0` ne yapar?", "An image is named `shop:dev` and `shop:1.0`. What does `docker rmi shop:1.0` do?"),
      options: [
        l("Image'ı siler", "Deletes the image"),
        l("Sadece `shop:1.0` adını kaldırır", "Removes only the `shop:1.0` name"),
        l("Registry'deki kopyayı da siler", "Also deletes the registry copy"),
        l("Hata verir", "Fails"),
      ],
      answer: 1,
      explain: l("Image başka bir adla durduğu sürece `rmi` sadece etiketi kaldırır; registry'ye hiç dokunmaz.", "While the image has another name, `rmi` only untags it, and it never touches the registry."),
      reviewStep: 6,
    },
  ],
};
