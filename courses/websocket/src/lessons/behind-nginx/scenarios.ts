import { l } from "@lets-explain/core/i18n";
import { createNet } from "../../engine/net";
import { newConns, type WsCtx, type WsScenario } from "../shared/NetScene";
import { NODE_CONF, PLAIN_CONF, SERVER, TYPO_CONF } from "./code";

export const FREE = createNet({ nginx: PLAIN_CONF });

/** A WebSocket the reader opened through nginx, at this path. */
const through = (ctx: WsCtx, path = "/ws") =>
  newConns(ctx).some((c) => c.client === "you" && c.via !== null && ctx.state.exchanges.find((e) => e.id === c.exchange)?.path === path);

export const scenarios: WsScenario[] = [
  {
    id: "pass-upgrade",
    title: l("426'yı geçir", "Get past the 426"),
    story: l(
      "Sohbet sunucusu (`:8081`) doğrudan bağlanınca çalışıyor ama nginx üzerinden (`ws://localhost/ws`) bağlanan herkes 426 alıyor. nginx'in ayarı `/etc/nginx/conf.d/chat.conf`'ta; `/ws` için sıradan bir reverse proxy gibi yazılmış.",
      "The chat server (`:8081`) works when you connect straight to it, but everyone connecting through nginx (`ws://localhost/ws`) gets 426. nginx's config is in `/etc/nginx/conf.d/chat.conf`; `/ws` is written like a plain reverse proxy.",
    ),
    goal: l("nginx üzerinden `ws://localhost/ws`'ye WebSocket ile bağlan.", "Connect a WebSocket to `ws://localhost/ws` through nginx."),
    start: FREE,
    hints: [
      l(
        "`Upgrade` ve `Connection` hop-by-hop başlıklardır: nginx onları sunucuya iletmez. Üstelik varsayılan olarak sunucuyla HTTP/1.0 konuşur.",
        "`Upgrade` and `Connection` are hop-by-hop headers: nginx doesn't pass them on. And by default it talks HTTP/1.0 to the server.",
      ),
      l(
        "`location /ws` içine: `proxy_http_version 1.1;`, `proxy_set_header Upgrade $http_upgrade;`, `proxy_set_header Connection \"upgrade\";`. Sonra `sudo nginx -s reload`.",
        "Inside `location /ws`: `proxy_http_version 1.1;`, `proxy_set_header Upgrade $http_upgrade;`, `proxy_set_header Connection \"upgrade\";`. Then `sudo nginx -s reload`.",
      ),
      l("`sudo nano /etc/nginx/conf.d/chat.conf`, `sudo nginx -s reload`, `wscat -c ws://localhost/ws`", "`sudo nano /etc/nginx/conf.d/chat.conf`, `sudo nginx -s reload`, `wscat -c ws://localhost/ws`"),
    ],
    par: 3,
    check: (ctx) => through(ctx),
  },
  {
    id: "typo",
    title: l("Yüklenmemiş ayar", "A config that never loaded"),
    story: l(
      "Bir ekip arkadaşın dün düzeltmeyi yapmış, \"reload ettim\" diyor, ama bağlantılar hâlâ 426 alıyor. Dosyada üç satır da var gibi görünüyor. Bir yerde bir sorun var.",
      "A teammate made the fix yesterday and says \"I reloaded it\", but connections still get 426. The file seems to have all three lines. Something is wrong somewhere.",
    ),
    goal: l("Ayarı düzelt, nginx'e yükle ve nginx üzerinden bağlan.", "Fix the config, load it into nginx, and connect through nginx."),
    start: createNet({ nginx: PLAIN_CONF, actions: [{ type: "write", path: "/etc/nginx/conf.d/chat.conf", text: TYPO_CONF }] }),
    hints: [
      l(
        "Hatalı bir ayarla `nginx -s reload` başarısız olur ve nginx eski ayarla çalışmaya devam eder. Hatayı görmenin yolu `sudo nginx -t`: dosyayı denetler ve sorunlu satırı söyler.",
        "With a broken config, `nginx -s reload` fails and nginx carries on with the old config. The way to see the error is `sudo nginx -t`: it checks the file and names the bad line.",
      ),
      l("Satırı düzelt, `sudo nginx -t` ile denetle, `sudo nginx -s reload` ile yükle.", "Fix the line, check with `sudo nginx -t`, load with `sudo nginx -s reload`."),
      l(
        "`sudo nginx -t` (`unknown directive \"proxy_set_headr\"`), `sudo nano /etc/nginx/conf.d/chat.conf`, `sudo nginx -s reload`, `wscat -c ws://localhost/ws`",
        "`sudo nginx -t` (`unknown directive \"proxy_set_headr\"`), `sudo nano /etc/nginx/conf.d/chat.conf`, `sudo nginx -s reload`, `wscat -c ws://localhost/ws`",
      ),
    ],
    par: 4,
    check: (ctx) => through(ctx),
  },
  {
    id: "new-path",
    title: l("Yeni adres", "A new address"),
    story: l(
      "Ön yüz ekibi WebSocket adresini `/socket` olarak değiştirdi ve canlıya aldı: tarayıcılar artık `ws://localhost/socket`'e bağlanmaya çalışıyor ve 404 alıyor. Eski istemciler için `/ws` de çalışmaya devam etmeli.",
      "The front-end team changed the WebSocket address to `/socket` and shipped it: browsers now try `ws://localhost/socket` and get 404. `/ws` must keep working for older clients too.",
    ),
    goal: l("`ws://localhost/socket` de sohbet sunucusuna gitsin; `/ws` çalışmaya devam etsin.", "`ws://localhost/socket` reaches the chat server too, and `/ws` keeps working."),
    start: createNet({ nginx: PLAIN_CONF, actions: [{ type: "write", path: "/etc/nginx/conf.d/chat.conf", text: TYPO_CONF.replace("proxy_set_headr", "proxy_set_header") }, { type: "nginxReload" }] }),
    hints: [
      l("nginx bir isteği en uzun eşleşen `location`'a gönderir; `/socket` için bir `location` yok.", "nginx sends a request to the longest matching `location`; there's no `location` for `/socket`."),
      l("`/ws` bloğunu kopyalayıp `location /socket` yap (üç upgrade satırıyla birlikte), sonra yeniden yükle.", "Copy the `/ws` block as `location /socket` (with its three upgrade lines), then reload."),
      l("`sudo nano /etc/nginx/conf.d/chat.conf`, `sudo nginx -s reload`, `wscat -c ws://localhost/socket`", "`sudo nano /etc/nginx/conf.d/chat.conf`, `sudo nginx -s reload`, `wscat -c ws://localhost/socket`"),
    ],
    par: 3,
    check: (ctx) => through(ctx, "/socket") && Boolean(ctx.state.nginx?.conf.locations.some((x) => x.path === "/ws" && x.httpVersion === "1.1")),
  },
  {
    id: "bad-gateway",
    title: l("502 Bad Gateway", "502 Bad Gateway"),
    story: l(
      "Gece bakımından sonra kullanıcılar `ws://localhost/ws`'de \"502\" görüyor. nginx ayarı doğru (WebSocket satırları tamam), `/ws` artık `:9001`'deki Node sunucusuna (`server.js`) gidiyor. Sorunu bul ve düzelt.",
      "After the night's maintenance users see \"502\" on `ws://localhost/ws`. The nginx config is right (the WebSocket lines are there); `/ws` now goes to the Node server on `:9001` (`server.js`). Find the problem and fix it.",
    ),
    goal: l("nginx üzerinden bağlanınca `:9001`'deki sunucunun karşılamasını al.", "Connecting through nginx, get the greeting from the server on `:9001`."),
    start: createNet({ nginx: NODE_CONF, files: { "server.js": SERVER } }),
    hints: [
      l(
        "502, nginx'in arkadaki sunucuya ulaşamadığı demek (nginx ayakta, arkası değil). `curl -i localhost:9001` ya da `ps` ile bak.",
        "502 means nginx couldn't reach the server behind it (nginx is up, what's behind isn't). Look with `curl -i localhost:9001` or `ps`.",
      ),
      l("Sunucu çalışmıyor: başlat ve yeniden dene.", "The server isn't running: start it and try again."),
      l("`node server.js &`, `wscat -c ws://localhost/ws`", "`node server.js &`, `wscat -c ws://localhost/ws`"),
    ],
    par: 2,
    check: (ctx) => newConns(ctx).some((c) => c.client === "you" && c.via !== null && c.msgs.some((m) => m.dir === "in" && m.text.includes(":9001"))),
  },
];
