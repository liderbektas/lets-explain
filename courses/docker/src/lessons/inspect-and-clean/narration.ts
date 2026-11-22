import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · docker ps
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste makinende neler olup bittiğini okumayı, sonra da biriken her şeyi güvenle temizlemeyi öğreneceğiz." },
        { say: "Şöyle düşün: birkaç gündür bu makinede çalışıyorsun. Container'lar açıldı, kapandı, image'lar build edildi. Artık ortalığa bir bakma zamanı." },
        { say: "Sahnede solda bir terminal, sağda da makinenin özeti var: container'lar ve image'lar. Terminalde docker ps çalıştı." },
        { say: "Listede sadece web görünüyor, çünkü docker ps yalnızca şu an çalışan container'ları gösterir. Her satırda kimliği, image'ı, durumu, portları ve adı var." },
        { say: "Peki çalışmayan container'lar ne oluyor? Sonraki sayfada bakalım." },
      ],
    },
    // 1 · docker ps -a (tahmin: kaç container?)
    {
      lines: [
        { say: "docker ps bize sadece web'i gösterdi. Şimdi aynı komutu -a ile, yani all ile çalıştıracağız." },
        { say: "Sağdaki özete bir göz at. Sence docker ps -a kaç container listeler? Bir mi, üç mü, yoksa sıfır mı?" },
      ],
      answer: {
        right: "Gözün keskinmiş, doğru!",
        wrong: "Sorun değil, hemen bakalım.",
        lines: [
          { say: "docker ps -a üç container gösteriyor: web, hello ve broken. -a, kapanmış ve hiç başlamamış container'ları da listeler." },
          { say: "hello işini bitirip sıfırla kapanmış, yani her şey yolunda. broken ise 1 ile kapanmış: bir şeyler ters gitmiş." },
          { say: "Kapanmış container'lar sen silene kadar diskte durur. O yüzden bir container kayboldu sandığında ilk bakacağın yer docker ps -a." },
          { say: "broken'a birazdan döneceğiz. Önce image'lara bakalım, sonraki sayfaya geç." },
        ],
      },
    },
    // 2 · docker images
    {
      lines: [
        { say: "Sıra image'larda. docker images bu makinedeki her image'ı boyutuyla birlikte listeler." },
        { say: "Terminale bak, bir satır dikkat çekiyor: adının ve etiketinin yerinde sadece none yazıyor." },
        { say: "Buna dangling, yani sahipsiz image diyoruz. acme/site:dev'i yeniden build ettiğinde etiket yeni image'a geçti, eskisi etiketsiz ortada kaldı." },
        { say: "Onu kimse kullanmıyor, ama diskte yer kaplamaya devam ediyor. Temizlik kısmında ona döneceğiz." },
        { say: "Şimdi kapanmış duran broken'a dönelim. Neden kapandığını sonraki sayfada öğreniyoruz." },
      ],
    },
    // 3 · docker logs (tahmin: kapanmış container'ın logu?)
    {
      lines: [
        { say: "broken, 1 ile kapanmış durumda. Neden kapandığını öğrenmek istiyoruz." },
        { say: "Aklımıza gelen ilk komut docker logs broken. Ama container kapanmış. Sence bu komut çalışır mı? Kapanmış container'ın logu olmaz mı, loglar silinene kadar durur mu, yoksa sadece -f ile mi görürüz?" },
      ],
      answer: {
        right: "Aynen öyle, süpersin!",
        wrong: "Çoğu kişi böyle sanıyor. Bak.",
        lines: [
          { say: "Çalışır. Docker, container'ın ana sürecinin yazdığı her şeyi container'la birlikte saklar; container silinene kadar loglar orada durur." },
          { say: "Ve cevap terminalde: disk dolu, rapor dosyası yazılamamış. Exit code 1'in sebebi bu." },
          { say: "Kapanmış bir container'ın neden kapandığını öğrenmenin en hızlı yolu budur." },
          { say: "Küçük ama önemli bir ayrıntı: container'daki uygulama loglarını bir dosyaya değil ekrana, yani stdout ve stderr'e yazmalı. Docker'ın topladığı o." },
          { say: "Şimdi çalışan bir container'ın içine girelim. Sonraki sayfada." },
        ],
      },
    },
    // 4 · exec -it · sahne: web'de whoami, env
    {
      lines: [
        { say: "docker exec -it web sh, çalışan web container'ının içinde bir kabuk açıyor. Artık komutlarını container'ın içinde yazıyorsun." },
        { say: "İlk olarak whoami yazıyoruz. Cevap root.", cue: 0 },
        { say: "Sonra env. Container'ın ortam değişkenleri ekrana döküldü.", cue: 1 },
        { say: "-i girişi açık tutar, -t sana bir terminal verir; ikisi birlikte etkileşimli kabuk demek. exit yazıp çıkarsın, container çalışmaya devam eder." },
        { say: "Bir uyarı: içeride yaptığın değişiklikler container'ın kendi katmanında kalır ve container yeniden yaratılınca gider. Kalıcı bir düzeltme istiyorsan onu Dockerfile'a yaz." },
        { say: "İçini gördük. Şimdi ayarlarına ve kaynak kullanımına bakalım, geçelim." },
      ],
    },
    // 5 · inspect · stats
    {
      lines: [
        { say: "Bir container hakkında her şeyi bilmek istersen docker inspect var. docker inspect web, container'ın bütün ayarlarını JSON olarak döker." },
        { say: "Durum, exit code, çalışan komut, ortam değişkenleri, portlar, mount'lar… Terminalde öne çıkan alanları görüyorsun." },
        { say: "Altında docker stats var. Çalışan container'ların işlemci ve bellek kullanımını canlı gösterir." },
        { say: "Bir ayrıntı: container'a bir bellek sınırı koymadıysan, LIMIT sütununda makinenin bütün belleği yazar." },
        { say: "Okuma kısmı bitti. Şimdi temizliğe başlıyoruz, sonraki sayfaya geç." },
      ],
    },
    // 6 · rmi (tahmin: kullanılan image silinir mi?) · sahne: rmi nginx:1.27 (hata)
    {
      lines: [
        { say: "Temizliğe image'lardan başlayalım. web, nginx 1.27 image'ından çalışıyor." },
        { say: "docker rmi nginx 1.27 dersek ne olur sence? Image silinip web çalışmaya devam mı eder, Docker mı reddeder, yoksa web de mi gider?" },
      ],
      answer: {
        right: "Tam isabet!",
        wrong: "Mantıklı, ama Docker daha temkinli. İzle.",
        lines: [
          { say: "Komutu çalıştırıyoruz… ve Docker reddetti: bir container bu image'ı kullanıyor.", cue: 0 },
          { say: "Bir container, çalışıyor olsun ya da kapanmış, bir image'ı kullandığı sürece Docker o image'ı silmez." },
          { say: "Yani sıra hep aynı: önce container gider, sonra image. Önce docker rm -f web, ardından docker rmi." },
          { say: "Sonraki sayfada container'ları tek tek ele alalım." },
        ],
      },
    },
    // 7 · stop · start · rm · sahne: stop web, start web, rm hello
    {
      lines: [
        { say: "Şimdi container'ları tek tek yöneten üç komut göreceğiz." },
        { say: "Önce web'i docker stop ile durduruyoruz.", cue: 0 },
        { say: "Sonra docker start ile yeniden başlatıyoruz. web tekrar çalışıyor.", cue: 1 },
        { say: "Son olarak işi çoktan bitmiş hello'yu docker rm ile siliyoruz.", cue: 2 },
        { say: "Tek bir container'la uğraşırken bu komutlar yeter. Üstelik neyi sildiğini tam olarak bilirsin." },
        { say: "Ama bazen biriken her şeyi tek hamlede temizlemek istersin. Onun da bir yolu var, sonraki sayfada." },
      ],
    },
    // 8 · prune (tahmin: çalışan web'e ne olur?) · sahne: system prune
    {
      lines: [
        { say: "Şimdi toplu temizliğin komutu: docker system prune. Kullanılmayan şeyleri tek hamlede süpürür." },
        { say: "Ama makinede çalışan bir web var. Sence prune çalışınca web'e ne olur? Silinir mi, durdurulur mu, yoksa ona hiç dokunulmaz mı?" },
      ],
      answer: {
        right: "Evet, bildin!",
        wrong: "Endişelenmekte haklısın, ama değil. Bak.",
        lines: [
          { say: "prune'u çalıştırıyoruz. broken silindi, sahipsiz none image'ı da gitti.", cue: 0 },
          { say: "web ise çalışmaya devam ediyor. Prune sadece kullanılmayanları siler, çalışan bir container ise kullanımdadır." },
          { say: "acme/old 0.1 de yerinde duruyor, çünkü bir etiketi var. Kullanılmayan bütün image'ları silmek istersen -a eklersin." },
          { say: "Volume'lara da dokunmaz, yani veritabanı verilerin güvende. --volumes eklersen kullanılmayan anonim volume'lar da gider; adlı volume'ları silmek ise bilinçli bir iş, onun için docker volume prune -a var." },
          { say: "Ve bir uyarı: prune durmuş her container'ı siler. Bir container'ı sonra bakarım diye durdurduysan onu da götürür. Sonraki sayfaya geçelim." },
        ],
      },
    },
    // 9 · Gerçekte
    {
      lines: [
        { say: "Bir gün disk dolar ve kendine sorarsın: bu yer nereye gitti?" },
        { say: "Cevap için docker system df var. Docker'ın ne kadar yer kapladığını türe göre özetler: image'lar, container'lar, volume'lar ve build cache." },
        { say: "Temizliğe başlamadan önce buraya bak. Geliştirme makinesinde en çok yeri genelde eski image'lar ve build cache tutar; sadece cache'i temizlemek istersen docker builder prune var." },
        { say: "Bir dürüstlük notu: bu sahnede terminal çıktıları modelden üretiliyor ve sütunlar kısaltıldı. Gerçek docker ps daha çok sütun gösterir, docker stats da işlemciyi gerçekten ölçer." },
        { say: "Anlatacaklarım bu kadar. Sonraki sayfada temizlik senin elinde." },
      ],
    },
    // 10 · Sen dene
    {
      lines: [
        { say: "Sıra sende! Bu makinede birkaç günlük iş birikmiş: çalışan web, kapanmış hello ve broken, kullanılmayan ve sahipsiz image'lar." },
        { say: "Aşağıdaki terminalde dört senaryo var: yer açmak, sadece sahipsizleri silmek, bir servisi taşımak ve bir temizlik tuzağından kaçmak. Komutları kendin yazacaksın." },
        { say: "Sahnedeki pencere sürekli docker ps -a gösteriyor, sağdaki özet de container'ları ve image'ları. Bir şeyi silmeden önce docker ps -a ve docker images ile mutlaka bak." },
        { say: "İpuçları adım adım açılıyor. Az komutla bitirirsen üç yıldız. Hadi, temizliğe başla!" },
      ],
    },
  ],
};
