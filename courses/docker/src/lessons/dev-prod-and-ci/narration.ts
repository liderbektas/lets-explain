import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · İki ihtiyaç
    {
      lines: [
        { say: "Yeniden merhaba! Bu derste aynı projeyi iki farklı şekilde çalıştıracağız: geliştirirken bir türlü, yayında bambaşka. Sonra da image'ı her commit'te otomatik ürettireceğiz." },
        { say: "Önce derdi konuşalım. Geliştirirken her küçük değişiklikte image build edip container'ı yeniden başlatmak yavaş ve sıkıcı. Sen kaydettiğin an değişikliği görmek istersin." },
        { say: "Yayında ise tam tersi. Herkesin aynı, değişmeyen, küçük bir image çalıştırmasını istersin. İçinde geliştirme araçları olmasın, kodu da kimse dışarıdan değiştiremesin." },
        { say: "Yani iki zıt ihtiyaç var, ama proje tek. Bu ikisini aynı projeden nasıl çıkarırız? Sonraki sayfada başlıyoruz." },
      ],
    },
    // 1 · Dev ortamı · sahne: --target dev ile build, compose up
    {
      lines: [
        { say: "İşin sırrı Dockerfile'ı aşamalara bölmek: ortak bir base aşaması, yayın için prod, geliştirme için dev. Her aşamaya FROM satırında AS ile bir ad veriliyor." },
        { say: "docker build'e target olarak dev diyoruz. Build sadece dev aşamasına kadar olanları kuruyor ve shop:dev image'ı çıkıyor.", cue: 0 },
        { say: "Şimdi Compose ile başlatıyoruz. Burada önemli bir satır var: proje klasörünü container'daki /app klasörüne bağlıyoruz.", cue: 1 },
        { say: "Buna bind mount diyoruz. Container artık kodu image'ın içinden değil, doğrudan senin klasöründen okuyor." },
        { say: "Bunun ne işe yaradığını görmek için kodda bir değişiklik yapalım. Sonraki sayfaya geç." },
      ],
    },
    // 2 · Hot reload (tahmin: yeni hali görmek için ne gerekir?) · sahne: index.html v2, curl 3000
    {
      lines: [
        { say: "Dev container localhost 3000'de çalışıyor. Şimdi index.html'i değiştireceğiz." },
        { say: "Sence yeni hali görmek için ne gerekir? Yeniden docker build mi, docker restart mı, yoksa hiçbir şey mi?" },
      ],
      answer: {
        right: "Harika, tam isabet!",
        wrong: "Eski alışkanlık işte. Bak şimdi.",
        lines: [
          { say: "Dosyayı kaydediyoruz; index.html artık v2 diyor.", cue: 0 },
          { say: "Hiçbir Docker komutu çalıştırmadan curl atıyoruz… ve v2 geliyor.", cue: 1 },
          { say: "Çünkü bind mount, container'ın /app klasörünü seninkiyle aynı yapıyor. Kaydettiğin an container da yeni dosyayı görüyor." },
          { say: "Gerçek projelerde nodemon, vite ya da flask reload gibi araçlar sunucuyu da kendiliğinden yeniden başlatır." },
          { say: "Küçük bir tuzak var: klasörü /app'e bağlamak, image'ın içindeki node_modules'ı da örter. O yüzden Compose'a ikinci bir satır eklenir ve bağımlılıklar anonim bir volume'da kalır." },
          { say: "Dev tarafı tamam. Şimdi yayın tarafına geçelim." },
        ],
      },
    },
    // 3 · Prod image (tahmin: büyük mü küçük mü?) · sahne: --target prod ile build, 8080'de run, curl 8080
    {
      lines: [
        { say: "Şimdi aynı Dockerfile'dan, bu sefer target prod ile build edeceğiz. Bu image kodu da içinde taşıyacak." },
        { say: "Sence prod image dev image'dan büyük mü olur, küçük mü, yoksa aynı mı?" },
      ],
      answer: {
        right: "Evet, daha küçük!",
        wrong: "Kodu taşıması kafa karıştırıyor, değil mi? Bakalım.",
        lines: [
          { say: "target prod ile build ediyoruz. Kod image'ın içine kopyalanıyor, npm ci geliştirme paketlerini atlıyor, en sonda da USER node'a geçiliyor.", cue: 0 },
          { say: "Test araçları, derleyiciler gibi geliştirme paketleri içeride olmadığı için, kodu taşısa bile prod image daha hafif." },
          { say: "Şimdi bu image'ı prod adıyla başlatıyoruz; host'taki 8080'i container'ın 3000'ine bağlıyoruz.", cue: 1 },
          { say: "curl ile localhost 8080'e soruyoruz: v2. Prod ayakta.", cue: 2 },
          { say: "Peki kodu bir daha değiştirirsek ne olacak? Sonraki sayfada test ediyoruz." },
        ],
      },
    },
    // 4 · Donmuş image (tahmin: dev ve prod ne gösterir?) · sahne: v3, curl 3000, curl 8080
    {
      lines: [
        { say: "Şu an aynı anda iki ortamımız var: 3000'de dev, 8080'de prod. Kodu bir kez daha değiştirip v3 yapacağız." },
        { say: "Sonra ikisine de soracağız. Sence ne görürüz? İkisi de v3 mü, dev v3 ama prod hâlâ v2 mi, yoksa ikisi de v2 mi?" },
      ],
      answer: {
        right: "Doğru, iki dünya ayrıldı!",
        wrong: "Yakındın. Gel birlikte bakalım.",
        lines: [
          { say: "index.html'i v3 yapıyoruz.", cue: 0 },
          { say: "Önce dev'e soruyoruz: v3. Bind mount sayesinde anında.", cue: 1 },
          { say: "Şimdi prod'a: hâlâ v2. Prod, build anındaki kopyayı taşıyor.", cue: 2 },
          { say: "Bu bir eksiklik değil, bir özellik. Prod'da ne çalıştığını tam olarak bilirsin: shop:1.0 neyse o. Birinin sunucuda bir dosyayı elle düzeltip unutması gibi sürprizler olmaz." },
          { say: "Prod'u değiştirmenin tek yolu yeni bir image ve yeni bir container. Peki bu iki ortamın ayarlarını nasıl düzenli tutarız? Sonraki sayfada." },
        ],
      },
    },
    // 5 · Compose dosyaları
    {
      lines: [
        { say: "Compose dosyaları üst üste konabiliyor. Dev ile prod'u ayırmanın en temiz yolu da bu." },
        { say: "compose.yaml ortak kısmı tutar. docker compose up ise yanındaki compose.override.yaml dosyasını kendiliğinden okur. Bind mount, target dev ve 3000 portu gibi dev ayarları o yüzden oraya gider." },
        { say: "Prod için override'ı değil, adını verdiğin dosyayı kullanırsın. Compose'a -f ile önce compose.yaml'ı, sonra compose.prod.yaml'ı verirsin; sonraki dosya öncekinin üstüne yazar." },
        { say: "Çalıştırmadan önce emin olmak istersen docker compose config birleşmiş son hali gösterir. Örnek dosyaların hepsi solda." },
        { say: "Buraya kadar hep kendi makinemizdeydik. Şimdi image üretme işini CI'a devredelim; sonraki sayfaya geç." },
      ],
    },
    // 6 · CI (tahmin: neyle etiketlenmeli?) · sahne: prod build, sha-3f2a1c9 push
    {
      lines: [
        { say: "Sırada CI var. main'e her commit geldiğinde GitHub Actions bir image üretecek." },
        { say: "Her commit'e bir image düşeceğine göre, sence onu neyle etiketlemek en iyisi? Sadece latest mi, commit'in SHA'sı mı, yoksa build'in tarihi mi?" },
      ],
      answer: {
        right: "Kesinlikle, SHA!",
        wrong: "Akla yatkın, ama en iyisi değil. Göstereyim.",
        lines: [
          { say: "main'e bir commit geldi. GitHub Actions kodu çekiyor, Buildx'i kuruyor, GHCR'a giriş yapıyor ve target prod ile build ediyor.", cue: 0 },
          { say: "Ve image'ı registry'ye gönderiyor. Etiketi: sha-3f2a1c9.", cue: 1 },
          { say: "SHA, image'ı tam olarak bir commit'e bağlar ve bir daha değişmez. latest ise her push'ta başka bir image'ı gösterir; hangi kodun çalıştığını söylemez." },
          { say: "En güzel yanı şu: artık kimse prod image'ı kendi bilgisayarında build etmiyor. Image hep aynı yoldan, aynı adımlarla çıkıyor." },
          { say: "Bir commit daha atalım mı? Sonraki sayfaya geç." },
        ],
      },
    },
    // 7 · Workflow · sahne: v4, prod build, sha-8b1d24e push
    {
      lines: [
        { say: "Şimdi aynı workflow'u ikinci bir commit'le çalıştıralım." },
        { say: "Kodu v4 yapıp yeni bir commit atıyoruz.", cue: 0 },
        { say: "Workflow yeniden çalışıyor ve prod aşamasından yeni bir image build ediyor.", cue: 1 },
        { say: "Bu image sha-8b1d24e etiketiyle registry'ye gidiyor. Artık registry'de iki etiket var; bir sorun çıkarsa eskisini çalıştırmak geri dönmeye yeter.", cue: 2 },
        { say: "Kendi projende kurmak için soldaki dosyayı .github/workflows klasörüne koyman yeterli. GITHUB_TOKEN her çalışmada otomatik gelir, packages write izni de GHCR'a göndermeye izin verir." },
        { say: "Küçük bir uyarı: GHCR'da image adları küçük harf olmalı. Son olarak birkaç iyi alışkanlığa bakalım." },
      ],
    },
    // 8 · Gerçekte
    {
      lines: [
        { say: "CI'da işini kolaylaştıracak birkaç alışkanlık var. İlki cache: workflow'daki cache-from ve cache-to satırları katmanları GitHub'ın cache'inde tutar, bir sonraki build oradan başlar." },
        { say: "İkincisi sırlar. Şifreler image'a değil GitHub Secrets'a girer; container'a da çalışırken ortam değişkeni olarak verilir." },
        { say: "Üçüncüsü deploy. Sunucu her zaman belirli bir SHA'yı çalıştırsın; latest sadece en yeniye bakmak için bir kolaylık olarak kalsın. Etiketleri istersen docker/metadata-action ile otomatik de üretebilirsin." },
        { say: "Bir de dürüstlük notu: sahnede CI aynı makinede çalışıyormuş gibi çizildi. Gerçekte workflow GitHub'ın sanal makinesinde döner. Action'ların sürüm numaraları da zamanla artar, eklerken güncelini kontrol et." },
        { say: "Anlatacaklarım bu kadar. Şimdi sıra sende, sonraki sayfaya geç." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Burası senin sahan. Projede dev ve prod aşamalı bir Dockerfile, bir compose.yaml, otomatik okunan override dosyası ve compose.prod.yaml var. GHCR token'ın da GITHUB_TOKEN'da hazır." },
        { say: "Aşağıdaki terminalde gerçek işten alınmış beş senaryo var: dev ortamını kurmaktan, çalışmayan CI'ın işini elle yapıp sunucuya çıkmaya kadar." },
        { say: "Takılırsan cat ile dosyalara bak. docker compose config birleşmiş son hali gösterir; curl localhost 3000 dev'i, 8080 de prod'u dener." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Kolay gelsin, sahne senin!" },
      ],
    },
  ],
};
