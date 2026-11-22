import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Layer'lar · sahne: ilk build (önce COPY . ., sonra npm ci)
    {
      lines: [
        { say: "Tekrar merhaba! Bu derste Docker'ın build sırasında nasıl zaman kazandığını göreceğiz: layer'lar ve build cache." },
        { say: "Elimizde bir Node projesi ve basit bir Dockerfile var. Önce bütün klasörü kopyalıyor, sonra npm ci ile bağımlılıkları kuruyor." },
        { say: "İlk build'i başlatıyoruz. Bu ilk sefer, her satır tek tek çalışıyor. En uzunu npm ci, tek başına 30 saniye.", cue: 0 },
        { say: "Sağdaki yığına bak: her RUN ve COPY satırı oraya bir layer ekledi. Image dediğimiz şey aslında bu layer'ların üst üste dizilmiş hali." },
        { say: "Kendi makinende docker history ile bir image'ın layer'larını, hangi satırdan geldiklerini ve boyutlarını görebilirsin." },
        { say: "Layer'lar değişmez. Bir kez oluşunca aynen saklanır, hatta başka image'larla paylaşılabilir. Bu bilgi az sonra çok işimize yarayacak, sonraki sayfaya geçelim." },
      ],
    },
    // 1 · Cache (tahmin: tekrar build ne olur?) · sahne: aynı build
    {
      lines: [
        { say: "Şimdi hiçbir şeye dokunmuyoruz. Ne kod değişti, ne Dockerfile." },
        { say: "Aynı Dockerfile'ı bir kez daha build edersek ne olur sence? Yine 30 saniyeden uzun mu sürer, neredeyse anında mı biter, yoksa Docker image zaten var diye hata mı verir?" },
      ],
      answer: {
        right: "Evet, doğru bildin!",
        wrong: "Hiç sorun değil, birlikte bakalım.",
        lines: [
          { say: "Build'i tekrar başlatıyoruz. Bak, her satırın yanında CACHED yazıyor. Toplam süre sıfır saniye.", cue: 0 },
          { say: "Docker her satır için bir anahtar hesaplar: önceki layer, satırın kendisi, bir de kopyalanan dosyaların içeriği." },
          { say: "Anahtar aynıysa Docker şöyle der: bu satırı bu girdilerle zaten yaptım. Ve eski layer'ı alıp yoluna devam eder." },
          { say: "Hiçbir şey değişmediyse iş de yok. Peki tek bir satır kod değişirse? Sonraki sayfada görelim." },
        ],
      },
    },
    // 2 · Kötü sıra (tahmin: ne yeniden çalışır?) · sahne: server.js değişti, build
    {
      lines: [
        { say: "Şimdi server.js'te tek bir satırı değiştirdik. Dockerfile aynı: önce bütün klasörü kopyalayan COPY satırı, sonra npm ci." },
        { say: "Sence hangi adımlar yeniden çalışır? Sadece o kopyalama satırı mı, kopyalama ve ondan sonraki her şey mi, yoksa FROM dahil her şey mi?" },
      ],
      answer: {
        right: "Aynen öyle, çok iyi!",
        wrong: "Çoğu kişi böyle düşünüyor. Hemen bakalım.",
        lines: [
          { say: "Build'i başlatıyoruz. Üstteki satırlar cache'ten geldi, ama kopyalama satırı yeniden çalıştı. Ardından npm ci de… yine 30 saniye.", cue: 0 },
          { say: "Neden? Kopyalama satırının girdisi dosyaların içeriği, ve server.js değişti. Cache kaçtı." },
          { say: "Bir satır cache'ten kaçınca ondan sonraki her satır da yeniden çalışır, çünkü hepsi bu yeni layer'ın üstüne kuruluyor. Bağımlılıklar değişmedi ama Docker bunu bilemez." },
          { say: "Buradan çıkan kural şu: az değişeni yukarı, çok değişeni aşağı yaz. Kod günde onlarca kez değişir, bağımlılıklar haftada bir. Sonraki sayfada sırayı düzeltiyoruz." },
        ],
      },
    },
    // 3 · İyi sıra · sahne: yeni sırayla ilk build, sonra server.js değişip tekrar build
    {
      lines: [
        { say: "Dockerfile'ı yeniden diziyoruz. Önce sadece package.json ve package-lock.json, sonra npm ci, en sonda da kodun geri kalanı." },
        { say: "Bu yeni sırayla ilk build'i alıyoruz. Yine uzun sürüyor, çünkü cache yeni sıraya göre baştan doluyor.", cue: 0 },
        { say: "Şimdi server.js'i bir kez daha değiştirip tekrar build ediyoruz. Bak, npm ci CACHED.", cue: 1 },
        { say: "Çünkü npm ci'nin girdisi olan o iki dosya değişmedi. Sadece en sondaki kopyalama satırı çalıştı ve build 1 saniyede bitti." },
        { say: "Yeni sıranın ilk build'i uzun sürdü, ama bu bir kerelik. Sonrasında her kod değişikliğinde npm ci'yi beklemiyorsun." },
        { say: "30 saniyeden 1 saniyeye, sadece satırların sırasını değiştirerek. Python'da da fikir aynı: önce requirements.txt ve pip install, sonra kod. Sonraki sayfaya geçelim." },
      ],
    },
    // 4 · Yeni paket (tahmin: npm ci ne yapar?) · sahne: package.json değişti, build
    {
      lines: [
        { say: "Peki bu sefer bağımlılıklar değişirse? package.json'a yeni bir paket ekledik." },
        { say: "İyi sıralı Dockerfile'da npm ci ne yapar sence? Cache'ten gelip paketi kurmadan mı geçer, yeniden çalışıp yeni paketi mi kurar, yoksa build hata mı verir?" },
      ],
      answer: {
        right: "Doğru, tebrikler!",
        wrong: "Haklı bir şüphe, ama hayır. İzle.",
        lines: [
          { say: "Build ediyoruz. package.json'ı kopyalayan satır ve npm ci yeniden çalıştı.", cue: 0 },
          { say: "npm ci'nin girdisi olan dosyalar değişti, cache kaçtı. İstediğimiz de tam olarak bu: bağımlılık değişince yeniden kur." },
          { say: "Yani cache sana zarar vermez, girdisi değişen her satırı yeniden yapar. Senin işin, her satırın girdilerini dar tutmak." },
          { say: "Bir şeyden şüphelenirsen docker build'e no-cache seçeneğini verip cache'i tamamen yok sayabilirsin. Şimdi sonraki sayfaya, bir sorun bizi bekliyor." },
        ],
      },
    },
    // 5 · .dockerignore yok · sahne: .dockerignore olmadan build
    {
      lines: [
        { say: "Bu build'de bir şey eksik: projede .dockerignore dosyası yok." },
        { say: "Build'i başlatıyoruz. Image boyutuna bak: 200 megabayt büyüdü.", cue: 0 },
        { say: "Neden? Çünkü kopyalama satırı klasördeki her şeyi aldı: kendi bilgisayarında kurulu yaklaşık 200 megabaytlık node_modules ve .git klasörü dahil." },
        { say: "Daha kötüsü de var. Senin node_modules'un başka bir işletim sistemi için derlenmiş olabilir ve npm ci'nin kurduğunun üstüne yazılır." },
        { say: "Kendi projende docker image ls ile boyutlara bakıp farkı sen de görebilirsin." },
        { say: "Yani hem şişman bir image, hem de sinsi hatalara açık bir kapı. Çözümü sonraki sayfada." },
      ],
    },
    // 6 · .dockerignore (tahmin: yeni commit sonrası build) · sahne: ignore ile build, .git değişip build
    {
      lines: [
        { say: "Projenin köküne, Dockerfile'ın yanına bir .dockerignore dosyası koyduk. İçine node_modules ve .git yazdık." },
        { say: "Sonra yeni bir commit attın, yani sadece .git klasörü değişti. Bir sonraki build ne yapar sence? Kopyalama satırı mı yeniden çalışır, npm ci mi, yoksa her şey cache'ten mi gelir?" },
      ],
      answer: {
        right: "Tam isabet!",
        wrong: "Akla yatkın, ama değil. Bak ne oluyor.",
        lines: [
          { say: "Önce .dockerignore ile build ediyoruz. node_modules ve .git artık build context'e girmedi, image yine küçük.", cue: 0 },
          { say: "Şimdi yeni commit'ten sonra tekrar build ediyoruz. Her satır cache'ten geldi, sıfır saniye.", cue: 1 },
          { say: "Yok sayılan dosyalar build context'e hiç girmez, o yüzden hiçbir cache anahtarına da girmez. .git değişti, ama Docker için değişen bir şey yok." },
          { say: "Build context dediğimiz şey, docker build'in sonundaki o nokta, yani klasörün kendisi. Docker onu build'e gönderir." },
          { say: "Context küçük olunca build hızlanır, image küçülür, .env gibi dosyaların sızma riski de azalır. Sonraki sayfaya geçelim." },
        ],
      },
    },
    // 7 · Gerçekte
    {
      lines: [
        { say: "Son olarak, cache ile çalışırken bilmen gereken iki şey var." },
        { say: "Birincisi: bir layer'a giren dosya, sonraki bir satırda silinse bile image'da kalır. COPY ile .env'i alıp sonra RUN ile silersen, alttaki layer onu hâlâ taşır." },
        { say: "O yüzden gizli dosyaları hiç kopyalama, baştan .dockerignore'a yaz. Silmek onları kurtarmaz." },
        { say: "İkincisi: apt-get update ile apt-get install'u tek bir RUN satırına yaz. Ayrı satırlarda olurlarsa update cache'ten gelir ve eski bir paket listesi getirebilir." },
        { say: "Bir de cache zamanla diskte yer kaplar. Disk dolarsa docker builder prune build cache'ini temizler." },
        { say: "Bir dürüstlük notu: sahnedeki süreler ve boyutlar yuvarlak sayılar. BuildKit'in cache mount gibi daha ileri araçları da var, ama temel mantık hep bu. Hadi sonraki sayfaya, sıra sende." },
      ],
    },
    // 8 · Sen dene
    {
      lines: [
        { say: "Terminal artık senin. Gerçek işten dört senaryo var; her birinde proje bir Dockerfile ile, bir kez build edilmiş halde başlıyor." },
        { say: "Yavaş bir build'i hızlandıracak, şişman bir image'ı inceltecek, git geçmişini image'dan çıkaracak ve eski paketlerden kurtulacaksın." },
        { say: "Dockerfile'ı nano ile, .dockerignore'u echo ile düzenleyip docker build ile build edeceksin. Sahne hangi satırın cache'ten geldiğini gösterecek." },
        { say: "cat Dockerfile ve cat .dockerignore dosyaların son halini yazar; sayaçlar da süreyi ve boyutu söyler." },
        { say: "İpuçları adım adım açılıyor. Az komutla bitirirsen üç yıldız. Kolay gelsin, eminim şimşek gibi build'ler çıkaracaksın!" },
      ],
    },
  ],
};
