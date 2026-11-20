import { l } from "@lets-explain/core/i18n";
import { projectSetup, runLine } from "../../engine/cli";
import { containerFiles, createHost, findContainer, type DockerAction, type Host } from "../../engine/docker";
import type { DockerCtx, DockerScenario } from "../shared/DockerScene";
import { eventsOf, hostAfter } from "../shared/missionHelpers";

/** The shop's files, as they are in ~/project. The compose file names the project `shop`. */
export const DOCKERFILE = `FROM node:22-slim
WORKDIR /app
COPY server.js .
CMD ["node", "server.js"]`;

export const SERVER_JS = `const app = require("express")();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
app.get("/", (req, res) => res.send("shop api"));
app.listen(3000);`;

export const COMPOSE = `name: shop

services:
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
  pgdata:
`;

/** The same project, but the database keeps its data inside the container. */
export const COMPOSE_NO_VOLUME = `name: shop

services:
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
`;

export const DOTENV = `DATABASE_URL=postgres://app:s3cret@db:5432/shop
DB_PASSWORD=s3cret`;

const FILES = { Dockerfile: DOCKERFILE, "server.js": SERVER_JS, "compose.yaml": COMPOSE, ".env": DOTENV };

/** A fresh laptop with the shop project checked out; nothing has run yet. */
export const CHECKOUT: Host = hostAfter(projectSetup(FILES), createHost());

/** Runs typed lines to build a start state, the same way a reader would have typed them. */
export function typed(h: Host, lines: string[]): Host {
  let state = h;
  for (const line of lines) state = hostAfter(runLine(state, line).actions, state);
  return state;
}

const running = (h: Host, name: string) => findContainer(h, name)?.state === "running";
const allUp = (h: Host) => ["shop-web-1", "shop-api-1", "shop-db-1"].every((n) => running(h, n));
const DATA = "/var/lib/postgresql/data";

/** Did a curl to :8080 answer during the run? */
const webAnswered = (ctx: DockerCtx) => eventsOf(ctx, "curlResult").some((e) => e.port === 8080 && e.ok);

export const scenarios: DockerScenario[] = [
  {
    id: "first-day",
    title: l("İlk gün", "First day"),
    story: l(
      "Ekibe bugün katıldın ve shop projesini klonladın. README tek satır: \"Her şey `compose.yaml`'da, tek komutla ayağa kalkar.\" Sitenin açıldığını gör, sonra işe başla.",
      "You joined the team today and cloned the shop project. The README is one line: \"Everything is in `compose.yaml`; one command brings it up.\" See the site open, then get to work.",
    ),
    goal: l("`web`, `api` ve `db` arka planda çalışsın; `localhost:8080` cevap versin.", "`web`, `api` and `db` run in the background, and `localhost:8080` answers."),
    start: CHECKOUT,
    hints: [
      l("`cat compose.yaml` ile dosyaya bak: üç servis var. Hepsini tek tek `docker run` ile başlatmana gerek yok.", "Look at the file with `cat compose.yaml`: three services. You don't need a `docker run` for each."),
      l("`docker compose up` dosyadaki her şeyi başlatır; `-d` terminali serbest bırakır. Sonra `curl localhost:8080`.", "`docker compose up` starts everything in the file; `-d` leaves your terminal free. Then `curl localhost:8080`."),
      l("`docker compose up -d` sonra `curl localhost:8080`", "`docker compose up -d` then `curl localhost:8080`"),
    ],
    par: 1,
    check: (ctx) => allUp(ctx.state) && webAnswered(ctx),
  },
  {
    id: "missing-env",
    title: l("Eksik .env", "Missing .env"),
    story: l(
      "Projeyi klonladın ve `docker compose up -d` dedin, ama `api` hemen kapandı. `.env` dosyası git'e girmiyor, sende yok. Ekipten öğrendiğin adres: `postgres://app:s3cret@db:5432/shop`.",
      "You cloned the project and ran `docker compose up -d`, but `api` stopped right away. The `.env` file isn't in git, so you don't have it. The address the team gave you: `postgres://app:s3cret@db:5432/shop`.",
    ),
    goal: l("`api` `DATABASE_URL` ayarıyla **çalışır** halde olsun.", "`api` is **running** with its `DATABASE_URL` set."),
    start: typed(hostAfter([{ type: "removeHost", path: "/home/ada/project/.env" } as DockerAction], CHECKOUT), ["docker compose up -d"]),
    hints: [
      l("`docker compose logs api` neden kapandığını söyler. `compose.yaml` değeri `${DATABASE_URL}` diye bir değişkenden bekliyor.", "`docker compose logs api` tells you why it stopped. `compose.yaml` takes the value from a variable, `${DATABASE_URL}`."),
      l("Compose değişkenleri projedeki `.env` dosyasından okur. Dosyayı yaz, sonra `up -d` kapanmış servisi yeniden yaratır.", "Compose reads variables from the project's `.env` file. Write it, then `up -d` recreates the stopped service."),
      l(
        "`echo DATABASE_URL=postgres://app:s3cret@db:5432/shop > .env` sonra `docker compose up -d`",
        "`echo DATABASE_URL=postgres://app:s3cret@db:5432/shop > .env` then `docker compose up -d`",
      ),
    ],
    par: 2,
    check: (ctx) => {
      const api = findContainer(ctx.state, "shop-api-1");
      return api?.state === "running" && Boolean(api.env.DATABASE_URL);
    },
  },
  {
    id: "end-of-day",
    title: l("Gün sonu", "End of the day"),
    story: l(
      "Bütün gün yerel veritabanına test siparişleri girdin. Şimdi bilgisayarı kapatacaksın: proje kapansın, ama yarın sabah aynı siparişler orada olsun.",
      "You spent the day entering test orders into the local database. Now you're shutting down: the project should stop, but tomorrow morning the same orders must be there.",
    ),
    goal: l("Projenin hiçbir container'ı çalışmasın; `db`'nin verisi volume'da **kalsın**.", "None of the project's containers is running; `db`'s data **stays** in its volume."),
    start: hostAfter([{ type: "write", container: "shop-db-1", path: `${DATA}/orders.dat`, content: "42 orders" }], typed(CHECKOUT, ["docker compose up -d"])),
    hints: [
      l("Veri `pgdata` adlı bir named volume'da duruyor; container'lar silinse de volume kalabilir.", "The data lives in a named volume, `pgdata`; it can outlive the containers."),
      l("`docker compose down` container'ları ve ağı kaldırır, volume'lara dokunmaz. `-v` eklersen veriyi de siler.", "`docker compose down` removes the containers and the network but leaves volumes alone. Adding `-v` deletes the data too."),
      l("`docker compose down`", "`docker compose down`"),
    ],
    par: 1,
    check: (ctx) =>
      !Object.values(ctx.state.containers).some((c) => c.project === "shop" && c.state === "running") && ctx.state.volumes.shop_pgdata?.files["orders.dat"] === "42 orders",
  },
  {
    id: "data-vanishes",
    title: l("Veri kayboluyor", "The data vanishes"),
    story: l(
      "Takım arkadaşın şikayetçi: her `docker compose down`'dan sonra veritabanı bomboş açılıyor. `compose.yaml`'a bakınca sebebi görüyorsun: `db`'nin verisi bir volume'da değil, container'ın içinde.",
      "A teammate complains: after every `docker compose down` the database comes back empty. Looking at `compose.yaml` you see why: `db` keeps its data inside the container, not in a volume.",
    ),
    goal: l(
      "`db` verisini `pgdata` adlı bir **named volume**'da (`/var/lib/postgresql/data`) tutarak çalışsın.",
      "`db` runs with its data in a **named volume** called `pgdata` (at `/var/lib/postgresql/data`).",
    ),
    start: typed(hostAfter(projectSetup({ "compose.yaml": COMPOSE_NO_VOLUME }), CHECKOUT), ["docker compose up -d"]),
    hints: [
      l("Bir servise volume, servisin altında `volumes:` listesiyle bağlanır; named volume ayrıca en altta `volumes:` altında tanımlanır.", "A service gets a volume through a `volumes:` list under it; a named volume is also declared under a top-level `volumes:`."),
      l(
        "`nano compose.yaml`: `db`'ye `volumes:` altında `- pgdata:/var/lib/postgresql/data` ekle, dosyanın sonuna `volumes:` ve altına `pgdata:` yaz. Sonra `docker compose up -d`: değişen servisi yeniden yaratır.",
        "`nano compose.yaml`: under `db` add `volumes:` with `- pgdata:/var/lib/postgresql/data`, and at the end add `volumes:` with `pgdata:` under it. Then `docker compose up -d` recreates the changed service.",
      ),
      l(
        "`nano compose.yaml` (`db`'ye `volumes: [\"pgdata:/var/lib/postgresql/data\"]`, en alta `volumes:` / `  pgdata:`) sonra `docker compose up -d`",
        "`nano compose.yaml` (give `db` `volumes: [\"pgdata:/var/lib/postgresql/data\"]` and add `volumes:` / `  pgdata:` at the end) then `docker compose up -d`",
      ),
    ],
    par: 2,
    check: (ctx) => {
      const db = findContainer(ctx.state, "shop-db-1");
      return Boolean(db && db.state === "running" && db.mounts.some((m) => m.type === "volume" && m.source === "shop_pgdata" && m.target === DATA));
    },
  },
  {
    id: "find-db",
    title: l("db nerede?", "Where is db?"),
    story: l(
      "Proje çalışıyor. Yeni gelen bir arkadaş soruyor: \"Kod veritabanına `localhost` yerine `db` diye bağlanıyor; bu ad nereden çözülüyor?\" Göstermek için `web` container'ının içinden `db`'ye ulaş.",
      "The project is running. A newcomer asks: \"The code connects to the database as `db`, not `localhost`; where does that name resolve?\" Show it by reaching `db` from inside the `web` container.",
    ),
    goal: l("`web` servisinin **içinden** `ping db` başarıyla çalışsın.", "`ping db` succeeds from **inside** the `web` service."),
    start: typed(CHECKOUT, ["docker compose up -d"]),
    hints: [
      l("Compose, projenin servislerini ortak bir ağa koyar; o ağda her servis kendi adıyla bulunur.", "Compose puts the project's services on one network; on it each service is found by its name."),
      l("Çalışan bir servisin içinde komut çalıştırmak: `docker compose exec <servis> <komut>`.", "To run a command inside a running service: `docker compose exec <service> <command>`."),
      l("`docker compose exec web ping db`", "`docker compose exec web ping db`"),
    ],
    par: 1,
    check: (ctx) => eventsOf(ctx, "execOutput").some((e) => e.name === "shop-web-1" && /ping db/.test(e.cmd) && e.code === 0),
  },
];

/** The data file a test writes into db, to see it survive. */
export const dbFiles = (h: Host) => {
  const db = findContainer(h, "shop-db-1");
  return db ? containerFiles(h, db) : {};
};
