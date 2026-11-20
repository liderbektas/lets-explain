import { l } from "@lets-explain/core/i18n";
import { projectSetup, runLine } from "../../engine/cli";
import { containerFiles, createHost, findContainer, type DockerAction, type Host } from "../../engine/docker";
import type { DockerCtx, DockerScenario } from "../shared/DockerScene";
import { eventsOf, hostAfter } from "../shared/missionHelpers";

/** The app: it connects to Postgres and Redis as soon as it starts. */
export const SERVER_JS = `const app = require("express")();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const db = pg.connect("db:5432");
const cache = redis.connect("cache:6379");
app.get("/", (req, res) => res.send("shop is up"));
app.listen(3000);`;

export const DOCKERFILE = `FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm ci
COPY . .
CMD ["node", "server.js"]`;

const DB = `  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data`;

const DB_HEALTHY = `${DB}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5`;

const CACHE_HEALTHY = `  cache:
    image: redis:7
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5`;

const APP = `  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://postgres:\${DB_PASSWORD}@db:5432/postgres
      REDIS_URL: redis://cache:6379`;

/** Short depends_on: start order only, as in the lesson's first version. */
export const COMPOSE_EAGER = `name: shop

services:
${DB}

  cache:
    image: redis:7

${APP}
    depends_on:
      - db
      - cache

volumes:
  pgdata:
`;

/** Healthchecks, and the app waits for both to be healthy. */
export const COMPOSE_PATIENT = `name: shop

services:
${DB_HEALTHY}

${CACHE_HEALTHY}

${APP}
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy

volumes:
  pgdata:
`;

/** What CI starts before the tests run on the runner: only the database and the cache. */
export const COMPOSE_CI = `name: shop

services:
${DB_HEALTHY}
    ports:
      - "5432:5432"

${CACHE_HEALTHY}
    ports:
      - "6379:6379"

volumes:
  pgdata:
`;

const FILES = { Dockerfile: DOCKERFILE, "package.json": '{"name":"shop","scripts":{"start":"node server.js"}}', "server.js": SERVER_JS, ".env": "DB_PASSWORD=s3cret" };

/** Runs typed lines to build a start state, the same way a reader would have typed them. */
export function typed(h: Host, lines: string[]): Host {
  let state = h;
  for (const line of lines) state = hostAfter(runLine(state, line).actions, state);
  return state;
}

/** The project checked out with a given compose file; nothing running. */
export const checkout = (compose: string): Host => hostAfter(projectSetup({ ...FILES, "compose.yaml": compose }), createHost());

export const EAGER = checkout(COMPOSE_EAGER);
export const PATIENT = checkout(COMPOSE_PATIENT);

const ORDERS = "/var/lib/postgresql/data/orders.dat";
const writeOrders: DockerAction = { type: "write", container: "shop-db-1", path: ORDERS, content: "3 orders" };

/** The patient project, up and healthy, with three test orders in the database. */
const WITH_ORDERS = hostAfter([writeOrders], typed(PATIENT, ["docker compose up -d"]));

const app = (h: Host) => findContainer(h, "shop-app-1");
const appRunning = (h: Host) => app(h)?.state === "running";

/** Index of the last `compose up` in the run, or -1. */
const lastUp = (ctx: DockerCtx) => ctx.actions.map((a) => a.type).lastIndexOf("composeUp");

/** The app crashed (exit 1) at or after action `from`. */
const appCrashedSince = (ctx: DockerCtx, from: number) =>
  ctx.events.slice(Math.max(0, from)).flat().some((e) => e.type === "exited" && e.name === "shop-app-1" && e.code === 1);

export const scenarios: DockerScenario[] = [
  {
    id: "too-early",
    title: l("Fazla erken", "Too early"),
    story: l(
      "Her sabah `docker compose up -d` deyince `app` `ECONNREFUSED db:5432` diye kapanıyor, birkaç saniye sonra bir daha `up` deyince düzeliyor. `depends_on` `db`'yi önce başlatıyor ama **hazır olmasını** beklemiyor.",
      "Every morning `docker compose up -d` makes `app` stop with `ECONNREFUSED db:5432`, and another `up` a few seconds later fixes it. `depends_on` starts `db` first but doesn't wait until it is **ready**.",
    ),
    goal: l(
      "`compose.yaml`'ı düzelt: `app` `db` ve `cache` **sağlıklı** olunca başlasın ve tek bir `up` ile, hiç çökmeden çalışsın.",
      "Fix `compose.yaml`: `app` starts once `db` and `cache` are **healthy**, and a single `up` gets it running without a crash.",
    ),
    start: EAGER,
    hints: [
      l("Compose bir servisin hazır olduğunu ancak bir `healthcheck` ile bilir; `depends_on` da bunu beklemeyi uzun haliyle söyler.", "Compose only knows a service is ready through a `healthcheck`; the long form of `depends_on` says to wait for it."),
      l(
        "`db`'ye `healthcheck:` (`test: [\"CMD-SHELL\", \"pg_isready -U postgres\"]`), `cache`'e `healthcheck:` (`test: [\"CMD\", \"redis-cli\", \"ping\"]`) ekle; `app`'in `depends_on`'unu `db: condition: service_healthy` biçimine çevir.",
        "Give `db` a `healthcheck:` (`test: [\"CMD-SHELL\", \"pg_isready -U postgres\"]`) and `cache` one (`test: [\"CMD\", \"redis-cli\", \"ping\"]`); turn `app`'s `depends_on` into `db: condition: service_healthy`.",
      ),
      l("`nano compose.yaml` (iki healthcheck ve `condition: service_healthy`) sonra `docker compose up -d`", "`nano compose.yaml` (two healthchecks and `condition: service_healthy`) then `docker compose up -d`"),
    ],
    par: 2,
    check: (ctx) => {
      const up = lastUp(ctx);
      if (up < 0 || !appRunning(ctx.state)) return false;
      const a = ctx.actions[up]!;
      if (a.type !== "composeUp") return false;
      const d = a.file.services.app?.depends_on;
      const waits = Boolean(d && !Array.isArray(d) && d.db?.condition === "service_healthy" && d.cache?.condition === "service_healthy");
      return waits && !appCrashedSince(ctx, up);
    },
  },
  {
    id: "ci-wait",
    title: l("CI beklesin", "Make CI wait"),
    story: l(
      "CI'da testler runner'da çalışıyor; Compose sadece `db` ve `cache`'i açıyor. Testler `up -d`'den hemen sonra başlıyor ve veritabanı hazır olmadan bağlanmaya çalışıp düşüyor. Biri araya `sleep 10` koymayı önerdi.",
      "In CI the tests run on the runner; Compose only starts `db` and `cache`. The tests start right after `up -d` and fail because the database isn't ready yet. Someone suggested putting a `sleep 10` in between.",
    ),
    goal: l(
      "Projeyi öyle başlat ki komut **ancak** `db` ve `cache` sağlıklı olunca dönsün (tahmini bir `sleep` olmadan).",
      "Start the project so the command returns **only** once `db` and `cache` are healthy (no guessed `sleep`).",
    ),
    start: checkout(COMPOSE_CI),
    hints: [
      l("Healthcheck'ler zaten dosyada. Eksik olan, `up`'ın onları beklemesi.", "The healthchecks are already in the file. What's missing is `up` waiting for them."),
      l("`docker compose up`'ın, servisler sağlıklı olana kadar dönmemesini sağlayan bir bayrağı var.", "`docker compose up` has a flag that keeps it from returning until the services are healthy."),
      l("`docker compose up -d --wait`", "`docker compose up -d --wait`"),
    ],
    par: 1,
    check: (ctx) => {
      const up = lastUp(ctx);
      const a = ctx.actions[up];
      const healthy = (n: string) => findContainer(ctx.state, n)?.health === "healthy";
      return Boolean(a && a.type === "composeUp" && a.wait && healthy("shop-db-1") && healthy("shop-cache-1"));
    },
  },
  {
    id: "recreate-keep",
    title: l("Yeniden kur, veri kalsın", "Rebuild, keep the data"),
    story: l(
      "Bir şeyler tuhaf davranıyor ve bütün container'ları sıfırdan yaratmak istiyorsun. Arkadaşın \"`down -v` yap, temiz olsun\" dedi, ama veritabanında yarın da lazım olacak test siparişlerin var.",
      "Something is acting up and you want every container created from scratch. A teammate said \"just `down -v`, nice and clean\", but the database holds test orders you need tomorrow.",
    ),
    goal: l("Bütün servisler **yeni** container'larla çalışsın; `db`'deki siparişler **kalsın**.", "Every service runs in a **new** container; the orders in `db` **stay**."),
    start: WITH_ORDERS,
    hints: [
      l("Siparişler `pgdata` named volume'unda; container'ları silmek volume'u silmez. Hangi `down` volume'ları da siler?", "The orders live in the `pgdata` named volume; removing containers doesn't remove it. Which `down` removes volumes too?"),
      l("`docker compose down` container'ları ve ağı kaldırır, volume kalır; sonra `up -d` hepsini yeniden yaratır.", "`docker compose down` removes the containers and the network, keeping volumes; then `up -d` creates everything again."),
      l("`docker compose down` sonra `docker compose up -d`", "`docker compose down` then `docker compose up -d`"),
    ],
    par: 2,
    check: (ctx) => {
      const names = ["shop-db-1", "shop-cache-1", "shop-app-1"];
      const fresh = names.every((n) => {
        const now = findContainer(ctx.state, n);
        const then = findContainer(ctx.start, n);
        return now?.state === "running" && then && now.id !== then.id;
      });
      const db = findContainer(ctx.state, "shop-db-1");
      return fresh && Boolean(db && containerFiles(ctx.state, db)[ORDERS]);
    },
  },
  {
    id: "clean-slate",
    title: l("Sıfırdan veritabanı", "A clean database"),
    story: l(
      "Yerel veritabanın yarım kalmış migration'larla ve bozuk test verisiyle doldu. Bu sefer gerçekten sıfırdan başlamak istiyorsun: boş bir veritabanıyla.",
      "Your local database is full of half-run migrations and broken test data. This time you really want to start over: with an empty database.",
    ),
    goal: l("Proje çalışsın ve `db` **boş, yeni** bir veritabanıyla açılsın (eski siparişler gitsin).", "The project runs and `db` opens a **new, empty** database (the old orders are gone)."),
    start: WITH_ORDERS,
    hints: [
      l("Container'ları yeniden yaratmak yetmez: veri volume'da duruyor.", "Recreating containers isn't enough: the data lives in the volume."),
      l("`docker compose down -v` named volume'ları da siler. Sonra `up -d`.", "`docker compose down -v` removes named volumes too. Then `up -d`."),
      l("`docker compose down -v` sonra `docker compose up -d`", "`docker compose down -v` then `docker compose up -d`"),
    ],
    par: 2,
    check: (ctx) => {
      const db = findContainer(ctx.state, "shop-db-1");
      return Boolean(db && db.state === "running" && appRunning(ctx.state) && !containerFiles(ctx.state, db)[ORDERS]) && eventsOf(ctx, "log").some((e) => e.name === "shop-db-1" && e.line.includes("new, empty"));
    },
  },
  {
    id: "retry",
    title: l("Kendini toparla", "Pick yourself up"),
    story: l(
      "Healthcheck yerine ekip başka bir yol seçti: `app` bağlanamazsa çöksün ama Compose onu **yeniden başlatsın**. Şu an `app` ilk denemede çöküp öyle kalıyor.",
      "Instead of healthchecks the team chose another way: if `app` can't connect it may crash, but Compose **restarts** it. Right now `app` crashes on the first try and stays down.",
    ),
    goal: l("`app` çökünce yeniden başlatılacak şekilde ayarlansın ve sonunda **çalışır** halde olsun.", "`app` is set to be restarted when it crashes, and ends up **running**."),
    start: typed(EAGER, ["docker compose up -d"]),
    hints: [
      l("Bir container çökünce ne olacağını restart policy söyler; Compose'ta servisin altında `restart:` ile verilir.", "A restart policy says what happens when a container crashes; in Compose it's `restart:` under the service."),
      l("`app`'e `restart: on-failure` ekle, `up -d` ile uygula; veritabanı hazır olana kadar birkaç saniye geçsin (`sleep 3`).", "Add `restart: on-failure` to `app`, apply it with `up -d`, and let a few seconds pass until the database is ready (`sleep 3`)."),
      l("`nano compose.yaml` (`app`'e `restart: on-failure`) sonra `docker compose up -d` sonra `sleep 3`", "`nano compose.yaml` (`restart: on-failure` under `app`) then `docker compose up -d` then `sleep 3`"),
    ],
    par: 3,
    check: (ctx) => {
      const a = app(ctx.state);
      return Boolean(a && a.state === "running" && a.restart !== "no");
    },
  },
];
