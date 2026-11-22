import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Kapandı · sahne: run api
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste biraz dedektiflik yapacağız: bir container bozulduğunda sebebini nasıl bulursun, onu öğreneceğiz." },
        { say: "api image'ını docker run ile arka planda başlatıyoruz. Hata yok… ama bak, container kırmızıya döndü.", cue: 0 },
        { say: "Komut hiçbir hata vermedi, yine de docker ps'e baktığında listede yok. Container başladı ve bir saniye içinde kapandı." },
        { say: "Bu, Docker'da en sık yaşanan sürpriz. Docker sadece ana süreci başlatır; o süreç kapanırsa container da kapanır." },
        { say: "Kapanmış container'ları görmek için docker ps yetmez, docker ps -a lazım. Durum sütununda Exited yazar, yanında da bir sayı." },
        { say: "İyi haber şu: neden kapandığını container'ın kendisi söyler. Nereye bakacağını sonraki sayfada göstereyim." },
      ],
    },
    // 1 · Loglar
    {
      lines: [
        { say: "İlk bakılacak yer her zaman loglar. Container kapanmış olsa bile logları silinmez, orada durur." },
        { say: "Alttaki terminalde docker logs api satırına bak. Sebep açık açık yazıyor: DATABASE_URL ayarı hiç verilmemiş." },
        { say: "Peki log dediğimiz ne? Uygulama ekrana ne yazdıysa, yani stdout ve stderr, Docker onu saklar." },
        { say: "O yüzden uygulaman hatalarını bir dosyaya değil, ekrana yazmalı. Docker'da logu okumanın tek kolay yolu bu." },
        { say: "Soldaki notlarda son satırları canlı izlemek ya da sadece son on dakikaya bakmak için birkaç kullanışlı komut var. Şimdi geçelim; exit code'lar bize ne anlatıyor, bakalım." },
      ],
    },
    // 2 · 127 (tahmin: hangi exit code?) · sahne: run typo (ngnix)
    {
      lines: [
        { say: "Container kapanınca geride bir sayı bırakır: exit code. Bu sayı, elindeki en değerli ipuçlarından biri." },
        { say: "Şimdi nginx'i başlatacağız, ama komut adını yanlış yazarak: nginx yerine ngnix. Sence container hangi exit code ile kapanır? 1 mi, 127 mi, 137 mi?" },
      ],
      answer: {
        right: "Süper, doğru bildin!",
        wrong: "Olsun, bu sayılar ilk başta karışır. İzleyelim.",
        lines: [
          { say: "typo adındaki container'ı yanlış komutla başlatıyoruz… ve hemen kapandı, 127 ile.", cue: 0 },
          { say: "Loga bak: executable file not found in PATH yazıyor. Yani image'da ngnix adında bir program yok; uygulama hiç başlamadı bile." },
          { say: "1 ile farkını şöyle düşün: 1, uygulama çalıştı ama kendi içinde hata verdi demek. 127 ise çalıştırılacak programın hiç bulunamaması." },
          { say: "Birkaç sayıyı daha aklında tut. 0 işini bitirdi, 126 komut var ama çalıştırılamadı, çoğu zaman izin yüzünden. 137 SIGKILL ile öldürüldü, 143 de SIGTERM ile durduruldu." },
          { say: "Sahnenin altındaki panel de her seferinde bu sayının ne demek olduğunu yazıyor. Sırada 137 var; sonraki sayfada onu yakından tanıyalım." },
        ],
      },
    },
    // 3 · 137 (tahmin: 128 MB sınırla ne olur?) · sahne: run report --memory 128m
    {
      lines: [
        { say: "Elimizde acme/report diye bir rapor uygulaması var. Çalışırken yaklaşık 300 MB bellek kullanıyor." },
        { say: "Onu 128 MB bellek sınırıyla başlatacağız. Ne olur sence? Yavaş ama çalışır mı, 137 ile öldürülür mü, yoksa Docker başlatmayı hiç reddeder mi?" },
      ],
      answer: {
        right: "Harika, aynen öyle!",
        wrong: "Çok mantıklı bir tahmin, ama değil. Bak.",
        lines: [
          { say: "report container'ını 128 MB sınırla başlatıyoruz… ve kapandı. Exit code 137.", cue: 0 },
          { say: "Terminaldeki inspect satırına bak: 137 true. İkinci değer OOMKilled alanı; true, bellek yüzünden öldürüldü demek." },
          { say: "İlginç olan şu: uygulama bir hata yazmadı bile. Bellek sınırı aşılınca çekirdek onu SIGKILL ile dışarıdan öldürdü. Buna OOM killer diyoruz." },
          { say: "Ama dikkat, 137 her zaman bellek demek değil. docker kill ile öldürülen bir container da 137 verir. İkisini ayırt etmek için hep OOMKilled alanına bak." },
          { say: "Buraya kadar hep kapanmış container'lara baktık. Sonraki sayfada çalışan bir container'ın içine gireceğiz." },
        ],
      },
    },
    // 4 · exec · sahne: run web, exec whoami
    {
      lines: [
        { say: "Bazen container çalışıyor ama bir şeyler ters gidiyor. O zaman içine girip kendi gözünle bakmak istersin." },
        { say: "Önce web adında bir nginx başlatıyoruz. Yeşil, çalışıyor.", cue: 0 },
        { say: "Şimdi docker exec ile içine bir komut gönderiyoruz: whoami. Terminalde cevap geldi: root.", cue: 1 },
        { say: "docker exec ile sh çalıştırırsan içeride bir kabuk açılır. Dosyalara bakarsın, ayarları kontrol edersin, başka bir servise ping atarsın." },
        { say: "Yalnız bir şart var: sadece çalışan container'a girebilirsin. Kapanmış olana girilmez, onun için loglar var." },
        { say: "Bir de uyarı: içeride elle yaptığın değişiklikler container silinince gider, image'a da geçmez. Sorunu exec ile bul, çözümü Dockerfile'a yaz. Hadi geçelim, biraz çakışma çıkaracağız." },
      ],
    },
    // 5 · Port çakışması (tahmin: ikinci 8080 ne olur?) · sahne: run site 8080, run site2 8080
    {
      lines: [
        { say: "Yeni bir sorun tipi: port çakışması. site adında bir nginx, host'un 8080 portunu container'ın 80 portuna bağlamış durumda." },
        { say: "Şimdi site2 adında ikinci bir nginx'i yine 8080'e bağlamaya çalışacağız. Ne olur sence? İkisi 8080'i paylaşır mı, site2 hiç başlamaz mı, yoksa site kapanıp yerini site2'ye mi bırakır?" },
      ],
      answer: {
        right: "Evet, doğru!",
        wrong: "Güzel deneme, ama öyle olmuyor. İzle.",
        lines: [
          { say: "Önce site'ı başlatıyoruz. 8080 artık onun.", cue: 0 },
          { say: "Şimdi site2'yi aynı portla başlatıyoruz… Hata: port is already allocated.", cue: 1 },
          { say: "Host'ta bir port aynı anda tek bir yere bağlanabilir. Docker site2'yi oluşturdu ama başlatamadı; durumuna bak, Created. Yani hiç çalışmamış." },
          { say: "Gerçek hayatta portu bazen başka bir container değil, bilgisayarındaki başka bir program tutar. Yerelde çalışan bir veritabanı ya da bir geliştirme sunucusu mesela." },
          { say: "Portu kimin tuttuğunu bulmak için soldaki notlarda iki komut var. Peki bunu nasıl düzeltiriz? Sonraki sayfada." },
        ],
      },
    },
    // 6 · Başka port · sahne: rm site2, run site2 8081, curl 8081
    {
      lines: [
        { say: "Çözüm basit: site2'ye başka bir host portu vereceğiz." },
        { say: "Önce başlayamayan site2'yi siliyoruz.", cue: 0 },
        { say: "Sonra aynı isimle yeniden başlatıyoruz, bu sefer host'un 8081 portunu container'ın 80'ine bağlayarak. Yeşil, çalışıyor.", cue: 1 },
        { say: "Ve curl ile localhost 8081'e bir istek atıyoruz. Cevap geldi.", cue: 2 },
        { say: "Dikkat et: container'ın içinde nginx hâlâ 80'i dinliyor. Değişen sadece host tarafı." },
        { say: "Sırada çok sık karşına çıkacak bir hata var: izin hatası. Sonraki sayfaya geç." },
      ],
    },
    // 7 · İzin hatası (tahmin: node kullanıcısı yazabilir mi?) · sahne: run uploader 1.0
    {
      lines: [
        { say: "acme/uploader image'ı root olmayan node kullanıcısıyla çalışıyor ve app altındaki uploads klasörüne dosya yazmaya çalışıyor." },
        { say: "Ama app klasörünü build sırasında root kopyalamış." },
        { say: "Sence ne olur? Container'ın içinde her şey serbest diye yazar mı, izin hatasıyla çöker mi, yoksa Docker kullanıcıyı root'a mı çevirir?" },
      ],
      answer: {
        right: "Bravo, doğru!",
        wrong: "Pek çok kişi böyle sanıyor. Bakalım.",
        lines: [
          { say: "uploader'ı başlatıyoruz… ve kapandı. Logda EACCES, permission denied yazıyor, exit code 1.", cue: 0 },
          { say: "Çünkü container'ın içi de sıradan bir Linux; dosya izinleri orada da geçerli." },
          { say: "COPY varsayılan olarak dosyaları root'a ait kopyalar. node kullanıcısı da root'un klasörüne yazamaz." },
          { say: "Şunu da söyleyeyim: root olmayan bir kullanıcıyla çalıştırmak aslında doğru bir karar, bunu güvenlik dersinde göreceğiz. Ama o zaman klasörün sahibi de o kullanıcı olmalı." },
          { say: "Peki bunu nasıl sağlarız? Sonraki sayfada düzeltelim." },
        ],
      },
    },
    // 8 · --chown · sahne: rm uploader, run uploader 1.1
    {
      lines: [
        { say: "Düzeltme image'ın 1.1 sürümünde. Bu sürüm dosyaları COPY'ye chown node:node vererek kopyalıyor; yani kopyalarken sahibini de belirliyor." },
        { say: "Eski uploader'ı siliyoruz.", cue: 0 },
        { say: "Ve 1.1 ile yeniden başlatıyoruz. Kullanıcı yine node, ama app klasörü artık onun. Bak, uploader çalışıyor.", cue: 1 },
        { say: "Kolay yol root olarak çalıştırmak olurdu. Çalışır, ama güvenlik kazancını çöpe atar. Kural şu: önce sebebi bul, sonra en küçük doğru değişikliği yap." },
        { say: "Bir dürüstlük notu: bu sahnede SIGTERM ile durdurulan her container 0 ile kapanıyor. Gerçekte sinyali yakalamayan bir uygulama 143 ile kapanır, 10 saniyede kapanmazsa da Docker SIGKILL gönderir: 137." },
        { say: "Anlatacaklarım bu kadar. Sonraki sayfada sıra sende." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Şimdi sahne senin. Aşağıda bir terminal var ve gece nöbetinden dört senaryo seni bekliyor." },
        { say: "127 ile kapanan bir proxy, izin hatası veren bir yükleyici, hiç başlamamış bir site ve her seferinde 137 ile biten bir rapor. Önce ipucunu bul, sonra düzelt." },
        { say: "Sıra hep aynı: docker ps -a ile durumu ve exit code'u gör, docker logs ile sebebi oku, gerekirse docker inspect'e bak." },
        { say: "Komutları kendin yazacaksın. İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Hadi, iyi nöbetler!" },
      ],
    },
  ],
};
