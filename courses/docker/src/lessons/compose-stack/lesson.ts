import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const YAML_EAGER = `services:
  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  cache:
    image: redis:7

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://postgres:\${DB_PASSWORD}@db:5432/postgres
      REDIS_URL: redis://cache:6379
    depends_on:
      - db
      - cache

volumes:
  pgdata:`;

const YAML_HEALTHY = `services:
  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5

  cache:
    image: redis:7
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://postgres:\${DB_PASSWORD}@db:5432/postgres
      REDIS_URL: redis://cache:6379
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:`;

export const composeStack: Lesson = {
  slug: "compose-stack",
  title: l("Çok servisli uygulama", "A multi-service app"),
  summary: l(
    "Bir uygulama, Postgres ve Redis'i birlikte ayağa kaldır. Veritabanı hazır olmadan başlayan uygulamanın neden çöktüğünü ve healthcheck ile `service_healthy`'nin bunu nasıl çözdüğünü gör.",
    "Bring up an app with Postgres and Redis together. See why an app that starts before the database is ready crashes, and how healthchecks with `service_healthy` fix it.",
  ),
  minutes: 14,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Kısa `depends_on`'un hazır olmayı beklemediğini görmek", "See that short `depends_on` does not wait for readiness"), step: 1 },
    { text: l("Healthcheck ve `condition: service_healthy` yazmak", "Write a healthcheck and `condition: service_healthy`"), step: 3 },
    { text: l("Verinin `down` ile korunduğunu, `down -v` ile silindiğini görmek", "See `down` keep data and `down -v` wipe it"), step: 5 },
    { text: l("`restart` ile kendini toparlayan bir servis kurmak", "Set up a service that recovers with `restart`"), step: 6 },
  ],
  steps: [
    {
      short: l("Yığın", "The stack"),
      tag: "how",
      title: l("app + Postgres + Redis", "app + Postgres + Redis"),
      body: [
        l(
          "Gerçek bir proje çoğu zaman tek container değildir: kendi uygulaman (`app`), bir veritabanı (`db`, Postgres) ve bir önbellek (`cache`, Redis). Uygulama açılır açılmaz ikisine de bağlanıyor.",
          "A real project is rarely one container: your own app (`app`), a database (`db`, Postgres) and a cache (`cache`, Redis). The app connects to both the moment it starts.",
        ),
        l(
          "Hepsini tek `compose.yaml`'da topladık. Sadece `app` dışarıya port açıyor (3000); `db` ve `cache` proje ağının içinde, adlarıyla erişiliyor.",
          "We put them all in one `compose.yaml`. Only `app` publishes a port (3000); `db` and `cache` stay inside the project network, reached by name.",
        ),
      ],
      practice: {
        snippets: [{ label: "compose.yaml", code: YAML_EAGER, note: l("İlk hali: kısa `depends_on`. Bir sonraki adımda neden yetmediğini göreceğiz.", "First version: short `depends_on`. The next step shows why it is not enough.") }],
        commands: [],
      },
    },
    {
      short: l("Erken başlama", "Too early"),
      tag: "problem",
      predict: {
        question: l(
          "`depends_on` yüzünden `db` ve `cache` önce başlıyor, `app` hemen ardından. Postgres'in açılması birkaç saniye sürüyor. `app` ne olur?",
          "Thanks to `depends_on`, `db` and `cache` start first and `app` right after. Postgres takes a few seconds to open. What happens to `app`?",
        ),
        options: [
          l("Sorunsuz çalışır", "It runs fine"),
          l("db hâlâ açılırken bağlanmaya çalışır ve exit code 1 ile kapanır", "It connects while db is still opening and exits with code 1"),
          l("Compose db hazır olana kadar app'i bekletir", "Compose holds app back until db is ready"),
        ],
        answer: 1,
        why: l(
          "Kısa `depends_on` sadece başlatma sırasını belirler. db'nin container'ı başladı ama içindeki Postgres henüz bağlantı kabul etmiyor.",
          "Short `depends_on` only sets the start order. db's container has started, but Postgres inside is not accepting connections yet.",
        ),
      },
      title: l("Başladı ≠ hazır", "Started is not ready"),
      body: [
        l(
          "`app` kırmızı: logunda `ECONNREFUSED db:5432 (still starting)`. Container sırası doğruydu, ama veritabanı içeride hâlâ açılıyordu.",
          "`app` is red: its log says `ECONNREFUSED db:5432 (still starting)`. The container order was right, but the database inside was still opening.",
        ),
        l(
          "`db` ve `cache`'in ışığı sarı: \"starting\". Bir container'ın başlaması ile içindeki servisin hazır olması farklı şeyler.",
          "`db` and `cache` have yellow lights: \"starting\". A container starting and the service inside being ready are two different things.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker compose up -d" },
          { cmd: "docker compose logs app", note: l("Bağlantı hatasını burada görürsün.", "The connection error shows up here.") },
          { cmd: "docker compose ps", note: l("`app` için `Exited (1)`.", "`Exited (1)` for `app`.") },
        ],
      },
    },
    {
      short: l("Biraz bekle", "Wait a bit"),
      tag: "how",
      title: l("Biraz sonra tekrar denersen", "Try again a moment later"),
      body: [
        l(
          "Biraz zaman geçti: önce `cache`, sonra `db` sağlıklı oldu (yeşil ışık). Aynı `docker compose up -d`'yi tekrar çalıştırdık; Compose kapanmış `app`'i yeniden yarattı ve bu sefer bağlandı.",
          "Some time passed: first `cache`, then `db` turned healthy (green light). We ran the same `docker compose up -d` again; Compose recreated the exited `app`, and this time it connected.",
        ),
        l(
          "Çalıştı, ama elle tekrar denemek bir çözüm değil. Bilgisayar yeniden başladığında ya da CI'da her seferinde şans eseri doğru zamanda başlamasını bekleyemezsin.",
          "It worked, but trying again by hand is no fix. After a reboot, or in CI, you cannot count on hitting the right moment every time.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker compose up -d", note: l("Kapanmış servisleri yeniden yaratır, çalışanlara dokunmaz.", "Recreates exited services and leaves running ones alone.") }],
      },
    },
    {
      short: l("service_healthy", "service_healthy"),
      tag: "how",
      predict: {
        question: l(
          "`db` ve `cache`'e healthcheck ekledik, `app`'e de `condition: service_healthy`. `down` ve `up` sonrası Compose ne yapar?",
          "We gave `db` and `cache` healthchecks, and `app` gets `condition: service_healthy`. What does Compose do after `down` and `up`?",
        ),
        options: [
          l("app'i yine hemen başlatır", "It starts app right away again"),
          l("db ve cache sağlıklı olana kadar bekler, sonra app'i başlatır", "It waits until db and cache are healthy, then starts app"),
          l("db hazır değilse hata verip durur", "It errors and stops if db is not ready"),
        ],
        answer: 1,
        why: l(
          "Healthcheck, servisin gerçekten hazır olup olmadığını düzenli sorar. `service_healthy` Compose'a o cevabı beklemesini söyler.",
          "A healthcheck keeps asking whether the service is really ready. `service_healthy` tells Compose to wait for that answer.",
        ),
      },
      title: l("Healthcheck ile bekle", "Wait with a healthcheck"),
      body: [
        l(
          "Healthcheck, Docker'ın container'ın içinde düzenli çalıştırdığı küçük bir komut: Postgres için `pg_isready`, Redis için `redis-cli ping`. Komut başarılı olunca container \"healthy\" olur.",
          "A healthcheck is a small command Docker runs inside the container regularly: `pg_isready` for Postgres, `redis-cli ping` for Redis. When it succeeds, the container is \"healthy\".",
        ),
        l(
          "Olaylarda `app, db sağlıklı olana kadar bekliyor` yazıyor. Compose önce bekledi, sonra `app`'i bir kez başlattı ve `app` ilk seferde çalıştı.",
          "The events say `app waits until db is healthy`. Compose waited first, then started `app` once, and it ran on the first try.",
        ),
      ],
      callouts: [
        {
          kind: "reality",
          text: l(
            "Resmi `postgres` ve `redis` image'larında hazır bir healthcheck yok; onu compose dosyasında `healthcheck:` ile sen yazarsın. Bu sahnede healthcheck birkaç adımda geçiyor; gerçekte `interval` ve `retries` ayarlarına göre saniyeler sürer.",
            "The official `postgres` and `redis` images ship no healthcheck; you write it in the compose file under `healthcheck:`. Here it passes within a few steps; in reality it takes seconds, depending on `interval` and `retries`.",
          ),
        },
      ],
      practice: {
        snippets: [{ label: "compose.yaml", code: YAML_HEALTHY }],
        commands: [
          { cmd: "docker compose up -d --wait", note: l("Bütün servisler sağlıklı olana kadar komut bekler; CI'da işe yarar.", "The command waits until every service is healthy; handy in CI.") },
          { cmd: "docker compose ps", note: l("Durumda `(healthy)` yazar.", "Status shows `(healthy)`.") },
        ],
      },
    },
    {
      short: l("Veri kalır", "Data stays"),
      tag: "experiment",
      predict: {
        question: l("Veritabanına bir sipariş yazdık. `down` ve tekrar `up` sonrası sipariş nerede?", "We wrote an order to the database. Where is it after `down` and `up` again?"),
        options: [l("Gitti, container'lar silindi", "Gone, the containers were removed"), l("Hâlâ orada, `pgdata` volume'unda", "Still there, in the `pgdata` volume"), l("Redis'e taşındı", "Moved to Redis")],
        answer: 1,
        why: l("Veritabanı dosyaları `pgdata` named volume'una yazılıyor; `down` volume'lara dokunmaz.", "The database files are written to the `pgdata` named volume, and `down` does not touch volumes."),
      },
      title: l("down sonrası veri", "Data after down"),
      body: [
        l(
          "`db`'ye bir sipariş yazdık, `down` ile her şeyi kapattık, sonra tekrar `up`. Yeni `db` container'ının logunda `existing data found` var; sipariş dosyası yerinde.",
          "We wrote an order to `db`, took everything `down`, then `up` again. The new `db` container's log says `existing data found`, and the order file is there.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "docker compose exec db psql -U postgres -c 'select count(*) from orders'", note: l("Gerçek bir tabloda veriyi sayarak kontrol edersin.", "With a real table you would check by counting rows.") },
          { cmd: "docker compose down && docker compose up -d" },
        ],
      },
    },
    {
      short: l("down -v", "down -v"),
      tag: "experiment",
      predict: {
        question: l("Bu sefer `down -v` ve tekrar `up`. Sipariş?", "This time `down -v` and `up` again. The order?"),
        options: [l("Hâlâ orada", "Still there"), l("Gitti: volume silindi, veritabanı sıfırdan kuruldu", "Gone: the volume was removed and the database started fresh"), l("Yarısı kaldı", "Half of it remains")],
        answer: 1,
        why: l("`-v` named volume'ları da siler. Yeni `db` boş bir volume bulur ve yeni bir veritabanı kurar.", "`-v` removes named volumes too. The new `db` finds an empty volume and creates a new database."),
      },
      title: l("down -v her şeyi siler", "down -v wipes everything"),
      body: [
        l(
          "`down -v` volume'u da sildi. Yeni `db`'nin logunda `initialized a new, empty database` yazıyor; sipariş yok.",
          "`down -v` removed the volume too. The new `db`'s log says `initialized a new, empty database`; the order is gone.",
        ),
        l(
          "Geliştirirken temiz bir başlangıç için çok işe yarar; production'da yanlışlıkla çalıştırmak ise veriyi kaybettirir.",
          "Great for a clean start while developing; run by mistake in production, it loses the data.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker compose down -v", note: l("Container'lar, ağ ve volume'lar: hepsi gider.", "Containers, network and volumes: all gone.") }],
      },
    },
    {
      short: l("restart", "restart"),
      tag: "how",
      title: l("Yedek emniyet: restart", "A safety net: restart"),
      body: [
        l(
          "Kısa `depends_on`'a dönüp `app`'e `restart: on-failure` ekledik. `app` yine erken başlayıp çöktü, ama Docker onu kendiliğinden yeniden başlattı. İki denemeden sonra db hazırdı ve `app` çalıştı (sayaçta 2 yeniden başlama).",
          "We went back to the short `depends_on` and gave `app` `restart: on-failure`. `app` again started too early and crashed, but Docker restarted it by itself. After two tries db was ready and `app` ran (2 restarts on the counter).",
        ),
        l(
          "En sağlamı ikisini birlikte kullanmak: `service_healthy` ile düzgün başlangıç, `restart: unless-stopped` ile sonradan kopan bağlantılara karşı. Uygulama kodunun da bağlantıyı birkaç kez denemesi iyi bir alışkanlık.",
          "The sturdiest setup uses both: `service_healthy` for a clean start, `restart: unless-stopped` for connections that drop later. Having your app code retry the connection a few times is a good habit too.",
        ),
      ],
      practice: {
        commands: [{ cmd: "docker compose ps", note: l("Yeniden başlayan servis kısa süre `Restarting` görünür.", "A restarting service briefly shows `Restarting`.") }],
      },
    },
    {
      short: l("Gerçekte", "In reality"),
      tag: "reality",
      title: l("Kendi projen için", "For your own project"),
      body: [
        l(
          "`curl localhost:3000` cevap verdi. Dışarıya sadece `app` açık; `db` ve `cache` portsuz, sadece proje ağından erişilebilir. Şifre `compose.yaml`'da değil, `.env`'de.",
          "`curl localhost:3000` answered. Only `app` is open to the outside; `db` and `cache` have no ports and are reachable only from the project network. The password lives in `.env`, not in `compose.yaml`.",
        ),
        l(
          "Kendi projende bu iskeleti kopyala, `app` için kendi Dockerfile'ını yaz ve `docker compose up -d --build` ile başlat. Geliştirme sırasında veritabanına bir araçla bağlanman gerekirse `db`'ye geçici olarak `ports: [\"5432:5432\"]` ekleyebilirsin.",
          "In your own project, copy this skeleton, write your own Dockerfile for `app` and start it with `docker compose up -d --build`. If you need to connect to the database with a tool while developing, add `ports: [\"5432:5432\"]` to `db` for a while.",
        ),
      ],
      practice: {
        snippets: [{ label: ".env", code: "DB_PASSWORD=s3cret" }],
        commands: [
          { cmd: "docker compose up -d --build" },
          { cmd: "curl localhost:3000" },
          { cmd: "docker compose logs -f app" },
        ],
      },
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          "Sıra sende. Klasörde `app`, `db` (Postgres) ve `cache` (Redis) olan bir proje var. Aşağıda gerçek işten **5 senaryo** var: komutları terminale **kendin yaz**, `compose.yaml`'ı `nano` ile düzenle; sahne her komutta ne olduğunu gösterir.",
          "Your turn. The folder holds a project with `app`, `db` (Postgres) and `cache` (Redis). Below are **5 scenarios** from real work: **type the commands yourself** and edit `compose.yaml` with `nano`; the scene shows what each command does.",
        ),
        l(
          "Takılırsan `docker compose ps` (durum ve `(healthy)`) ve `docker compose logs app` yaz. `sleep 3` birkaç saniye geçirir. İpuçları adım adım açılır; az komutla bitirirsen 3 yıldız alırsın.",
          "If you're stuck, type `docker compose ps` (status and `(healthy)`) and `docker compose logs app`. `sleep 3` lets a few seconds pass. Hints open one at a time; finish in few commands for 3 stars.",
        ),
      ],
    },
  ],
  recap: [
    l("Bir container'ın başlaması, içindeki servisin hazır olması demek değildir.", "A container starting does not mean the service inside is ready."),
    l("Kısa `depends_on` sadece sırayı belirler; erken bağlanan uygulama çöker.", "Short `depends_on` only sets the order; an app that connects too early crashes."),
    l("Healthcheck (`pg_isready`, `redis-cli ping`) ve `condition: service_healthy` ile Compose hazır olmayı bekler.", "With a healthcheck (`pg_isready`, `redis-cli ping`) and `condition: service_healthy`, Compose waits for readiness."),
    l("Named volume'daki veri `down`'dan sağ çıkar; `down -v` onu siler.", "Data in a named volume survives `down`; `down -v` removes it."),
    l("`restart` sonradan kopmalara karşı emniyet ağıdır; uygulamanın kendi yeniden denemesiyle birlikte en sağlamı.", "`restart` is a safety net for later drops; together with retries in your app it is the sturdiest."),
    l("Sadece dışarıdan erişilecek servis port açar; şifreler `.env`'de durur.", "Only the service the outside needs publishes a port; passwords live in `.env`."),
  ],
  quiz: [
    {
      question: l("`app`, `depends_on: [db]` ile tanımlı ama ilk `up`'ta `ECONNREFUSED db:5432` ile kapanıyor. En doğru çözüm?", "`app` has `depends_on: [db]` but exits with `ECONNREFUSED db:5432` on the first `up`. The best fix?"),
      options: [
        l("`db`'nin portunu yayınlamak", "Publish `db`'s port"),
        l("`db`'ye healthcheck ekleyip `app`'te `condition: service_healthy` kullanmak", "Add a healthcheck to `db` and use `condition: service_healthy` in `app`"),
        l("`depends_on`'u kaldırmak", "Remove `depends_on`"),
        l("`app`'i `db`'den önce başlatmak", "Start `app` before `db`"),
      ],
      answer: 1,
      explain: l("Sorun sıra değil hazır olma. Healthcheck + `service_healthy` Compose'un beklemesini sağlar.", "The problem is readiness, not order. A healthcheck plus `service_healthy` makes Compose wait."),
      reviewStep: 3,
    },
    {
      question: l("Postgres için bir healthcheck'in `test` satırı hangisi olabilir?", "Which could be the `test` line of a Postgres healthcheck?"),
      options: [
        l('`["CMD-SHELL", "pg_isready -U postgres"]`', '`["CMD-SHELL", "pg_isready -U postgres"]`'),
        l('`["CMD", "curl", "localhost:3000"]`', '`["CMD", "curl", "localhost:3000"]`'),
        l('`["CMD", "docker", "ps"]`', '`["CMD", "docker", "ps"]`'),
        l("`healthy: true`", "`healthy: true`"),
      ],
      answer: 0,
      explain: l("`pg_isready` Postgres'in bağlantı kabul edip etmediğini söyler; container'ın içinde çalışır.", "`pg_isready` tells whether Postgres accepts connections; it runs inside the container."),
      reviewStep: 3,
    },
    {
      question: l("Hangi komut veritabanının verisini **korur**?", "Which command **keeps** the database's data?"),
      options: [l("`docker compose down -v`", "`docker compose down -v`"), l("`docker compose down`", "`docker compose down`"), l("`docker volume rm shop_pgdata`", "`docker volume rm shop_pgdata`"), l("`docker system prune -a --volumes`", "`docker system prune -a --volumes`")],
      answer: 1,
      explain: l("Düz `down` named volume'lara dokunmaz. Diğerlerinin hepsi volume'u siler.", "Plain `down` leaves named volumes alone. All the others remove the volume."),
      reviewStep: 4,
    },
    {
      question: l("Yığında hangi servisin port yayınlaması gerekir?", "Which service in the stack needs to publish a port?"),
      options: [l("Hepsinin", "All of them"), l("Sadece `app`'in", "Only `app`"), l("Sadece `db`'nin", "Only `db`"), l("Hiçbirinin", "None")],
      answer: 1,
      explain: l("`app` dışarıdan erişiliyor. `db` ve `cache`'e `app` proje ağının içinden, adlarıyla ulaşır.", "`app` is reached from outside. `app` reaches `db` and `cache` from inside the project network, by name."),
      reviewStep: 7,
    },
  ],
};
