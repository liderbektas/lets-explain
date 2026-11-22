import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · İlk run · sahne: run hello-world
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste her gün yazacağın komutu, docker run'ı ve en çok kullanılan parametrelerini tek tek açacağız." },
        { say: "Sağdaki makinede Docker kurulu, rafta ekibin API image'ı duruyor, ama çalışan hiçbir şey yok. İlk denemeyi en küçük image'la yapalım: hello-world." },
        { say: "docker run hello-world diyoruz. Bak, bu image makinede yoktu; Docker onu önce Docker Hub'dan indirdi, sonra ondan bir container başlattı.", cue: 0 },
        { say: "Container bir mesaj yazdı ve kapandı, işi zaten buydu. Gri duruyor, yanında kapandı ve sıfır yazıyor. Sıfır, sorunsuz bitti demek." },
        { say: "Bunu bir tarif gibi düşün. Image tarif, container o tariften pişen yemek. Aynı tariften istediğin kadar yemek yaparsın, biri bozulsa da tarif yerinde durur." },
        { say: "Bu container'ın işi kısacıktı. Peki işi hiç bitmeyen bir şey çalıştırsak? Sonraki sayfada görelim." },
      ],
    },
    // 1 · -d --name · sahne: run -d --name web nginx
    {
      lines: [
        { say: "Şimdi işi hiç bitmeyen bir şey başlatalım: bir web sunucusu." },
        { say: "docker run -d --name web ile nginx'i başlatıyoruz. Bu sefer container kapanmıyor, yeşil ışık yanıyor.", cue: 0 },
        { say: "Çünkü bir sunucunun işi bitmez, sürekli istek bekler. Container da o yüzden çalışmaya devam ediyor." },
        { say: "-d, yani detached, terminalini sana geri verir; container arka planda çalışmayı sürdürür." },
        { say: "--name web ise ona okunabilir bir ad veriyor. Vermezsen Docker eager_turing gibi rastgele bir ad seçer, onu hatırlamak da sana kalır." },
        { say: "Sunucumuz ayakta. Ama ona dışarıdan ulaşabiliyor muyuz? Gel, sonraki sayfada deneyelim." },
      ],
    },
    // 2 · Port yok (tahmin: curl localhost:80?) · sahne: curl 80
    {
      lines: [
        { say: "nginx şu an container'ın içinde 80 portunu dinliyor." },
        { say: "Kendi bilgisayarından curl localhost:80 yaparsan ne olur sence? nginx sayfası mı gelir, bağlantı mı reddedilir, yoksa Docker portu kendiliğinden mi açar?" },
      ],
      answer: {
        right: "Çok iyi, doğru bildin!",
        wrong: "Çoğu kişi öyle bekler. Gel birlikte bakalım.",
        lines: [
          { say: "curl localhost:80 gönderiyoruz… ve bağlantı reddedildi.", cue: 0 },
          { say: "nginx çalışıyor, orada bir sorun yok. Ama container'ın kendi küçük ağı var, ve o ağla senin bilgisayarının portları arasında hiçbir bağ yok." },
          { say: "Yani içeride 80'i dinlemek, host'ta 80'in açık olduğu anlamına gelmez. Portu senin yayınlaman gerekiyor." },
          { say: "Bunun bir kapısı var tabii. Sonraki sayfada o kapıyı açıyoruz." },
        ],
      },
    },
    // 3 · -p · sahne: run web2 -p 8080:80, curl 8080
    {
      lines: [
        { say: "İşte o kapı: -p parametresi." },
        { say: "web2 adında yeni bir nginx başlatıyoruz, bu sefer -p 8080:80 ile. Container'ın altında localhost 8080'den 80'e giden bir etiket belirdi.", cue: 0 },
        { say: "Bu şu demek: senin bilgisayarının 8080 portuna gelen her şeyi container'ın 80 portuna ilet." },
        { say: "Şimdi curl localhost:8080 deniyoruz… ve nginx sayfası geldi.", cue: 1 },
        { say: "Sırayı aklında tut: önce host, sonra container. Soldaki senin bilgisayarın, sağdaki container'ın içi. Port eşlemeyi ileride kendi dersinde daha derin açacağız." },
        { say: "Peki ilk web container'ına da sonradan port vermek istesek? Sonraki sayfada deniyoruz." },
      ],
    },
    // 4 · İsim çakışması (tahmin: aynı adla ikinci web?) · sahne: run web -p (hata)
    {
      lines: [
        { say: "Elimizde hâlâ portsuz duran web container'ı var. Ona da bir port vermek istiyoruz." },
        { say: "Aynı web adıyla, bu sefer portlu yeni bir container başlatmayı deneyeceğiz. Ne olur sence? Yenisi eskisinin yerini mi alır, Docker mı reddeder, yoksa iki tane web mi olur?" },
      ],
      answer: {
        right: "Aynen öyle, süpersin!",
        wrong: "Güzel tahmin, ama Docker başka türlü düşünüyor. Bak.",
        lines: [
          { say: "Komutu gönderiyoruz… Docker reddetti: Conflict, web adı zaten kullanımda.", cue: 0 },
          { say: "Container adları tekildir. Bir ad, container çalışmıyor olsa bile onda kalır. Aynı adı yeniden kullanmak istersen önce eskisini docker rm -f web ile silersin." },
          { say: "Bir şey daha: çalışan bir container'a sonradan port eklenemez. Ayar değiştirmek demek, container'ı silip yeni ayarla baştan başlatmak demek." },
          { say: "Container'ları bu yüzden atılıp yeniden yaratılacak şeyler olarak düşünüyoruz." },
          { say: "Sonraki sayfada bir container'a dışarıdan ayar vermeyi göreceğiz." },
        ],
      },
    },
    // 5 · -e (tahmin: ayarsız api?) · sahne: run api, rm api, run api -e
    {
      lines: [
        { say: "Şimdi ekibin API'sine geçelim. acme/api çalışmak için DATABASE_URL adında bir ayara ihtiyaç duyuyor." },
        { say: "Onu vermeden başlatırsak ne olur? Çalışıp ayarı sonra mı okur, başlayıp hemen exit code 1 ile mi kapanır, yoksa Docker container'ı oluşturmayı mı reddeder?" },
      ],
      answer: {
        right: "Harika, tam isabet!",
        wrong: "Olabilirdi, ama değil. Birlikte izleyelim.",
        lines: [
          { say: "api'yi ayarsız başlatıyoruz. Container başladı ve hemen kırmızıya döndü: uygulama DATABASE_URL tanımlı değil diye hata yazıp 1 ile çıktı.", cue: 0 },
          { say: "Dikkat et, Docker ayarın gerekip gerekmediğini bilmez, container'ı seve seve başlatır. Ayarı arayıp bulamayınca kapanan, uygulamanın kendisi." },
          { say: "Kapanan container'ı siliyoruz.", cue: 1 },
          { say: "Ve bu sefer -e DATABASE_URL ile yeniden başlatıyoruz. Yeşil ışık, artık çalışıyor.", cue: 2 },
          { say: "Aynı image'ı farklı ortamlarda çalıştırmanın yolu bu: kod hep aynı, ayarlar -e ile dışarıdan gelir. Kapanan bir container'ın logları da durur, hatanın sebebini docker logs ile okursun." },
          { say: "Sonraki sayfada kendi kendini temizleyen bir container var." },
        ],
      },
    },
    // 6 · --rm (tahmin: iş bitince ne olur?) · sahne: run --rm hello-world
    {
      lines: [
        { say: "Baştaki hello container'ını hatırla. İşini bitirdi, ama kapanmış halde orada durmaya devam ediyor." },
        { say: "Şimdi aynı image'ı --rm ile, once adıyla çalıştıracağız. İşi bitince container'a ne olur sence? Kapanmış olarak mı durur, kendini mi siler, yoksa yeniden mi başlar?" },
      ],
      answer: {
        right: "Evet, doğru!",
        wrong: "Yaklaştın, ama değil. Bak ne oluyor.",
        lines: [
          { say: "once başlıyor, mesajını yazıyor, kapanıyor… ve hemen siliniyor. Sahnede ondan iz yok.", cue: 0 },
          { say: "--rm, bitince beni sil demek. Tek seferlik işlerde geride kapanmış container'ların yığılmasını önler." },
          { say: "Bir script, bir test ya da bir migration gibi kısa ömürlü işler için ideal." },
          { say: "Sırada veriyi container'ın dışında tutmak var. Geçelim." },
        ],
      },
    },
    // 7 · -v · sahne: run files -v site:..., index.html yaz
    {
      lines: [
        { say: "Son parametremiz -v. files adında bir nginx başlatacağız ve ona bir volume bağlayacağız." },
        { say: "-v ile site adında bir volume'u nginx'in html klasörüne bağlayarak başlatıyoruz. Sağda bir varil belirdi: volume açıldı ve container'ın içinde o klasöre bağlandı.", cue: 0 },
        { say: "Şimdi container o klasöre index.html yazıyor. Dosya volume'a, yani varilin içine gidiyor.", cue: 1 },
        { say: "Farkı şurada: container silinse de volume ve içindeki veri yerinde kalır." },
        { say: "Bunun neden bu kadar önemli olduğunu Veri ve ağ bölümünde göreceğiz. Şimdi bütün parçaları tek komutta birleştirelim, sonraki sayfaya geç." },
      ],
    },
    // 8 · Hepsi bir arada
    {
      lines: [
        { say: "Bu kadar parametreyi gördük, peki hepsini yan yana nasıl yazacağız? Sıra hep aynı: docker run, sonra seçenekler, sonra image, istersen en sonda da bir komut." },
        { say: "Seçenekler image adından önce gelir. Image'dan sonra yazdığın her şey, container'ın içinde çalışacak komut sayılır." },
        { say: "Yani docker run nginx -p 8080:80 yazarsan port açılmaz; o -p 8080:80, nginx'e komut olarak gider. Bu hata çok sık yapılır, aklında olsun." },
        { say: "Soldaki notlarda gerçek bir örnek var: arka planda, isimle, portu yayınlanmış, ayarı verilmiş ve çökerse yeniden başlayan bir API servisi." },
        { say: "Bir de dürüstlük notu: bu sahnede container'ların ne yaptığı küçük bir programla anlatılıyor ve zaman adım adım ilerliyor. Gerçek container'lar gerçek süreçlerdir, image çekmek de ağına göre saniyeler sürer." },
        { say: "Anlatacaklarım bu kadar. Sonraki sayfada klavye senin." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Sıra sende! Bu dizüstünde nginx 1.27 ve ekibin acme/api image'ı hazır. Aşağıdaki terminalde gerçek işten alınmış beş senaryo seni bekliyor." },
        { say: "Bir önizleme açmak, unutulan portu eklemek, kapanıp duran API'yi ayağa kaldırmak… Komutları kendin yazacaksın, sahne her komutta ne olduğunu gösterecek." },
        { say: "Takılırsan docker ps -a ve docker logs çok işine yarar: neyin çalıştığını ve bir şeyin neden kapandığını söylerler. Portu denemek için de curl localhost:8080 var." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Hadi, göster kendini!" },
      ],
    },
  ],
};
