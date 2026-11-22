import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Container'a yaz · sahne: run app, notu yaz
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste verinin peşine düşeceğiz: container'ın içine yazdığın bir dosya nerede durur, ve onu nasıl kaybetmezsin?" },
        { say: "Önce app adında bir nginx container'ı başlatıyoruz.", cue: 0 },
        { say: "Şimdi içine, data klasörüne, notes.txt diye küçük bir not yazıyoruz.", cue: 1 },
        { say: "Dosya şu an orada, container da çalışıyor. Peki bu not tam olarak nereye gitti?" },
        { say: "Hatırla, image salt okunur. Container'ın içinde yazdığın her şey, o container'a ait ince bir yazılabilir katmana gider. Bu katman sadece onundur." },
        { say: "Bu katmanın neden önemli olduğunu sonraki sayfada göstereyim." },
      ],
    },
    // 1 · Sil, yeniden başlat (tahmin: not yeni container'da mı?) · sahne: rm app, run app, notu oku
    {
      lines: [
        { say: "Şimdi app'i silip aynı image'dan yepyeni bir app başlatacağız. İsim aynı, image aynı." },
        { say: "Sence notes.txt yeni container'da olacak mı? Aynı image'dan başladığı için orada mı, eski container'la birlikte mi gitti, yoksa Docker onu bir yere yedekleyip geri mi getirecek?" },
      ],
      answer: {
        right: "Evet, aynen öyle!",
        wrong: "Çok mantıklı bir tahmin, ama değil. Bak.",
        lines: [
          { say: "Önce app'i siliyoruz, çalışıyor olsa da zorla.", cue: 0 },
          { say: "Aynı image'dan yeni bir app başlatıyoruz.", cue: 1 },
          { say: "Ve içindeki notu okumaya çalışıyoruz… \"No such file or directory\". Not yok.", cue: 2 },
          { say: "Çünkü not, eski container'ın yazılabilir katmanındaydı. Container silinince katman da silindi; yeni container image'ın tertemiz haliyle başladı." },
          { say: "Bu bir hata değil, tasarım. Container'lar geçici düşünülür; istediğin an silip yenisini açabilmelisin. O zaman saklanacak veri container'ın dışında durmalı. Nerede mi? Sonraki sayfada." },
        ],
      },
    },
    // 2 · Named volume · sahne: rm app, volume create, run app -v, notu yaz
    {
      lines: [
        { say: "Container'ın dışında duran o yerin adı volume. Hadi bir tane kuralım, ama önce elimizdeki app'i kaldırıyoruz.", cue: 0 },
        { say: "docker volume create ile notes-data adında bir volume oluşturuyoruz. Sağda bir varil belirdi, işte o.", cue: 1 },
        { say: "Şimdi yeni bir app başlatıyoruz ve bu volume'u container'ın içindeki data klasörüne bağlıyoruz. Artık oradaki data klasörü aslında o varil.", cue: 2 },
        { say: "Notu tekrar yazıyoruz. Olay listesine bak: bu sefer container'ın katmanına değil, notes-data volume'una yazıldı.", cue: 3 },
        { say: "Dosya aynı yolda, aynı isimde; değişen tek şey nerede durduğu. Bunun ne fark yarattığını görmek için sonraki sayfaya geçelim." },
      ],
    },
    // 3 · Volume yaşar (tahmin: not orada mı?) · sahne: rm app, run app -v, notu oku
    {
      lines: [
        { say: "Aynı deneyi tekrarlayacağız, tek bir farkla. app'i yine sileceğiz, ama yeni app'i aynı notes-data volume'uyla başlatacağız." },
        { say: "Sence not bu sefer orada olacak mı? Evet mi, hayır mı, yoksa sadece ilk satırı mı?" },
      ],
      answer: {
        right: "Bingo, doğru bildin!",
        wrong: "Olmadı, ama hiç dert değil. İzle.",
        lines: [
          { say: "app'i siliyoruz. Varile dikkat et, yerinde duruyor.", cue: 0 },
          { say: "Yeni app'i aynı volume'u bağlayarak başlatıyoruz.", cue: 1 },
          { say: "Ve notu okuyoruz… \"ilk not\". Oradaymış!", cue: 2 },
          { say: "Çünkü volume container'dan bağımsız yaşar. Container silinir, volume ve içindeki veri kalır. Yeni container aynı volume'u bağlayınca veriyi görür." },
          { say: "Bir image'ı güncellemek de tam böyle olur: eski container'ı silersin, yenisini yeni image'la ama aynı volume'la başlatırsın. Şimdi başka bir bağlama yoluna geçelim." },
        ],
      },
    },
    // 4 · Bind mount · sahne: run web (bind mount, 8080), curl
    {
      lines: [
        { say: "Volume, Docker'ın senin için sakladığı bir alan. Ama bazen container'a doğrudan kendi bilgisayarındaki bir klasörü açmak istersin." },
        { say: "Diyelim ki bilgisayarında, ada'nın site klasöründe bir index.html var. İçinde \"Merhaba v1\" yazıyor." },
        { say: "web adında bir nginx başlatıyoruz. Bu klasörü nginx'in sayfa klasörü olarak içeri açıyoruz, dışarıdan da 8080 portuyla ulaşılsın istiyoruz.", cue: 0 },
        { say: "curl ile localhost 8080'e soruyoruz… \"Merhaba v1\". Host'taki dosyanın içeriği geldi.", cue: 1 },
        { say: "Buna bind mount diyoruz. Ayırt etmesi kolay: kaynak, eğik çizgi ya da nokta eğik çizgi gibi bir yolla başlıyorsa bind mount; notes-data gibi düz bir adsa named volume." },
        { say: "Peki dosyayı host'ta değiştirirsek ne olur? Sonraki sayfa tam bunun için." },
      ],
    },
    // 5 · Canlı düzenle (tahmin: curl ne getirir?) · sahne: host'ta dosyayı değiştir, curl
    {
      lines: [
        { say: "Şimdi web container'ına hiç dokunmadan, host'taki index.html'i açıp \"Merhaba v2\" yapacağız. Yeniden başlatma yok, build yok." },
        { say: "Sence curl ne getirir? Hâlâ \"Merhaba v1\" mi, \"Merhaba v2\" mi, yoksa dosya değişince container durur mu?" },
      ],
      answer: {
        right: "Süper, tam olarak bu!",
        wrong: "Yaklaştın, ama sonuç farklı. Bakalım.",
        lines: [
          { say: "Host'taki dosyayı değiştiriyoruz: \"Merhaba v2\".", cue: 0 },
          { say: "Ve curl atıyoruz… \"Merhaba v2\". Değişiklik anında içeride.", cue: 1 },
          { say: "Çünkü bind mount bir kopya değil. Container, host'taki dosyanın kendisine bakıyor; iki taraf aynı dosyayı görüyor." },
          { say: "Geliştirme sırasında bu yüzden çok sevilir: kodu editörde değiştirirsin, container anında görür." },
          { say: "Ama üretimde kod image'ın içinde olmalı, yoksa sunucunun klasör düzenine bağımlı kalırsın. Şimdi işin ciddi kısmına, veritabanlarına geçelim." },
        ],
      },
    },
    // 6 · Volume'suz DB · sahne: run db, rm db, run db, bekle
    {
      lines: [
        { say: "Volume'ların en çok hayat kurtardığı yer veritabanları. postgres 17'yi hiç volume vermeden başlatıyoruz; log, yeni ve boş bir veritabanı kurduğunu söylüyor.", cue: 0 },
        { say: "Container'ı siliyoruz.", cue: 1 },
        { say: "Ve yeniden başlatıyoruz. Loga bak: yine yeni, boş bir veritabanı. Bütün tablolar gitti.", cue: 2 },
        { say: "Postgres'in açılışını tamamlamasını bekleyelim. Bu arada sağa bir bak: iki tane anonim volume var.", cue: 3 },
        { say: "Postgres image'ı veri klasörünü volume olarak tanımlar; sen ad vermezsen Docker rastgele adlı bir volume açar. Eski veri aslında o varilde duruyor, ama yeni container onu bulamıyor, çünkü adı yok." },
        { say: "En sinsi tarafı şu: container silinene kadar her şey yolunda görünür. O yüzden veritabanına her zaman named volume ver. Nasıl mı? Sonraki sayfada." },
      ],
    },
    // 7 · pgdata (tahmin: DB nasıl başlar?) · sahne: rm db, run db -v pgdata, rm db, run db -v pgdata, bekle
    {
      lines: [
        { say: "Şimdi postgres'i pgdata adında bir named volume ile, veri klasörüne bağlayarak başlatacağız. Sonra silip aynı volume'la yeniden açacağız." },
        { say: "Sence veritabanı ikinci seferde nasıl başlar? Yine boş mu, eski veriyi bularak mı, yoksa hata vererek mi?" },
      ],
      answer: {
        right: "Harika, doğru cevap!",
        wrong: "Bu sefer olmadı, ama birazdan netleşecek.",
        lines: [
          { say: "Önce eski db'yi kaldırıyoruz.", cue: 0 },
          { say: "Postgres'i pgdata volume'uyla başlatıyoruz. İlk açılış olduğu için boş bir veritabanı kuruyor, ama verisi artık isimli bir varile gidiyor.", cue: 1 },
          { say: "db'yi siliyoruz. pgdata ise yerinde duruyor.", cue: 2 },
          { say: "Aynı volume'la yeniden başlatıyoruz. Loga bak: \"existing data found\". Postgres eski veriyi buldu, kaldığı yerden devam ediyor.", cue: 3 },
          { say: "Açılışın bitmesini bekliyoruz. Veri pgdata'da duruyor, container'lar gelip geçiyor.", cue: 4 },
          { say: "Bir ipucu: hedef klasör image'a göre değişir; postgres, MySQL ve Redis verilerini farklı yerlerde tutar, image'ın Docker Hub sayfası bunu yazar. Son olarak volume'ları yönetmeye bakalım." },
        ],
      },
    },
    // 8 · Gerçekte
    {
      lines: [
        { say: "Şimdiye kadar hep kısa yazımı, yani -v'yi kullandık. Aynı işi --mount ile de yapabilirsin; orada type, source, target, readonly gibi her parça adıyla yazılır." },
        { say: "Docker'ın belgeleri yeni işlerde --mount'u önerir, çünkü daha okunaklıdır ve yanlış yazımı sessizce geçmez." },
        { say: "Silme tarafında iki kural var. Bir: bir volume'u, onu kullanan container varken silemezsin. İki: docker volume prune, Docker 23'ten beri sadece kullanılmayan anonim volume'ları siler; isimliler için -a gerekir." },
        { say: "Ve unutma, silinen bir volume'un verisi geri gelmez." },
        { say: "Bir dürüstlük notu: burada dosyalar tek satırlık metin, yazma da anında oluyor. Mac ve Windows'taki Docker Desktop'ta volume'lar küçük bir Linux sanal makinesinde durur; bind mount'lar oraya aktarıldığı için büyük klasörlerde yavaş olabilir." },
        { say: "Anlatacaklarım bu kadar. Hazırsan sonraki sayfada sıra sende." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Şimdi terminal senin. Aşağıda gerçek işten beş senaryo var: container'ı yenilerken notları korumak, postgres verisini kalıcı yapmak, bir klasörü canlı göstermek, kullanımdaki bir volume'u silmek ve isimsiz volume yığınını temizlemek." },
        { say: "Komutları kendin yazacaksın. Sahne her seferinde verinin nerede durduğunu gösterecek: container'ın katmanında mı, bir varilde mi, yoksa host'ta mı." },
        { say: "İki komut çok işine yarar: docker volume ls volume'ları listeler, docker exec ile cat de bir container'ın içindeki dosyayı gösterir." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız seni bekliyor. Hadi bakalım, verini koru!" },
      ],
    },
  ],
};
