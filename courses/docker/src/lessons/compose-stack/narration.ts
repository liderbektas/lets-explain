import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Yığın
    {
      lines: [
        { say: "Yine buradayız! Bu derste gerçek bir projeye benzeyen bir yığın kuruyoruz: bir uygulama, bir veritabanı ve bir önbellek, hepsi birlikte." },
        { say: "Kendi uygulamamızın adı app. Yanında Postgres çalışan db ve Redis çalışan cache var. app açılır açılmaz ikisine de bağlanıyor." },
        { say: "Üçünü de tek bir compose.yaml'da topladık. Dışarıya port açan tek servis app, 3000 portundan. db ve cache proje ağının içinde kalıyor, app onlara adlarıyla ulaşıyor." },
        { say: "Veritabanı şifresi de dosyaya yazılmadı; DB_PASSWORD değişkeniyle .env dosyasından geliyor. Bunu bir önceki dersten hatırlıyorsun." },
        { say: "Bu dosyanın ilk halinde kısa bir depends_on var: app, db ve cache'ten sonra başlasın diyor. Kulağa yeterli geliyor, değil mi?" },
        { say: "Bakalım gerçekten yetiyor mu. Sonraki sayfaya geç, ilk up'ı yapalım." },
      ],
    },
    // 1 · Erken başlama (tahmin: app ne olur?) · sahne: up
    {
      lines: [
        { say: "depends_on sayesinde önce db ve cache başlayacak, app de hemen ardından." },
        { say: "Yalnız bir detay var: Postgres'in açılması birkaç saniye sürüyor." },
        { say: "Sence app'e ne olur? Sorunsuz mu çalışır, db hâlâ açılırken bağlanmaya çalışıp kapanır mı, yoksa Compose onu db hazır olana kadar bekletir mi?" },
      ],
      answer: {
        right: "Evet, bildin!",
        wrong: "Güzel bir umut, ama olmadı. Bak.",
        lines: [
          { say: "docker compose up diyoruz. db ve cache başlıyor, app hemen arkalarından… ve app kırmızıya dönüyor.", cue: 0 },
          { say: "Logunda ECONNREFUSED var, db 5432'ye bağlanamadı, çünkü db hâlâ açılıyordu. db ve cache'in ışıklarına bak: sarı, yani starting." },
          { say: "Sıra doğruydu, sorun sırada değil. Kısa depends_on sadece kimin önce başlayacağını söyler; içerideki servisin hazır olmasını beklemez." },
          { say: "Bunu aklına iyi yaz: bir container'ın başlaması, içindeki servisin hazır olması demek değil. Sonraki sayfada biraz bekleyip tekrar deneyeceğiz." },
        ],
      },
    },
    // 2 · Biraz bekle · sahne: zaman geçer, up
    {
      lines: [
        { say: "Şimdi hiçbir şey yapmadan biraz zaman geçmesine izin veriyoruz. Bak, önce cache, sonra db sağlıklı oldu; ışıkları yeşile döndü.", cue: 0 },
        { say: "Aynı docker compose up'ı bir kez daha çalıştırıyoruz. Compose kapanmış app'i yeniden yarattı, ve bu sefer bağlandı.", cue: 1 },
        { say: "Dikkat et, up sadece kapanmış servisi yeniden yarattı. Zaten çalışan db ve cache'e dokunmadı." },
        { say: "Çalıştı, güzel. Ama dürüst olalım: bu bir çözüm değil. Elle tekrar denemek, şansa güvenmek demek." },
        { say: "Bilgisayar yeniden başladığında ya da CI'da her seferinde doğru anı yakalayamazsın. Bize Compose'un kendisinin beklemesi lazım. Sonraki sayfada tam olarak bunu yapacağız." },
      ],
    },
    // 3 · service_healthy (tahmin: down + up sonrası Compose ne yapar?) · sahne: down, up
    {
      lines: [
        { say: "Dosyayı değiştirdik. db ve cache'e birer healthcheck ekledik, app'in depends_on kısmına da condition service_healthy yazdık." },
        { say: "Şimdi her şeyi kapatıp yeniden açacağız. Sence Compose ne yapacak?" },
        { say: "app'i yine hemen mi başlatır, db ve cache sağlıklı olana kadar bekleyip sonra mı başlatır, yoksa db hazır değil diye hata verip durur mu?" },
      ],
      answer: {
        right: "Süper, doğru!",
        wrong: "Hayır, ama yaklaştın. Hemen göstereyim.",
        lines: [
          { say: "Önce down ile her şeyi kapatıyoruz.", cue: 0 },
          { say: "Şimdi up. Olaylara bak: app, db sağlıklı olana kadar bekliyor yazıyor. Compose önce bekledi, sonra app'i tek seferde başlattı, ve app ilk denemede çalıştı.", cue: 1 },
          { say: "Healthcheck, Docker'ın container'ın içinde düzenli çalıştırdığı küçük bir komut. Postgres için pg_isready, Redis için redis-cli ping. Komut başarılı olunca container healthy olur." },
          { say: "service_healthy de Compose'a o cevabı beklemesini söylüyor. Bu arada resmi postgres ve redis image'larında hazır bir healthcheck yok; onu compose dosyasında sen yazarsın." },
          { say: "Sahnede bu birkaç adımda geçiyor, gerçekte interval ve retries ayarlarına göre saniyeler sürer. CI için up komutuna wait bayrağını ekleyebilirsin; komut, bütün servisler sağlıklı olunca döner." },
        { say: "Şimdi veriye geçelim, sonraki sayfa seni bekliyor." },
        ],
      },
    },
    // 4 · Veri kalır (tahmin: down + up sonrası sipariş?) · sahne: yaz, down, up
    {
      lines: [
        { say: "Şimdi veriye bakalım. Veritabanına bir sipariş yazacağız, sonra down ile her şeyi kapatıp tekrar up diyeceğiz." },
        { say: "Sence sipariş nerede olacak? Container'larla birlikte gitti mi, hâlâ pgdata volume'unda mı, yoksa Redis'e mi taşındı?" },
      ],
      answer: {
        right: "Harika, tam öyle!",
        wrong: "Olmadı, ama sorun değil. İzle.",
        lines: [
          { say: "db'ye bir sipariş dosyası yazıyoruz.", cue: 0 },
          { say: "down diyoruz. Bütün container'lar gidiyor.", cue: 1 },
          { say: "Ve tekrar up. Yeni db container'ının loguna bak: existing data found. Sipariş dosyası yerinde.", cue: 2 },
          { say: "Çünkü veritabanının dosyaları pgdata adlı named volume'a yazılıyor, ve down volume'lara dokunmaz. Container yeni, veri eski." },
          { say: "Gerçek bir veritabanında bunu tablodaki satırları sayarak kontrol edersin; soldaki notlarda örnek bir psql komutu var. Peki volume'u da silersek? Sonraki sayfada deneyelim." },
        ],
      },
    },
    // 5 · down -v (tahmin: sipariş?) · sahne: down -v, up
    {
      lines: [
        { say: "Bu sefer down'a v bayrağını ekleyeceğiz, sonra yine up." },
        { say: "Sipariş ne olur sence? Hâlâ orada mı durur, tamamen gider mi, yoksa yarısı mı kalır?" },
      ],
      answer: {
        right: "Doğru bildin!",
        wrong: "Keşke, ama hayır. Bak.",
        lines: [
          { say: "down ile v bayrağını çalıştırıyoruz. Container'lar, ağ ve bu sefer volume da siliniyor.", cue: 0 },
          { say: "Tekrar up. Yeni db'nin logunda initialized a new, empty database yazıyor. Sipariş yok.", cue: 1 },
          { say: "v bayrağı named volume'ları da siler. Yeni db boş bir volume buldu ve sıfırdan bir veritabanı kurdu." },
          { say: "Geliştirirken temiz bir başlangıç için çok işe yarar. Ama production'da yanlışlıkla çalıştırırsan veriyi kaybedersin. Sonraki sayfada bir emniyet ağı daha kuracağız." },
        ],
      },
    },
    // 6 · restart · sahne: down, up (restart: on-failure), iki tur zaman
    {
      lines: [
        { say: "Healthcheck tek yol değil. Kısa depends_on'a geri dönüp app'e restart on-failure ekledik; önce her şeyi kapatıyoruz.", cue: 0 },
        { say: "Ve up. app yine erken başladı ve çöktü, tıpkı ilk seferdeki gibi.", cue: 1 },
        { say: "Biraz zaman geçiyor. Docker çöken app'i kendiliğinden yeniden başlatıyor; sayaç bire çıktı.", cue: 2 },
        { say: "Bir tur daha. Sayaç ikide, ve bu sefer db hazır: app ayakta kaldı.", cue: 3 },
        { say: "En sağlamı ikisini birlikte kullanmak: düzgün başlangıç için service_healthy, sonradan kopan bağlantılar için restart unless-stopped." },
        { say: "Uygulama kodunun da bağlantıyı birkaç kez denemesi iyi bir alışkanlık. Hadi, bir sayfa daha." },
      ],
    },
    // 7 · Gerçekte · sahne: curl :3000
    {
      lines: [
        { say: "Son bir kontrol: curl ile localhost 3000'e soruyoruz… ve cevap geldi.", cue: 0 },
        { say: "Dışarıya sadece app açık. db ve cache'in portu yok, onlara sadece proje ağından ulaşılıyor. Şifre de compose.yaml'da değil, .env dosyasında." },
        { say: "Bu derste gördüğün her şey burada bir arada: healthcheck'le düzgün bir açılış, volume'da güvende duran veri ve restart'la bir emniyet ağı." },
        { say: "Kendi projende bu iskeleti kopyalayabilirsin. app için kendi Dockerfile'ını yazarsın, sonra docker compose up, d ve build bayraklarıyla başlatırsın." },
        { say: "Geliştirirken veritabanına bir araçla bağlanman gerekirse, db'ye geçici olarak 5432 portunu ekleyebilirsin. Anlatacaklarım bu kadar; sonraki sayfada sıra sende." },
      ],
    },
    // 8 · Sen dene
    {
      lines: [
        { say: "Terminal senin! Klasörde app, Postgres'li db ve Redis'li cache olan bir proje var." },
        { say: "Aşağıda gerçek işten beş senaryo var. Komutları kendin yazacaksın, compose.yaml'ı nano ile düzenleyeceksin, ve sahne her komutta ne olduğunu gösterecek." },
        { say: "Takılırsan docker compose ps yaz, durumu ve healthy yazısını orada görürsün. docker compose logs app de app'in neden kapandığını söyler." },
        { say: "Biraz zaman geçsin istersen sleep 3 işini görür." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Hadi göster kendini!" },
      ],
    },
  ],
};
