import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const YAML_WEB = `services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"`;

const YAML_API = `services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"

  api:
    build: .            # Dockerfile bu klasörde / Dockerfile in this folder
    environment:
      DATABASE_URL: \${DATABASE_URL}`;

const YAML_FULL = `services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"
    depends_on:
      - api

  api:
    build: .
    environment:
      DATABASE_URL: \${DATABASE_URL}
    depends_on:
      - db

  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:`;

const DOTENV = `DATABASE_URL=postgres://app:s3cret@db:5432/shop
DB_PASSWORD=s3cret`;

export const composeBasics: Lesson = {
  slug: "compose-basics",
  title: l("Compose temelleri", "Compose basics"),
  summary: l(
    "Uzun `docker run` komutları yerine tek bir `compose.yaml`: servisler, ortam değişkenleri ve `.env`, volume'lar, proje ağı ve `up`/`down`/`logs`/`build`.",
    "One `compose.yaml` instead of long `docker run` commands: services, environment and `.env`, volumes, the project network, and `up`/`down`/`logs`/`build`.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Bir `compose.yaml` dosyasının yapısını okumak", "Read the structure of a `compose.yaml`"), step: 1 },
    { text: l("`.env` ile `${DEĞİŞKEN}` değerlerini doldurmak", "Fill `${VARIABLE}` values from `.env`"), step: 3 },
    { text: l("Servislerin birbirine adıyla eriştiğini görmek", "See services reach each other by name"), step: 5 },
    { text: l("`down`'ın container'ları silip volume'ları koruduğunu görmek", "See `down` remove containers and keep volumes"), step: 6 },
  ],
  steps: [
    {
      short: l("Neden Compose?", "Why Compose?"),
      tag: "problem",
      title: l("Üç container, üç uzun komut", "Three containers, three long commands"),
      body: [
        l(
          "Bir web sunucusu, bir API ve bir veritabanı. Her biri için `docker run` yazarsan portlar, ayarlar, volume'lar ve ağ bir sürü bayrağa dağılır. Bir kişi bir bayrağı unutur, proje başka bilgisayarda çalışmaz.",
          "A web server, an API and a database. Writing `docker run` for each spreads ports, settings, volumes and the network over a pile of flags. Someone forgets one, and the project does not run on another machine.",
        ),
        l(
          "[[compose|Docker Compose]] bütün bunları tek bir dosyada, `compose.yaml`'da tanımlar. Dosya projeyle birlikte Git'e girer; herkes aynı komutla aynı ortamı kurar.",
          "[[compose|Docker Compose]] describes all of that in one file, `compose.yaml`. The file goes into Git with the project, and everyone builds the same setup with one command.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker compose version", note: l("Compose, Docker'a eklenti olarak gelir: `docker compose` (boşlukla).", "Compose ships as a Docker plugin: `docker compose`, with a space.") }],
        snippets: [{ label: "compose.yaml", code: YAML_WEB, note: l("En küçük compose dosyası: tek servis, tek port.", "The smallest compose file: one service, one port.") }],
      },
    },
    {
      short: l("İlk up", "First up"),
      tag: "how",
      predict: {
        question: l(
          "Dosyada sadece `web` servisi var. `docker compose up -d` neler oluşturur?",
          "The file has just the `web` service. What does `docker compose up -d` create?",
        ),
        options: [
          l("Sadece bir container", "Just a container"),
          l("Bir container ve projeye özel bir ağ (`shop_default`)", "A container and a network for the project (`shop_default`)"),
          l("Container'ı ve image'ı yeniden build eder", "It builds the image and the container"),
        ],
        answer: 1,
        why: l(
          "Compose her proje için kendi ağını açar ve bütün servisleri ona bağlar. Container adı da `proje-servis-1` biçiminde olur.",
          "Compose opens a network for each project and attaches every service to it. Container names follow `project-service-1`.",
        ),
      },
      title: l("docker compose up", "docker compose up"),
      body: [
        l(
          "`docker compose up -d` dosyayı okudu ve `shop_default` adında bir ağ ile `shop-web-1` container'ını oluşturdu. `shop` proje adı: varsayılan olarak dosyanın bulunduğu klasörün adı.",
          "`docker compose up -d` read the file and created a network called `shop_default` and the container `shop-web-1`. `shop` is the project name: by default, the name of the folder the file is in.",
        ),
        l(
          "`ports: \"8080:80\"`, `docker run -p 8080:80` ile aynı şey. `curl localhost:8080` nginx sayfasını getirdi.",
          "`ports: \"8080:80\"` is the same as `docker run -p 8080:80`. `curl localhost:8080` returned the nginx page.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker compose up -d", note: l("Dosyadaki her şeyi arka planda başlatır.", "Starts everything in the file in the background.") },
          { cmd: "docker compose ps", note: l("Sadece bu projenin container'ları.", "Only this project's containers.") },
          { cmd: "docker network ls", note: l("`shop_default` ağını burada görürsün.", "You will see `shop_default` here.") },
        ],
      },
    },
    {
      short: l("${DEĞİŞKEN}", "${VARIABLE}"),
      tag: "experiment",
      predict: {
        question: l(
          "`api` servisinde `DATABASE_URL: ${DATABASE_URL}` yazıyor ama ortada `.env` dosyası yok. `up` yapınca ne olur?",
          "The `api` service says `DATABASE_URL: ${DATABASE_URL}`, but there is no `.env` file. What happens on `up`?",
        ),
        options: [
          l("Compose durur ve dosyayı çalıştırmaz", "Compose stops and refuses the file"),
          l("Değişken boş kalır; api ayarsız başlar ve exit code 1 ile kapanır", "The variable is left empty; api starts without it and exits with code 1"),
          l("Compose bir değer uydurur", "Compose makes up a value"),
        ],
        answer: 1,
        why: l(
          "Compose eksik değişken için sadece uyarır ve boş metin koyar. Ayarı gerçekten isteyen uygulamadır; onu bulamayınca kapanır.",
          "Compose only warns about a missing variable and uses an empty string. It is the app that really needs the setting, and it quits when it cannot find it.",
        ),
      },
      title: l("build ve environment", "build and environment"),
      body: [
        l(
          "Dosyaya ikinci bir servis ekledik: `api`. Hazır bir image yerine `build: .` diyor, yani Compose önce bu klasördeki Dockerfile'dan image'ı build etti (`shop-api`).",
          "We added a second service, `api`. Instead of a ready image it says `build: .`, so Compose first built the image from this folder's Dockerfile (`shop-api`).",
        ),
        l(
          "Ama `api` kırmızı: exit code 1. Logunda `DATABASE_URL is not set` yazıyor. `${DATABASE_URL}` doldurulacak bir yer tutucu; `.env` olmadığı için boş kaldı. `web` ise dokunulmadan çalışmaya devam etti.",
          "But `api` is red: exit code 1. Its log says `DATABASE_URL is not set`. `${DATABASE_URL}` is a placeholder to fill in; with no `.env` it stayed empty. `web` kept running untouched.",
        ),
      ],
      practice: {
        snippets: [{ label: "compose.yaml", code: YAML_API }],
        commands: [{ cmd: "docker compose logs api", note: l("Bir servisin çıktısı. `-f` ile canlı izlersin.", "A service's output. Add `-f` to follow it.") }],
      },
    },
    {
      short: l(".env", ".env"),
      tag: "how",
      title: l(".env dosyası değerleri doldurur", "The .env file fills in the values"),
      body: [
        l(
          "`compose.yaml`'ın yanına bir `.env` dosyası koyduk ve tekrar `up` yaptık. Compose `${DATABASE_URL}`'i oradaki değerle doldurdu; kapanmış `api`'yi yeniden yarattı ve bu sefer çalışıyor.",
          "We put a `.env` file next to `compose.yaml` and ran `up` again. Compose filled `${DATABASE_URL}` from it, recreated the exited `api`, and this time it runs.",
        ),
        l(
          "Bu ayrım önemli: `compose.yaml` Git'e girer, `.env` girmez (içinde şifreler var). Her geliştirici ve her sunucu kendi `.env`'ini tutar.",
          "This split matters: `compose.yaml` goes into Git, `.env` does not (it holds passwords). Each developer and each server keeps its own `.env`.",
        ),
      ],
      callouts: [
        {
          kind: "warning",
          text: l(
            "`.env`'i `.gitignore`'a ekle. Örnek bir `.env.example` dosyasını (şifresiz) commit'leyerek hangi değişkenlerin gerektiğini anlatabilirsin.",
            "Add `.env` to `.gitignore`. Commit a password-free `.env.example` instead, so others see which variables are needed.",
          ),
        },
      ],
      practice: {
        snippets: [{ label: ".env", code: DOTENV }],
        commands: [
          { cmd: "docker compose config", note: l("Değişkenler doldurulmuş son hali gösterir: .env çalışıyor mu, buradan anlarsın.", "Shows the file with variables filled in: the way to check your .env works.") },
          { cmd: "docker compose up -d" },
        ],
      },
    },
    {
      short: l("volumes, depends_on", "volumes, depends_on"),
      tag: "how",
      title: l("Veritabanı, volume ve başlama sırası", "A database, a volume and start order"),
      body: [
        l(
          "Üçüncü servis `db` geldi. `volumes: pgdata:/var/lib/postgresql/data` veritabanının dosyalarını `pgdata` adlı bir [[volume]]'a koyar; dosyanın altındaki `volumes: pgdata:` o volume'u tanımlar. Docker onu `shop_pgdata` adıyla yarattı.",
          "The third service, `db`, arrived. `volumes: pgdata:/var/lib/postgresql/data` stores the database files in a [[volume]] called `pgdata`; the top-level `volumes: pgdata:` declares it. Docker created it as `shop_pgdata`.",
        ),
        l(
          "`depends_on` başlama sırasını söyler: `api` `db`'ye, `web` `api`'ye bağlı. Olaylarda sırayı görüyorsun: db → api → web. Dikkat: `depends_on` sadece **sırayı** belirler, db'nin hazır olmasını beklemez. Bunu sonraki derste çözeceğiz.",
          "`depends_on` sets the start order: `api` depends on `db`, `web` on `api`. The events show the order: db → api → web. Careful: `depends_on` only sets the **order**; it does not wait for db to be ready. The next lesson fixes that.",
        ),
      ],
      practice: {
        snippets: [{ label: "compose.yaml", code: YAML_FULL }],
        commands: [{ cmd: "docker volume ls", note: l("`shop_pgdata`: proje adı + volume adı.", "`shop_pgdata`: project name + volume name.") }],
      },
    },
    {
      short: l("İsimle erişim", "By name"),
      tag: "how",
      predict: {
        question: l("`web` container'ının içinden `db` adıyla veritabanına ulaşılabilir mi?", "Can the `web` container reach the database by the name `db`?"),
        options: [
          l("Hayır, IP adresi gerekir", "No, it needs an IP address"),
          l("Evet: servis adı, proje ağında bir DNS adıdır", "Yes: the service name is a DNS name on the project network"),
          l("Sadece `db`'nin portu yayınlanırsa", "Only if `db` publishes its port"),
        ],
        answer: 1,
        why: l(
          "Compose bütün servisleri aynı ağa koyar ve her servisin adını o ağda çözülebilir yapar. Port yayınlamak sadece host'tan erişim için gerekir.",
          "Compose puts every service on one network and makes each service name resolvable there. Publishing a port is only for access from the host.",
        ),
      },
      title: l("Servis adı = adres", "The service name is the address"),
      body: [
        l(
          "`web`'in içinden `db` adı çözüldü. `DATABASE_URL`'de `@db:5432` yazmamızın sebebi bu: `db` bir bilgisayar adı gibi çalışıyor.",
          "From inside `web`, the name `db` resolved. That is why `DATABASE_URL` says `@db:5432`: `db` works like a hostname.",
        ),
        l(
          "`db`'nin portunu (`5432`) dışarıya yayınlamadık, gerek de yok: diğer servisler ağın içinden ulaşıyor. Veritabanını host'a açmamak daha güvenli.",
          "We never published `db`'s port (`5432`), and there is no need: the other services reach it from inside the network. Not opening the database to the host is safer.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Sahnede `ping db` ile denedik. Gerçek nginx image'ında `ping` yok; aynı şeyi `getent hosts db` ile görürsün.",
            "On stage we tried `ping db`. The real nginx image has no `ping`; `getent hosts db` shows the same thing.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker compose exec web getent hosts db", note: l("`db` adının hangi IP'ye çözüldüğünü gösterir.", "Shows the IP the name `db` resolves to.") },
          { cmd: "docker compose exec db psql -U postgres -c 'select 1'", note: l("Servisin içinde komut çalıştırmak: `exec <servis> <komut>`.", "Run a command inside a service: `exec <service> <command>`.") },
        ],
      },
    },
    {
      short: l("down", "down"),
      tag: "experiment",
      predict: {
        question: l("`docker compose down` sonrası `pgdata` volume'una ne olur?", "What happens to the `pgdata` volume after `docker compose down`?"),
        options: [l("Container'larla birlikte silinir", "It is removed with the containers"), l("Kalır", "It stays"), l("Bir container'a taşınır", "It moves into a container")],
        answer: 1,
        why: l("`down` container'ları ve proje ağını siler, named volume'lara dokunmaz. Silmek için `down -v` gerekir.", "`down` removes containers and the project network, not named volumes. That needs `down -v`."),
      },
      title: l("docker compose down", "docker compose down"),
      body: [
        l(
          "`down` üç container'ı durdurup sildi ve `shop_default` ağını kaldırdı. Sağdaki `shop_pgdata` volume'u ise yerinde: veritabanı dosyaları onun içinde.",
          "`down` stopped and removed the three containers and took away the `shop_default` network. The `shop_pgdata` volume on the right stays, and the database files are in it.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker compose down", note: l("Container'lar ve ağ gider, volume'lar kalır.", "Containers and network go, volumes stay.") },
          { cmd: "docker compose down -v", note: l("Volume'ları da siler: veritabanı sıfırlanır. Dikkatli kullan.", "Removes the volumes too: the database is wiped. Use with care.") },
        ],
      },
    },
    {
      short: l("Tekrar up", "Up again"),
      tag: "how",
      title: l("Container'lar yeni, veri eski", "New containers, old data"),
      body: [
        l(
          "Tekrar `up`. Container'ların hepsi sıfırdan yaratıldı, ama `db`'nin logunda `existing data found` yazıyor: aynı volume'a bağlandı ve eski veriyi buldu.",
          "`up` again. Every container was created from scratch, yet `db`'s log says `existing data found`: it attached to the same volume and found the old data.",
        ),
        l(
          "Compose'un rahatlığı bu: ortamı istediğin kadar kurup yıkarsın, önemli veri volume'da güvende kalır.",
          "That is the comfort of Compose: tear the setup down and bring it back as often as you like, and the data that matters stays safe in the volume.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker compose logs db", note: l("Veritabanının mevcut veriyi bulduğunu buradan görürsün.", "This is where you see the database find its data.") }],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Her gün kullanacağın komutlar", "The commands you use every day"),
      body: [
        l(
          "Kod değiştiğinde `docker compose up -d --build` image'ları yeniden build edip değişen servisleri yeniden yaratır. `docker compose build` sadece build eder. `docker compose logs -f` bütün servislerin çıktısını birlikte akıtır.",
          "When code changes, `docker compose up -d --build` rebuilds the images and recreates the services that changed. `docker compose build` only builds. `docker compose logs -f` streams every service's output together.",
        ),
        l(
          "Dosya adı `compose.yaml` (eski projelerde `docker-compose.yml`, o da çalışır). En üstte `version:` satırı artık gerekmez; görürsen silebilirsin.",
          "The file is named `compose.yaml` (older projects use `docker-compose.yml`, which still works). A top-level `version:` line is no longer needed; you can delete it.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Bu sahnede `up`, zaten çalışan bir servisi olduğu gibi bırakıyor. Gerçek Compose, servisin ayarı değiştiyse onu yeniden yaratır; değişmediyse dokunmaz.",
            "On this stage `up` leaves a running service as it is. Real Compose recreates a service whose settings changed, and leaves it alone otherwise.",
          ),
        },
      ],
      practice: {
        commands: [
          { cmd: "docker compose up -d --build", note: l("Kodu değiştirdikten sonra.", "After changing code.") },
          { cmd: "docker compose logs -f", note: l("Bütün servisler, canlı.", "Every service, live.") },
          { cmd: "docker compose ps", note: l("Durum ve portlar.", "Status and ports.") },
          { cmd: "docker compose down", note: l("İşin bitince.", "When you are done.") },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Klasörde shop projesi var: `compose.yaml` (`web`, `api`, `db`), bir `Dockerfile` ve `.env`. Aşağıda gerçek işten **5 senaryo** var: komutları terminale **kendin yaz**, dosyaları `nano` ile düzenle; sahne her komutta ne olduğunu gösterir.",
          "Your turn. The shop project is in the folder: `compose.yaml` (`web`, `api`, `db`), a `Dockerfile` and `.env`. Below are **5 scenarios** from real work: **type the commands yourself** and edit files with `nano`; the scene shows what each command does.",
        ),
        l(
          "Takılırsan `docker compose ps` ve `docker compose logs <servis>` yaz: neyin çalıştığını ve neden kapandığını gösterirler. `cat compose.yaml` dosyayı gösterir. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "If you're stuck, type `docker compose ps` and `docker compose logs <service>`: they show what runs and why something stopped. `cat compose.yaml` shows the file. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("`compose.yaml` bütün servisleri tek dosyada tanımlar; dosya Git'e girer ve herkes aynı ortamı kurar.", "`compose.yaml` describes every service in one file; it goes into Git and everyone gets the same setup."),
    l("`up` her proje için bir ağ (`proje_default`) açar; container'lar `proje-servis-1` adını alır.", "`up` opens a network per project (`project_default`); containers are named `project-service-1`."),
    l("`${DEĞİŞKEN}` değerleri `.env`'den gelir; eksik değişken boş kalır ve uygulamayı düşürebilir.", "`${VARIABLE}` values come from `.env`; a missing one is left empty and can bring the app down."),
    l("Servisler birbirine adıyla erişir; sadece host'tan erişilecek servisin portu yayınlanır.", "Services reach each other by name; only a service the host must reach publishes a port."),
    l("`depends_on` başlama sırasını belirler, hazır olmayı beklemez.", "`depends_on` sets start order; it does not wait for readiness."),
    l("`down` container'ları ve ağı siler, volume'ları korur; `down -v` volume'ları da siler.", "`down` removes containers and the network but keeps volumes; `down -v` removes volumes too."),
  ],
  quiz: [
    {
      question: l("`api` servisinin `db`'ye bağlanması için `DATABASE_URL`'de hangi adres yazmalı?", "What host should `DATABASE_URL` use for `api` to reach `db`?"),
      options: [l("`localhost`", "`localhost`"), l("`db`", "`db`"), l("Host makinenin IP'si", "The host machine's IP"), l("`shop_default`", "`shop_default`")],
      answer: 1,
      explain: l("Proje ağında servis adı DNS adıdır. `localhost` container'ın kendisidir.", "On the project network the service name is a DNS name. `localhost` is the container itself."),
      reviewStep: 5,
    },
    {
      question: l("Veritabanını sıfırlamak istiyorsun: verisi dahil her şey gitsin. Hangi komut?", "You want to reset the database, data included. Which command?"),
      options: [l("`docker compose stop`", "`docker compose stop`"), l("`docker compose down`", "`docker compose down`"), l("`docker compose down -v`", "`docker compose down -v`"), l("`docker compose restart`", "`docker compose restart`")],
      answer: 2,
      explain: l("Sadece `-v` named volume'ları da siler; `down` tek başına veriyi korur.", "Only `-v` removes named volumes; plain `down` keeps the data."),
      reviewStep: 6,
    },
    {
      question: l("`environment: API_KEY: ${API_KEY}` var ama `.env`'de `API_KEY` yok. Ne olur?", "There is `environment: API_KEY: ${API_KEY}` but `.env` has no `API_KEY`. What happens?"),
      options: [
        l("Compose çalışmayı reddeder", "Compose refuses to run"),
        l("Değer boş metin olur, Compose sadece uyarır", "The value becomes an empty string; Compose only warns"),
        l("Değer `API_KEY` yazısı olur", "The value becomes the text `API_KEY`"),
        l("Host'taki `API_KEY` her zaman kullanılır", "The host's `API_KEY` is always used"),
      ],
      answer: 1,
      explain: l("Eksik değişkenler boş kalır; `docker compose config` ile son hali kontrol edebilirsin.", "Missing variables stay empty; check the final file with `docker compose config`."),
      reviewStep: 2,
    },
    {
      question: l("`depends_on: [db]` yazan bir servis için Compose neyi garanti eder?", "What does Compose guarantee for a service with `depends_on: [db]`?"),
      options: [
        l("db hazır olana kadar bekler", "It waits until db is ready"),
        l("db'den sonra başlatılır", "It is started after db"),
        l("db çökerse onu da durdurur", "It stops when db crashes"),
        l("db ile aynı container'da çalışır", "It runs in the same container as db"),
      ],
      answer: 1,
      explain: l("Kısa `depends_on` sadece sırayı belirler. Hazır olmayı beklemek için healthcheck ve `condition: service_healthy` gerekir.", "Short `depends_on` only sets the order. Waiting for readiness needs a healthcheck and `condition: service_healthy`."),
      reviewStep: 4,
    },
  ],
};
