import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

export const imagesAndContainers: Lesson = {
  slug: "images-and-containers",
  title: l("Image ve container", "Images and containers"),
  summary: l(
    "Image salt okunur bir paket, container ondan başlatılan çalışan bir kopya. pull, images, tag, rmi ve küçük bir build ile ikisinin ilişkisini gör.",
    "An image is a read-only package; a container is a running copy started from it. See how they relate with pull, images, tag, rmi and a tiny build.",
  ),
  minutes: 13,
  level: l("Başlangıç", "Beginner"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Image'ın salt okunur bir paket olduğunu bilmek", "Know that an image is a read-only package"), step: 0 },
    { text: l("Container'ın image'ın üstünde kendi katmanıyla çalıştığını görmek", "See a container run on top of an image with its own layer"), step: 3 },
    { text: l("Kullanılan bir image'ın neden silinemediğini anlamak", "Understand why an image in use cannot be removed"), step: 5 },
    { text: l("Tag'lerin aynı image'a verilen isimler olduğunu görmek", "See that tags are just names for an image"), step: 6 },
  ],
  steps: [
    {
      short: l("Image", "Image"),
      tag: "how",
      title: l("Image: salt okunur bir paket", "An image: a read-only package"),
      body: [
        l(
          "`docker pull nginx:1.27` Docker Hub'dan nginx'in [[image]]'ını indirdi. Solda rafta duruyor: katman katman bir yığın ve yanında boyutu.",
          "`docker pull nginx:1.27` downloaded nginx's [[image]] from Docker Hub. It sits on the shelf on the left: a stack of layers, with its size.",
        ),
        l(
          "Image çalışmaz, sadece durur. İçinde nginx programı, ihtiyaç duyduğu kütüphaneler ve küçük bir Linux dosya sistemi var. Bir şey çalıştırmak için ondan bir container başlatmak gerekir.",
          "An image does not run; it just sits there. Inside are the nginx program, the libraries it needs and a small Linux filesystem. To run anything, you start a container from it.",
        ),
      ],
      callouts: [
        {
          kind: "analogy",
          text: l(
            "Image bir sınıf, container ondan yaratılan nesne gibi: bir tanım ve ondan istediğin kadar örnek.",
            "An image is like a class and a container like an object created from it: one definition, as many instances as you want.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker pull nginx:1.27", note: l("Image'ı indirir, container başlatmaz.", "Downloads the image; starts no container.") },
          { cmd: "docker images", note: l("Bu makinedeki image'lar: repository, tag, id, boyut.", "Images on this machine: repository, tag, id, size.") },
        ],
      },
    },
    {
      short: l("Ad ve tag", "Name and tag"),
      tag: "how",
      title: l("İsim:tag", "Name:tag"),
      body: [
        l(
          "Bir image'ın adı iki parçadan oluşur: `nginx:1.27`'de `nginx` repository, `1.27` tag. Tag genelde sürümü söyler. `alpine:3.20` de indirdik: rafta artık iki image var.",
          "An image name has two parts: in `nginx:1.27`, `nginx` is the repository and `1.27` the tag. The tag usually tells the version. We also pulled `alpine:3.20`: there are two images on the shelf now.",
        ),
        l(
          "Tag yazmazsan Docker `latest` varsayar: `docker pull nginx` aslında `nginx:latest`'tir. `latest` \"en yeni\" demek değil, sadece bir isim; neden riskli olduğunu registry dersinde göreceğiz.",
          "Leave out the tag and Docker assumes `latest`: `docker pull nginx` really means `nginx:latest`. `latest` does not mean \"newest\"; it is just a name, and the registry lesson shows why it is risky.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker pull alpine:3.20" },
          { cmd: "docker image ls --format '{{.Repository}}:{{.Tag}}  {{.Size}}'", note: l("Sadece isimleri ve boyutları göster.", "Show only names and sizes.") },
        ],
      },
    },
    {
      short: l("Container", "Container"),
      tag: "how",
      predict: {
        question: l("`nginx:1.27` image'ından bir container başlatacağız. Image'a ne olur?", "We will start a container from the `nginx:1.27` image. What happens to the image?"),
        options: [
          l("Container'a dönüşür ve raftan gider", "It turns into the container and leaves the shelf"),
          l("Rafta durur; container onun üstünde çalışır", "It stays on the shelf; the container runs on top of it"),
          l("İkinci bir kopyası indirilir", "A second copy is downloaded"),
        ],
        answer: 1,
        why: l(
          "Image değişmez ve yerinde kalır. Container, image'ın üstüne kendi ince yazılabilir katmanını ekleyerek çalışır.",
          "The image does not change and stays put. The container runs by adding its own thin writable layer on top of the image.",
        ),
      },
      title: l("Container: image'ın çalışan kopyası", "A container: a running copy of the image"),
      body: [
        l(
          "`docker run -d --name web1 -p 8080:80 nginx:1.27` bir [[container]] başlattı. Image rafta duruyor, ortada yeşil ışıklı bir container var.",
          "`docker run -d --name web1 -p 8080:80 nginx:1.27` started a [[container]]. The image is still on the shelf, and a container with a green light stands in the middle.",
        ),
        l(
          "Container'ın kendi adı, kendi id'si, kendi durumu (çalışıyor, kapandı) var. Image'ın bunların hiçbiri yok: o sadece bir şablon.",
          "The container has its own name, its own id and its own state (running, exited). The image has none of these: it is just a template.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker run -d --name web1 -p 8080:80 nginx:1.27" },
          { cmd: "docker ps", note: l("Container'lar. `docker images` ise image'ları listeler; ikisi ayrı şeyler.", "Containers. `docker images` lists images; they are different things.") },
        ],
      },
    },
    {
      short: l("Kendi katmanı", "Own layer"),
      tag: "experiment",
      predict: {
        question: l(
          "İkinci bir container (`web2`) açacağız ve `web1`'in içinde ana sayfayı değiştireceğiz. `web2` ve image bu değişikliği görür mü?",
          "We will open a second container (`web2`) and change the home page inside `web1`. Do `web2` and the image see the change?",
        ),
        options: [
          l("İkisi de görür, image güncellendi", "Both do: the image was updated"),
          l("Hiçbiri görmez; değişiklik sadece web1'de", "Neither does; the change is only in web1"),
          l("web2 görür, image görmez", "web2 does, the image does not"),
        ],
        answer: 1,
        why: l(
          "Değişiklik web1'in kendi yazılabilir katmanına gitti. Image salt okunur kaldı ve web2 image'ın temiz halini görüyor.",
          "The change went into web1's own writable layer. The image stayed read-only, and web2 sees the image's clean state.",
        ),
      },
      title: l("Her container'ın kendi yazılabilir katmanı", "Each container's own writable layer"),
      body: [
        l(
          "`curl localhost:8080` (web1) \"web1 değişti\" dedi; `curl localhost:8081` (web2) varsayılan cevabı verdi. Aynı image, iki farklı sonuç.",
          "`curl localhost:8080` (web1) answered \"web1 değişti\"; `curl localhost:8081` (web2) gave the default answer. Same image, two different results.",
        ),
        l(
          "Container bir dosyayı değiştirdiğinde dosya image'da değişmez: container'ın üstündeki ince katmana kopyalanıp orada değişir. Buna \"copy-on-write\" denir.",
          "When a container changes a file, the file does not change in the image: it is copied into the container's thin top layer and changed there. This is called \"copy-on-write\".",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker exec web1 sh -c 'echo web1 değişti > /usr/share/nginx/html/index.html'" },
          { cmd: "docker diff web1", note: l("Container'ın image'a göre değiştirdiği dosyalar (A ekli, C değişti, D silindi).", "Files the container changed compared with its image (A added, C changed, D deleted).") },
        ],
      },
    },
    {
      short: l("Katmanlar", "Layers"),
      tag: "how",
      title: l("Salt okunur katmanlar + bir yazılabilir katman", "Read-only layers plus one writable layer"),
      body: [
        l(
          "Bir container'ın gördüğü dosya sistemi üst üste konmuş katmanlardır: altta image'ın salt okunur [[layer|layer]]'ları, en üstte container'a ait tek bir yazılabilir katman.",
          "The filesystem a container sees is a stack: at the bottom the image's read-only [[layer|layers]], on top a single writable layer that belongs to the container.",
        ),
        l(
          "Yüz container aynı image'dan çalışsa bile image'ın katmanları diskte **bir kez** durur. Her container sadece kendi değişikliklerini taşır; bu yüzden container'lar hızlı başlar ve az yer kaplar.",
          "Even if a hundred containers run from one image, its layers sit on disk **once**. Each container carries only its own changes, which is why containers start fast and take little space.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker ps -s", note: l("SIZE sütunu: container'ın kendi katmanının boyutu (virtual: image dahil).", "The SIZE column: the container's own layer (virtual: including the image).") },
          { cmd: "docker image history nginx:1.27", note: l("Image'ı oluşturan katmanlar.", "The layers that make up the image.") },
        ],
      },
    },
    {
      short: l("rmi", "rmi"),
      tag: "experiment",
      predict: {
        question: l("web1 ve web2 hâlâ `nginx:1.27`'den çalışıyor. `docker rmi nginx:1.27` dersek ne olur?", "web1 and web2 still run from `nginx:1.27`. What happens with `docker rmi nginx:1.27`?"),
        options: [
          l("Image silinir, container'lar da gider", "The image is removed, and the containers go too"),
          l("Docker reddeder: image kullanımda", "Docker refuses: the image is in use"),
          l("Image silinir, container'lar çalışmaya devam eder", "The image is removed and the containers keep running"),
        ],
        answer: 1,
        why: l(
          "Container'lar image'ın katmanlarının üstünde çalışıyor. Onlar durdukça Docker image'ı silmez; önce container'ları kaldırman gerekir.",
          "The containers run on top of the image's layers. While they exist Docker will not remove the image; remove the containers first.",
        ),
      },
      title: l("Kullanılan image silinmez", "An image in use cannot be removed"),
      body: [
        l(
          "Docker reddetti: `conflict: unable to remove repository reference ... container ... is using its referenced image`. Image rafta duruyor.",
          "Docker refused: `conflict: unable to remove repository reference ... container ... is using its referenced image`. The image is still on the shelf.",
        ),
        l(
          "Sıra her zaman: önce container'ları kaldır (`docker rm`), sonra image'ı (`docker rmi`). Kapanmış container'lar da sayılır, `docker ps -a` ile bulursun.",
          "The order is always: remove the containers (`docker rm`), then the image (`docker rmi`). Exited containers count too; find them with `docker ps -a`.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker rmi nginx:1.27", note: l("Kullanımdaysa reddedilir.", "Refused while in use.") },
          { cmd: "docker rm -f web1 web2", note: l("Önce container'lar.", "Containers first.") },
          { cmd: "docker rmi nginx:1.27", note: l("Şimdi silinir.", "Now it goes.") },
        ],
      },
    },
    {
      short: l("tag", "tag"),
      tag: "how",
      title: l("Bir image, birden fazla isim", "One image, several names"),
      body: [
        l(
          "`docker tag nginx:1.27 mysite:base` yeni bir image oluşturmadı: aynı image'a ikinci bir isim verdi. `docker images`'ta iki satır görünür, ama ikisinin IMAGE ID'si aynıdır.",
          "`docker tag nginx:1.27 mysite:base` did not create a new image: it gave the same image a second name. `docker images` shows two lines, but both have the same IMAGE ID.",
        ),
        l(
          "Sonra `docker rmi mysite:base` sadece o ismi kaldırdı (\"Untagged\"); image öbür adıyla yerinde. Image'ın kendisi ancak son ismi de gidince ve kullanan container kalmayınca silinir.",
          "Then `docker rmi mysite:base` only removed that name (\"Untagged\"); the image stays under its other name. The image itself goes only when its last name is gone and no container uses it.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker tag nginx:1.27 mysite:base" },
          { cmd: "docker images", note: l("İki isim, aynı IMAGE ID.", "Two names, the same IMAGE ID.") },
          { cmd: "docker rmi mysite:base", note: l("Untagged: sadece isim gider.", "Untagged: only the name goes.") },
        ],
      },
    },
    {
      short: l("Kendi image'ın", "Your own image"),
      tag: "how",
      title: l("Kendi image'ını yap", "Make your own image"),
      body: [
        l(
          "İki satırlık bir [[dockerfile|Dockerfile]] ile kendi image'ımızı yaptık: `FROM nginx:1.27` ve `COPY index.html`. `docker build` nginx'in katmanlarının üstüne bir katman daha ekledi: rafta `mysite:1.0`, 2 layer.",
          "With a two-line [[dockerfile|Dockerfile]] we made our own image: `FROM nginx:1.27` and `COPY index.html`. `docker build` added one more layer on top of nginx's: `mysite:1.0` on the shelf, 2 layers.",
        ),
        l(
          "Ondan bir container başlattık ve `curl localhost:8082` \"Benim sitem\" dedi. Bu image'ı artık herhangi bir makinede aynı şekilde çalıştırabilirsin. Dockerfile bölümü bunu ayrıntısıyla anlatıyor.",
          "We started a container from it and `curl localhost:8082` said \"Benim sitem\". You can now run this image the same way on any machine. The Dockerfile chapter covers this in detail.",
        ),
      ],
      practice: {
        intro: l("Boş bir klasörde `index.html` ve şu `Dockerfile` ile:", "In an empty folder with an `index.html` and this `Dockerfile`:"),
        commands: [
          { cmd: "docker build -t mysite:1.0 .", note: l("Sondaki nokta: build context, yani bu klasör.", "The final dot is the build context: this folder.") },
          { cmd: "docker run -d --name site -p 8082:80 mysite:1.0" },
        ],
        snippets: [{ label: "Dockerfile", code: "FROM nginx:1.27\nCOPY index.html /usr/share/nginx/html/" }],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Katmanlar image'lar arasında paylaşılır", "Layers are shared between images"),
      body: [
        l(
          "`mysite:1.0` nginx'in katmanlarını kopyalamadı, onları kullanıyor. Aynı base image'ı kullanan on image'ın ortak katmanları diskte bir kez durur ve bir kez indirilir; `docker pull` sırasında \"Already exists\" satırlarını bu yüzden görürsün.",
          "`mysite:1.0` did not copy nginx's layers; it reuses them. Ten images built on the same base share those layers on disk and download them once, which is why `docker pull` prints \"Already exists\" lines.",
        ),
        l(
          "Image'lar içeriklerinden hesaplanan bir özetle (digest, `sha256:...`) tanınır. Tag'ler değişebilir ama digest değişmez: tam olarak aynı image'ı istiyorsan `nginx@sha256:...` ile çekebilirsin.",
          "Images are identified by a digest computed from their content (`sha256:...`). Tags can move but a digest cannot: to get exactly the same image, pull `nginx@sha256:...`.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnedeki id'ler içerikten hesaplanan kısa özetler, gerçek sha256 digest'leri değil; boyutlar da yuvarlanmış yaklaşık MB'lar.",
            "The ids on this stage are short content hashes, not real sha256 digests, and the sizes are rounded, approximate MB.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker image inspect nginx:1.27 --format '{{.RepoDigests}}'", note: l("Image'ın digest'i.", "The image's digest.") },
          { cmd: "docker system df", note: l("Image, container ve volume'ların toplam disk kullanımı.", "Total disk used by images, containers and volumes.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Aşağıda gerçek işten **5 senaryo** var: image indirmek, container'ın kendi katmanı, kullanımdaki bir image'ı silmek, yeni bir isim ve kendi image'ını yapmak. Komutları terminale **kendin yaz**; sahne her komutta ne olduğunu gösterir.",
          "Your turn. Below are **5 scenarios** from real work: pulling images, a container's own layer, removing an image in use, a new name and building your own image. **Type the commands yourself** in the terminal; the scene shows what each one does.",
        ),
        l(
          "`docker images` image'ları, `docker ps -a` container'ları gösterir; ikisi ayrı şeyler. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "`docker images` lists images and `docker ps -a` lists containers; they are different things. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Image salt okunur bir pakettir: program, kütüphaneler ve dosya sistemi. Kendisi çalışmaz.", "An image is a read-only package: program, libraries and filesystem. It does not run by itself."),
    l("Container bir image'dan başlatılan çalışan kopyadır; kendi adı, id'si ve durumu vardır.", "A container is a running copy started from an image, with its own name, id and state."),
    l("Her container image'ın üstüne kendi yazılabilir katmanını ekler; değişiklikleri image'ı ve komşularını etkilemez.", "Each container adds its own writable layer on top of the image; its changes affect neither the image nor its neighbours."),
    l("Bir container kullandığı sürece image silinemez: önce `docker rm`, sonra `docker rmi`.", "An image cannot be removed while a container uses it: `docker rm` first, then `docker rmi`."),
    l("Tag'ler aynı image'a verilen isimlerdir; tag yazılmazsa `latest` varsayılır.", "Tags are names for an image; with no tag, `latest` is assumed."),
    l("Katmanlar image'lar arasında paylaşılır ve bir kez indirilir.", "Layers are shared between images and downloaded once."),
  ],
  quiz: [
    {
      question: l("`docker pull redis:7` çalıştırdın. Ne oldu?", "You ran `docker pull redis:7`. What happened?"),
      options: [
        l("Redis başladı ve 6379'da dinliyor", "Redis started and listens on 6379"),
        l("Image indirildi; hiçbir container çalışmıyor", "The image was downloaded; no container is running"),
        l("Bir container oluşturuldu ama başlatılmadı", "A container was created but not started"),
        l("Hiçbir şey, önce build gerekir", "Nothing, a build is needed first"),
      ],
      answer: 1,
      explain: l("`pull` sadece image'ı indirir. Çalıştırmak için `docker run` gerekir.", "`pull` only downloads the image. Running it takes `docker run`."),
      reviewStep: 0,
    },
    {
      question: l("Aynı image'dan iki container var. Birinin içinde bir dosyayı sildin. Image'a ne olur?", "Two containers run from one image. You delete a file inside one. What happens to the image?"),
      options: [l("Dosya image'dan da silinir", "The file is deleted from the image too"), l("Image değişmez", "The image does not change"), l("Image bozulur", "The image breaks"), l("Diğer container da etkilenir", "The other container is affected")],
      answer: 1,
      explain: l("Silme işlemi container'ın kendi katmanına kaydedilir; image salt okunurdur.", "The deletion is recorded in the container's own layer; the image is read-only."),
      reviewStep: 3,
    },
    {
      question: l("`docker rmi myapp:1.0` \"image is being used by a stopped container\" hatası verdi. Ne yaparsın?", "`docker rmi myapp:1.0` says \"image is being used by a stopped container\". What do you do?"),
      options: [
        l("Image'ı yeniden çekerim", "Pull the image again"),
        l("`docker ps -a` ile container'ı bulup `docker rm` ile silerim, sonra rmi", "Find the container with `docker ps -a`, `docker rm` it, then rmi"),
        l("Docker'ı yeniden kurarım", "Reinstall Docker"),
        l("Kapanmış container'lar sayılmaz, tekrar denerim", "Stopped containers do not count; just retry"),
      ],
      answer: 1,
      explain: l("Kapanmış container'lar da image'ı kullanır. Önce onları kaldır.", "Stopped containers use the image too. Remove them first."),
      reviewStep: 5,
    },
    {
      question: l("`docker tag app:1.0 app:stable` ne yapar?", "What does `docker tag app:1.0 app:stable` do?"),
      options: [
        l("app:1.0'ın kopyasını oluşturur, iki kat yer kaplar", "Copies app:1.0, using twice the space"),
        l("Aynı image'a ikinci bir isim verir", "Gives the same image a second name"),
        l("app:1.0'ı yeniden adlandırır, eski isim gider", "Renames app:1.0; the old name goes"),
        l("Image'ı registry'ye gönderir", "Pushes the image to a registry"),
      ],
      answer: 1,
      explain: l("Tag sadece bir isimdir; iki tag aynı IMAGE ID'yi gösterir.", "A tag is just a name; both tags point at the same IMAGE ID."),
      reviewStep: 6,
    },
  ],
};
