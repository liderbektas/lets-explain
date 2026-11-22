import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · -p 8080:80 · sahne: run web -p 8080:80, curl 8080
    {
      lines: [
        { say: "Yeniden merhaba! Bu derste kapılardan konuşacağız: dışarıdan bir container'a nasıl ulaşılır, ve -p 8080:80 tam olarak ne demek?" },
        { say: "Önce şunu bil: her container'ın kendi ağı var. İçerideki nginx 80 portunu dinler, ama o 80 senin bilgisayarının 80'i değil." },
        { say: "web adında bir nginx'i -p 8080:80 ile başlatıyoruz. Sıra hep önce host, sonra container: bilgisayarının 8080'ine gelen istek, container'ın 80'ine gider.", cue: 0 },
        { say: "curl ile localhost 8080'e soruyoruz… ve nginx sayfası geldi.", cue: 1 },
        { say: "Bunu bir apartman gibi düşün. Dış kapı numarası, yani 8080, sokaktan görünen adres. Daire numarası, yani 80, içerideki yer. Docker da kapıcı: gelen ziyaretçiyi doğru daireye yollar." },
        { say: "Peki daire numarasını yanlış yazarsak ne olur? Sonraki sayfada görelim." },
      ],
    },
    // 1 · Yanlış port (tahmin: curl ne olur?) · sahne: run web2 -p 8081:8080, curl 8081
    {
      lines: [
        { say: "Şimdi web2 adında ikinci bir nginx başlatacağız, -p 8081:8080 ile. Ama nginx içeride 8080'i değil, 80'i dinliyor." },
        { say: "Sence curl localhost 8081 ne olur? nginx sayfası mı gelir, bağlantı container'a ulaşıp kesilir mi, yoksa Docker container'ı hiç başlatmaz mı?" },
      ],
      answer: {
        right: "Evet, işte tam bu!",
        wrong: "Kötü bir tahmin değil, ama olan bu değil. Bak.",
        lines: [
          { say: "web2'yi başlatıyoruz. Yeşil ışık yanıyor, etiketi de 8081'den 8080'e.", cue: 0 },
          { say: "Şimdi curl atıyoruz… \"Connection reset by peer\".", cue: 1 },
          { say: "Docker 8081'i container'ın 8080'ine bağladı, ama orada dinleyen kimse yok. Bağlantı container'a kadar gelir ve kesilir; yani bu hata \"oraya kadar geldim ama içeride kimse yok\" demek." },
          { say: "Bunu \"Connection refused\" ile karıştırma. O, host'ta o portu hiç kimse yayınlamıyor demek. Bu ikisini ayırt etmek, sorun gidermenin yarısı." },
          { say: "Bu yüzden -p'nin sağ tarafına her zaman uygulamanın içeride gerçekten dinlediği portu yazmalısın. Image'ın hangi portu kullandığını docker inspect ile görebilirsin." },
          { say: "Hadi bu yanlışı düzeltelim; sonraki sayfaya geç." },
        ],
      },
    },
    // 2 · İkisi de 80 (tahmin: çakışır mı?) · sahne: rm web2, run web2 -p 8081:80, curl 8081
    {
      lines: [
        { say: "web zaten içeride 80'i dinliyor. Şimdi web2'yi silip -p 8081:80 ile yeniden başlatacağız; yani o da içeride 80'i dinleyecek." },
        { say: "Sence bu ikisi çakışır mı? İki container aynı portu kullanamaz mı, her birinin kendi 80'i mi var, yoksa sadece biri mi cevap verir?" },
      ],
      answer: {
        right: "Doğru, çok iyi!",
        wrong: "Çoğu kişi böyle düşünür. Hemen bakalım.",
        lines: [
          { say: "Yanlış ayarlı web2'yi siliyoruz.", cue: 0 },
          { say: "Ve -p 8081:80 ile yeniden başlatıyoruz.", cue: 1 },
          { say: "curl localhost 8081… nginx sayfası geldi. Şimdi iki nginx yan yana çalışıyor, biri 8080'de, diğeri 8081'de.", cue: 2 },
          { say: "Çakışma yok, çünkü içerideki portlar her container'a özel. On container'ın hepsi içeride 80'i dinleyebilir." },
          { say: "Apartman benzetmesine dönersek: iki ayrı binada da 80 numaralı daire olabilir. Önemli olan, sokaktan bakınca her binanın kapı numarasının farklı olması." },
          { say: "Tekil olması gereken host tarafı. Peki iki container aynı host portunu isterse? Sonraki sayfada deneyeceğiz." },
        ],
      },
    },
    // 3 · Çakışma (tahmin: ne olur?) · sahne: run web3 -p 8080:80 (başlayamaz)
    {
      lines: [
        { say: "8080'i şu an web kullanıyor. Şimdi üçüncü bir container'ı, web3'ü, yine -p 8080:80 ile başlatmaya çalışacağız." },
        { say: "Sence ne olur? İstekler ikisi arasında mı paylaşılır, Docker yeni container'ı başlatamaz mı, yoksa eskisi mi durdurulur?" },
      ],
      answer: {
        right: "Aynen, doğru bildin!",
        wrong: "Olmadı, ama sorun değil. İzle.",
        lines: [
          { say: "web3'ü başlatmayı deniyoruz… Hata: \"port is already allocated\". Port zaten ayrılmış.", cue: 0 },
          { say: "Bak, web3 oluşturuldu ama hiç başlamadı; sayaçta başlayamayan bir container görüyorsun." },
          { say: "Kural basit: bir host portunu aynı anda tek bir şey dinleyebilir. O şey her zaman bir container olmayabilir; yerel bir veritabanı ya da başka bir geliştirme sunucusu da o portu tutuyor olabilir." },
          { say: "Çözümün iki yolu var: portu kimin tuttuğunu bulup onu kapatırsın, ya da başka bir host portu seçersin. Soldaki notlarda bunu bulmanın komutları var." },
          { say: "Ya host portunu hiç düşünmek istemezsen? Sonraki sayfaya geç." },
        ],
      },
    },
    // 4 · Rastgele port · sahne: rm web3, run web3 -p 80, curl 32768
    {
      lines: [
        { say: "Bazen hangi host portunun kullanılacağı hiç umurunda olmaz. O zaman seçimi Docker'a bırakabilirsin. Önce başlayamayan web3'ü siliyoruz.", cue: 0 },
        { say: "Şimdi onu -p 80 ile, yani sadece container portunu vererek başlatıyoruz. Docker boştaki yüksek bir portu seçti: 32768.", cue: 1 },
        { say: "curl ile o porta soruyoruz… cevap geldi.", cue: 2 },
        { say: "Aynı image'dan birçok kopya çalıştırırken, mesela testlerde ya da deneme ortamlarında, bu çok rahattır: host portlarını tek tek planlamak zorunda kalmazsın." },
        { say: "Tek bedeli şu: portu sen seçmediğin için önceden bilemezsin. Her seferinde hangisinin verildiğine bakman gerekir." },
        { say: "Hangi portun seçildiğini merak edersen docker port komutu söyler. Rastgele portun bir de büyük harfli kardeşi var; sonraki sayfada." },
      ],
    },
    // 5 · -P ve docker port
    {
      lines: [
        { say: "Büyük P, küçük p'den biraz farklı çalışır. Image'ın Dockerfile'da EXPOSE ile bildirdiği bütün portları alır ve hepsini rastgele host portlarına yayınlar." },
        { say: "nginx için bu tek bir port: 80." },
        { say: "Burada sık yapılan bir yanılgı var: EXPOSE tek başına hiçbir portu açmaz. O sadece \"bu image şu portu kullanır\" diyen bir not." },
        { say: "Portu dışarı açan her zaman küçük p ya da büyük P'dir." },
        { say: "Bir de küçük bir ayrıntı: varsayılan protokol TCP. UDP bir port gerekiyorsa sonuna udp eklersin, örneği soldaki notlarda." },
        { say: "Şimdi gerçek hayatta dikkat etmen gerekenlere geçelim." },
      ],
    },
    // 6 · Gerçekte
    {
      lines: [
        { say: "-p 8080:80 yazdığında port, bilgisayarının bütün ağ arayüzlerinde açılır. Yani aynı ağdaki başka bir cihaz da ona ulaşabilir." },
        { say: "Bir veritabanını ya da yönetim panelini sadece kendine açmak istiyorsan, başına 127.0.0.1 ekle: -p 127.0.0.1:8080:80." },
        { say: "Linux sunucularda bir tuzak daha var. Docker yayınlanan portlar için kendi iptables kurallarını yazar, bu yüzden ufw gibi bir güvenlik duvarı onları durdurmayabilir." },
        { say: "O yüzden dışarı açılmaması gereken bir şeyi ya hiç yayınlama ya da 127.0.0.1'e bağla." },
        { say: "Dürüst olayım: bu sahnede tek bir localhost var ve rastgele portlar 32768'den başlıyor. Gerçekte Docker rastgele portu işletim sisteminin geçici port aralığından seçer." },
        { say: "Son bir müjde: container'lar birbirine port yayınlamadan, aynı network'te isimle de ulaşabilir; -p sadece host'tan erişim için. Bunu sonraki derste göreceğiz. Şimdi sonraki sayfada sıra sende." },
      ],
    },
    // 7 · Sen dene
    {
      lines: [
        { say: "Terminal hazır, şimdi kapıları sen açacaksın. Gerçek işten dört senaryo var: yanlış container portu, 8080'i kimin tuttuğunu bulmak, portu Docker'a seçtirmek ve bilinmeyen bir image'ın portunu bulmak." },
        { say: "Komutları kendin yaz; sahne her seferinde hangi kapının nereye açıldığını gösterecek." },
        { say: "Bir senaryoda image'ın hangi portu dinlediğini bilmeyeceksin. Hatırla: image'ı yapan genelde bunu EXPOSE ile yazar, docker inspect de image'ın ayarlarını gösterir." },
        { say: "Takılırsan curl ile localhost'taki portu dene, docker ps'te de PORTS sütununa bak. docker port ise tek bir container'ın portlarını listeler." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Kolay gelsin, kapılar seni bekliyor!" },
      ],
    },
  ],
};
