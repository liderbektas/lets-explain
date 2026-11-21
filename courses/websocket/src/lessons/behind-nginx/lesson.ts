import { l } from "@lets-explain/core/i18n";
import type { Lesson } from "@lets-explain/core/course/types";
import { scenarios } from "./scenarios";
import { scene } from "./Scene";

const CONF = "/etc/nginx/conf.d/chat.conf";

export const behindNginx: Lesson = {
  slug: "behind-nginx",
  title: l("nginx arkasında WebSocket", "WebSocket behind nginx"),
  summary: l(
    "Lokalde çalışan WebSocket, nginx'in arkasında 426 alıyor. nginx'in yukarıya ne gönderdiğini gör, üç satırla düzelt, `nginx -t` ile denetle.",
    "A WebSocket that works locally gets 426 behind nginx. See what nginx sends upstream, fix it with three lines, and check with `nginx -t`.",
  ),
  minutes: 12,
  level: l("Orta", "Intermediate"),
  Scene: scene.Scene,
  changesFor: scene.changesFor,
  missions: scenarios.map(({ id, title }) => ({ id, title })),
  objectives: [
    { text: l("Sıradan bir proxy ayarının neden 426 verdiğini görmek", "See why a plain proxy config gives 426"), step: 0 },
    { text: l("Hop-by-hop başlıkların nginx'te düştüğünü görmek", "See the hop-by-hop headers dropped at nginx"), step: 1 },
    { text: l("Üç satırla upgrade'i geçirmek", "Let the upgrade through with three lines"), step: 2 },
    { text: l("Proxy'nin diğer ayarlarını bilmek", "Know the proxy's other settings"), step: 3 },
  ],
  steps: [
    {
      short: l("426", "426"),
      tag: "problem",
      title: l("Lokalde çalışıyor, nginx arkasında çalışmıyor", "Works locally, fails behind nginx"),
      body: [
        l(
          "Tarayıcı `ws://localhost/ws`'ye bağlanmak istedi. İsteği nginx aldı ve arkadaki WebSocket sunucusuna (`:8081`) iletti. Cevap 101 değil, 426 Upgrade Required. Tarayıcının isteğinde upgrade başlıkları tam; sorun yolda bir yerde.",
          "The browser wanted to connect to `ws://localhost/ws`. nginx took the request and passed it to the WebSocket server behind it (`:8081`). The answer was not 101 but 426 Upgrade Required. The browser's request has its upgrade headers; the problem is somewhere on the way.",
        ),
        l(
          "426'yı hatırla (3. ders): `ws` sunucusu upgrade başlıkları olmayan bir isteğe 426 der. Demek ki sunucuya giden istekte bu başlıklar yok.",
          "Remember the 426 (lesson 3): the `ws` server answers a request without upgrade headers with 426. So the request that reached the server doesn't have them.",
        ),
      ],
    },
    {
      short: l("Yolda düştü", "Dropped"),
      tag: "how",
      title: l("nginx yukarıya ne gönderdi?", "What nginx sent upstream"),
      body: [
        l(
          "Bu, nginx'in sunucuya gönderdiği istek. Üç fark var: `HTTP/1.0` (nginx'in varsayılanı), `Connection: close` ve hiç `Upgrade` başlığı yok.",
          "This is the request nginx sent the server. Three differences: `HTTP/1.0` (nginx's default), `Connection: close`, and no `Upgrade` header at all.",
        ),
        l(
          "`Connection` ve `Upgrade` hop-by-hop başlıklardır: sadece bir sonraki duraktaki bağlantı için anlamlıdırlar ve proxy onları bilerek iletmez. WebSocket'in proxy'den geçmesi için bunu açıkça istemek gerekir. Upgrade ayrıca HTTP/1.1 ister.",
          "`Connection` and `Upgrade` are hop-by-hop headers: they only mean something for the connection to the next stop, so a proxy deliberately doesn't pass them on. For a WebSocket to go through a proxy you have to ask for it explicitly. Upgrading also needs HTTP/1.1.",
        ),
      ],
    },
    {
      short: l("Üç satır", "Three lines"),
      tag: "how",
      title: l("Üç satır ve bir reload", "Three lines and a reload"),
      body: [
        l(
          "`location /ws` içine üç satır ekledik ve nginx'i yeniden yükledik: `proxy_http_version 1.1;` (upgrade için şart), `proxy_set_header Upgrade $http_upgrade;` (istemcinin Upgrade başlığını ilet) ve `proxy_set_header Connection \"upgrade\";`.",
          "We added three lines to `location /ws` and reloaded nginx: `proxy_http_version 1.1;` (needed for an upgrade), `proxy_set_header Upgrade $http_upgrade;` (pass the client's Upgrade header on) and `proxy_set_header Connection \"upgrade\";`.",
        ),
        l(
          "Sunucu 101 döndü, nginx de cevabı tarayıcıya iletip bağlantıyı bir tünele çevirdi. Bundan sonra frame'ler nginx'in içinden olduğu gibi geçer.",
          "The server answered 101, and nginx passed it to the browser and turned the connection into a tunnel. From then on frames pass through nginx as they are.",
        ),
      ],
      practice: {
        commands: [
          { cmd: "sudo nginx -t", note: l("Ayarı yüklemeden denetler; hatalı satırı söyler.", "Checks the config without loading it; names the bad line.") },
          { cmd: "sudo nginx -s reload", note: l("Yeni ayarı yükler. Hatalıysa eski ayarla devam eder.", "Loads the new config. If it's broken, nginx carries on with the old one.") },
        ],
        snippets: [
          {
            label: CONF,
            code: 'location /ws {\n    proxy_pass http://localhost:8081;\n    proxy_http_version 1.1;\n    proxy_set_header Upgrade $http_upgrade;\n    proxy_set_header Connection "upgrade";\n}',
          },
        ],
      },
    },
    {
      short: l("Diğerleri", "The rest"),
      tag: "reality",
      title: l("Proxy'nin diğer ayarları", "The proxy's other settings"),
      body: [
        l(
          "**proxy_read_timeout** varsayılan 60 sn'dir: 7. dersteki sessiz bağlantı kopması buradan gelir. nginx'in resmi belgelerinde bir `map` kalıbı da var: `$http_upgrade` boşsa `Connection: close`, değilse `upgrade` gönderir. Böylece aynı `location` hem normal HTTP'ye hem WebSocket'e hizmet edebilir.",
          "**proxy_read_timeout** defaults to 60 s: that's where lesson 7's quiet-connection drop comes from. nginx's official docs also give a `map` pattern: send `Connection: close` when `$http_upgrade` is empty and `upgrade` otherwise, so one `location` can serve both plain HTTP and WebSocket.",
        ),
        l(
          "Canlıda TLS genelde nginx'te biter: tarayıcı `wss://` ile nginx'e bağlanır, nginx arkaya düz `ws://` ile gider. AWS ALB ve Cloudflare gibi yük dengeleyiciler WebSocket'i kendileri tanır, ama onların da bir boşta kalma süresi vardır.",
          "In production, TLS usually ends at nginx: the browser connects to nginx with `wss://`, and nginx goes on to the back end with plain `ws://`. Load balancers such as AWS ALB and Cloudflare understand WebSocket themselves, but they have an idle timeout too.",
        ),
      ],
      callouts: [
        {
          kind: "insight",
          text: l(
            "502 Bad Gateway \"nginx ayakta, arkası değil\" demek; 426 ise \"arkası ayakta ama isteği WebSocket olarak görmedi\". İkisi farklı yerlere bakmayı gerektirir.",
            "502 Bad Gateway means \"nginx is up, what's behind it isn't\"; 426 means \"what's behind is up but didn't see the request as a WebSocket\". They send you to look in different places.",
          ),
        },
      ],
    },
    {
      short: l("Sen dene", "Your turn"),
      tag: "yourTurn",
      title: l("Şimdi sen yaz", "Now you type"),
      body: [
        l(
          `Sıra sende. nginx \`:80\`'de, ayarı \`${CONF}\`'ta. **4 senaryo** var: geçmeyen upgrade, yüklenmemiş bir ayar, yeni bir adres ve bir 502.`,
          `Your turn. nginx is on \`:80\`, its config in \`${CONF}\`. There are **4 scenarios**: an upgrade that doesn't get through, a config that never loaded, a new address, and a 502.`,
        ),
        l(
          "/etc altındaki dosya için `sudo nano` gerekir. Değişiklikten sonra `sudo nginx -t` ile denetle, `sudo nginx -s reload` ile yükle, `wscat -c ws://localhost/ws` ile dene.",
          "A file under /etc needs `sudo nano`. After a change, check with `sudo nginx -t`, load with `sudo nginx -s reload`, try with `wscat -c ws://localhost/ws`.",
        ),
      ],
    },
  ],
  recap: [
    l("Sıradan bir proxy ayarı WebSocket'i geçirmez: sunucu upgrade başlıkları olmayan bir istek görür ve 426 der.", "A plain proxy config doesn't let a WebSocket through: the server sees a request without upgrade headers and says 426."),
    l("`Upgrade` ve `Connection` hop-by-hop'tur; nginx onları iletmez ve varsayılanı HTTP/1.0'dır.", "`Upgrade` and `Connection` are hop-by-hop; nginx doesn't pass them on, and its default is HTTP/1.0."),
    l("Üç satır: `proxy_http_version 1.1`, `Upgrade $http_upgrade`, `Connection \"upgrade\"`; sonra reload.", "Three lines: `proxy_http_version 1.1`, `Upgrade $http_upgrade`, `Connection \"upgrade\"`; then reload."),
    l("`nginx -t` denetler; hatalı bir ayarla reload başarısız olur ve eski ayar çalışmaya devam eder.", "`nginx -t` checks; a reload with a broken config fails, and the old config keeps running."),
    l("502 \"arkası yok\", 426 \"arkası WebSocket görmedi\"; zaman aşımları için proxy_read_timeout.", "502 is \"nothing behind\", 426 is \"what's behind saw no WebSocket\"; for timeouts, proxy_read_timeout."),
  ],
  quiz: [
    {
      question: l("nginx arkasındaki bir ws sunucusu 426 dönüyor. En olası sebep?", "A ws server behind nginx answers 426. The likeliest cause?"),
      options: [
        l("Sunucu çalışmıyor", "The server isn't running"),
        l("nginx Upgrade/Connection başlıklarını iletmiyor", "nginx doesn't pass on the Upgrade/Connection headers"),
        l("Tarayıcı eski", "The browser is old"),
        l("TLS sertifikası", "The TLS certificate"),
      ],
      answer: 1,
      explain: l("Upgrade başlıkları olmayan isteğe ws sunucusu 426 der.", "The ws server answers a request without upgrade headers with 426."),
      reviewStep: 1,
    },
    {
      question: l("`proxy_http_version 1.1` neden gerekli?", "Why is `proxy_http_version 1.1` needed?"),
      options: [
        l("Daha hızlı olduğu için", "Because it's faster"),
        l("Upgrade mekanizması HTTP/1.1'e ait; nginx'in varsayılanı 1.0", "The upgrade mechanism belongs to HTTP/1.1; nginx's default is 1.0"),
        l("Sıkıştırma için", "For compression"),
        l("Gerekli değil", "It isn't"),
      ],
      answer: 1,
      explain: l("HTTP/1.0 ile protokol değiştirme yok.", "There's no protocol switch over HTTP/1.0."),
      reviewStep: 2,
    },
    {
      question: l("Ayarı düzelttin ve `nginx -s reload` dedin ama hiçbir şey değişmedi. İlk ne yaparsın?", "You fixed the config and ran `nginx -s reload`, but nothing changed. What do you do first?"),
      options: [
        l("nginx'i silip yeniden kurmak", "Uninstall and reinstall nginx"),
        l("`sudo nginx -t` ile ayarı denetlemek", "Check the config with `sudo nginx -t`"),
        l("Sunucuyu yeniden başlatmak", "Restart the server"),
        l("Tarayıcının önbelleğini temizlemek", "Clear the browser cache"),
      ],
      answer: 1,
      explain: l("Hatalı bir ayarla reload sessizce başarısız olabilir; nginx eski ayarla devam eder.", "A reload with a broken config can fail quietly; nginx carries on with the old one."),
      reviewStep: 3,
    },
    {
      question: l("Kullanıcılar nginx üzerinden 502 alıyor. Ne demek?", "Users get 502 through nginx. What does it mean?"),
      options: [
        l("nginx'in ayarı yanlış", "nginx's config is wrong"),
        l("nginx arkadaki sunucuya ulaşamıyor", "nginx can't reach the server behind it"),
        l("WebSocket desteklenmiyor", "WebSocket isn't supported"),
        l("Mesaj çok büyük", "The message is too big"),
      ],
      answer: 1,
      explain: l("Bad Gateway: kapı (nginx) açık, arkası cevap vermiyor.", "Bad Gateway: the gate (nginx) is open, but what's behind it doesn't answer."),
      reviewStep: 3,
    },
  ],
};
