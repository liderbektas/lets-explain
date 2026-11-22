import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Sorun
    {
      lines: [
        { say: "Selam! Docker'a hoş geldin. Bu ilk derste tek bir soruya cevap arayacağız: container diye bir şeye neden ihtiyaç duyduk?" },
        { say: "Şöyle bir an düşün. Bir uygulama yazdın, kendi bilgisayarında tıkır tıkır çalışıyor. Sunucuya atıyorsun… ve çöküyor." },
        { say: "Kodu açıyorsun, bir sorun yok. Peki ne oldu? Sağdaki çizime bak: senin makinende Node 22 var, sunucuda Node 18. Kodun, 18'de olmayan bir özelliği kullanıyor." },
        { say: "Yani sorun kodda değil, ortamda. İşletim sistemi, dil sürümü, kütüphaneler, ayarlar… Her makine biraz farklı, ve bu farklar genelde en kötü anda, canlıda ortaya çıkıyor." },
        { say: "Yazılımcıların meşhur cümlesi de buradan geliyor: \"Ama benim bilgisayarımda çalışıyordu!\" Hadi sonraki sayfaya geçelim, bu derde nasıl çare bulunmuş bakalım." },
      ],
    },
    // 1 · Fikir
    {
      lines: [
        { say: "Çözüm aslında çok basit bir fikir: uygulamayı tek başına gönderme, ihtiyacı olan her şeyle birlikte gönder." },
        { say: "Node 22, kütüphaneler, hatta küçücük bir Linux dosya sistemi… Hepsi tek bir pakette. İşte bu pakete image diyoruz." },
        { say: "Bu image'ı çalıştırdığında ortaya çıkan canlı kopyaya da container diyoruz. Bu iki kelimeyi aklının bir köşesine yaz, kurs boyunca hep karşına çıkacaklar." },
        { say: "İşin güzel tarafı şu: ortam paketin içinde olduğu için, aynı image senin bilgisayarında da sunucuda da aynı şekilde çalışır. \"Bende çalışıyordu\" derdi biter." },
        { say: "Soldaki notlarda kendi makinende deneyebileceğin iki komut var, istersen sonra bakarsın. Şimdi geçelim; önce bu işin eski yoluna bir göz atalım." },
      ],
    },
    // 2 · VM
    {
      lines: [
        { say: "Container'lardan önce bu sorunun cevabı sanal makinelerdi. Kısaca VM diyoruz." },
        { say: "Mantığı şu: hypervisor denen bir yazılım, gerçek donanımın üstünde sahte bilgisayarlar yaratır. Çizimde görüyorsun, her VM'in içinde kendi tam işletim sistemi var." },
        { say: "Bu çok sağlam bir ayrım sağlar, o yüzden hâlâ kullanılıyor. Ama bedeli ağır: her VM gigabaytlarca yer tutar, kendi kernel'ini çalıştırır, açılması bazen dakikalar sürer." },
        { say: "Bir düşünsene: iki küçük uygulama çalıştırmak için iki koca işletim sistemi taşıyorsun." },
        { say: "Peki daha hafif bir yolu yok mu? Var. Sonraki sayfada." },
      ],
    },
    // 3 · Container (tahmin: ne paylaşılır?)
    {
      lines: [
        { say: "Şimdi aynı makinede iki VM yerine üç container çalıştırdığımızı düşün." },
        { say: "Sana bir soru: bu container'lar aralarında neyi paylaşıyor sence? Hiçbir şeyi mi, host'un kernel'ini mi, yoksa her şeyi mi? Cevabını seç, sonra birlikte bakalım." },
      ],
      answer: {
        right: "Evet, tam isabet!",
        wrong: "Yakın ama değil. Hemen göstereyim.",
        lines: [
          { say: "Container'lar host'un kernel'ini paylaşır. Sağdaki iki yığını karşılaştır: container tarafında misafir işletim sistemi katmanı yok." },
          { say: "Ama paylaşım kernel'de biter. Her container'ın kendi dosya sistemi, kendi süreçleri, kendi ağı var." },
          { say: "Bunu Linux kernel'inin iki özelliği sağlıyor. Namespace'ler her container'a kendi küçük dünyasını gösterir. Cgroup'lar da ne kadar işlemci ve bellek kullanabileceğini sınırlar." },
          { say: "Ben bunu hep apartmana benzetiyorum. VM'ler müstakil evler; her birinin kendi temeli, kendi tesisatı var. Container'lar bir apartmanın daireleri: bina ortak, ama her dairenin kendi kapısı, kendi kilidi var." },
          { say: "O yüzden container'lar megabaytlarla ölçülür ve saniyeler içinde açılır. Hadi şimdi bunu gerçekten çalışırken görelim." },
        ],
      },
    },
    // 4 · Üç container (tahmin: image kaç kez iner?) · sahne: run web-1, web-2, web-3
    {
      lines: [
        { say: "Sağda boş bir makine var. Üstünde Docker kurulu, ama henüz tek bir image bile yok." },
        { say: "Aynı nginx image'ından üç container başlatacağız. Sence image kaç kez indirilecek? Üç kez mi, bir kez mi, hiç mi?" },
      ],
      answer: {
        right: "Doğru bildin!",
        wrong: "Çoğu kişi böyle düşünür. Bakalım ne oluyor.",
        lines: [
          { say: "İlk container'ı başlatıyoruz. Bak, makinede image olmadığı için Docker onu önce indiriyor.", cue: 0 },
          { say: "İkincisi… Bu sefer indirme yok. Image zaten rafta duruyor.", cue: 1 },
          { say: "Ve üçüncüsü. Yine indirme yok.", cue: 2 },
          { say: "Yani image bir kez iner, container'lar onun üstünde çalışır. Şu an üç web sunucusu yan yana çalışıyor, yeşil ışıkları görüyorsun, ama rafta tek bir image var." },
          { say: "Bir de hıza dikkat et: container başlarken bir işletim sistemi açılmıyor, sadece bir süreç başlıyor. O yüzden saniyeler sürüyor. Sonraki sayfada bu container'ların birbirini ne kadar gördüğünü test edeceğiz." },
        ],
      },
    },
    // 5 · Yalıtım (tahmin: web-2 notu bulur mu?) · sahne: web-1'e yaz, web-2'de oku
    {
      lines: [
        { say: "Şimdi küçük bir deney. web-1 container'ının içine bir not dosyası yazacağız. Sonra aynı dosyayı web-2'nin içinde arayacağız." },
        { say: "İkisi de aynı image'dan geliyor. Sence web-2 o notu bulabilecek mi?" },
      ],
      answer: {
        right: "Aynen öyle!",
        wrong: "Mantıklı bir tahmin, ama değil. İzle.",
        lines: [
          { say: "web-1 notunu yazdı.", cue: 0 },
          { say: "Şimdi web-2'de aynı dosyayı okumaya çalışıyoruz… ve \"No such file or directory\". Böyle bir dosya yok.", cue: 1 },
          { say: "Neden? Çünkü image ortak ama salt okunur. Her container kendi yazılabilir katmanına yazar, komşusu o katmanı göremez." },
          { say: "Bu ayrım sadece dosyalar için değil, süreçler ve ağ için de geçerli. Bir container çökse ya da kendi dosyalarını dağıtsa bile diğerleri hiçbir şeyden etkilenmez." },
          { say: "Peki bir container'ı silersek ne olur? Ona da sonraki sayfada bakalım." },
        ],
      },
    },
    // 6 · Atılabilir (tahmin: not durur mu?) · sahne: rm web-1, run web-1, notu ara
    {
      lines: [
        { say: "Şimdi biraz acımasız olacağız. Notu yazdığımız web-1'i tamamen sileceğiz, sonra aynı isimle yeniden başlatacağız." },
        { say: "Sence içine yazdığımız not hâlâ orada olacak mı?" },
      ],
      answer: {
        right: "Doğru!",
        wrong: "Adı aynı olsa da değil. Bak.",
        lines: [
          { say: "web-1'i siliyoruz.", cue: 0 },
          { say: "Aynı isimle yeniden başlatıyoruz. Bu sefer de indirme yok, image hâlâ rafta.", cue: 1 },
          { say: "Ve notu arıyoruz… Yok. Not gitti.", cue: 2 },
          { say: "Çünkü yeni container, image'ın tertemiz halinden başlar. Eski container'ın yazılabilir katmanı, container'la birlikte silindi." },
          { say: "Bu bir hata değil, bir özellik. Container bozulursa silersin, yenisini açarsın. Ama o zaman şu soru geliyor: veritabanı gibi saklanması gereken veriler ne olacak? Onlar container'ın içinde değil, volume denen yerde durur. Bunu ileride, veri ve ağ bölümünde göreceğiz." },
          { say: "Sonraki sayfaya geçelim, bir de Mac ve Windows tarafına bakalım." },
        ],
      },
    },
    // 7 · Mac ve Windows
    {
      lines: [
        { say: "Bir şey dikkatini çekmiş olabilir. Container'lar host'un kernel'ini paylaşıyor dedik, ve neredeyse bütün image'lar Linux image'ı." },
        { say: "Ama Mac'in de Windows'un da kernel'i Linux değil. O zaman orada bu iş nasıl yürüyor?" },
        { say: "Cevap çizimde: Docker Desktop arka planda küçük bir Linux sanal makinesi çalıştırır. Container'lar aslında onun içinde döner." },
        { say: "Sen bunu pek fark etmezsin, docker komutları birebir aynı çalışır. Linux'ta ise arada böyle bir sanal makine yok; container'lar doğrudan makinenin üstünde." },
        { say: "Küçük bir not daha: Apple Silicon'lı bir Mac kullanıyorsan, sadece amd64 için yayınlanmış image'lar emülasyonla, yani daha yavaş çalışır. Neyse ki resmi image'ların çoğu iki mimari için de var." },
        { say: "Geçelim, son bir konu kaldı." },
      ],
    },
    // 8 · Hangisi?
    {
      lines: [
        { say: "Buraya kadar dinleyince \"VM'ler artık bitti\" diye düşünebilirsin. Ama öyle değil." },
        { say: "Farklı bir işletim sistemi ya da farklı bir kernel lazımsa, ya da birbirine hiç güvenmeyen müşterileri çok sıkı ayırman gerekiyorsa, VM hâlâ doğru araç." },
        { say: "Hatta gerçek hayatta ikisi çoğu zaman birlikte çalışır. Bulutta kiraladığın sunucu aslında bir VM'dir, sen de container'larını onun içinde çalıştırırsın." },
        { say: "Son bir dürüstlük notu: bu sahnede container'ı küçük bir program gibi çizdik. Gerçekte container, namespace'ler ve cgroup'larla çevrilmiş sıradan bir Linux sürecidir. Linux'ta onu ps komutuyla dışarıdan bile görebilirsin." },
        { say: "Anlatacaklarım bu kadar. Şimdi sıra sende; sonraki sayfaya geç." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Burası artık senin sahan. Aşağıda bir terminal var, ve gerçek işten alınmış dört senaryo seni bekliyor." },
        { say: "Komutları kendin yazacaksın. Her komutta sahne ne olduğunu gösterecek, o yüzden yazdıktan sonra bir sağa bak." },
        { say: "Takılırsan iki komut çok işine yarar: docker ps neyin çalıştığını gösterir, docker exec de bir container'ın içinde komut çalıştırır." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Hadi bakalım, kolay gelsin!" },
      ],
    },
  ],
};
