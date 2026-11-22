import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Neden Compose?
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste Docker Compose'la tanışıyoruz: birden fazla container'ı tek bir dosyayla yönetmenin yolu." },
        { say: "Şöyle bir proje düşün: bir web sunucusu, bir API ve bir veritabanı. Her biri için ayrı bir docker run komutu yazman gerekiyor." },
        { say: "Portlar, ayarlar, volume'lar, ağ… Hepsi bir sürü bayrağa dağılıyor. Ekipten biri tek bir bayrağı unutsa, proje onun bilgisayarında çalışmıyor." },
        { say: "Compose bütün bunları tek bir dosyada toplar: compose.yaml. Bu dosya projeyle birlikte Git'e girer, herkes aynı komutla aynı ortamı kurar." },
        { say: "Yani tarif bir kere yazılıyor, herkes aynı tariften pişiriyor. Hadi sonraki sayfada ilk dosyamızı çalıştıralım." },
      ],
    },
    // 1 · İlk up (tahmin: up neler oluşturur?) · sahne: up, curl
    {
      lines: [
        { say: "Elimizde en küçük compose dosyası var: içinde tek bir servis, web. nginx image'ını kullanıyor ve 8080 portunu açıyor." },
        { say: "Şimdi docker compose up diyeceğiz, arka planda çalışsın diye de d bayrağıyla." },
        { say: "Sence bu komut neler oluşturur? Sadece bir container mı, bir container ve projeye özel bir ağ mı, yoksa image'ı da yeniden mi build eder?" },
      ],
      answer: {
        right: "Harika, doğru bildin!",
        wrong: "Olabilirdi, ama değil. Birlikte bakalım.",
        lines: [
          { say: "Komutu çalıştırıyoruz. Bak, Compose dosyayı okudu ve iki şey oluşturdu: shop_default adında bir ağ ve shop-web-1 adında bir container.", cue: 0 },
          { say: "Compose her projeye kendi ağını açar ve bütün servisleri ona bağlar. Buradaki shop proje adı; varsayılan olarak dosyanın durduğu klasörün adından gelir." },
          { say: "Container adı da hep aynı kalıbı izler: önce proje, sonra servis, sonra bir numara." },
          { say: "Şimdi curl ile 8080'e soruyoruz… ve nginx sayfası geldi. Dosyadaki ports satırı, docker run'daki p bayrağıyla aynı işi yapıyor.", cue: 1 },
          { say: "Tek servisle başladık, ama asıl güzellik birden fazla servis olunca çıkıyor. Sonraki sayfaya geçelim." },
        ],
      },
    },
    // 2 · ${DEĞİŞKEN} (tahmin: .env yokken ne olur?) · sahne: up, .env olmadan
    {
      lines: [
        { say: "Dosyaya ikinci bir servis ekledik: api. Bu sefer hazır bir image yok; build nokta diyor, yani image bu klasördeki Dockerfile'dan üretilecek." },
        { say: "api'nin bir de ayarı var: DATABASE_URL. Değeri dolar işaretli süslü parantezle yazılmış bir değişkenden geliyor. Ama ortada bir .env dosyası yok." },
        { say: "Şimdi up dersek ne olur sence? Compose durup dosyayı reddeder mi, değişken boş kalıp api ayarsız başlar ve kapanır mı, yoksa Compose kendisi bir değer mi uydurur?" },
      ],
      answer: {
        right: "Aynen öyle!",
        wrong: "Mantıklı bir tahmin, ama hayır. İzle.",
        lines: [
          { say: "up diyoruz. Compose önce api'nin image'ını Dockerfile'dan build ediyor, sonra container'ı başlatıyor… ve api kırmızıya dönüyor. Exit code 1.", cue: 0 },
          { say: "Logunda DATABASE_URL is not set yazıyor. Compose eksik değişken için sadece uyarır ve yerine boş bir metin koyar." },
          { say: "Ayarı gerçekten isteyen uygulamanın kendisi. Onu bulamayınca kapandı. Bu arada web'e hiç dokunulmadı, çalışmaya devam ediyor." },
          { say: "Peki bu değişkeni nereden dolduracağız? Cevap sonraki sayfada." },
        ],
      },
    },
    // 3 · .env · sahne: up, .env ile
    {
      lines: [
        { say: "compose.yaml'ın hemen yanına .env adında bir dosya koyduk. İçinde DATABASE_URL ve veritabanı şifresi var." },
        { say: "Tekrar up diyoruz. Compose değişkeni bu dosyadan dolduruyor, kapanmış api'yi yeniden yaratıyor, ve bu sefer api ayakta.", cue: 0 },
        { say: "Bu ayrım çok önemli. compose.yaml Git'e girer, ama .env girmez, çünkü içinde şifreler var. Her geliştirici ve her sunucu kendi .env dosyasını tutar." },
        { say: "O yüzden .env'i .gitignore'a eklemeyi unutma. Hangi değişkenlerin gerektiğini anlatmak için şifresiz bir .env.example commit'leyebilirsin." },
        { say: "Bir de ipucu: docker compose config komutu dosyanın değişkenler doldurulmuş halini gösterir. .env işe yarıyor mu, oradan anlarsın. Şimdi geçelim, sırada veritabanı var." },
      ],
    },
    // 4 · volumes, depends_on · sahne: up, tam dosya
    {
      lines: [
        { say: "Üçüncü servis geliyor: db, yani Postgres. Veritabanı dosyalarını container'ın içinde değil, pgdata adında bir volume'da tutacak." },
        { say: "Dosyada iki yerde volume görüyorsun. Servisin altındaki satır volume'u bağlıyor, dosyanın en altındaki volumes bölümü de onu tanımlıyor." },
        { say: "Bir de depends_on ekledik: api db'ye, web de api'ye bağlı." },
        { say: "Şimdi up diyoruz. Docker volume'u shop_pgdata adıyla yarattı, ve olaylarda sırayı görüyorsun: önce db, sonra api, en son web.", cue: 0 },
        { say: "Ama dikkat: depends_on sadece başlatma sırasını belirler. db'nin gerçekten hazır olmasını beklemez. Bu küçük tuzağı bir sonraki derste çözeceğiz." },
        { say: "Şimdi bu servislerin birbirini nasıl bulduğuna bakalım. Sonraki sayfaya geç." },
      ],
    },
    // 5 · İsimle erişim (tahmin: web db'ye adıyla ulaşır mı?) · sahne: exec web ping db
    {
      lines: [
        { say: "Üç servisimiz de ayakta. Peki bunlar birbirini nasıl buluyor?" },
        { say: "Şimdi web container'ının içinden db adına ulaşmayı deneyeceğiz. Sence bu işe yarar mı?" },
        { say: "Seçenekler şöyle: hayır, IP adresi gerekir; evet, servis adı ağda bir adrestir; ya da sadece db portunu dışarı açarsa. Sen hangisini seçerdin?" },
      ],
      answer: {
        right: "Tam isabet!",
        wrong: "Çoğu kişi öyle düşünür. Bak ne oluyor.",
        lines: [
          { say: "web'in içinde ping db çalıştırıyoruz… ve cevap geldi. db adı çözüldü.", cue: 0 },
          { say: "Compose bütün servisleri aynı proje ağına koyar ve her servisin adını o ağda bir bilgisayar adı gibi çözülebilir yapar. DATABASE_URL'de db yazmamızın sebebi de bu." },
          { say: "Dikkat et, db'nin 5432 portunu dışarıya hiç açmadık. Gerek de yok: diğer servisler ağın içinden ulaşıyor. Port yayınlamak sadece host'tan erişmek için lazım, ve veritabanını host'a açmamak daha güvenli." },
          { say: "Küçük bir dürüstlük notu: gerçek nginx image'ında ping yok. Kendi makinende aynı şeyi getent hosts db ile görürsün. Şimdi geçelim, işi bitirip her şeyi kapatacağız." },
        ],
      },
    },
    // 6 · down (tahmin: volume'a ne olur?) · sahne: down
    {
      lines: [
        { say: "Gün bitti, her şeyi kapatma zamanı. Bunun için docker compose down var." },
        { say: "Sorum şu: down'dan sonra pgdata volume'una ne olur? Container'larla birlikte silinir mi, kalır mı, yoksa bir container'ın içine mi taşınır?" },
      ],
      answer: {
        right: "Doğru!",
        wrong: "Yakındı, ama değil. Şimdi göstereyim.",
        lines: [
          { say: "down diyoruz. Üç container duruyor ve siliniyor, shop_default ağı da kalkıyor.", cue: 0 },
          { say: "Ama sağa bak: shop_pgdata volume'u yerinde duruyor. Veritabanının dosyaları onun içinde." },
          { say: "down container'ları ve proje ağını siler, named volume'lara dokunmaz. Volume'ları da silmek istersen down komutuna v bayrağını eklersin; ama o zaman veritabanı sıfırlanır, dikkatli kullan." },
          { say: "Peki tekrar açınca ne olacak? Sonraki sayfada görelim." },
        ],
      },
    },
    // 7 · Tekrar up · sahne: up
    {
      lines: [
        { say: "Aynı dosyayla bir kez daha up diyoruz. Bütün container'lar sıfırdan yaratılıyor.", cue: 0 },
        { say: "Ama db'nin loguna bak: existing data found yazıyor. Yeni container aynı volume'a bağlandı ve eski veriyi buldu." },
        { say: "Container'lar yepyeni, veri eski. Compose'un rahatlığı tam da bu: ortamı istediğin kadar kurup yıkarsın, önemli veri volume'da güvende kalır." },
        { say: "Sonraki sayfada her gün kullanacağın komutları toparlayalım." },
      ],
    },
    // 8 · Gerçekte
    {
      lines: [
        { say: "Gerçek hayatta en sık yapacağın şey kod değiştirmek. O zaman docker compose up komutuna build bayrağını eklersin; image'lar yeniden build edilir, değişen servisler yeniden yaratılır." },
        { say: "Sadece build etmek istersen docker compose build var. Bütün servislerin çıktısını birlikte, canlı izlemek için de docker compose logs, f bayrağıyla." },
        { say: "Eski projelerde dosya adı docker-compose.yml olabilir, o da çalışır. En üstte bir version satırı görürsen artık gerekmiyor, silebilirsin." },
        { say: "Son bir not: bu sahnede up, zaten çalışan bir servisi olduğu gibi bırakıyor. Gerçek Compose ise ayarı değişen servisi yeniden yaratır, değişmeyene dokunmaz." },
        { say: "Anlatacaklarım bu kadar. Şimdi sıra sende; sonraki sayfaya geç." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Burası senin sahan. Klasörde shop projesi hazır: web, api ve db'li bir compose.yaml, bir Dockerfile ve bir .env dosyası." },
        { say: "Aşağıdaki terminalde gerçek işten alınmış beş senaryo seni bekliyor. Komutları kendin yazacaksın, dosyaları da nano ile düzenleyeceksin. Her komuttan sonra sağa bak, sahne ne olduğunu gösterecek." },
        { say: "Takılırsan iki komut çok işine yarar: docker compose ps neyin çalıştığını gösterir, docker compose logs da bir servisin neden kapandığını söyler." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız senin. Haydi, kolay gelsin!" },
      ],
    },
  ],
};
